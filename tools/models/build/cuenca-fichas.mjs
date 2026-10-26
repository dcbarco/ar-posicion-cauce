// Fichas de uso del territorio para Cuenca Viva — modelos procedurales propios (Agente 2).
// Salida: assets-src/cuenca/<id>.src.glb  →  optimize  →  public/models/cuenca/<id>.glb
//
// Cada ficha: disco base Ø 11 cm (huella ≤ 12 cm), origen en el centro de la base, Y arriba, frente +Z.
// Nodos: geo_base (disco + borde de color de la ficha), geo_detail (lo que la identifica), geo_water (agua, si hay),
// anchor_label_top (ficha flotante) y anclas de efectos (anchor_smoke_*, anchor_water). Estilo low-poly facetado.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  THREE, DEG, arcPts, roundRectPts, shape, extrudeX, extrudeY, extrudeZ, lathe, ringProf, cylY, box, crease,
  merge, normalize, curveFrom, solidTube,
} from '../lib/geo.mjs';
import { GlbBuilder } from '../lib/gltf.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE_R = 0.055, BASE_H = 0.008;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const facet = (g) => crease(g, 1 * DEG);
const at = (g, x, y, z, ry = 0, s = 1) => {
  const n = normalize(g.clone());
  n.scale(s, s, s);
  n.rotateY(ry);
  n.translate(x, y, z);
  return n;
};
/** Puntos aleatorios dentro del disco (radio máx `r`), evitando zonas. */
function scatter(rand, n, r, avoid = () => false, minD = 0) {
  const pts = [];
  let guard = 0;
  while (pts.length < n && guard++ < n * 200) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
    const p = [Math.cos(a) * d, Math.sin(a) * d];
    if (avoid(p)) continue;
    if (minD && pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < minD)) continue;
    pts.push(p);
  }
  return pts;
}

/** Disco base con chaflán + anillo de color (identidad de la ficha). */
function baseDisc() {
  const disc = lathe([[0, 0], [BASE_R - 0.002, 0], [BASE_R, 0.002], [BASE_R, BASE_H - 0.0015], [BASE_R - 0.0015, BASE_H], [0, BASE_H]], 56);
  const rim = lathe(ringProf(BASE_R - 0.0005, BASE_R + 0.0008, 0.0025, 0.0055, 0.0004), 56);
  return { disc, rim };
}
/** Hoja/aguja: tira estrecha que sale de (0,0,0) por +X, con inclinación y caída. */
function leaf(len, width, tilt, droop = 0.3, steps = 4) {
  const pos = [];
  const pt = (t, side) => {
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7 * (1 - t * 0.3);
    const x = t * len * Math.cos(tilt);
    const y = t * len * Math.sin(tilt) - droop * len * t * t;
    return [x, y, side * w * 0.5];
  };
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const a = pt(t0, -1), b = pt(t0, 1), c = pt(t1, -1), d = pt(t1, 1);
    pos.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const blob = (r, detail = 1) => facet(new THREE.IcosahedronGeometry(r, detail));

// ─── Fichas ────────────────────────────────────────────────────────────

const FICHAS = {
  cuenca_paramo(B) {
    const rand = rng(11);
    const M = {
      soil: B.material('suelo_paramo', { color: '#6E6A4C', roughness: 0.95 }),
      rim: B.material('borde_paramo', { color: '#8FA0B8', roughness: 0.5 }),
      grass: B.material('pajonal', { color: '#A39A5C', roughness: 0.9, doubleSided: true }),
      leaf: B.material('frailejon_hoja', { color: '#BFC7B0', roughness: 0.75, doubleSided: true }),
      trunk: B.material('frailejon_tallo', { color: '#5E4C3B', roughness: 0.9 }),
      rock: B.material('roca', { color: '#7D7F80', roughness: 0.85 }),
    };
    const { disc, rim } = baseDisc();
    const det = { leaf: [], trunk: [], grass: [], rock: [] };
    const plants = scatter(rand, 7, 0.042, () => false, 0.022);
    for (const [x, z] of plants) {
      const h = 0.018 + rand() * 0.02;
      // Tallo con hojas secas (marcescentes): conos apilados.
      for (let k = 0; k < 4; k++) {
        const y0 = BASE_H + (k * h) / 4;
        det.trunk.push(facet(lathe([[0.0045 - k * 0.0003, y0], [0.0052 - k * 0.0003, y0 + h / 8], [0.0036, y0 + h / 4 + 0.001], [0, y0 + h / 4 + 0.001], [0, y0]], 7)).translate(x, 0, z));
      }
      // Roseta: 3 coronas de hojas lanceoladas plateadas.
      const top = BASE_H + h;
      for (let ring = 0; ring < 3; ring++) {
        const n = 11 + ring * 3;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring * 0.37 + rand() * 0.2;
          const len = 0.011 + ring * 0.0025 + rand() * 0.002;
          const tilt = (70 - ring * 22) * DEG;
          det.leaf.push(at(leaf(len, 0.0032, tilt, 0.25 + ring * 0.15), x, top - ring * 0.0012, z, a));
        }
      }
    }
    // Pajonal: matas de hojas finas.
    for (const [x, z] of scatter(rand, 36, 0.05, (p) => plants.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01))) {
      for (let i = 0; i < 7; i++) det.grass.push(at(leaf(0.008 + rand() * 0.006, 0.0012, (55 + rand() * 25) * DEG, 0.5, 3), x, BASE_H, z, rand() * Math.PI * 2));
    }
    for (const [x, z] of scatter(rand, 5, 0.048, (p) => plants.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.012))) {
      det.rock.push(at(blob(0.004 + rand() * 0.004, 0), x, BASE_H, z, rand() * 3, 1).scale(1, 0.6, 1));
    }
    return {
      geo: {
        geo_base: [{ g: disc, mat: M.soil }, { g: rim, mat: M.rim }],
        geo_detail: [{ g: merge(det.leaf), mat: M.leaf }, { g: merge(det.trunk), mat: M.trunk }, { g: merge(det.grass), mat: M.grass }, { g: merge(det.rock), mat: M.rock }],
      },
      anchors: { label_top: [0, 0.07, 0] },
    };
  },

  cuenca_bosque(B) {
    const rand = rng(23);
    const M = {
      soil: B.material('suelo_bosque', { color: '#4C5A3A', roughness: 0.95 }),
      rim: B.material('borde_bosque', { color: '#2F7D4A', roughness: 0.5 }),
      leaf1: B.material('copa_oscura', { color: '#2E6B3A', roughness: 0.8 }),
      leaf2: B.material('copa_clara', { color: '#5E9446', roughness: 0.8 }),
      trunk: B.material('tronco', { color: '#5A4332', roughness: 0.9 }),
      fern: B.material('helecho', { color: '#7FAE4E', roughness: 0.8, doubleSided: true }),
    };
    const { disc, rim } = baseDisc();
    const d = { l1: [], l2: [], trunk: [], fern: [] };
    const trees = scatter(rand, 8, 0.043, () => false, 0.019);
    trees.forEach(([x, z], i) => {
      const h = 0.03 + rand() * 0.025;
      d.trunk.push(facet(lathe([[0, BASE_H], [0.0028, BASE_H], [0.0016, BASE_H + h], [0, BASE_H + h]], 7)).translate(x, 0, z));
      const target = i % 2 ? d.l1 : d.l2;
      for (let k = 0; k < 4; k++) {
        const r = 0.008 + rand() * 0.005;
        const ox = (rand() - 0.5) * 0.009, oz = (rand() - 0.5) * 0.009;
        target.push(at(blob(r, 1), x + ox, BASE_H + h - 0.004 + k * 0.004 - (k > 1 ? 0.006 : 0), z + oz, rand() * 3).scale(1, 1, 1));
      }
    });
    // Sotobosque: helechos.
    for (const [x, z] of scatter(rand, 30, 0.05, (p) => trees.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.006))) {
      for (let i = 0; i < 5; i++) d.fern.push(at(leaf(0.007 + rand() * 0.004, 0.003, 40 * DEG, 0.6, 4), x, BASE_H, z, (i / 5) * Math.PI * 2 + rand()));
    }
    return {
      geo: {
        geo_base: [{ g: disc, mat: M.soil }, { g: rim, mat: M.rim }],
        geo_detail: [{ g: merge(d.l1), mat: M.leaf1 }, { g: merge(d.l2), mat: M.leaf2 }, { g: merge(d.trunk), mat: M.trunk }, { g: merge(d.fern), mat: M.fern }],
      },
      anchors: { label_top: [0, 0.08, 0] },
    };
  },

  cuenca_humedal(B) {
    const rand = rng(37);
    const M = {
      soil: B.material('lodo', { color: '#4E4A36', roughness: 0.9 }),
      rim: B.material('borde_humedal', { color: '#3FA7A0', roughness: 0.5 }),
      water: B.material('agua_humedal', { color: '#2F6F7A', roughness: 0.08, metallic: 0.1 }),
      reed: B.material('junco', { color: '#6F8B3C', roughness: 0.8, doubleSided: true }),
      cattail: B.material('espadana', { color: '#6B4A2E', roughness: 0.85 }),
      pad: B.material('hoja_flotante', { color: '#4E8F43', roughness: 0.6 }),
    };
    const { disc, rim } = baseDisc();
    // Espejo de agua irregular, apenas sobre el disco.
    const poolPts = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 0.032 + 0.006 * Math.sin(a * 3 + 1) + 0.003 * Math.sin(a * 5);
      poolPts.push([Math.cos(a) * r - 0.004, Math.sin(a) * r + 0.002]);
    }
    const water = extrudeY(shape(poolPts), BASE_H - 0.001, BASE_H + 0.0012, 0);
    const inPool = ([x, z]) => {
      const a = Math.atan2(-z - 0.002, x + 0.004);
      const r = 0.032 + 0.006 * Math.sin(a * 3 + 1) + 0.003 * Math.sin(a * 5);
      return Math.hypot(x + 0.004, -z - 0.002) < r + 0.002;
    };
    const d = { reed: [], cat: [], pad: [] };
    for (const [x, z] of scatter(rand, 40, 0.052, (p) => inPool(p) && rand() > 0.15)) {
      const n = 6 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        const h = 0.016 + rand() * 0.018;
        d.reed.push(at(leaf(h, 0.0011, (78 + rand() * 10) * DEG, 0.08, 4), x, BASE_H, z, rand() * Math.PI * 2));
      }
      if (rand() > 0.55) {
        const h = 0.022 + rand() * 0.012;
        d.cat.push(cylY(0.0004, BASE_H, BASE_H + h, 4).translate(x, 0, z));
        d.cat.push(lathe([[0, 0], [0.0014, 0.0008], [0.0016, 0.0045], [0.0012, 0.0062], [0, 0.0066]], 7).translate(x, BASE_H + h - 0.006, z));
      }
    }
    for (const [x, z] of scatter(rand, 9, 0.03, (p) => !inPool(p), 0.008)) {
      const r = 0.0028 + rand() * 0.002;
      const pad = extrudeY(shape([[0, 0], ...arcPts(0, 0, r, 0.35, Math.PI * 2 - 0.05, 12)]), 0, 0.0006, 0);
      d.pad.push(at(pad, x, BASE_H + 0.0012, z, rand() * 6));
    }
    return {
      geo: {
        geo_base: [{ g: disc, mat: M.soil }, { g: rim, mat: M.rim }],
        geo_water: [{ g: water, mat: M.water }],
        geo_detail: [{ g: merge(d.reed), mat: M.reed }, { g: merge(d.cat), mat: M.cattail }, { g: merge(d.pad), mat: M.pad }],
      },
      anchors: { label_top: [0, 0.06, 0], water: [-0.004, BASE_H + 0.0012, -0.002] },
    };
  },

  cuenca_cultivo(B) {
    const rand = rng(41);
    const M = {
      soil: B.material('tierra_arada', { color: '#7A5638', roughness: 0.95 }),
      rim: B.material('borde_cultivo', { color: '#E0B34A', roughness: 0.5 }),
      crop: B.material('cafe', { color: '#3E7D35', roughness: 0.75 }),
      potato: B.material('papa', { color: '#8DB04F', roughness: 0.8 }),
      fruit: B.material('cereza_cafe', { color: '#B8332B', roughness: 0.5 }),
      wood: B.material('madera', { color: '#8A6A47', roughness: 0.85 }),
    };
    const { disc, rim } = baseDisc();
    const d = { ridge: [], crop: [], potato: [], fruit: [], wood: [] };
    // Surcos (camellones) a lo largo de X, recortados al disco.
    const ridgeSh = shape([[-0.0035, 0], [0.0035, 0], [0.0012, 0.0035], [-0.0012, 0.0035]]);
    for (let i = -5; i <= 5; i++) {
      const z = i * 0.0085;
      const half = Math.sqrt(Math.max(0, (BASE_R - 0.004) ** 2 - z * z));
      if (half < 0.006) continue;
      const g = extrudeX(ridgeSh, -half, half, 0.0006);
      g.translate(0, BASE_H, z);
      d.ridge.push(g);
      // Mitad café (arbustos con cerezas), mitad papa (matas bajas).
      const n = Math.floor((half * 2) / 0.0085);
      for (let k = 0; k < n; k++) {
        const x = -half + 0.004 + k * 0.0085 + (rand() - 0.5) * 0.002;
        const y = BASE_H + 0.0035;
        if (i < 0) {
          const s = 0.0035 + rand() * 0.0012;
          d.crop.push(at(blob(s, 1), x, y + s * 0.9, z, rand() * 3).scale(1, 1.25, 1));
          for (let f = 0; f < 2; f++) {
            const a = rand() * Math.PI * 2;
            d.fruit.push(at(blob(0.0008, 0), x + Math.cos(a) * s * 0.95, y + s * (0.6 + rand() * 0.8), z + Math.sin(a) * s * 0.95, 0));
          }
        } else {
          const s = 0.0026 + rand() * 0.001;
          d.potato.push(at(blob(s, 0), x, y + s * 0.5, z, rand() * 3).scale(1, 0.7, 1));
        }
      }
    }
    // Espantapájaros/poste y cerca en el borde.
    d.wood.push(cylY(0.0007, BASE_H, BASE_H + 0.028, 6).translate(0.02, 0, 0.004));
    d.wood.push(box(0.02, BASE_H + 0.022, 0.004, 0.016, 0.0012, 0.0012, 0.0002));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      d.wood.push(cylY(0.0006, BASE_H, BASE_H + 0.007, 5).translate(Math.cos(a) * 0.051, 0, Math.sin(a) * 0.051));
    }
    return {
      geo: {
        geo_base: [{ g: merge([disc, ...d.ridge]), mat: M.soil }, { g: rim, mat: M.rim }],
        geo_detail: [{ g: merge(d.crop), mat: M.crop }, { g: merge(d.potato), mat: M.potato }, { g: merge(d.fruit), mat: M.fruit }, { g: merge(d.wood), mat: M.wood }],
      },
      anchors: { label_top: [0, 0.05, 0] },
    };
  },

  cuenca_ciudad(B) {
    const rand = rng(53);
    const M = {
      ground: B.material('pavimento', { color: '#6B6E70', roughness: 0.85 }),
      rim: B.material('borde_ciudad', { color: '#D9822B', roughness: 0.5 }),
      wall: B.material('fachada', { color: '#E3D9C6', roughness: 0.7 }),
      wall2: B.material('fachada_color', { color: '#C9785A', roughness: 0.7 }),
      roof: B.material('teja', { color: '#A4472F', roughness: 0.6 }),
      glass: B.material('ventanas', { color: '#2C4A5C', roughness: 0.15, metallic: 0.3 }),
    };
    const { disc, rim } = baseDisc();
    const d = { wall: [], wall2: [], roof: [], glass: [], street: [] };
    // Calles en cruz (franjas claras).
    d.street.push(box(0, BASE_H + 0.0003, 0, 0.104, 0.0006, 0.007, 0.0002), box(0, BASE_H + 0.0003, 0, 0.007, 0.0006, 0.104, 0.0002));
    const blocks = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sz] of blocks) {
      for (let i = 0; i < 4; i++) {
        const cx = sx * (0.012 + (i % 2) * 0.017) + (rand() - 0.5) * 0.002;
        const cz = sz * (0.012 + Math.floor(i / 2) * 0.017) + (rand() - 0.5) * 0.002;
        if (Math.hypot(Math.abs(cx) + 0.008, Math.abs(cz) + 0.008) > BASE_R - 0.002) continue;
        const tall = rand() > 0.6;
        const w = 0.012 + rand() * 0.003, dpt = 0.012 + rand() * 0.003, h = tall ? 0.03 + rand() * 0.02 : 0.009 + rand() * 0.006;
        (rand() > 0.5 ? d.wall : d.wall2).push(box(cx, BASE_H + h / 2, cz, w, h, dpt, 0.0006));
        if (tall) {
          // Fajas de ventanas en las 4 caras.
          for (let f = 0; f < Math.floor(h / 0.0065); f++) {
            const y = BASE_H + 0.004 + f * 0.0065;
            d.glass.push(box(cx, y, cz, w + 0.0004, 0.0018, dpt + 0.0004, 0.0001));
          }
          d.wall.push(box(cx, BASE_H + h + 0.0015, cz, w * 0.5, 0.003, dpt * 0.5, 0.0004));
        } else {
          // Casas con techo a dos aguas.
          const roof = extrudeX(shape([[-dpt / 2 - 0.001, 0], [dpt / 2 + 0.001, 0], [0, 0.006]]), -w / 2 - 0.001, w / 2 + 0.001, 0.0003);
          roof.translate(cx, BASE_H + h, cz);
          d.roof.push(roof);
          for (const s of [-1, 1]) for (const k of [-1, 1]) d.glass.push(box(cx + k * w * 0.25, BASE_H + h * 0.55, cz + s * (dpt / 2 + 0.0002), 0.003, 0.0035, 0.0006, 0.0001));
        }
      }
    }
    // Iglesia en la plaza (esquina) y árboles de la plaza.
    const tower = merge([box(-0.034, BASE_H + 0.017, 0.022, 0.007, 0.034, 0.007, 0.0005), lathe([[0, 0], [0.0052, 0], [0, 0.009]], 4).rotateY(Math.PI / 4).translate(-0.034, BASE_H + 0.034, 0.022)]);
    d.wall.push(tower);
    return {
      geo: {
        geo_base: [{ g: disc, mat: M.ground }, { g: rim, mat: M.rim }, { g: merge(d.street), mat: M.wall }],
        geo_detail: [{ g: merge(d.wall), mat: M.wall }, { g: merge(d.wall2), mat: M.wall2 }, { g: merge(d.roof), mat: M.roof }, { g: merge(d.glass), mat: M.glass }],
      },
      anchors: { label_top: [0, 0.075, 0], sewage: [0.05, BASE_H, 0] },
    };
  },

  cuenca_industria(B) {
    const M = {
      ground: B.material('concreto', { color: '#8A8C86', roughness: 0.85 }),
      rim: B.material('borde_industria', { color: '#7A5BA6', roughness: 0.5 }),
      shed: B.material('nave', { color: '#B9BDC0', roughness: 0.55, metallic: 0.4 }),
      roof: B.material('techo_nave', { color: '#4E6D7A', roughness: 0.5, metallic: 0.5 }),
      red: B.material('franja_roja', { color: '#B23A2E', roughness: 0.5 }),
      dark: B.material('tuberia', { color: '#45484C', roughness: 0.45, metallic: 0.8 }),
    };
    const { disc, rim } = baseDisc();
    const d = { shed: [], roof: [], red: [], white: [], dark: [] };
    // Nave con techo en diente de sierra.
    d.shed.push(box(-0.008, BASE_H + 0.009, -0.012, 0.05, 0.018, 0.032, 0.0006));
    for (let i = 0; i < 5; i++) {
      const x = -0.03 + i * 0.01;
      const saw = extrudeZ(shape([[0, 0], [0.01, 0], [0.01, 0.0075]]), -0.028, 0.004, 0.0003);
      saw.translate(x - 0.003, BASE_H + 0.018, 0);
      d.roof.push(saw);
      d.dark.push(box(x + 0.0068, BASE_H + 0.0215, -0.012, 0.0008, 0.0055, 0.031, 0.0001));
    }
    // Chimeneas con franjas (rojo/blanco).
    const stacks = [[0.026, -0.022, 0.06], [0.036, -0.004, 0.048]];
    const smoke = {};
    stacks.forEach(([x, z, h], i) => {
      const segs = 6;
      for (let s = 0; s < segs; s++) {
        const y0 = BASE_H + (s * h) / segs, y1 = BASE_H + ((s + 1) * h) / segs;
        const r0 = 0.0042 - (s * 0.0012) / segs, r1 = 0.0042 - ((s + 1) * 0.0012) / segs;
        const g = lathe([[0, y0], [r0, y0], [r1, y1], [0, y1]], 28).translate(x, 0, z);
        (s % 2 ? d.red : d.white).push(g);
      }
      d.dark.push(lathe(ringProf(0.0024, 0.0034, BASE_H + h, BASE_H + h + 0.0015, 0.0002), 16).translate(x, 0, z));
      smoke[`smoke_${i + 1}`] = [x, BASE_H + h + 0.002, z];
    });
    // Tanques y tuberías.
    for (const [x, z, r] of [[-0.024, 0.024, 0.0075], [-0.006, 0.03, 0.0062]]) {
      d.shed.push(lathe([[0, 0], [r, 0], [r, 0.014], [r * 0.6, 0.0175], [0, 0.0185]], 40).translate(x, BASE_H, z));
      d.red.push(lathe(ringProf(r, r + 0.0004, 0.006, 0.008, 0), 24).translate(x, BASE_H, z));
    }
    d.dark.push(solidTube(curveFrom([[-0.016, BASE_H + 0.01, 0.024], [0.0, BASE_H + 0.016, 0.018], [0.018, BASE_H + 0.012, 0.006], [0.026, BASE_H + 0.008, -0.01]]), 0.0012, 24, 8));
    // Vertimiento hacia el borde (canal) — lo usa la UI para el efecto de carga contaminante.
    d.dark.push(solidTube(curveFrom([[0.012, BASE_H + 0.002, 0.01], [0.03, BASE_H + 0.0015, 0.03], [0.046, BASE_H + 0.0012, 0.026]]), 0.0016, 16, 8));
    return {
      geo: {
        geo_base: [{ g: disc, mat: M.ground }, { g: rim, mat: M.rim }],
        geo_detail: [{ g: merge(d.shed), mat: M.shed }, { g: merge(d.roof), mat: M.roof }, { g: merge(d.red), mat: M.red }, { g: merge(d.white), mat: M.shed }, { g: merge(d.dark), mat: M.dark }],
      },
      anchors: { label_top: [0, 0.085, 0], ...smoke, outfall: [0.047, BASE_H + 0.0012, 0.026] },
    };
  },

  cuenca_represa(B) {
    const rand = rng(79);
    const M = {
      ground: B.material('ladera', { color: '#5F6B45', roughness: 0.9 }),
      rim: B.material('borde_represa', { color: '#2E6FB5', roughness: 0.5 }),
      concrete: B.material('concreto_presa', { color: '#BDB8AC', roughness: 0.75 }),
      water: B.material('embalse', { color: '#2C5E86', roughness: 0.06, metallic: 0.1 }),
      roof: B.material('casa_maquinas', { color: '#C6532F', roughness: 0.55 }),
      steel: B.material('compuertas', { color: '#4A5056', roughness: 0.4, metallic: 0.8 }),
    };
    const { disc, rim } = baseDisc();
    const d = { ground: [], conc: [], water: [], roof: [], steel: [] };
    // Laderas a los lados del cañón (el río corre a lo largo de X: aguas arriba −X → aguas abajo +X).
    for (const s of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        const x = -0.045 + i * 0.009;
        const zz = s * (0.034 + rand() * 0.006);
        const r = 0.011 + rand() * 0.004;
        if (Math.hypot(x, zz) + r > BASE_R + 0.001) continue;
        d.ground.push(at(blob(r, 2), x, 0, zz, rand() * 3).scale(1, 0.62, 1).translate(0, BASE_H + 0.001, 0));
      }
    }
    // Presa en arco (convexa aguas arriba) con coronación.
    const arc = [];
    const R = 0.05, a0 = -0.6, a1 = 0.6;
    const outer = arcPts(0.034, 0, R, Math.PI - a1, Math.PI - a0, 20);
    const inner = arcPts(0.034, 0, R - 0.006, Math.PI - a0, Math.PI - a1, 20);
    arc.push(...outer, ...inner);
    const wall = extrudeY(shape(arc.map(([x, z]) => [x, -z])), BASE_H - 0.001, BASE_H + 0.026, 0.0006);
    d.conc.push(wall);
    const crest = extrudeY(shape([...arcPts(0.034, 0, R + 0.0012, Math.PI - a1, Math.PI - a0, 20), ...arcPts(0.034, 0, R - 0.0072, Math.PI - a0, Math.PI - a1, 20)].map(([x, z]) => [x, -z])), BASE_H + 0.026, BASE_H + 0.028, 0.0004);
    d.conc.push(crest);
    // Vertedero (escalones) en el centro y compuertas.
    for (let k = 0; k < 4; k++) d.conc.push(box(-0.012 + 0.006 + k * 0.004, BASE_H + 0.02 - k * 0.006, 0, 0.004, 0.003, 0.012, 0.0003));
    for (const z of [-0.006, 0, 0.006]) d.steel.push(box(-0.0145, BASE_H + 0.024, z, 0.0015, 0.006, 0.004, 0.0002));
    // Embalse aguas arriba: lámina de agua entre laderas y la presa.
    const res = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI / 2 + (i / 24) * Math.PI;
      res.push([Math.cos(a) * 0.05, Math.sin(a) * 0.033]);
    }
    const resG = extrudeY(shape([...res, ...arcPts(0.034, 0, R - 0.0055, Math.PI + 0.72, Math.PI - 0.72, 12)].map(([x, z]) => [x, -z])), BASE_H - 0.001, BASE_H + 0.021, 0);
    d.water.push(resG);
    // Casa de máquinas aguas abajo + tubería forzada + río de salida.
    d.conc.push(box(0.03, BASE_H + 0.006, 0.012, 0.014, 0.012, 0.011, 0.0005));
    d.roof.push(box(0.03, BASE_H + 0.0128, 0.012, 0.0155, 0.0018, 0.0125, 0.0003));
    d.steel.push(solidTube(curveFrom([[-0.004, BASE_H + 0.016, 0.012], [0.01, BASE_H + 0.01, 0.012], [0.023, BASE_H + 0.006, 0.012]]), 0.0016, 16, 8));
    const outflow = extrudeY(shape([[0.0, 0.006], [0.054, 0.007], [0.054, -0.007], [0.0, -0.006]]), BASE_H - 0.001, BASE_H + 0.0008, 0);
    d.water.push(outflow);
    return {
      geo: {
        geo_base: [{ g: merge([disc, ...d.ground]), mat: M.ground }, { g: rim, mat: M.rim }],
        geo_water: [{ g: merge(d.water), mat: M.water }],
        geo_detail: [{ g: merge(d.conc), mat: M.concrete }, { g: merge(d.roof), mat: M.roof }, { g: merge(d.steel), mat: M.steel }],
      },
      anchors: { label_top: [0, 0.06, 0], spillway: [0.002, BASE_H + 0.012, 0], turbine: [0.03, BASE_H + 0.013, 0.012] },
    };
  },

  cuenca_ptar(B) {
    const rand = rng(97);
    const M = {
      ground: B.material('cesped', { color: '#6E8F4A', roughness: 0.9 }),
      rim: B.material('borde_ptar', { color: '#3FB6D9', roughness: 0.5 }),
      concrete: B.material('concreto_ptar', { color: '#C9C6BD', roughness: 0.75 }),
      water: B.material('agua_tratada', { color: '#3E8FA6', roughness: 0.06, metallic: 0.1 }),
      dirty: B.material('agua_cruda', { color: '#6B6A45', roughness: 0.2 }),
      steel: B.material('puente_metal', { color: '#E0A93A', roughness: 0.45, metallic: 0.6 }),
    };
    const { disc, rim } = baseDisc();
    const d = { conc: [], water: [], dirty: [], steel: [] };
    // Dos clarificadores circulares (uno con puente giratorio) + sedimentador rectangular + edificio.
    const clar = [[-0.02, -0.016, 0.017], [0.021, -0.02, 0.014]];
    clar.forEach(([x, z, r], i) => {
      d.conc.push(lathe([[r - 0.0015, BASE_H - 0.001], [r + 0.0012, BASE_H - 0.001], [r + 0.0012, BASE_H + 0.007], [r - 0.0015, BASE_H + 0.007], [r - 0.0015, BASE_H + 0.004], [0, BASE_H + 0.004]].reverse(), 64).translate(x, 0, z));
      (i === 0 ? d.dirty : d.water).push(cylY(r - 0.0014, BASE_H + 0.004, BASE_H + 0.0062, 40).translate(x, 0, z));
      d.conc.push(cylY(0.0022, BASE_H + 0.004, BASE_H + 0.009, 12).translate(x, 0, z));
    });
    // Puente giratorio del primer clarificador (nodo animado aparte).
    const bridge = merge([
      box(0.0085, 0.0065, 0, 0.017, 0.0012, 0.0022, 0.0002),
      box(0.0085, 0.0085, 0, 0.017, 0.0006, 0.0006, 0.0001),
      cylY(0.0008, 0.002, 0.0065, 6).translate(0.016, 0, 0),
    ]);
    // Sedimentador rectangular y canal.
    d.conc.push(extrudeY(shape(roundRectPts(0.002, -0.026, 0.05, 0.016, 0.001, 1), [roundRectPts(0.002, -0.026, 0.047, 0.013, 0.0008, 1)]), BASE_H - 0.001, BASE_H + 0.006, 0.0004));
    d.water.push(box(0.002, BASE_H + 0.004, 0.026, 0.047, 0.003, 0.013, 0.0002));
    for (let k = 0; k < 5; k++) d.conc.push(box(-0.018 + k * 0.01, BASE_H + 0.0045, 0.026, 0.0008, 0.003, 0.013, 0.0001));
    // Edificio de control y árboles.
    d.conc.push(box(0.033, BASE_H + 0.0065, 0.008, 0.014, 0.013, 0.012, 0.0006));
    d.steel.push(box(0.033, BASE_H + 0.0135, 0.008, 0.0155, 0.0015, 0.0135, 0.0003));
    const trees = [];
    for (const [x, z] of scatter(rand, 6, 0.05, ([x, z]) => Math.hypot(x, z) < 0.043 || z < 0.0)) trees.push(at(blob(0.0045, 2), x, BASE_H + 0.006, z, rand() * 3));
    return {
      geo: {
        geo_base: [{ g: disc, mat: M.ground }, { g: rim, mat: M.rim }],
        geo_water: [{ g: merge(d.water), mat: M.water }, { g: merge(d.dirty), mat: M.dirty }],
        geo_detail: [{ g: merge(d.conc), mat: M.concrete }, { g: merge(d.steel), mat: M.steel }, { g: merge(trees), mat: M.ground }],
      },
      pivot: { name: 'pivot_clarifier', at: [clar[0][0], BASE_H, clar[0][1]], items: [{ g: bridge, mat: M.steel }], spin: 12 },
      anchors: { label_top: [0, 0.05, 0], water: [0.002, BASE_H + 0.006, 0.026] },
    };
  },
};

// ─── Construcción ─────────────────────────────────────────────────────────
const only = process.argv.slice(2);
for (const [id, fn] of Object.entries(FICHAS)) {
  if (only.length && !only.includes(id)) continue;
  const B = new GlbBuilder(id, { cauce: { model: id, author: 'Mesa CAUCE · Agente 2', license: 'own' } });
  const spec = fn(B);
  let tris = 0;
  for (const [name, items] of Object.entries(spec.geo)) {
    const clean = items.filter((i) => i.g);
    B.node(name).setMesh(B.mesh(name.slice(4), clean));
    tris += clean.reduce((a, { g }) => a + normalize(g).attributes.position.count / 3, 0);
  }
  if (spec.pivot) {
    const pv = B.node(spec.pivot.name, { t: spec.pivot.at });
    B.node(`geo_${spec.pivot.name.slice(6)}`, {}, pv).setMesh(B.mesh(spec.pivot.name.slice(6), spec.pivot.items));
    tris += spec.pivot.items.reduce((a, { g }) => a + normalize(g).attributes.position.count / 3, 0);
    // anim_idle: el puente da una vuelta en `spin` segundos (bucle).
    const N = 33, times = new Float32Array(N), vals = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      times[i] = (i / (N - 1)) * spec.pivot.spin;
      const a = (i / (N - 1)) * Math.PI * 2;
      vals.set([0, Math.sin(a / 2), 0, Math.cos(a / 2)], i * 4);
    }
    B.clip('anim_idle', [{ node: pv, path: 'rotation', times, values: vals }]);
  }
  for (const [k, p] of Object.entries(spec.anchors)) B.node(`anchor_${k}`, { t: p });
  const out = resolve(ROOT, `assets-src/cuenca/${id}.src.glb`);
  mkdirSync(dirname(out), { recursive: true });
  await B.write(out);
  console.log(`${id.padEnd(18)} ${Math.round(tris)} tris (antes de optimizar)`);
}
