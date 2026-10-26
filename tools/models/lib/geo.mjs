// Ayudas de geometría procedural (three.js en Node, sin DOM).
// Convención: todo en metros, Y arriba. Las formas 2D se dan como arreglos de puntos [u, v].
import * as THREE from 'three';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export { THREE };
export const DEG = Math.PI / 180;
const CREASE = 32 * DEG;

/** Deja solo position + normal, sin índice (para poder fusionar todo). */
export function normalize(g) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  out.clearGroups();
  return out;
}

/** Normales con pliegue: suaves bajo `angle`, duras por encima (biseles se ven limpios). */
export function crease(g, angle = CREASE) {
  const base = normalize(g);
  return toCreasedNormals(base, angle);
}

export function merge(list) {
  const gs = list.filter(Boolean).map(normalize);
  if (gs.length === 0) return null;
  if (gs.length === 1) return gs[0];
  return mergeGeometries(gs, false);
}

/** Fusiona y re-indexa (posición + normal idénticas). */
export function finalize(g) {
  return mergeVertices(dropDegenerate(normalize(g)), 1e-7);
}

/** Quita triángulos degenerados (área ~0, p. ej. en el eje de un torno) y normales nulas. */
export function dropDegenerate(g) {
  const p = g.attributes.position.array, n = g.attributes.normal.array;
  const keepP = [], keepN = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.set(p[i], p[i + 1], p[i + 2]);
    b.set(p[i + 3], p[i + 4], p[i + 5]);
    c.set(p[i + 6], p[i + 7], p[i + 8]);
    const face = b.sub(a).cross(c.sub(a));
    const area = face.length() / 2;
    if (area < 1e-11) continue;
    face.normalize();
    for (let k = 0; k < 9; k += 3) {
      keepP.push(p[i + k], p[i + k + 1], p[i + k + 2]);
      const len = Math.hypot(n[i + k], n[i + k + 1], n[i + k + 2]);
      // Normal de vértice nula o inválida → normal de la cara.
      if (!(len > 0.5)) keepN.push(face.x, face.y, face.z);
      else keepN.push(n[i + k], n[i + k + 1], n[i + k + 2]);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
  // Normales exactamente unitarias.
  const nn = out.attributes.normal;
  for (let i = 0; i < nn.count; i++) {
    const x = nn.getX(i), y = nn.getY(i), z = nn.getZ(i), l = Math.hypot(x, y, z);
    nn.setXYZ(i, x / l, y / l, z / l);
  }
  return out;
}

export const tf = {
  t: (g, x, y, z) => (g.translate(x, y, z), g),
  rx: (g, a) => (g.rotateX(a), g),
  ry: (g, a) => (g.rotateY(a), g),
  rz: (g, a) => (g.rotateZ(a), g),
  m: (g, m4) => (g.applyMatrix4(m4), g),
};

/** Invierte el orden de los triángulos de una geometría no indexada. */
export function flipWinding(g) {
  const n = normalize(g);
  const p = n.attributes.position.array;
  const nn = n.attributes.normal.array;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) {
      const a = i + 3 + k, b = i + 6 + k;
      [p[a], p[b]] = [p[b], p[a]];
      [nn[a], nn[b]] = [nn[b], nn[a]];
    }
  }
  return n;
}

/** Espejo en X conservando caras hacia afuera. */
export function mirrorX(g) {
  const n = normalize(g.clone());
  n.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  return flipWinding(n);
}

// ─── Formas 2D ───────────────────────────────────────────────

export function arcPts(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}
export function circlePts(cx, cy, r, n = 32) {
  return arcPts(cx, cy, r, 0, Math.PI * 2, n).slice(0, n);
}
/** Rectángulo redondeado centrado en (cx, cy). */
export function roundRectPts(cx, cy, w, h, r, n = 5) {
  const x0 = cx - w / 2 + r, x1 = cx + w / 2 - r, y0 = cy - h / 2 + r, y1 = cy + h / 2 - r;
  return [
    ...arcPts(x1, y0, r, -Math.PI / 2, 0, n),
    ...arcPts(x1, y1, r, 0, Math.PI / 2, n),
    ...arcPts(x0, y1, r, Math.PI / 2, Math.PI, n),
    ...arcPts(x0, y0, r, Math.PI, Math.PI * 1.5, n),
  ];
}
export function shape(outer, holes = []) {
  const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}

function extrudeRaw(sh, len, bevel) {
  const bt = Math.min(bevel, len * 0.45);
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: Math.max(len - 2 * bt, 1e-5),
    bevelEnabled: bt > 0,
    bevelThickness: bt,
    bevelSize: bt,
    bevelOffset: -bt,
    bevelSegments: bt > 0 ? 2 : 0,
    curveSegments: 1,
    steps: 1,
  });
  g.translate(0, 0, bt);
  return g;
}
/** Extruye una forma (u,v) sobre X: (u,v) → (z = -u, y = v), x de x0 a x1. */
export function extrudeX(sh, x0, x1, bevel = 0) {
  const g = extrudeRaw(sh, x1 - x0, bevel);
  g.rotateY(Math.PI / 2);
  g.translate(x0, 0, 0);
  return crease(g);
}
/** Extruye una forma (u,v) sobre Y: (u,v) → (x = u, z = -v), y de y0 a y1. */
export function extrudeY(sh, y0, y1, bevel = 0) {
  const g = extrudeRaw(sh, y1 - y0, bevel);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return crease(g);
}
/** Extruye una forma (u,v) sobre Z: (u,v) → (x = u, y = v), z de z0 a z1. */
export function extrudeZ(sh, z0, z1, bevel = 0) {
  const g = extrudeRaw(sh, z1 - z0, bevel);
  g.translate(0, 0, z0);
  return crease(g);
}

// ─── Sólidos de revolución ───────────────────────────────────

/**
 * Torno alrededor de Y. `prof` = [[r, y], ...] recorrido en sentido antihorario en el plano (r, y)
 * (subiendo por fuera) para que las caras miren hacia afuera.
 */
export function lathe(prof, seg = 48) {
  // Orientación automática: si el perfil va en sentido horario, se invierte (caras hacia afuera).
  let area = 0;
  for (let i = 0; i < prof.length; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[(i + 1) % prof.length];
    area += r0 * y1 - r1 * y0;
  }
  const pts = area < 0 ? prof.slice().reverse() : prof;
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg);
  return crease(g);
}
/** Torno alrededor de X: [[r, x], ...]. */
export function latheX(prof, seg = 48) {
  const g = lathe(prof, seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}
/** Torno alrededor de Z: [[r, z], ...]. */
export function latheZ(prof, seg = 48) {
  const g = lathe(prof, seg);
  g.rotateX(Math.PI / 2);
  return g;
}
/** Perfil de tubo/anillo (r interior, r exterior, a, b) para lathe. */
export function ringProf(ri, ro, a, b, ch = 0) {
  if (ch <= 0) return [[ri, a], [ro, a], [ro, b], [ri, b], [ri, a]];
  return [[ri + ch, a], [ro - ch, a], [ro, a + ch], [ro, b - ch], [ro - ch, b], [ri + ch, b], [ri, b - ch], [ri, a + ch], [ri + ch, a]];
}
/** Cilindro macizo con chaflán, eje Y. */
export function cylY(r, y0, y1, seg = 32, ch = 0) {
  if (ch <= 0) return lathe([[0, y0], [r, y0], [r, y1], [0, y1]], seg);
  return lathe([[0, y0], [r - ch, y0], [r, y0 + ch], [r, y1 - ch], [r - ch, y1], [0, y1]], seg);
}
export function cylX(r, x0, x1, seg = 32, ch = 0) {
  const g = cylY(r, x0, x1, seg, ch);
  // cylY sobre Y → X: rotZ(-90°) lleva +Y a +X.
  g.rotateZ(-Math.PI / 2);
  return g;
}
export function cylZ(r, z0, z1, seg = 32, ch = 0) {
  const g = cylY(r, z0, z1, seg, ch);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Caja con chaflán (RoundedBox simplificado mediante extrusión con bisel). */
export function box(cx, cy, cz, sx, sy, sz, bevel = 0.0008) {
  const sh = shape(roundRectPts(0, 0, sx, sz, Math.min(bevel, sx / 3, sz / 3), 1));
  const g = extrudeY(sh, -sy / 2, sy / 2, Math.min(bevel, sy / 3));
  g.translate(cx, cy, cz);
  return g;
}

// ─── Tubos ───────────────────────────────────────────────────

export function curveFrom(points, closed = false) {
  return new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
}

function annulus(center, tangent, ri, ro, radial, facingForward) {
  const g = new THREE.RingGeometry(ri, ro, radial, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent.clone().normalize().multiplyScalar(facingForward ? 1 : -1));
  g.applyQuaternion(q);
  g.translate(center.x, center.y, center.z);
  return normalize(g);
}

/** Tubo con espesor: pared exterior, interior (invertida) y tapas anulares. */
export function thickTube(curve, ro, ri, segs = 64, radial = 16) {
  const outer = new THREE.TubeGeometry(curve, segs, ro, radial, false);
  const inner = flipWinding(new THREE.TubeGeometry(curve, segs, ri, radial, false));
  const p0 = curve.getPoint(0), p1 = curve.getPoint(1);
  const t0 = curve.getTangent(0), t1 = curve.getTangent(1);
  return merge([outer, inner, annulus(p0, t0, ri, ro, radial, false), annulus(p1, t1, ri, ro, radial, true)]);
}
export function solidTube(curve, r, segs = 64, radial = 12) {
  return new THREE.TubeGeometry(curve, segs, r, radial, false);
}

/** Resorte helicoidal sobre Y, de y0 a y1, con espiras finales cerradas. */
export function helixSpring(rad, wire, y0, y1, coils, segPerCoil = 22, radial = 7) {
  const closedTurns = 0.75;
  const total = coils + 2 * closedTurns;
  const h = y1 - y0 - 2 * wire;
  const curve = new (class extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const turns = t * total;
      let y;
      if (turns < closedTurns) y = (turns / closedTurns) * wire * 2;
      else if (turns > total - closedTurns) y = h - ((total - turns) / closedTurns) * wire * 2;
      else y = wire * 2 + ((turns - closedTurns) / coils) * (h - wire * 4);
      const a = turns * Math.PI * 2;
      return target.set(rad * Math.cos(a), y0 + wire + y, rad * Math.sin(a));
    }
  })();
  return new THREE.TubeGeometry(curve, Math.round(total * segPerCoil), wire, radial, false);
}

/** Engranaje/piñón (forma 2D) con `teeth` dientes trapezoidales. */
export function gearPts(teeth, rRoot, rTip, cx = 0, cy = 0, rot = 0) {
  const out = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * step;
    const pts = [
      [rRoot, a - step * 0.5],
      [rRoot, a - step * 0.28],
      [rTip, a - step * 0.14],
      [rTip, a + step * 0.14],
      [rRoot, a + step * 0.28],
    ];
    for (const [r, ang] of pts) out.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
  }
  return out;
}

/** Copias transformadas de una geometría (para cadenas, aletas, pernos…). */
export function instances(g, matrices) {
  return merge(matrices.map((m) => normalize(g.clone()).applyMatrix4(m)));
}

export function triCount(g) {
  const n = normalize(g);
  return n.attributes.position.count / 3;
}
