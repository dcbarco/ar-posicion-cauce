// MockExperience (F0): declara controles de todos los tipos para que la UI avance sin esperar
// a las experiencias reales. Tres "piezas" primitivas con explosión, rayos X, giro y bandeja.
import * as THREE from 'three';
import type { ControlSpec, Experience, ExperienceContext, ExperienceId, GestureEvent } from '../../../core/contracts';

const K = 'exp.mock.demo';
const SHAPES = ['cube', 'sphere', 'cone'] as const;
type Shape = (typeof SHAPES)[number];
const SPEEDS: Record<string, number> = { slow: 0.25, normal: 1, fast: 2 };

const _caster = new THREE.Raycaster();

export function createMockExperience(id: ExperienceId): Experience {
  let ctx: ExperienceContext;
  const model = new THREE.Group();
  const parts: { mesh: THREE.Mesh; rest: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  const extras: THREE.Mesh[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  let explode = 0;
  let xray = false;
  let playing = false;
  let speed = 'normal';
  let pending: Shape | null = null;
  let selected: THREE.Mesh | null = null;

  const geoFor = (s: Shape) => {
    const g =
      s === 'cube'
        ? new THREE.BoxGeometry(0.06, 0.06, 0.06)
        : s === 'sphere'
          ? new THREE.SphereGeometry(0.035, 32, 16)
          : new THREE.ConeGeometry(0.035, 0.07, 32);
    geos.push(g);
    return g;
  };
  const matFor = (color: string) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2, transparent: true });
    mats.push(m);
    return m;
  };
  const color = { cube: '#41B270', sphere: '#F2B134', cone: '#4A90C2' };

  const applyExplode = () => {
    for (const p of parts) p.mesh.position.copy(p.rest).addScaledVector(p.dir, explode * 0.12);
  };
  const applyXray = () => {
    for (const m of mats) (m as THREE.MeshStandardMaterial).opacity = xray ? 0.35 : 1;
  };
  const changed = () => ctx.events.emit('controls:changed', { experience: id });

  return {
    id,
    placement: { mode: 'point', footprintRadius: 0.12, scaleRange: [0.6, 1.6] },

    async load(c, onProgress) {
      ctx = c;
      model.name = 'mock-model';
      SHAPES.forEach((s, i) => {
        const mesh = new THREE.Mesh(geoFor(s), matFor(color[s]));
        mesh.name = `part_${s}`;
        mesh.castShadow = true;
        const a = (i / SHAPES.length) * Math.PI * 2;
        const rest = new THREE.Vector3(Math.cos(a) * 0.04, 0.04 + i * 0.01, Math.sin(a) * 0.04);
        parts.push({ mesh, rest, dir: new THREE.Vector3(Math.cos(a), 0.4, Math.sin(a)).normalize() });
        model.add(mesh);
      });
      applyExplode();
      ctx.root.add(model);
      onProgress?.(1);
    },

    onPlaced(at) {
      model.position.set(at.x, 0, at.z);
    },

    update(dt) {
      if (playing) model.children[0]!.rotation.y += dt * 2 * (SPEEDS[speed] ?? 1);
    },

    onGesture(g: GestureEvent) {
      if (g.type === 'drag' && g.fromTray) {
        if (g.phase === 'end' && g.point && ctx.bounds.contains(g.point, 0.04)) addShape(g.fromTray.itemId as Shape, g.point);
        return true;
      }
      if (g.type === 'tap') {
        if (pending && g.point && ctx.bounds.contains(g.point, 0.04)) {
          addShape(pending, g.point);
          pending = null;
          return true;
        }
        _caster.ray.copy(g.ray);
        const hit = _caster.intersectObjects([model, ...extras], true)[0]?.object as THREE.Mesh | undefined;
        selected = hit ?? null;
        ctx.fx.outline(selected);
        ctx.events.emit(
          'label:show',
          selected ? { id: selected.name, anchor: selected, titleKey: `${K}.title.selected`, bodyKey: `${K}.body.selected` } : null,
        );
        ctx.events.emit('sound', { id: 'tap' });
        return !!hit;
      }
      return false;
    },

    getManipulationTarget: () => model,

    getControls(): ControlSpec[] {
      return [
        { kind: 'slider', id: 'explode', labelKey: `${K}.label.explode`, min: 0, max: 1, step: 0.01, value: explode, format: 'percent', onInput: (v) => ((explode = v), applyExplode(), ctx.events.emit('explode:set', { value: v })) },
        { kind: 'toggle', id: 'xray', labelKey: `${K}.label.xray`, value: xray, onChange: (v) => ((xray = v), applyXray(), changed()) },
        { kind: 'button', id: 'play', labelKey: `${K}.label.play`, icon: playing ? 'pause' : 'play', onPress: () => ((playing = !playing), changed()) },
        {
          kind: 'select',
          id: 'speed',
          labelKey: `${K}.label.speed`,
          value: speed,
          options: Object.keys(SPEEDS).map((s) => ({ id: s, labelKey: `${K}.label.speed_${s}` })),
          onChange: (s) => ((speed = s), changed()),
        },
        {
          kind: 'tray',
          id: 'shapes',
          labelKey: `${K}.label.tray`,
          group: 'tray',
          items: SHAPES.map((s) => ({ id: s, labelKey: `${K}.label.${s}`, icon: s })),
          onPick: (s) => (pending = s as Shape),
        },
        { kind: 'readout', id: 'count', labelKey: `${K}.label.count`, value: () => extras.length },
      ];
    },

    reset() {
      explode = 0;
      xray = false;
      playing = false;
      speed = 'normal';
      pending = null;
      for (const e of extras) e.removeFromParent();
      extras.length = 0;
      model.children[0]!.rotation.set(0, 0, 0);
      applyExplode();
      applyXray();
      ctx.fx.outline(null);
      ctx.events.emit('label:show', null);
    },

    dispose() {
      ctx.fx.outline(null);
      ctx.events.emit('label:show', null);
      model.removeFromParent();
      for (const e of extras) e.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };

  function addShape(s: Shape, at: THREE.Vector3) {
    const mesh = new THREE.Mesh(geoFor(s), matFor(color[s]));
    mesh.name = `extra_${s}`;
    mesh.castShadow = true;
    mesh.position.set(at.x, 0.035, at.z);
    extras.push(mesh);
    ctx.root.add(mesh);
    ctx.events.emit('sound', { id: 'place' });
    void ctx.fx.appear(mesh, { from: 'above', durationMs: 400 });
  }
}
