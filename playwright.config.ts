// Playwright (Agente 5): humo en escritorio con el modo simulador (?sim=1).
// Uso: `npm run test:e2e` (arranca `npm run dev` en :5173 o reutiliza uno abierto).
// Primera vez: `npx playwright install chromium`.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          args: [
            // WebGL por software en headless/CI, sin el aviso de "fallback" automático.
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            // performance.memory preciso y gc() para la prueba de memoria (F2).
            '--enable-precise-memory-info',
            '--js-flags=--expose-gc',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
