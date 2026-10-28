// Salud del tracking con histéresis (sección 5.5). Lógica pura: se alimenta con muestras por frame.
export const TRACKING = {
  enterLostMs: 500, // sostenido "malo" para entrar en perdido (un giro rápido no basta)
  exitLostMs: 200, // sostenido "bueno" para salir
  jumpMeters: 0.15, // salto de la pose de la mesa entre frames que cuenta como malo
  recalibrateAfterMs: 12000, // perdido más que esto → ofrecer recalibrar (el ancla suele volver sola antes)
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

/**
 * Deriva de altura (D22). Tras el lock ARCore sigue afinando su plano del tope y suele moverlo unos
 * centímetros (sobre todo en un tope blanco, brillante e iluminado). Esas diferencias pequeñas se
 * corrigen solas y despacio; solo una diferencia grande y sostenida sugiere recalibrar.
 */
export const DRIFT = {
  deadbandM: 0.01, // por debajo no se corrige nada
  autoFixM: 0.08, // hasta aquí se corrige solo
  ignoreM: 0.2, // más que esto no es el tope (piso, manos, otro mueble): se descarta la muestra
  settleMs: 800, // la diferencia debe sostenerse esto antes de empezar a corregir
  suggestMs: 4000, // diferencia grande sostenida → sugerir recalibrar
  avgRate: 3, // 1/s, promedio exponencial de las muestras
  fixRate: 1.2, // 1/s, velocidad de la corrección (sin saltos visibles)
} as const;

export interface HeightDriftResult {
  /** Metros a subir (+) o bajar (−) el tope este frame. */
  correctM: number;
  suggest: boolean;
}

export function createHeightDrift(cfg = DRIFT) {
  const out: HeightDriftResult = { correctM: 0, suggest: false }; // reutilizado: cero asignaciones por frame
  let avg = 0;
  let has = false;
  let steadyMs = 0;
  let bigMs = 0;
  const done = (correctM: number) => {
    out.correctM = correctM;
    out.suggest = bigMs >= cfg.suggestMs;
    return out;
  };
  return {
    /** `diff` = altura del hit-test menos la del tope (m), o null si no hay muestra este frame. */
    sample(diff: number | null, dtMs: number): HeightDriftResult {
      if (diff === null || !Number.isFinite(diff) || Math.abs(diff) > cfg.ignoreM) return done(0);
      const dt = dtMs / 1000;
      avg = has ? avg + (diff - avg) * (1 - Math.exp(-cfg.avgRate * dt)) : diff;
      has = true;
      const a = Math.abs(avg);
      if (a > cfg.autoFixM) {
        bigMs += dtMs;
        steadyMs = 0;
        return done(0);
      }
      bigMs = 0;
      if (a <= cfg.deadbandM) {
        steadyMs = 0;
        return done(0);
      }
      steadyMs += dtMs;
      if (steadyMs < cfg.settleMs) return done(0);
      const step = avg * (1 - Math.exp(-cfg.fixRate * dt));
      avg -= step; // el tope se mueve `step`: las próximas muestras ya vendrán corregidas
      return done(step);
    },
    reset() {
      avg = steadyMs = bigMs = 0;
      has = false;
    },
  };
}
