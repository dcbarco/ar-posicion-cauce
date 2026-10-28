// D22: la deriva de altura pequeña se corrige sola; solo la grande y sostenida sugiere recalibrar.
import { describe, expect, it } from 'vitest';
import { createHeightDrift, DRIFT } from '../../src/core/xr/tracking-health';

const FRAME_MS = 16;

/** Simula un tope que el hit-test ve `offset` m por encima; devuelve la corrección total y si sugirió. */
function run(offset: number, ms: number) {
  const d = createHeightDrift();
  let corrected = 0;
  let suggested = false;
  for (let t = 0; t < ms; t += FRAME_MS) {
    const r = d.sample(offset - corrected, FRAME_MS);
    corrected += r.correctM;
    suggested ||= r.suggest;
  }
  return { corrected, suggested };
}

describe('deriva de altura (D22)', () => {
  it('4 cm (lo visto en la tablet): se corrige solo y no sugiere recalibrar', () => {
    const r = run(0.04, 6000);
    expect(r.suggested).toBe(false);
    expect(r.corrected).toBeGreaterThan(0.03);
    expect(r.corrected).toBeLessThanOrEqual(0.04 + 1e-6);
  });

  it('la corrección es gradual (sin saltos visibles por frame)', () => {
    const d = createHeightDrift();
    let max = 0;
    for (let t = 0; t < 5000; t += FRAME_MS) max = Math.max(max, Math.abs(d.sample(0.07, FRAME_MS).correctM));
    expect(max).toBeLessThan(0.003);
  });

  it('dentro de la banda muerta no corrige', () => {
    expect(run(0.008, 5000).corrected).toBe(0);
  });

  it('diferencia grande y sostenida: sugiere recalibrar sin mover el tope', () => {
    const r = run(0.12, DRIFT.suggestMs + 1000);
    expect(r.suggested).toBe(true);
    expect(r.corrected).toBe(0);
  });

  it('diferencia grande pero breve (un movimiento rápido): no sugiere', () => {
    const d = createHeightDrift();
    let suggested = false;
    for (let t = 0; t < 1500; t += FRAME_MS) suggested ||= d.sample(0.12, FRAME_MS).suggest;
    for (let t = 0; t < 3000; t += FRAME_MS) suggested ||= d.sample(0, FRAME_MS).suggest;
    expect(suggested).toBe(false);
  });

  it('descarta lo que no es el tope (piso a 70 cm) y valores no finitos', () => {
    expect(run(-0.7, 8000)).toEqual({ corrected: 0, suggested: false });
    const d = createHeightDrift();
    expect(d.sample(NaN, FRAME_MS)).toEqual({ correctM: 0, suggest: false });
  });
});
