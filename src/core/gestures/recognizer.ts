// Reconocedor de gestos en pantalla (Pointer Events sobre #gesture-layer).
// Produce gestos en px de pantalla; el núcleo los convierte en rayos del marco "mesa local".
import type { GesturePhase } from '../contracts';

export type ScreenGesture =
  | { type: 'tap' | 'doubletap' | 'longpress'; x: number; y: number }
  | { type: 'drag'; phase: GesturePhase; x: number; y: number; ox: number; oy: number; fromTray?: { trayId: string; itemId: string } }
  /** `deltaAngle` ya convertido a yaw (rad, + = antihorario visto desde arriba). */
  | { type: 'rotate'; phase: GesturePhase; x: number; y: number; deltaAngle: number }
  | { type: 'pinch'; phase: GesturePhase; x: number; y: number; deltaScale: number };

export const GESTURE = {
  moveSlopPx: 10,
  longPressMs: 550,
  doubleTapMs: 300,
  doubleTapSlopPx: 30,
} as const;

interface P {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

export class GestureRecognizer {
  private readonly pointers = new Map<number, P>();
  private dragging = false;
  private twoFinger = false;
  private blocked = false; // tras levantar un dedo de dos, ignorar hasta soltar todos
  private longTimer: ReturnType<typeof setTimeout> | null = null;
  private longFired = false;
  private lastTap = { t: -1e9, x: 0, y: 0 };
  private prevAngle = 0;
  private prevDist = 1;
  private shiftRotate = false;
  private readonly abort = new AbortController();

  constructor(
    private readonly el: HTMLElement,
    private readonly emit: (g: ScreenGesture) => void,
    private readonly onActivity: () => void = () => {},
  ) {
    const o = { signal: this.abort.signal };
    el.addEventListener('pointerdown', (e) => this.down(e), o);
    el.addEventListener('pointermove', (e) => this.move(e), o);
    el.addEventListener('pointerup', (e) => this.up(e, false), o);
    el.addEventListener('pointercancel', (e) => this.up(e, true), o);
    el.addEventListener('contextmenu', (e) => e.preventDefault(), o);
    // Simulador: rueda = pellizco.
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.onActivity();
        const s = Math.exp(-e.deltaY * 0.0015);
        this.emit({ type: 'pinch', phase: 'start', x: e.clientX, y: e.clientY, deltaScale: 1 });
        this.emit({ type: 'pinch', phase: 'move', x: e.clientX, y: e.clientY, deltaScale: s });
        this.emit({ type: 'pinch', phase: 'end', x: e.clientX, y: e.clientY, deltaScale: 1 });
      },
      { signal: this.abort.signal, passive: false },
    );
  }

  /** Arrastre que empieza en una bandeja de la UI (evento `ui:tray-drag`). */
  trayDrag(phase: GesturePhase, x: number, y: number, trayId: string, itemId: string): void {
    this.onActivity();
    this.emit({ type: 'drag', phase, x, y, ox: x, oy: y, fromTray: { trayId, itemId } });
  }

  dispose(): void {
    this.clearLong();
    this.abort.abort();
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.onActivity();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* algunos navegadores XR no lo permiten */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.pointers.size === 1) {
      this.blocked = false;
      this.longFired = false;
      this.shiftRotate = e.shiftKey && e.pointerType === 'mouse';
      if (this.shiftRotate) {
        this.emit({ type: 'rotate', phase: 'start', x: e.clientX, y: e.clientY, deltaAngle: 0 });
        return;
      }
      this.clearLong();
      this.longTimer = setTimeout(() => {
        this.longTimer = null;
        if (this.dragging || this.twoFinger || this.pointers.size !== 1) return;
        this.longFired = true;
        this.emit({ type: 'longpress', x: e.clientX, y: e.clientY });
      }, GESTURE.longPressMs);
    } else if (this.pointers.size === 2) {
      this.clearLong();
      if (this.dragging) {
        const p = this.first();
        this.emit({ type: 'drag', phase: 'cancel', x: p.x, y: p.y, ox: p.sx, oy: p.sy });
        this.dragging = false;
      }
      this.twoFinger = true;
      const [a, b] = this.pair();
      this.prevAngle = Math.atan2(b.y - a.y, b.x - a.x);
      this.prevDist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      this.emit({ type: 'rotate', phase: 'start', x: cx, y: cy, deltaAngle: 0 });
      this.emit({ type: 'pinch', phase: 'start', x: cx, y: cy, deltaScale: 1 });
    }
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const px = p.x;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.blocked) return;
    if (this.shiftRotate) {
      this.emit({ type: 'rotate', phase: 'move', x: p.x, y: p.y, deltaAngle: (px - p.x) * 0.01 });
      return;
    }
    if (this.twoFinger && this.pointers.size >= 2) {
      const [a, b] = this.pair();
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      let d = ang - this.prevAngle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      this.emit({ type: 'rotate', phase: 'move', x: cx, y: cy, deltaAngle: -d });
      this.emit({ type: 'pinch', phase: 'move', x: cx, y: cy, deltaScale: dist / this.prevDist });
      this.prevAngle = ang;
      this.prevDist = dist;
      return;
    }
    if (this.pointers.size !== 1 || this.longFired) return;
    if (!this.dragging && Math.hypot(p.x - p.sx, p.y - p.sy) > GESTURE.moveSlopPx) {
      this.clearLong();
      this.dragging = true;
      this.emit({ type: 'drag', phase: 'start', x: p.sx, y: p.sy, ox: p.sx, oy: p.sy });
    }
    if (this.dragging) this.emit({ type: 'drag', phase: 'move', x: p.x, y: p.y, ox: p.sx, oy: p.sy });
  }

  private up(e: PointerEvent, cancelled: boolean): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    this.clearLong();
    if (this.shiftRotate) {
      this.shiftRotate = false;
      this.emit({ type: 'rotate', phase: 'end', x: p.x, y: p.y, deltaAngle: 0 });
      return;
    }
    if (this.twoFinger) {
      this.twoFinger = false;
      this.blocked = this.pointers.size > 0;
      this.emit({ type: 'rotate', phase: cancelled ? 'cancel' : 'end', x: p.x, y: p.y, deltaAngle: 0 });
      this.emit({ type: 'pinch', phase: cancelled ? 'cancel' : 'end', x: p.x, y: p.y, deltaScale: 1 });
      return;
    }
    if (this.blocked) {
      if (this.pointers.size === 0) this.blocked = false;
      return;
    }
    if (this.dragging) {
      this.dragging = false;
      this.emit({ type: 'drag', phase: cancelled ? 'cancel' : 'end', x: p.x, y: p.y, ox: p.sx, oy: p.sy });
      return;
    }
    if (cancelled || this.longFired) return;
    this.emit({ type: 'tap', x: p.x, y: p.y });
    const now = performance.now();
    if (now - this.lastTap.t < GESTURE.doubleTapMs && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < GESTURE.doubleTapSlopPx) {
      this.emit({ type: 'doubletap', x: p.x, y: p.y });
      this.lastTap.t = -1e9;
    } else {
      this.lastTap = { t: now, x: p.x, y: p.y };
    }
  }

  private first(): P {
    return this.pointers.values().next().value as P;
  }

  private pair(): [P, P] {
    const it = this.pointers.values();
    return [it.next().value as P, it.next().value as P];
  }

  private clearLong(): void {
    if (this.longTimer) clearTimeout(this.longTimer);
    this.longTimer = null;
  }
}
