"""
Magic Window: pre-rendered depth layers for one era.

Run headless:
  blender -b --factory-startup --python tools/blender/render_era.py -- --era rome --out assets/eras/rome

What it does
  1. Builds the era scene in Blender (procedural geometry + materials, physical sky).
  2. Renders it from the window's nominal eye point with a wide equirectangular
     camera, once per depth layer (sky, far, mid, near). In each pass the other
     layers are hidden from the camera but still cast shadows and bounce light.
  3. For every layer saves:
       <layer>.webp  colour with alpha
       <layer>.bin   float32 grid (gw*gh*3) of portal-space positions per pixel
                     sample, NaN where the layer is empty
     plus manifest.json describing them.

Coordinates
  Built in "portal space" written the way the web app uses it: x right, y up,
  z towards the viewer, wall plane at z = 0, scene at z < 0.
  Blender is Z-up, so helper P() maps app (x, y, z) -> Blender (x, -z, y).
"""
import bpy, bmesh, math, os, sys, json, random, time
import numpy as np
from mathutils import Vector, Matrix, Euler

# ---------------------------------------------------------------- arguments
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default
ERA = arg('--era', 'rome')
OUT = os.path.abspath(arg('--out', f'assets/eras/{ERA}'))
RES = int(arg('--res', '2048'))          # equirect width in pixels
SAMPLES = int(arg('--samples', '64'))
GRID = int(arg('--grid', '256'))          # geometry samples across
os.makedirs(OUT, exist_ok=True)
T0 = time.time()
def log(*a):
    print(f'[mw {time.time() - T0:7.1f}s]', *a, flush=True)

EYE_APP = (0.0, 0.05, 1.5)                # nominal viewer eye in portal space
LON = (-80.0, 80.0)                       # camera coverage, degrees
LAT = (-62.0, 50.0)
LAYERS = [('near', 0, 9), ('mid', 9, 160), ('far', 160, 1e9)]

def P(x, y, z):
    return Vector((x, -z, y))
EYE = P(*EYE_APP)

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
rng = random.Random(117)

# ---------------------------------------------------------------- meshes
_mesh_cache = {}
def _finish(bm, name, smooth=False):
    me = bpy.data.meshes.new(name)
    if smooth:
        for f in bm.faces: f.smooth = True
    bm.to_mesh(me); bm.free()
    return me

def mesh_box():
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    return _finish(bm, 'box')

def mesh_cyl(seg=20, top=1.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=1.0, radius2=top, depth=1.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    return _finish(bm, f'cyl{seg}_{top}', smooth=True)

def mesh_pyramid():
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4, radius1=math.sqrt(0.5), radius2=0.0, depth=1.0)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 4, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 0.5))
    return _finish(bm, 'pyramid')

def mesh_gable():
    # triangular prism: 1 wide (x), 1 tall (z), 1 deep (y), base at z=0, ridge along y
    bm = bmesh.new()
    v = [bm.verts.new(c) for c in [(-0.5, -0.5, 0), (0.5, -0.5, 0), (0, -0.5, 1), (-0.5, 0.5, 0), (0.5, 0.5, 0), (0, 0.5, 1)]]
    for f in [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]:
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish(bm, 'gable')

def mesh_dome(seg=32):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
    return _finish(bm, f'dome{seg}', smooth=True)

def mesh_blob(sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    r = random.Random(sub)
    for v in bm.verts: v.co *= 1 + r.uniform(-0.12, 0.12)
    return _finish(bm, f'blob{sub}', smooth=True)

def mesh_sphere():
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1.0)
    return _finish(bm, 'sphere', smooth=True)

def get_mesh(key):
    if key not in _mesh_cache:
        _mesh_cache[key] = {
            'box': mesh_box, 'cyl': mesh_cyl, 'cyl8': lambda: mesh_cyl(8), 'taper': lambda: mesh_cyl(16, 0.82),
            'pyramid': mesh_pyramid, 'gable': mesh_gable, 'dome': mesh_dome, 'blob': mesh_blob, 'sphere': mesh_sphere,
        }[key]()
    return _mesh_cache[key]

ALL = []
def place(key, mat, loc, scale, rz=0.0, name=None):
    """Create an object sharing a cached mesh. loc is a Blender Vector."""
    me = get_mesh(key)
    ob = bpy.data.objects.new(name or key, me)
    ob.location = loc; ob.scale = scale; ob.rotation_euler = (0, 0, rz)
    if len(me.materials) == 0: me.materials.append(None)
    ob.material_slots[0].link = 'OBJECT'; ob.material_slots[0].material = mat
    scene.collection.objects.link(ob); ALL.append(ob)
    return ob

# app-space convenience wrappers (base-anchored like the web app's Builder)
def box(x, y, z, w, h, d, mat, ry=0.0):
    return place('box', mat, P(x, y + h / 2, z), (w, d, h), ry)
def cyl(x, y, z, r, h, mat, key='cyl'):
    return place(key, mat, P(x, y, z), (r, r, h))
def roof(x, y, z, w, h, d, mat, ry=0.0):
    return place('pyramid', mat, P(x, y, z), (w, d, h), ry)
def gable(x, y, z, w, h, d, mat, ry=0.0):
    """Ridge runs along app z (depth)."""
    return place('gable', mat, P(x, y, z), (w, d, h), ry)
def dome(x, y, z, sx, sy, sz, mat):
    return place('dome', mat, P(x, y, z), (sx, sz, sy))
def blob(x, y, z, sx, sy, sz, mat, rz=0.0):
    return place('blob', mat, P(x, y, z), (sx, sz, sy), rz)

# ---------------------------------------------------------------- materials
def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return nt, bsdf

def ramp(nt, fac_socket, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = els.new(pos); e.color = (*col, 1)
    nt.links.new(fac_socket, r.inputs['Fac'])
    return r.outputs['Color']

def noise(nt, scale, detail=6.0, coords='Object', vec=None):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
    if vec is not None: nt.links.new(vec, n.inputs['Vector'])
    else:
        tc = nt.nodes.new('ShaderNodeTexCoord'); nt.links.new(tc.outputs[coords], n.inputs['Vector'])
    return n

def math_node(nt, op, a, b=None):
    m = nt.nodes.new('ShaderNodeMath'); m.operation = op
    for i, v in enumerate([a, b]):
        if v is None: continue
        if isinstance(v, (int, float)): m.inputs[i].default_value = v
        else: nt.links.new(v, m.inputs[i])
    return m.outputs[0]

def bump(nt, height, strength=0.3, distance=0.1):
    b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = strength; b.inputs['Distance'].default_value = distance
    nt.links.new(height, b.inputs['Height'])
    return b.outputs['Normal']

def scale_color(nt, color, fac):
    v = nt.nodes.new('ShaderNodeVectorMath'); v.operation = 'SCALE'
    nt.links.new(color, v.inputs[0])
    if isinstance(fac, (int, float)): v.inputs['Scale'].default_value = fac
    else: nt.links.new(fac, v.inputs['Scale'])
    return v.outputs[0]

def world_pos(nt):
    g = nt.nodes.new('ShaderNodeNewGeometry'); s = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(g.outputs['Position'], s.inputs[0]); return s

def srgb(h):
    """hex -> linear rgb tuple"""
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

def mat_stone(name, c1, c2, rough=0.7, scale=1.5, bump_s=0.25):
    m = bpy.data.materials.new(name); nt, b = _nodes(m)
    n = noise(nt, scale)
    b.inputs['Base Color'].default_value = (*srgb(c1), 1)
    nt.links.new(ramp(nt, n.outputs['Fac'], [(0.3, srgb(c1)), (0.7, srgb(c2))]), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    nt.links.new(bump(nt, noise(nt, scale * 8, 8).outputs['Fac'], bump_s, 0.02), b.inputs['Normal'])
    return m

def mat_column(name, c1, c2):
    """Marble with vertical fluting (radial gradient around the object's axis)."""
    m = bpy.data.materials.new(name); nt, b = _nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    g = nt.nodes.new('ShaderNodeTexGradient'); g.gradient_type = 'RADIAL'
    nt.links.new(tc.outputs['Object'], g.inputs['Vector'])
    flutes = math_node(nt, 'SINE', math_node(nt, 'MULTIPLY', g.outputs['Fac'], 2 * math.pi * 20))
    nt.links.new(ramp(nt, noise(nt, 2.0).outputs['Fac'], [(0.35, srgb(c1)), (0.75, srgb(c2))]), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.42
    nt.links.new(bump(nt, flutes, 0.35, 0.04), b.inputs['Normal'])
    return m

def mat_paving(name):
    m = bpy.data.materials.new(name); nt, b = _nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord'); br = nt.nodes.new('ShaderNodeTexBrick')
    sc = nt.nodes.new('ShaderNodeMapping'); sc.inputs['Scale'].default_value = (0.5, 0.5, 0.5)
    nt.links.new(tc.outputs['Object'], sc.inputs['Vector']); nt.links.new(sc.outputs[0], br.inputs['Vector'])
    br.inputs['Scale'].default_value = 1.0; br.inputs['Mortar Size'].default_value = 0.012
    br.inputs['Color1'].default_value = (*srgb(0xbfb196), 1); br.inputs['Color2'].default_value = (*srgb(0xa89a7e), 1)
    br.inputs['Mortar'].default_value = (*srgb(0x8f826a), 1)
    tint = ramp(nt, noise(nt, 0.08).outputs['Fac'], [(0.3, (0.82, 0.82, 0.82)), (0.7, (1.0, 1.0, 1.0))])
    mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'
    nt.links.new(br.outputs['Color'], mul.inputs[0]); nt.links.new(tint, mul.inputs[1])
    nt.links.new(mul.outputs[0], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.75
    nt.links.new(bump(nt, br.outputs['Fac'], 0.4, 0.03), b.inputs['Normal'])
    return m

def mat_plaster(name, palette):
    """Varied building plaster with world-space window openings and grime at the base."""
    m = bpy.data.materials.new(name); nt, b = _nodes(m)
    oi = nt.nodes.new('ShaderNodeObjectInfo')
    base = ramp(nt, oi.outputs['Random'], [(i / (len(palette) - 1), srgb(c)) for i, c in enumerate(palette)])
    base.node.color_ramp.interpolation = 'CONSTANT'
    grime = ramp(nt, noise(nt, 0.6, 4).outputs['Fac'], [(0.35, (0.78, 0.78, 0.78)), (0.75, (1.0, 1.0, 1.0))])
    mul = nt.nodes.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'
    nt.links.new(base, mul.inputs[0]); nt.links.new(grime, mul.inputs[1])
    # windows: rectangles on a 3.0 m x 3.2 m grid in world space
    wp = world_pos(nt)
    u = math_node(nt, 'FRACT', math_node(nt, 'DIVIDE', math_node(nt, 'ADD', wp.outputs['X'], wp.outputs['Y']), 3.0))
    inu = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', u, 0.36), math_node(nt, 'LESS_THAN', u, 0.64))
    v = math_node(nt, 'FRACT', math_node(nt, 'DIVIDE', math_node(nt, 'SUBTRACT', wp.outputs['Z'], -9.0), 3.2))
    inv = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', v, 0.32), math_node(nt, 'LESS_THAN', v, 0.78))
    win = math_node(nt, 'MULTIPLY', inu, inv)
    shade = math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'MULTIPLY', win, 0.82))
    nt.links.new(scale_color(nt, mul.outputs[0], shade), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.92
    nt.links.new(bump(nt, math_node(nt, 'ADD', noise(nt, 6, 8).outputs['Fac'], math_node(nt, 'MULTIPLY', win, -1.5)), 0.25, 0.05), b.inputs['Normal'])
    return m

def mat_tiles(name, c1, c2):
    m = bpy.data.materials.new(name); nt, b = _nodes(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    w1 = nt.nodes.new('ShaderNodeTexWave'); w1.wave_type = 'BANDS'; w1.bands_direction = 'Z'; w1.inputs['Scale'].default_value = 14
    w2 = nt.nodes.new('ShaderNodeTexWave'); w2.wave_type = 'BANDS'; w2.bands_direction = 'X'; w2.inputs['Scale'].default_value = 22
    for w in (w1, w2): nt.links.new(tc.outputs['Generated'], w.inputs['Vector'])
    h = math_node(nt, 'ADD', w1.outputs['Fac'], math_node(nt, 'MULTIPLY', w2.outputs['Fac'], 0.6))
    nt.links.new(ramp(nt, noise(nt, 3).outputs['Fac'], [(0.3, srgb(c1)), (0.7, srgb(c2))]), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.7
    nt.links.new(bump(nt, h, 0.5, 0.05), b.inputs['Normal'])
    return m

def mat_simple(name, c, rough=0.6, metal=0.0, bump_scale=0.0):
    m = bpy.data.materials.new(name); nt, b = _nodes(m)
    b.inputs['Base Color'].default_value = (*srgb(c), 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if bump_scale: nt.links.new(bump(nt, noise(nt, bump_scale, 8).outputs['Fac'], 0.6, 0.1), b.inputs['Normal'])
    return m

def mat_foliage(name, c1, c2):
    m = bpy.data.materials.new(name); nt, b = _nodes(m)
    n = noise(nt, 4.0, 10)
    nt.links.new(ramp(nt, n.outputs['Fac'], [(0.35, srgb(c1)), (0.7, srgb(c2))]), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.85
    nt.links.new(bump(nt, noise(nt, 18, 10).outputs['Fac'], 0.9, 0.3), b.inputs['Normal'])
    return m

def mat_ground(name, c1, c2, scale=0.02):
    m = bpy.data.materials.new(name); nt, b = _nodes(m)
    n = noise(nt, scale, 8, coords='Object')
    nt.links.new(ramp(nt, n.outputs['Fac'], [(0.3, srgb(c1)), (0.7, srgb(c2))]), b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.95
    return m

# ---------------------------------------------------------------- lighting & sky
SUN_DIR = Vector((0.62, -0.42, 0.66)).normalized()    # towards the sun (Blender space): right, behind viewer, high
SKY = dict(sun_elevation=math.asin(SUN_DIR.z), sun_rotation=math.atan2(SUN_DIR.x, SUN_DIR.y), altitude=200.0, air_density=1.0, dust_density=1.6, ozone_density=1.0)

def sky_node(nt, disc):
    s = nt.nodes.new('ShaderNodeTexSky'); s.sky_type = 'NISHITA'
    for k, v in SKY.items(): setattr(s, k, v)
    s.sun_disc = disc
    return s

world = bpy.data.worlds.new('world'); scene.world = world; world.use_nodes = True
wnt = world.node_tree; wnt.nodes.clear()
wbg = wnt.nodes.new('ShaderNodeBackground'); wout = wnt.nodes.new('ShaderNodeOutputWorld')
wnt.links.new(sky_node(wnt, False).outputs['Color'], wbg.inputs['Color']); wbg.inputs['Strength'].default_value = 0.4
wnt.links.new(wbg.outputs['Background'], wout.inputs['Surface'])
world.mist_settings.start = 40; world.mist_settings.depth = 1400; world.mist_settings.falloff = 'QUADRATIC'

sun_data = bpy.data.lights.new('sun', 'SUN'); sun_data.energy = 3.4; sun_data.angle = math.radians(0.6)
sun_data.color = (1.0, 0.93, 0.82)
sun = bpy.data.objects.new('sun', sun_data); scene.collection.objects.link(sun)
sun.rotation_euler = SUN_DIR.to_track_quat('Z', 'Y').to_euler()

# Sky dome: visible to the camera only in the sky pass, so the sky gets geometry too.
def build_dome():
    m = bpy.data.materials.new('skydome'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = EYE
    nt.links.new(geo.outputs['Position'], sub.inputs[0])
    nrm = nt.nodes.new('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'; nt.links.new(sub.outputs[0], nrm.inputs[0])
    sk = sky_node(nt, True)
    # Nishita has no vector input; on an object it samples along the incoming ray,
    # which from the eye at the dome's centre is exactly the view direction.
    if 'Vector' in sk.inputs: nt.links.new(nrm.outputs[0], sk.inputs['Vector'])
    e1 = nt.nodes.new('ShaderNodeEmission'); nt.links.new(sk.outputs['Color'], e1.inputs['Color']); e1.inputs['Strength'].default_value = 0.4
    # soft cumulus: noise over the direction, only above the horizon
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 3.2; n.inputs['Detail'].default_value = 8; n.inputs['Roughness'].default_value = 0.6
    sq = nt.nodes.new('ShaderNodeVectorMath'); sq.operation = 'MULTIPLY'; sq.inputs[1].default_value = (1.0, 1.0, 3.0)
    nt.links.new(nrm.outputs[0], sq.inputs[0]); nt.links.new(sq.outputs[0], n.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(nrm.outputs[0], sep.inputs[0])
    horizon = nt.nodes.new('ShaderNodeMapRange'); horizon.inputs['From Min'].default_value = 0.04; horizon.inputs['From Max'].default_value = 0.25
    nt.links.new(sep.outputs['Z'], horizon.inputs['Value'])
    cover = nt.nodes.new('ShaderNodeMapRange'); cover.inputs['From Min'].default_value = 0.56; cover.inputs['From Max'].default_value = 0.72
    nt.links.new(n.outputs['Fac'], cover.inputs['Value'])
    fac = math_node(nt, 'MULTIPLY', cover.outputs['Result'], horizon.outputs['Result'])
    e2 = nt.nodes.new('ShaderNodeEmission'); e2.inputs['Color'].default_value = (1.0, 0.95, 0.88, 1); e2.inputs['Strength'].default_value = 2.6
    mix = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(fac, mix.inputs['Fac'])
    nt.links.new(e1.outputs[0], mix.inputs[1]); nt.links.new(e2.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    ob = place('sphere', m, EYE, (1500, 1500, 1500), name='skydome')
    for attr in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter', 'visible_shadow'):
        setattr(ob, attr, False)
    # flip normals inward is unnecessary for emission; keep it simple
    return ob

# ---------------------------------------------------------------- ROME, 117 CE
def build_rome():
    GY = -9.0
    MARBLE = mat_stone('marble', 0xf2ece0, 0xe1d7c4, 0.38, 1.2, 0.12)
    MARBLE2 = mat_stone('marble2', 0xe6dccb, 0xd2c5ad, 0.5, 1.0, 0.18)
    COL = mat_column('column', 0xf3ede1, 0xe0d5c0)
    TRAV = mat_stone('travertine', 0xd8cab0, 0xbfae8f, 0.8, 0.8, 0.35)
    TERRA = mat_tiles('rooftiles', 0xa9502f, 0xc46a43)
    PLASTER = mat_plaster('plaster', [0xd9a868, 0xe6d3ad, 0xc98a5a, 0xeee2c8, 0xbf7a50, 0xd8b88a])
    PAVE = mat_paving('paving')
    BRONZE = mat_simple('bronze', 0x6e5634, 0.35, 1.0, 30)
    FOL = mat_foliage('foliage', 0x2e4a24, 0x5b7a3a)
    CYP = mat_foliage('cypress', 0x1f3420, 0x3a5a32)
    TRUNK = mat_simple('trunk', 0x5a4330, 0.9)
    GROUND = mat_ground('ground', 0x8b8a5c, 0xa79e74, 0.01)
    HILLS = mat_ground('hills', 0x6f7d48, 0x8f9a5c, 0.004)
    POT = mat_simple('pot', 0xa4553a, 0.8, 0.0, 20)
    CLOTH = mat_simple('cloth', 0x8e1a1a, 0.8)

    def column(x, y, z, r, h, mat=COL):
        box(x, y, z, r * 2.6, r * 0.5, r * 2.6, MARBLE2)
        cyl(x, y + r * 0.5, z, r, h - r * 1.2, mat)
        cyl(x, y + h - r * 0.75, z, r * 1.25, r * 0.12, MARBLE2, 'cyl8')
        box(x, y + h - r * 0.7, z, r * 2.6, r * 0.7, r * 2.6, MARBLE2)

    def temple(x, y, z, ry, w, d, colH, cols):
        c, s = math.cos(ry), math.sin(ry)
        Pt = lambda lx, lz: (x + lx * c + lz * s, z - lx * s + lz * c)
        podH = colH * 0.35
        box(x, y, z, w, podH, d, TRAV, ry)
        for k in range(6):  # steps
            sx, sz = Pt(0, d / 2 + 0.5 + k * 0.8)
            box(sx, y, sz, w * 0.8, podH * (1 - k / 6), 0.8, MARBLE2, ry)
        yy, r = y + podH, colH / 18
        for i in range(cols):
            lx = -w / 2 + r * 2 + i * (w - r * 4) / (cols - 1)
            for depth in (d / 2 - r * 2, d / 2 - r * 2 - colH * 0.4):
                cx, cz = Pt(lx, depth); column(cx, yy, cz, r, colH)
        qx, qz = Pt(0, -colH * 0.25); box(qx, yy, qz, w - r * 6, colH, d - colH * 1.1, MARBLE2, ry)
        box(x, yy + colH, z, w, colH * 0.1, d, MARBLE, ry)
        box(x, yy + colH * 1.1, z, w * 1.01, colH * 0.07, d * 1.01, MARBLE2, ry)
        gable(x, yy + colH * 1.17, z, w * 1.02, colH * 0.3, d * 0.98, TERRA, ry)
        fx, fz = Pt(0, d / 2 - 0.15); gable(fx, yy + colH * 1.17, fz, w * 1.03, colH * 0.3, 0.5, MARBLE, ry)

    # Loggia (near)
    LY = -1.35
    box(0, LY - 0.35, -3.2, 14, 0.35, 5.6, MARBLE2)
    floor_tile = mat_stone('floortile', 0xcdb99a, 0xb9a283, 0.55, 2.0, 0.1)
    for i in range(-6, 7):
        for j in range(5):
            if (i + j) % 2 == 0: box(i * 1.0, LY, -0.9 - j * 1.0, 0.99, 0.006, 0.99, floor_tile)
    box(0, LY, -4.4, 14, 0.18, 0.42, MARBLE2)
    box(0, LY + 0.88, -4.4, 14, 0.12, 0.46, MARBLE)
    x = -6.8
    while x <= 6.8:
        place('taper', MARBLE, P(x, LY + 0.18, -4.4), (0.07, 0.07, 0.7)); x += 0.3
    for x in (-2.9, 2.9): column(x, LY, -4.3, 0.24, 4.6)
    box(0, LY + 4.6, -3.0, 14, 0.5, 3.4, MARBLE2)
    for i in range(-6, 7): box(i * 1.0, LY + 4.5, -2.5, 0.12, 0.1, 3, MARBLE)
    for (x, z) in ((-1.6, -3.7), (1.9, -3.8)):
        place('taper', POT, P(x, LY, z), (0.28, 0.28, 0.55))
        blob(x, LY + 1.0, z, 0.45, 0.55, 0.45, FOL); blob(x + 0.12, LY + 1.35, z + 0.1, 0.3, 0.35, 0.3, FOL)

    # Ground: plaza (mid), surrounding ground (mid / far pieces)
    box(0, GY - 0.05, -62, 36, 0.05, 110, PAVE)
    box(0, GY - 0.2, -84, 400, 0.15, 160, GROUND)        # z -4 .. -164
    box(0, GY - 0.25, -1400, 5000, 0.1, 2470, GROUND)     # beyond 164 m
    box(-1300, GY - 0.25, -84, 2200, 0.1, 160, GROUND); box(1300, GY - 0.25, -84, 2200, 0.1, 160, GROUND)

    # Colonnades with portico roofs and back walls
    for side in (-1, 1):
        xs = side * 17
        z = -12
        while z >= -104: column(xs, GY, z, 0.5, 9.5); z -= 4
        box(xs, GY + 9.5, -58, 1.6, 1.3, 96, MARBLE)
        box(xs + side * 4.5, GY, -58, 1.2, 12, 96, PLASTER)
        gable(xs + side * 2.4, GY + 10.8, -58, 6.4, 1.6, 96, TERRA)
    # Equestrian statue
    box(-4, GY, -40, 3, 3.2, 5, MARBLE2)
    box(-4, GY + 3.2, -40, 1.1, 1.4, 3.2, BRONZE); box(-4, GY + 4.4, -41.6, 0.6, 1.3, 0.8, BRONZE)
    box(-4, GY + 3.2, -41.3, 0.3, 1.4, 0.3, BRONZE); box(-4, GY + 4.5, -39.9, 0.55, 1.2, 0.5, BRONZE)
    blob(-4, GY + 5.9, -39.9, 0.22, 0.25, 0.22, BRONZE)
    # Honorary column
    box(9, GY, -66, 5, 5, 5, MARBLE2); cyl(9, GY + 5, -66, 1.8, 28, COL)
    for k in range(18): cyl(9, GY + 6.3 + k * 1.5, -66, 1.86, 0.25, MARBLE2, 'cyl8')
    box(9, GY + 33, -66, 3.2, 1.2, 3.2, MARBLE2); box(9, GY + 34.2, -66, 0.8, 2.6, 0.6, BRONZE)
    # Triumphal arch with a real opening
    AX, AZ = -9, -62
    box(AX - 4, GY, AZ, 3, 11, 4, MARBLE2); box(AX + 4, GY, AZ, 3, 11, 4, MARBLE2)
    box(AX, GY + 8, AZ, 11, 3.2, 4, MARBLE2); box(AX, GY + 11.2, AZ, 11, 3.6, 4.2, MARBLE)
    for cx in (-5.3, -2.7, 2.7, 5.3): column(AX + cx, GY, AZ + 2.15, 0.3, 8)
    box(AX - 2, GY + 14.8, AZ, 2, 1, 1.6, BRONZE); box(AX + 2, GY + 14.8, AZ, 2, 1, 1.6, BRONZE)
    for dx in (-3.4, 3.4): box(AX + dx, GY + 8.4, AZ + 2.25, 1.6, 6, 0.05, CLOTH)
    # Temples and basilica
    temple(0, GY, -128, 0, 26, 36, 15, 8)
    box(36, GY, -60, 20, 16, 70, PLASTER); box(36, GY + 16, -60, 12, 6, 70, PLASTER)
    gable(36, GY + 22, -60, 13, 3.5, 71, TERRA); gable(36, GY + 16, -60, 21, 2.5, 71, TERRA)
    temple(-42, GY, -95, math.pi / 2, 18, 26, 11, 6)
    box(0, GY, -102, 2.4, 0.9, 1.6, MARBLE2)   # altar
    # Domed temple with portico
    PX, PZ = -95, -185
    cyl(PX, GY, PZ, 21, 22, mat_stone('drum', 0xe0d3bb, 0xcbbd9f, 0.8, 0.5, 0.3), 'cyl')
    dome(PX, GY + 22, PZ, 21, 15, 21, mat_stone('concrete', 0xb3a894, 0x9d927e, 0.85, 0.4, 0.3))
    temple(PX + 26, GY, PZ + 6, math.pi / 2, 22, 14, 14, 8)
    # Amphitheatre: tiers of piers around an elliptical ring
    AMX, AMZ, RX, RZ = 120, -235, 37.5, 30
    AMP = mat_stone('amphi', 0xdccdae, 0xc5b491, 0.85, 0.5, 0.35)
    n = 64
    for t in range(4):
        y0, th = GY + t * 7.5, 7.5
        for i in range(n):
            a = 2 * math.pi * i / n
            px, pz = AMX + math.cos(a) * RX, AMZ + math.sin(a) * RZ
            if t < 3: box(px, y0, pz, 1.4, th - 1.6, 1.8, AMP, -a)
            else: box(px, y0, pz, 3.6, th, 1.8, AMP, -a)
        for i in range(n):
            a = 2 * math.pi * (i + 0.5) / n
            px, pz = AMX + math.cos(a) * RX, AMZ + math.sin(a) * RZ
            box(px, y0 + th - 1.6, pz, 3.8, 1.6, 1.9, AMP, -a)
    cyl(AMX, GY, AMZ, 34, 28, AMP); ALL[-1].scale = (36, 28.5, 28)
    # Aqueduct
    AQ = mat_stone('aqueduct', 0xc9b48f, 0xb09a76, 0.9, 0.3, 0.4)
    for i in range(70):
        x = -500 + i * 14
        box(x, GY, -520 - i * 1.6, 3, 20, 4, AQ)
    for i in range(70):
        x = -493 + i * 14
        box(x, GY + 20, -521 - i * 1.6, 14.2, 6, 4, AQ)
    # Insulae and houses
    def busy(x, z):
        return (abs(x) < 46 and -150 < z < -4) or math.hypot(x - PX, z - PZ) < 45 or math.hypot(x - AMX, z - AMZ) < 50 or z > -14
    for i in range(520):
        x, z = rng.uniform(-340, 340), rng.uniform(-460, -10)
        if busy(x, z): continue
        w, d = rng.uniform(8, 18), rng.uniform(8, 18)
        h = rng.uniform(6, 18) * (1.15 if abs(x) < 120 else 0.8)
        ry = rng.uniform(-0.15, 0.15)
        box(x, GY, z, w, h, d, PLASTER, ry)
        roof(x, GY + h, z, w * 1.06, rng.uniform(1.6, 3.0), d * 1.06, TERRA, ry)
        if rng.random() < 0.3: box(x + w * 0.3, GY + h, z, w * 0.35, 3, d * 0.5, PLASTER, ry)
    # Hills
    for (x, z, sx, sy) in ((260, -330, 160, 45), (-280, -360, 190, 55), (40, -720, 420, 90), (-420, -700, 300, 120), (420, -650, 260, 80)):
        dome(x, GY - 1, z, sx, sy, sx * 0.6, HILLS)
    # Trees
    for i in range(240):
        x, z = rng.uniform(-380, 380), rng.uniform(-480, -40)
        if busy(x, z) and z > -150: continue
        if rng.random() < 0.55:
            h = rng.uniform(9, 15)
            cyl(x, GY, z, 0.25, 1.5, TRUNK, 'cyl8')
            blob(x, GY + 1 + h / 2, z, 1.4, h / 2, 1.4, CYP)
        else:
            h = rng.uniform(9, 13)
            cyl(x, GY, z, 0.35, h, TRUNK, 'cyl8')
            for k in range(3):
                blob(x + rng.uniform(-2, 2), GY + h + rng.uniform(-0.5, 0.6), z + rng.uniform(-2, 2), rng.uniform(3, 4.5), 1.6, rng.uniform(3, 4.5), FOL, rng.random() * 3)

    return dict(title='Ancient Rome', date='117 CE', overlays={'groundY': GY, 'plaza': [-14, 14, -110, -14], 'altar': [0, GY + 0.9, -102]})

ERAS = {'rome': build_rome}

# ---------------------------------------------------------------- build
log('building', ERA)
meta = ERAS[ERA]()
dome_ob = build_dome()
log('objects', len(ALL))

# layer assignment by nearest distance from the eye
def nearest_dist(ob):
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    c = Vector((min(max(EYE.x, lo.x), hi.x), min(max(EYE.y, lo.y), hi.y), min(max(EYE.z, lo.z), hi.z)))
    return (c - EYE).length
bpy.context.view_layer.update()
layer_of = {}
for ob in ALL:
    if ob is dome_ob: continue
    d = nearest_dist(ob)
    layer_of[ob.name] = next(n for n, a, b in LAYERS if a <= d < b)
counts = {n: sum(1 for v in layer_of.values() if v == n) for n, _, _ in LAYERS}
log('layer counts', counts)

# ---------------------------------------------------------------- camera & render settings
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'PANO'
def set_pano(target):
    target.panorama_type = 'EQUIRECTANGULAR'
    target.longitude_min, target.longitude_max = math.radians(LON[0]), math.radians(LON[1])
    target.latitude_min, target.latitude_max = math.radians(LAT[0]), math.radians(LAT[1])
try: set_pano(cam_data)
except AttributeError: set_pano(cam_data.cycles)
cam_data.clip_start, cam_data.clip_end = 0.05, 6000.0   # default clip_end (100 m) cut off the city and sky
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
cam.location = EYE; cam.rotation_euler = (math.pi / 2, 0, 0)   # look along +Y (into the wall)
scene.camera = cam

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
try: scene.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
scene.cycles.max_bounces = 6
scene.render.film_transparent = True
H = int(RES * (LAT[1] - LAT[0]) / (LON[1] - LON[0]))
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = RES, H, 100
try: scene.view_settings.view_transform = 'AgX'
except TypeError: scene.view_settings.view_transform = 'Filmic'
scene.view_settings.exposure = 0.0
vl = bpy.context.view_layer
vl.use_pass_position = True
vl.use_pass_mist = True

# compositor: colour with aerial haze from the mist pass, plus raw position EXR
scene.use_nodes = True
ct = scene.node_tree; ct.nodes.clear()
rl = ct.nodes.new('CompositorNodeRLayers')
haze = ct.nodes.new('CompositorNodeMixRGB'); haze.blend_type = 'MIX'
haze.inputs[2].default_value = (0.80, 0.80, 0.82, 1.0)
mistmul = ct.nodes.new('CompositorNodeMath'); mistmul.operation = 'MULTIPLY'; mistmul.inputs[1].default_value = 0.55
ct.links.new(rl.outputs['Mist'], mistmul.inputs[0]); ct.links.new(mistmul.outputs[0], haze.inputs[0])
ct.links.new(rl.outputs['Image'], haze.inputs[1])
setalpha = ct.nodes.new('CompositorNodeSetAlpha')
ct.links.new(haze.outputs[0], setalpha.inputs['Image']); ct.links.new(rl.outputs['Alpha'], setalpha.inputs['Alpha'])
fo = ct.nodes.new('CompositorNodeOutputFile')
fo.format.file_format = 'PNG'; fo.format.color_mode = 'RGBA'; fo.format.color_depth = '8'
fo.file_slots.new('color_'); fo.file_slots.new('pos_')
for sl in list(fo.file_slots):
    if sl.path not in ('color_', 'pos_'): fo.file_slots.remove(fo.inputs[sl.path])
ps = fo.file_slots['pos_']; ps.use_node_format = False
ps.format.file_format = 'OPEN_EXR'; ps.format.color_depth = '32'; ps.format.color_mode = 'RGB'
ct.links.new(setalpha.outputs[0], fo.inputs['color_'])
ct.links.new(rl.outputs['Position'], fo.inputs['pos_'])

# ---------------------------------------------------------------- render passes
TMP = os.path.join(OUT, '_tmp'); os.makedirs(TMP, exist_ok=True)

def render_layer(name):
    for ob in ALL:
        if ob is dome_ob: ob.visible_camera = (name == 'sky')
        else: ob.visible_camera = (layer_of[ob.name] == name)
    fo.base_path = os.path.join(TMP, name) + os.sep
    log('render', name)
    bpy.ops.render.render(write_still=False)
    log('done', name)

def load_pixels(path, noncolor):
    img = bpy.data.images.load(path)
    if noncolor: img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1]          # top row first

def postprocess(name):
    d = os.path.join(TMP, name)
    files = os.listdir(d)
    cpath = os.path.join(d, next(f for f in files if f.startswith('color_')))
    ppath = os.path.join(d, next(f for f in files if f.startswith('pos_')))
    col = load_pixels(cpath, False); pos = load_pixels(ppath, True)
    h, w = col.shape[:2]
    gw = GRID; gh = int(round(GRID * h / w))
    ys = np.linspace(0, h - 1, gh).round().astype(int); xs = np.linspace(0, w - 1, gw).round().astype(int)
    # sample the alpha-weighted nearest valid pixel in a small window around each grid point
    alpha = col[..., 3]
    grid = np.full((gh, gw, 3), np.nan, dtype=np.float32)
    rad = max(1, int(w / gw / 2))
    for j, y in enumerate(ys):
        y0, y1 = max(0, y - rad), min(h, y + rad + 1)
        for i, x in enumerate(xs):
            x0, x1 = max(0, x - rad), min(w, x + rad + 1)
            a = alpha[y0:y1, x0:x1]
            if a.max() < 0.5: continue
            if alpha[y, x] >= 0.5: p = pos[y, x, :3]
            else:
                k = np.unravel_index(np.argmax(a), a.shape); p = pos[y0 + k[0], x0 + k[1], :3]
            grid[j, i] = (p[0], p[2], -p[1])          # Blender -> portal space
    # dilate positions into empty cells so silhouettes keep their triangles (alpha trims them)
    valid = ~np.isnan(grid[..., 0])
    filled = grid.copy()
    for _ in range(2):
        v = ~np.isnan(filled[..., 0]); acc = np.zeros_like(filled); cnt = np.zeros(v.shape)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            sv = np.roll(v, (dy, dx), (0, 1)); sf = np.roll(np.nan_to_num(filled), (dy, dx), (0, 1))
            acc += sf * sv[..., None]; cnt += sv
        m = (~v) & (cnt > 0)
        filled[m] = acc[m] / cnt[m][:, None]
    filled.astype('<f4').tofile(os.path.join(OUT, f'{name}.bin'))
    # colour -> webp
    # re-encode with an identity view transform so the colours aren't graded twice
    img = bpy.data.images.load(cpath)
    vt = scene.view_settings.view_transform; scene.view_settings.view_transform = 'Standard'
    st = scene.render.image_settings
    st.file_format = 'WEBP'; st.color_mode = 'RGBA'; st.quality = 86
    img.save_render(os.path.join(OUT, f'{name}.webp'), scene=scene)
    scene.view_settings.view_transform = vt
    bpy.data.images.remove(img)
    log('wrote', name, f'{gw}x{gh}', 'valid', int(valid.sum()))
    return dict(name=name, color=f'{name}.webp', geo=f'{name}.bin', gw=gw, gh=gh)

layers_out = []
for name in ['sky'] + [n for n, _, _ in LAYERS][::-1]:
    if name != 'sky' and counts.get(name, 0) == 0: continue
    render_layer(name)
    layers_out.append(postprocess(name))

manifest = dict(era=ERA, eye=list(EYE_APP), lon=LON, lat=LAT, res=[RES, H], samples=SAMPLES,
                layers=layers_out, overlays=meta.get('overlays', {}), rendered=time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()))
with open(os.path.join(OUT, 'manifest.json'), 'w') as f: json.dump(manifest, f, indent=1)
import shutil; shutil.rmtree(TMP, ignore_errors=True)
log('finished', ERA)
