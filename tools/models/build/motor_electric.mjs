// Motor eléctrico trifásico de imanes permanentes — modelo procedural propio (Mesa CAUCE, Agente 2).
// Salida: assets-src/taller/motor_electric.src.glb  →  `npm run models:optimize` lo lleva a public/models/taller/.
//
// Marco: metros, Y arriba, frente +Z, origen = centro de la base. El eje gira sobre X a la altura CY.
// Estator de 6 dientes con 3 bobinas (fases A, B y C, dos dientes opuestos cada una) y rotor de 4 imanes.
// Cada fase tiene su propio material de cobre: la lógica del Taller los ilumina en secuencia (corriente por fases).
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, DEG, arcPts, circlePts, roundRectPts, shape, extrudeX, extrudeY, latheX, ringProf, cylX, cylY, box, merge, mirrorX, tf } from '../lib/geo.mjs';
import { GlbBuilder } from '../lib/gltf.mjs';
import { benchLayout, deriveOrder, emitParts, spinX } from '../lib/hero.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'assets-src/taller/motor_electric.src.glb');
const ID = 'motor_electric';

// ─── Cotas (m) ────────────────────────────────────────────────
const CY = 0.075; // eje
const SHELL_RI = 0.053, SHELL_RO = 0.058, HALF = 0.062; // carcasa
const STATOR_RO = 0.0525, SLOT_R = 0.043, TIP_R = 0.031, STATOR_HALF = 0.045;
const ROTOR_R = 0.0255, MAG_RO = 0.0292;
const SHAFT_R = 0.0085;
const TEETH = 6;

// ─── Materiales (8) ───────────────────────────────────────────
const B = new GlbBuilder(ID, { cauce: { model: ID, author: 'Mesa CAUCE · Agente 2', license: 'own' } });
const M = {
  paint: B.material('pintura_azul', { color: '#2C8190', metallic: 0.25, roughness: 0.45 }),
  steel: B.material('acero_pulido', { color: '#CFD4DA', metallic: 1, roughness: 0.22 }),
  core: B.material('acero_laminado', { color: '#4A4F57', metallic: 0.85, roughness: 0.4 }),
  // Rugosidad apenas distinta: si fueran idénticos, el `dedup` de optimize.mjs los fusionaría en uno.
  cuA: B.material('cobre_a', { color: '#C46A2E', metallic: 1, roughness: 0.32 }),
  cuB: B.material('cobre_b', { color: '#C46A2E', metallic: 1, roughness: 0.321 }),
  cuC: B.material('cobre_c', { color: '#C46A2E', metallic: 1, roughness: 0.322 }),
  magN: B.material('iman_norte', { color: '#B5382C', metallic: 0.3, roughness: 0.4 }),
  magS: B.material('iman_sur', { color: '#3E5C8A', metallic: 0.3, roughness: 0.4 }),
};

const parts = [];
function part(id, group, requires, items, pivot) {
  parts.push({ id, group, requires, items, pivot });
}
/** Punto (r, θ) del plano Y–Z en coordenadas de forma (u = −z, v = y) para extrudeX. */
const uv = (r, a) => [r * Math.cos(a), CY + r * Math.sin(a)];

// Carcasa con aletas, patas y base de la caja de bornes -------------------------
{
  const it = [];
  it.push(tf.t(latheX(ringProf(SHELL_RI, SHELL_RO, -HALF, HALF, 0.0012), 64), 0, CY, 0));
  // Aletas axiales (fuera de la base de bornes arriba y de las patas abajo).
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const deg = ((a / DEG) % 360 + 360) % 360;
    if (Math.abs(deg - 90) < 28 || Math.abs(deg - 270) < 40) continue;
    const fin = box(0, SHELL_RO + 0.004, 0, 2 * HALF - 0.01, 0.009, 0.0026, 0.0006);
    fin.applyMatrix4(new THREE.Matrix4().makeRotationX(a - Math.PI / 2));
    fin.translate(0, CY, 0);
    it.push(fin);
  }
  // Patas: zapata + alma hasta la carcasa.
  for (const s of [-1, 1]) {
    it.push(box(s * 0.04, 0.005, 0, 0.026, 0.01, 0.132, 0.0015));
    it.push(box(s * 0.04, 0.016, 0, 0.012, 0.014, 0.07, 0.001));
    for (const sz of [-1, 1]) it.push(tf.t(cylY(0.0042, 0.0098, 0.0118, 12, 0.0004), s * 0.04, 0, sz * 0.055));
  }
  // Base plana para la caja de bornes.
  it.push(box(0.012, SHELL_RO + CY - 0.002, 0, 0.056, 0.006, 0.05, 0.001));
  part('housing', 'case', [], [{ g: merge(it), mat: M.paint }]);
}

// Núcleo del estator: chapa con 6 dientes hacia adentro ---------------------
const toothAngle = (k) => (k / TEETH) * Math.PI * 2 + Math.PI / 2; // un diente arriba
{
  const inner = [];
  for (let k = 0; k < TEETH; k++) {
    const c = toothAngle(k), n = toothAngle(k + 1);
    inner.push(uv(SLOT_R, c - 0.15), uv(TIP_R + 0.003, c - 0.15), uv(TIP_R + 0.002, c - 0.22));
    for (const [r, a] of arcPts(0, 0, TIP_R, c - 0.22, c + 0.22, 6).map(([x, y]) => [Math.hypot(x, y), Math.atan2(y, x)])) inner.push(uv(r, a));
    inner.push(uv(TIP_R + 0.002, c + 0.22), uv(TIP_R + 0.003, c + 0.15), uv(SLOT_R, c + 0.15));
    for (const [x, y] of arcPts(0, 0, SLOT_R, c + 0.15, n - 0.15, 8).slice(1, -1)) inner.push(uv(Math.hypot(x, y), Math.atan2(y, x)));
  }
  const outer = circlePts(0, CY, STATOR_RO, 72);
  const g = extrudeX(shape(outer, [inner]), -STATOR_HALF, STATOR_HALF, 0.001);
  // Ranuras de las chapas (detalle): anillos finos a lo largo.
  const lams = [];
  for (let i = -4; i <= 4; i++) lams.push(tf.t(latheX(ringProf(STATOR_RO - 0.0004, STATOR_RO + 0.0003, i * 0.0095 - 0.0007, i * 0.0095 + 0.0007), 72), 0, CY, 0));
  part('stator_core', 'field', ['housing'], [{ g: merge([g, ...lams]), mat: M.core }]);
}

// Bobinas: una fase = dos dientes opuestos -----------------------------------
function coil(k) {
  const a = toothAngle(k);
  const ring = extrudeY(shape(roundRectPts(0, 0, 0.104, 0.0245, 0.006, 4), [roundRectPts(0, 0, 0.0925, 0.0135, 0.0035, 4)]), TIP_R + 0.003, SLOT_R - 0.0012, 0.0008);
  // +Y del anillo → dirección radial del diente en el modelo: (0, sin a, −cos a).
  ring.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.atan2(-Math.cos(a), Math.sin(a))));
  ring.translate(0, CY, 0);
  return ring;
}
const PHASES = [['coil_a', M.cuA], ['coil_b', M.cuB], ['coil_c', M.cuC]];
PHASES.forEach(([id, mat], i) => part(id, 'field', ['stator_core'], [{ g: merge([coil(i), coil(i + 3)]), mat }]));

// Rotor: núcleo + 4 imanes alternados ----------------------------------------
{
  const core = tf.t(latheX([[SHAFT_R, -STATOR_HALF + 0.001], [ROTOR_R, -STATOR_HALF + 0.001], [ROTOR_R, STATOR_HALF - 0.001], [SHAFT_R, STATOR_HALF - 0.001]], 48), 0, CY, 0);
  const rings = [-1, 1].map((s) => tf.t(latheX(ringProf(SHAFT_R, ROTOR_R + 0.0015, s > 0 ? STATOR_HALF - 0.004 : -STATOR_HALF + 0.001, s > 0 ? STATOR_HALF - 0.001 : -STATOR_HALF + 0.004, 0.0005), 48), 0, CY, 0));
  part('rotor_core', 'motion', ['coil_a', 'coil_b', 'coil_c'], [{ g: merge([core, ...rings]), mat: M.core }], [0, CY, 0]);
  const mags = { n: [], s: [] };
  for (let i = 0; i < 4; i++) {
    const a0 = i * (Math.PI / 2) + 0.12, a1 = (i + 1) * (Math.PI / 2) - 0.12;
    const sector = [...arcPts(0, CY, MAG_RO, a0, a1, 10), ...arcPts(0, CY, ROTOR_R + 0.0002, a1, a0, 10)];
    (i % 2 ? mags.s : mags.n).push(extrudeX(shape(sector), -STATOR_HALF + 0.005, STATOR_HALF - 0.005, 0.0006));
  }
  part('rotor_magnets', 'motion', ['rotor_core'], [{ g: merge(mags.n), mat: M.magN }, { g: merge(mags.s), mat: M.magS }], [0, CY, 0]);
}

// Eje y chaveta ----------------------------------------------------------------
{
  const g = latheX([[0, -0.112], [SHAFT_R - 0.001, -0.112], [SHAFT_R, -0.111], [SHAFT_R, 0.12], [SHAFT_R - 0.001, 0.121], [0, 0.121]], 32);
  part('shaft', 'motion', ['rotor_core'], [{ g: tf.t(g, 0, CY, 0), mat: M.steel }], [0, CY, 0]);
  part('shaft_key', 'motion', ['end_cap_front'], [{ g: box(0.103, CY + SHAFT_R + 0.0012, 0, 0.026, 0.004, 0.0045, 0.0005), mat: M.steel }], [0, CY, 0]);
}

// Rodamientos ---------------------------------------------------------------------
function bearing(x0, x1) {
  const races = merge([latheX(ringProf(SHAFT_R, 0.0112, x0, x1, 0.0004), 32), latheX(ringProf(0.0145, 0.0172, x0, x1, 0.0004), 32)]);
  const balls = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const b = new THREE.SphereGeometry(0.0021, 8, 6);
    b.translate((x0 + x1) / 2, Math.sin(a) * 0.0128, Math.cos(a) * 0.0128);
    balls.push(b);
  }
  return tf.t(merge([races, ...balls]), 0, CY, 0);
}
part('bearing_front', 'support', ['shaft'], [{ g: bearing(0.056, 0.066), mat: M.steel }]);
part('bearing_rear', 'support', ['shaft'], [{ g: bearing(-0.066, -0.056), mat: M.steel }]);

// Tapas ------------------------------------------------------------------------------
{
  const it = [];
  it.push(latheX([[0.0172, HALF - 0.004], [0.0172, HALF], [SHELL_RO, HALF], [SHELL_RO, HALF + 0.007], [0.025, HALF + 0.009], [0.025, HALF + 0.017], [0.0172, HALF + 0.017], [0.0172, HALF - 0.004]], 64));
  // Nervios radiales.
  for (let i = 0; i < 6; i++) {
    const rib = box(HALF + 0.009, 0.042, 0, 0.004, 0.03, 0.0035, 0.0006);
    rib.applyMatrix4(new THREE.Matrix4().makeRotationX(i * (Math.PI / 3)));
    it.push(rib);
  }
  const bolts = [0, 1, 2, 3].map((i) => {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    return tf.t(cylX(0.0032, HALF + 0.007, HALF + 0.0105, 6, 0.0004), 0, Math.sin(a) * 0.05, Math.cos(a) * 0.05);
  });
  const g = tf.t(merge(it), 0, CY, 0);
  const gb = tf.t(merge(bolts), 0, CY, 0);
  part('end_cap_front', 'case', ['bearing_front', 'rotor_magnets'], [{ g, mat: M.paint }, { g: gb, mat: M.steel }]);
  part('end_cap_rear', 'case', ['bearing_rear', 'rotor_magnets'], [{ g: mirrorX(g), mat: M.paint }, { g: mirrorX(gb), mat: M.steel }]);
}

// Ventilador y su cubierta ----------------------------------------------------------
{
  const hub = latheX(ringProf(SHAFT_R, 0.014, -0.097, -0.085, 0.0008), 28);
  const blades = [];
  for (let i = 0; i < 8; i++) {
    const bl = box(-0.091, 0.031, 0, 0.011, 0.034, 0.0022, 0.0005);
    bl.applyMatrix4(new THREE.Matrix4().makeRotationY(18 * DEG).premultiply(new THREE.Matrix4().makeRotationX(i * (Math.PI / 4))));
    blades.push(bl);
  }
  part('fan', 'cooling', ['end_cap_rear'], [{ g: tf.t(merge([hub, ...blades]), 0, CY, 0), mat: M.core }], [0, CY, 0]);
  const shell = latheX(ringProf(0.05, 0.0535, -0.11, -0.074, 0.0008), 56);
  const grille = [];
  for (const r of [0.016, 0.027, 0.038, 0.049]) grille.push(latheX(ringProf(r - 0.0016, r + 0.0016, -0.1135, -0.1095), 48));
  for (let i = 0; i < 8; i++) {
    const sp = box(-0.1115, 0.033, 0, 0.004, 0.036, 0.0028, 0.0004);
    sp.applyMatrix4(new THREE.Matrix4().makeRotationX(i * (Math.PI / 4)));
    grille.push(sp);
  }
  part('fan_cover', 'cooling', ['fan'], [{ g: tf.t(merge([shell, ...grille]), 0, CY, 0), mat: M.paint }]);
}

// Caja de bornes y tapa -------------------------------------------------------------
{
  const y0 = CY + SHELL_RO + 0.001, y1 = y0 + 0.024;
  const walls = extrudeY(shape(roundRectPts(0.012, 0, 0.052, 0.046, 0.006, 3), [roundRectPts(0.012, 0, 0.044, 0.038, 0.004, 3)]), y0, y1, 0.0008);
  const floor = box(0.012, y0 + 0.0015, 0, 0.046, 0.003, 0.04, 0.0006);
  const gland = tf.t(latheX(ringProf(0.004, 0.0072, 0.038, 0.05, 0.0006), 20), 0, y0 + 0.012, 0);
  const studs = [-1, 0, 1].map((i) => tf.t(cylY(0.0026, y0 + 0.003, y0 + 0.017, 10, 0.0004), 0.012 + i * 0.013, 0, 0));
  part('terminal_box', 'power', ['housing'], [{ g: merge([walls, floor]), mat: M.paint }, { g: merge([gland, ...studs]), mat: M.steel }]);
  const lid = box(0.012, y1 + 0.0025, 0, 0.054, 0.005, 0.048, 0.0015);
  const screws = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([sx, sz]) => tf.t(cylY(0.0024, y1 + 0.005, y1 + 0.0068, 8, 0.0003), 0.012 + sx * 0.021, 0, sz * 0.018));
  part('terminal_lid', 'power', ['terminal_box', 'coil_a', 'coil_b', 'coil_c'], [{ g: lid, mat: M.paint }, { g: merge(screws), mat: M.steel }]);
}

// ─── Explosión, nodos, anclas y clip ───────────────────────────────
deriveOrder(parts);
benchLayout(parts, { fixed: 'housing' });
const { nodes, tris } = emitParts(B, parts, ID);
B.node('anchor_label_top', { t: [0, 0.2, 0] });
B.node('anchor_field', { t: [0, CY, 0] });

{
  const DUR = 2;
  const { times, values } = spinX(DUR, 1);
  const ch = ['rotor_core', 'rotor_magnets', 'shaft', 'shaft_key', 'fan'].map((id) => ({ node: nodes[id].pivot, path: 'rotation', times, values }));
  // polePairs: 2 pares de polos → la corriente da 2 ciclos eléctricos por vuelta del rotor.
  B.clip('anim_spin', ch, { loop: true, turns: 1, polePairs: 2, phases: ['a', 'b', 'c'] });
}

mkdirSync(dirname(OUT), { recursive: true });
await B.write(OUT);
console.log(`${ID}: ${parts.length} piezas, ${tris} tris → ${OUT}`);
