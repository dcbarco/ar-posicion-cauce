// UI de Mesa CAUCE (Agente 3). Se monta dentro del DOM Overlay, encima de la capa de gestos
// (#gesture-layer, del Agente 1). Contenedores con pointer-events:none: solo los objetivos táctiles
// (`.cx-hit`) capturan toques; el resto pasa a la capa de gestos.
import '@fontsource-variable/lexend/wght.css';
import './tokens.css';
import './ui.css';
import type { AppSnapshot, UiApi, UiModule } from '../core/contracts';
import { createControlsPanel } from './controls';
import { h, makeCtx } from './dom';
import { createContextMenuHost, createFloatingLabelHost, createModalHost, createToastHost } from './overlays';
import { createScreens, type Layers } from './screens';

export function createUi(): UiModule {
  let root: HTMLElement | null = null;
  let tickers: ((dt: number) => void)[] = [];
  let disposers: (() => void)[] = [];

  return {
    mount(overlay: HTMLElement, api: UiApi) {
      const ctx = makeCtx(api);
      root = h('div', 'cx-ui');
      root.setAttribute('data-cx-ui', '');
      const layer = (name: string) => {
        const el = h('div', `cx-layer cx-layer--${name}`);
        root?.append(el);
        return el;
      };
      const L: Layers = {
        veil: layer('veil'),
        hud: layer('hud'),
        labels: layer('labels'),
        panels: layer('panels'),
        screen: layer('screen'),
        modal: layer('modal'),
        menu: layer('menu'),
        toast: layer('toast'),
        top: layer('top'),
      };
      overlay.append(root);

      // Los toques sobre la UI no deben disparar `select` en la escena XR. Todo evento que llega aquí
      // viene de un elemento de la UI (la capa de gestos no está dentro de `root`).
      const onBeforeXrSelect = (e: Event) => e.preventDefault();
      root.addEventListener('beforexrselect', onBeforeXrSelect);
      // Cualquier toque reinicia el temporizador de inactividad.
      const onDown = () => api.events.emit('ui:activity');
      root.addEventListener('pointerdown', onDown, { capture: true });

      const controls = createControlsPanel(ctx, () => L.top);
      const screens = createScreens(ctx, L, controls);
      const modal = createModalHost(ctx, L.modal);
      const toasts = createToastHost(ctx, L.toast);
      const menu = createContextMenuHost(ctx, L.menu);
      const label = createFloatingLabelHost(ctx, L.labels);

      const onState = (s: AppSnapshot) => {
        screens.render(s);
        // Fuera de EXPLORE no quedan menús ni fichas colgando.
        if (s.state !== 'explore') {
          menu.close();
          label.show(null);
        }
      };
      const offState = api.events.on('app:state', onState);
      const offControls = api.events.on('controls:changed', () => {
        if (screens.exploring()) controls.set(api.getControls());
      });

      tickers = [(dt) => controls.tick(dt), () => label.tick()];
      disposers = [
        offState,
        offControls,
        () => root?.removeEventListener('beforexrselect', onBeforeXrSelect),
        () => root?.removeEventListener('pointerdown', onDown, { capture: true }),
        () => screens.dispose(),
        () => controls.dispose(),
        () => modal.dispose(),
        () => toasts.dispose(),
        () => menu.dispose(),
        () => label.dispose(),
      ];
      onState(api.getState());
    },
    tick(dt: number) {
      for (let i = 0; i < tickers.length; i++) tickers[i]?.(dt);
    },
    dispose() {
      for (const d of disposers) d();
      disposers = [];
      tickers = [];
      root?.remove();
      root = null;
    },
  };
}
