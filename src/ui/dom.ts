// Utilidades DOM de la UI: creación de nodos, objetivos táctiles y entradas/salidas animadas.
// Reglas: los contenedores no capturan toques (pointer-events:none en CSS); solo lo que lleva
// la clase `cx-hit` los recibe. Las animaciones son @keyframes de transform/opacity (no dependen de
// window.requestAnimationFrame, que puede no correr durante una sesión inmersiva).
import type { AppEvents, Translate, TypedEmitter, UiAction, UiApi } from '../core/contracts';
import { icon } from './icons';

export interface UiCtx {
  api: UiApi;
  t: Translate;
  events: TypedEmitter<AppEvents>;
  act(a: UiAction): void;
}

export function makeCtx(api: UiApi): UiCtx {
  return {
    api,
    t: api.t,
    events: api.events,
    act: (a) => api.events.emit('ui:action', a),
  };
}

type Child = Node | string | null | undefined | false;

/** Crea un elemento. Las cadenas hijas se insertan como texto (solo deben venir de `t()`). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  children?: Child[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (children) for (const c of children) if (c) el.append(c);
  return el;
}

export interface ButtonOpts {
  label?: string; // texto visible (ya traducido)
  aria?: string; // texto accesible si no hay label visible
  icon?: string;
  variant?: 'primary' | 'ghost' | 'warn' | 'icon' | 'plain';
  size?: 'md' | 'lg' | 'xl';
  cls?: string;
  /** Sonido de toque (evento 'sound'). Por defecto sí. */
  sound?: boolean;
}

/**
 * Botón táctil: ≥ 56 px, `pointer-events:auto`, `beforexrselect` cancelado (lo hace la raíz),
 * respuesta visual inmediata por CSS (:active) y acción en `click` (gesto real del usuario:
 * imprescindible para `enter-ar`, que inicia la sesión XR).
 */
export function button(ctx: UiCtx, opts: ButtonOpts, onPress: () => void): HTMLButtonElement {
  const variant = opts.variant ?? 'plain';
  const b = h('button', `cx-btn cx-hit cx-btn--${variant}${opts.size ? ` cx-btn--${opts.size}` : ''}${opts.cls ? ` ${opts.cls}` : ''}`);
  b.type = 'button';
  if (opts.icon) b.append(icon(opts.icon));
  if (opts.label) b.append(h('span', 'cx-btn__label', [opts.label]));
  const aria = opts.aria ?? opts.label;
  if (aria) b.setAttribute('aria-label', aria);
  if (!opts.label && aria) b.title = aria;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    if (opts.sound !== false) ctx.events.emit('sound', { id: 'tap' });
    onPress();
  });
  return b;
}

/** Botón que repite mientras se mantiene presionado (ajustes finos ±1 cm / ±1°). */
export function repeatButton(ctx: UiCtx, opts: ButtonOpts, onStep: () => void): HTMLButtonElement {
  const b = button(ctx, { ...opts, sound: false }, () => {});
  let delay: ReturnType<typeof setTimeout> | undefined;
  let rep: ReturnType<typeof setInterval> | undefined;
  let fired = false;
  const stop = () => {
    clearTimeout(delay);
    clearInterval(rep);
    delay = rep = undefined;
  };
  b.addEventListener('pointerdown', (e) => {
    if (b.disabled) return;
    fired = true;
    b.setPointerCapture?.(e.pointerId);
    ctx.events.emit('sound', { id: 'tap' });
    onStep();
    stop();
    delay = setTimeout(() => {
      rep = setInterval(() => {
        ctx.events.emit('ui:activity');
        onStep();
      }, 110);
    }, 420);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(ev, stop);
  // Teclado / lector de pantalla: click sin pointerdown.
  b.addEventListener('click', () => {
    if (!fired) onStep();
    fired = false;
  });
  return b;
}

/** Anima la entrada (clase CSS con @keyframes). `kind` elige la coreografía. */
export function enter(el: HTMLElement, kind: 'fade' | 'up' | 'down' | 'pop' | 'left' | 'right' = 'fade', delayMs = 0): HTMLElement {
  el.classList.remove('cx-out');
  el.classList.add('cx-in', `cx-in--${kind}`);
  if (delayMs) el.style.animationDelay = `${delayMs}ms`;
  return el;
}

/** Anima la salida y quita el nodo al terminar (con red de seguridad por si no hay animationend). */
export function leave(el: HTMLElement | null | undefined, kind: 'fade' | 'up' | 'down' | 'pop' | 'left' | 'right' = 'fade'): void {
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = '1';
  el.style.animationDelay = '';
  el.classList.remove('cx-in', 'cx-in--fade', 'cx-in--up', 'cx-in--down', 'cx-in--pop', 'cx-in--left', 'cx-in--right');
  el.classList.add('cx-out', `cx-out--${kind}`);
  const done = () => el.remove();
  el.addEventListener('animationend', done, { once: true });
  setTimeout(done, 700);
}

/** Formatea números para lecturas y sliders (es-CO). */
const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

export function formatValue(v: number, format: 'percent' | 'number' | 'speed' | undefined, min = 0, max = 1): string {
  switch (format) {
    case 'percent': {
      const pct = max <= 1 && min >= 0 ? v * 100 : ((v - min) / (max - min || 1)) * 100;
      return `${nf0.format(pct)} %`;
    }
    case 'speed':
      return `${nf1.format(v)}×`;
    default:
      return Math.abs(v) >= 100 ? nf0.format(v) : nf2.format(v);
  }
}

export function formatReadout(v: string | number): string {
  return typeof v === 'number' ? (Math.abs(v) >= 100 ? nf0.format(v) : nf2.format(v)) : v;
}
