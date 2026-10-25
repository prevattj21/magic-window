// Shared helpers: seeded random, transforms, a geometry "builder" that merges
// many low-poly parts into one draw call, skies, clouds, birds and particles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed = 1) {
  let s = seed % 2147483647; if (s <= 0) s += 2147483646;
  const r = () => (s = (s * 16807) % 2147483647, (s - 1) / 2147483646);
  r.range = (a, b) => a + (b - a) * r();
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  return r;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function M(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

export function jitter(hex, amt, r) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h + (r() - 0.5) * amt * 0.1, THREE.MathUtils.clamp(hsl.s + (r() - 0.5) * amt * 0.4, 0, 1), THREE.MathUtils.clamp(hsl.l + (r() - 0.5) * amt * 0.5, 0, 1));
  return c;
}

// Unit primitives (scaled by matrices)
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  boxB: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),           // base at y=0
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12, 1).translate(0, 0.5, 0), // base at y=0
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6, 1).translate(0, 0.5, 0),
  cone4: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), // pyramid roof, 1x1 base
  cone: new THREE.ConeGeometry(1, 1, 8, 1).translate(0, 0.5, 0),
  dome: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  sphere: new THREE.IcosahedronGeometry(1, 1),
  gable: (() => { // triangular prism, 1 wide (x), 1 tall, 1 deep (z), base at y=0
    const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  })(),
};

export class Builder {
  constructor() { this.parts = []; }
  add(geo, color, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.computeVertexNormals(); // flat normals on non-indexed geometry = faceted low-poly look
    const c = color.isColor ? color : new THREE.Color(color);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.morphAttributes = {};
    this.parts.push(g);
    return this;
  }
  // box with its base at (x,y,z)
  box(x, y, z, w, h, d, color, ry = 0) { return this.add(G.boxB, color, M(x, y, z, ry, w, h, d)); }
  cyl(x, y, z, r, h, color, seg6 = false) { return this.add(seg6 ? G.cyl6 : G.cyl, color, M(x, y, z, 0, r, h, r)); }
  roof(x, y, z, w, h, d, color, ry = 0) { return this.add(G.cone4, color, M(x, y, z, ry, w, h, d)); }
  gable(x, y, z, w, h, d, color, ry = 0) { return this.add(G.gable, color, M(x, y, z, ry, w, h, d)); }
  build(opts = {}) {
    const geo = mergeGeometries(this.parts, false);
    this.parts = [];
    const mat = opts.material || new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

// Gradient sky dome with a sun glow, drawn behind everything in its scene.
export function makeSky({ top, horizon, bottom, sunDir, sunColor = 0xfff2d0, glow = 0.7, radius = 900, sunDisc = true }) {
  const geo = new THREE.SphereGeometry(radius, 64, 32);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const cT = new THREE.Color(top), cH = new THREE.Color(horizon), cB = new THREE.Color(bottom), cS = new THREE.Color(sunColor);
  const sd = sunDir.clone().normalize(), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    if (v.y >= 0) c.copy(cH).lerp(cT, Math.pow(v.y, 0.55)); else c.copy(cH).lerp(cB, Math.min(1, Math.pow(-v.y, 0.35)));
    const d = Math.max(0, v.dot(sd));
    c.lerp(cS, glow * Math.pow(d, 6) + 0.35 * glow * Math.pow(d, 40));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  const g = new THREE.Group(); g.add(sky);
  if (sunDisc) {
    const sun = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.035, 32), new THREE.MeshBasicMaterial({ color: sunColor, fog: false, depthWrite: false }));
    sun.position.copy(sd).multiplyScalar(radius * 0.9); sun.lookAt(0, 0, 0); sun.renderOrder = -9;
    g.add(sun);
  }
  return g;
}

// Drifting low-poly clouds. Returns { group, update(dt) }
export function makeClouds({ count = 10, seed = 7, xRange = 700, zMin = -650, zMax = -150, yMin = 60, yMax = 140, color = 0xffffff, speed = 3, emissive = 0x000000 }) {
  const r = rng(seed), group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, emissive, flatShading: true, fog: false });
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const b = new Builder(), n = 3 + Math.floor(r() * 4), w = r.range(20, 45);
    for (let k = 0; k < n; k++) {
      const s = r.range(0.35, 0.6) * w;
      b.add(G.sphere, 0xffffff, M((k / (n - 1) - 0.5) * w * 1.4, r.range(-0.1, 0.25) * s, r.range(-0.3, 0.3) * w, r() * 3, s, s * r.range(0.45, 0.7), s * 0.8));
    }
    const m = b.build({ material: mat });
    m.matrixAutoUpdate = true;
    m.position.set(r.range(-xRange, xRange), r.range(yMin, yMax), r.range(zMin, zMax));
    group.add(m); clouds.push(m);
  }
  return { group, update(dt) { for (const c of clouds) { c.position.x += speed * dt; if (c.position.x > xRange) c.position.x = -xRange; } } };
}

// Flock of flapping birds circling a point. Returns { mesh, update(t) }
export function makeBirds({ count = 12, center = new THREE.Vector3(), radius = 12, height = 3, size = 0.35, color = 0x333333, seed = 3, speed = 0.35 }) {
  const geo = new THREE.BufferGeometry();
  // two wings, tips raised; scaling y flips them up/down = flapping
  const v = [0, 0, 0.35, -1, 0.45, 0, 0, 0, -0.35, 0, 0, 0.35, 0, 0, -0.35, 1, 0.45, 0];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }), count);
  mesh.frustumCulled = false;
  const r = rng(seed), birds = [];
  for (let i = 0; i < count; i++) birds.push({ a: r() * 6.28, rad: radius * r.range(0.6, 1.3), h: r.range(-height, height), sp: speed * r.range(0.7, 1.3) * (r() < 0.25 ? -1 : 1), ph: r() * 6.28, f: r.range(7, 11) });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  function update(t) {
    birds.forEach((b, i) => {
      const a = b.a + t * b.sp;
      p.set(center.x + Math.cos(a) * b.rad, center.y + b.h + Math.sin(t * 0.5 + b.ph) * 1.5, center.z + Math.sin(a) * b.rad);
      e.set(0, -a + (b.sp > 0 ? 0 : Math.PI), (b.sp > 0 ? 0.35 : -0.35)); q.setFromEuler(e);
      const flap = Math.sin(t * b.f + b.ph);
      s.set(size, size * (flap > -0.2 ? flap : -0.2 + (flap + 0.2) * 0.3), size);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { mesh, update };
}

// Soft rising smoke/steam plumes using points. Returns { points, update(dt) }
let _softTex = null;
export function softTexture() {
  if (_softTex) return _softTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  _softTex = new THREE.CanvasTexture(c); _softTex.colorSpace = THREE.SRGBColorSpace;
  return _softTex;
}
export function makeSmoke({ sources, perSource = 14, rise = 1.2, spread = 0.6, life = 8, size = 2, color = 0xdddddd, opacity = 0.5, seed = 5 }) {
  const n = sources.length * perSource, pos = new Float32Array(n * 3), r = rng(seed), parts = [];
  for (let i = 0; i < n; i++) parts.push({ src: sources[i % sources.length], age: r() * life, dx: r.range(-1, 1), dz: r.range(-1, 1) });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size, map: softTexture(), color, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;
  function update(dt) {
    parts.forEach((p, i) => {
      p.age += dt; if (p.age > life) p.age -= life;
      const k = p.age / life;
      pos[i * 3] = p.src.x + p.dx * spread * k * 3 + k * k * 2;
      pos[i * 3 + 1] = p.src.y + p.age * rise;
      pos[i * 3 + 2] = p.src.z + p.dz * spread * k * 3;
    });
    geo.attributes.position.needsUpdate = true;
  }
  update(0);
  return { points, update };
}

// Canvas texture helper
export function canvasTex(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

// Simple instanced walkers that wander between random targets inside a rectangle.
export function makeWalkers({ count, bounds, y, colors, seed = 11, height = 1.75, speed = 1.2, avoid = null }) {
  const b = new Builder();
  b.add(new THREE.ConeGeometry(0.32, 1.35, 6).translate(0, 0.675, 0), 0xffffff);
  b.add(new THREE.CylinderGeometry(0.17, 0.2, 0.25, 6).translate(0, 1.38, 0), 0xffffff);
  const geoBody = b.build().geometry;
  const headGeo = new THREE.IcosahedronGeometry(0.15, 0).translate(0, 1.62, 0);
  const body = new THREE.InstancedMesh(geoBody, new THREE.MeshLambertMaterial({ flatShading: true }), count);
  const head = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xc08a64, flatShading: true }), count);
  body.frustumCulled = head.frustumCulled = false;
  const r = rng(seed), W = [];
  const rand = () => {
    for (let k = 0; k < 20; k++) {
      const x = r.range(bounds.x0, bounds.x1), z = r.range(bounds.z0, bounds.z1);
      if (!avoid || !avoid(x, z)) return new THREE.Vector2(x, z);
    }
    return new THREE.Vector2((bounds.x0 + bounds.x1) / 2, (bounds.z0 + bounds.z1) / 2);
  };
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const p = rand();
    W.push({ p, t: rand(), sp: speed * r.range(0.6, 1.2), ph: r() * 6.28, pause: r() * 3, s: height / 1.75 * r.range(0.9, 1.08) });
    body.setColorAt(i, c.set(r.pick(colors)));
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function update(t, dt) {
    W.forEach((w, i) => {
      let moving = false;
      if (w.pause > 0) w.pause -= dt;
      else {
        const d = w.t.clone().sub(w.p), L = d.length();
        if (L < 0.3) { w.t = rand(); w.pause = r() < 0.3 ? r.range(1, 4) : 0; }
        else { d.multiplyScalar(Math.min(L, w.sp * dt) / L); w.p.add(d); w.dir = Math.atan2(d.x, d.y); moving = true; }
      }
      const bob = moving ? Math.abs(Math.sin(t * 6 + w.ph)) * 0.05 : 0;
      q.setFromAxisAngle(up, w.dir || 0);
      pos.set(w.p.x, y + bob, w.p.y); sc.setScalar(w.s);
      m.compose(pos, q, sc); body.setMatrixAt(i, m); head.setMatrixAt(i, m);
    });
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  const group = new THREE.Group(); group.add(body, head);
  return { group, update };
}
