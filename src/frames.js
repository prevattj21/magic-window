// Window openings, stencil masks, and the room-side frames for each era.
import * as THREE from 'three';
import { Builder, G, M, canvasTex } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const STYLES = {
  rome: { kind: 'arch', w: 1.0, h: 1.5, label: 'ROMA', date: '117 CE', accent: '#c9a45a' },
  byz:  { kind: 'arch', w: 1.0, h: 1.5, label: 'CONSTANTINOPLE', date: '1200s', accent: '#d3b25e' },
  ny:   { kind: 'rect', w: 1.0, h: 1.4, label: 'NEW YORK', date: '1920s', accent: '#d9c28a' },
};

// Opening outline in portal space: centred on x=0, bottom at -h/2, top at +h/2.
export function openingShape(style, grow = 0) {
  const { w, h, kind } = style, hw = w / 2 + grow, b = -h / 2 - grow, t = h / 2 + grow;
  const s = new THREE.Shape();
  if (kind === 'arch') {
    const springY = t - hw;
    s.moveTo(-hw, b); s.lineTo(hw, b); s.lineTo(hw, springY);
    s.absarc(0, springY, hw, 0, Math.PI, false);
    s.lineTo(-hw, b);
  } else {
    s.moveTo(-hw, b); s.lineTo(hw, b); s.lineTo(hw, t); s.lineTo(-hw, t); s.lineTo(-hw, b);
  }
  return s;
}

function ringGeometry(style, inner, outer, depth) {
  const s = openingShape(style, outer);
  s.holes.push(openingShape(style, inner));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 });
}

// The invisible mask that writes this portal's stencil id into the window opening.
export function makeMask(style, ref) {
  const geo = new THREE.ShapeGeometry(openingShape(style), 32);
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  mat.stencilWrite = true; mat.stencilRef = ref; mat.stencilFunc = THREE.AlwaysStencilFunc;
  mat.stencilZPass = THREE.ReplaceStencilOp;
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -100;
  return m;
}

// Depth-only wall with the window opening cut out. Rendered just before a portal's
// scene so the scene can only be seen through the hole. Needs no stencil buffer.
export function makeOccluder(style) {
  // A small square with the opening cut out, ringed by four huge quads that share its
  // exact corners. One giant shape-with-hole triangulates into slivers that leave
  // hairline cracks; this layout has none.
  const I = 2, S = 60, inner = new THREE.Shape();
  inner.moveTo(-I, -I); inner.lineTo(I, -I); inner.lineTo(I, I); inner.lineTo(-I, I); inner.lineTo(-I, -I);
  inner.holes.push(openingShape(style));
  const quad = (x0, y0, x1, y1) => new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x1, y0, 0), new THREE.Vector3(x1, y1, 0),
    new THREE.Vector3(x0, y0, 0), new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x0, y1, 0)]);
  const parts = [new THREE.ShapeGeometry(inner, 32).toNonIndexed(), quad(-S, I, S, S), quad(-S, -S, S, -I), quad(-S, -I, -I, I), quad(I, -I, S, I)];
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const geo = mergeGeometries(parts).translate(0, 0, 0.003); // just in front of the reveal
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  return m;
}

// Thick-wall "reveal" placed in the era scene just behind the wall plane, so the
// edges of the opening have real depth when you look in at an angle.
export function makeReveal(style, depth, color) {
  const s = new THREE.Shape(); s.moveTo(-4, -4); s.lineTo(4, -4); s.lineTo(4, 4); s.lineTo(-4, 4); s.lineTo(-4, -4);
  s.holes.push(openingShape(style));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -depth);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
}

function plaque(style) {
  const tex = canvasTex(512, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#3a2c1c'); grd.addColorStop(1, '#22180e');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = style.accent; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = style.accent; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 46px "Cormorant Garamond", Georgia, serif';
    g.fillText(style.label + '  ·  ' + style.date, w / 2, h / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.11), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(0, -style.h / 2 - 0.2, 0.012);
  return m;
}

function curtain(side) {
  // side: -1 left, +1 right. A gathered drape tied back at mid height.
  const W = 0.5, H = 1.95, geo = new THREE.PlaneGeometry(W, H, 24, 36);
  const p = geo.attributes.position, tieY = -0.15;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i);
    const u = (x + W / 2) / W;                         // 0..1 across
    const outer = side < 0 ? 1 - u : u;                // 0 at inner edge, 1 at outer edge
    let squeeze;
    if (y > tieY) squeeze = THREE.MathUtils.lerp(0.28, 1, Math.pow((y - tieY) / (H / 2 - tieY), 0.8));
    else squeeze = THREE.MathUtils.lerp(0.28, 0.62, Math.pow((tieY - y) / (H / 2 + tieY), 0.7));
    const nx = side * (0.5 * W - (1 - outer) * W * squeeze);
    const fold = Math.sin(u * Math.PI * 9) * 0.028 * (1.2 - squeeze * 0.4);
    p.setXYZ(i, nx, y, 0.05 + fold + outer * 0.02);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x7e1620, side: THREE.DoubleSide }));
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 12), new THREE.MeshLambertMaterial({ color: 0xc9a45a }));
  tie.position.set(side * (0.5 * W - W * 0.28 * 0.5), tieY, 0.07); tie.scale.set(1.3, 0.7, 1);
  const g = new THREE.Group(); g.add(mesh, tie);
  return g;
}

// Room-side decoration: frame, sill, curtains, plaque.
export function makeFrame(styleKey) {
  const style = STYLES[styleKey], g = new THREE.Group(), b = new Builder();
  const { w, h } = style;
  if (styleKey === 'rome') {
    b.add(ringGeometry(style, 0, 0.09, 0.05), 0xeee6d6);
    b.add(ringGeometry(style, 0.09, 0.12, 0.03), 0xc9a45a);
    b.add(G.boxB, 0xe6dccb, M(0, -h / 2 - 0.09, 0.0, 0, w + 0.36, 0.07, 0.16));   // sill
    b.add(G.boxB, 0xf2ebdc, M(0, h / 2 + 0.06, 0.02, 0, 0.12, 0.16, 0.05));        // keystone
    // curtain rod
    b.add(new THREE.CylinderGeometry(0.018, 0.018, w + 0.9, 8).rotateZ(Math.PI / 2), 0xc9a45a, M(0, h / 2 + 0.2, 0.1));
    b.add(G.sphere, 0xc9a45a, M(-(w + 0.9) / 2, h / 2 + 0.2, 0.1, 0, 0.04, 0.04, 0.04));
    b.add(G.sphere, 0xc9a45a, M((w + 0.9) / 2, h / 2 + 0.2, 0.1, 0, 0.04, 0.04, 0.04));
    const cl = curtain(-1); cl.position.set(-w / 2 - 0.14, h / 2 + 0.2 - 0.975, 0.03); g.add(cl);
    const cr = curtain(1); cr.position.set(w / 2 + 0.14, h / 2 + 0.2 - 0.975, 0.03); g.add(cr);
  } else if (styleKey === 'byz') {
    // alternating brick and stone voussoirs around the arch, banded jambs
    const hw = w / 2, springY = h / 2 - hw, n = 15;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n;
      const s = new THREE.Shape();
      const r0 = hw, r1 = hw + 0.13;
      s.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); s.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
      s.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1); s.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
      b.add(new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }), i % 2 ? 0xa4472f : 0xe4d5b7, M(0, springY, 0));
    }
    const rows = 7, rh = (h - hw) / rows;
    for (let i = 0; i < rows; i++) for (const sx of [-1, 1])
      b.add(G.boxB, i % 2 ? 0xa4472f : 0xe4d5b7, M(sx * (hw + 0.065), -h / 2 + i * rh, 0.03, 0, 0.13, rh, 0.06));
    // central colonnette with capital and impost: a two-light Byzantine window
    b.add(G.cyl, 0xd8cdb8, M(0, -h / 2, -0.05, 0, 0.03, h - hw - 0.12, 0.03));
    b.add(G.boxB, 0xe9e0cc, M(0, h / 2 - hw - 0.12, -0.05, 0, 0.12, 0.08, 0.1));
    b.add(G.boxB, 0xe9e0cc, M(0, -h / 2 - 0.02, -0.05, 0, 0.1, 0.04, 0.1));
    // two small inner arches springing from the colonnette
    for (const sx of [-1, 1]) {
      const s = new THREE.Shape(), cx = sx * hw / 2, rr = hw / 2, y0 = h / 2 - hw - 0.04;
      s.absarc(cx, y0, rr + 0.03, 0, Math.PI, false); s.lineTo(cx - rr, y0); s.absarc(cx, y0, rr, Math.PI, 0, true); s.lineTo(cx + rr + 0.03, y0);
      b.add(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false, curveSegments: 12 }), 0xd8cdb8, M(0, 0, -0.06));
    }
    b.add(G.boxB, 0xd9c9a8, M(0, -h / 2 - 0.08, 0, 0, w + 0.4, 0.08, 0.2));
  } else {
    // 1920s steel double-hung window: frame, meeting rail, muntins, deep wooden sill
    b.add(ringGeometry(style, 0, 0.06, 0.05), 0x2f3a33);
    b.add(ringGeometry(style, 0.06, 0.1, 0.035), 0x6b4a2e);
    b.add(G.box, 0x2f3a33, M(0, 0.04, 0.02, 0, w, 0.05, 0.05));      // meeting rail
    b.add(G.box, 0x2f3a33, M(0, 0.4, 0.015, 0, 0.022, 0.72, 0.02));  // upper muntin
    b.add(G.box, 0x2f3a33, M(-w / 4, -0.34, 0.015, 0, 0.022, 0.68, 0.02));
    b.add(G.box, 0x2f3a33, M(w / 4, -0.34, 0.015, 0, 0.022, 0.68, 0.02));
    b.add(G.boxB, 0x7a5434, M(0, -h / 2 - 0.1, 0.04, 0, w + 0.32, 0.05, 0.2)); // interior sill
    b.add(G.boxB, 0x6b4a2e, M(0, -h / 2 - 0.22, 0.0, 0, w + 0.2, 0.12, 0.04));  // apron
  }
  const frame = b.build(); g.add(frame);
  g.add(plaque(style));
  return g;
}

// Thin outline of an opening, for the AR placement reticle.
export function outline(style, color) {
  const pts = openingShape(style).getPoints(48).map(p => new THREE.Vector3(p.x, p.y, 0));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
}
