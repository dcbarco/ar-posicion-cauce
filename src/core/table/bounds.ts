// Límites del área útil sobre el tope. Lógica pura: trabaja con cualquier objeto {x, y, z}
// (THREE.Vector3 cumple la forma), sin importar Three.js.
import { TABLE, usableHalfExtents, type TableSpec } from './spec';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface TableBounds {
  /** Semiejes del área útil (m). */
  readonly hx: number;
  readonly hz: number;
  /** ¿El punto (proyectado en X–Z) cabe en el área útil dejando `radius` de margen? */
  contains(p: Vec3Like, radius?: number): boolean;
  /** Recorta el punto en su sitio (muta y devuelve `p`) para que el círculo de `radius` quede dentro. */
  clamp<T extends Vec3Like>(p: T, radius?: number): T;
  /** Distancia (m) del punto al borde del área útil; negativa si está fuera. */
  edgeDistance(p: Vec3Like): number;
}

export function createBounds(spec: TableSpec = TABLE): TableBounds {
  const { hx, hz } = usableHalfExtents(spec);
  return {
    hx,
    hz,
    contains(p, radius = 0) {
      const r = Math.max(0, radius);
      return Math.abs(p.x) <= hx - r && Math.abs(p.z) <= hz - r;
    },
    clamp(p, radius = 0) {
      const lx = Math.max(0, hx - Math.max(0, radius));
      const lz = Math.max(0, hz - Math.max(0, radius));
      // NaN o infinito → centro: un objeto nunca debe desaparecer por una cuenta inválida.
      p.x = Number.isFinite(p.x) ? Math.min(lx, Math.max(-lx, p.x)) : 0;
      p.z = Number.isFinite(p.z) ? Math.min(lz, Math.max(-lz, p.z)) : 0;
      return p;
    },
    edgeDistance(p) {
      return Math.min(hx - Math.abs(p.x), hz - Math.abs(p.z));
    },
  };
}
