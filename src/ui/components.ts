// Componentes de control: uno por `ControlSpec['kind']`. Cada uno devuelve un nodo y un `update(spec)`
// para reconciliar en sitio cuando la experiencia vuelve a declarar sus controles (no se pierde un
// arrastre en curso ni se fuerza un re-layout completo).
import type { ControlSpec } from '../core/contracts';
import { button, formatReadout, formatValue, h, type UiCtx } from './dom';
import { icon } from './icons';

type SpecOf<K extends ControlSpec['kind']> = Extract<ControlSpec, { kind: K }>;

export interface ControlView<S extends ControlSpec = ControlSpec> {
  el: HTMLElement;
  spec: S;
  update(spec: S): void;
  /** Refresco periódico (~4 Hz) para `readout`. */
  refresh?(): void;
  dispose?(): void;
}

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

// ───────────── botón ─────────────
export function buttonControl(ctx: UiCtx, spec: SpecOf<'button'>): ControlView<SpecOf<'button'>> {
  const view: ControlView<SpecOf<'button'>> = {
    spec,
    el: button(ctx, { label: ctx.t(spec.labelKey), icon: spec.icon, cls: 'cx-ctl cx-ctl--button' }, () => view.spec.onPress()),
    update(s) {
      view.spec = s;
      const b = view.el as HTMLButtonElement;
      b.disabled = !!s.disabled;
      const lbl = b.querySelector('.cx-btn__label');
      const text = ctx.t(s.labelKey);
      if (lbl && lbl.textContent !== text) lbl.textContent = text;
    },
  };
  view.update(spec);
  return view;
}

// ───────────── interruptor ─────────────
export function toggleControl(ctx: UiCtx, spec: SpecOf<'toggle'>): ControlView<SpecOf<'toggle'>> {
  let value = spec.value;
  const knob = h('span', 'cx-switch__knob', [icon('check', 'cx-ico cx-switch__on'), icon('minus', 'cx-ico cx-switch__off')]);
  const track = h('span', 'cx-switch', [knob]);
  const label = h('span', 'cx-ctl__label', [ctx.t(spec.labelKey)]);
  const b = h('button', 'cx-ctl cx-ctl--toggle cx-hit', [label, track]);
  b.type = 'button';
  b.setAttribute('role', 'switch');
  const paint = () => b.setAttribute('aria-checked', String(value));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    value = !value;
    paint();
    ctx.events.emit('sound', { id: 'tap' });
    view.spec.onChange(value);
  });
  const view: ControlView<SpecOf<'toggle'>> = {
    el: b,
    spec,
    update(s) {
      view.spec = s;
      value = s.value;
      b.disabled = !!s.disabled;
      label.textContent = ctx.t(s.labelKey);
      paint();
    },
  };
  view.update(spec);
  return view;
}

// ───────────── slider ─────────────
export function sliderControl(ctx: UiCtx, spec: SpecOf<'slider'>): ControlView<SpecOf<'slider'>> {
  const id = nextId('cx-sl');
  const label = h('label', 'cx-ctl__label', [ctx.t(spec.labelKey)]);
  label.htmlFor = id;
  const out = h('output', 'cx-ctl__value');
  const input = h('input', 'cx-range cx-hit');
  input.type = 'range';
  input.id = id;
  const fill = h('span', 'cx-range__fill');
  const wrap = h('div', 'cx-range-wrap', [fill, input]);
  const el = h('div', 'cx-ctl cx-ctl--slider', [h('div', 'cx-ctl__row', [label, out]), wrap]);
  let dragging = false;
  const paint = (v: number) => {
    const s = view.spec;
    out.textContent = formatValue(v, s.format, s.min, s.max);
    const k = (v - s.min) / (s.max - s.min || 1);
    // transform (no width) para no forzar layout
    fill.style.transform = `scaleX(${Math.min(1, Math.max(0, k))})`;
  };
  input.addEventListener('pointerdown', () => (dragging = true));
  for (const ev of ['pointerup', 'pointercancel', 'change'] as const) input.addEventListener(ev, () => (dragging = false));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    paint(v);
    view.spec.onInput(v);
  });
  const view: ControlView<SpecOf<'slider'>> = {
    el,
    spec,
    update(s) {
      view.spec = s;
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step ?? (s.max - s.min) / 100);
      input.disabled = !!s.disabled;
      label.textContent = ctx.t(s.labelKey);
      if (!dragging) {
        input.value = String(s.value);
        paint(s.value);
      }
    },
  };
  view.update(spec);
  return view;
}

// ───────────── selector segmentado ─────────────
export function selectControl(ctx: UiCtx, spec: SpecOf<'select'>): ControlView<SpecOf<'select'>> {
  const label = h('span', 'cx-ctl__label', [ctx.t(spec.labelKey)]);
  const seg = h('div', 'cx-seg');
  seg.setAttribute('role', 'radiogroup');
  const el = h('div', 'cx-ctl cx-ctl--select', [label, seg]);
  let value = spec.value;
  let sig = '';
  const paint = () => {
    for (const b of seg.children) (b as HTMLElement).setAttribute('aria-checked', String((b as HTMLElement).dataset.id === value));
  };
  const build = (s: SpecOf<'select'>) => {
    const nsig = s.options.map((o) => `${o.id}|${o.labelKey}|${o.icon ?? ''}`).join(',');
    if (nsig === sig) return;
    sig = nsig;
    seg.replaceChildren(
      ...s.options.map((o) => {
        const b = button(ctx, { label: ctx.t(o.labelKey), icon: o.icon, cls: 'cx-seg__opt' }, () => {
          if (value === o.id) return;
          value = o.id;
          paint();
          view.spec.onChange(o.id);
        });
        b.dataset.id = o.id;
        b.setAttribute('role', 'radio');
        // Marca no-cromática del elegido (no solo color).
        b.prepend(icon('check', 'cx-ico cx-seg__mark'));
        return b;
      }),
    );
    seg.classList.toggle('cx-seg--wrap', s.options.length > 3);
  };
  const view: ControlView<SpecOf<'select'>> = {
    el,
    spec,
    update(s) {
      view.spec = s;
      label.textContent = ctx.t(s.labelKey);
      build(s);
      value = s.value;
      for (const b of seg.children) (b as HTMLButtonElement).disabled = !!s.disabled;
      paint();
    },
  };
  view.update(spec);
  return view;
}

// ───────────── lectura numérica ─────────────
export function readoutControl(ctx: UiCtx, spec: SpecOf<'readout'>): ControlView<SpecOf<'readout'>> {
  const label = h('span', 'cx-ctl__label', [ctx.t(spec.labelKey)]);
  const val = h('span', 'cx-readout__value');
  const el = h('div', 'cx-ctl cx-ctl--readout', [label, val]);
  el.setAttribute('role', 'status');
  let last = '';
  const view: ControlView<SpecOf<'readout'>> = {
    el,
    spec,
    update(s) {
      view.spec = s;
      label.textContent = ctx.t(s.labelKey);
      view.refresh?.();
    },
    refresh() {
      let txt: string;
      try {
        txt = formatReadout(view.spec.value());
      } catch {
        txt = '';
      }
      if (txt !== last) {
        last = txt;
        val.textContent = txt;
      }
    },
  };
  view.update(spec);
  return view;
}

// ───────────── bandeja (tray) con arrastre ─────────────
const DRAG_SLOP = 12; // px antes de considerar arrastre

export function trayControl(ctx: UiCtx, spec: SpecOf<'tray'>, dragLayer: () => HTMLElement): ControlView<SpecOf<'tray'>> {
  const label = h('span', 'cx-ctl__label', [ctx.t(spec.labelKey)]);
  const grid = h('div', 'cx-tray');
  const el = h('div', 'cx-ctl cx-ctl--tray', [label, grid]);
  let sig = '';

  const wireItem = (item: HTMLButtonElement, itemId: string) => {
    let pid = -1;
    let sx = 0;
    let sy = 0;
    let dragging = false;
    let ghost: HTMLElement | null = null;
    const emit = (phase: 'start' | 'move' | 'end' | 'cancel', x: number, y: number) =>
      ctx.events.emit('ui:tray-drag', { trayId: view.spec.id, itemId, phase, x, y });
    const moveGhost = (x: number, y: number) => {
      if (ghost) ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };
    const finish = (phase: 'end' | 'cancel', x: number, y: number) => {
      if (dragging) emit(phase, x, y);
      dragging = false;
      pid = -1;
      item.classList.remove('is-dragging');
      if (ghost) {
        const g = ghost;
        ghost = null;
        g.classList.add('cx-out');
        setTimeout(() => g.remove(), 260);
      }
    };
    item.addEventListener('pointerdown', (e) => {
      if (item.disabled || pid !== -1) return;
      pid = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      dragging = false;
      item.setPointerCapture?.(e.pointerId);
    });
    item.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < DRAG_SLOP) return;
        dragging = true;
        item.classList.add('is-dragging');
        ghost = h('div', 'cx-drag-ghost', [icon(item.dataset.icon)]);
        dragLayer().append(ghost);
        moveGhost(e.clientX, e.clientY);
        emit('start', e.clientX, e.clientY);
      }
      moveGhost(e.clientX, e.clientY);
      emit('move', e.clientX, e.clientY);
    });
    item.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pid) return;
      const wasDrag = dragging;
      finish('end', e.clientX, e.clientY);
      if (!wasDrag && !item.disabled) {
        ctx.events.emit('sound', { id: 'tap' });
        item.classList.add('is-picked');
        setTimeout(() => item.classList.remove('is-picked'), 400);
        view.spec.onPick(itemId);
      }
    });
    item.addEventListener('pointercancel', (e) => {
      if (e.pointerId === pid) finish('cancel', e.clientX, e.clientY);
    });
    item.addEventListener('lostpointercapture', (e) => {
      if (e.pointerId === pid) finish('cancel', e.clientX, e.clientY);
    });
    // Teclado: Enter/Espacio = elegir.
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        view.spec.onPick(itemId);
      }
    });
  };

  const view: ControlView<SpecOf<'tray'>> = {
    el,
    spec,
    update(s) {
      view.spec = s;
      label.textContent = ctx.t(s.labelKey);
      const nsig = s.items.map((i) => `${i.id}|${i.labelKey}|${i.icon}`).join(',');
      if (nsig !== sig) {
        sig = nsig;
        grid.replaceChildren(
          ...s.items.map((it) => {
            const b = h('button', 'cx-tray__item cx-hit', [icon(it.icon), h('span', 'cx-tray__label', [ctx.t(it.labelKey)])]);
            b.type = 'button';
            b.dataset.id = it.id;
            b.dataset.icon = it.icon;
            wireItem(b, it.id);
            return b;
          }),
        );
      }
      for (const b of grid.children) {
        const it = s.items.find((i) => i.id === (b as HTMLElement).dataset.id);
        (b as HTMLButtonElement).disabled = !!s.disabled || !!it?.disabled;
      }
    },
  };
  view.update(spec);
  return view;
}

export function createControl(ctx: UiCtx, spec: ControlSpec, dragLayer: () => HTMLElement): ControlView {
  let v: ControlView;
  switch (spec.kind) {
    case 'button':
      v = buttonControl(ctx, spec) as ControlView;
      break;
    case 'toggle':
      v = toggleControl(ctx, spec) as ControlView;
      break;
    case 'slider':
      v = sliderControl(ctx, spec) as ControlView;
      break;
    case 'select':
      v = selectControl(ctx, spec) as ControlView;
      break;
    case 'readout':
      v = readoutControl(ctx, spec) as ControlView;
      break;
    case 'tray':
      v = trayControl(ctx, spec, dragLayer) as ControlView;
      break;
  }
  v.el.dataset.controlId = spec.id;
  return v;
}
