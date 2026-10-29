// Ayudas para modelos héroe del Taller: orden de desmontaje, explosión "banco de taller" y nodos.
//
// Banco de taller (brief §6, "la mesa como protagonista"): al 100 % de la explosión cada pieza descansa
// sobre el tope (y mín = 0) en una cuadrícula que no pasa el borde. El centro queda libre para la pieza
// fija (`fixed`, la que no se mueve) y para el reto de armado, que se hace en la pose armada.
import { THREE, normalize } from './geo.mjs';

/**
 * Orden de desmontaje derivado de `requires`: 1 si nadie depende de la pieza; si no, 1 + máx(order de
 * quienes la requieren). Lo que se monta al final sale primero (cascada coherente con el reto).
 */
export function deriveOrder(parts) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const dependents = new Map(parts.map((p) => [p.id, []]));
  for (const p of parts)
    for (const r of p.requires) {
      if (!byId.has(r)) throw new Error(`${p.id} requiere ${r}, que no existe`);
      dependents.get(r).push(p.id);
    }
  const memo = new Map();
  const ord = (id, stack = []) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.includes(id)) throw new Error(`ciclo en requires: ${[...stack, id].join(' → ')}`);
    const deps = dependents.get(id);
    const v = deps.length ? 1 + Math.max(...deps.map((d) => ord(d, [...stack, id]))) : 1;
    memo.set(id, v);
    return v;
  };
  for (const p of parts) p.order = ord(p.id);
}

/** Caja (espacio del modelo) de los items de una pieza en pose armada. */
export function partBox(p) {
  const box = new THREE.Box3();
  for (const { g } of p.items) {
    g.computeBoundingBox();
    box.union(g.boundingBox);
  }
  return box;
}

/**
 * Calcula `p.off` (desplazamiento al 100 %) de cada pieza: filas a lo largo de X, de atrás (−Z) hacia
 * adelante, con un hueco central del tamaño de la pieza fija. Lanza si las piezas no caben.
 */
export function benchLayout(parts, { fixed, width = 0.86, depth = 0.56, gap = 0.016, holeMargin = 0.02 } = {}) {
  const boxes = new Map(parts.map((p) => [p.id, partBox(p)]));
  const fixedBox = fixed ? boxes.get(fixed) : null;
  const hole = fixedBox
    ? { x0: fixedBox.min.x - holeMargin, x1: fixedBox.max.x + holeMargin, z0: fixedBox.min.z - holeMargin, z1: fixedBox.max.z + holeMargin }
    : null;
  const size = (id) => {
    const b = boxes.get(id);
    return { w: b.max.x - b.min.x, d: b.max.z - b.min.z };
  };
  // Las más hondas primero (filas parejas); a igual fondo, por orden de desmontaje.
  const queue = parts
    .filter((p) => p.id !== fixed)
    .sort((a, b) => size(b.id).d - size(a.id).d || a.order - b.order)
    .map((p) => p.id);
  const slot = new Map();
  let z = -depth / 2;
  while (queue.length) {
    const rowD = size(queue[0]).d;
    if (z + rowD > depth / 2 + 1e-9) throw new Error(`banco de taller: no caben ${queue.join(', ')} (${width} × ${depth} m)`);
    const z0 = z, z1 = z + rowD;
    const blocked = hole && z1 > hole.z0 && z0 < hole.z1;
    const spans = blocked ? [[-width / 2, hole.x0], [hole.x1, width / 2]] : [[-width / 2, width / 2]];
    for (const [a, b] of spans) {
      let x = a;
      for (let i = 0; i < queue.length; ) {
        const s = size(queue[i]);
        if (s.d <= rowD + 1e-9 && x + s.w <= b + 1e-9) {
          slot.set(queue[i], { x: x + s.w / 2, z: (z0 + z1) / 2 });
          x += s.w + gap;
          queue.splice(i, 1);
        } else i++;
      }
    }
    z = z1 + gap;
  }
  for (const p of parts) {
    const b = boxes.get(p.id);
    const c = b.getCenter(new THREE.Vector3());
    const s = slot.get(p.id);
    p.off = s ? [s.x - c.x, -b.min.y, s.z - c.z] : [0, 0, 0];
  }
}

/**
 * Crea los nodos de cada pieza: part_<id> (extras; lo mueve la explosión) → [pivot_<id> (animado)] → geo_<id>.
 * `extra(p)` añade campos a los extras (p. ej. el eslabón del brazo). Devuelve { nodes, tris }.
 */
export function emitParts(B, parts, modelId, { extra } = {}) {
  const nodes = {};
  let tris = 0;
  for (const p of parts) {
    const c = partBox(p).getCenter(new THREE.Vector3());
    const off = new THREE.Vector3(...p.off);
    const dist = off.length();
    const dir = dist > 1e-9 ? off.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const extras = {
      partId: p.id,
      group: p.group,
      explode: { dir: [+dir.x.toFixed(5), +dir.y.toFixed(5), +dir.z.toFixed(5)], dist: +dist.toFixed(4), order: p.order },
      labelKey: `exp.taller.${modelId}.title.${p.id}`,
      requires: p.requires,
      ...(extra?.(p) ?? {}),
    };
    const pn = B.node(`part_${p.id}`, { t: c.toArray(), extras });
    let holder = pn, origin = c;
    if (p.pivot) {
      const pv = new THREE.Vector3(...p.pivot);
      holder = B.node(`pivot_${p.id}`, { t: pv.clone().sub(c).toArray() }, pn);
      origin = pv;
      nodes[p.id] = { part: pn, pivot: holder, pivotLocal: pv.clone().sub(c) };
    } else nodes[p.id] = { part: pn };
    const items = p.items.map(({ g, mat }) => ({ g: normalize(g.clone()).translate(-origin.x, -origin.y, -origin.z), mat }));
    B.node(`geo_${p.id}`, {}, holder).setMesh(B.mesh(p.id, items));
    const n = items.reduce((a, { g }) => a + g.attributes.position.count / 3, 0);
    tris += n;
    console.log(`  ${p.id.padEnd(22)} ${String(n).padStart(6)} tris`);
  }
  return { nodes, tris };
}

/** Pista de giro sobre X (cuaterniones) para `turns` vueltas en `dur` s, muestreada a `fps`. */
export function spinX(dur, turns, fps = 30) {
  const N = Math.round(dur * fps) + 1;
  const times = new Float32Array(N);
  const values = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * dur;
    times[i] = t;
    const a = (t / dur) * turns * Math.PI * 2;
    values.set([Math.sin(a / 2), 0, 0, Math.cos(a / 2)], i * 4);
  }
  return { times, values };
}
