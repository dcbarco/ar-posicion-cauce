// Taller — matemática de explosión, autoescalado, acople y dependencias de montaje (sección 6; D9).
// Lógica pura (posiciones {x,y,z}, sin Three.js). API acordada en P-006.
import type { TableBounds } from '../../../core/contracts';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface PartInput {
  partId: string;
  /** Posición armada (m, relativa al pivote del modelo). */
  rest: V3;
  /** Radio de la pieza en X–Z (m). */
  radius: number;
  explode: { dir: [number, number, number]; dist: number; order: number };
  requires?: string[];
}

export const TALLER = {
  cascadeStepS: 0.04,
  snapDistanceM: 0.04,
} as const;

/** Desplazamiento de una pieza al `amount` (0..1) de explosión. Escribe en `out`. */
export function explodedPosition(p: PartInput, amount: number, out: V3): V3 {
  const [dx, dy, dz] = p.explode.dir;
  const len = Math.hypot(dx, dy, dz);
  const k = len > 0 ? (p.explode.dist * Math.min(1, Math.max(0, amount))) / len : 0;
  out.x = p.rest.x + dx * k;
  out.y = p.rest.y + dy * k;
  out.z = p.rest.z + dz * k;
  return out;
}

/** Posiciones al `amount` (0..1) de explosión, sin autoescala. */
export function explodedPositions(parts: readonly PartInput[], amount: number): Map<string, V3> {
  const m = new Map<string, V3>();
  for (const p of parts) m.set(p.partId, explodedPosition(p, amount, { x: 0, y: 0, z: 0 }));
  return m;
}

/**
 * Escala (≤ 1) para que el conjunto explotado al 100 % (con radios) quepa en el área útil
 * centrado en `at`: se resuelve |at + q·s| + r·s ≤ h por eje y pieza, que es lineal en s.
 */
export function autoScale(parts: readonly PartInput[], at: V3, bounds: Pick<TableBounds, 'hx' | 'hz'>): number {
  let s = 1;
  const q: V3 = { x: 0, y: 0, z: 0 };
  const limit = (a: number, c: number, h: number) => {
    // a + c·s ≤ h  ⇒  s ≤ (h − a) / c  si c > 0
    if (c > 0) s = Math.min(s, (h - a) / c);
  };
  for (const p of parts) {
    explodedPosition(p, 1, q);
    limit(at.x, q.x + p.radius, bounds.hx);
    limit(-at.x, -q.x + p.radius, bounds.hx);
    limit(at.z, q.z + p.radius, bounds.hz);
    limit(-at.z, -q.z + p.radius, bounds.hz);
  }
  return Math.max(0.05, Math.min(1, s));
}

/** Retardo de cascada (s): 40 ms × order. */
export function cascadeDelay(order: number): number {
  return TALLER.cascadeStepS * order;
}

/** ¿La pieza soltada en `p` se acopla a su sitio `target`? (imán < 4 cm, distancia en X–Z). */
export function snaps(p: V3, target: V3): boolean {
  return Math.hypot(p.x - target.x, p.z - target.z) < TALLER.snapDistanceM;
}

/** ¿Se puede montar `partId` dado el conjunto ya montado? (según `requires`) */
export function canMount(parts: readonly PartInput[], partId: string, mounted: ReadonlySet<string>): boolean {
  const p = parts.find((x) => x.partId === partId);
  if (!p) return false;
  return (p.requires ?? []).every((r) => mounted.has(r));
}

/** Piezas que se pueden montar ahora (para la ayuda "resalta la siguiente pieza"). */
export function mountable(parts: readonly PartInput[], mounted: ReadonlySet<string>): string[] {
  return parts.filter((p) => !mounted.has(p.partId) && canMount(parts, p.partId, mounted)).map((p) => p.partId);
}
