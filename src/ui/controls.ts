// Dock de controles (esquina inferior derecha): una burbuja de ícono por `group` de ControlSpec[].
// Al tocar una burbuja, la hoja hace morph de círculo a rectángulo (clip-path desde la burbuja) y
// muestra solo los controles de ese grupo. Nunca hay scroll: si un grupo no cabe en una columna,
// pasa a dos. Reconcilia por `id`+`kind` (actualiza en sitio). La UI no contiene lógica de
// experiencia: solo llama a los callbacks del spec.
import type { ControlSpec } from '../core/contracts';
import { createControl, type ControlView } from './components';
import { h, type UiCtx } from './dom';
import { icon } from './icons';

export interface ControlsPanel {
  el: HTMLElement;
  /** Vuelve a pedir/pintar la lista. */
  set(specs: ControlSpec[]): void;
  /** Llamar cada frame: refresca `readout` a ~4 Hz. */
  tick(dt: number): void;
  isEmpty(): boolean;
  /** Cierra la hoja sin animación (al volver a montar el HUD). */
  collapse(): void;
  dispose(): void;
}

const READOUT_PERIOD = 0.25; // s (~4 Hz)
const MORPH_MS = 420; // = --cx-dock-morph (ui.css)
const SWAP_MS = 260; // cierre corto al pasar de un grupo a otro

// Ícono y título de cada grupo conocido (claves literales: las verifica content-keys.test).
const GROUPS: Record<string, { icon: string; key: string }> = {
  model: { icon: 'cube', key: 'hud.label.group_model' },
  main: { icon: 'play', key: 'hud.label.group_main' },
  joints: { icon: 'arm', key: 'hud.label.group_joints' },
  view: { icon: 'eye', key: 'hud.label.group_view' },
  challenge: { icon: 'puzzle', key: 'hud.label.group_challenge' },
  tray: { icon: 'layers', key: 'hud.label.group_tray' },
  info: { icon: 'info', key: 'hud.label.group_info' },
};
const OTHER = { icon: 'sliders', key: 'hud.label.group_other' };

interface Group {
  id: string;
  bubble: HTMLButtonElement;
  body: HTMLElement;
  sig: string;
}

export function createControlsPanel(ctx: UiCtx, dragLayer: () => HTMLElement): ControlsPanel {
  const title = h('span', 'cx-dock__title');
  const host = h('div', 'cx-dock__host');
  const sheet = h('div', 'cx-dock__sheet', [h('div', 'cx-dock__content', [title, host])]);
  sheet.hidden = true;
  const bubbles = h('div', 'cx-dock__bubbles');
  const el = h('div', 'cx-dock', [sheet, bubbles]);
  el.setAttribute('role', 'group');

  let views = new Map<string, ControlView>();
  let groups = new Map<string, Group>();
  let order = '';
  let active: Group | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let acc = 0;
  let readouts: ControlView[] = [];

  const key = (s: ControlSpec) => `${s.kind}:${s.id}`;
  const meta = (g: string) => GROUPS[g] ?? OTHER;

  /** Recorte de la hoja que coincide con la burbuja (estado "cerrado" del morph). */
  const aimAt = (g: Group) => {
    // Sin transición mientras se apunta: si no, el cambio de variables anima por su cuenta.
    sheet.classList.add('is-aiming');
    const s = sheet.getBoundingClientRect();
    const b = g.bubble.getBoundingClientRect();
    const st = sheet.style;
    st.setProperty('--ct', `${b.top - s.top}px`);
    st.setProperty('--cr', `${s.right - b.right}px`);
    st.setProperty('--cb', `${s.bottom - b.bottom}px`);
    st.setProperty('--cl', `${b.left - s.left}px`);
    // Forzar estilo (sin rAF: puede no correr en sesión inmersiva) antes de devolver la transición.
    void sheet.getBoundingClientRect();
    sheet.classList.remove('is-aiming');
  };

  /** Una columna; si no cabe sin scroll, dos (la hoja se ensancha). */
  const fit = () => {
    sheet.classList.remove('is-wide');
    if (host.scrollHeight > host.clientHeight + 1) sheet.classList.add('is-wide');
  };

  const paintBubbles = () => {
    for (const g of groups.values()) {
      const on = g === active;
      g.bubble.classList.toggle('is-active', on);
      g.bubble.setAttribute('aria-expanded', String(on));
    }
  };

  const open = (g: Group) => {
    clearTimeout(timer);
    active = g;
    title.textContent = ctx.t(meta(g.id).key);
    host.replaceChildren(g.body);
    sheet.classList.remove('is-open');
    sheet.hidden = false;
    // La altura mínima cubre la columna de burbujas: el círculo de partida siempre queda dentro.
    sheet.style.minHeight = `calc(${bubbles.offsetHeight}px + 2 * var(--cx-s2))`;
    fit();
    aimAt(g);
    sheet.classList.add('is-open');
    paintBubbles();
  };

  const close = (then?: () => void) => {
    clearTimeout(timer);
    const g = active;
    active = null;
    paintBubbles();
    if (!g || sheet.hidden) {
      sheet.hidden = true;
      then?.();
      return;
    }
    if (g.bubble.isConnected) aimAt(g);
    sheet.classList.toggle('is-swap', !!then);
    sheet.classList.remove('is-open');
    timer = setTimeout(
      () => {
        sheet.classList.remove('is-swap');
        if (then) return then();
        sheet.hidden = true;
        host.replaceChildren();
      },
      then ? SWAP_MS : MORPH_MS,
    );
  };

  const toggle = (g: Group) => {
    if (active === g) return close();
    if (active) return close(() => open(g));
    open(g);
  };

  const makeGroup = (id: string): Group => {
    const m = meta(id);
    const bubble = h('button', 'cx-bubble cx-hit', [icon(m.icon, 'cx-ico cx-bubble__ico'), icon('close', 'cx-ico cx-bubble__close')]);
    bubble.type = 'button';
    bubble.setAttribute('aria-label', ctx.t(m.key));
    bubble.title = ctx.t(m.key);
    bubble.setAttribute('aria-expanded', 'false');
    const g: Group = { id, bubble, body: h('div', 'cx-dock__body'), sig: '' };
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.events.emit('sound', { id: 'tap' });
      toggle(g);
    });
    return g;
  };

  return {
    el,
    set(specs) {
      const next = new Map<string, ControlView>();
      const byGroup = new Map<string, ControlSpec[]>();
      for (const s of specs) {
        const g = s.group ?? 'main';
        let list = byGroup.get(g);
        if (!list) byGroup.set(g, (list = []));
        list.push(s);
        const k = key(s);
        let v = views.get(k);
        if (v) {
          v.update(s);
          views.delete(k);
        } else {
          v = createControl(ctx, s, dragLayer);
        }
        next.set(k, v);
      }
      for (const old of views.values()) old.dispose?.();
      views = next;

      const nextGroups = new Map<string, Group>();
      for (const [id, list] of byGroup) {
        const g = groups.get(id) ?? makeGroup(id);
        nextGroups.set(id, g);
        // Solo se reordena el DOM si cambió la estructura: así un slider en pleno arrastre no se desprende.
        const sig = list.map(key).join(',');
        if (sig !== g.sig) {
          g.sig = sig;
          g.body.replaceChildren(...list.map((s) => views.get(key(s))!.el));
          if (g === active) fit();
        }
      }
      if (active && !nextGroups.has(active.id)) close();
      groups = nextGroups;
      const nextOrder = [...groups.keys()].join(',');
      if (nextOrder !== order) {
        order = nextOrder;
        bubbles.replaceChildren(...[...groups.values()].map((g) => g.bubble));
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
    collapse() {
      clearTimeout(timer);
      active = null;
      paintBubbles();
      sheet.classList.remove('is-open', 'is-swap');
      sheet.hidden = true;
      host.replaceChildren();
    },
    dispose() {
      clearTimeout(timer);
      for (const v of views.values()) v.dispose?.();
      views.clear();
      groups.clear();
      readouts = [];
      el.remove();
    },
  };
}
