// Sesión WebXR `immersive-ar` simulada para Playwright: permite recorrer en el escritorio el MISMO camino
// que la tablet (startXrSession, hit-test, Table Lock con XRAnchor, reloj propio de los frames XR), cosa
// que `?sim=1` no cubre porque ahí no hay sesión XR. Se inyecta con `page.addInitScript(installXrMock, opts)`;
// la función se serializa, así que no puede usar nada de fuera de su cuerpo.
//
// Escena: el origen del espacio 'local' es donde estaba la tablet al abrir la sesión; el tope de la mesa
// es el plano y = tableY. La cámara mira hacia −Z inclinada `pitch` rad (negativo = hacia abajo).

export interface XrMockOptions {
  /** Desfase del reloj de los frames XR respecto a performance.now() (ms). Negativo = reloj atrasado. */
  timeOffsetMs: number;
  /** Altura del tope respecto al origen 'local' (m). */
  tableY: number;
  /** Inclinación de la cámara (rad). */
  pitch: number;
  /** ¿El hit-test encuentra la mesa? */
  hits: boolean;
  /** Tracking perdido (sin pose del visor ni hit-test): la tablet en el soporte mirando al pedestal. */
  lost?: boolean;
}

export interface XrMockHandle {
  opts: XrMockOptions;
  frames: number;
  session: unknown;
  /** Sesiones pedidas con requestSession. */
  sessions: number;
}

export function installXrMock(opts: XrMockOptions): void {
  type M = Float32Array;
  const g = window as unknown as Record<string, unknown>;
  const handle: XrMockHandle = { opts, frames: 0, session: null, sessions: 0 };
  g.__xrMock = handle;

  // three r186 usa XRProjectionLayer si existe XRWebGLBinding; aquí se fuerza el camino de XRWebGLLayer
  // (el que pinta en el framebuffer por defecto y por tanto se ve en las capturas).
  g.XRWebGLBinding = undefined;
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    (C.prototype as unknown as { makeXRCompatible: () => Promise<void> }).makeXRCompatible = () => Promise.resolve();
  }

  const compose = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number; w: number }): M => {
    const { x, y, z, w } = q;
    const [x2, y2, z2] = [x + x, y + y, z + z];
    const [xx, xy, xz, yy, yz, zz] = [x * x2, x * y2, x * z2, y * y2, y * z2, z * z2];
    const [wx, wy, wz] = [w * x2, w * y2, w * z2];
    // prettier-ignore
    return new Float32Array([
      1 - (yy + zz), xy + wz, xz - wy, 0,
      xy - wz, 1 - (xx + zz), yz + wx, 0,
      xz + wy, yz - wx, 1 - (xx + yy), 0,
      p.x, p.y, p.z, 1,
    ]);
  };

  class MockRigidTransform {
    readonly position: DOMPointReadOnly;
    readonly orientation: DOMPointReadOnly;
    readonly matrix: M;
    constructor(p: Partial<DOMPointInit> = {}, o: Partial<DOMPointInit> = {}) {
      this.position = new DOMPointReadOnly(p.x ?? 0, p.y ?? 0, p.z ?? 0, 1);
      this.orientation = new DOMPointReadOnly(o.x ?? 0, o.y ?? 0, o.z ?? 0, o.w ?? 1);
      this.matrix = compose(this.position, this.orientation);
    }
    get inverse(): MockRigidTransform {
      const q = this.orientation;
      const p = this.position;
      // inversa de una transformación rígida: q⁻¹, −(q⁻¹·p)
      const qi = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
      const m = compose({ x: 0, y: 0, z: 0 }, qi);
      const ip = {
        x: -(m[0]! * p.x + m[4]! * p.y + m[8]! * p.z),
        y: -(m[1]! * p.x + m[5]! * p.y + m[9]! * p.z),
        z: -(m[2]! * p.x + m[6]! * p.y + m[10]! * p.z),
      };
      return new MockRigidTransform(ip, qi);
    }
  }
  g.XRRigidTransform = MockRigidTransform;

  const viewerTransform = () => {
    const h = opts.pitch / 2;
    return new MockRigidTransform({ x: 0, y: 0, z: 0 }, { x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) });
  };

  const projection = (): M => {
    const f = 1 / Math.tan((60 * Math.PI) / 360);
    const a = innerWidth / innerHeight;
    const [n, fa] = [0.1, 1000];
    // prettier-ignore
    return new Float32Array([f / a, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0]);
  };

  /** Rayo del visor (centro de la pantalla) contra el plano del tope. */
  const hitTransform = (): MockRigidTransform | null => {
    const m = viewerTransform().matrix;
    const dir = { x: -m[8]!, y: -m[9]!, z: -m[10]! };
    if (dir.y >= -1e-3) return null;
    const t = opts.tableY / dir.y;
    return new MockRigidTransform({ x: dir.x * t, y: opts.tableY, z: dir.z * t });
  };

  interface AnchorSpace {
    __anchor: true;
    transform: MockRigidTransform;
  }
  const tracked = new Set<{ anchorSpace: AnchorSpace; delete(): void }>();

  class MockLayer {
    readonly framebuffer = null;
    readonly framebufferWidth: number;
    readonly framebufferHeight: number;
    readonly ignoreDepthValues = false;
    readonly antialias = true;
    fixedFoveation: number | undefined = undefined;
    constructor(_s: unknown, gl: WebGLRenderingContext) {
      this.framebufferWidth = gl.drawingBufferWidth;
      this.framebufferHeight = gl.drawingBufferHeight;
    }
    getViewport() {
      return { x: 0, y: 0, width: this.framebufferWidth, height: this.framebufferHeight };
    }
  }
  g.XRWebGLLayer = MockLayer;

  const space = (type: string) => ({
    type,
    getOffsetReferenceSpace() {
      return this;
    },
    addEventListener() {},
    removeEventListener() {},
  });

  class MockSession extends EventTarget {
    readonly renderState: Record<string, unknown> = { baseLayer: null, depthNear: 0.1, depthFar: 1000, inlineVerticalFieldOfView: null };
    readonly inputSources: unknown[] = [];
    readonly enabledFeatures = ['local', 'viewer', 'hit-test', 'dom-overlay', 'anchors'];
    readonly environmentBlendMode = 'alpha-blend';
    readonly visibilityState = 'visible';
    readonly domOverlayState = { type: 'screen' };
    private cbs = new Map<number, (t: number, f: unknown) => void>();
    private id = 0;
    private ended = false;
    constructor() {
      super();
      const tick = () => {
        if (this.ended) return;
        const cbs = [...this.cbs.values()];
        this.cbs.clear();
        const frame = this.frame();
        const t = performance.now() + opts.timeOffsetMs; // se lee en cada frame: la prueba puede cambiarlo
        for (const cb of cbs) cb(t, frame);
        handle.frames++;
        setTimeout(tick, 16);
      };
      setTimeout(tick, 16);
    }
    updateRenderState(s: Record<string, unknown>) {
      Object.assign(this.renderState, s);
    }
    requestReferenceSpace(type: string) {
      return Promise.resolve(space(type));
    }
    requestHitTestSource() {
      return Promise.resolve({ cancel() {} });
    }
    requestAnimationFrame(cb: (t: number, f: unknown) => void) {
      this.cbs.set(++this.id, cb);
      return this.id;
    }
    cancelAnimationFrame(id: number) {
      this.cbs.delete(id);
    }
    updateTargetFrameRate() {
      return Promise.resolve();
    }
    end() {
      if (!this.ended) {
        this.ended = true;
        this.dispatchEvent(new Event('end'));
      }
      return Promise.resolve();
    }
    private frame() {
      return {
        session: this,
        trackedAnchors: tracked,
        getViewerPose() {
          if (opts.lost) return null;
          const tr = viewerTransform();
          return { transform: tr, emulatedPosition: false, views: [{ eye: 'none', transform: tr, projectionMatrix: projection() }] };
        },
        getHitTestResults() {
          const tr = opts.hits && !opts.lost ? hitTransform() : null;
          return tr ? [{ getPose: () => ({ transform: tr, emulatedPosition: false }) }] : [];
        },
        getPose(sp: Partial<AnchorSpace>) {
          return sp.__anchor && sp.transform ? { transform: sp.transform, emulatedPosition: false } : null;
        },
        createAnchor(tr: MockRigidTransform) {
          const a = {
            anchorSpace: { __anchor: true as const, transform: tr },
            delete: () => void tracked.delete(a),
          };
          tracked.add(a);
          return Promise.resolve(a);
        },
        getLightEstimate() {
          return null;
        },
      };
    }
  }

  Object.defineProperty(navigator, 'xr', {
    configurable: true,
    value: {
      isSessionSupported: (mode: string) => Promise.resolve(mode === 'immersive-ar'),
      requestSession: () => {
        const s = new MockSession();
        handle.session = s;
        handle.sessions++;
        return Promise.resolve(s);
      },
      addEventListener() {},
      removeEventListener() {},
    },
  });
}
