// BUG-dt-negativo: al entrar a la sesión XR la base de tiempo cambia y el primer dt salía negativo y
// enorme; damp() daba Infinity y luego NaN, y retícula, borde y modelo quedaban invisibles en la tablet.
import { describe, expect, it } from 'vitest';
import { damp } from '../../src/fx/quality';

describe('damp ante saltos de reloj', () => {
  it('un dt negativo o no finito no altera el valor', () => {
    expect(damp(0.4, 1, 12, -190)).toBe(0.4);
    expect(damp(0.4, 1, 12, Number.NaN)).toBe(0.4);
    expect(damp(0.4, 1, 12, 0)).toBe(0.4);
  });

  it('un valor ya corrupto (NaN/Infinity) se recupera al objetivo', () => {
    expect(damp(Number.NaN, 1, 12, 0.016)).toBe(1);
    expect(damp(Number.POSITIVE_INFINITY, 0, 6, 0.016)).toBe(0);
  });

  it('tras un salto negativo la opacidad sigue convergiendo', () => {
    let o = 0;
    o = damp(o, 1, 12, -190);
    for (let i = 0; i < 60; i++) o = damp(o, 1, 12, 1 / 60);
    expect(o).toBeGreaterThan(0.99);
  });
});
