// Gesto oculto del operador: 5 toques seguidos en la esquina superior derecha alternan la pantalla
// completa del navegador. No pinta nada ni consume el toque; durante la sesión AR no aplica (el
// navegador ya la muestra a pantalla completa).
const ZONE_PX = 96; // lado del cuadrado sensible en la esquina
const TAPS = 5;
const WINDOW_MS = 2500; // los 5 toques deben caer dentro de esta ventana

export function installFullscreenGesture(enabled: () => boolean): () => void {
  let times: number[] = [];

  // `pointerup` (no `pointerdown`): en pantallas táctiles es el que da activación de usuario
  // para que `requestFullscreen` no sea rechazado.
  const onUp = (e: PointerEvent) => {
    if (!e.isPrimary || !enabled()) return;
    if (e.clientX < window.innerWidth - ZONE_PX || e.clientY > ZONE_PX) {
      times = [];
      return;
    }
    const now = e.timeStamp;
    times = times.filter((t) => now - t < WINDOW_MS);
    times.push(now);
    if (times.length < TAPS) return;
    times = [];
    const req = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    req.catch((err: unknown) => console.warn('[ui] pantalla completa no disponible', err));
  };

  window.addEventListener('pointerup', onUp, { capture: true });
  return () => window.removeEventListener('pointerup', onUp, { capture: true });
}
