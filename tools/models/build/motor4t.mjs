// Motor de combustión 4 tiempos monocilíndrico — modelo procedural propio (Mesa CAUCE, Agente 2).
// Salida: assets-src/taller/motor4t.src.glb  →  `npm run models:optimize` lo lleva a public/models/taller/motor4t.glb
//
// Marco: metros, Y arriba, frente +Z (escape al frente, admisión atrás), origen = centro de la base.
// Cigüeñal y árbol de levas giran sobre X; biela y válvulas se mueven en el plano Y–Z (vista lateral desde ±X).
// Jerarquía: part_<id> (extras de explosión; nunca animado) → [pivot_<id> (animado por anim_cycle)] → geo_<id> (malla).
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THREE, DEG, arcPts, circlePts, roundRectPts, shape, extrudeX, extrudeY, extrudeZ, lathe, latheX, latheZ, ringProf,
  cylX, cylY, box, curveFrom, thickTube, helixSpring, gearPts, merge, mirrorX, normalize, tf,
} from '../lib/geo.mjs';
import { GlbBuilder } from '../lib/gltf.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'assets-src/taller/motor4t.src.glb');

// ─── Cotas (m) ────────────────────────────────────────────────
const CY = 0.1; // eje del cigüeñal
const R = 0.03; // radio de manivela (carrera 60 mm)
const L = 0.11; // biela entre centros
const PIN0 = CY + R + L; // bulón en PMS = 0.24
const BORE = 0.035;
const CYL_Y0 = 0.16, CYL_Y1 = 0.27;
const HEAD_Y0 = 0.27, ROOF_Y = 0.283, FLOOR_Y = 0.3, HEAD_Y1 = 0.35;
const CAM_Y = 0.355, CAM_BASE = 0.01;
const VALVE_LEN = 0.056;
const VAL = {
  intake: { x: -0.01, z: -0.017, r: 0.0115, side: -1 },
  exhaust: { x: 0.01, z: 0.017, r: 0.0102, side: 1 },
};
const SPRING_Y0 = FLOOR_Y, SPRING_Y1 = 0.329;
const ROCKER_PIVOT_Y = 0.342, ROCKER_PIVOT_Z = 0.042, ROCKER_VALVE_ARM = Math.abs(ROCKER_PIVOT_Z - Math.abs(VAL.intake.z));
const VALVE_LIFT = 0.0068;
const CAM_LIFT = ROCKER_PIVOT_Z * (VALVE_LIFT / ROCKER_VALVE_ARM); // levantamiento en la leva (palanca)
const GEAR_X0 = 0.077, GEAR_X1 = 0.084, CHAIN_X = (GEAR_X0 + GEAR_X1) / 2;
const R_SPROCKET_CRANK = 0.016, R_SPROCKET_CAM = 0.0326; // relación 2:1 (16 / 32 dientes)
// Bujía lateral: entra por el borde de la cámara en el cuadrante libre (−X, +Z) y sale por el costado izquierdo.
const PLUG_TIP = new THREE.Vector3(-0.0305, 0.2765, 0.012);
const PLUG_DIR = new THREE.Vector3(-1, 0.3, 0.25).normalize();

// Distribución (grados de cigüeñal; 0 = PMS al inicio de la admisión).
const TIMING = {
  intake: { peak: 110, dur: 240 }, // AAA 10° antes de PMS, RCA 50° después de PMI
  exhaust: { peak: 610, dur: 240 }, // AAE 50° antes de PMI, RCE 10° después de PMS
};

// ─── Materiales (8) ───────────────────────────────────────────
const B = new GlbBuilder('motor4t', { cauce: { model: 'motor4t', author: 'Mesa CAUCE · Agente 2', license: 'own' } });
const M = {
  alu: B.material('aluminio', { color: '#B7BCC3', metallic: 1, roughness: 0.42 }),
  black: B.material('pintura_negra', { color: '#2D3136', metallic: 0.3, roughness: 0.58 }),
  steel: B.material('acero_pulido', { color: '#CFD4DA', metallic: 1, roughness: 0.2 }),
  red: B.material('pintura_roja', { color: '#B5382C', metallic: 0.15, roughness: 0.36 }),
  brass: B.material('laton', { color: '#C59B46', metallic: 1, roughness: 0.3 }),
  exhaust: B.material('acero_escape', { color: '#8E6F55', metallic: 1, roughness: 0.34 }),
  ceramic: B.material('ceramica', { color: '#ECE6DA', metallic: 0, roughness: 0.3 }),
  dark: B.material('acero_oscuro', { color: '#454A51', metallic: 0.9, roughness: 0.42 }),
};

// ─── Cinemática ───────────────────────────────────────────────
const crankAngle = (t) => (t / 8) * 4 * Math.PI; // 2 vueltas en 8 s
const pinY = (th) => CY + R * Math.cos(th) + Math.sqrt(L * L - R * R * Math.sin(th) ** 2);
const rodAngle = (th) => -Math.asin((R * Math.sin(th)) / L);
/** Levantamiento en la leva (m) para un desfase δ (rad de leva) respecto de la nariz. */
function camLiftAt(delta, durCrankDeg) {
  const D = (durCrankDeg / 2) * DEG; // duración en grados de leva
  let d = Math.atan2(Math.sin(delta), Math.cos(delta));
  if (Math.abs(d) >= D / 2) return 0;
  return CAM_LIFT * Math.cos((Math.PI * d) / D) ** 2;
}
/** Levantamiento de leva en el contacto (bajo la leva) para el ángulo de cigüeñal θ. */
const camLiftCrank = (which, th) => camLiftAt((TIMING[which].peak * DEG - th) / 2, TIMING[which].dur);
const rockerAngle = (which, th) => Math.asin(camLiftCrank(which, th) / ROCKER_PIVOT_Z);
const valveLift = (which, th) => ROCKER_VALVE_ARM * Math.sin(rockerAngle(which, th));

// ─── Piezas ───────────────────────────────────────────────────
const parts = [];
/**
 * id, group, order (desmontaje: 1 sale primero), off = desplazamiento al 100 % [x,y,z],
 * requires (montaje), items [{g, mat}] en coordenadas del modelo, pivot = punto de giro/animación.
 */
function part(id, group, order, off, requires, items, pivot) {
  parts.push({ id, group, order, off, requires, items, pivot });
}

// Cigüeñal ------------------------------------------------------
{
  const it = [];
  // Muñones y extremos (eje X).
  it.push(latheX([[0, -0.109], [0.0095, -0.109], [0.012, -0.1], [0.012, -0.023], [0, -0.023]], 40));
  it.push(latheX([[0, 0.023], [0.012, 0.023], [0.012, 0.086], [0.009, 0.0915], [0, 0.0915]], 40));
  // Contrapesos (plano Y–Z; u = −z, v = y), muñequilla en +Y.
  const web = shape([
    ...arcPts(0, 0, 0.046, -90 * DEG - 72 * DEG, -90 * DEG + 72 * DEG, 30).map(([u, v]) => [u, v]),
    ...arcPts(0, R, 0.018, -8 * DEG, 188 * DEG, 18),
  ]);
  for (const [a, b] of [[-0.023, -0.011], [0.011, 0.023]]) it.push(extrudeX(web, a, b, 0.0012));
  // Muñequilla.
  it.push(tf.t(cylX(0.0094, -0.0115, 0.0115, 32), 0, R, 0));
  // Agujeros de engrase (detalle): pequeños anillos en las caras de los contrapesos.
  for (const s of [-1, 1]) it.push(tf.t(cylX(0.0045, s > 0 ? 0.0228 : -0.0238, s > 0 ? 0.0238 : -0.0228, 16), 0, R, 0));
  const g = merge(it);
  g.translate(0, CY, 0);
  part('crankshaft', 'motion', 9, [0, 0, 0], [], [{ g, mat: M.steel }], [0, CY, 0]);
}

// Biela -------------------------------------------------------
{
  const outer = [
    ...arcPts(0, 0, 0.0135, -35 * DEG, 215 * DEG, 22),
    [-0.0062, -0.02], [-0.0098, -L + 0.026],
    ...arcPts(0, -L, 0.0205, 118 * DEG, 422 * DEG, 30),
    [0.0098, -L + 0.026], [0.0062, -0.02],
  ];
  const sh = shape(outer, [circlePts(0, 0, 0.0081, 20), circlePts(0, -L, 0.0096, 24)]);
  const body = extrudeX(sh, -0.008, 0.008, 0.0012);
  // Pernos de la tapa de biela.
  const bolts = [-1, 1].map((s) => tf.t(cylY(0.0026, -0.012, 0.012, 10, 0.0005), 0, -L - 0.004, s * 0.0148));
  const g = merge([body, ...bolts]);
  g.translate(0, PIN0, 0);
  part('connecting_rod', 'motion', 8, [0, -0.095, 0.205], ['crankshaft'], [{ g, mat: M.steel }], [0, PIN0, 0]);
}

// Pistón ------------------------------------------------------
{
  const ro = 0.0345, ri = 0.0312;
  const grooves = [[0.021, 0.0185], [0.0155, 0.013], [0.0095, 0.0055]];
  // Perfil (r, y) que sube por fuera pasando por los 3 surcos de segmentos.
  const fixed = [[ri, -0.022], [ro - 0.0006, -0.022], [ro, -0.0214]];
  for (const [top, bot] of grooves.slice().reverse()) fixed.push([ro, bot], [ro - 0.0026, bot], [ro - 0.0026, top], [ro, top]);
  fixed.push([ro, 0.0245], [ro - 0.0012, 0.0258], [0.02, 0.0262], [0, 0.0265], [0, 0.0195], [ri - 0.004, 0.0195], [ri, 0.016], [ri, -0.022]);
  const body = lathe(fixed, 56);
  // Alojamientos del bulón (bosses) y válvulas en la cabeza (rebajes) como detalle.
  const bosses = [-1, 1].map((s) => cylX(0.0115, s > 0 ? 0.0115 : -0.0318, s > 0 ? 0.0318 : -0.0115, 24, 0.001));
  const g = merge([body, ...bosses]);
  g.translate(0, PIN0, 0);
  part('piston', 'motion', 7, [0, 0, 0.205], ['connecting_rod'], [{ g, mat: M.alu }], [0, PIN0, 0]);

  // Segmentos (2 de compresión + 1 de aceite).
  const rings = grooves.map(([top, bot], i) =>
    lathe(ringProf(0.0322, 0.0349, bot + 0.0002, top - 0.0002, i === 2 ? 0 : 0.0003), 56),
  );
  const rg = merge(rings);
  rg.translate(0, PIN0, 0);
  part('piston_rings', 'motion', 8, [0, 0.085, 0.205], ['piston'], [{ g: rg, mat: M.dark }], [0, PIN0, 0]);

  // Bulón (hueco).
  const pin = latheX(ringProf(0.0045, 0.0079, -0.0305, 0.0305, 0.0006), 28);
  pin.translate(0, PIN0, 0);
  part('piston_pin', 'motion', 6, [0.105, 0, 0.205], ['piston', 'connecting_rod'], [{ g: pin, mat: M.steel }], [0, PIN0, 0]);
}

// Cárter izquierdo / derecho ---------------------------------------
{
  // Contorno exterior (u = −z, v = y) y cavidad en herradura abierta arriba (hacia el cilindro).
  const outerPts = roundRectPts(0, 0.1, 0.16, 0.14, 0.036, 6);
  const cavR = 0.062;
  const openW = 0.04; // semiancho de la boca superior
  const a0 = Math.asin(openW / cavR);
  const yOpen = CY + Math.cos(a0) * cavR;
  // Herradura: perímetro exterior + boca superior (hacia el cilindro) + cavidad, como un solo polígono simple.
  const shell = (() => {
    // Polígono simple: arco exterior (desde la boca derecha bajando por la derecha) + cavidad interior.
    const top = 0.17;
    const outer = [];
    // lado derecho y fondo y lado izquierdo, en sentido horario visto en (u, v)
    const rr = 0.036;
    outer.push([openW, top]);
    outer.push(...arcPts(0.08 - rr, top - rr, rr, Math.PI / 2, 0, 6));
    outer.push(...arcPts(0.08 - rr, 0.03 + rr, rr, 0, -Math.PI / 2, 6));
    outer.push(...arcPts(-0.08 + rr, 0.03 + rr, rr, -Math.PI / 2, -Math.PI, 6));
    outer.push(...arcPts(-0.08 + rr, top - rr, rr, Math.PI, Math.PI / 2, 6));
    outer.push([-openW, top]);
    outer.push([-openW, yOpen]);
    // cavidad: desde la boca izquierda, por arriba-izquierda, abajo, hasta la boca derecha (antihorario visto desde dentro)
    outer.push(...arcPts(0, CY, cavR, Math.PI / 2 + a0, Math.PI / 2 + 2 * Math.PI - a0, 48));
    outer.push([openW, yOpen]);
    return outer;
  })();
  const shellSh = shape(shell);
  const wallSh = shape(outerPts, [circlePts(0, CY, 0.0125, 28)]);
  const right = [];
  right.push(extrudeX(shellSh, 0.0005, 0.056, 0.0015));
  right.push(extrudeX(wallSh, 0.055, 0.065, 0.0018));
  // Alojamiento del rodamiento.
  right.push(tf.t(latheX(ringProf(0.0125, 0.024, 0.064, 0.072, 0.0012), 40), 0, CY, 0));
  // Rodamiento (anillo de acero visible desde dentro).
  const bearing = tf.t(latheX(ringProf(0.0121, 0.019, 0.044, 0.056, 0.0006), 32), 0, CY, 0);
  // Nervios y tornillos perimetrales.
  const bossPos = [[0.066, 0.05], [0.066, 0.15], [-0.066, 0.05], [-0.066, 0.15], [0, 0.04]];
  for (const [u, v] of bossPos) right.push(tf.t(cylX(0.0062, 0.05, 0.068, 16, 0.0008), 0, v, -u));
  const bolts = bossPos.map(([u, v]) => tf.t(cylX(0.0036, 0.068, 0.0715, 6, 0.0004), 0, v, -u));
  // Nervios radiales en la tapa exterior.
  for (const a of [30, 150, 210, 330]) {
    const rib = box(0.0675, 0, 0.042, 0.005, 0.005, 0.036, 0.001);
    rib.translate(0, 0, 0);
    rib.applyMatrix4(new THREE.Matrix4().makeRotationX(a * DEG));
    rib.translate(0, CY, 0);
    right.push(rib);
  }
  const gR = merge(right);
  const boltsR = merge(bolts);
  part('crankcase_right', 'case', 8, [0.175, 0, 0], ['crankshaft'], [{ g: gR, mat: M.alu }, { g: boltsR, mat: M.steel }, { g: bearing, mat: M.dark }]);
  part('crankcase_left', 'case', 7, [-0.175, 0, 0], ['crankshaft'], [{ g: mirrorX(gR), mat: M.alu }, { g: mirrorX(boltsR), mat: M.steel }, { g: mirrorX(bearing), mat: M.dark }]);
}

// Cárter de aceite -------------------------------------------------
{
  const outer = roundRectPts(0, 0, 0.13, 0.15, 0.022, 5);
  const inner = roundRectPts(0, 0, 0.116, 0.136, 0.016, 5);
  const it = [];
  it.push(extrudeY(shape(outer), 0, 0.007, 0.0015));
  it.push(extrudeY(shape(outer, [inner]), 0.006, 0.03, 0.0012));
  // Aletas de enfriamiento a los costados (Z).
  for (let i = -4; i <= 4; i++) {
    for (const s of [-1, 1]) it.push(box(i * 0.012, 0.016, s * 0.0765, 0.0025, 0.022, 0.004, 0.0006));
  }
  // Tapón de vaciado.
  const plug = tf.t(cylX(0.0055, 0.064, 0.071, 6, 0.0006), 0, 0.016, 0.03);
  part('oil_pan', 'case', 1, [0, 0, -0.225], ['crankcase_left', 'crankcase_right'], [{ g: merge(it), mat: M.alu }, { g: plug, mat: M.steel }]);
}

// Cilindro -------------------------------------------------------------
{
  const liner = lathe(ringProf(BORE, 0.04, CYL_Y0, CYL_Y1, 0.0006), 56);
  const fins = [];
  const nF = 8;
  for (let i = 0; i < nF; i++) {
    const y = 0.176 + i * 0.012;
    const w = 0.124 - (i === 0 || i === nF - 1 ? 0.004 : 0);
    fins.push(extrudeY(shape(roundRectPts(0, 0, w, w, 0.016, 4), [circlePts(0, 0, 0.0398, 40)]), y, y + 0.0042, 0.0012));
  }
  const flange = extrudeY(
    shape(roundRectPts(0, 0, 0.1, 0.1, 0.014, 4), [circlePts(0, 0, 0.0398, 40)]),
    0.165,
    0.172,
    0.001,
  );
  const top = extrudeY(shape(roundRectPts(0, 0, 0.108, 0.108, 0.014, 4), [circlePts(0, 0, BORE, 48)]), 0.264, CYL_Y1, 0.001);
  const studs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) studs.push(tf.t(cylY(0.0032, 0.165, 0.27, 10), sx * 0.045, 0, sz * 0.045));
  part('cylinder', 'case', 5, [0, 0.125, 0], ['crankcase_left', 'crankcase_right', 'piston_rings', 'piston_pin'], [
    { g: merge([...fins, flange, top]), mat: M.black },
    { g: liner, mat: M.dark },
    { g: merge(studs), mat: M.steel },
  ]);
}

// Culata -----------------------------------------------------------------
{
  const it = [];
  const W = 0.128;
  // Base con cámara de combustión (rebaje).
  it.push(extrudeY(shape(roundRectPts(0, 0, W, W, 0.016, 4), [circlePts(0, 0, BORE, 48)]), HEAD_Y0, ROOF_Y, 0.001));
  // Techo / piso de la caja de levas con guías de válvula y bujía.
  it.push(
    extrudeY(
      shape(roundRectPts(0, 0, W, W, 0.016, 4), [
        circlePts(VAL.intake.x, -VAL.intake.z, VAL.intake.r * 0.98, 28),
        circlePts(VAL.exhaust.x, -VAL.exhaust.z, VAL.exhaust.r * 0.98, 28),
      ]),
      ROOF_Y,
      ROOF_Y + 0.004,
      0,
    ),
  );
  it.push(
    extrudeY(
      shape(roundRectPts(0, 0, W - 0.012, W - 0.012, 0.012, 4), [
        circlePts(VAL.intake.x, -VAL.intake.z, 0.0034, 14),
        circlePts(VAL.exhaust.x, -VAL.exhaust.z, 0.0034, 14),
      ]),
      ROOF_Y + 0.004,
      FLOOR_Y,
      0.001,
    ),
  );
  // Asientos de válvula (anillos) y guías.
  for (const v of Object.values(VAL)) {
    it.push(tf.t(lathe(ringProf(v.r * 0.82, v.r * 1.02, ROOF_Y - 0.0012, ROOF_Y + 0.0035, 0.0003), 32), v.x, 0, v.z));
    it.push(tf.t(lathe(ringProf(0.0031, 0.005, FLOOR_Y - 0.002, FLOOR_Y + 0.006, 0.0005), 20), v.x, 0, v.z));
  }
  // Paredes de la caja de levas.
  it.push(extrudeY(shape(roundRectPts(0, 0, W - 0.004, W - 0.004, 0.014, 4), [roundRectPts(0, 0, W - 0.02, W - 0.02, 0.008, 4)]), FLOOR_Y, HEAD_Y1, 0.0012));
  // Aletas exteriores.
  for (let i = 0; i < 4; i++) {
    const y = 0.287 + i * 0.0105;
    it.push(extrudeY(shape(roundRectPts(0, 0, 0.142, 0.142, 0.02, 4), [roundRectPts(0, 0, W - 0.006, W - 0.006, 0.014, 4)]), y, y + 0.0038, 0.001));
  }
  // Torres del árbol de levas (con media cuna).
  for (const x of [-0.04, 0.04]) {
    const tower = shape([[0.016, FLOOR_Y], [0.016, CAM_Y], ...arcPts(0, CAM_Y, 0.0102, 0, -Math.PI, 12).slice(1, -1), [-0.016, CAM_Y], [-0.016, FLOOR_Y]]);
    it.push(extrudeX(tower, x - 0.006, x + 0.006, 0.001));
  }
  // Ejes y soportes de los balancines.
  for (const [k, v] of Object.entries(VAL)) {
    const z = v.side * ROCKER_PIVOT_Z;
    const xs = k === 'intake' ? [-0.0195, -0.0005] : [0.0005, 0.0195];
    for (const x of xs) it.push(box(x, (FLOOR_Y + ROCKER_PIVOT_Y) / 2 + 0.002, z, 0.004, ROCKER_PIVOT_Y - FLOOR_Y + 0.008, 0.011, 0.0008));
  }
  const shafts = Object.entries(VAL).map(([k, v]) => {
    const x0 = k === 'intake' ? -0.022 : -0.002;
    return tf.t(cylX(0.0024, x0, x0 + 0.024, 14), 0, ROCKER_PIVOT_Y, v.side * ROCKER_PIVOT_Z);
  });
  // Bridas de admisión (atrás) y escape (adelante).
  for (const s of [-1, 1]) {
    const fl = extrudeZ(shape(roundRectPts(0, 0, 0.036, 0.026, 0.006, 3), [circlePts(0, 0, s < 0 ? 0.0105 : 0.0098, 24)]), 0, 0.006, 0.001);
    fl.translate(0, 0.292, s < 0 ? -0.07 : 0.064);
    it.push(fl);
  }
  // Boss de la bujía.
  {
    const bossG = lathe(ringProf(0.0068, 0.0105, 0.012, 0.036, 0.0012), 24);
    bossG.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), PLUG_DIR));
    bossG.translate(PLUG_TIP.x, PLUG_TIP.y, PLUG_TIP.z);
    it.push(bossG);
  }
  part('cylinder_head', 'case', 4, [0, 0.27, 0], ['cylinder'], [{ g: merge(it), mat: M.alu }, { g: merge(shafts), mat: M.steel }]);
}

// Tapa de válvulas -----------------------------------------------------
{
  const it = [];
  const W = 0.124;
  it.push(extrudeY(shape(roundRectPts(0, 0, W, W, 0.014, 4), [roundRectPts(0, 0, W - 0.012, W - 0.012, 0.009, 4)]), HEAD_Y1, 0.381, 0.0015));
  it.push(extrudeY(shape(roundRectPts(0, 0, W - 0.006, W - 0.006, 0.012, 4)), 0.38, 0.387, 0.0025));
  // Costillas superiores y tapón de llenado.
  for (const z of [-0.03, -0.015, 0.015, 0.03]) it.push(box(0, 0.3895, z, 0.1, 0.005, 0.0035, 0.0012));
  const cap = cylY(0.011, 0.386, 0.396, 6, 0.0012);
  cap.translate(0, 0, 0);
  // Ventanilla de inspección (anillo) para la cadena.
  part('valve_cover', 'case', 1, [-0.25, 0.135, 0], ['rocker_intake', 'rocker_exhaust', 'camshaft', 'timing_gear_cam'], [
    { g: merge(it), mat: M.red },
    { g: cap, mat: M.dark },
  ]);
}

// Válvulas, resortes y balancines -----------------------------------------
for (const [k, v] of Object.entries(VAL)) {
  const r = v.r;
  const prof = [
    [0, 0], [r - 0.0006, 0], [r, 0.0006], [r, 0.0016], [r * 0.62, 0.0045], [0.0042, 0.009], [0.0029, 0.015],
    [0.0029, VALVE_LEN - 0.012], [0.0024, VALVE_LEN - 0.0115], [0.0024, VALVE_LEN - 0.0095], [0.0029, VALVE_LEN - 0.009],
    [0.0029, VALVE_LEN - 0.0005], [0.0024, VALVE_LEN], [0, VALVE_LEN],
  ];
  const valve = lathe(prof, 36);
  // Platillo (retén) solidario con la válvula.
  const ret = lathe(ringProf(0.0026, 0.0086, SPRING_Y1 - ROOF_Y, SPRING_Y1 - ROOF_Y + 0.0028, 0.0005), 28);
  const g = merge([valve, ret]);
  g.translate(v.x, ROOF_Y, v.z);
  const valveId = k === 'intake' ? 'intake_valve' : 'exhaust_valve';
  const offV = k === 'intake' ? [0.15, 0.005, -0.205] : [0.255, 0.005, -0.24];
  part(valveId, 'valvetrain', 6, offV, ['cylinder_head'], [{ g, mat: k === 'intake' ? M.steel : M.dark }], [v.x, ROOF_Y, v.z]);

  const spring = helixSpring(0.0074, 0.00115, SPRING_Y0, SPRING_Y1, 5, 22, 7);
  spring.translate(v.x, 0, v.z);
  const springId = `valve_spring_${k}`;
  part(springId, 'valvetrain', 5, [offV[0], offV[1] + 0.085, offV[2]], [valveId], [{ g: spring, mat: M.brass }], [v.x, SPRING_Y0, v.z]);

  // Balancín (forma en z, y → u = −z).
  const s = v.side; // −1 admisión (atrás), +1 escape (adelante)
  const pz = s * ROCKER_PIVOT_Z;
  // Contorno explícito en (z, y) para el lado de admisión (s = −1) y espejado para escape.
  const base = [
    [-0.042, 0.3476], ...arcPts(-0.042, ROCKER_PIVOT_Y, 0.0056, Math.PI / 2, Math.PI * 1.5, 10).slice(1),
    [-0.03, 0.3368], [-0.0205, 0.3385], [-0.0195, 0.3388], [-0.0145, 0.3388], [-0.012, 0.3385],
    [0.0, 0.3392], ...arcPts(0.0012, 0.3421, 0.0029, -Math.PI / 2, Math.PI / 2, 8).slice(1, -1),
    [0.0, 0.3451], [-0.02, 0.3462], [-0.034, 0.3478],
  ];
  const zy = s < 0 ? base : base.map(([z, y]) => [-z, y]).reverse();
  const rockerSh = shape(zy.map(([z, y]) => [-z, y]), [circlePts(-pz, ROCKER_PIVOT_Y, 0.0025, 12)]);
  const x0 = k === 'intake' ? -0.014 : 0.006;
  const rocker = extrudeX(rockerSh, x0, x0 + 0.008, 0.0008);
  // Tornillo de reglaje sobre la válvula.
  const adj = tf.t(cylY(0.0018, 0.3375, 0.3505, 8), v.x, 0, v.z);
  const rockerId = `rocker_${k}`;
  part(rockerId, 'valvetrain', 2, [offV[0], offV[1] + 0.155, offV[2]], [springId], [{ g: rocker, mat: M.steel }, { g: adj, mat: M.dark }], [0, ROCKER_PIVOT_Y, pz]);
}

// Árbol de levas ------------------------------------------------------------
{
  const it = [];
  it.push(latheX([[0, -0.058], [0.0062, -0.058], [0.007, -0.057], [0.007, 0.0915], [0, 0.0915]], 28));
  for (const x of [-0.04, 0.04]) it.push(latheX(ringProf(0, CAM_BASE + 0.0002, x - 0.0055, x + 0.0055, 0.0005), 32));
  for (const [k, v] of Object.entries(VAL)) {
    const nose = Math.PI - (TIMING[k].peak * DEG) / 2;
    const pts = [];
    const N = 72;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = CAM_BASE + camLiftAt(a - nose, TIMING[k].dur);
      pts.push([-Math.sin(a) * rr, Math.cos(a) * rr]); // (u = −z, v = y)
    }
    it.push(extrudeX(shape(pts), v.x - 0.0042, v.x + 0.0042, 0.0006));
  }
  const g = merge(it);
  g.translate(0, CAM_Y, 0);
  part('camshaft', 'valvetrain', 3, [0, 0.13, -0.235], ['cylinder_head'], [{ g, mat: M.steel }], [0, CAM_Y, 0]);
}

// Piñones de distribución ---------------------------------------------------
function sprocket(teeth, rp, holes) {
  const sh = shape(gearPts(teeth, rp - 0.0028, rp + 0.0026), [
    circlePts(0, 0, 0.0068, 18),
    ...(holes ? [0, 1, 2, 3].map((i) => circlePts(Math.cos(i * Math.PI / 2 + Math.PI / 4) * rp * 0.55, Math.sin(i * Math.PI / 2 + Math.PI / 4) * rp * 0.55, rp * 0.2, 16)) : []),
  ]);
  const body = extrudeX(sh, GEAR_X0, GEAR_X1, 0.0006);
  const hub = latheX(ringProf(0.0068, 0.0115, GEAR_X0 - 0.003, GEAR_X1 + 0.002, 0.0006), 24);
  return merge([body, hub]);
}
{
  const g = sprocket(16, R_SPROCKET_CRANK, false);
  g.translate(0, CY, 0);
  part('timing_gear_crank', 'valvetrain', 4, [0.235, 0, 0], ['crankcase_right'], [{ g, mat: M.brass }], [0, CY, 0]);
  const gc = sprocket(32, R_SPROCKET_CAM, true);
  gc.translate(0, CAM_Y, 0);
  part('timing_gear_cam', 'valvetrain', 2, [0.235, 0.03, 0], ['camshaft', 'timing_chain'], [{ g: gc, mat: M.brass }], [0, CAM_Y, 0]);
}

// Cadena de distribución --------------------------------------------------
{
  const r1 = R_SPROCKET_CRANK, r2 = R_SPROCKET_CAM, d = CAM_Y - CY;
  const ny = -(r2 - r1) / d, nz = Math.sqrt(1 - ny * ny);
  const aR = Math.atan2(ny, nz); // ángulo (z, y) del punto de tangencia derecho
  const aL = Math.PI - aR;
  // Tramos: recto derecho (abajo→arriba), arco superior aR→aL, recto izquierdo, arco inferior aL→2π+aR.
  const segs = [];
  const P = (cy, r, a) => [Math.cos(a) * r, cy + Math.sin(a) * r]; // (z, y)
  segs.push({ kind: 'line', a: P(CY, r1, aR), b: P(CAM_Y, r2, aR) });
  segs.push({ kind: 'arc', cy: CAM_Y, r: r2, a0: aR, a1: aL });
  segs.push({ kind: 'line', a: P(CAM_Y, r2, aL), b: P(CY, r1, aL) });
  segs.push({ kind: 'arc', cy: CY, r: r1, a0: aL, a1: 2 * Math.PI + aR });
  for (const s of segs) s.len = s.kind === 'line' ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) : s.r * (s.a1 - s.a0);
  const total = segs.reduce((a, s) => a + s.len, 0);
  const N = 2 * Math.round(total / 0.0064 / 2);
  const at = (sv) => {
    let x = ((sv % total) + total) % total;
    for (const s of segs) {
      if (x <= s.len) {
        const f = x / s.len;
        if (s.kind === 'line') return [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
        return P(s.cy, s.r, s.a0 + (s.a1 - s.a0) * f);
      }
      x -= s.len;
    }
    return segs[0].a;
  };
  const roller = cylX(0.0019, CHAIN_X - 0.0034, CHAIN_X + 0.0034, 6);
  const pitch = total / N;
  const plate = (inner) => {
    const h = inner ? 0.0046 : 0.0042;
    const sh = shape(roundRectPts(0, 0, pitch + 0.0042, h, h / 2 - 0.0002, 2));
    const xo = inner ? 0.0026 : 0.0036;
    return merge([extrudeX(sh, CHAIN_X + xo - 0.0004, CHAIN_X + xo + 0.0004), extrudeX(sh, CHAIN_X - xo - 0.0004, CHAIN_X - xo + 0.0004)]);
  };
  const plates = [plate(true), plate(false)];
  const geos = [];
  for (let i = 0; i < N; i++) {
    const [z0, y0] = at(i * pitch), [z1, y1] = at((i + 1) * pitch);
    geos.push(roller.clone().translate(0, y0, z0));
    const ang = Math.atan2(y1 - y0, z1 - z0); // ángulo de la cuerda en (z, y)
    // La placa está a lo largo de u (= −z); la giramos sobre X para alinearla con la cuerda.
    const m = new THREE.Matrix4()
      .makeTranslation(0, (y0 + y1) / 2, (z0 + z1) / 2)
      .multiply(new THREE.Matrix4().makeRotationX(-(ang - Math.PI)))
      .multiply(new THREE.Matrix4().makeTranslation(-CHAIN_X, 0, 0))
      .multiply(new THREE.Matrix4().makeTranslation(CHAIN_X, 0, 0));
    geos.push(normalize(plates[i % 2].clone()).applyMatrix4(m));
  }
  part('timing_chain', 'valvetrain', 3, [0.3, 0, 0], ['timing_gear_crank', 'camshaft'], [{ g: merge(geos), mat: M.dark }]);
}

// Volante ---------------------------------------------------------------------
{
  const prof = [
    [0.0122, -0.104], [0.022, -0.104], [0.022, -0.098], [0.0535, -0.098], [0.0535, -0.104], [0.0632, -0.104],
    [0.0645, -0.1028], [0.0645, -0.0812], [0.0632, -0.08], [0.0555, -0.08], [0.0555, -0.0895], [0.0235, -0.0895],
    [0.0235, -0.078], [0.0122, -0.078], [0.0122, -0.104],
  ];
  const disk = latheX(prof, 64);
  // Aspas del ventilador (cara exterior −X).
  const vanes = [];
  for (let i = 0; i < 12; i++) {
    const vane = box(-0.1068, 0, 0.041, 0.0056, 0.0022, 0.034, 0.0006);
    vane.applyMatrix4(new THREE.Matrix4().makeRotationX(i * (Math.PI / 6)));
    vanes.push(vane);
  }
  // Imanes (interior de la llanta).
  const mags = [];
  for (let i = 0; i < 4; i++) {
    const mg = box(-0.088, 0.05, 0, 0.012, 0.006, 0.026, 0.0008);
    mg.applyMatrix4(new THREE.Matrix4().makeRotationX(i * (Math.PI / 2) + Math.PI / 4));
    mags.push(mg);
  }
  const nut = cylX(0.0095, -0.1115, -0.1045, 6, 0.0008);
  const g1 = merge([disk, ...vanes]);
  const g2 = merge(mags);
  for (const g of [g1, g2, nut]) g.translate(0, CY, 0);
  part('flywheel', 'motion', 1, [-0.3, 0, 0], ['crankcase_left'], [{ g: g1, mat: M.black }, { g: g2, mat: M.brass }, { g: nut, mat: M.steel }], [0, CY, 0]);
}

// Bujía --------------------------------------------------------------------------
{
  // Construida sobre +Y con la punta en el origen.
  const metal = lathe([
    [0, -0.0035], [0.0008, -0.0035], [0.0008, -0.0012], [0.0012, -0.0012], [0.0012, 0.0005], [0.0028, 0.0005],
    // rosca (crestas)
    ...Array.from({ length: 7 }, (_, i) => [[0.0046, 0.0015 + i * 0.0022], [0.0052, 0.0026 + i * 0.0022]]).flat(),
    [0.0046, 0.0175], [0.0062, 0.0185], [0.0062, 0.021], [0, 0.021],
  ], 24);
  const hex = tf.t(cylY(0.0092, 0.021, 0.0305, 6, 0.0008), 0, 0, 0);
  const insul = lathe([
    [0, 0.03], [0.0058, 0.03], [0.0058, 0.034],
    ...Array.from({ length: 5 }, (_, i) => [[0.0052, 0.0355 + i * 0.0048], [0.0059, 0.0372 + i * 0.0048], [0.0059, 0.0388 + i * 0.0048], [0.0052, 0.0403 + i * 0.0048]]).flat(),
    [0.0049, 0.061], [0, 0.062],
  ], 28);
  const term = lathe([[0, 0.061], [0.0022, 0.061], [0.0022, 0.0675], [0.0034, 0.0685], [0.0034, 0.072], [0.0026, 0.073], [0, 0.073]], 16);
  // Electrodo de masa (gancho).
  const ground = box(0.0019, -0.0021, 0, 0.0012, 0.0045, 0.0016, 0.0003);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), PLUG_DIR);
  const place = (g) => g.applyQuaternion(q).translate(PLUG_TIP.x, PLUG_TIP.y, PLUG_TIP.z);
  part('spark_plug', 'ignition', 1, [-0.32, -0.08, 0.12], ['cylinder_head'], [
    { g: place(merge([metal, hex, ground])), mat: M.steel },
    { g: place(insul), mat: M.ceramic },
    { g: place(term), mat: M.dark },
  ]);
}

// Colector de admisión ------------------------------------------------------------
{
  const c = curveFrom([[0, 0.292, -0.07], [0, 0.291, -0.085], [0, 0.287, -0.098], [0, 0.284, -0.108]]);
  const tube = thickTube(c, 0.0118, 0.0098, 24, 20);
  const fl1 = latheZ(ringProf(0.0098, 0.0165, -0.076, -0.0705, 0.0008), 24);
  fl1.translate(0, 0.292, 0);
  const clamp = latheZ(ringProf(0.0117, 0.0138, -0.1, -0.094, 0.0005), 24);
  clamp.translate(0, 0.2865, 0);
  part('intake_manifold', 'intake', 2, [-0.12, 0, -0.13], ['cylinder_head'], [{ g: merge([tube, fl1]), mat: M.dark }, { g: clamp, mat: M.steel }]);
}

// Carburador -----------------------------------------------------------------------
{
  const cy = 0.284;
  const body = latheZ(ringProf(0.0105, 0.0175, -0.148, -0.108, 0.0012), 32);
  const bell = latheZ([[0.0105, -0.148], [0.0175, -0.148], [0.024, -0.162], [0.0265, -0.167], [0.0245, -0.168], [0.0105, -0.156], [0.0105, -0.148]], 32);
  const g1 = merge([body, bell]);
  g1.translate(0, cy, 0);
  const tower = cylY(0.0115, cy, cy + 0.034, 24, 0.0012);
  tower.translate(0, 0, -0.127);
  const capT = cylY(0.0128, cy + 0.033, cy + 0.039, 24, 0.0015);
  capT.translate(0, 0, -0.127);
  const bowl = box(0, cy - 0.027, -0.128, 0.03, 0.026, 0.028, 0.004);
  const lever = box(0.018, cy + 0.01, -0.13, 0.004, 0.006, 0.02, 0.0008);
  const screw = tf.t(cylX(0.0022, 0.016, 0.024, 8), 0, cy - 0.02, -0.12);
  part('carburetor', 'intake', 1, [-0.24, -0.06, -0.06], ['intake_manifold'], [
    { g: merge([g1, tower, bowl]), mat: M.brass },
    { g: merge([capT, lever, screw]), mat: M.alu },
  ]);
}

// Tubo de escape ----------------------------------------------------------------------
{
  const c = curveFrom([
    [0, 0.292, 0.066], [0, 0.291, 0.088], [0.008, 0.272, 0.122], [0.022, 0.225, 0.145], [0.034, 0.16, 0.152],
    [0.042, 0.1, 0.15], [0.046, 0.055, 0.14], [0.048, 0.03, 0.125],
  ]);
  const pipe = thickTube(c, 0.0128, 0.0102, 72, 20);
  const fl = latheZ(ringProf(0.0102, 0.018, 0.068, 0.074, 0.001), 24);
  fl.translate(0, 0.292, 0);
  // Protector térmico perforado (abrazaderas).
  const clamps = [0.35, 0.6].map((t) => {
    const p = c.getPoint(t), tg = c.getTangent(t);
    const g = lathe(ringProf(0.0127, 0.0145, -0.003, 0.003, 0.0006), 24);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg));
    return g.translate(p.x, p.y, p.z);
  });
  part('exhaust_pipe', 'exhaust', 1, [0.255, 0, 0.085], ['cylinder_head'], [{ g: pipe, mat: M.exhaust }, { g: merge([fl, ...clamps]), mat: M.steel }]);
}

// ─── Orden de desmontaje derivado de `requires` ───────────────────
// order(p) = 1 si nadie depende de p; si no, 1 + máx(order de quienes lo requieren).
// Así lo que se monta al final sale primero y la cascada de la explosión es coherente con el reto de armado.
{
  const byId = new Map(parts.map((p) => [p.id, p]));
  const dependents = new Map(parts.map((p) => [p.id, []]));
  for (const p of parts) for (const r of p.requires) {
    if (!byId.has(r)) throw new Error(`${p.id} requiere ${r}, que no existe`);
    dependents.get(r).push(p.id);
  }
  const memo = new Map();
  const ord = (id, stack = []) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.includes(id)) throw new Error(`ciclo en requires: ${[...stack, id].join(' → ')}`);
    const deps = dependents.get(id);
    const v = deps.length ? 1 + Math.max(...deps.map((d) => ord(d, [...stack, id]))) : 1;
    memo.set(id, v);
    return v;
  };
  for (const p of parts) p.order = ord(p.id);
}

// ─── Nodos ─────────────────────────────────────────────────────
const nodes = {};
const bbox = new THREE.Box3();
let totalTris = 0;
for (const p of parts) {
  // Centro de la pieza = centro de su caja (pose armada).
  bbox.makeEmpty();
  for (const { g } of p.items) {
    g.computeBoundingBox();
    bbox.union(g.boundingBox);
  }
  const c = bbox.getCenter(new THREE.Vector3());
  const off = new THREE.Vector3(...p.off);
  const dist = off.length();
  const dir = dist > 1e-9 ? off.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const extras = {
    partId: p.id,
    group: p.group,
    explode: { dir: [+dir.x.toFixed(5), +dir.y.toFixed(5), +dir.z.toFixed(5)], dist: +dist.toFixed(4), order: p.order },
    labelKey: `exp.taller.motor4t.title.${p.id}`,
    requires: p.requires,
  };
  const pn = B.node(`part_${p.id}`, { t: c.toArray(), extras });
  let holder = pn, origin = c;
  if (p.pivot) {
    const pv = new THREE.Vector3(...p.pivot);
    holder = B.node(`pivot_${p.id}`, { t: pv.clone().sub(c).toArray() }, pn);
    origin = pv;
    nodes[p.id] = { part: pn, pivot: holder, pivotLocal: pv.clone().sub(c) };
  } else nodes[p.id] = { part: pn };
  const items = p.items.map(({ g, mat }) => ({ g: normalize(g.clone()).translate(-origin.x, -origin.y, -origin.z), mat }));
  const mesh = B.mesh(p.id, items);
  B.node(`geo_${p.id}`, {}, holder).setMesh(mesh);
  const tris = items.reduce((a, { g }) => a + g.attributes.position.count / 3, 0);
  totalTris += tris;
  console.log(`  ${p.id.padEnd(22)} ${String(tris).padStart(6)} tris`);
}
B.node('anchor_label_top', { t: [0, 0.43, 0] });
B.node('anchor_combustion', { t: [0, (PIN0 + 0.0265 + ROOF_Y) / 2, 0] });

// ─── Clip anim_cycle (8 s, bucle) ───────────────────────────────────
{
  const FPS = 30, DUR = 8, N = FPS * DUR + 1;
  const times = new Float32Array(N);
  for (let i = 0; i < N; i++) times[i] = (i / (N - 1)) * DUR;
  const ch = [];
  const rotX = (fn) => {
    const v = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const a = fn(crankAngle(times[i]));
      v.set([Math.sin(a / 2), 0, 0, Math.cos(a / 2)], i * 4);
    }
    return v;
  };
  const trans = (base, fn) => {
    const v = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const [dx, dy, dz] = fn(crankAngle(times[i]));
      v.set([base.x + dx, base.y + dy, base.z + dz], i * 3);
    }
    return v;
  };
  const add = (id, path, values) => ch.push({ node: nodes[id].pivot, path, times, values });
  for (const id of ['crankshaft', 'flywheel', 'timing_gear_crank']) add(id, 'rotation', rotX((th) => th));
  for (const id of ['camshaft', 'timing_gear_cam']) add(id, 'rotation', rotX((th) => th / 2));
  for (const id of ['piston', 'piston_rings', 'piston_pin', 'connecting_rod'])
    add(id, 'translation', trans(nodes[id].pivotLocal, (th) => [0, pinY(th) - PIN0, 0]));
  add('connecting_rod', 'rotation', rotX(rodAngle));
  for (const k of ['intake', 'exhaust']) {
    const valveId = k === 'intake' ? 'intake_valve' : 'exhaust_valve';
    add(valveId, 'translation', trans(nodes[valveId].pivotLocal, (th) => [0, -valveLift(k, th), 0]));
    const sp = new Float32Array(N * 3);
    const Ls = SPRING_Y1 - SPRING_Y0;
    for (let i = 0; i < N; i++) sp.set([1, (Ls - valveLift(k, crankAngle(times[i]))) / Ls, 1], i * 3);
    add(`valve_spring_${k}`, 'scale', sp);
    // Admisión: pivote atrás (z < 0), contacto adelante → ángulo +; escape: al revés.
    add(`rocker_${k}`, 'rotation', rotX((th) => -VAL[k].side * rockerAngle(k, th)));
  }
  B.clip('anim_cycle', ch, {
    loop: true,
    phases: [
      { id: 'intake', from: 0, to: 2 },
      { id: 'compression', from: 2, to: 4 },
      { id: 'power', from: 4, to: 6 },
      { id: 'exhaust', from: 6, to: 8 },
    ],
    ignitionAt: 4,
  });
}

mkdirSync(dirname(OUT), { recursive: true });
await B.write(OUT);
console.log(`motor4t: ${parts.length} piezas, ${totalTris} tris → ${OUT}`);
