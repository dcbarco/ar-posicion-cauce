// Taller de Máquinas (sección 6): un modelo héroe a la vez que se desarma, se inspecciona,
// funciona, se corta con rayos X y se vuelve a armar. Lógica del Agente 1; los efectos finos
// (trazos, gases, destellos) los puede reemplazar el Agente 3 en ../anim/.
import * as THREE from 'three';
import type { ControlSpec, Experience, ExperienceContext, GestureEvent, LoadedModel, LoadedPart } from '../../../core/contracts';
import { autoScale, canMount, cascadeDelay, mountable, snaps, type PartInput } from './explode';

const K = 'exp.taller';
const C = `${K}.controls.label`;
const EXPLODE_S = 0.7; // duración de cada pieza al separarse/juntarse
const PHASES = 4;

type HelpLevel = 'none' | 'next' | 'all';
type Mode = 'explore' | 'assemble';

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
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _box = new THREE.Box3();
const _caster = new THREE.Raycaster();
const _m = new THREE.Matrix4();
const _plane = new THREE.Plane();

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function createTaller(): Experience {
  let ctx: ExperienceContext;
  let model: LoadedModel;
  const placed = new THREE.Group(); // objetivo de manipulación (mover/girar/pellizco)
  const scaler = new THREE.Group(); // autoescala de la explosión (D9)
  const states: PartState[] = [];
  const byNode = new Map<THREE.Object3D, PartState>();
  let mixer: THREE.AnimationMixer | null = null;
  let action: THREE.AnimationAction | null = null;
  let time = 0;

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

  // Visuales propios
  let guides: THREE.LineSegments;
  let flowLine: THREE.Line;
  const shadows = new THREE.Group();
  const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1);
  const disposables: { dispose(): void }[] = [];
  const xrayMats = new Map<THREE.Material, THREE.Material>();
  const origMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  let modelBox = new THREE.Box3();

  // Arrastre en el reto
  let dragging: PartState | null = null;
  const dragOffset = new THREE.Vector3();

  const changed = () => ctx.events.emit('controls:changed', { experience: 'taller' });

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
      if (s.input.explode && s.part.extras.group !== 'case') continue;
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
    _caster.ray.copy(ray);
    // El rayo viene en mesa local; los objetos se prueban en mundo.
    _caster.ray.applyMatrix4(ctx.root.matrixWorld);
    const hits = _caster.intersectObject(model.scene, true);
    for (const h of hits) {
      const s = partFromObject(h.object);
      if (!s) continue;
      if (xray && s.part.extras.group === 'case' && hits.length > 1) continue; // en rayos X se toca lo de adentro
      return s;
    }
    return null;
  };

  // ───────── funcionar ─────────
  const setPlaying = (p: boolean) => {
    playing = p;
    if (action) action.paused = !p;
    if (p && explode > 0 && mode === 'explore') setExplode(0, time);
    changed();
  };

  const updatePhase = () => {
    if (!action) return;
    const clipT = action.time % action.getClip().duration;
    const n = Math.min(PHASES, Math.floor((clipT / action.getClip().duration) * PHASES) + 1);
    if (n !== phase) {
      phase = n;
      if (playing && speed <= 1.01) ctx.events.emit('toast', { key: `${K}.${model.id}.tip.stroke${n}`, tone: 'info' });
    }
  };

  // ───────── cauce de la energía ─────────
  const FLOW_PATH = ['carburetor', 'piston', 'connecting_rod', 'crankshaft', 'flywheel'];
  const updateFlow = () => {
    flowLine.visible = flow;
    if (!flow) return;
    const pos = flowLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    let i = 0;
    for (const id of FLOW_PATH) {
      const s = states.find((x) => x.part.id === id);
      if (!s) continue;
      _box.setFromObject(s.part.node);
      _box.getCenter(_v);
      model.scene.worldToLocal(_v);
      pos.setXYZ(i++, _v.x, _v.y, _v.z);
    }
    flowLine.geometry.setDrawRange(0, i);
    pos.needsUpdate = true;
    flowLine.computeLineDistances();
    (flowLine.material as THREE.LineDashedMaterial).dashSize = 0.02;
  };

  // ───────── reto de armado ─────────
  const startAssemble = () => {
    mode = 'assemble';
    select(null);
    setPlaying(false);
    explode = 1;
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
      s.shuffled.copy(slots[i]!);
      s.part.node.position.copy(s.shuffled);
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
    ctx.events.emit('modal:open', { id: 'assemble-done', titleKey: `${K}.assemble.title.goal`, bodyKey: `${K}.assemble.modal.success` });
    changed();
  };

  /** Escala de modelo → mesa (para medir el imán en metros reales). */
  const scaleWorld = () => placed.scale.x * scaler.scale.x;

  // ───────── Experience ─────────
  return {
    id: 'taller',
    placement: { mode: 'point', footprintRadius: 0.17, scaleRange: [0.6, 1.6] },

    async load(c, onProgress) {
      ctx = c;
      model = await ctx.assets.loadModel('motor4t');
      onProgress?.(0.7);
      placed.name = 'taller-placed';
      scaler.name = 'taller-scaler';
      placed.add(scaler);
      scaler.add(model.scene);
      ctx.root.add(placed);
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
      fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FLOW_PATH.length * 3), 3));
      const fMat = new THREE.LineDashedMaterial({ color: '#6FD498', dashSize: 0.02, gapSize: 0.012, transparent: true, depthTest: false });
      flowLine = new THREE.Line(fGeo, fMat);
      flowLine.renderOrder = 5;
      flowLine.frustumCulled = false;
      flowLine.visible = false;
      model.scene.add(flowLine, shadows);
      disposables.push(gGeo, gMat, fGeo, fMat, shadowMat);

      if (model.animations.length) {
        mixer = new THREE.AnimationMixer(model.scene);
        const clip = model.animations.find((a) => a.name === 'anim_cycle') ?? model.animations[0]!;
        action = mixer.clipAction(clip);
        action.play();
        action.paused = true;
      }
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
        applyPart(s);
        total += s.amount;
      }
      const global = states.length ? total / states.length : 0;
      // Autoescala hacia el área útil a medida que explota (y con el pellizco del visitante).
      updateAutoScale();
      const target = mode === 'assemble' ? autoS : THREE.MathUtils.lerp(1, autoS, global);
      scaler.scale.setScalar(target);

      // Trazos guía.
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
      if (flow) {
        updateFlow();
        (flowLine.material as THREE.LineDashedMaterial & { dashOffset?: number }).dashOffset = -time * 0.06;
      }
      updateClipPlane();
    },

    onGesture(g: GestureEvent) {
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
          value: 'motor4t',
          options: [{ id: 'motor4t', labelKey: `${C}.motor4t` }],
          onChange: () => {},
        },
      ];
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
            labelKey: `${K}.assemble.title.goal`,
            group: 'challenge',
            value: () => ctx.t(`${K}.assemble.tip.progress`, { n: states.filter((s) => !s.mounted).length }),
          },
          { kind: 'button', id: 'assemble', labelKey: `${C}.assemble`, icon: 'close', group: 'challenge', onPress: () => stopAssemble() },
        );
        return list;
      }
      list.push(
        { kind: 'slider', id: 'explode', labelKey: `${C}.explode`, group: 'main', min: 0, max: 1, step: 0.01, value: explode, format: 'percent', onInput: (v) => setExplode(v, time) },
        { kind: 'button', id: 'play', labelKey: playing ? `${C}.pause` : `${C}.play`, icon: playing ? 'pause' : 'play', group: 'main', onPress: () => setPlaying(!playing) },
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
        {
          kind: 'readout',
          id: 'phase',
          labelKey: `${K}.${model.id}.title.model`,
          group: 'main',
          value: () => (phase ? ctx.t(`${K}.${model.id}.title.stroke${phase}`) : ''),
        },
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
      if (mode === 'assemble') stopAssemble();
      select(null);
      explode = 0;
      for (const s of states) {
        s.amount = s.from = s.to = 0;
        s.mounted = true;
        applyPart(s);
      }
      playing = false;
      speed = 1;
      if (action) {
        action.time = 0;
        action.paused = true;
        mixer?.update(0);
      }
      xray = false;
      applyXray();
      cut = 0;
      applyCut();
      flow = false;
      updateFlow();
      help = 'none';
      phase = 0;
      changed();
    },

    dispose() {
      ctx.events.off('label:action', onLabelAction);
      ctx.events.off('modal:action', onModalAction);
      select(null);
      ctx.fx.ghost(
        states.map((s) => s.part.node),
        false,
      );
      mixer?.stopAllAction();
      if (mixer) mixer.uncacheRoot(model.scene);
      shadows.clear();
      for (const [mesh, m] of origMats) mesh.material = m;
      for (const m of xrayMats.values()) m.dispose();
      xrayMats.clear();
      for (const d of disposables) d.dispose();
      placed.removeFromParent();
      model.dispose();
      states.length = 0;
      byNode.clear();
    },
  };

  function onLabelAction(a: { id: string; action: string }) {
    if (a.action === 'close') return select(null);
    if (a.action === 'see_action' && selected) {
      // Ver en acción: la pieza queda resaltada y el resto en fantasma mientras el motor funciona.
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
