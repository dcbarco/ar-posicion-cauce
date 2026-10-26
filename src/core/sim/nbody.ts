// Gravedad y Cosmos (sección 8): N cuerpos en el plano X–Z del tope, en UNIDADES DE JUEGO.
// Integrador leapfrog (velocity-Verlet, kick-drift-kick) con paso fijo y suavizado de Plummer.
// Lógica pura y determinista: sin Three.js ni DOM. API acordada en P-006.

export const NBODY = {
  /** GM del Sol (m³/s² de juego): órbita circular a 15 cm ≈ 6 s. Masas relativas al Sol. */
  G: 0.0037,
  dt: 1 / 240,
  softening: 0.01,
  maxBodies: 12,
} as const;

export interface BodyInit {
  id: string;
  /** Masa relativa (Sol = 1). */
  mass: number;
  /** Radio visual y de colisión (m). */
  radius: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Siente la gravedad pero no atrae (satélite, sonda, cohete, cometa). */
  testMass?: boolean;
  /** Absorbe cuerpos pequeños al chocar sin fusionarse en uno nuevo (Sol, agujero negro). */
  absorber?: boolean;
  /** En espera: no se mueve ni siente gravedad hasta lanzarlo (sí atrae si no es de prueba). */
  held?: boolean;
}

export interface Body extends BodyInit {
  alive: boolean;
  ax: number;
  az: number;
}

export type BoundaryMode = 'closed' | 'open' | 'none';

export type NBodyEvent =
  | { type: 'merge'; survivor: string; absorbed: string; x: number; z: number }
  | { type: 'bounce'; id: string; x: number; z: number }
  | { type: 'lost'; id: string; x: number; z: number };

export interface NBodyOptions {
  G: number;
  dt: number;
  softening: number;
  maxBodies: number;
  /** Semiejes del rectángulo de rebote/pérdida (m). Por defecto, el área útil de la mesa. */
  bounds: { hx: number; hz: number };
  boundary: BoundaryMode;
  /** Colisiones activadas (fusión inelástica). */
  collisions: boolean;
}

export interface NBodySim {
  readonly bodies: readonly Body[];
  readonly options: NBodyOptions;
  /** Cuerpos perdidos en el espacio (universo abierto). */
  readonly lostCount: number;
  add(b: BodyInit): Body;
  remove(id: string): void;
  get(id: string): Body | undefined;
  /** Avanza `seconds` de tiempo de juego en pasos fijos internos (acumulador). */
  step(seconds: number, onEvent?: (e: NBodyEvent) => void): void;
  /** Energía mecánica total (cinética + potencial suavizada). */
  totalEnergy(): number;
  /** Energía específica de un cuerpo respecto a los que atraen (>0 ⇒ escapa). */
  specificEnergy(id: string): number;
  /**
   * Predice la trayectoria de `id` durante `seconds` (≤ 600 pasos) suponiendo velocidad (vx, vz),
   * sin modificar la simulación. Escribe pares x,z en `out` y devuelve cuántos puntos escribió.
   */
  predict(id: string, vx: number, vz: number, seconds: number, out: Float32Array, maxSteps?: number): number;
  setBoundary(mode: BoundaryMode): void;
  clear(): void;
}

export function createNBody(opts: Partial<NBodyOptions> = {}): NBodySim {
  const o: NBodyOptions = {
    G: opts.G ?? NBODY.G,
    dt: opts.dt ?? NBODY.dt,
    softening: opts.softening ?? NBODY.softening,
    maxBodies: opts.maxBodies ?? NBODY.maxBodies,
    bounds: opts.bounds ?? { hx: 0.46, hz: 0.31 },
    boundary: opts.boundary ?? 'none',
    collisions: opts.collisions ?? false,
  };
  const eps2 = o.softening * o.softening;
  const bodies: Body[] = [];
  let acc = 0;
  let lost = 0;

  /** Aceleraciones de todos los cuerpos vivos (sin asignaciones). */
  const accelerate = () => {
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const b = bodies[i]!;
      b.ax = 0;
      b.az = 0;
    }
    for (let i = 0; i < n; i++) {
      const bi = bodies[i]!;
      if (!bi.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const bj = bodies[j]!;
        if (!bj.alive) continue;
        const dx = bj.x - bi.x;
        const dz = bj.z - bi.z;
        const r2 = dx * dx + dz * dz + eps2;
        const inv = 1 / (r2 * Math.sqrt(r2));
        if (!bj.testMass) {
          const k = o.G * bj.mass * inv;
          bi.ax += k * dx;
          bi.az += k * dz;
        }
        if (!bi.testMass) {
          const k = o.G * bi.mass * inv;
          bj.ax -= k * dx;
          bj.az -= k * dz;
        }
      }
    }
  };

  const fixedStep = (onEvent?: (e: NBodyEvent) => void) => {
    const h = o.dt;
    // kick (½) – drift – recalcular – kick (½). Las aceleraciones vienen del paso anterior.
    for (const b of bodies) {
      if (!b.alive || b.held) continue;
      b.vx += 0.5 * h * b.ax;
      b.vz += 0.5 * h * b.az;
      b.x += h * b.vx;
      b.z += h * b.vz;
    }
    accelerate();
    for (const b of bodies) {
      if (!b.alive || b.held) continue;
      b.vx += 0.5 * h * b.ax;
      b.vz += 0.5 * h * b.az;
    }
    if (o.collisions) collide(onEvent);
    if (o.boundary !== 'none') edges(onEvent);
  };

  const collide = (onEvent?: (e: NBodyEvent) => void) => {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        if (!b.alive) continue;
        const rr = a.radius + b.radius;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (dx * dx + dz * dz > rr * rr) continue;
        // Sobrevive el absorbente o el más masivo; fusión inelástica (conserva masa y momento).
        const keepA = a.absorber && !b.absorber ? true : b.absorber && !a.absorber ? false : a.mass >= b.mass;
        const s = keepA ? a : b;
        const d = keepA ? b : a;
        const m = s.mass + d.mass;
        if (!d.testMass && !s.testMass) {
          s.vx = (s.vx * s.mass + d.vx * d.mass) / m;
          s.vz = (s.vz * s.mass + d.vz * d.mass) / m;
          if (!s.absorber) {
            s.x = (s.x * s.mass + d.x * d.mass) / m;
            s.z = (s.z * s.mass + d.z * d.mass) / m;
            s.radius = Math.cbrt(s.radius ** 3 + d.radius ** 3);
          }
          s.mass = m;
        }
        d.alive = false;
        onEvent?.({ type: 'merge', survivor: s.id, absorbed: d.id, x: d.x, z: d.z });
        if (d === a) break;
      }
    }
  };

  const edges = (onEvent?: (e: NBodyEvent) => void) => {
    const { hx, hz } = o.bounds;
    for (const b of bodies) {
      if (!b.alive || b.held) continue;
      if (o.boundary === 'closed') {
        let hit = false;
        const lx = hx - b.radius;
        const lz = hz - b.radius;
        if (b.x > lx || b.x < -lx) {
          b.x = Math.sign(b.x) * lx;
          b.vx = -b.vx;
          hit = true;
        }
        if (b.z > lz || b.z < -lz) {
          b.z = Math.sign(b.z) * lz;
          b.vz = -b.vz;
          hit = true;
        }
        if (hit) onEvent?.({ type: 'bounce', id: b.id, x: b.x, z: b.z });
      } else if (Math.abs(b.x) > hx + b.radius || Math.abs(b.z) > hz + b.radius) {
        b.alive = false;
        lost++;
        onEvent?.({ type: 'lost', id: b.id, x: b.x, z: b.z });
      }
    }
  };

  const sim: NBodySim = {
    bodies,
    options: o,
    get lostCount() {
      return lost;
    },
    add(init) {
      const live = bodies.filter((b) => b.alive).length;
      if (live >= o.maxBodies) throw new Error(`máximo ${o.maxBodies} cuerpos`);
      // Se reaprovechan los huecos de cuerpos muertos para no crecer sin límite.
      const dead = bodies.findIndex((b) => !b.alive);
      const b: Body = { ...init, alive: true, ax: 0, az: 0 };
      if (dead >= 0) bodies[dead] = b;
      else bodies.push(b);
      accelerate();
      return b;
    },
    remove(id) {
      const b = bodies.find((x) => x.id === id && x.alive);
      if (b) b.alive = false;
      accelerate();
    },
    get(id) {
      return bodies.find((b) => b.id === id && b.alive);
    },
    step(seconds, onEvent) {
      acc += seconds;
      // Tolerancia para que 1/60 × 4 = 1/240 × 16 no pierda un paso por redondeo.
      while (acc >= o.dt - 1e-12) {
        fixedStep(onEvent);
        acc -= o.dt;
      }
    },
    totalEnergy() {
      let e = 0;
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i]!;
        if (!a.alive) continue;
        e += 0.5 * a.mass * (a.vx * a.vx + a.vz * a.vz);
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j]!;
          if (!b.alive || (a.testMass && b.testMass)) continue;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          e -= (o.G * a.mass * b.mass) / Math.sqrt(dx * dx + dz * dz + eps2);
        }
      }
      return e;
    },
    specificEnergy(id) {
      const p = sim.get(id);
      if (!p) return 0;
      let e = 0.5 * (p.vx * p.vx + p.vz * p.vz);
      for (const b of bodies) {
        if (b === p || !b.alive || b.testMass) continue;
        const dx = b.x - p.x;
        const dz = b.z - p.z;
        e -= (o.G * b.mass) / Math.sqrt(dx * dx + dz * dz + eps2);
      }
      return e;
    },
    predict(id, vx, vz, seconds, out, maxSteps = 600) {
      const p = sim.get(id);
      if (!p) return 0;
      // Se integra solo el cuerpo predicho en el campo de los demás congelados: barato (< 2 ms) y
      // suficiente para apuntar la honda. 3 s caben en ≤ 600 pasos (h = 5 ms).
      const h = Math.max(o.dt, seconds / maxSteps);
      const steps = Math.min(maxSteps, Math.ceil(seconds / h), Math.floor(out.length / 2));
      let x = p.x;
      let z = p.z;
      let vx2 = vx;
      let vz2 = vz;
      let n = 0;
      for (let s = 0; s < steps; s++) {
        let ax = 0;
        let az = 0;
        for (const b of bodies) {
          if (b === p || !b.alive || b.testMass) continue;
          const dx = b.x - x;
          const dz = b.z - z;
          const r2 = dx * dx + dz * dz + eps2;
          const k = (o.G * b.mass) / (r2 * Math.sqrt(r2));
          ax += k * dx;
          az += k * dz;
        }
        vx2 += h * ax;
        vz2 += h * az;
        x += h * vx2;
        z += h * vz2;
        out[n * 2] = x;
        out[n * 2 + 1] = z;
        n++;
        if (o.boundary === 'open' && (Math.abs(x) > o.bounds.hx || Math.abs(z) > o.bounds.hz)) break;
      }
      return n;
    },
    setBoundary(mode) {
      o.boundary = mode;
    },
    clear() {
      bodies.length = 0;
      acc = 0;
      lost = 0;
    },
  };
  return sim;
}

/** Velocidad de órbita circular alrededor de una masa `mass` a distancia r (con suavizado). */
export function circularSpeed(mass: number, r: number, G: number = NBODY.G, softening: number = NBODY.softening): number {
  return Math.sqrt((G * mass * r * r) / Math.pow(r * r + softening * softening, 1.5));
}
