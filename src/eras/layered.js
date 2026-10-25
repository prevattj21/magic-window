// Pre-rendered depth layers: each layer is a colour image plus a grid of 3D
// positions rendered in Blender from the window's eye point. Every layer becomes
// a mesh shaped like the scene it shows, so walking past the window still gives
// real parallax, while the look comes from a film-quality offline render.
import * as THREE from 'three';
import { STYLES, makeReveal } from '../frames.js';
import { makeBirds, makeSmoke, makeWalkers } from '../util.js';

const ORDER = { sky: -40, far: -30, mid: -20, near: -10 };

function layerGeometry(pos, gw, gh, eye, isSky) {
  const n = gw * gh, vpos = new Float32Array(n * 3), uv = new Float32Array(n * 2), dist = new Float32Array(n), ok = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    if (Number.isFinite(x)) {
      vpos[k * 3] = x; vpos[k * 3 + 1] = y; vpos[k * 3 + 2] = z; ok[k] = 1;
      dist[k] = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
    }
    const i = k % gw, j = Math.floor(k / gw);
    uv[k * 2] = i / (gw - 1); uv[k * 2 + 1] = 1 - j / (gh - 1);
  }
  // Drop the "rubber sheet" triangles that would join a foreground edge to the
  // background behind it: a big depth jump across a cell seen nearly edge-on.
  const idx = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), view = new THREE.Vector3();
  const keep = (p, q, r) => {
    if (!ok[p] || !ok[q] || !ok[r]) return false;
    if (isSky) return true;
    const lo = Math.min(dist[p], dist[q], dist[r]), hi = Math.max(dist[p], dist[q], dist[r]), ratio = hi / lo;
    if (ratio < 1.04) return true;
    if (ratio > 1.3) return false;
    a.fromArray(vpos, p * 3); b.fromArray(vpos, q * 3); c.fromArray(vpos, r * 3);
    nrm.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    view.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(eye).normalize();
    return Math.abs(nrm.dot(view)) > 0.12;
  };
  for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
    const p = j * gw + i, q = p + 1, r = p + gw, s = r + 1;
    if (keep(p, r, q)) idx.push(p, r, q);
    if (keep(q, r, s)) idx.push(q, r, s);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vpos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export async function loadLayeredEra({ key, styleKey, base, title, date, blurb, revealDepth, revealColor, onProgress }) {
  const man = await fetch(base + 'manifest.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('no layers'); return r.json(); });
  const v = encodeURIComponent(man.rendered || '');           // new render = new texture URLs
  const scene = new THREE.Scene();
  const root = new THREE.Group(); root.matrixAutoUpdate = false; scene.add(root);
  root.add(new THREE.HemisphereLight(0xfff1dc, 0x8a7458, 1.6));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.2); sun.position.set(60, 60, 40); root.add(sun);
  root.add(makeReveal(STYLES[styleKey], revealDepth, revealColor));

  const eye = new THREE.Vector3().fromArray(man.eye);
  const loader = new THREE.TextureLoader();
  let skyPivot = null, done = 0;
  await Promise.all(man.layers.map(async L => {
    const [tex, buf] = await Promise.all([
      loader.loadAsync(`${base}${L.color}?v=${v}`),
      fetch(`${base}${L.geo}?v=${v}`).then(r => r.arrayBuffer()),
    ]);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const geo = layerGeometry(new Float32Array(buf), L.gw, L.gh, eye, L.name === 'sky');
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = ORDER[L.name] ?? 0;
    if (L.name === 'sky') {
      // sky turns very slightly about the eye so the clouds drift
      skyPivot = new THREE.Group(); skyPivot.position.copy(eye); mesh.position.copy(eye).negate();
      skyPivot.add(mesh); root.add(skyPivot);
    } else root.add(mesh);
    onProgress?.(++done, man.layers.length);
  }));

  // Living details on top of the still render
  const ov = man.overlays || {}, updaters = [];
  if (ov.plaza) {
    const [x0, x1, z0, z1] = ov.plaza;
    const w = makeWalkers({ count: 60, y: ov.groundY, seed: 12, speed: 1.1, bounds: { x0, x1, z0, z1 },
      avoid: (x, z) => (Math.abs(x + 4) < 2.5 && Math.abs(z + 40) < 3.5) || (Math.abs(x - 9) < 3.5 && Math.abs(z + 66) < 3.5),
      colors: [0xe8e2d4, 0xe8e2d4, 0xd9d0bc, 0x8e2a26, 0x3d5276, 0xb48c48, 0x6a5c44] });
    root.add(w.group); updaters.push((t, dt) => w.update(t, dt));
  }
  if (ov.altar) {
    const s = makeSmoke({ sources: [new THREE.Vector3().fromArray(ov.altar)], perSource: 18, rise: 1.0, size: 2.4, color: 0xe8e2d8, opacity: 0.35 });
    root.add(s.points); updaters.push((t, dt) => s.update(dt));
  }
  const birds = makeBirds({ count: 12, center: new THREE.Vector3(2, (ov.groundY ?? -9) + 9, -38), radius: 11, height: 2, size: 0.3, color: 0x55555c });
  root.add(birds.mesh); updaters.push(t => birds.update(t));

  function update(t, dt) {
    if (skyPivot) skyPivot.rotation.y = Math.sin(t * 0.03) * 0.012;
    for (const u of updaters) u(t, dt);
  }
  return { key, scene, root, update, title, date, blurb, layered: true, rendered: man.rendered };
}
