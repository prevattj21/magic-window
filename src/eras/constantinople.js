// Constantinople, 1200s: from a seawall tower across the Golden Horn, looking
// over harbour traffic to the city on its hills and the great domed church.
import * as THREE from 'three';
import { Builder, G, M, rng, jitter, makeSky, makeClouds, makeBirds, makeSmoke } from '../util.js';
import { STYLES, makeReveal } from '../frames.js';

const STONE = 0xc8b797, STONE2 = 0xb4a283, BRICK = 0xa5503a, TERRA = 0xb4603f, LEAD = 0x8b98a2, PINK = 0xcf9e80, CYP = 0x2e4a2e;
const WY = -14;           // water level
const SHORE = -178;       // far shore line (z)

function hillHeight(x, z) {
  if (z > SHORE) return -6;
  const k = THREE.MathUtils.smoothstep(-z, -SHORE, -SHORE + 140);
  const bumps = 26 * Math.exp(-((x + 40) ** 2) / 9000) + 18 * Math.exp(-((x - 150) ** 2) / 7000) + 16 * Math.exp(-((x + 230) ** 2) / 8000) + 8 * Math.sin(x / 37) * Math.cos(z / 29);
  return 2 + k * (10 + bumps * 0.6);
}

function shipMesh(kind, sail, seed) {
  const b = new Builder(), r = rng(seed);
  const L = kind === 'galley' ? 22 : 13, hullC = kind === 'galley' ? 0x4a2f1f : 0x5c3a22;
  const s = new THREE.Shape();
  s.moveTo(-L / 2, 1.6); s.lineTo(-L / 2 + 1.4, -0.7); s.lineTo(L / 2 - 1.6, -0.7); s.lineTo(L / 2 + 1.2, 2.2); s.lineTo(L / 2 - 0.6, 1.4); s.lineTo(-L / 2, 1.6);
  b.add(new THREE.ExtrudeGeometry(s, { depth: kind === 'galley' ? 3 : 4, bevelEnabled: false }).translate(0, 0, kind === 'galley' ? -1.5 : -2), hullC);
  b.add(G.boxB, 0xb08a5a, M(0, 1.2, 0, 0, L * 0.85, 0.15, kind === 'galley' ? 2.8 : 3.8));
  b.add(G.boxB, 0x7a5232, M(-L / 2 + 2, 1.3, 0, 0, 3, 1.4, 3.6));
  b.add(G.boxB, 0xc8a24a, M(-L / 2 + 2, 2.7, 0, 0, 3.1, 0.15, 3.7));
  const mastH = kind === 'galley' ? 11 : 10;
  b.cyl(1, 1.2, 0, 0.18, mastH, 0x5a4026);
  // lateen sail: a big triangle hung from a long slanted yard
  const tri = new THREE.Shape(); tri.moveTo(-6.5, 1.6); tri.lineTo(6, mastH + 3.5); tri.lineTo(4.4, 2.0); tri.lineTo(-6.5, 1.6);
  b.add(new THREE.ShapeGeometry(tri), sail, M(0.6, 1.2, 0.25));
  { // the yard along the sail's leading edge
    const ax = -6.5, ay = 1.6, bx = 6, by = mastH + 3.5, len = Math.hypot(bx - ax, by - ay);
    b.add(new THREE.CylinderGeometry(0.09, 0.09, len + 1, 5).rotateZ(Math.atan2(by - ay, bx - ax) - Math.PI / 2), 0x4a3420, M(0.6 + (ax + bx) / 2, 1.2 + (ay + by) / 2, 0.3));
  }
  if (kind === 'galley') {
    for (let i = 0; i < 12; i++) for (const sd of [-1, 1])
      b.add(G.box, 0x6a4a2c, M(-L / 2 + 3 + i * 1.4, 0.4, sd * 2.6, 0, 0.12, 0.12, 3.2, sd * 0.5, 0));
    b.add(G.boxB, 0x8a2a24, M(0, 1.35, 0, 0, L * 0.6, 0.5, 3.0));
  }
  const m = b.build({ material: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }) });
  m.matrixAutoUpdate = true;
  return m;
}

export function createConstantinople() {
  const scene = new THREE.Scene();
  const root = new THREE.Group(); root.matrixAutoUpdate = false; scene.add(root);
  const r = rng(1204), b = new Builder();

  scene.fog = new THREE.Fog(0xe9d8bf, 90, 760);
  root.add(makeSky({ top: 0x7aa6d6, horizon: 0xf7dcb4, bottom: 0xd9c8ae, sunDir: new THREE.Vector3(-0.85, 0.18, -0.5), sunColor: 0xffe6b8, glow: 0.8 }));
  root.add(new THREE.HemisphereLight(0xd8e6ff, 0x9a8a72, 1.2));
  const sun = new THREE.DirectionalLight(0xffdcae, 2.4); sun.position.set(-90, 55, 40); sun.target.position.set(0, 0, -200); root.add(sun, sun.target);

  root.add(makeReveal(STYLES.byz, 0.9, 0xc2b08e));

  // ---- Tower top: walkway and crenellated parapet ----
  const PY = -3.0, PZ = -3.4;              // walkway level and parapet line, kept low so the harbour shows
  b.box(0, PY - 0.4, (PZ - 0.9) / 2, 12, 0.4, -PZ + 0.1, STONE2);
  b.box(0, PY, PZ, 12, 0.85, 0.7, STONE);
  for (let x = -5.6; x <= 5.6; x += 1.4) b.box(x, PY + 0.85, PZ, 0.8, 0.75, 0.7, jitter(STONE, 0.3, r));
  b.box(0, PY + 0.84, PZ, 12, 0.05, 0.72, STONE2);
  for (const sx of [-1, 1]) b.box(sx * 5.6, PY, (PZ - 0.9) / 2, 0.7, 1.6, -PZ + 0.1, STONE);
  b.box(0, PY, -0.95, 12, -PY - 0.9, 0.1, 0xb7a584);    // inner face of the tower wall below the window
  // tower body dropping to the water, our shore wall and its towers
  b.box(0, WY - 2, PZ - 2.4, 12, (PY - 0.4) - (WY - 2), 4, STONE2);
  b.box(0, WY - 2, -8, 400, 9, 3, jitter(STONE2, 0.2, r));
  for (let x = -190; x <= 190; x += 38) if (Math.abs(x) > 10) {
    b.box(x, WY - 2, -8.5, 7, 13, 7, jitter(STONE, 0.3, r));
    for (let k = -1; k <= 1; k++) b.box(x + k * 2.4, WY + 11, -5.4, 1.2, 1, 0.8, STONE);
  }
  for (let i = 0; i < 6; i++) { // small moored boats
    const x = r.range(-60, 60); if (Math.abs(x) < 5) continue;
    b.box(x, WY - 0.3, -13 - r() * 4, 4.5, 0.7, 1.4, 0x5a3c26, r.range(-0.3, 0.3));
  }

  // ---- Water ----
  const waterGeo = new THREE.PlaneGeometry(900, 420, 90, 42).rotateX(-Math.PI / 2);
  waterGeo.translate(0, 0, -190);
  const waterBase = waterGeo.attributes.position.array.slice();
  const water = new THREE.Mesh(waterGeo, new THREE.MeshPhongMaterial({ color: 0x2f6c85, specular: 0xffe2b0, shininess: 70, flatShading: true }));
  water.position.y = WY; root.add(water);
  const farWater = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5d8597 }));
  farWater.position.set(0, WY - 0.6, -500); root.add(farWater);

  // ---- Far shore: terrain on the hills ----
  const tg = new THREE.PlaneGeometry(1200, 620, 120, 62).rotateX(-Math.PI / 2); tg.translate(0, 0, SHORE - 300);
  const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3), col = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i), h = hillHeight(x, z);
    tp.setY(i, WY + h - (z > SHORE - 2 ? 8 : 0));
    col.setHSL(0.12 + Math.sin(x * 0.05) * 0.02, 0.28, 0.5 + Math.cos(z * 0.07) * 0.04); tc.set([col.r, col.g, col.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); tg.computeVertexNormals();
  root.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const H = (x, z) => WY + hillHeight(x, z);

  // sea walls along the far shore with towers
  b.box(0, WY - 1, SHORE + 1, 1100, 11, 3.5, jitter(STONE, 0.15, r));
  for (let x = -520; x <= 520; x += 30) {
    b.box(x, WY - 1, SHORE + 1.5, 7, 17, 7, jitter(STONE, 0.3, r));
    for (const k of [-2.2, 0, 2.2]) b.box(x + k, WY + 16, SHORE + 4.6, 1.1, 1.2, 0.8, STONE);
    for (let y = 2; y < 16; y += 3) b.box(x, WY - 1 + y, SHORE + 5.05, 7.05, 0.5, 0.1, BRICK);
  }
  // land walls climbing the hill on the far left
  for (let i = 0; i < 14; i++) {
    const z = SHORE - 10 - i * 22, x = -360 - i * 6, y = H(x, z);
    b.box(x, y - 4, z, 6, 16, 22, STONE2, 0.25); b.box(x, y - 4, z - 11, 9, 22, 9, STONE, 0.25);
  }

  // The great domed church on the first hill
  const HX = -45, HZ = -300, HY = H(HX, HZ) - 2;
  b.box(HX, HY, HZ, 76, 30, 70, PINK);
  b.box(HX - 46, HY, HZ, 16, 18, 74, jitter(PINK, 0.2, r));          // narthex
  b.box(HX + 42, HY, HZ, 10, 22, 30, jitter(PINK, 0.2, r));
  b.cyl(HX, HY + 30, HZ, 17.5, 4.5, 0xd2aa8e);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; b.box(HX + Math.cos(a) * 17.6, HY + 31, HZ + Math.sin(a) * 17.6, 1, 2.6, 1, 0x3a2e2a, -a); }
  b.add(G.dome, LEAD, M(HX, HY + 34.5, HZ, 0, 17, 9.5, 17));
  for (const sx of [-1, 1]) {
    b.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI, 0, Math.PI / 2), LEAD, M(HX + sx * 16, HY + 30, HZ, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 15.5, 9, 15.5));
    for (const sz of [-1, 1]) b.add(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI, 0, Math.PI / 2), LEAD, M(HX + sx * 26, HY + 24, HZ + sz * 9, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 7, 5, 7));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(HX + sx * 21, HY, HZ + sz * 30, 9, 37, 10, jitter(PINK, 0.15, r));
    b.roof(HX + sx * 21, HY + 37, HZ + sz * 30, 9.5, 3, 10.5, LEAD);
  }
  b.box(HX, HY + 44, HZ, 0.5, 3.2, 0.5, 0xd9b44a); b.box(HX, HY + 46, HZ, 1.8, 0.45, 0.5, 0xd9b44a);

  // smaller domed churches, palace terraces and a porphyry column
  for (const [x, z, s] of [[110, -265, 1], [190, -345, 0.8], [-170, -255, 0.9], [40, -395, 1.1], [-260, -390, 0.85]]) {
    const y = H(x, z) - 1;
    b.box(x, y, z, 20 * s, 14 * s, 26 * s, jitter(BRICK, 0.3, r));
    for (let k = 1; k < 4; k++) b.box(x, y + k * 3.5 * s, z, 20.1 * s, 0.6, 26.1 * s, 0xe2d2b4);
    b.cyl(x, y + 14 * s, z, 5 * s, 3 * s, 0xc8a68a);
    b.add(G.dome, LEAD, M(x, y + 17 * s, z, 0, 5 * s, 4 * s, 5 * s));
    b.box(x, y + 21 * s, z, 0.3, 2, 0.3, 0xd9b44a);
  }
  for (let i = 0; i < 4; i++) {
    const x = 60 + i * 34, z = -205 - i * 6, y = H(x, z) - 1;
    b.box(x, y, z, 30, 9, 16, 0xece2cf); b.gable(x, y + 9, z, 17, 2.5, 31, TERRA, Math.PI / 2);
    for (let k = -3; k <= 3; k++) b.cyl(x + k * 4, y, z + 8.5, 0.6, 7, 0xf2eadb);
  }
  { const x = 10, z = -250, y = H(x, z) - 1; b.box(x, y, z, 5, 4, 5, STONE); b.cyl(x, y + 4, z, 1.7, 34, 0x7a3236); b.box(x, y + 38, z, 3, 1, 3, STONE); b.box(x, y + 39, z, 0.8, 2.6, 0.6, 0xc9a34a); }

  // houses packed over the hills, with cypress trees
  const busy = (x, z) => (Math.abs(x - HX) < 62 && Math.abs(z - HZ) < 52) || (x > 40 && x < 200 && z > -225 && z < -190);
  for (let i = 0; i < 900; i++) {
    const x = r.range(-420, 420), z = r.range(SHORE - 12, -520);
    if (busy(x, z)) continue;
    const y = H(x, z) - 1, w = r.range(5, 11), d = r.range(5, 11), h = r.range(4, 10), ry = r.range(-0.4, 0.4);
    b.box(x, y, z, w, h, d, jitter(r.pick([0xece4d4, 0xdcbc8c, 0xd9a58e, 0xe6d6b4, 0xc9b49a]), 0.5, r), ry);
    b.roof(x, y + h, z, w * 1.08, r.range(1.2, 2.4), d * 1.08, jitter(TERRA, 0.4, r), ry);
  }
  for (let i = 0; i < 220; i++) {
    const x = r.range(-420, 420), z = r.range(SHORE - 14, -520);
    if (busy(x, z)) continue;
    const y = H(x, z) - 1, hh = r.range(8, 14);
    b.add(G.cone, jitter(CYP, 0.4, r), M(x, y, z, 0, 1.2, hh, 1.2));
  }
  // hazy hills across the Bosphorus
  for (const [x, z, sx, sy] of [[-300, -900, 420, 70], [250, -950, 500, 95], [700, -800, 300, 60]]) b.add(G.dome, 0xa6aeb8, M(x, WY - 2, z, 0, sx, sy, sx * 0.5));

  root.add(b.build());

  // ---- Motion ----
  const ships = [];
  const specs = [['galley', 0xa8322a, -48, 3.2], ['round', 0xefe6d2, -82, -2.2], ['round', 0xe8d6b0, -120, 1.6], ['galley', 0xf0e8d8, -150, -2.8],
    ['round', 0xb5443a, -36, -1.9], ['round', 0xeee2c8, -104, 2.5], ['round', 0xf2ead8, -64, 1.4], ['galley', 0xc4473a, -134, -1.7]];
  const SPAN = 130; // ships loop across this half-width, so several are always in view
  specs.forEach(([kind, sail, z, v], i) => {
    const m = shipMesh(kind, sail, i + 1);
    m.position.set(-SPAN + (2 * SPAN) * (i + 0.5) / specs.length + r.range(-10, 10), WY + 0.2, z); if (v < 0) m.rotation.y = Math.PI;
    root.add(m); ships.push({ m, v, ph: r() * 6 });
  });
  const gulls = makeBirds({ count: 16, center: new THREE.Vector3(-6, WY + 16, -40), radius: 22, height: 4, size: 0.45, color: 0xf5f5f0, speed: 0.25, seed: 9 });
  root.add(gulls.mesh);
  const smokeSrc = [];
  for (let i = 0; i < 7; i++) { const x = r.range(-300, 300), z = r.range(-200, -340); if (!busy(x, z)) smokeSrc.push(new THREE.Vector3(x, H(x, z) + 8, z)); }
  const smoke = makeSmoke({ sources: smokeSrc, perSource: 12, rise: 1.4, spread: 1.6, size: 9, color: 0xd9d4cc, opacity: 0.35, life: 14 });
  root.add(smoke.points);
  const clouds = makeClouds({ count: 10, seed: 12, color: 0xfff6ea, speed: 2, emissive: 0x302820, yMin: 80, yMax: 160 });
  root.add(clouds.group);

  let acc = 0;
  function update(t, dt) {
    for (const s of ships) {
      s.m.position.x += s.v * dt;
      if (s.m.position.x > SPAN) s.m.position.x = -SPAN; if (s.m.position.x < -SPAN) s.m.position.x = SPAN;
      s.m.position.y = WY + 0.2 + Math.sin(t * 1.1 + s.ph) * 0.25;
      s.m.rotation.x = Math.sin(t * 0.9 + s.ph) * 0.035;
    }
    gulls.update(t); smoke.update(dt); clouds.update(dt);
    acc += dt; if (acc < 1 / 30) return; acc = 0; // waves at 30 Hz is plenty
    const p = waterGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = waterBase[i], z = waterBase[i + 2];
      p[i + 1] = Math.sin(x * 0.09 + t * 0.9) * 0.35 + Math.sin(z * 0.13 - t * 1.2 + x * 0.03) * 0.3;
    }
    waterGeo.attributes.position.needsUpdate = true;
  }
  return { key: 'byz', scene, root, update, title: 'Constantinople', date: '1200s', blurb: 'Ships cross the Golden Horn below the sea walls. The great dome crowns the first hill.' };
}
