// Parámetros por nivel de calidad. El Agente 1 baja de nivel con FxKit.setQuality() si caen los fps.
import type { QualityLevel } from '../core/contracts';

export interface FxQuality {
  /** Líneas de luz del sello de marca (appear/disappear). */
  streaks: number;
  /** Muestras por línea (suavidad de la curva). */
  streakSegments: number;
  /** Ancho de cada línea (m). */
  streakWidth: number;
  /** Halo del borde de la mesa (0..1). */
  edgeGlow: number;
  /** Corrientes que recorren el borde en modo lock (0..1). */
  edgeFlow: number;
  /** Latido de la retícula (0..1). */
  reticleBeat: number;
}

export const QUALITY: Record<QualityLevel, FxQuality> = {
  high: { streaks: 28, streakSegments: 28, streakWidth: 0.005, edgeGlow: 1, edgeFlow: 1, reticleBeat: 1 },
  medium: { streaks: 18, streakSegments: 20, streakWidth: 0.0055, edgeGlow: 0.8, edgeFlow: 0.6, reticleBeat: 1 },
  low: { streaks: 10, streakSegments: 12, streakWidth: 0.006, edgeGlow: 0.45, edgeFlow: 0, reticleBeat: 0.5 },
};

export const LED = '#41B270';
export const LED_HOT = '#B8F5CF';
export const AMBER = '#F2B134';

/** Amortiguación exponencial independiente de los fps. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  // Red de seguridad: un dt no positivo o un valor no finito no debe dejar NaN pegado para siempre.
  if (!(dt > 0) || !Number.isFinite(current)) return Number.isFinite(current) ? current : target;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export const easeOutCubic = (x: number): number => 1 - (1 - x) * (1 - x) * (1 - x);
export const easeInCubic = (x: number): number => x * x * x;
export const easeInOutCubic = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** ease-out con rebote leve (asentamiento ≤ 8 %, sección 9). */
export const easeOutBack = (x: number, c1 = 1.1): number => {
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
