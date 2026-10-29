// Brazo robótico del Taller (brief §6.8): cinemática del plano y coreografía de la demostración.
import { describe, expect, it } from 'vitest';
import { ARM_GEOMETRY, DEMO, demoKeys, reachDown, samplePose, tcpPosition, type ArmPose } from '../../src/experiences/taller/logic/arm';

// Límites de los ejes en tools/models/build/robot_arm.mjs (grados).
const LIMITS: [number, number][] = [[-170, 170], [-10, 95], [-60, 150], [-180, 180], [-120, 120], [-180, 180]];

describe('brazo: cinemática', () => {
  it('la pose 0 deja la pinza al frente, a la altura del codo', () => {
    const p = tcpPosition([0, 0, 0, 0, 0, 0], { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(ARM_GEOMETRY.shoulderY + ARM_GEOMETRY.upper, 6);
    expect(p.z).toBeCloseTo(ARM_GEOMETRY.fore + ARM_GEOMETRY.tool, 6);
  });

  it.each([
    [0.13, 0.015],
    [0.13, 0.07],
    [0.1, 0.03],
    [0.16, 0.05],
  ])('reachDown(%s, %s) lleva la pinza al punto, apuntando hacia abajo', (reach, height) => {
    const sol = reachDown(reach, height);
    expect(sol).not.toBeNull();
    const [t2, t3, t5] = sol!;
    expect(t2 + t3 + t5).toBeCloseTo(90, 6); // herramienta vertical hacia abajo
    for (const yaw of [-55, 0, 55]) {
      const p = tcpPosition([yaw, t2, t3, 0, t5, 0], { x: 0, y: 0, z: 0 });
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(reach, 6);
      expect(p.y).toBeCloseTo(height, 6);
    }
  });

  it('fuera de alcance devuelve null', () => {
    expect(reachDown(0.5, 0)).toBeNull();
  });
});

describe('brazo: demostración', () => {
  const keys = demoKeys(DEMO.yaw, -DEMO.yaw);

  it('empieza y termina en la pose 0, con tiempos crecientes', () => {
    expect(keys[0]!.pose).toEqual([0, 0, 0, 0, 0, 0]);
    expect(keys[keys.length - 1]!.pose).toEqual([0, 0, 0, 0, 0, 0]);
    for (let i = 1; i < keys.length; i++) expect(keys[i]!.t).toBeGreaterThan(keys[i - 1]!.t);
  });

  it('agarra una vez y suelta una vez, con la pinza sobre la esfera', () => {
    const grab = keys.filter((k) => k.event === 'grab');
    const release = keys.filter((k) => k.event === 'release');
    expect(grab).toHaveLength(1);
    expect(release).toHaveLength(1);
    const at = (k: (typeof keys)[number]) => tcpPosition(k.pose, { x: 0, y: 0, z: 0 });
    const g = at(grab[0]!);
    expect(g.x).toBeCloseTo(DEMO.reach * Math.sin((DEMO.yaw * Math.PI) / 180), 6);
    expect(g.z).toBeCloseTo(DEMO.reach * Math.cos((DEMO.yaw * Math.PI) / 180), 6);
    const r = at(release[0]!);
    expect(r.x).toBeCloseTo(-g.x, 6);
    expect(r.z).toBeCloseTo(g.z, 6);
  });

  it('ninguna pose pasa los límites de los ejes ni baja la pinza bajo el tope', () => {
    const pose: ArmPose = [0, 0, 0, 0, 0, 0];
    const end = keys[keys.length - 1]!.t;
    for (let t = 0; t <= end; t += 0.05) {
      samplePose(keys, t, pose);
      pose.forEach((a, i) => {
        expect(a).toBeGreaterThanOrEqual(LIMITS[i]![0]);
        expect(a).toBeLessThanOrEqual(LIMITS[i]![1]);
      });
      expect(tcpPosition(pose, { x: 0, y: 0, z: 0 }).y).toBeGreaterThan(DEMO.grabY - 1e-6);
    }
  });
});
