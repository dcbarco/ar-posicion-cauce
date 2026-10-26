// Reinicio por inactividad (sección 5.1, paso 7). Lógica pura con tiempo inyectado.
export const IDLE = { warnAfterMs: 60_000, countdownMs: 10_000 } as const;

export type IdleStatus = { phase: 'active' } | { phase: 'warning'; secondsLeft: number } | { phase: 'expired' };

export interface IdleTimer {
  activity(): void;
  /** Avanza el reloj; devuelve el estado actual. */
  tick(dtMs: number): IdleStatus;
  reset(): void;
}

export function createIdleTimer(cfg: { warnAfterMs: number; countdownMs: number } = IDLE): IdleTimer {
  let idleMs = 0;
  return {
    activity() {
      idleMs = 0;
    },
    tick(dtMs) {
      idleMs += dtMs;
      if (idleMs < cfg.warnAfterMs) return { phase: 'active' };
      const left = cfg.warnAfterMs + cfg.countdownMs - idleMs;
      if (left <= 0) return { phase: 'expired' };
      return { phase: 'warning', secondsLeft: Math.ceil(left / 1000) };
    },
    reset() {
      idleMs = 0;
    },
  };
}
