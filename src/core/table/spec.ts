// src/core/table/spec.ts — única fuente de verdad de la mesa
export const TABLE = {
  length: 1.0, // m, eje X
  width: 0.7, // m, eje Z
  height: 0.93, // m, tope sobre el piso
  usableInset: 0.04, // m, TODO medir hasta el borde interior de la luz LED
  tabletRestHeight: 0.7, // m, informativo
  ledColor: '#41B270',
} as const satisfies TableSpec;

/** Forma general de una mesa (permite una mesa medida distinta de la constante). */
export interface TableSpec {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly usableInset: number;
  readonly tabletRestHeight: number;
  readonly ledColor: string;
}

/** Semiejes del área útil (tope menos `usableInset`), en metros. */
export function usableHalfExtents(spec: TableSpec = TABLE): { hx: number; hz: number } {
  return { hx: spec.length / 2 - spec.usableInset, hz: spec.width / 2 - spec.usableInset };
}
