// Cuenca Viva (sección 7): modelo de cuenca puro y determinista (no es dinámica de fluidos).
// 1) Drenaje: "priority-flood" desde el borde de salida (X = +0,50) rellena depresiones y da a cada
//    celda su celda aguas abajo (equivalente a D8 sobre el terreno rellenado).
// 2) Acumulación de flujo desde la lluvia por celda; cauce principal = celdas sobre un umbral.
// 3) Carga contaminante y sedimento transportados aguas abajo con decaimiento; humedales filtran,
//    PTAR tratan, represas atrapan sedimento.
// 4) Indicadores 0–100: caudal, calidad, biodiversidad, bienestar (+ energía interna, D13).
// API acordada en P-006. Pesos en src/experiences/cuenca/logic/rules.json.
import DEFAULT_RULES from '../../experiences/cuenca/logic/rules.json';

export type TokenKind = 'paramo' | 'bosque' | 'humedal' | 'cultivo' | 'ciudad' | 'industria' | 'represa' | 'ptar';
export const TOKEN_KINDS: readonly TokenKind[] = ['paramo', 'bosque', 'humedal', 'cultivo', 'ciudad', 'industria', 'represa', 'ptar'];

export interface Token {
  kind: TokenKind;
  /** m, mesa local. */
  x: number;
  z: number;
}

export interface Terrain {
  w: number;
  h: number;
  /** Alturas en metros, fila por fila (índice = row * w + col); col ↔ X, row ↔ Z. */
  heights: Float32Array;
}

export type Rules = typeof DEFAULT_RULES;

export interface Indicators {
  flow: number;
  quality: number;
  biodiversity: number;
  wellbeing: number;
  /** Interna (D13): alimenta el bienestar y se muestra como lectura secundaria. */
  energy: number;
}

export interface TokenEffect {
  index: number;
  kind: TokenKind;
  /** Fracción (0–1) de la carga que llega a la salida que aporta esta ficha. */
  loadShare: number;
  /** Fracción del caudal que consume. */
  consumption: number;
  /** Fracción de su carga que eliminó una PTAR. */
  treated: number;
}

export interface WatershedResult {
  indicators: Indicators;
  /** 1 = celda del cauce principal. */
  mainChannel: Uint8Array;
  /** Acumulación de flujo normalizada (0–1) por celda. */
  accumulation: Float32Array;
  /** Concentración relativa de contaminación por celda (0 = limpia), para colorear el río. */
  pollution: Float32Array;
  /** Celda aguas abajo de cada celda (−1 = salida). */
  downstream: Int32Array;
  /** Sedimento atrapado por represas (unidades de juego). */
  sedimentTrapped: number;
  effects: TokenEffect[];
}

export interface SimulateInput {
  terrain: Terrain;
  tokens: readonly Token[];
  /** −1 sequía … 0 normal … +1 lluvia. */
  climate?: number;
  rules?: Rules;
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));
const sat = (x: number) => 1 - Math.exp(-Math.max(0, x));

// ───────────────────────────── terreno ─────────────────────────────

/** Terreno de prueba 100×70 determinista: baja del nacimiento (X = −0,5) a la salida (X = +0,5), valle en Z = 0. */
export function createTestTerrain(w = 100, h = 70): Terrain {
  const heights = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const x = (c + 0.5) / w - 0.5;
      const z = ((r + 0.5) / h - 0.5) * 0.7;
      const along = 0.1 * (0.5 - x); // 10 cm de caída a lo largo
      const valley = 0.03 * (z / 0.35) ** 2; // laderas a los lados
      const bumps = 0.004 * Math.sin(c * 0.37) * Math.cos(r * 0.29);
      heights[r * w + c] = Math.max(0, along + valley + bumps);
    }
  }
  return { w, h, heights };
}

/** D14: submuestrea un mapa de alturas (p. ej. 200×140 de render) a la rejilla de simulación promediando bloques. */
export function downsample(src: Terrain, w: number, h: number): Terrain {
  const fx = src.w / w;
  const fz = src.h / h;
  const heights = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let s = 0;
      let n = 0;
      for (let rr = Math.floor(r * fz); rr < Math.floor((r + 1) * fz); rr++)
        for (let cc = Math.floor(c * fx); cc < Math.floor((c + 1) * fx); cc++) {
          s += src.heights[rr * src.w + cc]!;
          n++;
        }
      heights[r * w + c] = n ? s / n : 0;
    }
  }
  return { w, h, heights };
}

export function cellOf(t: Terrain, x: number, z: number): number {
  const c = Math.min(t.w - 1, Math.max(0, Math.floor((x + 0.5) * t.w)));
  const r = Math.min(t.h - 1, Math.max(0, Math.floor((z / 0.7 + 0.5) * t.h)));
  return r * t.w + c;
}

export function cellCenter(t: Terrain, i: number): { x: number; z: number } {
  const c = i % t.w;
  const r = (i - c) / t.w;
  return { x: (c + 0.5) / t.w - 0.5, z: ((r + 0.5) / t.h - 0.5) * 0.7 };
}

// ───────────────────────────── drenaje (cacheado por terreno) ─────────────────────────────

interface Drainage {
  downstream: Int32Array;
  /** Celdas en orden de aguas arriba → aguas abajo. */
  order: Int32Array;
  filled: Float32Array;
  slope: Float32Array;
}

const drainageCache = new WeakMap<Float32Array, Drainage>();

function drainage(t: Terrain): Drainage {
  const hit = drainageCache.get(t.heights);
  if (hit) return hit;
  const { w, h, heights } = t;
  const n = w * h;
  const filled = new Float32Array(heights);
  const downstream = new Int32Array(n).fill(-2);
  const popOrder = new Int32Array(n);
  // Montículo binario mínimo por altura rellenada; desempate por índice para determinismo.
  const heap = new Int32Array(n);
  let size = 0;
  const less = (a: number, b: number) => filled[a]! < filled[b]! || (filled[a] === filled[b] && a < b);
  const push = (i: number) => {
    let k = size++;
    heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!less(heap[k]!, heap[p]!)) break;
      [heap[k], heap[p]] = [heap[p]!, heap[k]!];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    heap[0] = heap[--size]!;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < size && less(heap[l]!, heap[m]!)) m = l;
      if (r < size && less(heap[r]!, heap[m]!)) m = r;
      if (m === k) break;
      [heap[k], heap[m]] = [heap[m]!, heap[k]!];
      k = m;
    }
    return top;
  };
  // Salida: borde X = +0,50 (última columna).
  for (let r = 0; r < h; r++) {
    const i = r * w + (w - 1);
    downstream[i] = -1;
    push(i);
  }
  const EPS = 1e-5;
  let popped = 0;
  while (size > 0) {
    const i = pop();
    popOrder[popped++] = i;
    const c = i % w;
    const r = (i - c) / w;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
        const j = rr * w + cc;
        if (downstream[j] !== -2) continue;
        downstream[j] = i;
        if (filled[j]! <= filled[i]!) filled[j] = filled[i]! + EPS;
        push(j);
      }
  }
  // Orden aguas arriba → aguas abajo = inverso del orden de extracción.
  const order = new Int32Array(n);
  for (let k = 0; k < n; k++) order[k] = popOrder[n - 1 - k]!;
  const slope = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = downstream[i]!;
    if (d < 0) continue;
    const dc = (d % w) - (i % w);
    const dist = Math.hypot(dc, (d - (d % w)) / w - (i - (i % w)) / w) * (1 / w);
    slope[i] = Math.max(0, (heights[i]! - heights[d]!) / Math.max(dist, 1e-6));
  }
  const result = { downstream, order, filled, slope };
  drainageCache.set(t.heights, result);
  return result;
}

/** Celda con más área drenada dentro de `radiusCells` alrededor de (x, z). */
function riverCellNear(t: Terrain, downstream: Int32Array, order: Int32Array, x: number, z: number, radiusCells: number): number {
  // Área drenada (número de celdas aguas arriba), cacheada junto al drenaje.
  let area = areaCache.get(t.heights);
  if (!area) {
    area = new Float32Array(t.w * t.h).fill(1);
    for (const i of order) {
      const d = downstream[i]!;
      if (d >= 0) area[d] = area[d]! + area[i]!;
    }
    areaCache.set(t.heights, area);
  }
  const center = cellOf(t, x, z);
  const c0 = center % t.w;
  const r0 = (center - c0) / t.w;
  const rc = Math.ceil(radiusCells);
  let best = center;
  for (let r = Math.max(0, r0 - rc); r <= Math.min(t.h - 1, r0 + rc); r++)
    for (let c = Math.max(0, c0 - rc); c <= Math.min(t.w - 1, c0 + rc); c++) {
      const i = r * t.w + c;
      if ((r - r0) ** 2 + (c - c0) ** 2 <= radiusCells ** 2 && area[i]! > area[best]!) best = i;
    }
  return best;
}
const areaCache = new WeakMap<Float32Array, Float32Array>();

// ───────────────────────────── simulación ─────────────────────────────

export function simulate(input: SimulateInput): WatershedResult {
  const R = input.rules ?? DEFAULT_RULES;
  const T = R.tokens;
  const t = input.terrain;
  const n = t.w * t.h;
  const { downstream, order, slope } = drainage(t);
  const climate = Math.max(-1, Math.min(1, input.climate ?? 0));
  const rain = R.rain.base * (1 + R.rain.climateFactor * climate);
  const radiusCells = R.tokenRadius * t.w;
  const tokens = input.tokens;

  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < n; i++) {
    minH = Math.min(minH, t.heights[i]!);
    maxH = Math.max(maxH, t.heights[i]!);
  }
  const relief = Math.max(1e-6, maxH - minH);

  // Celdas de cada ficha y zonas (humedal) por celda. La represa se ancla a la celda de mayor
  // flujo dentro de su radio: una represa siempre va sobre el río.
  const cells = tokens.map((k) => (k.kind === 'represa' ? riverCellNear(t, downstream, order, k.x, k.z, radiusCells) : cellOf(t, k.x, k.z)));
  const wetland = new Int16Array(n).fill(-1);
  tokens.forEach((k, ti) => {
    if (k.kind !== 'humedal') return;
    const c0 = cells[ti]! % t.w;
    const r0 = (cells[ti]! - c0) / t.w;
    const rc = Math.ceil(radiusCells);
    for (let r = Math.max(0, r0 - rc); r <= Math.min(t.h - 1, r0 + rc); r++)
      for (let c = Math.max(0, c0 - rc); c <= Math.min(t.w - 1, c0 + rc); c++)
        if ((r - r0) ** 2 + (c - c0) ** 2 <= radiusCells ** 2) wetland[r * t.w + c] = ti;
  });
  const near = (a: number, kind: TokenKind, radiusM: number) =>
    tokens.some((k, j) => j !== a && k.kind === kind && Math.hypot(k.x - tokens[a]!.x, k.z - tokens[a]!.z) <= radiusM);

  // 1) Acumulación de agua.
  const acc = new Float64Array(n);
  for (let i = 0; i < n; i++) acc[i] = rain;
  for (const i of order) {
    const d = downstream[i]!;
    if (d >= 0) acc[d] = acc[d]! + acc[i]!;
  }
  const qRaw = acc.reduce((s, _v, i) => (downstream[i] === -1 ? s + acc[i]! : s), 0);
  const qRef = n * R.rain.base;

  // 2) Fichas: retención, consumo, cargas.
  let retention = 0;
  let consumptionKeep = 1;
  let bio = R.biodiversity.base;
  let food = 0;
  let housing = 0;
  let economy = 0;
  let energyRaw = 0;
  const polluteEmit = new Float64Array(tokens.length);
  const sedimentEmit = new Float64Array(tokens.length);
  const treated = new Float64Array(tokens.length);
  const consumption = new Float64Array(tokens.length);
  const totalAccMax = qRaw / t.h; // normaliza la acumulación de una celda del cauce

  tokens.forEach((k, ti) => {
    const cell = cells[ti]!;
    switch (k.kind) {
      case 'paramo': {
        // Solo cumple su función en cotas altas.
        const hf = (t.heights[cell]! - minH) / relief;
        const ok = hf >= T.paramo.minHeightFrac;
        if (ok) retention += T.paramo.retention;
        bio += ok ? T.paramo.biodiversity : T.paramo.biodiversity / 2;
        break;
      }
      case 'bosque':
        retention += T.bosque.retention;
        bio += T.bosque.biodiversity;
        break;
      case 'humedal':
        retention += T.humedal.retention;
        bio += T.humedal.biodiversity;
        break;
      case 'cultivo': {
        const shield = near(ti, 'bosque', T.bosque.shieldRadius) ? 1 - T.bosque.erosionShield : 1;
        const s = Math.min(1, slope[cell]! * T.cultivo.slopeFactor * 0.01);
        polluteEmit[ti] = T.cultivo.load * 0.5;
        sedimentEmit[ti] = T.cultivo.load * (0.5 + s) * shield;
        consumption[ti] = T.cultivo.consumption;
        food += T.cultivo.food;
        bio += T.cultivo.biodiversity;
        break;
      }
      case 'ciudad':
      case 'industria': {
        const cfg = T[k.kind];
        const ptarNear = tokens.some((p, j) => p.kind === 'ptar' && Math.hypot(p.x - k.x, p.z - k.z) <= T.ptar.radius && j !== ti);
        treated[ti] = ptarNear ? T.ptar.treat : 0;
        polluteEmit[ti] = cfg.load * (1 - treated[ti]!);
        consumption[ti] = cfg.consumption;
        bio += cfg.biodiversity;
        if (k.kind === 'ciudad') housing += T.ciudad.housing;
        else economy += T.industria.economy;
        break;
      }
      case 'represa': {
        consumption[ti] = T.represa.consumption;
        bio += T.represa.biodiversity;
        // Energía ∝ caudal × caída: fracción del caudal total que pasa por la represa × altura relativa.
        const flowFrac = acc[cell]! / Math.max(1e-6, qRaw);
        const drop = (t.heights[cell]! - minH) / relief;
        energyRaw += flowFrac * drop * (1 + 0.5 * climate);
        break;
      }
      case 'ptar':
        bio += T.ptar.biodiversity;
        break;
    }
    consumptionKeep *= 1 - consumption[ti]!;
  });

  const qOut = qRaw * consumptionKeep * (1 + Math.min(R.flow.maxBoost, retention));
  const qNorm = qOut / qRef;

  // 3) Transporte de cargas por el árbol de drenaje (lineal → se puede atribuir por ficha).
  const pol = new Float64Array(n);
  const sed = new Float64Array(n);
  const decay = 1 - R.transportDecayPerCell;
  tokens.forEach((_k, ti) => {
    pol[cells[ti]!] = pol[cells[ti]!]! + polluteEmit[ti]!;
    sed[cells[ti]!] = sed[cells[ti]!]! + sedimentEmit[ti]!;
  });
  const damAt = new Int16Array(n).fill(-1);
  tokens.forEach((k, ti) => {
    if (k.kind === 'represa') damAt[cells[ti]!] = ti;
  });
  // Factor de paso acumulado por celda hasta la salida (para atribuir cargas a cada ficha).
  const passPol = new Float64Array(n);
  const passSed = new Float64Array(n);
  let sedimentTrapped = 0;
  let polOut = 0;
  let sedOut = 0;
  for (const i of order) {
    let fp = decay;
    let fs = decay;
    const w = wetland[i]!;
    const d = downstream[i]!;
    if (w >= 0 && (d < 0 || wetland[d] !== w)) {
      fp *= 1 - T.humedal.filter;
      fs *= 1 - T.humedal.filter;
    }
    if (damAt[i]! >= 0) {
      sedimentTrapped += sed[i]! * T.represa.sedimentTrap;
      fs *= 1 - T.represa.sedimentTrap;
    }
    passPol[i] = fp;
    passSed[i] = fs;
    if (d >= 0) {
      pol[d] = pol[d]! + pol[i]! * fp;
      sed[d] = sed[d]! + sed[i]! * fs;
    } else {
      polOut += pol[i]! * fp;
      sedOut += sed[i]! * fs;
    }
  }
  const loadOut = polOut + sedOut;
  const conc = loadOut / Math.max(1e-6, qNorm);

  // Atribución por ficha: producto de factores de paso a lo largo de su camino.
  const throughput = (cell: number, pass: Float64Array) => {
    let f = 1;
    for (let c = cell; c >= 0; c = downstream[c]!) f *= pass[c]!;
    return f;
  };
  const effects: TokenEffect[] = tokens.map((k, ti) => {
    const arrive = polluteEmit[ti]! * throughput(cells[ti]!, passPol) + sedimentEmit[ti]! * throughput(cells[ti]!, passSed);
    return { index: ti, kind: k.kind, loadShare: loadOut > 0 ? arrive / loadOut : 0, consumption: consumption[ti]!, treated: treated[ti]! };
  });

  // 4) Indicadores.
  const quality = clamp100(100 / (1 + conc / R.quality.c50));
  if (quality < R.biodiversity.qualityKnee) bio -= (R.biodiversity.qualityKnee - quality) * R.biodiversity.qualityPenalty;
  const flow = clamp100(R.flow.naturalScore * qNorm);
  if (flow < 40) bio -= (40 - flow) * 0.3;
  const energy = clamp100(100 * sat(energyRaw * R.energy.scale));
  const W = R.wellbeing.weights;
  const wellbeing = clamp100(
    R.wellbeing.base + 100 * (W.energy * (energy / 100) + W.food * sat(food) + W.housing * sat(housing) + W.economy * sat(economy)),
  );

  // Salidas por celda para el render.
  const mainChannel = new Uint8Array(n);
  const accumulation = new Float32Array(n);
  const pollution = new Float32Array(n);
  const thr = R.channelThreshold * qRaw;
  for (let i = 0; i < n; i++) {
    accumulation[i] = Math.min(1, acc[i]! / Math.max(1e-6, totalAccMax));
    if (acc[i]! >= thr) mainChannel[i] = 1;
    pollution[i] = (pol[i]! + sed[i]!) / Math.max(1e-6, (acc[i]! / qRef) * n * 0.02 + 1) / R.quality.c50;
  }

  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    indicators: { flow: round(flow), quality: round(quality), biodiversity: round(clamp100(bio)), wellbeing: round(wellbeing), energy: round(energy) },
    mainChannel,
    accumulation,
    pollution,
    downstream,
    sedimentTrapped,
    effects,
  };
}
