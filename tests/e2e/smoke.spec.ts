// Humo en simulador (brief, sección 14: F0 y esqueleto F2).
// Requiere el gancho de desarrollo `window.__cauce` (src/main.ts, solo en DEV; pedido P-004):
//   { app: { events: TypedEmitter<AppEvents> }, getState(): AppSnapshot, renderer: THREE.WebGLRenderer, scene }
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import type { AppSnapshot, AppState, ExperienceId, UiAction } from '../../src/core/contracts';

/** Presupuesto (sección 3). */
const MAX_TRIANGLES = 300_000;
const MAX_CALLS = 120;
/** Crecimiento de heap tolerado tras 10 cambios de experiencia (tras gc). */
const MAX_HEAP_GROWTH_MB = 8;

/** Mensajes de consola que no cuentan como error del producto. */
const IGNORED_CONSOLE = [/favicon\.ico/i];

interface Collected {
  errors: string[];
}

function watchConsole(page: Page): Collected {
  const c: Collected = { errors: [] };
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    c.errors.push(`[console.error] ${text}`);
  });
  page.on('pageerror', (e) => c.errors.push(`[pageerror] ${e.message}`));
  return c;
}

/** Estado actual leído del gancho (null si aún no existe). */
async function getState(page: Page): Promise<AppSnapshot | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __cauce?: { getState(): unknown } };
    return w.__cauce ? (w.__cauce.getState() as never) : null;
  });
}

async function waitForState(page: Page, states: AppState[], timeout = 20_000): Promise<AppSnapshot> {
  try {
    await page.waitForFunction(
      (wanted: string[]) => {
        const w = window as unknown as { __cauce?: { getState(): { state: string } } };
        return Boolean(w.__cauce && wanted.includes(w.__cauce.getState().state));
      },
      states as string[],
      { timeout },
    );
  } catch (e) {
    const s = await getState(page).catch(() => null);
    throw new Error(
      `no se llegó a [${states.join('|')}] en ${timeout} ms; estado actual: ${s ? JSON.stringify({ state: s.state, experience: s.experience, loadProgress: s.loadProgress, relocating: s.relocating }) : 'sin __cauce'}`,
      { cause: e },
    );
  }
  return (await getState(page)) as AppSnapshot;
}

async function act(page: Page, action: UiAction): Promise<void> {
  await page.evaluate((a) => {
    const w = window as unknown as { __cauce: { app: { events: { emit(type: string, p: unknown): void } } } };
    w.__cauce.app.events.emit('ui:action', a);
  }, action);
}

async function rendererInfo(page: Page): Promise<{ triangles: number; calls: number; geometries: number; textures: number }> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __cauce: { renderer: { info: { render: { triangles: number; calls: number }; memory: { geometries: number; textures: number } } } };
    };
    const i = w.__cauce.renderer.info;
    return { triangles: i.render.triangles, calls: i.render.calls, geometries: i.memory.geometries, textures: i.memory.textures };
  });
}

async function heapMB(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const g = (globalThis as unknown as { gc?: () => void }).gc;
    for (let i = 0; i < 3; i++) {
      g?.();
      await new Promise((r) => setTimeout(r, 100));
    }
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return mem ? mem.usedJSHeapSize / (1024 * 1024) : null;
  });
}

/** Toca el centro del tope en el simulador (la cámara mira la mesa; el centro del lienzo cae sobre ella). */
async function tapTableCenter(page: Page): Promise<void> {
  const box = await page.locator('#gesture-layer').boundingBox();
  if (!box) throw new Error('no hay #gesture-layer');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // Como una persona: mover el puntero, dejar que la retícula se asiente (suavizado ~0,25/frame) y tocar.
  await page.mouse.move(x - 20, y - 20);
  await page.mouse.move(x, y, { steps: 5 });
  await page.waitForTimeout(400);
  await page.mouse.click(x, y);
}

async function enterExperience(page: Page, id: ExperienceId): Promise<void> {
  const s = await getState(page);
  if (s?.state === 'explore' || s?.state === 'place') {
    await act(page, { type: 'pick-experience', id });
  } else {
    await act(page, { type: 'pick-experience', id });
    await page.waitForFunction(
      () => (window as unknown as { __cauce: { getState(): { loadProgress: number } } }).__cauce.getState().loadProgress >= 1,
    );
    await act(page, { type: 'enter-ar' });
  }
  await waitForState(page, ['place']);
  await page.waitForFunction(
    () => (window as unknown as { __cauce: { getState(): { loadProgress: number } } }).__cauce.getState().loadProgress >= 1,
  );
  await tapTableCenter(page);
  const st = await waitForState(page, ['explore']);
  expect(st.experience).toBe(id);
}

/** Abre el simulador y falla con un mensaje claro si Vite muestra su overlay de error de compilación. */
async function gotoSim(page: Page): Promise<void> {
  await page.goto('/?sim=1');
  await page.waitForLoadState('load');
  const overlay = page.locator('vite-error-overlay');
  await page.waitForTimeout(300);
  if (await overlay.count()) {
    const msg = await overlay.evaluate((el) => el.shadowRoot?.querySelector('.message')?.textContent ?? 'error de Vite');
    throw new Error(`Vite no compila la app: ${msg}`);
  }
}

test.describe('humo F0 — simulador', () => {
  test('abre /?sim=1 sin errores y llega a HOME (o EXPLORE)', async ({ page }) => {
    const c = watchConsole(page);
    await gotoSim(page);
    await expect
      .poll(() => page.evaluate(() => Boolean((window as unknown as { __cauce?: unknown }).__cauce)), {
        message: 'falta window.__cauce (gancho de dev, P-004)',
      })
      .toBe(true);
    const s = await waitForState(page, ['home', 'explore']);
    expect(s.simulator).toBe(true);
    expect(s.state).not.toBe('operator');
    // Dejar correr unos frames: errores tardíos (shaders, texturas) también cuentan.
    await page.waitForTimeout(1500);
    const info = await rendererInfo(page);
    expect(info.triangles).toBeLessThanOrEqual(MAX_TRIANGLES);
    expect(info.calls).toBeLessThanOrEqual(MAX_CALLS);
    expect(c.errors).toEqual([]);
  });

  test('ninguna clave de texto falta en HOME (sin ⟦clave⟧ visibles)', async ({ page }) => {
    await gotoSim(page);
    await waitForState(page, ['home', 'explore']);
    await expect(page.locator('body')).not.toContainText('⟦');
  });
});

test.describe('humo F2 — experiencias en simulador', () => {
  // Se activa cuando existan las experiencias reales (F2). Para probar ya contra la MockExperience: QA_F2=1.
  test.fixme(!process.env.QA_F2, 'pendiente hasta F2 (Taller, Cosmos, Cuenca reales)');

  test('entra a cada experiencia y respeta el presupuesto de renderer.info', async ({ page }) => {
    const c = watchConsole(page);
    await gotoSim(page);
    await waitForState(page, ['home']);
    for (const id of ['taller', 'cosmos', 'cuenca'] as const) {
      await enterExperience(page, id);
      await page.waitForTimeout(1500);
      const info = await rendererInfo(page);
      expect(info.triangles, `${id}: triángulos`).toBeLessThanOrEqual(MAX_TRIANGLES);
      expect(info.calls, `${id}: draw calls`).toBeLessThanOrEqual(MAX_CALLS);
    }
    await expect(page.locator('body')).not.toContainText('⟦');
    expect(c.errors).toEqual([]);
  });

  test('cambiar de experiencia 10 veces: memoria estable y sin fugas de GPU', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'performance.memory solo existe en Chromium');
    test.setTimeout(240_000); // 12 colocaciones con WebGL por software
    const c = watchConsole(page);
    await gotoSim(page);
    await waitForState(page, ['home']);
    const order: ExperienceId[] = ['taller', 'cosmos', 'cuenca'];
    await enterExperience(page, 'taller');
    await page.waitForTimeout(1000);
    const heap0 = await heapMB(page);
    const gpu0 = await rendererInfo(page);
    for (let i = 1; i <= 10; i++) {
      await enterExperience(page, order[i % order.length] as ExperienceId);
      await page.waitForTimeout(500);
      const info = await rendererInfo(page);
      expect(info.triangles).toBeLessThanOrEqual(MAX_TRIANGLES);
      expect(info.calls).toBeLessThanOrEqual(MAX_CALLS);
    }
    // Volver a la misma experiencia del inicio para comparar manzanas con manzanas.
    await enterExperience(page, 'taller');
    await page.waitForTimeout(1000);
    const heap1 = await heapMB(page);
    const gpu1 = await rendererInfo(page);
    if (heap0 !== null && heap1 !== null) expect(heap1 - heap0, 'crecimiento de heap (MB)').toBeLessThan(MAX_HEAP_GROWTH_MB);
    expect(gpu1.geometries, 'geometrías vivas').toBeLessThanOrEqual(gpu0.geometries);
    expect(gpu1.textures, 'texturas vivas').toBeLessThanOrEqual(gpu0.textures);
    expect(c.errors).toEqual([]);
  });

  test.fixme('Taller: interacciones obligatorias (explosión, selección, funcionar, rayos X/corte, armado, cauce)', async () => {});
  test.fixme('Cosmos: colocar, honda, masa, rejilla, tiempo, telemetría, retos', async () => {});
  test.fixme('Cuenca: fichas, clima, time-lapse con informe, capas, ver cuenca', async () => {});
  test.fixme('inactividad: 60 s + 10 s vuelve a HOME limpio (con reloj simulado)', async () => {});
});
