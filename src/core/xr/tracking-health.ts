// Salud del tracking con histéresis (sección 5.5). Lógica pura: se alimenta con muestras por frame.
export const TRACKING = {
  enterLostMs: 400, // sostenido "malo" para entrar en perdido
  exitLostMs: 200, // sostenido "bueno" para salir
  jumpMeters: 0.15, // salto de la pose de la mesa entre frames que cuenta como malo
  recalibrateAfterMs: 8000, // perdido más que esto → ofrecer recalibrar
} as const;

export interface TrackingHealth {
  readonly lost: boolean;
  /** ms continuos en estado perdido (0 si no). */
  readonly lostForMs: number;
  /** Muestra de un frame: `good` = hay pose del visor y la mesa no saltó. Devuelve true si `lost` cambió. */
  sample(good: boolean, dtMs: number): boolean;
  reset(): void;
}

export function createTrackingHealth(cfg = TRACKING): TrackingHealth {
  let lost = false;
  let badMs = 0;
  let goodMs = 0;
  let lostForMs = 0;
  return {
    get lost() {
      return lost;
    },
    get lostForMs() {
      return lostForMs;
    },
    sample(good, dtMs) {
      if (good) {
        goodMs += dtMs;
        badMs = 0;
      } else {
        badMs += dtMs;
        goodMs = 0;
      }
      const prev = lost;
      if (!lost && badMs >= cfg.enterLostMs) lost = true;
      else if (lost && goodMs >= cfg.exitLostMs) lost = false;
      lostForMs = lost ? lostForMs + dtMs : 0;
      return prev !== lost;
    },
    reset() {
      lost = false;
      badMs = goodMs = lostForMs = 0;
    },
  };
}

/** Deriva de altura: hit-test vs plano bloqueado > 4 cm durante 2 s seguidos → sugerir recalibrar. */
export function createHeightDriftWatch(thresholdM = 0.04, sustainMs = 2000) {
  let ms = 0;
  return {
    /** `diff` = altura del hit-test menos la del plano (m), o null si no hay muestra válida este frame. */
    sample(diff: number | null, dtMs: number): boolean {
      if (diff === null) return ms >= sustainMs;
      ms = Math.abs(diff) > thresholdM ? ms + dtMs : 0;
      return ms >= sustainMs;
    },
    reset() {
      ms = 0;
    },
  };
}
