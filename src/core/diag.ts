// Panel de diagnóstico (?diag=1), solo para el equipo: estado interno del núcleo y últimos avisos y
// errores de consola, pintado dentro del DOM Overlay para que se vea durante la sesión AR. Se refresca
// con setInterval porque window.requestAnimationFrame no corre en una sesión inmersiva.
import * as THREE from 'three';
import type { App } from './app';

const REFRESH_MS = 250;
const LOG_MAX = 8;

/**
 * Testigo: cubo magenta opaco 35 cm delante de la cámara, sin depender de retículas, opacidades ni del
 * Table Lock. Si en la tablet no se ve ni esto, lo que falla es la composición del WebGL sobre la cámara.
 */
function mountCanary(app: App): void {
  const offset = new THREE.Matrix4().makeTranslation(0.06, -0.04, -0.35);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: '#FF00FF', depthTest: false }));
  cube.name = 'diag:canary';
  cube.renderOrder = 999;
  cube.frustumCulled = false;
  cube.matrixAutoUpdate = false;
  cube.matrixWorldAutoUpdate = false;
  cube.onBeforeRender = (_r, _s, camera) => {
    cube.matrixWorld.multiplyMatrices(camera.matrixWorld, offset);
  };
  app.scene.add(cube);
}

export function mountDiagnostics(host: HTMLElement, app: App): void {
  mountCanary(app);
  const log: string[] = [];
  const push = (kind: string, args: unknown[]) => {
    const msg = args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : safeJson(a))).join(' ');
    log.push(`${kind} ${msg}`.slice(0, 220));
    while (log.length > LOG_MAX) log.shift();
  };
  for (const kind of ['error', 'warn'] as const) {
    // eslint-disable-next-line no-console -- se envuelven warn/error, no se usa otro método
    const orig = console[kind].bind(console);
    // eslint-disable-next-line no-console
    console[kind] = (...args: unknown[]) => {
      push(kind === 'error' ? '✖' : '⚠', args);
      orig(...args);
    };
  }
  addEventListener('error', (e) => push('✖', [e.error ?? e.message]));
  addEventListener('unhandledrejection', (e) => push('✖', [e.reason]));

  const pre = document.createElement('pre');
  pre.style.cssText =
    'position:absolute;left:8px;bottom:8px;z-index:2000;max-width:62vw;margin:0;padding:8px 10px;border-radius:8px;' +
    'background:rgba(0,0,0,0.72);color:#9FF5B8;font:12px/1.35 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none';
  host.append(pre);

  setInterval(() => {
    let d: Record<string, string>;
    try {
      d = app.diagnostics();
    } catch (err) {
      d = { diag: String(err) };
    }
    const lines = Object.entries(d).map(([k, v]) => `${k.padEnd(9)} ${v}`);
    pre.textContent = [...lines, ...log].join('\n');
  }, REFRESH_MS);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
