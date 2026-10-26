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
const TOAST_MS = 3200;
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
    setTimeout(() => leave(el, 'up'), TOAST_MS);
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
export function createFloatingLabelHost(ctx: UiCtx, layer: HTMLElement) {
  let card: HTMLElement | null = null;
  let anchor: THREE.Object3D | null = null;
  let id = '';
  const out = { x: 0, y: 0, visible: false };
  let lx = -1e6;
  let ly = -1e6;
  let lv: boolean | null = null;
  let cw = 0;
  let ch = 0;
  let W = 0;
  const onResize = () => {
    W = layer.clientWidth;
    lx = -1e6;
  };
  window.addEventListener('resize', onResize);

  const hide = () => {
    if (card) leave(card, 'fade');
    card = null;
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
    const wrap = h('div', 'cx-label', [enter(inner, 'pop'), h('span', 'cx-label__tail')]);
    layer.append(wrap);
    card = wrap;
    cw = inner.offsetWidth;
    ch = inner.offsetHeight;
    W = layer.clientWidth;
    lx = ly = -1e6;
    lv = null;
    tick();
  };
  const tick = () => {
    if (!card || !anchor) return;
    ctx.api.project(anchor, out);
    if (out.visible !== lv) {
      lv = out.visible;
      card.classList.toggle('is-hidden', !out.visible);
    }
    if (!out.visible) return;
    // Mantener la tarjeta dentro de la pantalla; la cola apunta al ancla.
    const pad = 16;
    const x = Math.min(W - cw / 2 - pad, Math.max(cw / 2 + pad, out.x));
    const y = Math.max(ch + 28 + pad, out.y);
    if (Math.abs(x - lx) < 0.5 && Math.abs(y - ly) < 0.5) return;
    lx = x;
    ly = y;
    card.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const tail = card.lastElementChild as HTMLElement | null;
    if (tail) tail.style.transform = `translateX(${Math.max(-cw / 2 + 24, Math.min(cw / 2 - 24, out.x - x))}px)`;
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
