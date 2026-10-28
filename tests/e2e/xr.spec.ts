// Camino AR real (sin ?sim=1) con una sesión WebXR simulada (xr-mock.ts): HOME → Taller → escaneo →
// Table Lock (apuntar, ajustar, confirmar con XRAnchor) → colocar → explorar. Comprueba que retícula,
// borde de la mesa y modelo quedan visibles y con opacidad finita, también cuando el reloj de los
// frames XR va desfasado respecto al de la página (BUG-009).
import { expect, test, type Page } from '@playwright/test';
import type { AppSnapshot, UiAction } from '../../src/core/contracts';
import { installXrMock, type XrMockOptions } from './xr-mock';

const BASE: XrMockOptions = { timeOffsetMs: 0, tableY: -0.45, pitch: -0.9, hits: true };

interface Probe {
  state: AppSnapshot;
  diag: Record<string, string>;
  reticles: { parent: string; visible: boolean; opacity: number }[];
  edge: { visible: boolean; opacity: number } | null;
  model: { visible: boolean; scale: number; meshes: number } | null;
  xrFrames: number;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    interface O {
      name: string;
      visible: boolean;
      parent: O | null;
      children: O[];
      scale: { x: number };
      isMesh?: boolean;
      material?: { opacity: number; uniforms?: Record<string, { value: number }> };
      traverse(cb: (o: O) => void): void;
    }
    const w = window as unknown as {
      __cauce: { app: { getState(): AppSnapshot; diagnostics(): Record<string, string> }; scene: O };
      __xrMock: { frames: number };
    };
    const { app, scene } = w.__cauce;
    const out: Probe = { state: app.getState(), diag: app.diagnostics(), reticles: [], edge: null, model: null, xrFrames: w.__xrMock.frames };
    scene.traverse((o) => {
      if (o.name === 'fx:reticle') {
        let op = 0;
        for (const c of o.children) op = Math.max(op, c.material?.opacity ?? 0);
        out.reticles.push({ parent: o.parent?.name ?? '', visible: o.visible, opacity: op });
      }
      if (o.name === 'fx:table-edge') out.edge = { visible: o.visible, opacity: o.material?.uniforms?.uOpacity?.value ?? NaN };
      if (o.name.startsWith('exp-')) {
        let meshes = 0;
        o.traverse((c) => void (c.isMesh && meshes++));
        out.model = { visible: o.visible, scale: o.scale.x, meshes };
      }
    });
    return out;
  });
}

async function act(page: Page, action: UiAction): Promise<void> {
  await page.evaluate((a) => {
    const w = window as unknown as { __cauce: { app: { events: { emit(type: string, p: unknown): void } } } };
    w.__cauce.app.events.emit('ui:action', a);
  }, action);
}

async function until(page: Page, fn: (s: AppSnapshot) => boolean, what: string, timeout = 15_000): Promise<Probe> {
  const t0 = Date.now();
  for (;;) {
    const p = await probe(page);
    if (fn(p.state)) return p;
    if (Date.now() - t0 > timeout) throw new Error(`no se llegó a ${what}; diag:\n${JSON.stringify(p.diag, null, 1)}`);
    await page.waitForTimeout(100);
  }
}

async function tapCenter(page: Page): Promise<void> {
  const box = (await page.locator('#gesture-layer').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

for (const [label, timeOffsetMs] of [
  ['reloj XR igual al de la página', 0],
  ['reloj XR atrasado 190 s (BUG-009)', -190_000],
  ['reloj XR adelantado 1000 s', 1_000_000],
] as const) {
  test(`AR simulado: calibrar la mesa y colocar el Taller — ${label}`, async ({ page }, info) => {
    test.setTimeout(150_000); // carga del Taller + recorrido completo con WebGL por software
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.addInitScript(installXrMock, { ...BASE, timeOffsetMs });
    await page.goto('/?diag=1');
    await until(page, (s) => s.state === 'home', 'HOME');

    await act(page, { type: 'pick-experience', id: 'taller' });
    await until(page, (s) => s.loadProgress >= 1, 'carga del Taller', 30_000);
    await act(page, { type: 'enter-ar' });

    // Escaneo → lock (el hit-test encuentra el tope desde el primer frame).
    await until(page, (s) => s.state === 'lock', 'LOCK');
    await page.waitForTimeout(600);
    let p = await probe(page);
    await page.screenshot({ path: info.outputPath('1-lock-aim.png') });
    const lockRet = p.reticles.find((r) => r.parent === '');
    expect(lockRet?.visible, 'retícula del lock visible').toBe(true);
    expect(lockRet?.opacity, 'opacidad de la retícula del lock').toBeGreaterThan(0.5);

    // Apuntar y tocar: aparece el rectángulo de la mesa.
    await tapCenter(page);
    await until(page, (s) => s.lockPhase === 'adjust', 'ajuste del lock');
    await page.waitForTimeout(800);
    p = await probe(page);
    await page.screenshot({ path: info.outputPath('2-lock-adjust.png') });
    expect(p.edge?.visible, 'borde de la mesa visible').toBe(true);
    expect(p.edge?.opacity, 'opacidad del borde').toBeGreaterThan(0.3);

    await act(page, { type: 'lock-confirm' });
    await until(page, (s) => s.state === 'place', 'PLACE');
    await page.waitForTimeout(800);
    p = await probe(page);
    await page.screenshot({ path: info.outputPath('3-place.png') });
    expect(p.diag.mesa, 'ancla creada').toContain('ancla=true');
    const placeRet = p.reticles.find((r) => r.parent === 'tableFrame');
    expect(p.state.reticle, 'retícula de colocación en verde').toBe('ok');
    expect(placeRet?.opacity, 'opacidad de la retícula de colocación').toBeGreaterThan(0.5);

    await tapCenter(page);
    await until(page, (s) => s.state === 'explore', 'EXPLORE');
    await page.waitForTimeout(2000);
    p = await probe(page);
    await page.screenshot({ path: info.outputPath('4-explore.png') });
    expect(p.model?.visible, 'modelo visible').toBe(true);
    expect(p.model?.meshes, 'mallas del modelo').toBeGreaterThan(0);
    expect(p.model?.scale, 'escala del modelo tras aparecer').toBeCloseTo(1, 2);
    expect(p.edge?.opacity, 'borde en reposo').toBeGreaterThan(0.05);
    expect(p.diag.tracking, 'tracking').toContain('perdido=false');
    expect(errors).toEqual([]);
  });
}

// Modo sala (?sala=1, D25): se calibra una vez y la calibración sirve al siguiente visitante, aunque la
// tablet haya descansado en el soporte (sin tracking) más que el umbral de recalibrar.
test('AR simulado, modo sala: el siguiente visitante no recalibra', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(installXrMock, BASE);
  await page.goto('/?sala=1&diag=1');
  await until(page, (s) => s.state === 'home', 'HOME');
  const mock = (fn: string) => page.evaluate(fn);

  // Primer visitante (o el operador): recorrido completo con calibración.
  await act(page, { type: 'pick-experience', id: 'taller' });
  await until(page, (s) => s.loadProgress >= 1, 'carga del Taller', 30_000);
  await act(page, { type: 'enter-ar' });
  await until(page, (s) => s.state === 'lock', 'LOCK');
  await page.waitForTimeout(600);
  await tapCenter(page);
  await until(page, (s) => s.lockPhase === 'adjust', 'ajuste del lock');
  await act(page, { type: 'lock-confirm' });
  await until(page, (s) => s.state === 'place', 'PLACE');
  await page.waitForTimeout(800);
  await tapCenter(page);
  await until(page, (s) => s.state === 'explore', 'EXPLORE');

  // Sale: vuelve a HOME con la sesión AR abierta y la mesa calibrada.
  await act(page, { type: 'exit' });
  let p = await until(page, (s) => s.state === 'home', 'HOME tras salir');
  expect(p.state.xrActive, 'sesión AR sigue abierta').toBe(true);
  expect(p.state.tableReady, 'mesa lista').toBe(true);
  expect(p.diag.mesa, 'ancla conservada').toContain('ancla=true');

  // La tablet descansa en el soporte sin ver la mesa más que el umbral de recalibrar (12 s).
  await mock('window.__xrMock.opts.lost = true');
  await page.waitForTimeout(13_000);
  p = await probe(page);
  expect(p.state.state, 'sigue en HOME').toBe('home');
  expect(p.state.suggestRecalibrate, 'sin aviso de recalibrar en HOME').toBe(false);
  await page.screenshot({ path: info.outputPath('sala-1-home.png') });

  // Siguiente visitante: elige, entra y va directo a ubicar (sin escaneo ni rectángulo).
  await act(page, { type: 'pick-experience', id: 'taller' });
  await until(page, (s) => s.state === 'intro' && s.loadProgress >= 1, 'carga del Taller (2)', 30_000);
  await act(page, { type: 'enter-ar' });
  p = await until(page, (s) => s.state !== 'intro', 'entrar (2)');
  expect(p.state.state, 'directo a PLACE').toBe('place');
  expect(p.state.suggestRecalibrate, 'sin aviso al entrar').toBe(false);
  await until(page, (s) => s.relocating, 'velo mientras no ve la mesa');
  await mock('window.__xrMock.opts.lost = false');
  await until(page, (s) => !s.relocating, 'tracking recuperado');
  await page.waitForTimeout(800);
  await tapCenter(page);
  await until(page, (s) => s.state === 'explore', 'EXPLORE (2)');
  await page.waitForTimeout(1500);
  p = await probe(page);
  await page.screenshot({ path: info.outputPath('sala-2-explore.png') });
  expect(p.model?.visible, 'modelo visible').toBe(true);
  expect(p.state.suggestRecalibrate, 'sin aviso de recalibrar').toBe(false);

  // Operador: recalibrar desde HOME (gesto oculto del logo) y volver a HOME con la mesa lista.
  await act(page, { type: 'exit' });
  await until(page, (s) => s.state === 'home', 'HOME (3)');
  await act(page, { type: 'recalibrate' });
  await until(page, (s) => s.state === 'lock', 'LOCK del operador');
  await page.waitForTimeout(600);
  await tapCenter(page);
  await until(page, (s) => s.lockPhase === 'adjust', 'ajuste del operador');
  await act(page, { type: 'lock-confirm' });
  await until(page, (s) => s.state === 'home' && s.tableReady, 'HOME con la mesa recalibrada');

  expect(await mock('window.__xrMock.sessions'), 'una sola sesión AR en todo el recorrido').toBe(1);
  expect(errors).toEqual([]);
});
