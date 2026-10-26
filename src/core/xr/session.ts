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

export interface XrSessionHandle {
  session: XRSession;
  refSpace: XRReferenceSpace;
  viewerSpace: XRReferenceSpace;
  hitTestSource: XRHitTestSource | null;
  anchorsSupported: boolean;
  lightEstimation: boolean;
  end(): Promise<void>;
}

/** Debe llamarse dentro de un gesto del usuario (click en "Entrar en AR"). */
export async function startXrSession(renderer: THREE.WebGLRenderer, overlayRoot: HTMLElement): Promise<XrSessionHandle> {
  const xr = navigator.xr;
  if (!xr) throw new Error('navigator.xr no disponible');
  const session = await xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test', 'dom-overlay'],
    optionalFeatures: ['anchors', 'light-estimation', 'local-floor'],
    domOverlay: { root: overlayRoot },
  });
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
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
