// Brazo robótico de 6 ejes con pinza — modelo procedural propio (Mesa CAUCE, Agente 2).
// Salida: assets-src/taller/robot_arm.src.glb  →  `npm run models:optimize` lo lleva a public/models/taller/.
//
// Marco: metros, Y arriba, frente +Z, origen = centro de la base. Pose de reposo (todos los ejes en 0): brazo
// vertical, antebrazo y pinza hacia +Z. Todas las articulaciones están en el plano x = 0.
// El contrato exige piezas planas (part_* hijos de la escena), así que la cadena cinemática la arma la lógica:
//   · extras.link (0..6) de cada pieza = eslabón al que pertenece (0 = base fija).
//   · extras.finger (±1) en los dedos: se abren a lo largo de X con la pinza.
//   · anchor_joint1..6 = punto de giro, con extras { axis, min, max } (grados).
//   · anchor_tcp = centro entre los dedos (lo que la pinza agarra).
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, circlePts, roundRectPts, shape, extrudeX, lathe, latheZ, ringProf, cylX, cylY, cylZ, box, curveFrom, thickTube, merge, mirrorX, tf } from '../lib/geo.mjs';
import { GlbBuilder } from '../lib/gltf.mjs';
import { benchLayout, deriveOrder, emitParts } from '../lib/hero.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'assets-src/taller/robot_arm.src.glb');
const ID = 'robot_arm';

// ─── Cinemática (m) ───────────────────────────────────────────
const J1Y = 0.05; // giro de la base
const J2Y = 0.105; // hombro
const A = 0.12; // brazo (hombro → codo)
const J3Y = J2Y + A; // codo
const J4Z = 0.03; // giro del antebrazo
const J5Z = 0.08; // muñeca (codo → muñeca = 0,08)
const J6Z = 0.095; // giro de la herramienta
const TCP_Z = 0.123; // centro de los dedos
const JOINTS = [
  { at: [0, J1Y, 0], axis: [0, 1, 0], min: -170, max: 170 },
  { at: [0, J2Y, 0], axis: [1, 0, 0], min: -10, max: 95 },
  { at: [0, J3Y, 0], axis: [1, 0, 0], min: -60, max: 150 },
  { at: [0, J3Y, J4Z], axis: [0, 0, 1], min: -180, max: 180 },
  { at: [0, J3Y, J5Z], axis: [1, 0, 0], min: -120, max: 120 },
  { at: [0, J3Y, J6Z], axis: [0, 0, 1], min: -180, max: 180 },
];

// ─── Materiales (6) ───────────────────────────────────────────
const B = new GlbBuilder(ID, { cauce: { model: ID, author: 'Mesa CAUCE · Agente 2', license: 'own' } });
const M = {
  paint: B.material('pintura_naranja', { color: '#D3632B', metallic: 0.15, roughness: 0.38 }),
  graphite: B.material('grafito', { color: '#34393F', metallic: 0.4, roughness: 0.5 }),
  alu: B.material('aluminio', { color: '#B7BCC3', metallic: 1, roughness: 0.38 }),
  steel: B.material('acero_pulido', { color: '#CFD4DA', metallic: 1, roughness: 0.2 }),
  rubber: B.material('caucho', { color: '#1F2226', metallic: 0, roughness: 0.85 }),
  led: B.material('led_verde', { color: '#41B270', metallic: 0, roughness: 0.3, emissive: '#2E9A5A' }),
};

const parts = [];
function part(id, group, link, requires, items, extra = {}) {
  parts.push({ id, group, link, requires, items, ...extra });
}

// Eslabón 0: base ---------------------------------------------------------------
{
  const plate = lathe([[0, 0], [0.078, 0], [0.08, 0.002], [0.08, 0.01], [0.078, 0.012], [0, 0.012]], 64);
  const bolts = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    return tf.t(cylY(0.0045, 0.012, 0.0155, 6, 0.0004), Math.cos(a) * 0.066, 0, Math.sin(a) * 0.066);
  });
  part('base_plate', 'base', 0, [], [{ g: plate, mat: M.graphite }, { g: merge(bolts), mat: M.steel }]);
  const body = lathe([[0, 0.012], [0.052, 0.012], [0.052, 0.04], [0.046, 0.048], [0, 0.048]], 56);
  const ribs = [];
  for (let i = 0; i < 12; i++) {
    const r = box(0, 0.028, 0.0525, 0.004, 0.022, 0.003, 0.0005);
    r.applyMatrix4(new THREE.Matrix4().makeRotationY((i / 12) * Math.PI * 2 + 0.26));
    ribs.push(r);
  }
  part('base_motor', 'drive', 0, ['base_plate'], [{ g: merge([body, ...ribs]), mat: M.alu }]);
  const led = merge([latheZ([[0, 0.052], [0.0065, 0.052], [0.0065, 0.056], [0, 0.058]], 20)]);
  led.translate(0, 0.03, 0);
  const bezel = tf.t(latheZ(ringProf(0.0065, 0.009, 0.0505, 0.0545, 0.0004), 20), 0, 0.03, 0);
  part('status_light', 'control', 0, ['base_motor'], [{ g: led, mat: M.led }, { g: bezel, mat: M.graphite }]);
}

// Eslabón 1: torreta (gira sobre Y) con horquilla del hombro --------------------------------
{
  const disk = lathe([[0, J1Y], [0.048, J1Y], [0.048, J1Y + 0.016], [0.042, J1Y + 0.022], [0, J1Y + 0.022]], 56);
  const forks = [-1, 1].map((s) => {
    // Recta abajo + media vuelta arriba (los puntos 0 y 12 del círculo cierran con las rectas).
    const plate = extrudeX(shape([[0.03, J1Y + 0.018], ...circlePts(0, J2Y, 0.03, 24).slice(0, 13), [-0.03, J1Y + 0.018]], [circlePts(0, J2Y, 0.006, 16)]), 0.026, 0.036, 0.0015);
    return s > 0 ? plate : mirrorX(plate);
  });
  part('turret', 'structure', 1, ['base_motor'], [{ g: merge([disk, ...forks]), mat: M.paint }]);
  const mot = merge([cylX(0.022, 0.036, 0.062, 40, 0.0015), cylX(0.012, 0.062, 0.068, 24, 0.0008)]);
  part('shoulder_motor', 'drive', 1, ['turret'], [{ g: tf.t(mot, 0, J2Y, 0), mat: M.graphite }]);
}

// Eslabón 2: brazo (gira sobre X en el hombro) ------------------------------------------------
{
  // Viga con extremos redondos (forma en u = −z, v = y): media vuelta abajo en el hombro, arriba en el codo.
  const outline = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI; // media vuelta de abajo
    outline.push([Math.cos(a) * 0.024, J2Y + Math.sin(a) * 0.024]);
  }
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI; // media vuelta de arriba
    outline.push([Math.cos(a) * 0.022, J3Y + Math.sin(a) * 0.022]);
  }
  const arm = extrudeX(shape(outline), -0.019, 0.019, 0.004);
  const hubs = [J2Y, J3Y].map((y) => tf.t(cylX(0.009, -0.026, 0.026, 24, 0.0008), 0, y, 0));
  part('upper_arm', 'structure', 2, ['turret'], [{ g: arm, mat: M.paint }, { g: merge(hubs), mat: M.steel }]);
  const mot = merge([cylX(0.019, -0.058, -0.032, 40, 0.0015), cylX(0.011, -0.064, -0.058, 24, 0.0008)]);
  part('elbow_motor', 'drive', 2, ['upper_arm'], [{ g: tf.t(mot, 0, J3Y, 0), mat: M.graphite }]);
  const c = curveFrom([[0, J2Y + 0.02, -0.03], [0, J2Y + 0.05, -0.029], [0, J3Y - 0.04, -0.029], [0, J3Y - 0.014, -0.027]]);
  const clips = [0.3, 0.7].map((t) => {
    const p = c.getPoint(t);
    return box(p.x, p.y, p.z + 0.004, 0.012, 0.006, 0.006, 0.001);
  });
  part('cable_upper', 'control', 2, ['upper_arm'], [{ g: thickTube(c, 0.0042, 0.0026, 24, 12), mat: M.rubber }, { g: merge(clips), mat: M.graphite }]);
}

// Eslabón 3: carcasa del codo (gira sobre X en el codo) ---------------------------------------
{
  const plates = [-1, 1].map((s) => {
    const p = extrudeX(shape(roundRectPts(-0.012, J3Y, 0.05, 0.046, 0.02, 6), [circlePts(0, J3Y, 0.0095, 18)]), 0.02, 0.029, 0.0012);
    return s > 0 ? p : mirrorX(p);
  });
  const bridge = box(0, J3Y, 0.029, 0.058, 0.04, 0.008, 0.002);
  part('elbow_housing', 'structure', 3, ['upper_arm', 'elbow_motor'], [{ g: merge([...plates, bridge]), mat: M.paint }]);
  const mot = merge([cylZ(0.019, 0.033, 0.042, 40, 0.0012)]);
  part('forearm_motor', 'drive', 3, ['elbow_housing'], [{ g: tf.t(mot, 0, J3Y, 0), mat: M.graphite }]);
}

// Eslabón 4: antebrazo (gira sobre su eje Z) con horquilla de la muñeca --------------------------
{
  const tube = latheZ([[0, 0.042], [0.0165, 0.042], [0.0165, 0.062], [0.012, 0.068], [0, 0.068]], 40);
  // Horquilla de la muñeca (u = −z): placas de z 0,062 a 0,092 con el paso del eje en J5.
  const forks = [-1, 1].map((s) => {
    const p = extrudeX(shape(roundRectPts(-0.077, J3Y, 0.03, 0.03, 0.012, 6), [circlePts(-J5Z, J3Y, 0.004, 12)]), 0.015, 0.021, 0.001);
    return s > 0 ? p : mirrorX(p);
  });
  part('forearm', 'structure', 4, ['forearm_motor'], [{ g: tf.t(tube, 0, J3Y, 0), mat: M.paint }, { g: merge(forks), mat: M.paint }]);
  const mot = cylX(0.012, 0.021, 0.036, 32, 0.0012);
  part('wrist_motor', 'drive', 4, ['forearm'], [{ g: tf.t(mot, 0, J3Y, J5Z), mat: M.graphite }]);
}

// Eslabón 5: muñeca (gira sobre X) ---------------------------------------------------------------
{
  const knuckle = cylX(0.0125, -0.0145, 0.0145, 32, 0.0015);
  const neck = box(0, 0, 0.007, 0.022, 0.02, 0.014, 0.002);
  part('wrist', 'structure', 5, ['forearm', 'wrist_motor'], [{ g: tf.t(merge([knuckle, neck]), 0, J3Y, J5Z), mat: M.alu }]);
  const mot = cylZ(0.0105, 0.0885, 0.0945, 32, 0.0008);
  part('tool_motor', 'drive', 5, ['wrist'], [{ g: tf.t(mot, 0, J3Y, 0), mat: M.graphite }]);
}

// Eslabón 6: brida, pinza y dedos ------------------------------------------------------------------
{
  const flange = latheZ(ringProf(0.002, 0.014, J6Z, J6Z + 0.005, 0.0006), 40);
  const screws = [0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2;
    return tf.t(cylZ(0.0016, J6Z + 0.005, J6Z + 0.0065, 8), Math.cos(a) * 0.0095, J3Y + Math.sin(a) * 0.0095, 0);
  });
  part('tool_flange', 'tool', 6, ['tool_motor'], [{ g: tf.t(flange, 0, J3Y, 0), mat: M.steel }, { g: merge(screws), mat: M.graphite }]);
  const body = box(0, J3Y, 0.107, 0.05, 0.02, 0.013, 0.002);
  const rail = box(0, J3Y, 0.1145, 0.046, 0.006, 0.002, 0.0005);
  part('gripper_body', 'tool', 6, ['tool_flange'], [{ g: body, mat: M.graphite }, { g: rail, mat: M.steel }]);
  const finger = (s) => {
    const x = s * 0.009;
    const g = merge([box(x, J3Y, 0.12, 0.006, 0.014, 0.011, 0.0012), box(x + s * 0.0012, J3Y, 0.1305, 0.0036, 0.012, 0.011, 0.0012)]);
    const pad = box(x - s * 0.0027, J3Y, 0.13, 0.0008, 0.011, 0.009, 0.0002);
    return [{ g, mat: M.alu }, { g: pad, mat: M.rubber }];
  };
  part('finger_left', 'tool', 6, ['gripper_body'], finger(-1), { finger: -1 });
  part('finger_right', 'tool', 6, ['gripper_body'], finger(1), { finger: 1 });
}

// ─── Explosión, nodos y anclas ───────────────────────────────────────
deriveOrder(parts);
benchLayout(parts, { fixed: 'base_plate' });
const { tris } = emitParts(B, parts, ID, { extra: (p) => ({ link: p.link, ...(p.finger ? { finger: p.finger } : {}) }) });
B.node('anchor_label_top', { t: [0, 0.3, 0] });
JOINTS.forEach((j, i) => B.node(`anchor_joint${i + 1}`, { t: j.at, extras: { axis: j.axis, min: j.min, max: j.max } }));
B.node('anchor_tcp', { t: [0, J3Y, TCP_Z] });

mkdirSync(dirname(OUT), { recursive: true });
await B.write(OUT);
console.log(`${ID}: ${parts.length} piezas, ${tris} tris → ${OUT}`);
