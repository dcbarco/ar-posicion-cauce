// F1 — Taller: matemática de explosión, autoescalado, acople y `requires` (brief, sección 6; D9).
// Plantilla lista: se salta hasta que exista src/experiences/taller/logic/explode.ts con la API propuesta
// en PEDIDOS (P-006). Lógica pura: posiciones como {x,y,z}, sin Three.js.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBounds } from '../../src/core/table/bounds';
import { abs } from '../helpers/repo';

interface V3 {
  x: number;
  y: number;
  z: number;
}
interface PartInput {
  partId: string;
  rest: V3; // posición armada (m, relativa al pivote del modelo)
  radius: number; // radio de la pieza en X–Z (m)
  explode: { dir: [number, number, number]; dist: number; order: number };
  requires?: string[];
}
interface ExplodeModule {
  /** Posiciones al `amount` (0..1) de explosión, sin autoescala. */
  explodedPositions(parts: PartInput[], amount: number): Map<string, V3>;
  /** Escala (≤ 1) para que todo el conjunto explotado (con radios) quepa en el área útil centrado en `at`. */
  autoScale(parts: PartInput[], at: V3, bounds: ReturnType<typeof createBounds>): number;
  /** Retardo de cascada (s) de una pieza: 40 ms × order. */
  cascadeDelay(order: number): number;
  /** ¿La pieza soltada en `p` se acopla a su sitio `target`? (imán < 4 cm) */
  snaps(p: V3, target: V3): boolean;
  /** ¿Se puede montar `partId` dado el conjunto de piezas ya montadas? */
  canMount(parts: PartInput[], partId: string, mounted: ReadonlySet<string>): boolean;
}

const exists = existsSync(abs('src', 'experiences', 'taller', 'logic', 'explode.ts'));

async function load(): Promise<ExplodeModule | null> {
  const spec = '../../src/experiences/taller/logic/explode.ts';
  const mod = (await import(/* @vite-ignore */ spec)) as Partial<ExplodeModule>;
  const need = ['explodedPositions', 'autoScale', 'cascadeDelay', 'snaps', 'canMount'] as const;
  if (need.some((k) => typeof mod[k] !== 'function')) {
    console.warn('[QA] taller/logic/explode.ts no expone la API propuesta: ajustar adaptador (P-006)');
    return null;
  }
  return mod as ExplodeModule;
}

/** Motor de juguete: 4 piezas con explosiones grandes para forzar el autoescalado. */
const PARTS: PartInput[] = [
  { partId: 'bloque', rest: { x: 0, y: 0.05, z: 0 }, radius: 0.08, explode: { dir: [0, 0, 0], dist: 0, order: 0 } },
  { partId: 'culata', rest: { x: 0, y: 0.15, z: 0 }, radius: 0.06, explode: { dir: [0, 1, 0], dist: 0.2, order: 1 }, requires: ['bloque'] },
  { partId: 'volante', rest: { x: 0.1, y: 0.05, z: 0 }, radius: 0.07, explode: { dir: [1, 0, 0], dist: 0.6, order: 2 }, requires: ['bloque'] },
  { partId: 'carter', rest: { x: 0, y: 0.0, z: 0.05 }, radius: 0.07, explode: { dir: [0, 0, 1], dist: 0.5, order: 1 }, requires: ['bloque'] },
  { partId: 'bujia', rest: { x: 0, y: 0.2, z: 0 }, radius: 0.01, explode: { dir: [0, 1, 0], dist: 0.3, order: 3 }, requires: ['culata'] },
];

describe.skipIf(!exists)('Taller — explosión y armado', () => {
  it('al 0 % todas las piezas están en su pose armada', async () => {
    const m = await load();
    if (!m) return;
    const pos = m.explodedPositions(PARTS, 0);
    for (const p of PARTS) expect(pos.get(p.partId)).toEqual(p.rest);
  });

  it('al 100 % cada pieza se desplaza dist en la dirección dir (normalizada)', async () => {
    const m = await load();
    if (!m) return;
    const pos = m.explodedPositions(PARTS, 1);
    for (const p of PARTS) {
      const q = pos.get(p.partId) as V3;
      const d = Math.hypot(q.x - p.rest.x, q.y - p.rest.y, q.z - p.rest.z);
      expect(d).toBeCloseTo(p.explode.dist, 6);
    }
  });

  it('la explosión es monótona en amount', async () => {
    const m = await load();
    if (!m) return;
    const p = PARTS[2] as PartInput;
    let last = -1;
    for (let a = 0; a <= 1.0001; a += 0.1) {
      const q = m.explodedPositions(PARTS, a).get(p.partId) as V3;
      const d = Math.hypot(q.x - p.rest.x, q.y - p.rest.y, q.z - p.rest.z);
      expect(d).toBeGreaterThanOrEqual(last - 1e-9);
      last = d;
    }
  });

  it('retardo en cascada = 40 ms × order', async () => {
    const m = await load();
    if (!m) return;
    expect(m.cascadeDelay(0)).toBe(0);
    expect(m.cascadeDelay(3)).toBeCloseTo(0.12, 9);
  });

  it('autoescalado: al 100 % nada sale del área útil, desde el centro y desde una esquina', async () => {
    const m = await load();
    if (!m) return;
    const bounds = createBounds();
    for (const at of [
      { x: 0, y: 0, z: 0 },
      { x: 0.3, y: 0, z: -0.2 },
    ]) {
      const s = m.autoScale(PARTS, at, bounds);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(1);
      const pos = m.explodedPositions(PARTS, 1);
      for (const p of PARTS) {
        const q = pos.get(p.partId) as V3;
        const world = { x: at.x + q.x * s, y: 0, z: at.z + q.z * s };
        expect(bounds.contains(world, p.radius * s), `${p.partId} fuera con at=${JSON.stringify(at)}`).toBe(true);
      }
    }
  });

  it('autoescalado = 1 cuando ya cabe', async () => {
    const m = await load();
    if (!m) return;
    const small = PARTS.map((p) => ({ ...p, explode: { ...p.explode, dist: p.explode.dist * 0.1 } }));
    expect(m.autoScale(small, { x: 0, y: 0, z: 0 }, createBounds())).toBe(1);
  });

  it('acople con imán: < 4 cm sí, ≥ 4 cm no', async () => {
    const m = await load();
    if (!m) return;
    const t = { x: 0.1, y: 0, z: 0.1 };
    expect(m.snaps({ x: 0.1 + 0.039, y: 0, z: 0.1 }, t)).toBe(true);
    expect(m.snaps({ x: 0.1 + 0.041, y: 0, z: 0.1 }, t)).toBe(false);
    expect(m.snaps({ x: 0.1 + 0.03, y: 0, z: 0.1 + 0.03 }, t)).toBe(false); // 4,24 cm en diagonal
  });

  it('requires: no se monta una pieza antes que sus dependencias', async () => {
    const m = await load();
    if (!m) return;
    expect(m.canMount(PARTS, 'bloque', new Set())).toBe(true);
    expect(m.canMount(PARTS, 'culata', new Set())).toBe(false);
    expect(m.canMount(PARTS, 'culata', new Set(['bloque']))).toBe(true);
    expect(m.canMount(PARTS, 'bujia', new Set(['bloque']))).toBe(false);
    expect(m.canMount(PARTS, 'bujia', new Set(['bloque', 'culata']))).toBe(true);
  });

  it.todo('ninguna pieza se interpenetra al 100 % (cajas envolventes del manifiesto o del GLB)');
  it.todo('modo Armar: barajar deja todas las piezas dentro del área útil y fuera de su sombra');
  it.todo('pellizco (0,6×–1,6×) y autoescala se multiplican (D9) y el clamp usa la huella resultante');
});

describe.skipIf(exists)('Taller — explosión y armado (pendiente)', () => {
  it.todo('src/experiences/taller/logic/explode.ts aún no existe (A1, F2)');
});
