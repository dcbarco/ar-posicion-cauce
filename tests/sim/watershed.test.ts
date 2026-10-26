// F1 — Cuenca Viva: src/core/sim/watershed.ts (brief, sección 7; D13, D14). Plantilla lista: se salta
// hasta que el módulo exista con la API propuesta en PEDIDOS (P-006). Los pesos viven en
// src/experiences/cuenca/logic/rules.json; las pruebas usan las reglas reales, no números inventados.
//
// Casos de aceptación del brief:
//  (A) solo naturaleza → calidad y biodiversidad ≥ 80 con bienestar bajo;
//  (B) ciudad + industria sin PTAR → calidad < 30 aguas abajo;
//  (C) una represa → energía sube y biodiversidad baja.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abs } from '../helpers/repo';

type TokenKind = 'paramo' | 'bosque' | 'humedal' | 'cultivo' | 'ciudad' | 'industria' | 'represa' | 'ptar';
interface Token {
  kind: TokenKind;
  x: number; // m, mesa local
  z: number;
}
interface Indicators {
  flow: number; // Caudal 0–100
  quality: number; // Calidad del agua 0–100 (al final de la cuenca)
  biodiversity: number;
  wellbeing: number;
  energy: number; // interno (D13)
}
interface WatershedModule {
  /** Terreno de prueba 100×70 determinista (pendiente del nacimiento X=-0,45 a la salida X=+0,50). */
  createTestTerrain(): { w: number; h: number; heights: Float32Array };
  simulate(input: {
    terrain: { w: number; h: number; heights: Float32Array };
    tokens: Token[];
    climate?: number; // -1 sequía … 0 normal … +1 lluvia
    rules?: unknown;
  }): { indicators: Indicators; mainChannel: Uint8Array };
}

const exists = existsSync(abs('src', 'core', 'sim', 'watershed.ts'));

async function load(): Promise<WatershedModule | null> {
  const spec = '../../src/core/sim/watershed.ts';
  const mod = (await import(/* @vite-ignore */ spec)) as Partial<WatershedModule>;
  if (typeof mod.simulate !== 'function' || typeof mod.createTestTerrain !== 'function') {
    console.warn('[QA] watershed.ts existe pero no expone { simulate, createTestTerrain }: ajustar adaptador (P-006)');
    return null;
  }
  return mod as WatershedModule;
}

/** Posiciones fuera del cauce: franja z = ±0,2 m. Aguas arriba = x negativo. */
const UP = -0.3;
const MID = 0;

describe.skipIf(!exists)('Cuenca — watershed.ts', () => {
  it('caso A: solo naturaleza → calidad y biodiversidad ≥ 80, bienestar bajo', async () => {
    const m = await load();
    if (!m) return;
    const terrain = m.createTestTerrain();
    const tokens: Token[] = [
      { kind: 'paramo', x: -0.4, z: 0.2 },
      { kind: 'paramo', x: -0.4, z: -0.2 },
      { kind: 'bosque', x: UP, z: 0.2 },
      { kind: 'bosque', x: UP, z: -0.2 },
      { kind: 'humedal', x: MID, z: 0.2 },
    ];
    const { indicators } = m.simulate({ terrain, tokens });
    expect(indicators.quality).toBeGreaterThanOrEqual(80);
    expect(indicators.biodiversity).toBeGreaterThanOrEqual(80);
    expect(indicators.wellbeing).toBeLessThan(40);
  });

  it('caso B: ciudad + industria sin PTAR → calidad < 30 aguas abajo', async () => {
    const m = await load();
    if (!m) return;
    const terrain = m.createTestTerrain();
    const { indicators } = m.simulate({
      terrain,
      tokens: [
        { kind: 'ciudad', x: UP, z: 0.2 },
        { kind: 'industria', x: UP, z: -0.2 },
      ],
    });
    expect(indicators.quality).toBeLessThan(30);
  });

  it('caso B′: la misma carga con PTAR aguas abajo de ellas mejora la calidad', async () => {
    const m = await load();
    if (!m) return;
    const terrain = m.createTestTerrain();
    const base: Token[] = [
      { kind: 'ciudad', x: UP, z: 0.2 },
      { kind: 'industria', x: UP, z: -0.2 },
    ];
    const without = m.simulate({ terrain, tokens: base }).indicators.quality;
    const withPtar = m.simulate({ terrain, tokens: [...base, { kind: 'ptar', x: UP + 0.1, z: 0.1 }] }).indicators.quality;
    expect(withPtar).toBeGreaterThan(without);
  });

  it('caso C: una represa → energía sube y biodiversidad baja', async () => {
    const m = await load();
    if (!m) return;
    const terrain = m.createTestTerrain();
    const before = m.simulate({ terrain, tokens: [] }).indicators;
    const after = m.simulate({ terrain, tokens: [{ kind: 'represa', x: MID, z: 0 }] }).indicators;
    expect(after.energy).toBeGreaterThan(before.energy);
    expect(after.biodiversity).toBeLessThan(before.biodiversity);
  });

  it('determinismo: mismas fichas → mismos indicadores y mismo cauce', async () => {
    const m = await load();
    if (!m) return;
    const terrain = m.createTestTerrain();
    const tokens: Token[] = [
      { kind: 'cultivo', x: -0.1, z: 0.2 },
      { kind: 'ciudad', x: 0.1, z: -0.2 },
    ];
    const a = m.simulate({ terrain, tokens });
    const b = m.simulate({ terrain, tokens });
    expect(a.indicators).toEqual(b.indicators);
    expect(Array.from(a.mainChannel)).toEqual(Array.from(b.mainChannel));
  });

  it('indicadores dentro de 0–100', async () => {
    const m = await load();
    if (!m) return;
    const terrain = m.createTestTerrain();
    const all: TokenKind[] = ['paramo', 'bosque', 'humedal', 'cultivo', 'ciudad', 'industria', 'represa', 'ptar'];
    const tokens = all.flatMap((kind, i) => [
      { kind, x: -0.4 + i * 0.1, z: 0.2 },
      { kind, x: -0.4 + i * 0.1, z: -0.2 },
    ]);
    const { indicators } = m.simulate({ terrain, tokens });
    for (const v of Object.values(indicators)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('recalcular con 24 fichas tarda < 200 ms (criterio de aceptación)', async () => {
    const m = await load();
    if (!m) return;
    const terrain = m.createTestTerrain();
    const tokens: Token[] = Array.from({ length: 24 }, (_, i) => ({
      kind: (['bosque', 'cultivo', 'ciudad', 'humedal'] as const)[i % 4] as TokenKind,
      x: -0.42 + (i % 8) * 0.11,
      z: i < 12 ? 0.22 : -0.22,
    }));
    const t0 = performance.now();
    m.simulate({ terrain, tokens });
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it.todo('D8: el cauce principal nace cerca de X = −0,45 y sale por el borde X = +0,50');
  it.todo('una ficha no se puede poner sobre el cauce (salvo la represa)');
  it.todo('humedal descuenta ~60 % de la carga que lo cruza; PTAR ~80 % dentro de su radio');
  it.todo('el páramo solo se admite en cotas altas');
  it.todo('time-lapse de 50 años con semilla fija es determinista');
  it.todo('el informe genera 2–3 causas/efectos ligados a ids de rules.json con plantillas existentes en cuenca.json');
});

describe.skipIf(exists)('Cuenca — watershed.ts (pendiente)', () => {
  it.todo('src/core/sim/watershed.ts aún no existe (A1, F2)');
});
