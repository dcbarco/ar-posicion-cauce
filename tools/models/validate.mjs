#!/usr/bin/env node
// Valida los GLB de public/models contra el contrato de modelos (brief §4 y §9, D16) y genera manifest.json.
//
// Uso:  npm run models:validate            valida todo y reescribe public/models/manifest.json
//       node tools/models/validate.mjs --check   valida sin escribir el manifiesto
//       node tools/models/validate.mjs motor4t   solo esos ids (el manifiesto conserva los demás tal cual)
//
// Sale con código 0 si todo es válido (o si no hay modelos registrados) y 1 si hay errores.
// Un modelo con errores NO entra al manifiesto ("un modelo que no pasa validate.mjs no se entrega").
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBytes } from 'gltf-validator';
import { createIO } from './lib/gltf.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODELS_DIR = resolve(ROOT, 'public/models');
const MANIFEST = join(MODELS_DIR, 'manifest.json');
const CONFIG = JSON.parse(readFileSync(resolve(ROOT, 'tools/models/models.config.json'), 'utf8'));
const LIM = CONFIG.limits;
const LICENSES = ['CC0', 'CC-BY', 'own'];
const EXPERIENCES = ['taller', 'cuenca', 'cosmos', 'shared'];
const NAME_RE = /^(part|pivot|anchor|geo)_[a-z0-9_]+$/;

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
/** Solo depuración: evalúa la explosión a otra fracción (p. ej. --at=0.5). */
const EXPLODE_K = Number(args.find((a) => a.startsWith('--at='))?.slice(5) ?? 1);
const ONLY = args.filter((a) => !a.startsWith('--'));

// ─── utilidades de matrices (column-major, como glTF) ─────────────────
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const apply = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
const emptyBox = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const grow = (b, p) => {
  for (let i = 0; i < 3; i++) {
    if (p[i] < b.min[i]) b.min[i] = p[i];
    if (p[i] > b.max[i]) b.max[i] = p[i];
  }
};
const isEmpty = (b) => b.min[0] > b.max[0];
const union = (a, b) => (isEmpty(b) ? a : (grow(a, b.min), grow(a, b.max), a));
const round = (v, d = 4) => +v.toFixed(d);
const roundBox = (b) => ({ min: b.min.map((v) => round(v)), max: b.max.map((v) => round(v)) });

/** Caja (espacio del modelo) de todas las mallas bajo `node`, en pose de reposo. */
function subtreeBox(node, parentWorld, onVertex) {
  const box = emptyBox();
  const walk = (n, pw) => {
    const w = mul(pw, n.getMatrix());
    const mesh = n.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const el = [0, 0, 0];
        for (let i = 0; i < pos.getCount(); i++) {
          const p = apply(w, pos.getElement(i, el));
          grow(box, p);
          onVertex?.(p);
        }
      }
    }
    for (const c of n.listChildren()) walk(c, w);
  };
  walk(node, parentWorld);
  return box;
}
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function overlap(a, b, tol) {
  const d = [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]));
  return d.every((v) => v > tol) ? d : null;
}

async function validateModel(io, m) {
  const errors = [];
  const warns = [];
  const E = (s) => errors.push(s);
  const W = (s) => warns.push(s);

  // Metadatos del registro.
  if (!m.id || !/^[a-z0-9_]+$/.test(m.id)) E(`id inválido: ${m.id}`);
  if (!EXPERIENCES.includes(m.experience)) E(`experience inválida: ${m.experience}`);
  if (!LICENSES.includes(m.license)) E(`licencia no permitida: ${m.license} (solo CC0 | CC-BY | own)`);
  if (!m.author?.trim()) E('falta author');
  if (!m.sourceUrl?.trim()) E('falta sourceUrl');
  if (m.license === 'CC-BY' && !/^https?:\/\//.test(m.sourceUrl ?? '')) E('CC-BY exige sourceUrl http(s) para la atribución');

  const path = join(MODELS_DIR, m.file);
  if (!existsSync(path)) {
    E(`no existe public/models/${m.file} (corre npm run models:optimize)`);
    return { errors, warns };
  }
  const bytes = readFileSync(path);
  const sizeKB = round(statSync(path).size / 1024, 1);
  if (sizeKB > LIM.maxFileKB) E(`pesa ${sizeKB} KB (> ${LIM.maxFileKB} KB)`);

  // gltf-validator (Khronos).
  try {
    const rep = await validateBytes(new Uint8Array(bytes), { maxIssues: 200, writeTimestamp: false });
    const issues = rep.issues;
    for (const msg of issues.messages) {
      const line = `gltf-validator ${msg.code} ${msg.pointer ?? ''}: ${msg.message}`;
      if (msg.severity === 0) E(line);
      else if (msg.severity === 1) W(line);
    }
  } catch (e) {
    E(`gltf-validator falló: ${e.message ?? e}`);
  }

  const doc = await io.read(path);
  // gltf-validator no puede inspeccionar buffers Meshopt: se valida también una copia decodificada.
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) {
    try {
      const plain = await io.readBinary(new Uint8Array(bytes));
      for (const ext of plain.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
      const rep = await validateBytes(await io.writeBinary(plain), { maxIssues: 200, writeTimestamp: false });
      for (const msg of rep.issues.messages) {
        const line = `gltf-validator (decodificado) ${msg.code} ${msg.pointer ?? ''}: ${msg.message}`;
        if (msg.severity === 0) E(line);
        else if (msg.severity === 1) W(line);
      }
    } catch (e) {
      E(`gltf-validator (decodificado) falló: ${e.message ?? e}`);
    }
  }
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) {
    E('sin escena');
    return { errors, warns };
  }

  // Materiales y texturas.
  const nMat = root.listMaterials().length;
  if (nMat > LIM.maxMaterials) E(`${nMat} materiales (> ${LIM.maxMaterials})`);
  let texNote = null;
  for (const t of root.listTextures()) {
    const size = t.getSize();
    const mime = t.getMimeType();
    const maxSide = mime === 'image/ktx2' ? LIM.maxTextureSize : LIM.maxTextureSizeNoKtx2;
    if (size && Math.max(...size) > maxSide) E(`textura ${t.getName() || t.getURI()} de ${size.join('×')} (> ${maxSide})`);
    if (mime !== 'image/ktx2') texNote = 'texturas WebP/PNG/JPEG temporales (sin KTX2)';
  }

  // Triángulos.
  let tris = 0;
  for (const n of root.listNodes()) {
    const mesh = n.getMesh();
    if (!mesh) continue;
    for (const p of mesh.listPrimitives()) {
      const mode = p.getMode();
      const count = p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount();
      if (mode === 4) tris += count / 3;
      else if (mode === 5 || mode === 6) tris += Math.max(0, count - 2);
    }
  }
  tris = Math.round(tris);
  const maxTris = m.maxTris ?? (m.kind === 'hero' ? LIM.heroMaxTris : 20000);
  if (tris > maxTris) E(`${tris} triángulos (> ${maxTris})`);
  if (m.minTris && tris < m.minTris) W(`${tris} triángulos (< ${m.minTris} esperado)`);

  // Nombres y jerarquía.
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const sceneChildren = new Set(scene.listChildren());
  const parts = [];
  const pivots = new Set();
  const anchors = new Set();
  const names = new Set();
  for (const n of root.listNodes()) {
    const name = n.getName();
    if (names.has(name)) E(`nombre de nodo repetido: ${name}`);
    names.add(name);
    if (m.kind === 'hero' && !NAME_RE.test(name)) E(`nodo con nombre fuera de convención: "${name}" (part_|pivot_|anchor_|geo_)`);
    if (name.startsWith('part_')) parts.push(n);
    if (name.startsWith('pivot_')) pivots.add(name.slice(6));
    if (name.startsWith('anchor_')) {
      anchors.add(name.slice(7));
      if (n.getMesh()) E(`${name} debe ser un nodo vacío`);
    }
    if (m.kind === 'hero' && n.getMesh()) {
      let p = n, inside = false;
      while (p) {
        if (p.getName().startsWith('part_')) inside = true;
        p = parentOf.get(p);
      }
      if (!inside) E(`malla fuera de una pieza: ${name}`);
    }
  }

  // Piezas y explosión.
  const manifestParts = [];
  const partBoxes = [];
  const assembled = emptyBox();
  for (const c of scene.listChildren()) union(assembled, subtreeBox(c, IDENT));
  const exploded = emptyBox();
  if (m.kind === 'hero') {
    if (parts.length === 0) E('modelo héroe sin nodos part_*');
    const ids = new Set();
    for (const n of parts) {
      const name = n.getName();
      const x = n.getExtras() ?? {};
      const pid = name.slice(5);
      if (!sceneChildren.has(n)) E(`${name} debe colgar directamente de la escena (explode.dir en espacio del modelo)`);
      if (x.partId !== pid) E(`${name}: extras.partId = "${x.partId}" (debe ser "${pid}")`);
      if (ids.has(pid)) E(`partId repetido: ${pid}`);
      if (pid === 'model') E('partId "model" está reservado (P-007: exp.<exp>.<modelo>.title.model es el nombre del modelo)');
      ids.add(pid);
      if (!x.group || typeof x.group !== 'string') E(`${name}: falta extras.group`);
      const ex = x.explode;
      if (!ex || !Array.isArray(ex.dir) || ex.dir.length !== 3 || typeof ex.dist !== 'number' || !Number.isInteger(ex.order)) {
        E(`${name}: extras.explode debe ser { dir: [x,y,z], dist: número, order: entero }`);
        continue;
      }
      const len = Math.hypot(...ex.dir);
      if (Math.abs(len - 1) > 2e-3) E(`${name}: explode.dir no es unitario (|dir| = ${len.toFixed(4)})`);
      if (ex.dist < 0) E(`${name}: explode.dist < 0`);
      const wantKey = `exp.${m.experience}.${m.id}.title.${pid}`;
      if (x.labelKey !== wantKey) E(`${name}: labelKey "${x.labelKey}" ≠ "${wantKey}" (D16)`);
      if (x.requires !== undefined && !Array.isArray(x.requires)) E(`${name}: requires debe ser arreglo`);
      const box = subtreeBox(n, IDENT);
      if (isEmpty(box)) {
        W(`${name}: pieza sin geometría`);
        continue;
      }
      const off = ex.dir.map((d) => d * ex.dist * EXPLODE_K);
      const eb = { min: box.min.map((v, i) => v + off[i]), max: box.max.map((v, i) => v + off[i]) };
      union(exploded, eb);
      partBoxes.push({ pid, box: eb, order: ex.order });
      manifestParts.push({ partId: pid, labelKey: x.labelKey, ...(x.requires?.length ? { requires: x.requires } : {}), _order: ex.order });
    }
    // requires: existencia, ciclos y coherencia con el orden de desmontaje.
    const reqMap = new Map(manifestParts.map((p) => [p.partId, p.requires ?? []]));
    const orderOf = new Map(manifestParts.map((p) => [p.partId, p._order]));
    for (const [pid, req] of reqMap) {
      for (const r of req) {
        if (!reqMap.has(r)) E(`part_${pid}: requires "${r}" no existe`);
        else if (orderOf.get(r) < orderOf.get(pid)) W(`part_${pid} (orden ${orderOf.get(pid)}) requiere ${r} (orden ${orderOf.get(r)}), que se desmonta antes`);
      }
    }
    const state = new Map();
    const visit = (id, path) => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) return E(`ciclo en requires: ${[...path, id].join(' → ')}`);
      state.set(id, 1);
      for (const r of reqMap.get(id) ?? []) if (reqMap.has(r)) visit(r, [...path, id]);
      state.set(id, 2);
    };
    for (const id of reqMap.keys()) visit(id, []);
    if (!manifestParts.some((p) => (p.requires ?? []).length === 0)) E('requires: ninguna pieza puede montarse primero');
    for (const id of m.requiredParts ?? []) if (!ids.has(id)) E(`falta la pieza obligatoria part_${id}`);
    for (const id of m.requiredPivots ?? []) if (!pivots.has(id)) E(`falta pivot_${id}`);
    for (const id of m.requiredAnchors ?? []) if (!anchors.has(id)) E(`falta anchor_${id}`);

    // Interpenetración al 100 % (cajas alineadas a ejes; conservador).
    for (let i = 0; i < partBoxes.length; i++)
      for (let j = i + 1; j < partBoxes.length; j++) {
        const o = overlap(partBoxes[i].box, partBoxes[j].box, LIM.overlapTolerance);
        if (o) E(`al 100 % se cruzan ${partBoxes[i].pid} y ${partBoxes[j].pid} (${o.map((v) => (v * 1000).toFixed(1)).join(' × ')} mm)`);
      }

    // Dimensiones.
    const bx = assembled.max[0] - assembled.min[0], bz = assembled.max[2] - assembled.min[2];
    if (bx > LIM.heroBaseMax + 1e-6 || bz > LIM.heroBaseMax + 1e-6) E(`armado ocupa ${bx.toFixed(3)} × ${bz.toFixed(3)} m (> ${LIM.heroBaseMax})`);
    const ex = exploded.max[0] - exploded.min[0], ez = exploded.max[2] - exploded.min[2];
    if (ex > LIM.explodedMax[0] + 1e-6 || ez > LIM.explodedMax[1] + 1e-6) E(`desarmado ocupa ${ex.toFixed(3)} × ${ez.toFixed(3)} m (> ${LIM.explodedMax.join(' × ')})`);
    if (exploded.min[1] < -1e-3) E(`al 100 % hay piezas bajo el tope (y min = ${exploded.min[1].toFixed(3)})`);
  } else {
    union(exploded, assembled);
    for (const id of m.requiredPivots ?? []) if (!pivots.has(id)) E(`falta pivot_${id}`);
    for (const id of m.requiredAnchors ?? []) if (!anchors.has(id)) E(`falta anchor_${id}`);
    for (const n of root.listNodes()) if (!NAME_RE.test(n.getName())) W(`nodo con nombre fuera de convención: "${n.getName()}"`);
    // Huella de un prop (diámetro en XZ desde el origen).
    if (m.maxFootprint) {
      let r = 0;
      for (const c of scene.listChildren()) subtreeBox(c, IDENT, (p) => (r = Math.max(r, Math.hypot(p[0], p[2]))));
      if (2 * r > m.maxFootprint + 1e-6) E(`huella de ${(2 * r * 100).toFixed(1)} cm (> ${m.maxFootprint * 100} cm de diámetro)`);
    }
  }
  if (isEmpty(assembled)) E('modelo sin geometría');
  else {
    if (assembled.min[1] < -1e-3) E(`el origen debe estar en la base: y min = ${assembled.min[1].toFixed(4)}`);
    const cx = (assembled.min[0] + assembled.max[0]) / 2, cz = (assembled.min[2] + assembled.max[2]) / 2;
    if (Math.abs(cx) > 0.03 || Math.abs(cz) > 0.03) W(`origen lejos del centro de la base (centro XZ = ${cx.toFixed(3)}, ${cz.toFixed(3)})`);
  }

  // Clips.
  const clips = [];
  const cfgClips = m.clips ?? {};
  for (const a of root.listAnimations()) {
    const name = a.getName();
    if (!/^anim_[a-z0-9_]+$/.test(name)) E(`clip con nombre fuera de convención: "${name}"`);
    let dur = 0;
    for (const s of a.listSamplers()) dur = Math.max(dur, s.getInput().getMax([0])[0]);
    const cfg = cfgClips[name];
    if (!cfg) W(`clip ${name} sin registrar en models.config.json (se asume loop: false)`);
    else if (cfg.duration && Math.abs(cfg.duration - dur) > 0.02) E(`clip ${name}: dura ${dur.toFixed(2)} s (esperado ${cfg.duration})`);
    clips.push({ name, duration: round(dur, 3), loop: cfg?.loop ?? false });
  }
  for (const name of Object.keys(cfgClips)) if (!clips.some((c) => c.name === name)) E(`falta el clip ${name}`);

  const notes = [m.notes, texNote].filter(Boolean).join(' · ') || undefined;
  const entry = {
    id: m.id,
    file: m.file,
    experience: m.experience,
    tris,
    sizeKB,
    parts: manifestParts.sort((a, b) => a._order - b._order).map(({ _order, ...p }) => p),
    clips,
    bounds: { assembled: roundBox(assembled), exploded: roundBox(isEmpty(exploded) ? assembled : exploded) },
    license: m.license,
    author: m.author,
    sourceUrl: m.sourceUrl,
    ...(notes ? { notes } : {}),
  };
  return { errors, warns, entry, tris, sizeKB };
}

function listGlbs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listGlbs(p));
    else if (e.name.endsWith('.glb')) out.push(relative(MODELS_DIR, p).replaceAll('\\', '/'));
  }
  return out;
}

async function main() {
  const io = await createIO();
  const models = CONFIG.models.filter((m) => ONLY.length === 0 || ONLY.includes(m.id));
  let errCount = 0;
  const entries = [];

  // GLB sin registrar: sin licencia conocida → error.
  const registered = new Set(CONFIG.models.map((m) => m.file));
  for (const f of listGlbs(MODELS_DIR)) {
    if (!registered.has(f)) {
      console.error(`✗ public/models/${f} no está en tools/models/models.config.json (licencia desconocida)`);
      errCount++;
    }
  }
  const ids = CONFIG.models.map((m) => m.id);
  for (const id of ids) {
    if (ids.indexOf(id) !== ids.lastIndexOf(id)) {
      console.error(`✗ id repetido en el registro: ${id}`);
      errCount++;
    }
  }

  for (const m of models) {
    const { errors, warns, entry } = await validateModel(io, m);
    const ok = errors.length === 0;
    const info = entry ? ` · ${entry.tris} tris · ${entry.sizeKB} KB · ${entry.parts.length} piezas · ${entry.clips.length} clips` : '';
    console.log(`${ok ? '✓' : '✗'} ${m.id}${info}`);
    for (const w of warns) console.log(`    ⚠ ${w}`);
    for (const e of errors) console.log(`    ✗ ${e}`);
    if (ok) entries.push(entry);
    else errCount += errors.length;
  }

  // Presupuesto por experiencia (≤ 12 MB en red).
  const byExp = {};
  for (const e of entries) byExp[e.experience] = (byExp[e.experience] ?? 0) + e.sizeKB;
  for (const [exp, kb] of Object.entries(byExp)) {
    if (kb > LIM.experienceBudgetKB) console.log(`⚠ ${exp}: ${(kb / 1024).toFixed(1)} MB de modelos (> ${LIM.experienceBudgetKB / 1024} MB)`);
  }

  if (!CHECK_ONLY) {
    let prev = { version: 1, models: [] };
    try {
      prev = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    } catch {
      /* no existe aún */
    }
    const keep = ONLY.length ? (prev.models ?? []).filter((e) => !ONLY.includes(e.id) && CONFIG.models.some((m) => m.id === e.id)) : [];
    const order = CONFIG.models.map((m) => m.id);
    const all = [...keep, ...entries].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const manifest = { version: 1, models: all };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`manifest.json: ${all.length} modelo(s).`);
  }
  if (models.length === 0) console.log('validate: no hay modelos registrados (manifiesto vacío).');
  console.log(errCount ? `validate: ${errCount} error(es).` : 'validate: OK');
  process.exitCode = errCount ? 1 : 0;
}

await main();
