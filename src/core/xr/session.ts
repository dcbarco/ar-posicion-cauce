// Sesión WebXR immersive-ar: soporte, inicio, hit-test del visor y anclas.
import type * as THREE from 'three';

export type XrSupport = { ok: true } | { ok: false; reason: 'insecure' | 'no_xr' | 'no_ar' };

export async function checkXrSupport(): Promise<XrSupport> {
  if (!window.isSecureContext) return { ok: false, reason: 'insecure' };
  const xr = navigator.xr;
  if (!xr) return { ok: false, reason: 'no_xr' };
  try {
    return (await xr.isSessionSupported('immersive-ar')) ? { ok: true } : { ok: false, reason: 'no_ar' };
  } catch {
    return { ok: false, reason: 'no_ar' };
  }
}

/** Espera el `resize` que sigue a salir de pantalla completa (máx. 600 ms; la activación del toque dura ~5 s). */
function settleViewport(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      removeEventListener('resize', onResize);
      clearTimeout(timer);
      setTimeout(resolve, 150);
    };
    const onResize = () => done();
    const timer = setTimeout(done, 600);
    addEventListener('resize', onResize);
  });
}

function restoreFullscreen(): void {
  if (document.fullscreenElement) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch((err: unknown) => console.warn('[xr] no se pudo volver a pantalla completa', err));
}

/**
 * three r186 pinta en un XRProjectionLayer (WebXR Layers) si el navegador expone
 * `XRWebGLBinding.prototype.createProjectionLayer`, y si no en un XRWebGLLayer. En AR con ARCore la
 * vía de capas puede dibujar (renderer.info > 0) sin que nada se componga sobre la cámara, así que se
 * oculta ese método mientras three monta la sesión y se fuerza el XRWebGLLayer clásico.
 */
async function withClassicLayer<T>(run: () => Promise<T>): Promise<T> {
  const proto = (globalThis as { XRWebGLBinding?: { prototype: Record<string, unknown> } }).XRWebGLBinding?.prototype;
  const desc = proto ? Object.getOwnPropertyDescriptor(proto, 'createProjectionLayer') : undefined;
  // ?xrlayers=1 deja que three use WebXR Layers (para comparar en la tablet).
  if (!proto || !desc?.configurable || new URLSearchParams(location.search).get('xrlayers') === '1') return run();
  delete proto.createProjectionLayer;
  try {
    return await run();
  } finally {
    Object.defineProperty(proto, 'createProjectionLayer', desc);
  }
}

export interface XrSessionHandle {
  session: XRSession;
  refSpace: XRReferenceSpace;
  viewerSpace: XRReferenceSpace;
  hitTestSource: XRHitTestSource | null;
  anchorsSupported: boolean;
  lightEstimation: boolean;
  /** La página estaba a pantalla completa al pedir la sesión (diagnóstico). */
  fromFullscreen: boolean;
  end(): Promise<void>;
}

/** Debe llamarse dentro de un gesto del usuario (click en "Entrar en AR"). */
export async function startXrSession(renderer: THREE.WebGLRenderer, overlayRoot: HTMLElement): Promise<XrSessionHandle> {
  const xr = navigator.xr;
  if (!xr) throw new Error('navigator.xr no disponible');
  // La pantalla completa del navegador (gesto del operador) choca con el DOM Overlay: Chrome pone el
  // overlay a pantalla completa por su cuenta y, si el documento ya lo estaba, la escena 3D no se ve.
  // Se sale antes de pedir la sesión (no consume la activación del toque) y se restaura al terminar.
  const hadFullscreen = !!document.fullscreenElement;
  if (hadFullscreen) {
    await document.exitFullscreen().catch(() => {});
    await settleViewport(); // que Chrome termine de reacomodar la ventana antes de montar la sesión
  }
  let session: XRSession;
  try {
    session = await xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'dom-overlay'],
      optionalFeatures: ['anchors', 'light-estimation', 'local-floor'],
      domOverlay: { root: overlayRoot },
    });
  } catch (err) {
    if (hadFullscreen) restoreFullscreen();
    throw err;
  }
  // Al salir con el botón del HUD la activación de ese toque aún vale; si la cerró el sistema, el
  // navegador puede negarla y el operador repite su gesto.
  if (hadFullscreen) session.addEventListener('end', restoreFullscreen, { once: true });
  renderer.xr.setReferenceSpaceType('local');
  await withClassicLayer(() => renderer.xr.setSession(session));
  const refSpace = renderer.xr.getReferenceSpace();
  if (!refSpace) throw new Error('sin espacio de referencia');
  const viewerSpace = await session.requestReferenceSpace('viewer');
  let hitTestSource: XRHitTestSource | null = null;
  try {
    hitTestSource = (await session.requestHitTestSource?.({ space: viewerSpace })) ?? null;
  } catch (err) {
    console.warn('[xr] hit-test no disponible', err);
  }
  const features = (session as XRSession & { enabledFeatures?: string[] }).enabledFeatures;
  const anchorsSupported = features ? features.includes('anchors') : typeof XRFrame !== 'undefined' && 'createAnchor' in XRFrame.prototype;
  const lightEstimation = features ? features.includes('light-estimation') : false;
  return {
    session,
    refSpace,
    viewerSpace,
    hitTestSource,
    anchorsSupported,
    lightEstimation,
    fromFullscreen: hadFullscreen,
    async end() {
      hitTestSource?.cancel();
      hitTestSource = null;
      try {
        await session.end();
      } catch {
        /* ya terminada */
      }
    },
  };
}
