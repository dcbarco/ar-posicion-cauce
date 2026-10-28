// Superposiciones genéricas: modal de contenido, avisos breves (toast), menú contextual y ficha
// flotante anclada a un objeto 3D. Todas escuchan eventos de `AppEvents` y emiten las respuestas.
import type * as THREE from 'three';
import type { AppEvents } from '../core/contracts';
import { button, enter, h, leave, type UiCtx } from './dom';
import { icon } from './icons';

// ───────────── diálogo base ─────────────
export interface DialogParts {
  scrim: HTMLElement;
  card: HTMLElement;
  close(): void;
}

/** Capa con fondo atenuado + tarjeta central. El fondo captura el toque (no pasa a la escena). */
export function dialog(layer: HTMLElement, cls = '', onScrim?: () => void): DialogParts {
  const card = h('div', `cx-dialog ${cls}`);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const scrim = h('div', 'cx-scrim cx-hit', [card]);
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) onScrim?.();
  });
  layer.append(enter(scrim, 'fade'));
  enter(card, 'pop');
  return {
    scrim,
    card,
    close() {
      leave(scrim, 'fade');
    },
  };
}

// ───────────── modal de contenido ('modal:open') ─────────────
export function createModalHost(ctx: UiCtx, layer: HTMLElement) {
  let current: { id: string; d: DialogParts } | null = null;
  const close = () => {
    current?.d.close();
    current = null;
  };
  const open = (m: AppEvents['modal:open']) => {
    close();
    const d = dialog(layer, 'cx-dialog--content');
    const reply = (action: string) => {
      ctx.events.emit('modal:action', { id: m.id, action });
      if (current?.d === d) close();
      else d.close();
    };
    const title = h('h2', 'cx-dialog__title', [ctx.t(m.titleKey, m.vars)]);
    const body = h('p', 'cx-dialog__body', [ctx.t(m.bodyKey, m.vars)]);
    const actions = h('div', 'cx-dialog__actions');
    const list = m.actions && m.actions.length ? m.actions : null;
    if (list) {
      list.forEach((a, i) =>
        actions.append(button(ctx, { label: ctx.t(a.labelKey), variant: i === list.length - 1 ? 'primary' : 'ghost' }, () => reply(a.id))),
      );
    } else {
      actions.append(button(ctx, { label: ctx.t('ui.label.close'), variant: 'primary' }, () => reply('close')));
    }
    const x = button(ctx, { aria: ctx.t('ui.label.close'), icon: 'close', variant: 'icon', cls: 'cx-dialog__x' }, () => reply('close'));
    d.card.append(x, title, body, actions);
    current = { id: m.id, d };
  };
  const off = ctx.events.on('modal:open', open);
  return {
    open,
    close,
    dispose() {
      off();
      close();
    },
  };
}

// ───────────── toasts ─────────────
const TOAST_MS = 3200; // mínimo
const TOAST_BASE_MS = 1500;
const TOAST_MS_PER_CHAR = 55; // ≈ 90 caracteres → 6,5 s
const TOAST_MAX = 3;

export function createToastHost(ctx: UiCtx, layer: HTMLElement) {
  const stack = h('div', 'cx-toasts');
  stack.setAttribute('aria-live', 'polite');
  layer.append(stack);
  const show = (p: AppEvents['toast']) => {
    const tone = p.tone ?? 'info';
    const ico = tone === 'success' ? 'check' : tone === 'warn' ? 'warn' : 'info';
    const el = h('div', `cx-toast cx-toast--${tone}`, [h('span', 'cx-toast__ico', [icon(ico)]), h('span', 'cx-toast__text', [ctx.t(p.key, p.vars)])]);
    stack.append(enter(el, 'down'));
    while (stack.children.length > TOAST_MAX) stack.firstElementChild?.remove();
    // Los textos largos (hasta 90 caracteres) necesitan más tiempo en pantalla para leerse.
    const ms = Math.max(TOAST_MS, TOAST_BASE_MS + (el.textContent?.length ?? 0) * TOAST_MS_PER_CHAR);
    setTimeout(() => leave(el, 'up'), ms);
  };
  const off = ctx.events.on('toast', show);
  return {
    show,
    dispose() {
      off();
      stack.remove();
    },
  };
}

// ───────────── menú contextual ─────────────
export function createContextMenuHost(ctx: UiCtx, layer: HTMLElement) {
  let open: HTMLElement | null = null;
  let size = { w: 0, h: 0 };
  const close = () => {
    leave(open, 'fade');
    open = null;
  };
  const show = (m: AppEvents['contextmenu:open']) => {
    close();
    const menu = h('div', 'cx-menu');
    menu.setAttribute('role', 'menu');
    for (const it of m.items) {
      const b = button(ctx, { label: ctx.t(it.labelKey), icon: it.icon, cls: 'cx-menu__item' }, () => {
        ctx.events.emit('contextmenu:pick', { id: it.id });
        close();
      });
      b.setAttribute('role', 'menuitem');
      menu.append(b);
    }
    // Atrapa el toque fuera del menú para cerrarlo (sin pasarlo a la escena).
    const catcher = h('div', 'cx-menu-catcher cx-hit', [menu]);
    catcher.addEventListener('pointerdown', (e) => {
      if (e.target === catcher) close();
    });
    layer.append(enter(catcher, 'fade'));
    enter(menu, 'pop');
    size = { w: layer.clientWidth, h: layer.clientHeight };
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const pad = 16;
    const x = Math.min(size.w - mw - pad, Math.max(pad, m.screen.x * size.w - mw / 2));
    const y = Math.min(size.h - mh - pad, Math.max(pad, m.screen.y * size.h + 20));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    open = catcher;
  };
  const off = ctx.events.on('contextmenu:open', show);
  return {
    show,
    close,
    dispose() {
      off();
      close();
    },
  };
}

// ───────────── ficha flotante anclada ─────────────
// La ficha flota a un costado de la pieza (no encima) y una línea guía une el punto del ancla con
// el borde más cercano de la ficha: así la pieza tocada queda siempre a la vista.
const LABEL_GAP = 56; // px entre el ancla y el borde de la ficha
const LABEL_PAD = 16; // px a los bordes de la pantalla
const LABEL_TOP = 88; // px reservados arriba (botón de salir e indicación)
const LABEL_FLIP = 0.1; // histéresis (fracción del ancho) para no saltar de lado cerca del centro

export function createFloatingLabelHost(ctx: UiCtx, layer: HTMLElement) {
  let card: HTMLElement | null = null;
  let box: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  let tail: HTMLElement | null = null;
  let anchor: THREE.Object3D | null = null;
  let id = '';
  const out = { x: 0, y: 0, visible: false };
  let lx = -1e6;
  let ly = -1e6;
  let lv: boolean | null = null;
  let cw = 0;
  let ch = 0;
  let W = 0;
  let H = 0;
  let right = true; // la ficha va a la derecha del ancla
  const onResize = () => {
    W = layer.clientWidth;
    H = layer.clientHeight;
    lx = -1e6;
  };
  window.addEventListener('resize', onResize);

  const hide = () => {
    if (card) leave(card, 'fade');
    card = box = line = tail = null;
    anchor = null;
  };
  const show = (p: AppEvents['label:show']) => {
    hide();
    if (!p) return;
    id = p.id;
    anchor = p.anchor;
    const inner = h('div', 'cx-label__card', [h('h3', 'cx-label__title', [ctx.t(p.titleKey)]), p.bodyKey ? h('p', 'cx-label__body', [ctx.t(p.bodyKey)]) : null]);
    const x = button(ctx, { aria: ctx.t('ui.label.close'), icon: 'close', variant: 'icon', cls: 'cx-label__x' }, () => {
      ctx.events.emit('label:action', { id, action: 'close' });
      hide();
    });
    inner.prepend(x);
    if (p.actions?.length) {
      inner.append(
        h(
          'div',
          'cx-label__actions',
          p.actions.map((a) => button(ctx, { label: ctx.t(a.labelKey), variant: 'primary' }, () => ctx.events.emit('label:action', { id, action: a.id }))),
        ),
      );
    }
    // La caja lleva la posición (transform por frame); la tarjeta interior, la animación de entrada.
    box = h('div', 'cx-label__box', [enter(inner, 'pop')]);
    line = h('span', 'cx-label__line');
    tail = h('span', 'cx-label__tail');
    const wrap = h('div', 'cx-label', [line, tail, box]);
    layer.append(wrap);
    card = wrap;
    cw = inner.offsetWidth;
    ch = inner.offsetHeight;
    W = layer.clientWidth;
    H = layer.clientHeight;
    lx = ly = -1e6;
    lv = null;
    tick();
  };
  const tick = () => {
    if (!card || !box || !line || !tail || !anchor) return;
    ctx.api.project(anchor, out);
    if (out.visible !== lv) {
      lv = out.visible;
      card.classList.toggle('is-hidden', !out.visible);
    }
    if (!out.visible) return;
    if (Math.abs(out.x - lx) < 0.5 && Math.abs(out.y - ly) < 0.5) return;
    lx = out.x;
    ly = out.y;
    // Lado: el que tenga más pantalla libre, con histéresis cerca del centro.
    if (right && out.x > W * (0.5 + LABEL_FLIP)) right = false;
    else if (!right && out.x < W * (0.5 - LABEL_FLIP)) right = true;
    const x = Math.min(W - cw - LABEL_PAD, Math.max(LABEL_PAD, right ? out.x + LABEL_GAP : out.x - LABEL_GAP - cw));
    const y = Math.min(H - ch - LABEL_PAD, Math.max(LABEL_TOP, out.y - ch / 2));
    box.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    tail.style.transform = `translate3d(${out.x}px, ${out.y}px, 0)`;
    // Línea guía: del ancla al punto más cercano del borde de la ficha.
    const dx = Math.min(x + cw, Math.max(x, out.x)) - out.x;
    const dy = Math.min(y + ch, Math.max(y, out.y)) - out.y;
    line.style.width = `${Math.hypot(dx, dy)}px`;
    line.style.transform = `translate3d(${out.x}px, ${out.y}px, 0) rotate(${Math.atan2(dy, dx)}rad)`;
  };
  const off = ctx.events.on('label:show', show);
  return {
    show,
    tick,
    dispose() {
      off();
      window.removeEventListener('resize', onResize);
      hide();
    },
  };
}
