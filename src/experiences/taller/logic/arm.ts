// Taller — brazo robótico de 6 ejes: cinemática del plano vertical y coreografía de la demostración
// (recoger y dejar una esfera, brief §6.8). Lógica pura (sin Three.js), en grados y metros.
//
// Convención (ver tools/models/build/robot_arm.mjs): todas las articulaciones en el plano x = 0;
// pose 0 = brazo vertical y antebrazo + pinza hacia +Z. Ejes 2, 3 y 5 giran sobre +X: un ángulo positivo
// inclina hacia +Z (adelante y abajo). El eje 1 gira sobre +Y: lleva +Z hacia +X con ángulos positivos.

export interface ArmGeometry {
  /** Altura del hombro (eje 2) sobre la base (m). */
  shoulderY: number;
  /** Hombro → codo (m). */
  upper: number;
  /** Codo → muñeca, a lo largo del antebrazo (m). */
  fore: number;
  /** Muñeca → centro de los dedos (m). */
  tool: number;
}

export const ARM_GEOMETRY: ArmGeometry = { shoulderY: 0.105, upper: 0.12, fore: 0.08, tool: 0.043 };

/** Seis ángulos (grados), del eje 1 al 6. */
export type ArmPose = [number, number, number, number, number, number];

export interface DemoKey {
  t: number; // s desde el inicio de la corrida
  pose: ArmPose;
  /** Apertura de la pinza: 0 cerrada, 0,5 sobre la esfera, 1 abierta. */
  grip: number;
  /** Evento al llegar a esta clave. */
  event?: 'grab' | 'release';
}

const RAD = Math.PI / 180;

/**
 * Ángulos de hombro, codo y muñeca (ejes 2, 3 y 5) para llevar el centro de los dedos a una distancia
 * `reach` del eje 1 y a una altura `height`, con la pinza apuntando hacia abajo (codo arriba).
 * Devuelve null si el punto está fuera de alcance.
 */
export function reachDown(reach: number, height: number, g: ArmGeometry = ARM_GEOMETRY): [number, number, number] | null {
  // Centro de la muñeca: la pinza apunta hacia abajo, así que está `tool` por encima del objetivo.
  const dx = reach;
  const dy = height + g.tool - g.shoulderY;
  const d = (dx * dx + dy * dy - g.upper * g.upper - g.fore * g.fore) / (2 * g.upper * g.fore);
  if (!(d >= -1 && d <= 1)) return null;
  const gamma = -Math.acos(d); // ángulo relativo antebrazo/brazo; negativo = codo arriba
  const b1 = Math.atan2(dy, dx) - Math.atan2(g.fore * Math.sin(gamma), g.upper + g.fore * Math.cos(gamma));
  const t2 = 90 - b1 / RAD;
  const t3 = -gamma / RAD - 90;
  const t5 = 90 - t2 - t3;
  return [t2, t3, t5];
}

/**
 * Posición (m) del centro de los dedos para una pose, en el marco del modelo. Escribe en `out`.
 * Cinemática directa del plano: la usa la prueba para comprobar `reachDown` (el giro del eje 4 y el 6
 * no mueven el centro de los dedos porque están sobre el eje de la herramienta).
 */
export function tcpPosition(pose: ArmPose, out: { x: number; y: number; z: number }, g: ArmGeometry = ARM_GEOMETRY) {
  const [t1, t2, t3, , t5] = pose;
  const a2 = t2 * RAD, a3 = (t2 + t3) * RAD, a5 = (t2 + t3 + t5) * RAD;
  // En el plano (adelante, arriba): brazo = (sin a2, cos a2); antebrazo = (cos a3, −sin a3); herramienta = (cos a5, −sin a5).
  const fwd = g.upper * Math.sin(a2) + g.fore * Math.cos(a3) + g.tool * Math.cos(a5);
  const up = g.shoulderY + g.upper * Math.cos(a2) - g.fore * Math.sin(a3) - g.tool * Math.sin(a5);
  out.x = fwd * Math.sin(t1 * RAD);
  out.y = up;
  out.z = fwd * Math.cos(t1 * RAD);
  return out;
}

export const DEMO = {
  /** Distancia al eje 1 de los dos puntos donde se deja la esfera (m). */
  reach: 0.13,
  /** Giro del eje 1 de cada punto (grados). */
  yaw: 55,
  /** Altura del centro de los dedos al agarrar (m) y al pasar por encima. */
  grabY: 0.015,
  hoverY: 0.07,
  sphereR: 0.012,
} as const;

/**
 * Coreografía de una corrida: desde la pose 0, recoge la esfera en el giro `fromYaw` y la deja en `toYaw`,
 * y vuelve a la pose 0. Unos 8 s a velocidad 1. Lanza si algún punto no está al alcance.
 */
export function demoKeys(fromYaw: number, toYaw: number): DemoKey[] {
  const down = reachDown(DEMO.reach, DEMO.grabY);
  const hover = reachDown(DEMO.reach, DEMO.hoverY);
  if (!down || !hover) throw new Error('demostración del brazo: punto fuera de alcance');
  const pose = (yaw: number, [t2, t3, t5]: [number, number, number], twist = 0): ArmPose => [yaw, t2, t3, 0, t5, twist];
  const home: ArmPose = [0, 0, 0, 0, 0, 0];
  return [
    { t: 0, pose: home, grip: 1 },
    { t: 1.3, pose: pose(fromYaw, hover), grip: 1 },
    { t: 2.1, pose: pose(fromYaw, down), grip: 1 },
    { t: 2.6, pose: pose(fromYaw, down), grip: 0.5, event: 'grab' },
    { t: 3.4, pose: pose(fromYaw, hover), grip: 0.5 },
    { t: 4.8, pose: pose(toYaw, hover, 90), grip: 0.5 },
    { t: 5.6, pose: pose(toYaw, down, 90), grip: 0.5 },
    { t: 6.1, pose: pose(toYaw, down, 90), grip: 1, event: 'release' },
    { t: 6.9, pose: pose(toYaw, hover, 90), grip: 1 },
    { t: 8.2, pose: home, grip: 1 },
  ];
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Pose y apertura de la pinza en el instante `t` (s) de la corrida, con transición suave entre claves.
 * Escribe en `out` (sin asignaciones) y devuelve la apertura de la pinza.
 */
export function samplePose(keys: readonly DemoKey[], t: number, out: ArmPose): number {
  const last = keys[keys.length - 1]!;
  if (t >= last.t) {
    for (let i = 0; i < 6; i++) out[i] = last.pose[i]!;
    return last.grip;
  }
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.t <= t) i++;
  const a = keys[i]!, b = keys[i + 1]!;
  const k = smooth(Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))));
  for (let j = 0; j < 6; j++) out[j] = a.pose[j]! + (b.pose[j]! - a.pose[j]!) * k;
  return a.grip + (b.grip - a.grip) * k;
}
