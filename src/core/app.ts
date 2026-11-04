// Orquestador: renderer, escena, máquina de estados (HOME → INTRO → SCAN → LOCK → PLACE → EXPLORE),
// sesión XR o simulador, gestos, recuperación de tracking e inactividad.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  AppSnapshot,
  AudioKit,
  ControlSpec,
  Experience,
  ExperienceContext,
  ExperienceId,
  FxKit,
  GestureEvent,
  QualityLevel,
  ReticleFx,
  Translate,
  UiAction,
  UiApi,
  UiModule,
} from './contracts';
import { createEmitter, type AppEmitter } from './events';
import { TABLE } from './table/spec';
import { createBounds } from './table/bounds';
import { TableLock } from './table/lock';
import { TableTwin } from './table/occluder';
import { PlacementCursor, rayToTop } from './placement/placement';
import { GestureRecognizer, type ScreenGesture } from './gestures/recognizer';
import { createTrackingHealth, createHeightDrift, TRACKING } from './xr/tracking-health';
import { checkXrSupport, startXrSession, type XrSessionHandle } from './xr/session';
import { DesktopSim } from './xr/desktop-sim';
import { createIdleTimer } from './state/idle';
import { createAssetLoader, disposeObject, type AssetLoader } from './assets/loader';
import { EXPERIENCES, EXPERIENCE_ORDER } from '../experiences/registry';

export interface AppDeps {
  canvasHost: HTMLElement;
  overlay: HTMLElement;
  gestureLayer: HTMLElement;
  t: Translate;
  ui: UiModule;
  createFx: (r: THREE.WebGLRenderer, s: THREE.Scene) => FxKit;
  audio: AudioKit;
  simulator: boolean;
  /** Modo sala (por defecto; ?sala=0 lo apaga, D25/D28): la sesión AR y la calibración se conservan entre visitantes. */
  room: boolean;
}

const AR_STATES: ReadonlySet<AppSnapshot['state']> = new Set(['scan', 'lock', 'place', 'explore']);

const QUALITY_ORDER: QualityLevel[] = ['high', 'medium', 'low'];
const SCAN_READY_MS = 600;
const SCAN_FALLBACK_MS = 6000; // sin superficie detectada en este tiempo: se estima el tope
const FALLBACK_DROP_M = 0.45; // altura típica de la tablet sobre el tope (ver DesktopSim)
const SUGGEST_CLEAR_MS = 3000; // todo en orden este tiempo → se retira el aviso de recalibrar

// Temporales reutilizables (cero asignaciones por frame).
const _ray = new THREE.Ray();
const _rayLocal = new THREE.Ray();
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _caster = new THREE.Raycaster();
const _hitMatrix = new THREE.Matrix4();
const _hitPos = new THREE.Vector3();
const _worldPlane = new THREE.Plane();

export class App {
  readonly events: AppEmitter = createEmitter();
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly tableFrame = new THREE.Object3D();
  readonly contentRoot = new THREE.Group();
  readonly bounds = createBounds(TABLE);

  private readonly fx: FxKit;
  private readonly twin: TableTwin;
  private readonly lock: TableLock;
  private readonly cursor: PlacementCursor;
  private readonly reticle: ReticleFx;
  private readonly lockReticle: ReticleFx;
  private readonly loader: AssetLoader;
  private readonly recognizer: GestureRecognizer;
  private readonly health = createTrackingHealth();
  private readonly drift = createHeightDrift();
  private readonly idle = createIdleTimer();
  private readonly sim: DesktopSim | null;
  private readonly xrCameraFallback = new THREE.PerspectiveCamera();
  private readonly sun: THREE.DirectionalLight;

  private snap: AppSnapshot;
  private xr: XrSessionHandle | null = null;
  private endingXr = false;
  private pendingConfirm = false;
  private scanGoodMs = 0;
  private scanMs = 0;
  private driftSuggest = false;
  private suggestOkMs = 0;
  /** Altura (mundo) del último plano de mesa visto por el hit-test, o estimada. */
  private planeY: number | null = null;
  private aimHit = false;
  private readonly aimPoint = new THREE.Vector3();
  private pointerScreen = { x: innerWidth / 2, y: innerHeight / 2 };

  private exp: Experience | null = null;
  private expRoot: THREE.Group | null = null;
  private expToken = 0;
  private placed = false;
  private readonly placedAt = new THREE.Vector3();
  private dragPrev = new THREE.Vector3();
  private dragHas = false;
  private lockDragPrev = new THREE.Vector3();
  private lockDragHas = false;

  private lastTime = 0;
  private elapsed = 0;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private lowFpsSeconds = 0;
  private wakeLock: WakeLockSentinel | null = null;
  // Contadores para el panel de diagnóstico (?diag=1).
  private diagFrames = 0;
  private diagXrFrames = 0;
  private diagHits = 0;
  private diagViewer = false;

  constructor(private readonly deps: AppDeps) {
    this.snap = {
      state: 'boot',
      experience: null,
      loadProgress: 0,
      lockPhase: 'aim',
      reticle: 'hidden',
      placeMode: null,
      relocating: false,
      suggestRecalibrate: false,
      idleCountdown: null,
      switcherOpen: false,
      helpOpen: false,
      muted: false,
      simulator: deps.simulator,
      operatorReason: null,
      quality: 'high',
      room: deps.room,
      xrActive: false,
      tableReady: false,
    };

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.localClippingEnabled = true; // plano de corte del Taller
    deps.canvasHost.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.fatal(new Error('webglcontextlost'));
    });

    // Luz: entorno neutro fijo + una direccional con sombra de 1024 px ligada a la mesa.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.8;
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#FFF6EA', '#5B4A40', 0.6));
    this.sun = new THREE.DirectionalLight('#FFF3E2', 1.6);
    this.sun.position.set(0.35, 1.2, 0.45);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -0.6;
    sc.right = 0.6;
    sc.top = 0.45;
    sc.bottom = -0.45;
    sc.near = 0.1;
    sc.far = 3;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.01;
    this.tableFrame.add(this.sun, this.sun.target);

    this.tableFrame.name = 'tableFrame';
    this.contentRoot.name = 'content';
    this.scene.add(this.tableFrame);
    this.tableFrame.add(this.contentRoot);

    this.fx = deps.createFx(this.renderer, this.scene);
    this.twin = new TableTwin(this.fx, TABLE);
    this.tableFrame.add(this.twin.group);
    this.lock = new TableLock(this.tableFrame);
    this.cursor = new PlacementCursor(this.bounds);
    this.reticle = this.fx.createReticle();
    this.tableFrame.add(this.reticle.object);
    this.lockReticle = this.fx.createReticle();
    this.scene.add(this.lockReticle.object); // en mundo: antes del lock no hay marco de mesa
    this.reticle.setState('hidden');
    this.lockReticle.setState('hidden');
    this.loader = createAssetLoader(this.renderer);

    this.sim = deps.simulator ? new DesktopSim(this.renderer.domElement, this.scene, TABLE.height) : null;
    if (this.sim) {
      // El ratón derecho orbita sobre el canvas; la capa de gestos deja pasar ese botón.
      deps.gestureLayer.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) this.forwardToCanvas(e);
      });
      deps.gestureLayer.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.twin.setSimulatorVisual(deps.simulator);
    this.lock.applyPose();

    this.recognizer = new GestureRecognizer(deps.gestureLayer, (g) => this.onScreenGesture(g), () => this.activity());
    deps.gestureLayer.addEventListener('pointermove', (e) => {
      this.pointerScreen.x = e.clientX;
      this.pointerScreen.y = e.clientY;
    });

    this.events.on('ui:action', (a) => this.onUiAction(a));
    this.events.on('ui:activity', () => this.activity());
    this.events.on('ui:tray-drag', (d) => this.recognizer.trayDrag(d.phase, d.x, d.y, d.trayId, d.itemId));
    this.events.on('sound', ({ id }) => deps.audio.play(id));

    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wakeLock === null && this.xr) void this.requestWakeLock();
    });

    const api: UiApi = {
      events: this.events,
      t: deps.t,
      getState: () => this.snap,
      getControls: () => this.controls(),
      experiences: EXPERIENCE_ORDER,
      project: (target, out) => this.project(target, out),
    };
    deps.ui.mount(deps.overlay, api);
  }

  // ───────────────────────────── arranque ─────────────────────────────

  async start(): Promise<void> {
    this.renderer.setAnimationLoop((time, frame) => this.onFrame(time, frame));
    if (this.sim) return this.setState({ state: 'home' });
    const support = await checkXrSupport();
    if (!support.ok) return this.setState({ state: 'operator', operatorReason: this.deps.t(`operator.body.${support.reason}`) });
    this.setState({ state: 'home' });
  }

  getState(): AppSnapshot {
    return this.snap;
  }

  private setState(patch: Partial<AppSnapshot>): void {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof AppSnapshot)[]) {
      if (this.snap[k] !== patch[k]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.snap = { ...this.snap, ...patch };
    this.events.emit('app:state', this.snap);
  }

  private controls(): ControlSpec[] {
    return this.snap.state === 'explore' && this.exp ? this.exp.getControls() : [];
  }

  // ───────────────────────────── acciones de la UI ─────────────────────────────

  private onUiAction(a: UiAction): void {
    this.activity();
    switch (a.type) {
      case 'pick-experience':
        if (this.snap.state === 'explore' || this.snap.state === 'place') void this.switchExperience(a.id);
        else void this.selectExperience(a.id);
        break;
      case 'close-intro':
        this.unloadExperience();
        this.setState({ state: 'home', experience: null, loadProgress: 0 });
        break;
      case 'enter-ar':
        void this.enterAr();
        break;
      case 'lock-nudge':
        if (this.snap.state === 'lock' && this.snap.lockPhase === 'adjust') {
          this.lock.nudgeLocal(a.dx ?? 0, a.dz ?? 0, THREE.MathUtils.degToRad(a.dyawDeg ?? 0));
          this.twin.edge.pulse();
        }
        break;
      case 'lock-confirm':
        if (this.snap.state === 'lock' && this.snap.lockPhase === 'adjust') this.pendingConfirm = true;
        break;
      case 'recalibrate':
        if (this.snap.state !== 'home') this.beginLock();
        // Modo sala: gesto oculto del operador en HOME (calibrar sin elegir experiencia).
        else if (this.deps.room) {
          if (this.xr) this.beginLock();
          else void this.enterAr(true);
        }
        break;
      case 'reset':
        if (!this.exp) break;
        this.exp.reset();
        this.resetManipulation();
        this.events.emit('controls:changed', { experience: this.exp.id });
        break;
      case 'exit':
        void this.goHome();
        break;
      case 'switcher':
        this.setState({ switcherOpen: a.open });
        break;
      case 'help':
        this.setState({ helpOpen: a.open });
        break;
      case 'idle-continue':
        this.idle.activity();
        this.setState({ idleCountdown: null });
        break;
      case 'mute':
        this.deps.audio.setMuted(a.muted);
        this.setState({ muted: a.muted });
        break;
      case 'operator-restart':
        location.reload();
        break;
    }
  }

  private activity(): void {
    this.idle.activity();
    if (this.snap.idleCountdown !== null) this.setState({ idleCountdown: null });
  }

  // ───────────────────────────── experiencias ─────────────────────────────

  private makeContext(root: THREE.Group): ExperienceContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const app = this;
    return {
      root,
      table: TABLE,
      bounds: this.bounds,
      assets: { loadModel: (id) => this.loader.loadModel(id) },
      t: this.deps.t,
      events: this.events,
      fx: this.fx,
      get camera() {
        return app.activeCamera();
      },
      quality: () => this.snap.quality,
    };
  }

  /** Desde HOME: crea y precarga la experiencia mientras el visitante lee el modal. */
  private async selectExperience(id: ExperienceId): Promise<void> {
    const token = ++this.expToken;
    this.unloadExperience();
    this.setState({ state: 'intro', experience: id, loadProgress: 0, switcherOpen: false });
    try {
      await this.loadExperience(id, token);
    } catch (err) {
      if (token === this.expToken) this.fatal(err);
    }
  }

  private async loadExperience(id: ExperienceId, token: number): Promise<void> {
    const meta = EXPERIENCES[id];
    const loadP = this.loader.preload(meta.preload, (p) => token === this.expToken && this.setState({ loadProgress: p * 0.8 }));
    const exp = await meta.factory();
    await loadP;
    if (token !== this.expToken) return;
    const root = new THREE.Group();
    root.name = `exp-${id}`;
    root.visible = false;
    this.contentRoot.add(root);
    this.exp = exp;
    this.expRoot = root;
    await exp.load(this.makeContext(root), (p) => token === this.expToken && this.setState({ loadProgress: 0.8 + p * 0.2 }));
    if (token !== this.expToken) return;
    this.setState({ loadProgress: 1, placeMode: exp.placement.mode });
  }

  /** Dentro de AR: cambiar de experiencia sin recalibrar. */
  private async switchExperience(id: ExperienceId): Promise<void> {
    if (id === this.snap.experience) return this.setState({ switcherOpen: false });
    const token = ++this.expToken;
    if (this.expRoot && this.placed) await this.fx.disappear(this.expRoot, { durationMs: 500 });
    if (token !== this.expToken) return;
    this.unloadExperience();
    this.setState({ state: 'place', experience: id, loadProgress: 0, switcherOpen: false });
    try {
      await this.loadExperience(id, token);
    } catch (err) {
      if (token === this.expToken) this.fatal(err);
    }
  }

  private unloadExperience(): void {
    this.exp?.dispose();
    this.exp = null;
    if (this.expRoot) {
      this.expRoot.removeFromParent();
      disposeObject(this.expRoot);
      this.expRoot = null;
    }
    this.placed = false;
    this.cursor.reset();
    this.loader.purge();
    if (this.snap.placeMode !== null) this.setState({ placeMode: null });
  }

  private placeExperience(at: THREE.Vector3): void {
    if (!this.exp || !this.expRoot || this.snap.loadProgress < 1) return;
    this.placed = true;
    this.placedAt.copy(at);
    this.expRoot.visible = true;
    this.exp.onPlaced(at.clone());
    this.reticle.setState('hidden');
    this.deps.audio.play('place');
    void this.fx.appear(this.expRoot, { from: 'edge' });
    this.setState({ state: 'explore', reticle: 'hidden' });
    this.events.emit('controls:changed', { experience: this.exp.id });
  }

  private resetManipulation(): void {
    const target = this.exp?.getManipulationTarget?.();
    if (!target) return;
    target.position.set(this.placedAt.x, 0, this.placedAt.z);
    target.rotation.set(0, 0, 0);
    target.scale.setScalar(1);
  }

  // ───────────────────────────── XR / simulador ─────────────────────────────

  /** `calibrateOnly`: modo sala, el operador calibra desde HOME sin experiencia cargada. */
  private async enterAr(calibrateOnly = false): Promise<void> {
    if (this.snap.state !== (calibrateOnly ? 'home' : 'intro')) return;
    if (this.xr) return this.resumeAr(); // modo sala: la sesión siguió abierta en HOME
    if (this.sim) {
      if (calibrateOnly) return;
      // D15: en el simulador el Table Lock se da por hecho (marco = origen).
      this.lock.pose.position.set(0, 0, 0);
      this.lock.pose.yaw = 0;
      this.lock.applyPose();
      this.lock.locked = true;
      this.twin.edge.setMode('rest');
      this.setState({ state: 'place' });
      return;
    }
    try {
      this.xr = await startXrSession(this.renderer, this.deps.overlay);
    } catch (err) {
      console.error('[xr] no se pudo iniciar la sesión', err);
      this.setState({ state: 'operator', operatorReason: `${this.deps.t('operator.body.session_failed')} (${String(err)})` });
      return;
    }
    this.endingXr = false;
    this.xr.session.addEventListener('end', () => {
      this.xr = null;
      void this.releaseWakeLock();
      if (!this.endingXr) void this.goHome(); // la cerró el sistema
    });
    void this.requestWakeLock();
    this.health.reset();
    this.scanGoodMs = 0;
    this.scanMs = 0;
    this.planeY = null;
    this.lock.unlock();
    this.twin.edge.setMode('hidden');
    this.setState({ state: 'scan', xrActive: true, tableReady: false });
  }

  /** Modo sala: el visitante entra a una sesión que ya estaba abierta (con la mesa calibrada si la hay). */
  private resumeAr(): void {
    // El tracking perdido mientras la tablet descansaba en el soporte no cuenta para este visitante.
    this.health.reset();
    this.drift.reset();
    const patch = { relocating: false, suggestRecalibrate: false };
    if (this.snap.state === 'home') return this.beginLock(); // calibración del operador
    if (this.lock.locked) {
      this.twin.edge.setMode('rest');
      return this.setState({ ...patch, state: 'place' });
    }
    this.scanGoodMs = 0;
    this.scanMs = 0;
    this.setState({ ...patch, state: 'scan' });
  }

  private beginLock(): void {
    if (this.sim) return; // en el simulador no hay nada que calibrar
    this.lock.unlock();
    this.drift.reset();
    this.twin.edge.setMode('hidden');
    this.setState({ state: 'lock', lockPhase: 'aim', suggestRecalibrate: false, switcherOpen: false, tableReady: false });
  }

  private async goHome(): Promise<void> {
    // Modo sala: la sesión AR y la calibración quedan para el próximo visitante (D25).
    const keep = this.deps.room && this.xr !== null;
    ++this.expToken;
    this.unloadExperience();
    if (!keep || !this.lock.locked) this.lock.unlock();
    this.health.reset();
    this.drift.reset();
    this.idle.reset();
    this.pendingConfirm = false;
    this.twin.edge.setMode(this.sim ? 'rest' : 'hidden');
    this.lockReticle.setState('hidden');
    if (this.xr && !keep) {
      this.endingXr = true;
      await this.xr.end();
      this.xr = null;
    }
    this.setState({
      xrActive: this.xr !== null,
      tableReady: keep && this.lock.locked,
      state: 'home',
      experience: null,
      loadProgress: 0,
      relocating: false,
      suggestRecalibrate: false,
      idleCountdown: null,
      switcherOpen: false,
      helpOpen: false,
      reticle: 'hidden',
      lockPhase: 'aim',
    });
  }

  private async requestWakeLock(): Promise<void> {
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
      this.wakeLock?.addEventListener('release', () => (this.wakeLock = null));
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      /* nada */
    }
    this.wakeLock = null;
  }

  private activeCamera(): THREE.Camera {
    if (this.sim) return this.sim.camera;
    if (this.renderer.xr.isPresenting) {
      const xc = this.renderer.xr.getCamera();
      return xc.cameras[0] ?? xc;
    }
    return this.xrCameraFallback;
  }

  // ───────────────────────────── bucle por frame ─────────────────────────────

  private onFrame(time: number, frame?: XRFrame): void {
    // Al entrar o salir de la sesión XR cambia la base de tiempo (los frames de WebXR traen su propio
    // reloj): el salto puede ser negativo y enorme. Un dt negativo hacía que damp() diera Infinity y
    // luego NaN en las opacidades, y retícula, borde y modelo quedaban dibujándose invisibles.
    const raw = time - this.lastTime;
    const dtMs = this.lastTime && raw > 0 && Number.isFinite(raw) ? Math.min(100, raw) : 16;
    this.lastTime = time;
    const dt = dtMs / 1000;
    this.elapsed += dt;
    this.measureFps(dtMs);

    this.diagFrames++;
    let good = true;
    if (this.xr && frame) good = this.updateXr(frame, dtMs);
    else if (this.sim) {
      this.sim.update();
      good = !this.sim.trackingLost;
    }

    // Solo con la mesa en uso: en modo sala, en HOME la tablet descansa en el soporte mirando al pedestal.
    if ((this.lock.locked || this.sim) && AR_STATES.has(this.snap.state)) {
      if (this.health.sample(good, dtMs)) this.setState({ relocating: this.health.lost });
      if (this.health.lost && this.health.lostForMs > TRACKING.recalibrateAfterMs) this.setState({ suggestRecalibrate: true });
      // El aviso se retira solo si el tracking volvió y la altura cuadra durante un rato (el ancla se recuperó).
      this.suggestOkMs = this.snap.suggestRecalibrate && !this.health.lost && !this.driftSuggest ? this.suggestOkMs + dtMs : 0;
      if (this.suggestOkMs > SUGGEST_CLEAR_MS) this.setState({ suggestRecalibrate: false });
    }

    if (this.snap.state === 'place') this.updatePlaceCursor(dt);

    // R1: con tracking perdido se conserva el último estado y no se anima.
    if (!this.health.lost) {
      if (this.snap.state === 'explore' && this.exp && this.placed) this.exp.update(dt, this.elapsed);
      this.fx.update(dt);
      this.twin.edge.update(dt);
      this.reticle.update(dt);
      this.lockReticle.update(dt);
    }
    this.deps.ui.tick(dt);
    this.updateIdle(dtMs);
    this.renderer.render(this.scene, this.sim ? this.sim.camera : this.xrCameraFallback);
  }

  /** Devuelve si el tracking es "bueno" este frame. */
  private updateXr(frame: XRFrame, dtMs: number): boolean {
    const xr = this.xr!;
    const viewer = frame.getViewerPose(xr.refSpace);
    let hit: XRHitTestResult | undefined;
    let results: readonly XRHitTestResult[] | null = null;
    if (xr.hitTestSource) {
      results = frame.getHitTestResults(xr.hitTestSource);
      this.diagHits = results.length;
      hit = results[0];
    }
    this.diagXrFrames++;
    this.diagViewer = !!viewer;
    this.aimHit = false;
    let realHit = false;
    if (hit) {
      const pose = hit.getPose(xr.refSpace);
      if (pose) {
        _hitMatrix.fromArray(pose.transform.matrix);
        _hitPos.setFromMatrixPosition(_hitMatrix);
        this.aimHit = realHit = true;
        this.planeY = _hitPos.y;
      }
    }
    // Sin hit este frame (un tope blanco y liso hace parpadear la detección de ARCore): se apunta al
    // último plano conocido con el rayo del centro de la pantalla, para que la retícula no desaparezca.
    if (!realHit && this.planeY !== null && !this.lock.locked) {
      const r = this.screenRayWorld(innerWidth / 2, innerHeight / 2);
      _worldPlane.set(_v2.set(0, 1, 0), -this.planeY);
      if (r?.intersectPlane(_worldPlane, _hitPos)) this.aimHit = true;
    }

    switch (this.snap.state) {
      case 'scan':
        this.scanMs += dtMs;
        // Los fallos sueltos solo restan: no reinician el escaneo.
        this.scanGoodMs = realHit ? this.scanGoodMs + dtMs : Math.max(0, this.scanGoodMs - dtMs / 2);
        if (this.scanMs > SCAN_FALLBACK_MS && this.planeY === null && viewer) {
          // ARCore no encontró la mesa: se estima su tope bajo la tablet; el visitante lo ajusta luego.
          this.planeY = viewer.transform.position.y - FALLBACK_DROP_M;
          console.warn('[xr] sin superficie detectada: tope estimado bajo la tablet');
        }
        if (this.scanGoodMs > SCAN_READY_MS || (this.planeY !== null && this.scanMs > SCAN_FALLBACK_MS)) this.beginLock();
        break;
      case 'lock':
        if (this.snap.lockPhase === 'aim') {
          this.lockReticle.setState(this.aimHit ? 'ok' : 'hidden');
          if (this.aimHit) {
            this.aimPoint.copy(_hitPos);
            this.lockReticle.object.position.copy(_hitPos);
          }
        } else if (this.pendingConfirm) {
          this.pendingConfirm = false;
          void this.confirmLock(frame);
        }
        break;
    }

    if (!this.lock.locked) return !!viewer;
    const jump = this.lock.updateFromAnchor(frame, xr.refSpace);
    // Deriva de altura (D22): de los resultados del hit-test que caen dentro del rectángulo de la mesa,
    // el más cercano al tope (los demás suelen ser el piso u otro plano). Lo pequeño se corrige solo.
    let diff: number | null = null;
    if (results && results.length && AR_STATES.has(this.snap.state)) {
      this.tableFrame.updateMatrixWorld();
      for (let i = 0; i < results.length; i++) {
        const p = results[i]!.getPose(xr.refSpace)?.transform.position;
        if (!p) continue;
        this.tableFrame.worldToLocal(_v.set(p.x, p.y, p.z));
        const inside = Math.abs(_v.x) < TABLE.length / 2 && Math.abs(_v.z) < TABLE.width / 2;
        if (inside && (diff === null || Math.abs(_v.y) < Math.abs(diff))) diff = _v.y;
      }
    }
    const d = this.drift.sample(diff, dtMs);
    if (d.correctM !== 0) this.lock.adjustHeight(d.correctM);
    this.driftSuggest = d.suggest;
    if (d.suggest && !this.snap.suggestRecalibrate) this.setState({ suggestRecalibrate: true });
    return !!viewer && jump !== null && jump < TRACKING.jumpMeters;
  }

  private async confirmLock(frame: XRFrame): Promise<void> {
    await this.lock.confirm(frame, this.xr?.refSpace ?? null);
    this.health.reset();
    this.drift.reset();
    this.twin.edge.setMode('lock');
    void this.twin.edge.sweep(); // termina en 'rest' (P-010.6); el sonido lo pone la UI (P-010.4)
    // Sin experiencia (calibración del operador en modo sala) se vuelve a HOME con la mesa lista.
    this.setState({ state: this.placed ? 'explore' : this.snap.experience ? 'place' : 'home', suggestRecalibrate: false, tableReady: this.deps.room });
  }

  private updatePlaceCursor(dt: number): void {
    const mode = this.exp?.placement.mode ?? 'point';
    if (mode === 'table') {
      this.reticle.setState('hidden');
      return this.setState({ reticle: 'hidden' });
    }
    // XR: centro de la pantalla. Simulador: posición del ratón.
    const sx = this.sim ? this.pointerScreen.x : innerWidth / 2;
    const sy = this.sim ? this.pointerScreen.y : innerHeight / 2;
    const ray = this.screenRayLocal(sx, sy);
    const s = this.cursor.update(ray, this.exp?.placement.footprintRadius ?? 0.1, dt);
    this.reticle.setState(s);
    this.reticle.object.position.copy(this.cursor.smoothed);
    this.setState({ reticle: s });
  }

  private updateIdle(dtMs: number): void {
    if (this.snap.state === 'home' || this.snap.state === 'boot' || this.snap.state === 'operator') {
      this.idle.reset();
      return;
    }
    const st = this.idle.tick(dtMs);
    if (st.phase === 'expired') void this.goHome();
    else this.setState({ idleCountdown: st.phase === 'warning' ? st.secondsLeft : null });
  }

  private measureFps(dtMs: number): void {
    this.fpsFrames++;
    this.fpsAccum += dtMs;
    if (this.fpsAccum < 1000) return;
    const fps = (this.fpsFrames * 1000) / this.fpsAccum;
    this.fpsFrames = 0;
    this.fpsAccum = 0;
    this.lowFpsSeconds = fps < 30 && this.snap.state === 'explore' ? this.lowFpsSeconds + 1 : 0;
    if (this.lowFpsSeconds >= 3) {
      this.lowFpsSeconds = 0;
      const i = QUALITY_ORDER.indexOf(this.snap.quality);
      const next = QUALITY_ORDER[Math.min(QUALITY_ORDER.length - 1, i + 1)]!;
      if (next !== this.snap.quality) {
        console.info(`[app] fps ${fps.toFixed(1)} → calidad ${next}`);
        this.fx.setQuality(next);
        this.setState({ quality: next });
      }
    }
  }

  // ───────────────────────────── gestos ─────────────────────────────

  /** Rayo de pantalla en coordenadas de mundo. */
  private screenRayWorld(x: number, y: number): THREE.Ray | null {
    const cam = this.activeCamera();
    if (!this.sim && !this.renderer.xr.isPresenting) return null;
    _ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    _caster.setFromCamera(_ndc, cam);
    return _ray.copy(_caster.ray);
  }

  /** Rayo de pantalla en el marco "mesa local". */
  private screenRayLocal(x: number, y: number): THREE.Ray | null {
    const r = this.screenRayWorld(x, y);
    if (!r) return null;
    this.tableFrame.updateMatrixWorld();
    _inv.copy(this.tableFrame.matrixWorld).invert();
    return _rayLocal.copy(r).applyMatrix4(_inv);
  }

  private onScreenGesture(g: ScreenGesture): void {
    switch (this.snap.state) {
      case 'lock':
        return this.lockGesture(g);
      case 'place':
        if (g.type === 'tap') this.placeTap();
        return;
      case 'explore':
        if (this.snap.switcherOpen || this.snap.helpOpen) return;
        return this.exploreGesture(g);
    }
  }

  private lockGesture(g: ScreenGesture): void {
    if (this.snap.lockPhase === 'aim') {
      if (g.type !== 'tap' || !this.aimHit) return;
      const cam = this.activeCamera();
      cam.getWorldPosition(_v2);
      this.lock.setCenter(this.aimPoint, _v2);
      this.lockReticle.setState('hidden');
      this.twin.edge.setMode('lock');
      this.deps.audio.play('tap');
      this.setState({ lockPhase: 'adjust' });
      return;
    }
    if (g.type === 'drag') {
      const r = this.screenRayWorld(g.x, g.y);
      _worldPlane.set(_v2.set(0, 1, 0), -this.lock.pose.position.y);
      const p = r?.intersectPlane(_worldPlane, _v) ?? null;
      if (g.phase === 'start' || !this.lockDragHas) {
        this.lockDragHas = !!p;
        if (p) this.lockDragPrev.copy(p);
      } else if (p && g.phase === 'move') {
        this.lock.moveWorld(p.x - this.lockDragPrev.x, p.z - this.lockDragPrev.z);
        this.lockDragPrev.copy(p);
      }
      if (g.phase === 'end' || g.phase === 'cancel') this.lockDragHas = false;
    } else if (g.type === 'rotate' && g.phase === 'move') {
      this.lock.rotate(g.deltaAngle);
    }
  }

  private placeTap(): void {
    if (!this.exp || this.snap.loadProgress < 1) return;
    if (this.exp.placement.mode === 'table') return this.placeExperience(_v.set(0, 0, 0));
    if (this.cursor.state === 'hidden') return;
    this.placeExperience(_v.copy(this.cursor.smoothed));
  }

  private readonly ge = {
    ray: new THREE.Ray(),
    point: new THREE.Vector3(),
    origin: new THREE.Vector3(),
    screen: { x: 0, y: 0 },
  };

  private exploreGesture(g: ScreenGesture): void {
    if (!this.exp) return;
    const ray = this.screenRayLocal(g.x, g.y);
    if (!ray) return;
    const ge = this.ge;
    ge.ray.copy(ray);
    const point = rayToTop(ge.ray, ge.point);
    ge.screen.x = g.x / innerWidth;
    ge.screen.y = g.y / innerHeight;
    let ev: GestureEvent;
    const base = { ray: ge.ray, point, screen: ge.screen };
    switch (g.type) {
      case 'tap':
      case 'doubletap':
      case 'longpress':
        ev = { ...base, type: g.type };
        break;
      case 'drag': {
        const oRay = this.screenRayLocal(g.ox, g.oy);
        const origin = oRay ? rayToTop(oRay, ge.origin) : null;
        ev = { ...base, type: 'drag', phase: g.phase, origin, ...(g.fromTray ? { fromTray: g.fromTray } : {}) };
        break;
      }
      case 'rotate':
        ev = { ...base, type: 'rotate', phase: g.phase, deltaAngle: g.deltaAngle };
        break;
      case 'pinch':
        ev = { ...base, type: 'pinch', phase: g.phase, deltaScale: g.deltaScale };
        break;
    }
    this.twin.edge.pulse();
    if (this.exp.onGesture(ev) === true) return;
    this.defaultManipulation(ev);
  }

  /** Mover / girar / escalar el objetivo de manipulación de la experiencia (D5, D9). */
  private defaultManipulation(ev: GestureEvent): void {
    const target = this.exp?.getManipulationTarget?.();
    const pl = this.exp?.placement;
    if (!target || !pl) return;
    const radius = () => pl.footprintRadius * target.scale.x;
    switch (ev.type) {
      case 'drag':
        if (ev.fromTray) return;
        if (ev.phase === 'start' || !this.dragHas) {
          this.dragHas = !!ev.point;
          if (ev.point) this.dragPrev.copy(ev.point);
          return;
        }
        if (ev.phase === 'move' && ev.point) {
          target.position.x += ev.point.x - this.dragPrev.x;
          target.position.z += ev.point.z - this.dragPrev.z;
          this.bounds.clamp(target.position, radius());
          this.dragPrev.copy(ev.point);
        }
        if (ev.phase === 'end' || ev.phase === 'cancel') this.dragHas = false;
        return;
      case 'rotate':
        target.rotation.y += ev.deltaAngle;
        return;
      case 'pinch': {
        if (!pl.scaleRange) return;
        const s = THREE.MathUtils.clamp(target.scale.x * ev.deltaScale, pl.scaleRange[0], pl.scaleRange[1]);
        target.scale.setScalar(s);
        this.bounds.clamp(target.position, radius());
        return;
      }
      case 'doubletap':
        target.position.set(0, target.position.y, 0);
        return;
    }
  }

  // ───────────────────────────── utilidades ─────────────────────────────

  /** Foto del estado interno para el panel de diagnóstico (?diag=1). No se llama por frame. */
  diagnostics(): Record<string, string> {
    const f = (v: THREE.Vector3) => `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}`;
    const vis = (o: THREE.Object3D | null | undefined) => {
      if (!o) return 'null';
      let chain = true;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) chain &&= p.visible;
      o.getWorldPosition(_v);
      return `${o.visible ? 'vis' : 'oculto'}${chain ? '' : ' (padre oculto)'} ${o.parent ? '' : 'SIN PADRE '}@ ${f(_v)}`;
    };
    const cam = this.activeCamera();
    cam.getWorldPosition(_v2);
    const camPos = f(_v2);
    const session = this.xr?.session as (XRSession & { enabledFeatures?: string[] }) | undefined;
    const info = this.renderer.info.render;
    let meshes = 0;
    this.expRoot?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    const s = this.snap;
    // Opacidad real de lo que se dibuja: NaN o 0 con "vis" = se dibuja invisible.
    const op = (o: THREE.Object3D) => {
      let v = -1;
      o.traverse((c) => {
        const m = (c as THREE.Mesh).material as (THREE.Material & { uniforms?: Record<string, { value: unknown }> }) | undefined;
        if (!m) return;
        const u = m.uniforms?.uOpacity?.value;
        v = Math.max(v, typeof u === 'number' ? u : m.opacity); // Math.max propaga NaN
      });
      return Number.isNaN(v) ? 'NaN' : v.toFixed(2);
    };
    const layer = this.renderer.xr.getBaseLayer() as (XRWebGLLayer & { textureWidth?: number }) | null;
    const layerInfo = !layer
      ? '-'
      : typeof XRWebGLLayer !== 'undefined' && layer instanceof XRWebGLLayer
        ? `XRWebGLLayer ${layer.framebufferWidth}x${layer.framebufferHeight}`
        : `XRProjectionLayer ${layer.textureWidth ?? '?'}`;
    const chrome = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? navigator.userAgent.slice(0, 40);
    const out: Record<string, string> = {
      estado: `${s.state} lock=${s.lockPhase} retícula=${s.reticle} carga=${Math.round(s.loadProgress * 100)}% exp=${s.experience ?? '-'}`,
      frames: `total=${this.diagFrames} xr=${this.diagXrFrames} presentando=${this.renderer.xr.isPresenting} viewer=${this.diagViewer}`,
      hitTest: `fuente=${!!this.xr?.hitTestSource} resultados=${this.diagHits} aimHit=${this.aimHit} @ ${f(_hitPos)}`,
      escaneo: `${(this.scanMs / 1000).toFixed(1)} s, bueno=${Math.round(this.scanGoodMs)} ms, planoY=${this.planeY?.toFixed(2) ?? '-'}`,
      sesion: session ? `${session.visibilityState} blend=${session.environmentBlendMode ?? '?'} feats=${session.enabledFeatures?.join(',') ?? '?'}` : 'sin sesión XR',
      camara: `${camPos} near=${(cam as THREE.PerspectiveCamera).near ?? '?'} far=${(cam as THREE.PerspectiveCamera).far ?? '?'}`,
      mesa: `locked=${this.lock.locked} ancla=${!!this.lock.anchor} yaw=${THREE.MathUtils.radToDeg(this.lock.pose.yaw).toFixed(0)}° ${vis(this.tableFrame)}`,
      retLock: vis(this.lockReticle.object),
      retColoc: vis(this.reticle.object),
      borde: vis(this.twin.edge.object),
      modelo: `${vis(this.expRoot)} mallas=${meshes} colocado=${this.placed}`,
      tracking: `perdido=${this.health.lost} calidad=${s.quality}`,
      opacidad: `retLock=${op(this.lockReticle.object)} retColoc=${op(this.reticle.object)} borde=${op(this.twin.edge.object)}`,
      render: `calls=${info.calls} tris=${info.triangles} contexto=${this.renderer.getContext().isContextLost() ? 'PERDIDO' : 'ok'}`,
      capa: `${layerInfo} chrome=${chrome}`,
      pantalla: `${innerWidth}x${innerHeight} fullscreen=${!!document.fullscreenElement} AR desde fullscreen=${this.xr?.fromFullscreen ?? '-'}`,
    };
    return out;
  }

  private project(target: THREE.Object3D, out: { x: number; y: number; visible: boolean }) {
    const cam = this.activeCamera();
    target.getWorldPosition(_v2);
    _v2.project(cam);
    out.x = ((_v2.x + 1) / 2) * innerWidth;
    out.y = ((1 - _v2.y) / 2) * innerHeight;
    out.visible = _v2.z > -1 && _v2.z < 1 && Math.abs(_v2.x) <= 1.1 && Math.abs(_v2.y) <= 1.1;
    return out;
  }

  private resize(): void {
    if (this.renderer.xr.isPresenting) return;
    this.renderer.setSize(innerWidth, innerHeight);
    this.sim?.resize(innerWidth, innerHeight);
  }

  private forwardToCanvas(e: PointerEvent): void {
    // Reenvía el botón derecho/central al canvas para que OrbitControls lo maneje.
    this.renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', e));
  }

  /** Límite de errores global: pantalla amable y reinicio. */
  fatal(err: unknown): void {
    console.error('[app] error fatal', err);
    showFatal(this.deps.overlay, this.deps.t);
  }
}

export function showFatal(host: HTMLElement, t: Translate): void {
  if (document.getElementById('fatal')) return;
  const box = document.createElement('div');
  box.id = 'fatal';
  box.setAttribute('role', 'alertdialog');
  box.style.cssText =
    'position:fixed;inset:0;display:grid;place-content:center;gap:16px;text-align:center;padding:24px;background:#FAF6DC;color:#3A2418;font:20px/1.4 system-ui,sans-serif;z-index:1000;pointer-events:auto';
  const h = document.createElement('h1');
  h.style.cssText = 'font-size:28px;margin:0';
  h.textContent = t('error.title');
  const p = document.createElement('p');
  p.style.margin = '0';
  p.textContent = t('error.body.generic');
  const b = document.createElement('button');
  b.textContent = t('error.label.restart');
  b.style.cssText = 'justify-self:center;min-height:56px;padding:0 28px;border:0;border-radius:28px;background:#B44E1C;color:#FAF6DC;font:600 20px system-ui,sans-serif';
  b.addEventListener('click', () => location.reload());
  b.addEventListener('beforexrselect', (e) => e.preventDefault());
  box.append(h, p, b);
  host.append(box);
  if (!import.meta.env.DEV) setTimeout(() => location.reload(), 8000);
}
