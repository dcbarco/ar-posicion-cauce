// Contrato de la mesa (brief, sección 2). Si cambia un valor, cambia el mundo: la prueba debe gritar.
import { describe, expect, it } from 'vitest';
import { TABLE, usableHalfExtents } from '../../src/core/table/spec';

describe('TABLE (sección 2)', () => {
  it('tiene exactamente los valores del brief', () => {
    expect(TABLE).toEqual({
      length: 1.0,
      width: 0.7,
      height: 0.93,
      usableInset: 0.04,
      tabletRestHeight: 0.7,
      ledColor: '#41B270',
    });
  });

  it('no tiene campos extra ni faltantes', () => {
    expect(Object.keys(TABLE).sort()).toEqual(
      ['height', 'ledColor', 'length', 'tabletRestHeight', 'usableInset', 'width'].sort(),
    );
  });

  it('el largo va en X y es mayor que el ancho (Z)', () => {
    expect(TABLE.length).toBeGreaterThan(TABLE.width);
  });

  it('la tablet en reposo queda 23 cm bajo el tope', () => {
    expect(TABLE.height - TABLE.tabletRestHeight).toBeCloseTo(0.23, 10);
  });

  it('el color LED es un hex de 6 dígitos', () => {
    expect(TABLE.ledColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('usableInset es positivo y deja área útil razonable (< 10 cm)', () => {
    expect(TABLE.usableInset).toBeGreaterThan(0);
    expect(TABLE.usableInset).toBeLessThan(0.1);
  });
});

describe('usableHalfExtents', () => {
  it('área útil = tope menos usableInset en cada lado', () => {
    const { hx, hz } = usableHalfExtents();
    expect(hx).toBeCloseTo(0.46, 10);
    expect(hz).toBeCloseTo(0.31, 10);
  });

  it('el área desarmada del contrato de modelos (0,90 × 0,60 m) cabe en el área útil', () => {
    const { hx, hz } = usableHalfExtents();
    expect(0.9 / 2).toBeLessThanOrEqual(hx);
    expect(0.6 / 2).toBeLessThanOrEqual(hz);
  });
});
