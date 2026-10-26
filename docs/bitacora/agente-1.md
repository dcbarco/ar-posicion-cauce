# Bitácora — Agente 1

- 2026-10-26 · Hice: F0 (Vite+TS+three, contratos 0.1.0, spec/bounds, i18n, cargador GLB Meshopt/Draco/KTX2, simulador `?sim=1`, MockExperience) y núcleo F1 en código (sesión XR, Table Lock con ancla, TableTwin, rayo–plano, gestos, histéresis de tracking, inactividad, cambio sin recalibrar). Humo en simulador OK (10 cambios, memoria estable).
- Sigue: despliegue en Cloudflare (falta `wrangler login`), prueba en tablet n.º 1, PWA/service worker, light-estimation, lógica de Taller (F2).
- Necesito: A3 → UI real + FX; A2 → motor4t en el manifiesto; A5 → pruebas de `tracking-health.ts`, `idle.ts`, `lock.ts` (nudgeLocal/yawFacing) y `placement.ts`.
