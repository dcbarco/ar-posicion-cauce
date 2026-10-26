// Renderizador ControlSpec[] → controles del HUD. Reconcilia por `id`+`kind` (actualiza en sitio)
// y agrupa por `group` con separadores. La UI no contiene lógica de experiencia: solo llama a los
// callbacks del spec.
import type { ControlSpec } from '../core/contracts';
import { createControl, type ControlView } from './components';
import { h, type UiCtx } from './dom';

export interface ControlsPanel {
  el: HTMLElement;
  /** Vuelve a pedir/pintar la lista. */
  set(specs: ControlSpec[]): void;
  /** Llamar cada frame: refresca `readout` a ~4 Hz. */
  tick(dt: number): void;
  isEmpty(): boolean;
  dispose(): void;
}

const READOUT_PERIOD = 0.25; // s (~4 Hz)

export function createControlsPanel(ctx: UiCtx, dragLayer: () => HTMLElement): ControlsPanel {
  const el = h('div', 'cx-ctrl-panel');
  el.setAttribute('role', 'group');
  let views = new Map<string, ControlView>();
  let acc = 0;
  let readouts: ControlView[] = [];
  let lastSig = '';

  const key = (s: ControlSpec) => `${s.kind}:${s.id}`;

  return {
    el,
    set(specs) {
      const next = new Map<string, ControlView>();
      const nodes: HTMLElement[] = [];
      let lastGroup: string | undefined;
      let first = true;
      for (const s of specs) {
        const k = key(s);
        let v = views.get(k);
        if (v) {
          v.update(s);
          views.delete(k);
        } else {
          v = createControl(ctx, s, dragLayer);
          v.el.classList.add('cx-in', 'cx-in--fade');
        }
        next.set(k, v);
        const g = s.group ?? 'main';
        if (!first && g !== lastGroup) nodes.push(h('hr', 'cx-ctrl-sep'));
        first = false;
        lastGroup = g;
        nodes.push(v.el);
      }
      for (const old of views.values()) old.dispose?.();
      views = next;
      // Solo se reordena el DOM si cambió la estructura: así un slider en pleno arrastre no se desprende.
      const sig = specs.map((s) => `${key(s)}@${s.group ?? 'main'}`).join(',');
      if (sig !== lastSig) {
        lastSig = sig;
        el.replaceChildren(...nodes);
      }
      readouts = [...next.values()].filter((v) => v.refresh);
      el.hidden = specs.length === 0;
    },
    tick(dt) {
      acc += dt;
      if (acc < READOUT_PERIOD) return;
      acc = 0;
      for (let i = 0; i < readouts.length; i++) readouts[i]?.refresh?.();
    },
    isEmpty: () => views.size === 0,
    dispose() {
      for (const v of views.values()) v.dispose?.();
      views.clear();
      readouts = [];
      el.remove();
    },
  };
}
