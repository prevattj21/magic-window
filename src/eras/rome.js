// Ancient Rome, 117 CE: the view from an upper loggia over a forum at the
// empire's greatest extent under Trajan. Warm afternoon light.
import * as THREE from 'three';
import { Builder, G, M, rng, jitter, makeSky, makeClouds, makeBirds, makeSmoke, makeWalkers, canvasTex } from '../util.js';
import { STYLES, makeReveal } from '../frames.js';

const MARBLE = 0xf0e9db, MARBLE2 = 0xe2d8c4, TRAV = 0xd9ccb0, TERRA = 0xb5583a, OCHRE = 0xd2a261, GREEN = 0x5e7a3e, DARKG = 0x2f4a2a;

function column(b, x, y, z, r, h, color = MARBLE) {
  b.add(G.boxB, MARBLE2, M(x, y, z, 0, r * 2.6, r * 0.5, r * 2.6));
  b.add(G.cyl, color, M(x, y + r * 0.5, z, 0, r, h - r * 1.2, r));
  b.add(G.boxB, MARBLE2, M(x, y + h - r * 0.7, z, 0, r * 2.6, r * 0.7, r * 2.6));
}

function temple(b, x, y, z, ry, w, d, colH, cols) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const podH = colH * 0.35;
  b.add(G.boxB, TRAV, M(x, y, z, ry, w, podH, d));
  const [sx, sz] = P(0, d / 2 + 2.5); b.add(G.boxB, MARBLE2, M(sx, y, sz, ry, w * 0.8, podH * 0.5, 5)); // steps
  const yy = y + podH, r = colH / 18;
  for (let i = 0; i < cols; i++) {
    const lx = -w / 2 + r * 2 + i * (w - r * 4) / (cols - 1);
    const [cx, cz] = P(lx, d / 2 - r * 2); column(b, cx, yy, cz, r, colH);
    const [cx2, cz2] = P(lx, d / 2 - r * 2 - colH * 0.4); column(b, cx2, yy, cz2, r, colH);
  }
  const [qx, qz] = P(0, -colH * 0.25); b.add(G.boxB, MARBLE2, M(qx, yy, qz, ry, w - r * 6, colH, d - colH * 1.1)); // cella
  b.add(G.boxB, MARBLE, M(x, yy + colH, z, ry, w, colH * 0.16, d));                    // entablature
  b.add(G.gable, TERRA, M(x, yy + colH * 1.18, z, ry, w * 1.02, colH * 0.32, d * 0.97));
  const [fx, fz] = P(0, d / 2); b.add(G.gable, MARBLE, M(fx, yy + colH * 1.16, fz, ry, w, colH * 0.32, 0.4)); // pediment face
}

export function createRome() {
  const scene = new THREE.Scene();
  const root = new THREE.Group(); root.matrixAutoUpdate = false; scene.add(root);
  const r = rng(117), b = new Builder(), GY = -9;

  scene.fog = new THREE.Fog(0xeedfc4, 80, 820);
  root.add(makeSky({ top: 0x4f86cf, horizon: 0xf3e2c3, bottom: 0xe2d2b2, sunDir: new THREE.Vector3(0.75, 0.42, -0.5), sunColor: 0xfff0cf, glow: 0.65 }));

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0xb39572, 1.25); root.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.6); sun.position.set(70, 60, 30); root.add(sun, sun.target); sun.target.position.set(0, -10, -60);

  // Thick wall around the opening
  root.add(makeReveal(STYLES.rome, 0.45, 0xe9dfcc));

  // ---- Loggia (nearest layer) ----
  const LY = -1.35;
  b.box(0, LY - 0.35, -3.2, 14, 0.35, 5.6, 0xe6dccb);                 // floor slab
  for (let i = -6; i <= 6; i++) for (let j = 0; j < 5; j++)          // floor tiles, alternating
    if ((i + j) % 2 === 0) b.box(i * 1.0, LY - 0.001, -0.9 - j * 1.0, 0.98, 0.012, 0.98, 0xcdb99a);
  // balustrade
  b.box(0, LY, -4.4, 14, 0.18, 0.42, MARBLE2);
  b.box(0, LY + 0.88, -4.4, 14, 0.12, 0.46, MARBLE);
  for (let x = -6.8; x <= 6.8; x += 0.32) {
    b.add(new THREE.CylinderGeometry(0.05, 0.075, 0.7, 8).translate(0, 0.35, 0), MARBLE, M(x, LY + 0.18, -4.4));
  }
  // loggia columns + ceiling framing the view
  for (const x of [-2.9, 2.9]) column(b, x, LY, -4.3, 0.24, 4.6);
  b.box(0, LY + 4.6, -3.0, 14, 0.5, 3.4, MARBLE2);
  for (let i = -6; i <= 6; i++) b.box(i * 1.0, LY + 4.5, -2.5, 0.12, 0.1, 3, 0xcbbd9f);
  // potted laurels
  for (const [x, z] of [[-1.6, -3.7], [1.9, -3.8]]) {
    b.add(new THREE.CylinderGeometry(0.28, 0.2, 0.55, 10).translate(0, 0.275, 0), TERRA, M(x, LY, z));
    b.add(G.sphere, DARKG, M(x, LY + 1.0, z, r() * 3, 0.45, 0.55, 0.45));
    b.add(G.sphere, GREEN, M(x + 0.12, LY + 1.3, z + 0.1, r() * 3, 0.3, 0.35, 0.3));
  }

  // ---- Forum ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xa79e74 }));
  ground.position.y = GY - 0.05; root.add(ground);
  const paveTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e1d4b8'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const off = (y % 2) * 32; g.fillStyle = `hsl(40, ${18 + Math.random() * 10}%, ${76 + Math.random() * 8}%)`;
      g.fillRect(x * 64 + off + 1, y * 32 + 1, 62, 30); g.fillRect(x * 64 + off - 255, y * 32 + 1, 62, 30);
    }
  }, { repeat: true });
  paveTex.repeat.set(20, 60);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(36, 110).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: paveTex }));
  plaza.position.set(0, GY, -62); root.add(plaza);

  // colonnades on both sides with portico roofs and back walls
  for (const side of [-1, 1]) {
    const x = side * 17;
    for (let z = -12; z >= -104; z -= 4) column(b, x, GY, z, 0.5, 9.5);
    b.box(x, GY + 9.5, -58, 1.6, 1.3, 96, MARBLE);
    b.box(x + side * 4.5, GY, -58, 1.2, 12, 96, OCHRE);
    b.add(G.gable, TERRA, M(x + side * 2.4, GY + 10.8, -58, 0, 6.4, 1.6, 96));
  }
  // equestrian statue in the plaza
  b.box(-4, GY, -40, 3, 3.2, 5, MARBLE2);
  b.box(-4, GY + 3.2, -40, 1.1, 1.4, 3.2, 0x6d5a3a);
  b.box(-4, GY + 3.2, -41.3, 0.3, 1.4, 0.3, 0x6d5a3a); b.box(-4, GY + 4.4, -41.6, 0.6, 1.3, 0.8, 0x6d5a3a);
  b.box(-4, GY + 4.5, -39.9, 0.55, 1.2, 0.5, 0x6d5a3a); b.add(G.sphere, 0x6d5a3a, M(-4, GY + 5.9, -39.9, 0, 0.22, 0.25, 0.22));
  // honorary column with spiral relief bands, topped by a statue
  b.box(9, GY, -66, 5, 5, 5, MARBLE2);
  b.cyl(9, GY + 5, -66, 1.8, 28, MARBLE);
  for (let k = 0; k < 18; k++) b.add(new THREE.TorusGeometry(1.8, 0.09, 4, 16).rotateX(Math.PI / 2 + 0.12), 0xd6cbb4, M(9, GY + 6.5 + k * 1.5, -66, k * 0.6));
  b.box(9, GY + 33, -66, 3.2, 1.2, 3.2, MARBLE2);
  b.add(G.boxB, 0x8a7348, M(9, GY + 34.2, -66, 0, 0.8, 2.6, 0.6)); b.add(G.sphere, 0x8a7348, M(9, GY + 37.1, -66, 0, 0.35, 0.4, 0.35));
  // triumphal arch
  const AX = -6, AZ = -54;
  b.box(AX - 4, GY, AZ, 3, 11, 4, 0xe9e0cc); b.box(AX + 4, GY, AZ, 3, 11, 4, 0xe9e0cc);
  b.box(AX, GY + 8, AZ, 11, 3.2, 4, 0xe9e0cc); b.box(AX, GY + 11.2, AZ, 11, 3.6, 4.2, MARBLE2);
  b.add(new THREE.CylinderGeometry(2.5, 2.5, 4.05, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 0xe9e0cc, M(AX, GY + 8, AZ, 0, 1, 0.45, 1));
  for (const cx of [-5.3, -2.7, 2.7, 5.3]) column(b, AX + cx, GY, AZ + 2.15, 0.3, 8);
  b.box(AX - 2, GY + 14.8, AZ, 2, 1, 1.6, 0x8a7348); b.box(AX + 2, GY + 14.8, AZ, 2, 1, 1.6, 0x8a7348);
  // the temple closing the forum
  temple(b, 0, GY, -128, 0, 26, 36, 15, 8);
  // basilica behind the right colonnade
  b.box(36, GY, -60, 20, 16, 70, 0xe6d8bc); b.box(36, GY + 16, -60, 12, 6, 70, 0xddcfb3);
  b.add(G.gable, TERRA, M(36, GY + 22, -60, 0, 13, 3.5, 71)); b.add(G.gable, TERRA, M(36, GY + 16, -60, 0, 21, 2.5, 71));
  // a second temple, left, seen side-on
  temple(b, -42, GY, -95, Math.PI / 2, 18, 26, 11, 6);

  // Domed temple (left, far) with portico
  const PX = -95, PZ = -185;
  b.cyl(PX, GY, PZ, 21, 22, 0xe0d3bb);
  b.add(G.dome, 0xb3a894, M(PX, GY + 22, PZ, 0, 21, 15, 21));
  b.box(PX, GY + 34, PZ, 6, 1.2, 6, 0xf1e8d6);
  temple(b, PX + 26, GY, PZ + 6, Math.PI / 2, 22, 14, 14, 8);

  // City fabric: insulae and houses outside the forum
  const busy = (x, z) => (Math.abs(x) < 46 && z > -150 && z < -4) || (Math.hypot(x - PX, z - PZ) < 45) || (Math.hypot(x - 110, z - 230 * -1) < 50) || z > -14;
  for (let i = 0; i < 420; i++) {
    const x = r.range(-320, 320), z = r.range(-420, -10);
    if (busy(x, z)) continue;
    const w = r.range(8, 18), d = r.range(8, 18), h = r.range(6, 18) * (Math.abs(x) < 120 ? 1.15 : 0.8), ry = r.range(-0.15, 0.15);
    b.box(x, GY, z, w, h, d, jitter(r.pick([OCHRE, 0xe0c9a0, 0xcf8f5c, 0xe9dcc2, 0xc57b52]), 0.5, r), ry);
    b.roof(x, GY + h, z, w * 1.05, r.range(1.6, 3), d * 1.05, jitter(TERRA, 0.4, r), ry);
    if (r() < 0.3) b.box(x + w * 0.3, GY + h, z, w * 0.35, 3, d * 0.5, 0xe8d9bd, ry);
  }
  // Amphitheatre (right, far) built from tiers of arches
  const archTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#dccdae'; g.fillRect(0, 0, w, h);
    const tiers = 4, th = h / tiers;
    for (let t = 0; t < tiers; t++) {
      g.fillStyle = 'rgba(120,100,70,0.35)'; g.fillRect(0, t * th + th - 6, w, 6);
      if (t === 0) continue; // attic storey (top) has small windows
      for (let i = 0; i < 32; i++) {
        const cx = i * w / 32 + w / 64, aw = w / 32 * 0.56, top = t * th + th * 0.2, bot = t * th + th - 8;
        g.fillStyle = '#5b4a36'; g.beginPath(); g.moveTo(cx - aw / 2, bot); g.lineTo(cx - aw / 2, top + aw / 2);
        g.arc(cx, top + aw / 2, aw / 2, Math.PI, 0); g.lineTo(cx + aw / 2, bot); g.fill();
      }
    }
    for (let i = 0; i < 32; i++) { g.fillStyle = '#4c3e2e'; g.fillRect(i * w / 32 + w / 64 - 5, th * 0.4, 10, 14); }
  });
  archTex.wrapS = THREE.RepeatWrapping; archTex.repeat.set(3, 1);
  const amph = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 30, 48, 1, true), new THREE.MeshLambertMaterial({ map: archTex, side: THREE.DoubleSide }));
  amph.scale.set(1.25, 1, 1); amph.position.set(120, GY + 15, -235); root.add(amph);
  b.add(new THREE.CylinderGeometry(29.4, 22, 26, 48, 1, true), 0xb9a98a, M(120, GY + 2, -235, 0, 1.25, 1, 1));

  // Aqueduct crossing the countryside
  const aqTex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#c9b48f'; g.fillRect(0, 0, w, h); g.fillStyle = '#6b5a42';
    for (let i = 0; i < 8; i++) { const cx = i * 64 + 32; g.beginPath(); g.moveTo(cx - 22, h); g.lineTo(cx - 22, 52); g.arc(cx, 52, 22, Math.PI, 0); g.lineTo(cx + 22, h); g.fill(); }
    g.fillStyle = '#b39d78'; g.fillRect(0, 0, w, 20);
  });
  aqTex.wrapS = THREE.RepeatWrapping; aqTex.repeat.set(30, 1);
  const aq = new THREE.Mesh(new THREE.BoxGeometry(900, 26, 4), new THREE.MeshLambertMaterial({ map: aqTex }));
  aq.position.set(-80, GY + 13, -520); aq.rotation.y = 0.12; root.add(aq);

  // Hills, cypresses and umbrella pines
  for (const [x, z, sx, sy, c] of [[260, -330, 160, 45, 0x7d8c4f], [-280, -360, 190, 55, 0x84915a], [40, -720, 420, 90, 0x8d98a0], [-420, -700, 300, 120, 0x9aa2a8], [420, -650, 260, 80, 0x939da3]])
    b.add(G.dome, c, M(x, GY - 1, z, 0, sx, sy, sx * 0.6));
  for (let i = 0; i < 160; i++) {
    const x = r.range(-360, 360), z = r.range(-460, -40);
    if (busy(x, z) && z > -150) continue;
    if (r() < 0.55) { const h = r.range(9, 15); b.cyl(x, GY, z, 0.25, 1.5, 0x5a4330, true); b.add(G.cone, jitter(DARKG, 0.4, r), M(x, GY + 1, z, 0, 1.3, h, 1.3)); }
    else { const h = r.range(9, 13); b.cyl(x, GY, z, 0.35, h, 0x6a5038, true); b.add(G.sphere, jitter(0x4d6b35, 0.4, r), M(x, GY + h, z, r() * 3, 5, 1.8, 5)); }
  }

  const statics = b.build(); root.add(statics);

  // ---- Motion ----
  // Banners hung from the triumphal arch, rippling
  const banners = [];
  for (const dx of [-3.4, 3.4]) {
    const geo = new THREE.PlaneGeometry(1.6, 6, 6, 16);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x9c1d1d, side: THREE.DoubleSide, flatShading: true }));
    mesh.position.set(AX + dx, GY + 11.5, AZ + 2.25); root.add(mesh);
    banners.push({ geo, base: geo.attributes.position.array.slice() });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.25, 0.05), new THREE.MeshLambertMaterial({ color: 0xd1a443 }));
    trim.position.set(AX + dx, GY + 14.4, AZ + 2.3); root.add(trim);
  }
  const walkers = makeWalkers({
    count: 70, y: GY, seed: 12, speed: 1.1,
    bounds: { x0: -14, x1: 14, z0: -110, z1: -14 },
    avoid: (x, z) => (Math.abs(x + 4) < 2.5 && Math.abs(z + 40) < 3.5) || (Math.abs(x - 9) < 3.5 && Math.abs(z + 66) < 3.5),
    colors: [0xf2eee4, 0xf2eee4, 0xeae3d2, 0xf5f2ea, 0x9c2a2a, 0x3d5a8a, 0xc79a4a, 0x7a6a4a, 0x6f8a5a],
  });
  root.add(walkers.group);
  const birds = makeBirds({ count: 14, center: new THREE.Vector3(2, GY + 9, -38), radius: 11, height: 2, size: 0.32, color: 0x6c6c72 });
  root.add(birds.mesh);
  const smoke = makeSmoke({ sources: [new THREE.Vector3(0, GY + 0.8, -102), new THREE.Vector3(-35, GY + 5, -100)], perSource: 16, rise: 1.0, size: 2.4, color: 0xe8e2d8, opacity: 0.4 });
  root.add(smoke.points);
  b.box(0, GY, -102, 2.4, 0.9, 1.6, MARBLE2); root.add(b.build()); // altar
  const clouds = makeClouds({ count: 12, seed: 4, color: 0xffffff, speed: 2.5, emissive: 0x403020 });
  root.add(clouds.group);

  function update(t, dt) {
    walkers.update(t, dt); birds.update(t); smoke.update(dt); clouds.update(dt);
    for (const bn of banners) {
      const p = bn.geo.attributes.position, a = bn.base;
      for (let i = 0; i < p.count; i++) {
        const y = a[i * 3 + 1], hang = (3 - y) / 6; // 0 at top, 1 at bottom
        p.array[i * 3 + 2] = Math.sin(t * 2.2 + y * 0.9 + a[i * 3] * 1.5) * 0.25 * hang;
        p.array[i * 3] = a[i * 3] + Math.sin(t * 1.4 + y * 0.6) * 0.12 * hang;
      }
      p.needsUpdate = true; bn.geo.computeVertexNormals();
    }
  }
  return { key: 'rome', scene, root, update, title: 'Ancient Rome', date: '117 CE', blurb: 'The empire at its greatest extent under Trajan. Below the loggia, citizens cross the forum.' };
}
