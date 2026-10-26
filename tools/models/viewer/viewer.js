// Visor autónomo de modelos (Agente 2). Lee /public/models/manifest.json; no depende de src/.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b2f35');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20);
camera.position.set(0.55, 0.45, 0.65);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.15, 0);
controls.enableDamping = true;

const sun = new THREE.DirectionalLight('#fff6e8', 2.2);
sun.position.set(0.6, 1.2, 0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 3 });
sun.shadow.bias = -0.0005;
scene.add(sun);

// Mesa: tope 1,00 × 0,70, área útil 0,90 × 0,60, huella héroe 0,35 × 0,35.
const tableGroup = new THREE.Group();
const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.7), new THREE.MeshStandardMaterial({ color: '#dfe5e6', roughness: 0.25 }));
top.position.y = -0.01;
top.receiveShadow = true;
tableGroup.add(top);
const rect = (w, d, color, y = 0.0005) => {
  const g = new THREE.BufferGeometry().setFromPoints(
    [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([x, z]) => new THREE.Vector3(x, y, z)),
  );
  return new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
};
tableGroup.add(rect(1, 0.7, '#41B270'), rect(0.9, 0.6, '#2c7f50'));
scene.add(tableGroup);
const baseRect = rect(0.35, 0.35, '#F2B134', 0.001);
scene.add(baseRect);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let manifest = { models: [] };
let current = null; // { root, parts: [{node, rest, extras}], mixer, actions, anchors, entry }
const clock = new THREE.Clock();
let speed = 1;
let selected = null;
const boxHelpers = new THREE.Group();
scene.add(boxHelpers);

async function init() {
  try {
    manifest = await (await fetch('/public/models/manifest.json', { cache: 'no-cache' })).json();
  } catch {
    manifest = { models: [] };
  }
  const sel = $('model');
  sel.innerHTML = manifest.models.map((m) => `<option value="${m.id}">${m.experience} / ${m.id}</option>`).join('') || '<option>(manifiesto vacío)</option>';
  sel.onchange = () => loadEntry(manifest.models.find((m) => m.id === sel.value));
  $('loadFile').onclick = () => loadUrl($('file').value.trim(), null);
  const q = new URL(location.href).searchParams;
  if (q.get('file')) loadUrl(q.get('file'), null);
  else if (manifest.models.length) {
    const want = q.get('id') && manifest.models.find((m) => m.id === q.get('id'));
    if (want) sel.value = want.id;
    loadEntry(want || manifest.models[0]);
  }
}

function loadEntry(entry) {
  if (entry) loadUrl(`/public/models/${entry.file}`, entry);
}

function loadUrl(url, entry) {
  if (!url) return;
  loader.load(url, (gltf) => setModel(gltf, entry), undefined, (e) => ($('issues').textContent = `Error al cargar ${url}: ${e.message ?? e}`));
}

function setModel(gltf, entry) {
  if (current) {
    scene.remove(current.root);
    current.mixer.stopAllAction();
  }
  const root = gltf.scene;
  const parts = [];
  const anchors = [];
  let tris = 0;
  const mats = new Set();
  root.traverse((o) => {
    if (o.name.startsWith('part_')) parts.push({ node: o, rest: o.position.clone(), extras: o.userData });
    if (o.name.startsWith('anchor_')) anchors.push(o);
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      mats.add(o.material);
      o.userData.baseMaterial = o.material;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    }
  });
  for (const a of anchors) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: '#41B270' }));
    s.name = 'viewer_anchor_marker';
    a.add(s);
  }
  const mixer = new THREE.AnimationMixer(root);
  const actions = gltf.animations.map((clip) => {
    const info = entry?.clips?.find((c) => c.name === clip.name);
    const act = mixer.clipAction(clip);
    act.setLoop(info?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat);
    act.clampWhenFinished = true;
    return { clip, act, info };
  });
  scene.add(root);
  current = { root, parts, mixer, actions, anchors, entry, tris, mats: mats.size };
  selected = null;
  buildClipUi();
  buildPartsUi();
  applyExplode();
  applyView();
  updateStats();
}

function buildClipUi() {
  const box = $('clips');
  box.innerHTML = '';
  if (!current.actions.length) box.textContent = '(sin clips)';
  for (const a of current.actions) {
    const b = document.createElement('button');
    const label = () => `${a.act.isRunning() ? '⏸' : '▶'} ${a.clip.name} · ${a.clip.duration.toFixed(2)} s${a.info?.loop ? ' · bucle' : ''}`;
    b.textContent = label();
    b.onclick = () => {
      if (a.act.isRunning()) a.act.paused = true;
      else {
        if (!a.act.isScheduled() || a.act.paused === false) a.act.reset();
        a.act.paused = false;
        a.act.play();
      }
      b.classList.toggle('on', a.act.isRunning());
      b.textContent = label();
    };
    box.appendChild(b);
  }
  if (current.actions.length) {
    const stop = document.createElement('button');
    stop.textContent = '⏹ detener y volver a reposo';
    stop.onclick = () => {
      current.mixer.stopAllAction();
      buildClipUi();
    };
    box.appendChild(stop);
  }
}

function buildPartsUi() {
  const ul = $('parts');
  ul.innerHTML = '';
  const sorted = [...current.parts].sort((a, b) => (a.extras.explode?.order ?? 0) - (b.extras.explode?.order ?? 0));
  for (const p of sorted) {
    const li = document.createElement('li');
    const id = p.extras.partId ?? p.node.name.slice(5);
    li.innerHTML = `<span>${id}</span><small>${p.extras.group ?? ''} · ord ${p.extras.explode?.order ?? '?'}${p.extras.requires?.length ? ' · req ' + p.extras.requires.length : ''}</small>`;
    li.title = `labelKey: ${p.extras.labelKey}\nrequires: ${(p.extras.requires ?? []).join(', ') || '—'}`;
    li.onclick = () => select(selected === p ? null : p);
    p.li = li;
    ul.appendChild(li);
  }
}

const ghostCache = new Map();
function ghostOf(mat) {
  if (!ghostCache.has(mat)) {
    const g = mat.clone();
    g.transparent = true;
    g.opacity = 0.15;
    g.depthWrite = false;
    ghostCache.set(mat, g);
  }
  return ghostCache.get(mat);
}
const xrayCache = new Map();
function xrayOf(mat) {
  if (!xrayCache.has(mat)) {
    const g = mat.clone();
    g.transparent = true;
    g.opacity = 0.35;
    g.depthWrite = false;
    xrayCache.set(mat, g);
  }
  return xrayCache.get(mat);
}

function select(p) {
  selected = p;
  for (const q of current.parts) q.li?.classList.toggle('sel', q === p);
  applyView();
}

function applyView() {
  if (!current) return;
  const wire = $('wire').checked, xray = $('xray').checked;
  for (const q of current.parts.length ? current.parts : [{ node: current.root }]) {
    q.node.traverse((o) => {
      if (!o.isMesh || o.name === 'viewer_anchor_marker') return;
      const base = o.userData.baseMaterial;
      let m = base;
      if (selected && q !== selected) m = ghostOf(base);
      else if (xray && !selected) m = xrayOf(base);
      o.material = m;
      o.material.wireframe = wire;
    });
  }
  tableGroup.visible = $('table').checked;
  baseRect.visible = $('base').checked;
  for (const a of current.anchors) a.children.forEach((c) => c.name === 'viewer_anchor_marker' && (c.visible = $('anchors').checked));
}

function applyExplode() {
  if (!current) return;
  const k = Number($('explode').value) / 100;
  $('explodeVal').textContent = `${Math.round(k * 100)} %`;
  const maxOrder = Math.max(1, ...current.parts.map((p) => p.extras.explode?.order ?? 1));
  const s = $('cascade').checked ? 0.04 : 0;
  for (const p of current.parts) {
    const ex = p.extras.explode;
    if (!ex) continue;
    const o = ex.order ?? 1;
    const ki = s ? THREE.MathUtils.clamp((k - (o - 1) * s) / (1 - (maxOrder - 1) * s), 0, 1) : k;
    const e = 1 - Math.pow(1 - ki, 3);
    p.node.position.copy(p.rest).addScaledVector(new THREE.Vector3(...ex.dir), ex.dist * (k >= 1 ? 1 : e));
  }
  checkOverlaps();
}

function checkOverlaps() {
  boxHelpers.clear();
  if (!current?.parts.length) return;
  current.root.updateMatrixWorld(true);
  const boxes = current.parts.map((p) => new THREE.Box3().setFromObject(p.node, true));
  const tol = 0.0005;
  const bad = new Set();
  const pairs = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ov = ['x', 'y', 'z'].every((ax) => Math.min(a.max[ax], b.max[ax]) - Math.max(a.min[ax], b.min[ax]) > tol);
      if (ov) {
        bad.add(i).add(j);
        pairs.push(`${current.parts[i].extras.partId} × ${current.parts[j].extras.partId}`);
      }
    }
  if ($('boxes').checked) boxes.forEach((b, i) => boxHelpers.add(new THREE.Box3Helper(b, bad.has(i) ? '#e0644f' : '#41B270')));
  const all = new THREE.Box3().setFromObject(current.root, true);
  const size = all.getSize(new THREE.Vector3());
  const k = Number($('explode').value);
  const fits = size.x <= 0.9 + 1e-4 && size.z <= 0.6 + 1e-4;
  $('issues').innerHTML =
    `<span class="${fits ? 'ok' : 'bad'}">huella actual ${(size.x * 100).toFixed(1)} × ${(size.z * 100).toFixed(1)} cm, alto ${(size.y * 100).toFixed(1)} cm</span>\n` +
    (k === 100
      ? pairs.length
        ? `<span class="bad">${pairs.length} cruces al 100 %:\n${pairs.slice(0, 12).join('\n')}</span>`
        : '<span class="ok">sin cruces de cajas al 100 %</span>'
      : `${pairs.length} cajas cruzadas a ${k} %`);
}

function updateStats() {
  const e = current.entry;
  $('stats').textContent = [
    `triángulos: ${Math.round(current.tris).toLocaleString('es')}`,
    `materiales: ${current.mats}`,
    `piezas: ${current.parts.length}`,
    `anclas: ${current.anchors.map((a) => a.name.slice(7)).join(', ') || '—'}`,
    e ? `peso: ${e.sizeKB} KB · ${e.license} · ${e.author}` : '(archivo suelto)',
    `draw calls: ${renderer.info.render.calls}`,
  ].join('\n');
}

$('explode').oninput = applyExplode;
$('cascade').onchange = applyExplode;
$('speed').oninput = () => {
  speed = Number($('speed').value);
  $('speedVal').textContent = `${speed.toFixed(2)}×`;
};
for (const id of ['wire', 'xray', 'table', 'base', 'anchors']) $(id).onchange = applyView;
$('boxes').onchange = applyExplode;
addEventListener('keydown', (e) => e.key === 'Escape' && select(null));

// Clic en pieza → aislar.
const ray = new THREE.Raycaster();
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!current || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObject(current.root, true).find((h) => h.object.name !== 'viewer_anchor_marker');
  if (!hit) return select(null);
  let o = hit.object;
  while (o && !o.name.startsWith('part_')) o = o.parent;
  select(current.parts.find((p) => p.node === o) ?? null);
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let statT = 0;
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  current?.mixer.update(dt * speed);
  controls.update();
  renderer.render(scene, camera);
  if ((statT += dt) > 1 && current) {
    statT = 0;
    updateStats();
  }
});

// Para pruebas automatizadas / capturas.
window.viewer = { setExplode: (v) => (($('explode').value = v), applyExplode()), camera, controls, get current() { return current; } };
init();
