// Mapas de alturas de Cuenca Viva (Agente 2): PNG gris 16 bits, 200 × 140 (D14: la simulación promedia 2×2 → 100×70).
// Salida: public/models/cuenca/<id>.png + <id>.json (metadatos: escala, cauce, nacimiento y salida).
//
// Escala: h (m) = v / 65535 × 0.12   (v = valor del píxel, 0..65535; relieve máximo 12 cm).
// Píxel (i, j) → centro en x = −0.50 + (i + 0.5) × 0.005 m,  z = −0.35 + (j + 0.5) × 0.005 m  (fila j = 0 en z = −0.35).
// El río nace en x = −0.45 y sale por el borde x = +0.50. Se rellenan depresiones (priority-flood con ε = 1 unidad)
// sembrando SOLO la celda de salida: todo el terreno drena por D8 hacia el río y sale por ese punto.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const W = 200, H = 140, CELL = 0.005, HMAX = 0.12, VMAX = 65535;
const X0 = -0.5, Z0 = -0.35;
const cx = (i) => X0 + (i + 0.5) * CELL;
const cz = (j) => Z0 + (j + 0.5) * CELL;

// ─── Ruido determinista (value noise fBm) ─────────────────────────────
function hash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * s(fx) + (c - a) * s(fz) + (a - b - c + d) * s(fx) * s(fz)) * 2 - 1;
}
const fbm = (x, z, seed, oct = 5) => {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    v += amp * vnoise(x * f, z * f, seed + o * 17);
    amp *= 0.5;
    f *= 2.03;
  }
  return v;
};
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ─── Escenarios ────────────────────────────────────────────────────
const SCENARIOS = {
  andina: {
    title: 'Andina: páramo en −X, montaña y bosque al centro, valle en +X',
    river: (x) => 0.06 * Math.sin((x + 0.45) * 5.2) * (0.5 + 0.5 * smooth((x + 0.45) / 0.4)) - 0.02 * Math.sin(x * 11),
    bed: (x) => 0.006 + 0.08 * Math.pow(Math.max(0, (0.5 - x) / 0.95), 1.5),
    height(x, z, d) {
      // Ladera transversal: valle en V río arriba, más abierto río abajo.
      const t = smooth((x + 0.5) / 1.0); // 0 en −X, 1 en +X
      const width = 0.035 + 0.09 * t;
      const rise = (0.045 - 0.022 * t) * smooth(d / (width * 2.2)) + 0.012 * d;
      const ridges = 0.016 * fbm(x * 9, z * 9, 3) * smooth(d / 0.05);
      // Meseta de páramo hacia −X, sobre la cabecera.
      const paramo = 0.012 * smooth((-0.25 - x) / 0.2) * smooth(d / 0.03);
      return rise + ridges + paramo;
    },
  },
  valle: {
    title: 'Valle intermontano: fondo plano a lo largo de X entre dos cordilleras',
    river: (x) => 0.025 * Math.sin((x + 0.45) * 7) + 0.012 * Math.sin(x * 17 + 1),
    bed: (x) => 0.005 + 0.03 * Math.pow(Math.max(0, (0.5 - x) / 0.95), 1.2),
    height(x, z, d) {
      const floor = 0.004 * Math.min(1, d / 0.07);
      const cord = 0.088 * smooth((d - 0.07) / 0.22);
      const ridges = 0.018 * fbm(x * 8, z * 8, 11) * smooth((d - 0.06) / 0.08);
      // Cierre de la cabecera (−X) para que el río nazca entre montañas.
      const head = 0.05 * smooth((-0.43 - x) / 0.06) * smooth(d / 0.02);
      return floor + cord + ridges + head;
    },
  },
};

function build(id, S) {
  // Cauce como polilínea muestreada de x = −0.45 a +0.50.
  const path = [];
  for (let x = -0.45; x <= 0.5 + 1e-9; x += 0.005) path.push([+x.toFixed(4), +S.river(x).toFixed(4)]);
  const distToPath = (x, z) => {
    let best = Infinity, bx = 0;
    for (let k = 0; k < path.length - 1; k++) {
      const [ax, az] = path[k], [bx2, bz] = path[k + 1];
      const vx = bx2 - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      const px = ax + t * vx, pz = az + t * vz, dd = Math.hypot(x - px, z - pz);
      if (dd < best) {
        best = dd;
        bx = px;
      }
    }
    // Antes del nacimiento (x < −0.45): la distancia crece también en X (cabecera cerrada).
    return { d: best, along: bx };
  };
  const h = new Float64Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = cx(i), z = cz(j);
      const { d, along } = distToPath(x, z);
      void along;
      const bed = S.bed(Math.max(-0.45, x)); // por x (continuo): evita costuras entre tramos del cauce
      let v = bed + S.height(x, z, d);
      // Canal del río (ligeramente hundido, 1 cm de ancho).
      v -= 0.003 * (1 - smooth(d / 0.008));
      // Techo suave: por encima de 9 cm se comprime hacia 12 cm (sin mesetas recortadas).
      if (v > 0.09) v = 0.09 + 0.029 * (1 - Math.exp(-(v - 0.09) / 0.029));
      h[j * W + i] = Math.max(0, v);
    }
  // Cuantización (fina) y relleno de depresiones a 100×70, que es la malla de la simulación (D14).
  const qf = new Int32Array(W * H);
  for (let k = 0; k < qf.length; k++) qf[k] = Math.round((h[k] / HMAX) * (VMAX - 400));
  const w2 = W / 2, h2 = H / 2;
  const q2 = new Int32Array(w2 * h2);
  for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++)
    q2[j * w2 + i] = Math.round((qf[2 * j * W + 2 * i] + qf[2 * j * W + 2 * i + 1] + qf[(2 * j + 1) * W + 2 * i] + qf[(2 * j + 1) * W + 2 * i + 1]) / 4);
  const outJ2 = Math.max(0, Math.min(h2 - 1, Math.round((S.river(0.5) - Z0) / (CELL * 2) - 0.5)));
  const raised = floodFill(q2, w2, h2, w2 - 1 + outJ2 * w2, 4);
  // Malla fina: detalle de 200×140 corregido por bloque para que cada 2×2 sume exactamente 4 × (valor grueso).
  const q = new Int32Array(W * H);
  for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) {
    const ks = [2 * j * W + 2 * i, 2 * j * W + 2 * i + 1, (2 * j + 1) * W + 2 * i, (2 * j + 1) * W + 2 * i + 1];
    const sum = ks.reduce((acc, k) => acc + qf[k], 0);
    const target = 4 * q2[j * w2 + i];
    const shift = Math.floor((target - sum) / 4);
    let rem = target - sum - 4 * shift;
    for (const k of ks) q[k] = qf[k] + shift + (rem-- > 0 ? 1 : 0);
  }
  let vmax = 0, vmin = Infinity;
  for (const v of q) {
    vmax = Math.max(vmax, v);
    vmin = Math.min(vmin, v);
  }
  if (vmax > VMAX || vmin < 0) throw new Error(`${id}: fuera de 16 bits (${vmin}..${vmax})`);

  // Verificación D8 a 100×70 (promedio 2×2, como la simulación — D14).
  const s = new Float64Array(w2 * h2);
  for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) s[j * w2 + i] = (q[2 * j * W + 2 * i] + q[2 * j * W + 2 * i + 1] + q[(2 * j + 1) * W + 2 * i] + q[(2 * j + 1) * W + 2 * i + 1]) / 4;
  let pits = 0, toOutletEdge = 0;
  const recv = new Int32Array(w2 * h2).fill(-1);
  for (let j = 0; j < h2; j++)
    for (let i = 0; i < w2; i++) {
      const k = j * w2 + i;
      let best = -1, drop = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= w2 || nj >= h2) continue;
          const dd = (s[k] - s[nj * w2 + ni]) / Math.hypot(di, dj);
          if (dd > drop) {
            drop = dd;
            best = nj * w2 + ni;
          }
        }
      recv[k] = best;
      if (best < 0 && i !== w2 - 1) pits++;
    }
  // ¿Cuántas celdas llegan por D8 al borde +X?
  for (let k = 0; k < recv.length; k++) {
    let c = k, guard = 0;
    while (recv[c] >= 0 && guard++ < 100000) c = recv[c];
    if (c % w2 === w2 - 1) toOutletEdge++;
  }

  // PNG 16 bits gris.
  const raw = Buffer.alloc(H * (1 + W * 2));
  for (let j = 0; j < H; j++) {
    raw[j * (1 + W * 2)] = 0;
    for (let i = 0; i < W; i++) raw.writeUInt16BE(q[j * W + i], j * (1 + W * 2) + 1 + i * 2);
  }
  const png = encodePng(W, H, raw);
  const outDir = resolve(ROOT, 'public/models/cuenca');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${id}.png`), png);
  const meta = {
    id,
    title: S.title,
    width: W,
    height: H,
    cellSize: CELL,
    origin: { x: X0, z: Z0, note: 'esquina del píxel (0,0); fila 0 = z −0.35, columna 0 = x −0.50' },
    encoding: 'PNG gris 16 bits; h(m) = v / 65535 * 0.12',
    heightScale: HMAX,
    maxHeight: +((vmax / VMAX) * HMAX).toFixed(4),
    river: { source: [-0.45, +S.river(-0.45).toFixed(4)], outlet: [0.5, +S.river(0.5).toFixed(4)], path },
    license: 'own',
    author: 'Mesa CAUCE — Agente 2 (procedural)',
    sourceUrl: 'repo:tools/models/build/cuenca-heightmaps.mjs',
  };
  writeFileSync(resolve(outDir, `${id}.json`), JSON.stringify(meta) + '\n');
  console.log(`${id}: ${png.length} B · h máx ${(meta.maxHeight * 100).toFixed(1)} cm · ${raised} celdas elevadas por relleno · D8 100×70: ${pits} pozos, ${((toOutletEdge / recv.length) * 100).toFixed(1)} % drena al borde +X`);
}

/** Priority-flood con ε (Barnes et al. 2014) sembrado solo en `seed`: todo drena hacia él. Devuelve celdas elevadas. */
function floodFill(q, w, h, seed, eps) {
  const done = new Uint8Array(w * h);
  const heap = [];
  const less = (a, b) => q[a] < q[b] || (q[a] === q[b] && a < b);
  const push = (k) => {
    heap.push(k);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (!less(heap[c], heap[p])) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1;
        let m = c;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  let raised = 0;
  done[seed] = 1;
  push(seed);
  while (heap.length) {
    const k = pop();
    const i = k % w, j = (k / w) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const n = nj * w + ni;
        if (done[n]) continue;
        done[n] = 1;
        if (q[n] < q[k] + eps) {
          q[n] = q[k] + eps;
          raised++;
        }
        push(n);
      }
  }
  return raised;
}

// ─── PNG mínimo ───────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 16; // profundidad
  ihdr[9] = 0; // gris
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [id, S] of Object.entries(SCENARIOS)) build(id, S);
