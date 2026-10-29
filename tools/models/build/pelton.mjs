// Turbina hidráulica Pelton con generador — modelo procedural propio (Mesa CAUCE, Agente 2).
// Salida: assets-src/taller/pelton.src.glb  →  `npm run models:optimize` lo lleva a public/models/taller/.
//
// Marco: metros, Y arriba, frente +Z, origen = centro de la base. Eje horizontal sobre X a la altura CY.
// La rueda (x < 0) recibe abajo el chorro del inyector, que viaja hacia +Z; el eje mueve el generador (x > 0)
// y el bombillo de arriba se enciende con la electricidad (lo ilumina la lógica). El chorro lo dibuja la lógica
// entre anchor_jet_start y anchor_jet_end.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, arcPts, circlePts, roundRectPts, shape, extrudeX, extrudeY, extrudeZ, latheX, latheZ, lathe, ringProf, cylX, cylY, cylZ, box, curveFrom, thickTube, merge, tf } from '../lib/geo.mjs';
import { GlbBuilder } from '../lib/gltf.mjs';
import { benchLayout, deriveOrder, emitParts, spinX } from '../lib/hero.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = resolve(ROOT, 'assets-src/taller/pelton.src.glb');
const ID = 'pelton';

// ─── Cotas (m) ────────────────────────────────────────────────
const CY = 0.115; // eje
const RX = -0.045; // plano de la rueda
const RP = 0.064; // radio del círculo de cucharas
const JET_Y = CY - RP - 0.004; // el chorro pega en el centro de la cuchara de abajo
const BASE_T = 0.012;
const HX0 = -0.077, HX1 = -0.013; // paredes laterales de la carcasa
const HZ = 0.089; // semiancho de la carcasa
const GEN_X0 = 0.07, GEN_X1 = 0.148, GEN_R = 0.048;
const SHAFT_R = 0.009;

// ─── Materiales (7) ───────────────────────────────────────────
const B = new GlbBuilder(ID, { cauce: { model: ID, author: 'Mesa CAUCE · Agente 2', license: 'own' } });
const M = {
  housing: B.material('pintura_azul', { color: '#1E626E', metallic: 0.25, roughness: 0.45 }),
  base: B.material('pintura_grafito', { color: '#3A3F45', metallic: 0.4, roughness: 0.55 }),
  bronze: B.material('bronce', { color: '#B08A4A', metallic: 1, roughness: 0.28, doubleSided: true }),
  steel: B.material('acero_pulido', { color: '#CFD4DA', metallic: 1, roughness: 0.22 }),
  gen: B.material('pintura_naranja', { color: '#D3632B', metallic: 0.2, roughness: 0.42 }),
  copper: B.material('cobre', { color: '#C46A2E', metallic: 1, roughness: 0.32 }),
  glass: B.material('bombillo', { color: '#F2E4A8', metallic: 0, roughness: 0.15 }),
};

const parts = [];
function part(id, group, requires, items, pivot) {
  parts.push({ id, group, requires, items, pivot });
}

// Bancada ---------------------------------------------------------------------
{
  const plate = box(0, BASE_T / 2, 0, 0.3, BASE_T, 0.22, 0.002);
  const bolts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bolts.push(tf.t(cylY(0.005, BASE_T, BASE_T + 0.004, 6, 0.0005), sx * 0.135, 0, sz * 0.095));
  part('base_frame', 'base', [], [{ g: plate, mat: M.base }, { g: merge(bolts), mat: M.steel }]);
}

// Carcasa inferior (foso abierto arriba, por donde cae el agua) -----------------------
const LOW_TOP = 0.1;
{
  const it = [];
  // Paredes frontal y trasera (la trasera con el paso del inyector).
  const wall = (z0, z1, holes) => extrudeZ(shape(roundRectPts((HX0 + HX1) / 2, (BASE_T + LOW_TOP) / 2, HX1 - HX0, LOW_TOP - BASE_T, 0.002, 2), holes), z0, z1, 0.0008);
  it.push(wall(-HZ, -HZ + 0.004, [circlePts(RX, JET_Y, 0.012, 24)]));
  it.push(wall(HZ - 0.004, HZ, []));
  // Paredes laterales.
  for (const [x0, x1] of [[HX0, HX0 + 0.004], [HX1 - 0.004, HX1]]) it.push(box((x0 + x1) / 2, (BASE_T + LOW_TOP) / 2, 0, x1 - x0, LOW_TOP - BASE_T, 2 * HZ, 0.0008));
  // Brida superior.
  it.push(extrudeY(shape(roundRectPts((HX0 + HX1) / 2, 0, HX1 - HX0 + 0.012, 2 * HZ + 0.012, 0.004, 2), [roundRectPts((HX0 + HX1) / 2, 0, HX1 - HX0 - 0.008, 2 * HZ - 0.008, 0.002, 2)]), LOW_TOP - 0.004, LOW_TOP, 0.0008));
  part('housing_lower', 'case', ['base_frame'], [{ g: merge(it), mat: M.housing }]);
}

// Carcasa superior (capota) --------------------------------------------------------------
{
  const it = [];
  const R0 = 0.085, R1 = 0.089;
  // Casco curvo (u = −z, v = y): media corona sobre el eje.
  const shell = [...arcPts(0, CY, R1, 0, Math.PI, 36), ...arcPts(0, CY, R0, Math.PI, 0, 36)];
  it.push(extrudeX(shape(shell), HX0, HX1, 0.0008));
  // Faldones rectos hasta la brida.
  for (const s of [-1, 1]) it.push(box((HX0 + HX1) / 2, (LOW_TOP + CY) / 2, s * (R0 + R1) / 2, HX1 - HX0, CY - LOW_TOP, R1 - R0, 0.0006));
  // Tapas laterales: la derecha con paso del eje.
  const side = (holes) => shape([[R1, LOW_TOP], ...arcPts(0, CY, R1, 0, Math.PI, 36), [-R1, LOW_TOP]], holes);
  it.push(extrudeX(side([]), HX0, HX0 + 0.004, 0.0008));
  it.push(extrudeX(side([circlePts(0, CY, SHAFT_R + 0.0015, 24)]), HX1 - 0.004, HX1, 0.0008));
  // Mirilla (anillo) y asa.
  const rim = tf.t(latheX(ringProf(0.016, 0.021, HX0 - 0.003, HX0, 0.0006), 32), 0, CY + 0.035, 0);
  const handle = box((HX0 + HX1) / 2, CY + R1 + 0.006, 0, 0.034, 0.006, 0.01, 0.002);
  part('housing_upper', 'case', ['runner_nut'], [{ g: merge(it), mat: M.housing }, { g: merge([rim, handle]), mat: M.steel }]);
}

// Rueda: disco, cucharas y tuerca ------------------------------------------------------------
{
  const disk = latheX([[SHAFT_R, RX - 0.016], [0.017, RX - 0.016], [0.02, RX - 0.007], [0.054, RX - 0.005], [0.057, RX - 0.004], [0.057, RX + 0.004], [0.054, RX + 0.005], [0.02, RX + 0.007], [0.017, RX + 0.016], [SHAFT_R, RX + 0.016]], 64);
  part('runner_disk', 'motion', ['shaft', 'housing_lower'], [{ g: tf.t(disk, 0, CY, 0), mat: M.bronze }], [0, CY, 0]);

  // Una cuchara abajo (abre hacia −Z, de cara al chorro) y 16 copias girando sobre X.
  const cup = (dx) => {
    const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI);
    g.scale(0.0108, 0.0118, 0.0095);
    g.translate(RX + dx, CY - RP - 0.004, 0);
    return g;
  };
  const ridge = box(RX, CY - RP - 0.004, 0.003, 0.0016, 0.022, 0.006, 0.0004);
  const stem = box(RX, CY - 0.0585, 0.004, 0.008, 0.012, 0.008, 0.0008);
  const one = merge([cup(-0.0106), cup(0.0106), ridge, stem]);
  const cups = [];
  for (let i = 0; i < 16; i++) {
    const g = one.clone();
    g.translate(0, -CY, 0).applyMatrix4(new THREE.Matrix4().makeRotationX((i / 16) * Math.PI * 2)).translate(0, CY, 0);
    cups.push(g);
  }
  part('buckets', 'motion', ['runner_disk'], [{ g: merge(cups), mat: M.bronze }], [0, CY, 0]);

  const nut = tf.t(cylX(0.0125, RX - 0.024, RX - 0.016, 6, 0.0008), 0, CY, 0);
  part('runner_nut', 'motion', ['buckets'], [{ g: nut, mat: M.steel }], [0, CY, 0]);
}

// Eje, chumaceras y acople ---------------------------------------------------------------------
{
  const g = latheX([[0, RX - 0.026], [SHAFT_R, RX - 0.026], [SHAFT_R, GEN_X1 - 0.004], [0, GEN_X1 - 0.004]], 32);
  part('shaft', 'motion', ['bearing_left', 'bearing_right'], [{ g: tf.t(g, 0, CY, 0), mat: M.steel }], [0, CY, 0]);
  const pillow = (cx) => {
    const ped = box(cx, (BASE_T + CY - 0.012) / 2, 0, 0.016, CY - 0.012 - BASE_T, 0.05, 0.0012);
    const foot = box(cx, BASE_T + 0.003, 0, 0.022, 0.006, 0.066, 0.001);
    const ring = tf.t(latheX(ringProf(SHAFT_R + 0.0004, 0.021, cx - 0.008, cx + 0.008, 0.0012), 40), 0, CY, 0);
    const bolts = [-1, 1].map((s) => tf.t(cylY(0.0028, BASE_T + 0.006, BASE_T + 0.0095, 6, 0.0003), cx, 0, s * 0.026));
    return [{ g: merge([ped, foot, ring]), mat: M.base }, { g: merge(bolts), mat: M.steel }];
  };
  part('bearing_left', 'support', ['base_frame'], pillow(0.006));
  part('bearing_right', 'support', ['base_frame'], pillow(0.038));
  const half = (x0, x1) => latheX(ringProf(SHAFT_R, 0.021, x0, x1, 0.0008), 40);
  const bolts = [0, 1, 2, 3].map((i) => {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    return tf.t(cylX(0.0024, 0.0505, 0.0675, 8), 0, Math.sin(a) * 0.015, Math.cos(a) * 0.015);
  });
  part('coupling', 'motion', ['shaft', 'generator_rotor'], [{ g: tf.t(merge([half(0.051, 0.058), half(0.06, 0.067)]), 0, CY, 0), mat: M.steel }, { g: tf.t(merge(bolts), 0, CY, 0), mat: M.base }], [0, CY, 0]);
}

// Generador: estator (carcasa + bobinado), rotor, tapa y bombillo -------------------------------
{
  const it = [];
  it.push(latheX(ringProf(0.041, GEN_R, GEN_X0, GEN_X1, 0.0015), 56));
  // Aletas de enfriamiento.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    if (Math.abs(Math.sin(a) + 1) < 0.25) continue; // sin aletas abajo, donde van las patas
    const fin = box((GEN_X0 + GEN_X1) / 2, GEN_R + 0.003, 0, GEN_X1 - GEN_X0 - 0.012, 0.007, 0.0024, 0.0005);
    fin.applyMatrix4(new THREE.Matrix4().makeRotationX(a));
    it.push(fin);
  }
  const shellG = tf.t(merge(it), 0, CY, 0);
  const feet = [GEN_X0 + 0.014, GEN_X1 - 0.014].map((x) => merge([box(x, (BASE_T + CY - 0.04) / 2, 0, 0.014, CY - 0.04 - BASE_T, 0.05, 0.001), box(x, BASE_T + 0.003, 0, 0.02, 0.006, 0.07, 0.001)]));
  const windings = tf.t(merge([latheX(ringProf(0.035, 0.0405, GEN_X0 + 0.003, GEN_X0 + 0.009, 0.001), 40), latheX(ringProf(0.035, 0.0405, GEN_X1 - 0.009, GEN_X1 - 0.003, 0.001), 40)]), 0, CY, 0);
  part('generator_stator', 'power', ['base_frame'], [{ g: merge([shellG, ...feet]), mat: M.gen }, { g: windings, mat: M.copper }]);

  const core = latheX([[SHAFT_R + 0.0002, GEN_X0 + 0.012], [0.024, GEN_X0 + 0.012], [0.024, GEN_X1 - 0.012], [SHAFT_R + 0.0002, GEN_X1 - 0.012]], 40);
  const poles = [];
  for (let i = 0; i < 6; i++) {
    const p = box((GEN_X0 + GEN_X1) / 2, 0.0285, 0, GEN_X1 - GEN_X0 - 0.026, 0.009, 0.014, 0.001);
    p.applyMatrix4(new THREE.Matrix4().makeRotationX((i / 6) * Math.PI * 2));
    poles.push(p);
  }
  part('generator_rotor', 'power', ['generator_stator', 'shaft'], [{ g: tf.t(core, 0, CY, 0), mat: M.steel }, { g: tf.t(merge(poles), 0, CY, 0), mat: M.copper }], [0, CY, 0]);

  const cap = latheX([[SHAFT_R + 0.001, GEN_X1], [GEN_R, GEN_X1], [GEN_R, GEN_X1 + 0.004], [0.03, GEN_X1 + 0.008], [0.014, GEN_X1 + 0.009], [SHAFT_R + 0.001, GEN_X1 + 0.009]], 56);
  const vents = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2;
    return tf.t(cylX(0.0045, GEN_X1 + 0.0055, GEN_X1 + 0.0085, 12), 0, Math.sin(a) * 0.022, Math.cos(a) * 0.022);
  });
  part('generator_cap', 'power', ['generator_rotor'], [{ g: tf.t(cap, 0, CY, 0), mat: M.gen }, { g: tf.t(merge(vents), 0, CY, 0), mat: M.base }]);

  const lx = (GEN_X0 + GEN_X1) / 2, ly = CY + GEN_R + 0.006;
  const socket = merge([cylY(0.009, ly - 0.004, ly + 0.008, 24, 0.0008), lathe(ringProf(0.0062, 0.0074, ly + 0.008, ly + 0.014, 0.0003), 24)]);
  socket.translate(lx, 0, 0);
  const bulb = lathe([[0, ly + 0.012], [0.0062, ly + 0.013], [0.0068, ly + 0.017], [0.011, ly + 0.024], [0.0125, ly + 0.03], [0.011, ly + 0.036], [0.006, ly + 0.0405], [0, ly + 0.042]], 32);
  bulb.translate(lx, 0, 0);
  part('lamp', 'power', ['generator_stator'], [{ g: socket, mat: M.base }, { g: bulb, mat: M.glass }]);
}

// Inyector, aguja y deflector -------------------------------------------------------------------
{
  const body = latheZ([[0.0062, -0.069], [0.009, -0.069], [0.017, -0.095], [0.017, -0.118], [0.012, -0.124], [0.0062, -0.124], [0.0062, -0.069]], 40);
  const flange = latheZ(ringProf(0.009, 0.019, -0.093, -0.089, 0.0006), 32);
  part('nozzle', 'water', ['housing_lower'], [{ g: tf.t(merge([body, flange]), RX, JET_Y, 0), mat: M.steel }]);
  const spear = latheZ([[0, -0.064], [0.0042, -0.071], [0.0045, -0.074], [0.0028, -0.08], [0.0028, -0.138], [0, -0.138]], 24);
  const knob = latheZ([[0, -0.152], [0.0075, -0.152], [0.0075, -0.138], [0, -0.138]], 20);
  part('needle', 'water', ['nozzle'], [{ g: tf.t(merge([spear, knob]), RX, JET_Y, 0), mat: M.base }]);
  // Deflector: chapa curva sobre el chorro, con su bisagra.
  const plate = extrudeX(shape([...arcPts(0, 0, 0.016, -0.25, 0.9, 10), ...arcPts(0, 0, 0.0135, 0.9, -0.25, 10)]), RX - 0.009, RX + 0.009, 0.0004);
  plate.translate(0, JET_Y + 0.004, -0.06);
  const hinge = tf.t(cylX(0.0022, RX - 0.011, RX + 0.011, 10), 0, JET_Y + 0.019, -0.062);
  part('deflector', 'water', ['nozzle'], [{ g: merge([plate, hinge]), mat: M.steel }]);
}

// Tubería forzada, válvula y manómetro -----------------------------------------------------------
const PIPE_TOP = 0.2;
{
  const c = curveFrom([[RX, JET_Y + 0.012, -0.112], [RX, JET_Y + 0.04, -0.128], [RX, 0.15, -0.146], [RX, PIPE_TOP, -0.15]]);
  const pipe = thickTube(c, 0.0105, 0.0085, 48, 20);
  const fl = latheZ(ringProf(0.0085, 0.0145, -0.002, 0.002, 0.0004), 24);
  fl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), c.getTangent(0)));
  const p0 = c.getPoint(0);
  fl.translate(p0.x, p0.y, p0.z);
  part('penstock', 'water', ['nozzle'], [{ g: merge([pipe, fl]), mat: M.housing }]);

  const vb = merge([cylY(0.0145, PIPE_TOP, PIPE_TOP + 0.024, 32, 0.0012), lathe(ringProf(0.0085, 0.0165, PIPE_TOP - 0.002, PIPE_TOP + 0.002, 0.0004), 32), cylY(0.0105, PIPE_TOP + 0.024, PIPE_TOP + 0.034, 24)]);
  vb.translate(RX, 0, -0.15);
  const stem = tf.t(cylX(0.003, RX + 0.014, RX + 0.034, 12), 0, PIPE_TOP + 0.012, -0.15);
  part('valve_body', 'water', ['penstock'], [{ g: vb, mat: M.base }, { g: stem, mat: M.steel }]);

  const rim = latheX(ringProf(0.0145, 0.0172, RX + 0.034, RX + 0.038, 0.0008), 40);
  const spokes = [0, 1, 2].map((i) => {
    const s = box(RX + 0.036, 0.0075, 0, 0.003, 0.015, 0.0028, 0.0004);
    s.applyMatrix4(new THREE.Matrix4().makeRotationX((i / 3) * Math.PI * 2));
    return s;
  });
  const hub = cylX(0.0045, RX + 0.033, RX + 0.039, 16, 0.0005);
  part('valve_wheel', 'water', ['valve_body'], [{ g: tf.t(merge([rim, ...spokes, hub]), 0, PIPE_TOP + 0.012, -0.15), mat: M.gen }]);

  // Manómetro sobre la tubería (frente hacia +Z).
  const gy = 0.135, gz = -0.133;
  const neck = cylY(0.0028, gy - 0.008, gy + 0.004, 12);
  neck.translate(RX + 0.012, 0, gz);
  const dial = latheZ([[0, gz - 0.004], [0.0125, gz - 0.004], [0.0135, gz - 0.002], [0.0135, gz + 0.004], [0, gz + 0.004]], 32);
  dial.translate(RX + 0.012, gy + 0.016, 0);
  const face = cylZ(0.0112, gz + 0.004, gz + 0.0046, 32);
  face.translate(RX + 0.012, gy + 0.016, 0);
  const needleG = box(RX + 0.016, gy + 0.019, gz + 0.0052, 0.009, 0.0014, 0.0008, 0.0002);
  part('pressure_gauge', 'water', ['penstock'], [{ g: merge([neck, dial]), mat: M.steel }, { g: face, mat: M.glass }, { g: needleG, mat: M.gen }]);
}

// ─── Explosión, nodos, anclas y clip ───────────────────────────────
deriveOrder(parts);
benchLayout(parts, { fixed: 'base_frame' });
const { nodes, tris } = emitParts(B, parts, ID);
B.node('anchor_label_top', { t: [0, 0.26, 0] });
B.node('anchor_jet_start', { t: [RX, JET_Y, -0.066] });
B.node('anchor_jet_end', { t: [RX, JET_Y, -0.002] });
B.node('anchor_lamp', { t: [(GEN_X0 + GEN_X1) / 2, CY + GEN_R + 0.033, 0] });

{
  const DUR = 3;
  // La parte de abajo de la rueda avanza con el chorro (+Z): giro negativo sobre X.
  const { times, values } = spinX(DUR, -2);
  const ch = ['runner_disk', 'buckets', 'runner_nut', 'shaft', 'coupling', 'generator_rotor'].map((id) => ({ node: nodes[id].pivot, path: 'rotation', times, values }));
  B.clip('anim_run', ch, { loop: true, turns: 2 });
}

mkdirSync(dirname(OUT), { recursive: true });
await B.write(OUT);
console.log(`${ID}: ${parts.length} piezas, ${tris} tris → ${OUT}`);
