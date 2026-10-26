// Contrato de límites del área útil (src/core/table/bounds.ts). Área útil: |x| ≤ 0,46 y |z| ≤ 0,31.
import { describe, expect, it } from 'vitest';
import { createBounds } from '../../src/core/table/bounds';
import { TABLE } from '../../src/core/table/spec';

const b = createBounds();
const HX = 0.46;
const HZ = 0.31;
const v = (x: number, z: number, y = 0) => ({ x, y, z });

describe('createBounds — semiejes', () => {
  it('expone hx/hz del área útil', () => {
    expect(b.hx).toBeCloseTo(HX, 10);
    expect(b.hz).toBeCloseTo(HZ, 10);
  });

  it('por defecto usa TABLE', () => {
    const b2 = createBounds(TABLE);
    expect(b2.hx).toBe(b.hx);
    expect(b2.hz).toBe(b.hz);
  });
});

describe('contains', () => {
  it('centro y puntos interiores', () => {
    expect(b.contains(v(0, 0))).toBe(true);
    expect(b.contains(v(0.2, -0.1))).toBe(true);
  });

  it('ignora la altura Y (proyecta en X–Z)', () => {
    expect(b.contains(v(0, 0, 5))).toBe(true);
    expect(b.contains(v(0, 0, -0.93))).toBe(true);
  });

  it('las esquinas exactas del área útil cuentan como dentro', () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) expect(b.contains(v(sx * b.hx, sz * b.hz))).toBe(true);
  });

  it('puntos fuera por X, por Z y en diagonal', () => {
    expect(b.contains(v(0.47, 0))).toBe(false);
    expect(b.contains(v(-0.47, 0))).toBe(false);
    expect(b.contains(v(0, 0.32))).toBe(false);
    expect(b.contains(v(0, -0.32))).toBe(false);
    expect(b.contains(v(0.5, 0.35))).toBe(false); // esquina del tope: fuera del área útil
    expect(b.contains(v(10, -10))).toBe(false);
  });

  it('el radio encoge el área por cada lado', () => {
    const r = 0.06;
    expect(b.contains(v(HX - r, 0), r)).toBe(true);
    expect(b.contains(v(HX - r + 0.001, 0), r)).toBe(false);
    expect(b.contains(v(0, -(HZ - r)), r)).toBe(true);
    expect(b.contains(v(0, -(HZ - r) - 0.001), r)).toBe(false);
    expect(b.contains(v(HX - r, HZ - r), r)).toBe(true);
  });

  it('radio negativo se trata como 0', () => {
    expect(b.contains(v(HX, 0), -1)).toBe(true);
    expect(b.contains(v(HX + 0.01, 0), -1)).toBe(false);
  });
});

describe('clamp', () => {
  it('muta y devuelve el mismo objeto', () => {
    const p = v(1, 1, 0.2);
    const out = b.clamp(p);
    expect(out).toBe(p);
    expect(p.x).toBeCloseTo(HX, 10);
    expect(p.z).toBeCloseTo(HZ, 10);
  });

  it('no toca Y', () => {
    const p = b.clamp(v(2, -2, 0.123));
    expect(p.y).toBe(0.123);
  });

  it('deja intactos los puntos interiores', () => {
    const p = b.clamp(v(0.1, -0.2));
    expect(p.x).toBe(0.1);
    expect(p.z).toBe(-0.2);
  });

  it('recorta en las cuatro direcciones y en esquinas', () => {
    const cases: [number, number, number, number][] = [
      [5, 0, HX, 0],
      [-5, 0, -HX, 0],
      [0, 5, 0, HZ],
      [0, -5, 0, -HZ],
      [-5, 5, -HX, HZ],
      [5, -5, HX, -HZ],
    ];
    for (const [x, z, ex, ez] of cases) {
      const p = b.clamp(v(x, z));
      expect(p.x).toBeCloseTo(ex, 10);
      expect(p.z).toBeCloseTo(ez, 10);
    }
  });

  it('con radio, el círculo queda dentro (contains lo confirma)', () => {
    const r = 0.06;
    for (const [x, z] of [
      [3, 3],
      [-3, 0.1],
      [0.44, -0.3],
    ] as const) {
      const p = b.clamp(v(x, z), r);
      expect(b.contains(p, r)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(HX - r + 1e-12);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(HZ - r + 1e-12);
    }
  });

  it('es idempotente', () => {
    const p = b.clamp(v(9, -9), 0.05);
    const x = p.x;
    const z = p.z;
    b.clamp(p, 0.05);
    expect(p.x).toBe(x);
    expect(p.z).toBe(z);
  });

  it('un radio mayor que el área útil lleva al centro, sin invertir signos', () => {
    const p = b.clamp(v(0.3, -0.2), 1);
    expect(Math.abs(p.x)).toBe(0); // -0 es aceptable
    expect(Math.abs(p.z)).toBe(0);
  });

  it('funciona con clases tipo THREE.Vector3 (conserva el prototipo)', () => {
    class V {
      constructor(
        public x: number,
        public y: number,
        public z: number,
      ) {}
      len() {
        return Math.hypot(this.x, this.y, this.z);
      }
    }
    const p = b.clamp(new V(1, 0, 0));
    expect(p).toBeInstanceOf(V);
    expect(p.len()).toBeCloseTo(HX, 10);
  });

  // BUG-003 (arreglado): un NaN (p. ej. un rayo casi paralelo al tope) no atraviesa el clamp.
  it('BUG-003: clamp nunca devuelve NaN', () => {
    const p = b.clamp(v(Number.NaN, Number.NaN));
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
  });
});

describe('edgeDistance', () => {
  it('en el centro es el semieje menor', () => {
    expect(b.edgeDistance(v(0, 0))).toBeCloseTo(HZ, 10);
  });

  it('cero en el borde y en las esquinas', () => {
    expect(b.edgeDistance(v(HX, 0))).toBeCloseTo(0, 10);
    expect(b.edgeDistance(v(0, -HZ))).toBeCloseTo(0, 10);
    expect(b.edgeDistance(v(-HX, HZ))).toBeCloseTo(0, 10);
  });

  it('negativa fuera', () => {
    expect(b.edgeDistance(v(HX + 0.05, 0))).toBeCloseTo(-0.05, 10);
    expect(b.edgeDistance(v(0, HZ + 0.02))).toBeLessThan(0);
  });

  it('coherente con contains(p, r): dentro ⇔ edgeDistance ≥ r', () => {
    const r = 0.04;
    for (let i = 0; i < 200; i++) {
      const p = v(Math.sin(i * 1.7) * 0.6, Math.cos(i * 2.3) * 0.45);
      expect(b.contains(p, r)).toBe(b.edgeDistance(p) >= r - 1e-12);
    }
  });

  it('simétrica respecto a los ejes', () => {
    const d = b.edgeDistance(v(0.2, 0.1));
    expect(b.edgeDistance(v(-0.2, 0.1))).toBeCloseTo(d, 12);
    expect(b.edgeDistance(v(0.2, -0.1))).toBeCloseTo(d, 12);
  });
});
