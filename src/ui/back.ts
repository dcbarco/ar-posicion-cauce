// Botón "atrás" de Android: en vez de salir de la página, retrocede dentro de la app (cierra ayuda o
// cambio de experiencia, cierra el modal de instrucciones o vuelve al inicio desde AR). Se deja una
// entrada de historial "centinela" y se repone cada vez que el botón la consume.
// Ojo: con la pantalla completa del navegador, Chrome usa el primer "atrás" para salir de ella y la
// página no se entera; para evitarlo la app debe correr instalada (PWA a pantalla completa) o fijada.
import type { UiApi, UiAction } from '../core/contracts';

const MARK = 'cx-back';

export function installBackGuard(api: UiApi, act: (a: UiAction) => void): () => void {
  const push = () => history.pushState({ [MARK]: true }, '');
  if (!(history.state as Record<string, unknown> | null)?.[MARK]) push();

  const onPop = () => {
    push();
    const s = api.getState();
    if (s.helpOpen) act({ type: 'help', open: false });
    else if (s.switcherOpen) act({ type: 'switcher', open: false });
    else if (s.state === 'intro') act({ type: 'close-intro' });
    else if (s.state === 'scan' || s.state === 'lock' || s.state === 'place' || s.state === 'explore') act({ type: 'exit' });
  };

  addEventListener('popstate', onPop);
  return () => removeEventListener('popstate', onPop);
}
