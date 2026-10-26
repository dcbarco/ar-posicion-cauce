// F1 — Cosmos: src/core/sim/nbody.ts (brief, sección 8). Plantilla lista: se salta hasta que el módulo exista
// y exporte la API propuesta en PEDIDOS (P-006). Si A1 elige otra API, se adapta solo el adaptador `load()`.
//
// Hechos del brief que se verifican:
//  - GM del Sol = 0,0037 m³/s² de juego → órbita circular a 15 cm con periodo de 6 s.
//  - Leapfrog (velocity-Verlet), paso fijo 1/240 s, suavizado ε = 1 cm, máx. 12 cuerpos.
//  - Órbita circular a 15 cm ≥ 60 s con deriva de radio < 2 %. Determinismo. Energía acotada.
//  - Masas de prueba (satélite, sonda, cohete, cometa) sienten la gravedad pero no atraen.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { abs } from '../helpers/repo';

/** API esperada (propuesta P-006). */
interface BodyInit {
  id: string;
  mass: number; // masa relativa (Sol = 1)
  radius: number; // m
  x: number;
  z: number;
  vx: number;
  vz: number;
  testMass?: boolean;
}
interface NBodySim {
  readonly bodies: readonly (BodyInit & { alive?: boolean })[];
  add(b: BodyInit): void;
  /** Avanza `seconds` de tiempo de juego en pasos fijos internos. */
  step(seconds: number): void;
  /** Energía mecánica total (cinética + potencial suavizada) de los cuerpos que atraen y los de prueba. */
  totalEnergy(): number;
}
interface NBodyModule {
  NBODY: { G: number; dt: number; softening: number; maxBodies: number };
  createNBody(opts?: Partial<{ G: number; dt: number; softening: number; maxBodies: number }>): NBodySim;
}

const PATH = abs('src', 'core', 'sim', 'nbody.ts');
const exists = existsSync(PATH);

async function load(): Promise<NBodyModule | null> {
  const spec = '../../src/core/sim/nbody.ts'; // variable: tsc no exige que exista
  const mod = (await import(/* @vite-ignore */ spec)) as Partial<NBodyModule>;
  if (typeof mod.createNBody !== 'function' || !mod.NBODY) {
    console.warn('[QA] nbody.ts existe pero no expone { NBODY, createNBody }: ajustar adaptador de pruebas (P-006)');
    return null;
  }
  return mod as NBodyModule;
}

const GM = 0.0037;
const EPS = 0.01;
const R = 0.15;
/** Velocidad circular con potencial suavizado de Plummer: v² = GM r² / (r² + ε²)^{3/2}. */
const vCirc = (r: number, eps = EPS) => Math.sqrt((GM * r * r) / Math.pow(r * r + eps * eps, 1.5));

function sunAndSatellite(m: NBodyModule): NBodySim {
  const sim = m.createNBody();
  sim.add({ id: 'sun', mass: 1, radius: 0.03, x: 0, z: 0, vx: 0, vz: 0 });
  sim.add({ id: 'sat', mass: 0.0001, radius: 0.005, x: R, z: 0, vx: 0, vz: vCirc(R), testMass: true });
  return sim;
}

const byId = (sim: NBodySim, id: string) => {
  const b = sim.bodies.find((x) => x.id === id);
  if (!b) throw new Error(`no existe el cuerpo ${id}`);
  return b;
};

describe.skipIf(!exists)('Cosmos — nbody.ts', () => {
  it('constantes del brief', async () => {
    const m = await load();
    if (!m) return;
    expect(m.NBODY.G).toBeCloseTo(GM, 10);
    expect(m.NBODY.dt).toBeCloseTo(1 / 240, 12);
    expect(m.NBODY.softening).toBeCloseTo(0.01, 10);
    expect(m.NBODY.maxBodies).toBe(12);
  });

  it('la órbita circular a 15 cm tiene periodo ≈ 6 s (ancla del brief)', () => {
    // Sin suavizado: T = 2π √(r³/GM) = 6,0 s.
    expect(2 * Math.PI * Math.sqrt(R ** 3 / GM)).toBeCloseTo(6, 1);
  });

  it('órbita circular a 15 cm estable ≥ 60 s con deriva de radio < 2 %', async () => {
    const m = await load();
    if (!m) return;
    const sim = sunAndSatellite(m);
    let maxDev = 0;
    for (let i = 0; i < 60 * 10; i++) {
      sim.step(0.1);
      const s = byId(sim, 'sun');
      const p = byId(sim, 'sat');
      const r = Math.hypot(p.x - s.x, p.z - s.z);
      maxDev = Math.max(maxDev, Math.abs(r - R) / R);
    }
    expect(maxDev).toBeLessThan(0.02);
  });

  it('completa ~10 vueltas en 60 s (periodo ≈ 6 s)', async () => {
    const m = await load();
    if (!m) return;
    const sim = sunAndSatellite(m);
    let angle = 0;
    let prev = Math.atan2(byId(sim, 'sat').z, byId(sim, 'sat').x);
    for (let i = 0; i < 600; i++) {
      sim.step(0.1);
      const p = byId(sim, 'sat');
      const a = Math.atan2(p.z, p.x);
      let d = a - prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      angle += d;
      prev = a;
    }
    // Con ε = 1 cm el periodo es ~0,3 % mayor que 6 s.
    expect(Math.abs(angle) / (2 * Math.PI)).toBeGreaterThan(9.8);
    expect(Math.abs(angle) / (2 * Math.PI)).toBeLessThan(10.1);
  });

  it('determinismo: la misma entrada produce exactamente la misma trayectoria', async () => {
    const m = await load();
    if (!m) return;
    const run = () => {
      const sim = m.createNBody();
      sim.add({ id: 'a', mass: 1, radius: 0.03, x: -0.05, z: 0, vx: 0, vz: -0.04 });
      sim.add({ id: 'b', mass: 0.4, radius: 0.02, x: 0.1, z: 0, vx: 0, vz: 0.1 });
      sim.add({ id: 'c', mass: 0.004, radius: 0.01, x: 0.25, z: 0.05, vx: -0.05, vz: 0.1 });
      sim.add({ id: 'p', mass: 0.0001, radius: 0.005, x: -0.2, z: -0.2, vx: 0.08, vz: 0, testMass: true });
      const trace: number[] = [];
      for (let i = 0; i < 300; i++) {
        sim.step(1 / 30);
        for (const b of sim.bodies) trace.push(b.x, b.z, b.vx, b.vz);
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it('el resultado no depende de cómo se trocea el tiempo (paso fijo interno)', async () => {
    const m = await load();
    if (!m) return;
    const a = sunAndSatellite(m);
    const b = sunAndSatellite(m);
    for (let i = 0; i < 240; i++) a.step(1 / 60); // 4 s en frames de 60 Hz
    for (let i = 0; i < 160; i++) b.step(1 / 40); // 4 s en frames de 40 Hz
    const pa = byId(a, 'sat');
    const pb = byId(b, 'sat');
    expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeLessThan(1e-6);
  });

  it('energía acotada: deriva relativa < 1 % en 60 s (Sol + Tierra + Luna)', async () => {
    const m = await load();
    if (!m) return;
    const sim = m.createNBody();
    sim.add({ id: 'sun', mass: 1, radius: 0.03, x: 0, z: 0, vx: 0, vz: 0 });
    sim.add({ id: 'earth', mass: 0.004, radius: 0.01, x: 0.2, z: 0, vx: 0, vz: vCirc(0.2) });
    sim.add({ id: 'mars', mass: 0.002, radius: 0.008, x: -0.28, z: 0, vx: 0, vz: -vCirc(0.28) });
    const e0 = sim.totalEnergy();
    let maxRel = 0;
    for (let i = 0; i < 600; i++) {
      sim.step(0.1);
      maxRel = Math.max(maxRel, Math.abs((sim.totalEnergy() - e0) / e0));
    }
    expect(maxRel).toBeLessThan(0.01);
  });

  it('las masas de prueba no atraen a los demás', async () => {
    const m = await load();
    if (!m) return;
    const sim = m.createNBody();
    sim.add({ id: 'earth', mass: 0.004, radius: 0.01, x: 0, z: 0, vx: 0, vz: 0 });
    sim.add({ id: 'probe', mass: 10, radius: 0.005, x: 0.05, z: 0, vx: 0, vz: 0, testMass: true });
    sim.step(1);
    const e = byId(sim, 'earth');
    expect(e.x).toBe(0);
    expect(e.z).toBe(0);
  });

  it('no admite más de 12 cuerpos', async () => {
    const m = await load();
    if (!m) return;
    const sim = m.createNBody();
    for (let i = 0; i < 15; i++) {
      try {
        sim.add({ id: `b${i}`, mass: 0.001, radius: 0.005, x: (i - 7) * 0.05, z: 0, vx: 0, vz: 0 });
      } catch {
        /* rechazar con excepción también es válido */
      }
    }
    expect(sim.bodies.filter((b) => b.alive !== false).length).toBeLessThanOrEqual(12);
  });

  it.todo('colisión: fusión inelástica conserva el momento lineal y la masa (si no absorbe un Sol/agujero negro)');
  it.todo('predicción de trayectoria: 3 s ≤ 600 pasos y coincide con la simulación real (mismo integrador)');
  it.todo('universo cerrado: rebote en el borde LED invierte la componente normal de la velocidad');
  it.todo('universo abierto: al cruzar el borde el cuerpo queda fuera y suma al contador "perdidos"');
  it.todo('escape: energía total > 0 ⇔ el cohete escapa');
});

describe.skipIf(exists)('Cosmos — nbody.ts (pendiente)', () => {
  it.todo('src/core/sim/nbody.ts aún no existe (A1, F2)');
});
