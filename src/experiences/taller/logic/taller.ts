// Taller de Máquinas (sección 6): un modelo héroe a la vez que se desarma, se inspecciona,
// funciona, se corta con rayos X y se vuelve a armar. Cuatro máquinas (D27): motor 4 tiempos, motor
// eléctrico, turbina Pelton y brazo robótico de 6 ejes. Lógica del Agente 1; los efectos propios de cada
// máquina (bobinas, chorro, bombillo) viven en ../anim/machine-fx.ts (Agente 3).
import * as THREE from 'three';
import type { ControlSpec, Experience, ExperienceContext, GestureEvent, LoadedModel, LoadedPart, PartExtras } from '../../../core/contracts';
import { createMachineFx, type MachineFx } from '../anim/machine-fx';
import { DEMO, demoKeys, samplePose, type ArmPose, type DemoKey } from './arm';
import { autoScale, canMount, cascadeDelay, mountable, snaps, type PartInput } from './explode';

const K = 'exp.taller';
const C = `${K}.controls.label`;
const EXPLODE_S = 0.7; // duración de cada pieza al separarse/juntarse
const PHASES = 4;
const STROKE_TIP_MIN_S = 5; // un tiempo debe durar al menos esto para que su explicación se alcance a leer
const GRIP_M = 0.012; // apertura de cada dedo de la pinza al 100 % (m)
const JOINT_DAMP = 7; // 1/s: suavizado de los ejes del brazo hacia su objetivo
const PELTON_W = 420; // vatios del generador a velocidad 1×
const RAD = Math.PI / 180;

const MACHINES = ['motor4t', 'motor_electric', 'pelton', 'robot_arm'] as const;
type MachineId = (typeof MACHINES)[number];

interface MachineSpec {
  /** Clip principal (null = la lógica anima la máquina: demostración del brazo). */
  clip: string | null;
  /** Piezas por las que pasa la línea "Ver el cauce", en orden. */
  flow: string[];
  /** Grupos que se vuelven translúcidos con rayos X (la "carcasa"). */
  shell: string[];
  /** Narración por tiempos (motor 4T). */
  strokes: boolean;
  /** Aviso al hacerla funcionar por primera vez (si no narra por tiempos). */
  playTip: boolean;
}

const SPEC: Record<MachineId, MachineSpec> = {
  motor4t: { clip: 'anim_cycle', flow: ['carburetor', 'piston', 'connecting_rod', 'crankshaft', 'flywheel'], shell: ['case'], strokes: true, playTip: false },
  motor_electric: { clip: 'anim_spin', flow: ['terminal_box', 'coil_a', 'stator_core', 'rotor_magnets', 'shaft'], shell: ['case', 'cooling'], strokes: false, playTip: true },
  pelton: { clip: 'anim_run', flow: ['penstock', 'nozzle', 'buckets', 'shaft', 'generator_rotor', 'lamp'], shell: ['case'], strokes: false, playTip: true },
  robot_arm: { clip: null, flow: ['base_motor', 'turret', 'upper_arm', 'elbow_housing', 'forearm', 'wrist', 'gripper_body'], shell: ['structure'], strokes: false, playTip: false },
};

const PHASE_KEYS = ['exp.taller.motor_electric.label.phase_a', 'exp.taller.motor_electric.label.phase_b', 'exp.taller.motor_electric.label.phase_c'];
const JOINT_KEYS = [`${C}.joint1`, `${C}.joint2`, `${C}.joint3`, `${C}.joint4`, `${C}.joint5`, `${C}.joint6`];
const MACHINE_KEYS: Record<MachineId, string> = {
  motor4t: `${C}.motor4t`,
  motor_electric: `${C}.motor_electric`,
  pelton: `${C}.pelton`,
  robot_arm: `${C}.robot_arm`,
};

type HelpLevel = 'none' | 'next' | 'all';
type Mode = 'explore' | 'assemble';

/** Campos propios del brazo en los extras de sus piezas (tools/models/build/robot_arm.mjs). */
type ArmExtras = PartExtras & { link?: number; finger?: number };

interface PartState {
  part: LoadedPart;
  input: PartInput;
  /** Centro de la pieza armada, en espacio del modelo. */
  restCenter: THREE.Vector3;
  /** Desplazamiento total al 100 %, en el espacio local del padre de la pieza. */
  localOffset: THREE.Vector3;
  /** Desplazamiento al 100 %, en espacio del modelo. */
  modelOffset: THREE.Vector3;
  amount: number;
  from: number;
  to: number;
  startAt: number;
  // Reto de armado
  mounted: boolean;
  shuffled: THREE.Vector3; // posición local barajada
  // Brazo robótico
  link: number; // eslabón (0 = base fija)
  finger: number; // ±1 en los dedos de la pinza
}

interface Joint {
  /** Punto de giro y eje, en espacio del modelo con todos los ejes en 0. */
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
  min: number; // grados
  max: number;
  angle: number;
  target: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _box = new THREE.Box3();
const _caster = new THREE.Raycaster();
const _m = new THREE.Matrix4();
const _ma = new THREE.Matrix4();
const _mb = new THREE.Matrix4();
const _plane = new THREE.Plane();

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createTaller(): Experience {
  let ctx: ExperienceContext;
  let model: LoadedModel;
  let machine: MachineId = 'motor4t';
  let spec: MachineSpec = SPEC.motor4t;
  let ready = false; // hay un modelo montado (falso mientras se cambia de máquina)
  let switching = false;
  let disposed = false;
  const placed = new THREE.Group(); // objetivo de manipulación (mover/girar/pellizco)
  const scaler = new THREE.Group(); // autoescala de la explosión (D9)
  const states: PartState[] = [];
  const byNode = new Map<THREE.Object3D, PartState>();
  let mixer: THREE.AnimationMixer | null = null;
  let action: THREE.AnimationAction | null = null;
  let machineFx: MachineFx | null = null;
  let time = 0;
  let global = 0; // explosión media de las piezas (0..1)

  // Estado de controles
  let explode = 0;
  let playing = false;
  let speed = 1;
  let xray = false;
  let cut = 0;
  let flow = false;
  let mode: Mode = 'explore';
  let help: HelpLevel = 'none';
  let selected: PartState | null = null;
  let phase = 0;
  let slowmoHinted = false;
  let playTipShown = false;

  // Visuales propios (los de cada modelo se crean en setupModel y se liberan en teardownModel)
  let guides: THREE.LineSegments | null = null;
  let flowLine: THREE.Line | null = null;
  const shadows = new THREE.Group();
  const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1);
  const disposables: { dispose(): void }[] = []; // de toda la experiencia
  const modelDisposables: { dispose(): void }[] = []; // del modelo montado
  const xrayMats = new Map<THREE.Material, THREE.Material>();
  const origMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  let modelBox = new THREE.Box3();

  // Brazo robótico: cadena de 6 ejes, pinza y demostración
  const joints: Joint[] = [];
  const links = Array.from({ length: 7 }, () => new THREE.Matrix4()); // matriz de cada eslabón (0 = base)
  const pose: ArmPose = [0, 0, 0, 0, 0, 0];
  let grip = 1; // apertura de la pinza 0..1
  let gripTarget = 1;
  let demoRun: DemoKey[] | null = null;
  let demoT = 0;
  let demoFromA = true;
  let held = false;
  const sphereHold = new THREE.Vector3(); // esfera en el marco del eslabón 6 mientras la pinza la sujeta
  const sphereGeo = new THREE.SphereGeometry(DEMO.sphereR, 24, 16);
  const sphereMat = new THREE.MeshStandardMaterial({ color: '#F2C744', roughness: 0.35, metalness: 0.05 });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.name = 'taller-demo-sphere';
  sphere.castShadow = true;
  disposables.push(sphereGeo, sphereMat);

  // Arrastre en el reto
  let dragging: PartState | null = null;
  const dragOffset = new THREE.Vector3();

  const changed = () => ctx.events.emit('controls:changed', { experience: 'taller' });
  const isArm = () => machine === 'robot_arm';

  // ───────── utilidades de espacio ─────────
  /** Punto en mesa local → espacio local del padre de `node`. */
  const tableToParent = (p: THREE.Vector3, node: THREE.Object3D, out: THREE.Vector3) => {
    out.copy(p);
    ctx.root.localToWorld(out);
    return node.parent!.worldToLocal(out);
  };

  const partsInput = (): PartInput[] => states.map((s) => s.input);

  // ───────── explosión ─────────
  const setExplode = (v: number, now: number) => {
    const goingOut = v > explode;
    explode = v;
    const maxOrder = Math.max(...states.map((s) => s.input.explode.order));
    for (const s of states) {
      s.from = s.amount;
      s.to = v;
      // Al separar: de afuera hacia adentro según `order`; al juntar, al revés.
      const ord = goingOut ? s.input.explode.order : maxOrder - s.input.explode.order;
      s.startAt = now + cascadeDelay(ord);
    }
    ctx.events.emit('explode:set', { value: v });
  };

  const applyPart = (s: PartState) => {
    const node = s.part.node;
    if (mode === 'assemble' && !s.mounted) return; // la posición la controla el reto
    node.position.copy(s.part.restPosition).addScaledVector(s.localOffset, s.amount);
    if (!isArm()) return;
    // Brazo: la pinza abre los dedos en su eslabón y la cadena de ejes lleva la pieza a su pose.
    if (s.finger) node.position.x += s.finger * grip * GRIP_M;
    if (s.link > 0) {
      _ma.compose(node.position, s.part.restQuaternion, node.scale).premultiply(links[s.link]!);
      _ma.decompose(node.position, node.quaternion, node.scale);
    }
  };

  let autoS = 1;
  const updateAutoScale = () => {
    _v.copy(placed.position);
    const user = placed.scale.x;
    const scaledParts = partsInput().map((p) => ({
      ...p,
      rest: { x: p.rest.x * user, y: p.rest.y * user, z: p.rest.z * user },
      radius: p.radius * user,
      explode: { ...p.explode, dist: p.explode.dist * user },
    }));
    autoS = autoScale(scaledParts, { x: _v.x, y: 0, z: _v.z }, ctx.bounds);
  };

  // ───────── rayos X y corte ─────────
  const applyXray = () => {
    for (const s of states) {
      if (!spec.shell.includes(s.part.extras.group)) continue;
      s.part.node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!origMats.has(mesh)) origMats.set(mesh, mesh.material);
        const orig = origMats.get(mesh)!;
        if (!xray) {
          mesh.material = orig;
          return;
        }
        const mats = Array.isArray(orig) ? orig : [orig];
        const swapped = mats.map((m) => {
          let x = xrayMats.get(m);
          if (!x) {
            x = m.clone();
            x.transparent = true;
            x.opacity = 0.22;
            x.depthWrite = false;
            xrayMats.set(m, x);
          }
          return x;
        });
        mesh.material = Array.isArray(orig) ? swapped : swapped[0]!;
      });
    }
  };

  const applyCut = () => {
    const planes = cut > 0 ? [clipPlane] : [];
    model.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        m.clippingPlanes = planes;
        m.clipShadows = true;
        m.side = cut > 0 ? THREE.DoubleSide : THREE.FrontSide;
      }
    });
  };

  const updateClipPlane = () => {
    if (cut <= 0) return;
    // Plano perpendicular a X del modelo que avanza de +X a −X según `cut`.
    const x = THREE.MathUtils.lerp(modelBox.max.x, modelBox.min.x, cut * 0.95);
    _plane.set(_v2.set(-1, 0, 0), x);
    model.scene.updateMatrixWorld();
    clipPlane.copy(_plane).applyMatrix4(model.scene.matrixWorld);
  };

  // ───────── selección ─────────
  const select = (s: PartState | null) => {
    selected = s;
    ctx.fx.outline(s ? s.part.node : null);
    const others = states.filter((x) => x !== s).map((x) => x.part.node);
    ctx.fx.ghost(
      states.map((x) => x.part.node),
      false,
    );
    if (s) ctx.fx.ghost(others, true);
    ctx.events.emit('part:selected', { modelId: model.id, partId: s ? s.part.id : null });
    ctx.events.emit(
      'label:show',
      s
        ? {
            id: s.part.id,
            anchor: s.part.node,
            titleKey: s.part.extras.labelKey,
            bodyKey: `${K}.${model.id}.body.${s.part.id}`,
            actions: [{ id: 'see_action', labelKey: `${C}.see_action` }],
          }
        : null,
    );
  };

  const partFromObject = (o: THREE.Object3D | null): PartState | null => {
    for (let n: THREE.Object3D | null = o; n; n = n.parent) {
      const s = byNode.get(n);
      if (s) return s;
    }
    return null;
  };

  const pick = (ray: THREE.Ray): PartState | null => {
    if (!ready) return null;
    _caster.ray.copy(ray);
    // El rayo viene en mesa local; los objetos se prueban en mundo.
    _caster.ray.applyMatrix4(ctx.root.matrixWorld);
    const hits = _caster.intersectObject(model.scene, true);
    for (const h of hits) {
      const s = partFromObject(h.object);
      if (!s) continue;
      if (xray && spec.shell.includes(s.part.extras.group) && hits.length > 1) continue; // en rayos X se toca lo de adentro
      return s;
    }
    return null;
  };

  // ───────── funcionar ─────────
  const setPlaying = (p: boolean) => {
    playing = p;
    if (action) action.paused = !p;
    if (p && explode > 0 && mode === 'explore') setExplode(0, time);
    if (p && isArm() && !demoRun) startDemoRun();
    if (p && !playTipShown && (spec.playTip || isArm())) {
      playTipShown = true;
      ctx.events.emit('toast', { key: isArm() ? `${K}.robot_arm.tip.demo` : `${K}.${machine}.tip.play`, tone: 'info' });
    }
    changed();
  };

  const updatePhase = () => {
    if (!action || !spec.strokes) return;
    const clipT = action.time % action.getClip().duration;
    const n = Math.min(PHASES, Math.floor((clipT / action.getClip().duration) * PHASES) + 1);
    if (n !== phase) {
      phase = n;
      if (playing) narrateStroke(n);
    }
  };

  // A velocidad normal cada tiempo dura ~2 s: su explicación no alcanza a leerse y los avisos se
  // apilan. Solo se narra cuando el tiempo dura lo suficiente; si no, se sugiere una vez la cámara lenta.
  const narrateStroke = (n: number) => {
    if (!action) return;
    const strokeS = action.getClip().duration / PHASES / Math.max(speed, 0.01);
    if (strokeS >= STROKE_TIP_MIN_S) {
      ctx.events.emit('toast', { key: `${K}.${model.id}.tip.stroke${n}`, tone: 'info' });
    } else if (!slowmoHinted) {
      slowmoHinted = true;
      ctx.events.emit('toast', { key: `${K}.${model.id}.tip.slowmo`, tone: 'info' });
    }
  };

  // ───────── cauce de la energía ─────────
  const updateFlow = () => {
    if (!flowLine) return;
    flowLine.visible = flow;
    if (!flow) return;
    const pos = flowLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    let i = 0;
    for (const id of spec.flow) {
      const s = model.parts.has(id) ? byNode.get(model.parts.get(id)!.node) : undefined;
      if (!s) continue;
      _box.setFromObject(s.part.node);
      _box.getCenter(_v);
      model.scene.worldToLocal(_v);
      pos.setXYZ(i++, _v.x, _v.y, _v.z);
    }
    flowLine.geometry.setDrawRange(0, i);
    pos.needsUpdate = true;
    flowLine.computeLineDistances();
  };

  // ───────── brazo robótico ─────────
  const spot = (yaw: number, out: THREE.Vector3) => out.set(DEMO.reach * Math.sin(yaw * RAD), DEMO.sphereR, DEMO.reach * Math.cos(yaw * RAD));

  const startDemoRun = () => {
    const a = demoFromA ? DEMO.yaw : -DEMO.yaw;
    demoRun = demoKeys(a, -a);
    demoT = 0;
    held = false;
    spot(a, sphere.position);
  };

  /** El visitante tomó el control de un eje: la demostración se detiene y la esfera queda sobre la mesa. */
  const stopDemo = () => {
    if (!demoRun && !playing) return;
    demoRun = null;
    if (held) {
      held = false;
      sphere.position.y = DEMO.sphereR;
    }
    if (playing) setPlaying(false);
  };

  const demoEvent = (e: 'grab' | 'release') => {
    if (e === 'grab') {
      _ma.copy(links[6]!).invert();
      sphereHold.copy(sphere.position).applyMatrix4(_ma);
      held = true;
      ctx.events.emit('sound', { id: 'snap' });
    } else {
      held = false;
      sphere.position.y = DEMO.sphereR;
    }
  };

  const updateArm = (dt: number) => {
    const atRest = global > 0.001 || mode === 'assemble';
    if (atRest && held) {
      // Se abre la máquina con la esfera en la pinza: queda donde está y la próxima corrida empieza de cero.
      held = false;
      sphere.position.y = DEMO.sphereR;
      demoRun = null;
    }
    const driven = playing && !!demoRun && !atRest;
    if (driven && demoRun) {
      const prev = demoT;
      demoT += dt * speed;
      gripTarget = samplePose(demoRun, demoT, pose);
      for (let i = 0; i < 6; i++) joints[i]!.target = pose[i]!;
      for (const k of demoRun) if (k.event && k.t > prev && k.t <= demoT) demoEvent(k.event);
      if (demoT >= demoRun[demoRun.length - 1]!.t) {
        demoFromA = !demoFromA;
        startDemoRun();
      }
    }
    const k = 1 - Math.exp(-dt * JOINT_DAMP);
    for (const j of joints) {
      const goal = atRest ? 0 : j.target;
      j.angle = driven ? goal : j.angle + (goal - j.angle) * k;
    }
    grip = driven ? gripTarget : grip + (gripTarget - grip) * k;
    // Cadena: cada eslabón = el anterior × giro de su eje alrededor de su pivote.
    links[0]!.identity();
    for (let i = 0; i < joints.length; i++) {
      const j = joints[i]!;
      links[i + 1]!
        .copy(links[i]!)
        .multiply(_mb.makeTranslation(j.pivot.x, j.pivot.y, j.pivot.z))
        .multiply(_m.makeRotationAxis(j.axis, j.angle * RAD))
        .multiply(_mb.makeTranslation(-j.pivot.x, -j.pivot.y, -j.pivot.z));
    }
    if (held) sphere.position.copy(sphereHold).applyMatrix4(links[6]!);
    sphere.visible = global < 0.02 && mode === 'explore';
  };

  // ───────── reto de armado ─────────
  const startAssemble = () => {
    mode = 'assemble';
    select(null);
    setPlaying(false);
    explode = 1;
    for (const j of joints) j.angle = j.target = 0;
    // Las piezas se barajan entre las posiciones de la explosión (banco de taller).
    const free = states.filter((s) => s.input.explode.dist > 0);
    const slots = free.map((s) => _v.copy(s.part.restPosition).add(s.localOffset).clone());
    let seed = 7;
    for (let i = slots.length - 1; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [slots[i], slots[j]] = [slots[j]!, slots[i]!];
    }
    for (const s of states) {
      s.mounted = s.input.explode.dist === 0;
      s.amount = 1;
    }
    free.forEach((s, i) => {
      // Se baraja el lugar en la mesa (X–Z); la altura es la de la propia pieza apoyada en el tope.
      s.shuffled.set(slots[i]!.x, s.part.restPosition.y + s.localOffset.y, slots[i]!.z);
      s.part.node.position.copy(s.shuffled);
      s.part.node.quaternion.copy(s.part.restQuaternion);
    });
    rebuildShadows();
    ctx.events.emit('toast', { key: `${K}.assemble.tip.hint1`, tone: 'info' });
    changed();
  };

  const stopAssemble = () => {
    mode = 'explore';
    for (const s of states) s.mounted = true;
    shadows.clear();
    setExplode(0, time);
    changed();
  };

  const rebuildShadows = () => {
    // Las sombras comparten geometría con las piezas reales: se quitan, nunca se liberan.
    shadows.clear();
    if (mode !== 'assemble' || help === 'none') return;
    const next = new Set(mountable(partsInput(), new Set(states.filter((s) => s.mounted).map((s) => s.part.id))));
    for (const s of states) {
      if (s.mounted) continue;
      if (help === 'next' && !next.has(s.part.id)) continue;
      // Sombra = silueta translúcida verde en la pose armada.
      s.part.node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const sh = new THREE.Mesh(mesh.geometry, shadowMat);
        mesh.updateWorldMatrix(true, false);
        // Pose armada: matriz del nodo en reposo × relativa de la malla.
        _m.copy(s.part.node.matrixWorld).invert().multiply(mesh.matrixWorld);
        sh.matrixAutoUpdate = false;
        sh.matrix.compose(s.part.restPosition, s.part.restQuaternion, s.part.node.scale).multiply(_m);
        const holder = new THREE.Group();
        holder.matrixAutoUpdate = false;
        holder.matrix.copy(s.part.node.parent!.matrixWorld);
        model.scene.updateMatrixWorld();
        holder.matrix.premultiply(_m.copy(model.scene.matrixWorld).invert());
        holder.add(sh);
        shadows.add(holder);
      });
      if (help === 'next') ctx.fx.outline(s.part.node);
    }
  };
  const shadowMat = new THREE.MeshBasicMaterial({ color: '#41B270', transparent: true, opacity: 0.18, depthWrite: false });
  disposables.push(shadowMat);

  const tryMount = (s: PartState) => {
    _v.copy(s.part.node.position);
    const target = s.part.restPosition;
    const near = snaps({ x: _v.x * scaleWorld(), y: 0, z: _v.z * scaleWorld() }, { x: target.x * scaleWorld(), y: 0, z: target.z * scaleWorld() });
    if (!near) return;
    const mountedIds = new Set(states.filter((x) => x.mounted).map((x) => x.part.id));
    if (!canMount(partsInput(), s.part.id, mountedIds)) {
      ctx.events.emit('toast', { key: `${K}.assemble.tip.hint1`, tone: 'warn' });
      ctx.events.emit('sound', { id: 'fail' });
      return;
    }
    s.mounted = true;
    s.amount = 0;
    s.part.node.position.copy(s.part.restPosition);
    ctx.events.emit('sound', { id: 'snap' });
    const left = states.filter((x) => !x.mounted).length;
    if (left === 0) return finishAssemble();
    ctx.events.emit('toast', { key: `${K}.assemble.tip.progress`, vars: { n: left }, tone: 'success' });
    rebuildShadows();
  };

  const finishAssemble = () => {
    mode = 'explore';
    explode = 0;
    shadows.clear();
    ctx.fx.outline(null);
    setPlaying(true);
    ctx.events.emit('sound', { id: 'success' });
    ctx.events.emit('challenge:done', { experience: 'taller', challenge: 'assemble', success: true });
    ctx.events.emit('modal:open', { id: 'assemble-done', titleKey: `${K}.${machine}.title.goal`, bodyKey: `${K}.${machine}.modal.assembled` });
    changed();
  };

  /** Escala de modelo → mesa (para medir el imán en metros reales). */
  const scaleWorld = () => placed.scale.x * scaler.scale.x;

  // ───────── montar y desmontar una máquina ─────────
  const setupModel = (m: LoadedModel) => {
    model = m;
    machine = (MACHINES as readonly string[]).includes(m.id) ? (m.id as MachineId) : 'motor4t';
    spec = SPEC[machine];
    // Medidas en espacio del modelo: se toman con la escena suelta, antes de colgarla del escalador.
    model.scene.removeFromParent();
    model.scene.updateMatrixWorld(true);
    modelBox = new THREE.Box3().setFromObject(model.scene);
    const inv = new THREE.Matrix4().copy(model.scene.matrixWorld).invert();

    for (const part of model.parts.values()) {
      const e = part.extras.explode;
      const dir = new THREE.Vector3(...e.dir);
      if (dir.lengthSq() > 0) dir.normalize();
      const modelOffset = dir.clone().multiplyScalar(e.dist);
      // Offset del espacio del modelo al espacio local del padre de la pieza.
      const parentInv = new THREE.Matrix4().copy(part.node.parent!.matrixWorld).invert().multiply(model.scene.matrixWorld);
      const localOffset = modelOffset.clone().transformDirection(parentInv).multiplyScalar(modelOffset.length());
      if (modelOffset.lengthSq() === 0) localOffset.set(0, 0, 0);
      _box.setFromObject(part.node).applyMatrix4(inv);
      const restCenter = _box.getCenter(new THREE.Vector3());
      const size = _box.getSize(new THREE.Vector3());
      const ax = part.extras as ArmExtras;
      const st: PartState = {
        part,
        input: {
          partId: part.id,
          rest: { x: restCenter.x, y: restCenter.y, z: restCenter.z },
          radius: Math.max(size.x, size.z) / 2,
          explode: { dir: [dir.x, dir.y, dir.z], dist: e.dist, order: e.order },
          requires: part.extras.requires ?? [],
        },
        restCenter,
        localOffset,
        modelOffset,
        amount: 0,
        from: 0,
        to: 0,
        startAt: 0,
        mounted: true,
        shuffled: new THREE.Vector3(),
        link: Number(ax.link ?? 0),
        finger: Number(ax.finger ?? 0),
      };
      states.push(st);
      byNode.set(part.node, st);
    }

    // Trazos guía: un segmento por pieza (posición armada → actual).
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(states.length * 6), 3));
    const gMat = new THREE.LineBasicMaterial({ color: ctx.table.ledColor, transparent: true, opacity: 0.55, depthWrite: false });
    guides = new THREE.LineSegments(gGeo, gMat);
    guides.frustumCulled = false;
    guides.visible = false;
    model.scene.add(guides);

    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(spec.flow.length * 3), 3));
    const fMat = new THREE.LineDashedMaterial({ color: '#6FD498', dashSize: 0.02, gapSize: 0.012, transparent: true, depthTest: false });
    flowLine = new THREE.Line(fGeo, fMat);
    flowLine.renderOrder = 5;
    flowLine.frustumCulled = false;
    flowLine.visible = false;
    model.scene.add(flowLine, shadows);
    modelDisposables.push(gGeo, gMat, fGeo, fMat);

    const clip = spec.clip ? (model.animations.find((a) => a.name === spec.clip) ?? model.animations[0]) : undefined;
    if (clip) {
      mixer = new THREE.AnimationMixer(model.scene);
      action = mixer.clipAction(clip);
      action.play();
      action.paused = true;
    }
    machineFx = createMachineFx(model);

    if (isArm()) {
      for (let i = 1; i <= 6; i++) {
        const a = model.anchors.get(`joint${i}`);
        const x = (a?.userData ?? {}) as { axis?: [number, number, number]; min?: number; max?: number };
        joints.push({
          pivot: a ? a.position.clone() : new THREE.Vector3(),
          axis: new THREE.Vector3(...(x.axis ?? [0, 1, 0])).normalize(),
          min: x.min ?? -180,
          max: x.max ?? 180,
          angle: 0,
          target: 0,
        });
      }
      for (const l of links) l.identity();
      grip = gripTarget = 1;
      demoRun = null;
      demoFromA = true;
      held = false;
      spot(DEMO.yaw, sphere.position);
      model.scene.add(sphere);
    }
    scaler.add(model.scene);
    ready = true;
  };

  const teardownModel = () => {
    if (!ready) return;
    select(null);
    ready = false;
    ctx.fx.ghost(
      states.map((s) => s.part.node),
      false,
    );
    mixer?.stopAllAction();
    if (mixer) mixer.uncacheRoot(model.scene);
    mixer = null;
    action = null;
    shadows.removeFromParent();
    shadows.clear();
    sphere.removeFromParent();
    for (const [mesh, mat] of origMats) mesh.material = mat;
    origMats.clear();
    for (const mat of xrayMats.values()) mat.dispose();
    xrayMats.clear();
    machineFx?.dispose();
    machineFx = null;
    for (const d of modelDisposables) d.dispose();
    modelDisposables.length = 0;
    guides = null;
    flowLine = null;
    joints.length = 0;
    model.dispose();
    states.length = 0;
    byNode.clear();
  };

  /** Valores iniciales de los controles (al cambiar de máquina y en reset). */
  const resetControls = () => {
    explode = 0;
    global = 0;
    playing = false;
    speed = 1;
    xray = false;
    cut = 0;
    flow = false;
    mode = 'explore';
    help = 'none';
    phase = 0;
    slowmoHinted = false;
    playTipShown = false;
  };

  const switchMachine = async (id: MachineId) => {
    if (switching || !ready || id === machine) return;
    switching = true;
    if (mode === 'assemble') stopAssemble();
    select(null);
    stopDemo();
    setPlaying(false);
    // El actual se vuelve a armar y se disuelve en líneas de luz; el nuevo se condensa desde el borde LED.
    if (global > 0.01) {
      const maxOrder = Math.max(...states.map((s) => s.input.explode.order));
      setExplode(0, time);
      await wait((cascadeDelay(maxOrder) + EXPLODE_S) * 1000);
    }
    if (disposed) return;
    await ctx.fx.disappear(model.scene, { durationMs: 500 });
    if (disposed) return;
    const prev = machine;
    teardownModel();
    resetControls();
    changed(); // mientras carga, el panel solo muestra el selector (deshabilitado)
    let next: LoadedModel;
    try {
      next = await ctx.assets.loadModel(id);
    } catch (e) {
      console.error('[taller] no se pudo cargar', id, e);
      next = await ctx.assets.loadModel(prev);
    }
    if (disposed) return next.dispose();
    setupModel(next);
    switching = false;
    changed();
    void ctx.fx.appear(model.scene, { from: 'edge', durationMs: 900 });
  };

  // ───────── Experience ─────────
  return {
    id: 'taller',
    placement: { mode: 'point', footprintRadius: 0.17, scaleRange: [0.6, 1.6] },

    async load(c, onProgress) {
      ctx = c;
      placed.name = 'taller-placed';
      scaler.name = 'taller-scaler';
      placed.add(scaler);
      ctx.root.add(placed);
      const m = await ctx.assets.loadModel('motor4t');
      onProgress?.(0.7);
      setupModel(m);
      placed.visible = true;
      onProgress?.(1);
    },

    onPlaced(at) {
      placed.position.set(at.x, 0, at.z);
      ctx.events.on('label:action', onLabelAction);
      ctx.events.on('modal:action', onModalAction);
    },

    update(dt) {
      time += dt;
      if (!ready) return;
      if (mixer && playing) mixer.update(dt * speed);
      updatePhase();

      // Cascada de explosión.
      let total = 0;
      let moving = false;
      for (const s of states) {
        const k = THREE.MathUtils.clamp((time - s.startAt) / EXPLODE_S, 0, 1);
        const next = s.from + (s.to - s.from) * easeInOut(k);
        if (next !== s.amount) moving = true;
        s.amount = next;
        total += s.amount;
      }
      global = states.length ? total / states.length : 0;
      if (isArm()) updateArm(dt);
      for (const s of states) applyPart(s);
      // Autoescala hacia el área útil a medida que explota (y con el pellizco del visitante).
      updateAutoScale();
      const target = mode === 'assemble' ? autoS : THREE.MathUtils.lerp(1, autoS, global);
      scaler.scale.setScalar(target);

      // Trazos guía.
      if (guides) {
        guides.visible = global > 0.02 && mode === 'explore';
        if (guides.visible && (moving || dragging)) {
          const pos = guides.geometry.getAttribute('position') as THREE.BufferAttribute;
          states.forEach((s, i) => {
            _v.copy(s.restCenter).addScaledVector(s.modelOffset, s.amount);
            pos.setXYZ(i * 2, s.restCenter.x, s.restCenter.y, s.restCenter.z);
            pos.setXYZ(i * 2 + 1, _v.x, _v.y, _v.z);
          });
          pos.needsUpdate = true;
        }
      }
      if (flow && flowLine) {
        updateFlow();
        (flowLine.material as THREE.LineDashedMaterial & { dashOffset?: number }).dashOffset = -time * 0.06;
      }
      if (machineFx) {
        machineFx.update(dt, {
          playing,
          speed,
          clipTime: action ? action.time : 0,
          clipDuration: action ? action.getClip().duration : 0,
          explode: global,
        });
      }
      updateClipPlane();
    },

    onGesture(g: GestureEvent) {
      if (!ready) return g.type === 'tap' || g.type === 'longpress';
      if (mode === 'assemble') return assembleGesture(g);
      if (g.type === 'tap') {
        const s = pick(g.ray);
        select(s === selected ? null : s);
        if (s) ctx.events.emit('sound', { id: 'tap' });
        return !!s;
      }
      if (g.type === 'longpress') {
        const s = pick(g.ray);
        if (s) select(s);
        return !!s;
      }
      return false; // mover/girar/escalar por defecto del núcleo
    },

    getManipulationTarget: () => (mode === 'assemble' ? null : placed),

    getControls(): ControlSpec[] {
      const list: ControlSpec[] = [
        {
          kind: 'select',
          id: 'model',
          labelKey: `${C}.model`,
          group: 'model',
          value: machine,
          disabled: switching,
          options: MACHINES.map((id) => ({ id, labelKey: MACHINE_KEYS[id] })),
          onChange: (id) => void switchMachine(id as MachineId),
        },
      ];
      if (!ready) return list;
      if (mode === 'assemble') {
        list.push(
          {
            kind: 'select',
            id: 'help',
            labelKey: `${C}.help_level`,
            group: 'challenge',
            value: help,
            options: (['none', 'next', 'all'] as const).map((h) => ({ id: h, labelKey: `${C}.help_${h}` })),
            onChange: (h) => {
              help = h as HelpLevel;
              ctx.fx.outline(null);
              rebuildShadows();
              const hint = help === 'next' ? 2 : help === 'all' ? 3 : 1;
              ctx.events.emit('toast', { key: `${K}.assemble.tip.hint${hint}`, tone: 'info' });
              changed();
            },
          },
          {
            kind: 'readout',
            id: 'left',
            labelKey: `${K}.${machine}.title.goal`,
            group: 'challenge',
            value: () => ctx.t(`${K}.assemble.tip.progress`, { n: states.filter((s) => !s.mounted).length }),
          },
          { kind: 'button', id: 'assemble', labelKey: `${C}.assemble`, icon: 'close', group: 'challenge', onPress: () => stopAssemble() },
        );
        return list;
      }
      const arm = isArm();
      list.push(
        {
          kind: 'slider',
          id: 'explode',
          labelKey: `${C}.explode`,
          group: 'main',
          min: 0,
          max: 1,
          step: 0.01,
          value: explode,
          format: 'percent',
          onInput: (v) => {
            if (arm && playing) setPlaying(false);
            setExplode(v, time);
          },
        },
        {
          kind: 'button',
          id: 'play',
          labelKey: playing ? `${C}.pause` : arm ? `${C}.demo` : `${C}.play`,
          icon: playing ? 'pause' : 'play',
          group: 'main',
          onPress: () => setPlaying(!playing),
        },
        {
          kind: 'slider',
          id: 'speed',
          labelKey: `${C}.speed`,
          group: 'main',
          min: 0.1,
          max: 2,
          step: 0.05,
          value: speed,
          format: 'speed',
          onInput: (v) => {
            speed = v;
          },
        },
        {
          kind: 'button',
          id: 'slowmo',
          labelKey: `${C}.slowmo`,
          icon: 'slow',
          group: 'main',
          onPress: () => {
            speed = speed > 0.3 ? 0.2 : 1;
            if (!playing) setPlaying(true);
            else changed();
          },
        },
      );
      if (machine === 'motor4t') {
        list.push({
          kind: 'readout',
          id: 'phase',
          labelKey: `${K}.motor4t.title.model`,
          group: 'main',
          value: () => (phase ? ctx.t(`${K}.motor4t.title.stroke${phase}`) : ''),
        });
      } else if (machine === 'motor_electric') {
        list.push({
          kind: 'readout',
          id: 'phase',
          labelKey: `${K}.motor_electric.title.model`,
          group: 'main',
          value: () => {
            const p = machineFx?.phase() ?? -1;
            return p >= 0 ? ctx.t(PHASE_KEYS[p]!) : '';
          },
        });
      } else if (machine === 'pelton') {
        list.push({
          kind: 'readout',
          id: 'power',
          labelKey: `${K}.pelton.label.electricity`,
          group: 'main',
          value: () => ctx.t(`${K}.pelton.label.power`, { w: playing ? Math.round(PELTON_W * speed) : 0 }),
        });
      } else if (arm) {
        joints.forEach((j, i) =>
          list.push({
            kind: 'slider',
            id: `joint${i + 1}`,
            labelKey: JOINT_KEYS[i]!,
            group: 'joints',
            min: j.min,
            max: j.max,
            step: 1,
            value: Math.round(j.target),
            format: 'number',
            onInput: (v) => {
              if (demoRun || playing) stopDemo();
              if (explode > 0) setExplode(0, time);
              j.target = v;
            },
          }),
        );
        list.push({
          kind: 'toggle',
          id: 'grip',
          labelKey: `${C}.grip`,
          group: 'joints',
          value: gripTarget > 0.75,
          onChange: (v) => {
            if (demoRun || playing) stopDemo();
            gripTarget = v ? 1 : 0;
            changed();
          },
        });
      }
      list.push(
        { kind: 'toggle', id: 'xray', labelKey: `${C}.xray`, group: 'view', value: xray, onChange: (v) => ((xray = v), applyXray(), changed()) },
        {
          kind: 'slider',
          id: 'cut',
          labelKey: `${C}.cut`,
          group: 'view',
          min: 0,
          max: 1,
          step: 0.01,
          value: cut,
          format: 'percent',
          onInput: (v) => {
            const was = cut > 0;
            cut = v;
            if (was !== cut > 0) applyCut();
          },
        },
        {
          kind: 'toggle',
          id: 'flow',
          labelKey: `${C}.flow`,
          group: 'view',
          value: flow,
          onChange: (v) => {
            flow = v;
            updateFlow();
            if (v) {
              ctx.events.emit('toast', { key: `${K}.${model.id}.tip.flow`, tone: 'info' });
              if (!playing) setPlaying(true);
            }
            changed();
          },
        },
        { kind: 'button', id: 'assemble', labelKey: `${C}.assemble`, icon: 'puzzle', group: 'challenge', onPress: () => startAssemble() },
      );
      return list;
    },

    reset() {
      if (!ready) return;
      if (mode === 'assemble') stopAssemble();
      select(null);
      stopDemo();
      resetControls();
      for (const s of states) {
        s.amount = s.from = s.to = 0;
        s.mounted = true;
      }
      if (action) {
        action.time = 0;
        action.paused = true;
        mixer?.update(0);
      }
      for (const j of joints) j.angle = j.target = 0;
      for (const l of links) l.identity();
      grip = gripTarget = 1;
      demoFromA = true;
      if (isArm()) spot(DEMO.yaw, sphere.position);
      for (const s of states) applyPart(s);
      applyXray();
      applyCut();
      updateFlow();
      changed();
    },

    dispose() {
      disposed = true;
      ctx.events.off('label:action', onLabelAction);
      ctx.events.off('modal:action', onModalAction);
      teardownModel();
      for (const d of disposables) d.dispose();
      placed.removeFromParent();
    },
  };

  function onLabelAction(a: { id: string; action: string }) {
    if (a.action === 'close') return select(null);
    if (a.action === 'see_action' && selected) {
      // Ver en acción: la pieza queda resaltada y el resto en fantasma mientras la máquina funciona.
      if (explode > 0) setExplode(0, time);
      setPlaying(true);
    }
  }

  function onModalAction(_a: { id: string; action: string }) {
    /* el modal de logro solo se cierra */
  }

  function assembleGesture(g: GestureEvent): boolean {
    if (g.type !== 'drag') return g.type === 'tap' || g.type === 'longpress';
    if (g.phase === 'start') {
      const s = g.origin ? pickFromOrigin(g) : null;
      if (!s || s.mounted) return true;
      dragging = s;
      if (g.point) {
        tableToParent(g.point, s.part.node, _v);
        dragOffset.copy(s.part.node.position).sub(_v);
        dragOffset.y = 0;
      }
      ctx.fx.outline(s.part.node);
      return true;
    }
    if (!dragging) return true;
    if (g.phase === 'move' && g.point) {
      tableToParent(g.point, dragging.part.node, _v);
      dragging.part.node.position.set(_v.x + dragOffset.x, dragging.part.node.position.y, _v.z + dragOffset.z);
    } else if (g.phase === 'end' || g.phase === 'cancel') {
      const s = dragging;
      dragging = null;
      if (help !== 'next') ctx.fx.outline(null);
      if (g.phase === 'end') tryMount(s);
      if (mode === 'assemble' && !s.mounted) {
        const left = Math.hypot(s.part.node.position.x - s.part.restPosition.x, s.part.node.position.z - s.part.restPosition.z) * scaleWorld();
        if (left < 0.08) ctx.events.emit('toast', { key: `${K}.assemble.tip.almost`, tone: 'info' });
      }
    }
    return true;
  }

  function pickFromOrigin(g: GestureEvent & { type: 'drag' }): PartState | null {
    // El arrastre empieza donde se tocó: se lanza el rayo de origen (aprox. con el rayo actual).
    return pick(g.ray);
  }
}
