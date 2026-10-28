// Arranque: ?sim=1 = simulador de escritorio; ?ui=1 = página de componentes del Agente 3;
// ?sala=1 = modo sala (la calibración se conserva entre visitantes, D25).
import { App, showFatal } from './core/app';
import { createTranslator } from './core/i18n';
import type { CauceDevHook } from './core/contracts';
import { createUi } from './ui';
import { createFxKit } from './fx';
import { createAudioKit } from './audio';

const params = new URLSearchParams(location.search);
const t = createTranslator();
const overlay = document.getElementById('overlay')!;
const gestureLayer = document.getElementById('gesture-layer')!;
const canvasHost = document.getElementById('scene')!;

addEventListener('error', (e) => onFatal(e.error ?? e.message));
addEventListener('unhandledrejection', (e) => onFatal(e.reason));

let app: App | null = null;
function onFatal(err: unknown): void {
  if (app) app.fatal(err);
  else {
    console.error('[main] error fatal', err);
    showFatal(overlay, t);
  }
}

async function boot(): Promise<void> {
  if (params.has('ui')) {
    // D18: playground de componentes (si el Agente 3 ya lo entregó).
    const pg = import.meta.glob<{ mountPlayground(root: HTMLElement): void }>('./ui/playground.ts');
    const load = pg['./ui/playground.ts'];
    if (load) return (await load()).mountPlayground(overlay);
  }
  app = new App({
    canvasHost,
    overlay,
    gestureLayer,
    t,
    ui: createUi(),
    createFx: createFxKit,
    audio: createAudioKit(),
    simulator: params.get('sim') === '1',
    room: params.get('sala') === '1',
  });
  if (import.meta.env.DEV) {
    const a = app;
    const hook: CauceDevHook = { app: a, getState: () => a.getState(), renderer: a.renderer, scene: a.scene };
    (window as unknown as { __cauce: CauceDevHook }).__cauce = hook;
  }
  // Diagnóstico para el equipo (panel de estado + cubo testigo magenta): solo con ?diag=1.
  if (params.get('diag') === '1') (await import('./core/diag')).mountDiagnostics(overlay, app);
  await app.start();
}

void boot();
