// Pantallas del flujo según `AppSnapshot.state` y superposiciones persistentes (velo de reubicación,
// sugerencia de recalibrar, inactividad, panel de cambio, ayuda, banner del simulador).
// Se reconcilia por diferencias: solo se crea/destruye DOM cuando cambia la pantalla; el resto se
// actualiza en sitio (progreso, cuenta regresiva, sonido…).
import type { AppSnapshot, AppState, ExperienceId } from '../core/contracts';
import { artFor, brandLogo, flowBackdrop } from './art';
import type { ControlsPanel } from './controls';
import { button, enter, h, leave, repeatButton, type UiCtx } from './dom';
import { icon } from './icons';
import { dialog, type DialogParts } from './overlays';

export interface Layers {
  veil: HTMLElement;
  hud: HTMLElement;
  labels: HTMLElement;
  panels: HTMLElement;
  screen: HTMLElement;
  modal: HTMLElement;
  menu: HTMLElement;
  toast: HTMLElement;
  top: HTMLElement;
}

const AR_STATES: ReadonlySet<AppState> = new Set(['scan', 'lock', 'place', 'explore']);
const NUDGE_M = 0.01; // 1 cm
const NUDGE_DEG = 1; // 1°
const IDLE_DEFAULT_S = 10;
const OPERATOR_HOLD_MS = 3000;
// Experiencias aún sin contenido real: se muestran en gris con "Próximamente" y no se pueden abrir.
const SOON: ReadonlySet<ExperienceId> = new Set(['cuenca', 'cosmos']);

export function createScreens(ctx: UiCtx, L: Layers, controls: ControlsPanel) {
  const { t, act } = ctx;
  let prev: AppSnapshot | null = null;

  // ───────────── pantallas completas (boot / operator / home) ─────────────
  let screenKey = '';
  let screenEl: HTMLElement | null = null;
  let operatorReasonEl: HTMLElement | null = null;

  const bootScreen = () =>
    h('section', 'cx-screen cx-screen--boot cx-hit', [
      brandLogo(t('home.title'), 'cx-logo cx-logo--lg'),
      h('p', 'cx-boot__label', [t('loading.label')]),
      h('div', 'cx-indeterminate', [h('span')]),
    ]);

  const operatorScreen = (s: AppSnapshot) => {
    operatorReasonEl = h('code', 'cx-operator__reason', [s.operatorReason ?? '']);
    const known = s.operatorReason && /^[a-z_]+$/.test(s.operatorReason) ? t(`operator.body.${s.operatorReason}`) : '';
    return h('section', 'cx-screen cx-screen--operator cx-hit', [
      h('div', 'cx-operator__card', [
        icon('warn', 'cx-ico cx-operator__ico'),
        h('h1', 'cx-operator__title', [t('operator.title')]),
        known ? h('p', 'cx-operator__body', [known]) : null,
        operatorReasonEl,
        button(ctx, { label: t('operator.label.restart'), icon: 'reset', variant: 'primary', size: 'lg' }, () => act({ type: 'operator-restart' })),
      ]),
    ]);
  };

  // Modo sala: gesto oculto del operador. Mantener el logo de HOME 3 s y soltar → calibrar la mesa.
  // Se dispara al soltar (pointerup da activación de usuario para abrir la sesión AR si no hay).
  const operatorHold = (el: HTMLElement) => {
    let timer = 0;
    let armed = false;
    el.classList.add('cx-hit', 'cx-logo--hold');
    const cancel = () => {
      clearTimeout(timer);
      armed = false;
      el.classList.remove('is-armed');
    };
    el.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      cancel();
      timer = window.setTimeout(() => {
        armed = true;
        el.classList.add('is-armed');
      }, OPERATOR_HOLD_MS);
    });
    el.addEventListener('pointerup', () => {
      const go = armed;
      cancel();
      if (!go) return;
      ctx.events.emit('sound', { id: 'tap' });
      act({ type: 'recalibrate' });
    });
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault()); // sin menú "descargar imagen"
  };

  const homeScreen = (s: AppSnapshot) => {
    const logo = brandLogo('');
    if (s.room) operatorHold(logo);
    const cards = ctx.api.experiences.map((id, i) => {
      const soon = SOON.has(id);
      const card = h('button', `cx-card cx-hit${soon ? ' is-soon' : ''}`, [
        h('div', 'cx-card__art', [artFor(id)]),
        h('div', 'cx-card__body', [
          h('h2', 'cx-card__title', [t(`home.card.${id}.title`)]),
          h('p', 'cx-card__hook', [t(`home.card.${id}.tip`)]),
          h('p', 'cx-card__discover-label', [icon('eye'), t('home.label.discover')]),
          h('p', 'cx-card__discover', [t(`home.card.${id}.body`)]),
        ]),
        soon ? h('span', 'cx-soon', [t('home.label.soon')]) : h('span', 'cx-card__go', [icon('arrow-right')]),
      ]);
      card.type = 'button';
      card.disabled = soon;
      card.addEventListener('click', () => {
        if (soon) return;
        ctx.events.emit('sound', { id: 'tap' });
        act({ type: 'pick-experience', id });
      });
      return enter(card, 'up', 120 + i * 90);
    });
    return h('section', 'cx-screen cx-screen--home cx-hit', [
      flowBackdrop(),
      // El logo ya dice CAUCE: el título queda solo para lectores de pantalla.
      h('header', 'cx-home__head', [logo, h('div', '', [h('h1', 'cx-home__title cx-sr', [t('home.title')]), h('p', 'cx-home__subtitle', [t('home.tip.subtitle')])])]),
      h('div', 'cx-home__cards', cards),
    ]);
  };

  const renderScreen = (s: AppSnapshot) => {
    const key = s.state === 'boot' || s.state === 'operator' ? s.state : s.state === 'home' || s.state === 'intro' ? 'home' : '';
    if (key !== screenKey) {
      leave(screenEl, 'fade');
      screenEl = null;
      operatorReasonEl = null;
      screenKey = key;
      if (key === 'boot') screenEl = bootScreen();
      else if (key === 'operator') screenEl = operatorScreen(s);
      else if (key === 'home') screenEl = homeScreen(s);
      if (screenEl) L.screen.append(enter(screenEl, 'fade'));
    }
    if (operatorReasonEl && operatorReasonEl.textContent !== (s.operatorReason ?? '')) operatorReasonEl.textContent = s.operatorReason ?? '';
  };

  // ───────────── modal de instrucciones (intro) ─────────────
  interface Intro {
    exp: ExperienceId | null;
    d: DialogParts;
    step: number;
    bar: HTMLElement;
    pct: HTMLElement;
    load: HTMLElement;
    paint(): void;
  }
  let intro: Intro | null = null;
  const STEP_ICONS = ['tablet', 'table', 'tap'];

  const openIntro = (s: AppSnapshot) => {
    const d = dialog(L.modal, 'cx-dialog--intro');
    const room = s.tableReady;
    const dots = h('div', 'cx-steps', [0, 1, 2].map(() => h('span', 'cx-steps__seg')));
    dots.setAttribute('aria-hidden', 'true');
    const stage = h('div', 'cx-intro__stage');
    const bar = h('span', 'cx-progress__fill');
    const pct = h('span', 'cx-progress__pct');
    const load = h('div', 'cx-progress', [h('span', 'cx-progress__label', [icon('check', 'cx-ico cx-progress__done'), t('loading.label')]), pct, h('div', 'cx-progress__track', [bar])]);
    const foot = h('div', 'cx-dialog__actions cx-intro__foot');
    const head = h('div', 'cx-intro__head', [
      h('p', 'cx-intro__exp', [s.experience ? t(`home.card.${s.experience}.title`) : '']),
      button(ctx, { aria: t('intro.label.close'), icon: 'close', variant: 'icon' }, () => act({ type: 'close-intro' })),
    ]);
    d.card.append(head, dots, stage, load, foot);
    const it: Intro = {
      exp: s.experience,
      d,
      step: 0,
      bar,
      pct,
      load,
      paint() {
        const n = it.step + 1;
        // Modo sala con la mesa ya calibrada: el paso 2 no habla de calibrar.
        const base = room && n === 2 ? 'intro.room.step2' : `intro.step${n}`;
        dots.querySelectorAll('.cx-steps__seg').forEach((seg, i) => seg.classList.toggle('is-on', i <= it.step));
        const content = h('div', 'cx-intro__step', [
          h('div', 'cx-intro__ico', [icon(STEP_ICONS[it.step])]),
          h('h2', 'cx-dialog__title', [t(`${base}.title`)]),
          h('p', 'cx-dialog__body', [t(`${base}.body`)]),
        ]);
        stage.replaceChildren(enter(content, 'left'));
        const nav: HTMLElement[] = [];
        if (it.step > 0)
          nav.push(button(ctx, { label: t('intro.label.back'), icon: 'chevron-left', variant: 'ghost' }, () => ((it.step -= 1), it.paint())));
        else nav.push(h('span', 'cx-spacer'));
        if (it.step < 2)
          nav.push(button(ctx, { label: t('intro.label.next'), icon: 'chevron-right', variant: 'primary', size: 'lg', cls: 'cx-btn--trail' }, () => ((it.step += 1), it.paint())));
        else
          // Gesto real del usuario: el núcleo inicia la sesión immersive-ar dentro de este click.
          nav.push(button(ctx, { label: t('intro.label.enter'), icon: 'tablet', variant: 'primary', size: 'xl', cls: 'cx-intro__enter' }, () => act({ type: 'enter-ar' })));
        foot.replaceChildren(...nav);
      },
    };
    it.paint();
    intro = it;
  };

  const renderIntro = (s: AppSnapshot) => {
    const want = s.state === 'intro';
    if (intro && (!want || intro.exp !== s.experience)) {
      intro.d.close();
      intro = null;
    }
    if (want && !intro) openIntro(s);
    if (intro) {
      const p = Math.max(0, Math.min(1, s.loadProgress));
      intro.bar.style.transform = `scaleX(${p})`;
      intro.pct.textContent = `${Math.round(p * 100)} %`;
      intro.load.classList.toggle('is-done', p >= 1);
    }
  };

  // ───────────── HUD de AR (scan / lock / place / explore) ─────────────
  let hudKey = '';
  let hudEl: HTMLElement | null = null;
  let hint: { el: HTMLElement; text: HTMLElement; ico: HTMLElement; key: string } | null = null;
  let soundBtn: HTMLButtonElement | null = null;
  let controlsHidden = false; // el visitante puede plegar el panel de controles para ver el modelo

  const makeHint = (key: string, ico: string) => {
    const icoWrap = h('span', 'cx-hint__ico', [icon(ico)]);
    const text = h('span', 'cx-hint__text', [t(key)]);
    const el = h('div', 'cx-hint', [icoWrap, text]);
    el.setAttribute('role', 'status');
    hint = { el, text, ico: icoWrap, key };
    return enter(el, 'down');
  };
  const setHint = (key: string, ico: string, warn = false) => {
    if (!hint) return;
    hint.el.classList.toggle('is-warn', warn);
    if (hint.key === key) return;
    hint.key = key;
    hint.text.textContent = t(key);
    hint.ico.replaceChildren(icon(ico));
    // Reinicia la animación de entrada para marcar el cambio de mensaje.
    hint.el.classList.remove('cx-flash');
    void hint.el.offsetWidth;
    hint.el.classList.add('cx-flash');
  };

  const exitBtn = () =>
    h('div', 'cx-corner cx-corner--tl', [button(ctx, { aria: t('hud.label.exit'), icon: 'exit', variant: 'icon', cls: 'cx-btn--exit' }, () => act({ type: 'exit' }))]);

  const placeHint = (s: AppSnapshot): [string, string, boolean] =>
    s.reticle === 'warn' ? ['place.tip.edge', 'warn', true] : s.reticle === 'hidden' ? ['place.tip.table', 'tap', false] : ['place.tip.aim', 'tap', false];

  const buildHud = (s: AppSnapshot): HTMLElement => {
    hint = null;
    soundBtn = null;
    const root = h('div', `cx-hud cx-hud--${s.state}`);
    root.append(exitBtn());
    switch (s.state) {
      case 'scan':
        root.append(makeHint('scan.tip.move', 'tablet'), h('div', 'cx-scan-anim', [icon('tablet', 'cx-ico cx-scan-anim__tablet'), icon('table', 'cx-ico cx-scan-anim__table')]));
        break;
      case 'lock':
        if (s.lockPhase === 'aim') {
          root.append(makeHint('lock.tip.aim', 'tap'));
        } else {
          root.append(makeHint('lock.tip.adjust', 'move'));
          const nudge = (dx: number, dz: number, dyawDeg: number) => () =>
            act({ type: 'lock-nudge', ...(dx ? { dx } : {}), ...(dz ? { dz } : {}), ...(dyawDeg ? { dyawDeg } : {}) });
          const pad = h('div', 'cx-dpad', [
            repeatButton(ctx, { aria: t('lock.label.forward'), icon: 'arrow-up', variant: 'icon', size: 'lg', cls: 'cx-dpad__up' }, nudge(0, -NUDGE_M, 0)),
            repeatButton(ctx, { aria: t('lock.label.left'), icon: 'arrow-left', variant: 'icon', size: 'lg', cls: 'cx-dpad__left' }, nudge(-NUDGE_M, 0, 0)),
            h('span', 'cx-dpad__center', [icon('move')]),
            repeatButton(ctx, { aria: t('lock.label.right'), icon: 'arrow-right', variant: 'icon', size: 'lg', cls: 'cx-dpad__right' }, nudge(NUDGE_M, 0, 0)),
            repeatButton(ctx, { aria: t('lock.label.back'), icon: 'arrow-down', variant: 'icon', size: 'lg', cls: 'cx-dpad__down' }, nudge(0, NUDGE_M, 0)),
          ]);
          root.append(enter(h('div', 'cx-rail cx-rail--left', [pad]), 'right'));
          root.append(
            enter(
              h('div', 'cx-rail cx-rail--right', [
                h('div', 'cx-rail__pair', [
                  repeatButton(ctx, { aria: t('lock.label.rotate_left'), icon: 'rotate-left', variant: 'icon', size: 'lg' }, nudge(0, 0, NUDGE_DEG)),
                  repeatButton(ctx, { aria: t('lock.label.rotate_right'), icon: 'rotate-right', variant: 'icon', size: 'lg' }, nudge(0, 0, -NUDGE_DEG)),
                ]),
                button(ctx, { label: t('lock.label.confirm'), icon: 'check', variant: 'primary', size: 'xl', sound: false }, () => {
                  ctx.events.emit('sound', { id: 'success' });
                  act({ type: 'lock-confirm' });
                }),
              ]),
              'left',
            ),
          );
        }
        break;
      case 'place': {
        const [k, ic, w] = placeHint(s);
        const he = makeHint(k, ic);
        if (w) he.classList.add('is-warn');
        root.append(he);
        // Modo sala: el visitante no recalibra (solo si la app lo sugiere, o el operador desde HOME).
        if (!s.room)
          root.append(
          enter(
            h('div', 'cx-rail cx-rail--left', [button(ctx, { label: t('hud.label.recalibrate'), icon: 'recalibrate', cls: 'cx-rail__btn' }, () => act({ type: 'recalibrate' }))]),
            'right',
          ),
        );
        break;
      }
      case 'explore': {
        soundBtn = button(ctx, { label: '', icon: 'sound-on', cls: 'cx-rail__btn cx-rail__sound' }, () => act({ type: 'mute', muted: !(prev?.muted ?? false) }));
        const left = h('div', 'cx-rail cx-rail--left', [
          button(ctx, { label: t('hud.label.switch'), icon: 'switch', cls: 'cx-rail__btn' }, () => act({ type: 'switcher', open: !(prev?.switcherOpen ?? false) })),
          button(ctx, { label: t('hud.label.reset'), icon: 'reset', cls: 'cx-rail__btn' }, () => act({ type: 'reset' })),
          button(ctx, { label: t('hud.label.help'), icon: 'help', cls: 'cx-rail__btn' }, () => act({ type: 'help', open: !(prev?.helpOpen ?? false) })),
          s.room ? null : button(ctx, { label: t('hud.label.recalibrate'), icon: 'recalibrate', cls: 'cx-rail__btn' }, () => act({ type: 'recalibrate' })),
          soundBtn,
        ]);
        root.append(enter(left, 'right'));
        const fold = button(ctx, { icon: 'sliders', variant: 'icon', cls: 'cx-ctrl-fold' }, () => {
          controlsHidden = !controlsHidden;
          syncFold();
        });
        const right = h('div', 'cx-rail cx-rail--right cx-rail--controls', [fold, controls.el]);
        const syncFold = () => {
          const k = controlsHidden ? 'hud.label.controls_show' : 'hud.label.controls_hide';
          right.classList.toggle('is-folded', controlsHidden);
          fold.setAttribute('aria-expanded', String(!controlsHidden));
          fold.setAttribute('aria-label', t(k));
          fold.title = t(k);
        };
        syncFold();
        root.append(enter(right, 'left'));
        controls.set(ctx.api.getControls());
        break;
      }
      default:
        break;
    }
    return root;
  };

  const renderHud = (s: AppSnapshot) => {
    const isAr = AR_STATES.has(s.state);
    const key = isAr ? `${s.state}:${s.state === 'lock' ? s.lockPhase : ''}` : '';
    if (key !== hudKey) {
      leave(hudEl, 'fade');
      hudEl = null;
      hudKey = key;
      if (key) {
        hudEl = buildHud(s);
        L.hud.append(hudEl);
      }
    }
    if (s.state === 'place') {
      const [k, ic, w] = placeHint(s);
      setHint(k, ic, w);
    }
    if (soundBtn) {
      // Las claves son acciones ("Activar sonido" / "Silenciar"); el ícono muestra el estado actual.
      const k = s.muted ? 'hud.label.sound_on' : 'hud.label.sound_off';
      if (soundBtn.dataset.k !== k) {
        soundBtn.dataset.k = k;
        soundBtn.setAttribute('aria-pressed', String(s.muted));
        soundBtn.setAttribute('aria-label', t(k));
        soundBtn.replaceChildren(icon(s.muted ? 'sound-off' : 'sound-on'), h('span', 'cx-btn__label', [t(k)]));
      }
    }
  };

  // ───────────── velo "Reubicando…" ─────────────
  const veilText = h('span', '', [t('relocating.tip')]);
  const veil = h('div', 'cx-veil', [h('div', 'cx-veil__pill', [h('span', 'cx-spinner'), veilText])]);
  veil.setAttribute('role', 'status');
  veil.setAttribute('aria-live', 'polite');
  L.veil.append(veil);

  // ───────────── sugerencia de recalibrar ─────────────
  const suggest = h('div', 'cx-suggest', [
    h('span', 'cx-suggest__ico', [icon('warn')]),
    h('span', 'cx-suggest__text', [t('recalibrate.tip.suggest')]),
    button(ctx, { label: t('recalibrate.label.do'), icon: 'recalibrate', variant: 'warn' }, () => act({ type: 'recalibrate' })),
  ]);
  L.top.append(suggest);

  // ───────────── inactividad ─────────────
  let idle: { d: DialogParts; num: HTMLElement; text: HTMLElement; bar: HTMLElement; total: number } | null = null;
  const renderIdle = (s: AppSnapshot) => {
    const want = s.idleCountdown !== null;
    if (!want && idle) {
      idle.d.close();
      idle = null;
    }
    if (want && !idle) {
      const d = dialog(L.modal, 'cx-dialog--idle', () => act({ type: 'idle-continue' }));
      const num = h('span', 'cx-idle__num');
      const text = h('p', 'cx-dialog__body');
      const bar = h('span', 'cx-progress__fill cx-idle__fill');
      d.card.append(
        h('h2', 'cx-dialog__title', [t('idle.title')]),
        h('div', 'cx-idle__count', [icon('hand', 'cx-ico cx-idle__ico'), num]),
        text,
        h('div', 'cx-progress__track', [bar]),
        h('div', 'cx-dialog__actions', [button(ctx, { label: t('idle.label.continue'), icon: 'check', variant: 'primary', size: 'xl' }, () => act({ type: 'idle-continue' }))]),
      );
      idle = { d, num, text, bar, total: Math.max(IDLE_DEFAULT_S, s.idleCountdown ?? 0) };
    }
    if (idle && s.idleCountdown !== null) {
      const sec = Math.max(0, Math.ceil(s.idleCountdown));
      const str = String(sec);
      if (idle.num.textContent !== str) {
        idle.num.textContent = str;
        idle.text.textContent = t('idle.tip.countdown', { s: sec });
      }
      idle.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.idleCountdown / idle.total))})`;
    }
  };

  // ───────────── panel de cambio de experiencia ─────────────
  let switcher: DialogParts | null = null;
  let switcherFor: ExperienceId | null = null;
  const renderSwitcher = (s: AppSnapshot) => {
    const want = s.switcherOpen && s.state === 'explore';
    if (switcher && (!want || switcherFor !== s.experience)) {
      switcher.close();
      switcher = null;
    }
    if (!want || switcher) return;
    const d = dialog(L.panels, 'cx-dialog--switcher', () => act({ type: 'switcher', open: false }));
    const list = ctx.api.experiences.map((id, i) => {
      const cur = id === s.experience;
      const soon = SOON.has(id);
      const b = h('button', `cx-mini cx-hit${cur ? ' is-current' : ''}${soon ? ' is-soon' : ''}`, [
        h('div', 'cx-mini__art', [artFor(id)]),
        h('div', 'cx-mini__body', [h('h3', 'cx-mini__title', [t(`home.card.${id}.title`)]), h('p', 'cx-mini__hook', [t(`home.card.${id}.tip`)])]),
        cur ? h('span', 'cx-mini__badge', [icon('check')]) : null,
        soon ? h('span', 'cx-soon', [t('home.label.soon')]) : null,
      ]);
      b.type = 'button';
      b.disabled = soon;
      if (cur) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => {
        if (soon) return;
        ctx.events.emit('sound', { id: 'tap' });
        if (cur) act({ type: 'switcher', open: false });
        else act({ type: 'pick-experience', id });
      });
      return enter(b, 'up', 60 + i * 70);
    });
    d.card.append(
      h('div', 'cx-dialog__head', [
        h('h2', 'cx-dialog__title', [t('switcher.title')]),
        button(ctx, { aria: t('switcher.label.close'), icon: 'close', variant: 'icon' }, () => act({ type: 'switcher', open: false })),
      ]),
      h('div', 'cx-switcher__list', list),
    );
    switcher = d;
    switcherFor = s.experience;
  };

  // ───────────── ayuda ─────────────
  let help: DialogParts | null = null;
  const renderHelp = (s: AppSnapshot) => {
    const want = s.helpOpen && AR_STATES.has(s.state);
    if (help && !want) {
      help.close();
      help = null;
    }
    if (!want || help) return;
    const d = dialog(L.panels, 'cx-dialog--help', () => act({ type: 'help', open: false }));
    const rows: [string, string][] = [
      ['drag', 'help.body.move'],
      ['twist', 'help.body.rotate'],
      ['pinch', 'help.body.scale'],
      ['tap', 'help.body.select'],
    ];
    d.card.append(
      h('div', 'cx-dialog__head', [
        h('h2', 'cx-dialog__title', [t('help.title')]),
        button(ctx, { aria: t('help.label.close'), icon: 'close', variant: 'icon' }, () => act({ type: 'help', open: false })),
      ]),
      h(
        'ul',
        'cx-help__list',
        rows.map(([ic, k], i) => enter(h('li', 'cx-help__row', [h('span', 'cx-help__ico', [icon(ic)]), h('span', '', [t(k)])]), 'left', 60 + i * 60)),
      ),
      h('div', 'cx-dialog__actions', [button(ctx, { label: t('help.label.close'), variant: 'primary' }, () => act({ type: 'help', open: false }))]),
    );
    help = d;
  };

  // ───────────── banner del simulador ─────────────
  const sim = h('div', 'cx-sim', [icon('info'), h('span', '', [t('sim.label.banner')])]);
  L.top.append(sim);

  return {
    render(s: AppSnapshot) {
      renderScreen(s);
      renderIntro(s);
      renderHud(s);
      const ar = AR_STATES.has(s.state);
      veil.classList.toggle('is-on', ar && s.relocating);
      // Modo sala: casi siempre es la tablet recién sacada del soporte.
      const vk = s.room ? 'relocating.tip.room' : 'relocating.tip';
      if (veilText.dataset.k !== vk) {
        veilText.dataset.k = vk;
        veilText.textContent = t(vk);
      }
      suggest.classList.toggle('is-on', ar && s.suggestRecalibrate && s.state !== 'lock');
      renderIdle(s);
      renderSwitcher(s);
      renderHelp(s);
      sim.classList.toggle('is-on', s.simulator);
      prev = s;
    },
    /** Hay controles de experiencia visibles (estado explore). */
    exploring: () => hudKey.startsWith('explore'),
    dispose() {
      intro?.d.close();
      idle?.d.close();
      switcher?.close();
      help?.close();
      leave(screenEl);
      leave(hudEl);
      veil.remove();
      suggest.remove();
      sim.remove();
    },
  };
}
