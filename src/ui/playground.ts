// Página de prueba `?ui=1` (D18): todos los componentes y estados de la UI, alimentados por un UiApi
// falso con emisor propio y el traductor real. Incluye una escena three.js mínima con los FX
// (borde de la mesa, retícula, sello appear/disappear, contorno, fantasma) para revisarlos sin XR.
// Solo desarrollo: los rótulos del panel lateral son identificadores técnicos, no textos de visitante.
import * as THREE from 'three';
import type { AppEvents, AppSnapshot, AppState, ControlSpec, ExperienceId, QualityLevel, UiApi, UiAction } from '../core/contracts';
import { createEmitter } from '../core/events';
import { createTranslator } from '../core/i18n';
import { TABLE } from '../core/table/spec';
import { createAudioKit } from '../audio';
import { createFxKit } from '../fx';
import { createUi } from './index';

const STATES: AppState[] = ['boot', 'operator', 'home', 'intro', 'scan', 'lock', 'place', 'explore'];
const EXPERIENCES: readonly ExperienceId[] = ['taller', 'cuenca', 'cosmos'];

export function mountPlayground(root: HTMLElement): void {
  document.title = 'CAUCE · UI playground';
  const events = createEmitter<AppEvents>();
  const t = createTranslator();
  const audio = createAudioKit();
  events.on('sound', (p) => audio.play(p.id));

  // ───────────── estado falso ─────────────
  let snap: AppSnapshot = {
    state: 'home',
    experience: null,
    loadProgress: 0,
    lockPhase: 'aim',
    reticle: 'ok',
      placeMode: 'point',
    relocating: false,
    suggestRecalibrate: false,
    idleCountdown: null,
    switcherOpen: false,
    helpOpen: false,
    muted: false,
    simulator: true,
    operatorReason: null,
    quality: 'high',
  };
  const set = (patch: Partial<AppSnapshot>) => {
    snap = { ...snap, ...patch };
    events.emit('app:state', snap);
    paintDev();
  };

  // ───────────── controles de ejemplo (todos los kinds) ─────────────
  const mock = { explode: 0.3, xray: false, speed: 'normal', count: 0, play: false, mass: 1 };
  const controls = (): ControlSpec[] => [
    { kind: 'slider', id: 'explode', labelKey: 'exp.mock.demo.label.explode', min: 0, max: 1, value: mock.explode, format: 'percent', onInput: (v) => (mock.explode = v) },
    { kind: 'slider', id: 'mass', labelKey: 'exp.mock.demo.label.speed', min: 0.1, max: 2, step: 0.1, value: mock.mass, format: 'speed', onInput: (v) => (mock.mass = v) },
    { kind: 'toggle', id: 'xray', labelKey: 'exp.mock.demo.label.xray', value: mock.xray, onChange: (v) => (mock.xray = v) },
    {
      kind: 'button',
      id: 'play',
      labelKey: 'exp.mock.demo.label.play',
      icon: mock.play ? 'pause' : 'play',
      onPress: () => {
        mock.play = !mock.play;
        events.emit('controls:changed', { experience: 'taller' });
      },
    },
    {
      kind: 'select',
      id: 'speed',
      labelKey: 'exp.mock.demo.label.speed',
      group: 'view',
      value: mock.speed,
      options: [
        { id: 'slow', labelKey: 'exp.mock.demo.label.speed_slow' },
        { id: 'normal', labelKey: 'exp.mock.demo.label.speed_normal' },
        { id: 'fast', labelKey: 'exp.mock.demo.label.speed_fast' },
      ],
      onChange: (id) => (mock.speed = id),
    },
    {
      kind: 'tray',
      id: 'shapes',
      labelKey: 'exp.mock.demo.label.tray',
      group: 'view',
      items: [
        { id: 'cube', labelKey: 'exp.mock.demo.label.cube', icon: 'cube' },
        { id: 'sphere', labelKey: 'exp.mock.demo.label.sphere', icon: 'sphere' },
        { id: 'cone', labelKey: 'exp.mock.demo.label.cone', icon: 'cone' },
      ],
      onPick: (id) => log(`tray onPick ${id}`),
    },
    { kind: 'readout', id: 'count', labelKey: 'exp.mock.demo.label.count', group: 'info', value: () => (mock.count += 1) },
  ];

  // ───────────── escena FX mínima ─────────────
  const stage = document.createElement('div');
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#3a2a22'); // "ladrillo" para probar contraste
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 20);
  camera.position.set(0, 0.75, 0.85);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#ffffff', '#443322', 2.2));
  const dir = new THREE.DirectionalLight('#ffffff', 1.5);
  dir.position.set(0.5, 1, 0.3);
  scene.add(dir);
  const frame = new THREE.Group();
  frame.name = 'tableFrame';
  scene.add(frame);
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.length, 0.02, TABLE.width), new THREE.MeshStandardMaterial({ color: '#d8dcd8', roughness: 0.15 }));
  top.position.y = -0.0101;
  frame.add(top);
  const fx = createFxKit(renderer, scene);
  const edge = fx.createTableEdge(TABLE);
  frame.add(edge.object);
  edge.setMode('rest');
  const reticle = fx.createReticle();
  frame.add(reticle.object);
  reticle.setState('ok');
  const model = new THREE.Group();
  model.name = 'demo-model';
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), new THREE.MeshStandardMaterial({ color: '#c4743f', roughness: 0.5, metalness: 0.2 }));
  base.position.y = 0.04;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 24), new THREE.MeshStandardMaterial({ color: '#7a8c99', roughness: 0.3, metalness: 0.7 }));
  head.position.set(0.03, 0.13, 0);
  const anchor = new THREE.Object3D();
  anchor.position.set(0.03, 0.19, 0);
  model.add(base, head, anchor);
  frame.add(model);
  let outlined = false;
  let ghosted = false;

  const v = new THREE.Vector3();
  const project: UiApi['project'] = (target, out) => {
    target.getWorldPosition(v);
    v.project(camera);
    out.visible = v.z < 1 && v.z > -1;
    out.x = (v.x * 0.5 + 0.5) * stage.clientWidth;
    out.y = (-v.y * 0.5 + 0.5) * stage.clientHeight;
    return out;
  };

  // ───────────── núcleo falso: responde a las acciones de la UI ─────────────
  let idleTimer: ReturnType<typeof setInterval> | undefined;
  let loadTimer: ReturnType<typeof setInterval> | undefined;
  const startLoad = () => {
    clearInterval(loadTimer);
    let p = 0;
    loadTimer = setInterval(() => {
      p = Math.min(1, p + 0.07);
      set({ loadProgress: p });
      if (p >= 1) clearInterval(loadTimer);
    }, 180);
  };
  const startIdle = () => {
    clearInterval(idleTimer);
    let s = 10;
    set({ idleCountdown: s });
    idleTimer = setInterval(() => {
      s -= 1;
      if (s < 0) {
        clearInterval(idleTimer);
        set({ idleCountdown: null, state: 'home', experience: null });
      } else set({ idleCountdown: s });
    }, 1000);
  };
  const onAction = (a: UiAction) => {
    log(`ui:action ${JSON.stringify(a)}`);
    switch (a.type) {
      case 'pick-experience':
        if (snap.state === 'explore') {
          set({ switcherOpen: false, experience: a.id });
          events.emit('sound', { id: 'whoosh' });
          void fx.disappear(model).then(() => fx.appear(model));
        } else {
          set({ state: 'intro', experience: a.id, loadProgress: 0 });
          startLoad();
        }
        break;
      case 'close-intro':
        set({ state: 'home', experience: null });
        break;
      case 'enter-ar':
        set({ state: 'scan' });
        setTimeout(() => {
          if (snap.state === 'scan') {
            set({ state: 'lock', lockPhase: 'aim' });
            edge.setMode('hidden');
          }
        }, 2000);
        break;
      case 'lock-nudge':
        frame.position.x += a.dx ?? 0;
        frame.position.z += a.dz ?? 0;
        frame.rotation.y += THREE.MathUtils.degToRad(a.dyawDeg ?? 0);
        edge.pulse();
        break;
      case 'lock-confirm':
        void edge.sweep().then(() => {
          events.emit('toast', { key: 'lock.tip.done', tone: 'success' });
          set({ state: 'place', reticle: 'ok' });
          reticle.setState('ok');
        });
        break;
      case 'recalibrate':
        set({ state: 'lock', lockPhase: 'aim', suggestRecalibrate: false });
        edge.setMode('hidden');
        break;
      case 'reset':
        events.emit('toast', { key: 'hud.label.reset', tone: 'info' });
        break;
      case 'exit':
        set({ state: 'home', experience: null, switcherOpen: false, helpOpen: false });
        break;
      case 'switcher':
        set({ switcherOpen: a.open });
        break;
      case 'help':
        set({ helpOpen: a.open });
        break;
      case 'idle-continue':
        clearInterval(idleTimer);
        set({ idleCountdown: null });
        break;
      case 'mute':
        audio.setMuted(a.muted);
        set({ muted: a.muted });
        break;
      case 'operator-restart':
        set({ state: 'boot', operatorReason: null });
        setTimeout(() => set({ state: 'home' }), 1200);
        break;
    }
  };
  events.on('ui:action', onAction);
  for (const ev of ['ui:tray-drag', 'modal:action', 'contextmenu:pick', 'label:action'] as const) {
    events.on(ev, (p: unknown) => log(`${ev} ${JSON.stringify(p)}`));
  }
  let activity = 0;
  events.on('ui:activity', () => {
    activity++;
  });

  const api: UiApi = {
    events,
    t,
    getState: () => snap,
    getControls: () => (snap.state === 'explore' ? controls() : []),
    experiences: EXPERIENCES,
    project,
  };

  // ───────────── maquetación ─────────────
  root.replaceChildren();
  root.style.cssText = 'position:fixed;inset:0;z-index:100;pointer-events:auto;display:grid;grid-template-columns:300px 1fr;background:#05181c;font:14px system-ui;color:#ddd';
  const dev = document.createElement('aside');
  dev.style.cssText = 'overflow:auto;padding:8px;border-right:1px solid #234;display:flex;flex-direction:column;gap:6px';
  stage.style.cssText = 'position:relative;overflow:hidden;margin:auto;width:100%;height:100%';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const gesture = document.createElement('div');
  gesture.id = 'gesture-layer';
  gesture.style.cssText = 'position:absolute;inset:0;touch-action:none';
  stage.append(canvas, gesture);
  root.append(dev, stage);

  // Capa de gestos falsa: comprueba que los toques fuera de los botones llegan aquí.
  gesture.addEventListener('pointerdown', (e) => {
    log(`gesture-layer pointerdown ${Math.round(e.offsetX)},${Math.round(e.offsetY)}`);
    edge.pulse();
    if (snap.state === 'lock' && snap.lockPhase === 'aim') {
      set({ lockPhase: 'adjust' });
      edge.setMode('lock');
    } else if (snap.state === 'place') {
      events.emit('sound', { id: 'place' });
      reticle.setState('hidden');
      set({ state: 'explore' });
      void fx.appear(model);
    }
  });

  const ui = createUi();
  ui.mount(stage, api);

  // ───────────── panel de desarrollo ─────────────
  const logBox = document.createElement('pre');
  logBox.style.cssText = 'margin:0;min-height:120px;max-height:220px;overflow:auto;background:#000;color:#8f8;padding:6px;font:11px monospace;white-space:pre-wrap';
  const log = (s: string) => {
    logBox.textContent = `${s}\n${logBox.textContent ?? ''}`.slice(0, 4000);
  };
  const section = (name: string) => {
    const hd = document.createElement('div');
    hd.textContent = name;
    hd.style.cssText = 'margin-top:8px;font-weight:700;color:#41b270;text-transform:uppercase;font-size:11px;letter-spacing:.08em';
    dev.append(hd);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
    dev.append(row);
    return row;
  };
  const devBtn = (row: HTMLElement, label: string, fn: () => void, isOn?: () => boolean) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:4px 8px;border-radius:6px;border:1px solid #345;background:#0e2a30;color:#ddd;cursor:pointer;font:12px system-ui';
    b.addEventListener('click', fn);
    if (isOn) devPaint.push(() => (b.style.background = isOn() ? '#2f7d50' : '#0e2a30'));
    row.append(b);
    return b;
  };
  const devPaint: (() => void)[] = [];
  const paintDev = () => devPaint.forEach((f) => f());

  const rowState = section('state');
  for (const s of STATES)
    devBtn(
      rowState,
      s,
      () => {
        const patch: Partial<AppSnapshot> = { state: s };
        if (s === 'operator') patch.operatorReason = 'no_ar';
        if (s === 'intro') {
          patch.experience = snap.experience ?? 'taller';
          startLoad();
        }
        if (s === 'explore') patch.experience = snap.experience ?? 'taller';
        set(patch);
      },
      () => snap.state === s,
    );
  const rowFlags = section('snapshot');
  devBtn(rowFlags, 'lock:aim', () => set({ lockPhase: 'aim' }), () => snap.lockPhase === 'aim');
  devBtn(rowFlags, 'lock:adjust', () => set({ lockPhase: 'adjust' }), () => snap.lockPhase === 'adjust');
  for (const r of ['ok', 'warn', 'hidden'] as const)
    devBtn(
      rowFlags,
      `reticle:${r}`,
      () => {
        set({ reticle: r });
        reticle.setState(r);
      },
      () => snap.reticle === r,
    );
  devBtn(rowFlags, 'relocating', () => set({ relocating: !snap.relocating }), () => snap.relocating);
  devBtn(rowFlags, 'suggestRecalibrate', () => set({ suggestRecalibrate: !snap.suggestRecalibrate }), () => snap.suggestRecalibrate);
  devBtn(rowFlags, 'idle 10s', startIdle, () => snap.idleCountdown !== null);
  devBtn(rowFlags, 'switcherOpen', () => set({ switcherOpen: !snap.switcherOpen }), () => snap.switcherOpen);
  devBtn(rowFlags, 'helpOpen', () => set({ helpOpen: !snap.helpOpen }), () => snap.helpOpen);
  devBtn(rowFlags, 'muted', () => onAction({ type: 'mute', muted: !snap.muted }), () => snap.muted);
  devBtn(rowFlags, 'simulator', () => set({ simulator: !snap.simulator }), () => snap.simulator);
  devBtn(rowFlags, 'controls:changed', () => events.emit('controls:changed', { experience: 'taller' }));

  const rowEv = section('events');
  devBtn(rowEv, 'toast info', () => events.emit('toast', { key: 'place.tip.aim' }));
  devBtn(rowEv, 'toast success', () => events.emit('toast', { key: 'lock.tip.done', tone: 'success' }));
  devBtn(rowEv, 'toast warn', () => events.emit('toast', { key: 'place.tip.edge', tone: 'warn' }));
  devBtn(rowEv, 'modal', () =>
    events.emit('modal:open', {
      id: 'demo',
      titleKey: 'help.title',
      bodyKey: 'help.body.move',
      actions: [
        { id: 'later', labelKey: 'intro.label.back' },
        { id: 'ok', labelKey: 'intro.label.next' },
      ],
    }),
  );
  devBtn(rowEv, 'modal (sin acciones)', () => events.emit('modal:open', { id: 'demo2', titleKey: 'idle.title', bodyKey: 'help.body.select' }));
  devBtn(rowEv, 'contextmenu', () =>
    events.emit('contextmenu:open', {
      screen: { x: 0.5, y: 0.45 },
      items: [
        { id: 'move', labelKey: 'exp.mock.demo.label.cube', icon: 'move' },
        { id: 'remove', labelKey: 'exp.mock.demo.label.sphere', icon: 'close' },
      ],
    }),
  );
  devBtn(rowEv, 'label:show', () =>
    events.emit('label:show', {
      id: 'part-head',
      anchor,
      titleKey: 'exp.mock.demo.title.selected',
      bodyKey: 'exp.mock.demo.body.selected',
      actions: [{ id: 'action', labelKey: 'exp.mock.demo.label.play' }],
    }),
  );
  devBtn(rowEv, 'label:hide', () => events.emit('label:show', null));

  const rowFx = section('fx');
  devBtn(rowFx, 'edge lock', () => edge.setMode('lock'));
  devBtn(rowFx, 'edge rest', () => edge.setMode('rest'));
  devBtn(rowFx, 'edge hidden', () => edge.setMode('hidden'));
  devBtn(rowFx, 'edge pulse', () => edge.pulse());
  devBtn(rowFx, 'edge sweep', () => void edge.sweep().then(() => log('sweep done')));
  devBtn(rowFx, 'appear edge', () => void fx.appear(model).then(() => log('appear done')));
  devBtn(rowFx, 'appear above', () => void fx.appear(model, { from: 'above' }).then(() => log('appear done')));
  devBtn(rowFx, 'disappear', () => void fx.disappear(model).then(() => log('disappear done')));
  devBtn(
    rowFx,
    'outline head',
    () => {
      outlined = !outlined;
      fx.outline(outlined ? head : null);
    },
    () => outlined,
  );
  devBtn(
    rowFx,
    'ghost base',
    () => {
      ghosted = !ghosted;
      fx.ghost([base], ghosted);
    },
    () => ghosted,
  );
  for (const ql of ['high', 'medium', 'low'] as QualityLevel[])
    devBtn(
      rowFx,
      `quality:${ql}`,
      () => {
        fx.setQuality(ql);
        set({ quality: ql });
      },
      () => snap.quality === ql,
    );
  const rowSnd = section('audio');
  for (const id of ['tap', 'snap', 'success', 'fail', 'whoosh', 'place'] as const) devBtn(rowSnd, id, () => audio.play(id));

  const rowStage = section('stage');
  const size = (w: string, h: string) => () => {
    stage.style.width = w;
    stage.style.height = h;
    resize();
  };
  devBtn(rowStage, 'fill', size('100%', '100%'));
  devBtn(rowStage, '1280×800', size('1280px', '800px'));
  devBtn(rowStage, '800×1280', size('800px', '1280px'));
  devBtn(rowStage, '1024×640', size('1024px', '640px'));
  section('log');
  dev.append(logBox);
  const stats = document.createElement('div');
  stats.style.cssText = 'font:11px monospace;color:#9ab';
  dev.append(stats);

  // ───────────── bucle ─────────────
  const resize = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  let last = performance.now();
  let tt = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tt += dt;
    // retícula paseando por la mesa; cerca del borde → warn (forma distinta)
    const rx = Math.sin(tt * 0.5) * 0.42;
    const rz = Math.cos(tt * 0.37) * 0.25;
    reticle.object.position.set(rx, 0, rz);
    if (snap.state === 'place') {
      const r = Math.abs(rx) > 0.36 || Math.abs(rz) > 0.24 ? 'warn' : 'ok';
      if (r !== snap.reticle) {
        set({ reticle: r });
        reticle.setState(r);
      }
    }
    head.rotation.y += dt;
    fx.update(dt);
    edge.update(dt);
    reticle.update(dt);
    ui.tick(dt);
    renderer.render(scene, camera);
    if ((tt * 4) % 1 < dt * 4) stats.textContent = `calls:${renderer.info.render.calls} geo:${renderer.info.memory.geometries} tex:${renderer.info.memory.textures} activity:${activity}`;
  });

  events.emit('app:state', snap);
  paintDev();
}
