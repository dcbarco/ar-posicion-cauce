# Bitácora — Agente 1

- 2026-10-26 · Hice: F0 (Vite+TS+three, contratos 0.1.0, spec/bounds, i18n, cargador GLB Meshopt/Draco/KTX2, simulador `?sim=1`, MockExperience) y núcleo F1 en código (sesión XR, Table Lock con ancla, TableTwin, rayo–plano, gestos, histéresis de tracking, inactividad, cambio sin recalibrar). Humo en simulador OK (10 cambios, memoria estable).
- Sigue: despliegue en Cloudflare (falta `wrangler login`), prueba en tablet n.º 1, PWA/service worker, light-estimation, lógica de Taller (F2).
- Necesito: A3 → UI real + FX; A2 → motor4t en el manifiesto; A5 → pruebas de `tracking-health.ts`, `idle.ts`, `lock.ts` (nudgeLocal/yawFacing) y `placement.ts`.

- 2026-10-27 · Hice: `startXrSession` sale de la pantalla completa del navegador antes de pedir la sesión (chocaba con el DOM Overlay: sin retícula, rectángulo ni modelo) y la restaura al terminar.
- Sigue: confirmar en la tablet que con pantalla completa activa se ven retícula, rectángulo y modelo.
- Necesito: nada.

- 2026-10-27 · Hice: revertí la reorientación D19 (yawFacing −X, D-pad, giro −90° del Taller, cámara del simulador) a lo del commit 7fc6746: tras ella no se veían retícula, rectángulo ni modelo en la tablet. Añadí `?diag=1`.
- Sigue: confirmar en la tablet que vuelve a verse todo.
- Necesito: nada.

- 2026-10-27 · Hice: escaneo tolerante (los fallos del hit-test restan, no reinician), retícula sobre el último plano visto cuando el hit-test parpadea, y a los 6 s sin superficie se estima el tope 0,45 m bajo la tablet para poder calibrar igual. Panel de diagnóstico activo por defecto en dev en la tablet.
- Sigue: validar en la tablet; si el plano estimado queda mal de altura, pedir local-floor + TABLE.height.
- Necesito: nada.

- 2026-10-27 · Hice: causa real de "no se ve retícula/borde/modelo": al entrar a XR cambia la base de tiempo, el primer dt salía negativo y enorme y damp() dejaba las opacidades en NaN (se dibujaban invisibles). dt acotado a (0,100] ms en App.onFrame y damp() blindado; prueba tests/sim/damp.test.ts.
- Sigue: confirmar en la tablet; quitar el panel de diagnóstico por defecto cuando esté estable.
- Necesito: nada.

- 2026-10-27 · Hice: prueba E2E del camino AR real con WebXR simulado (`tests/e2e/xr-mock.ts`, `xr.spec.ts`; `E2E_URL=https://localhost:5173` reutiliza `dev:https`): pasa, con o sin desfase de reloj. Las fotos de la tablet muestran retícula y borde "vis" con draw calls, pero nada en pantalla → composición. Forcé XRWebGLLayer en vez de WebXR Layers (`withClassicLayer`), y añadí al diagnóstico opacidades, tipo de capa, versión de Chrome y un cubo testigo magenta.
- Sigue: prueba en la tablet (cubo magenta, línea `capa`); si con `?xrlayers=1` falla y sin él funciona, queda confirmado.
- Necesito: nada.

- 2026-10-28 · Hice: BUG-009 confirmado y cerrado en la tablet (D23). Deriva de altura con corrección automática (D22: `createHeightDrift`, `TableLock.adjustHeight`, el aviso de recalibrar solo con > 8 cm × 4 s o tracking perdido > 12 s, y se retira solo); prueba `tests/sim/height-drift.test.ts`. Panel de diagnóstico solo con `?diag=1`.
- Sigue: probar en la tablet moviéndose rápido alrededor de la mesa; commit en una rama.
- Necesito: nada.

- 2026-10-28 · Hice: modo sala `?sala=1` (D25, contrato 0.1.2: `AppSnapshot.room/xrActive/tableReady`): salir o la inactividad vuelven a HOME sin cerrar la sesión AR ni soltar el ancla; el siguiente visitante va directo a PLACE; tracking y deriva solo se vigilan en estados AR; `recalibrate` desde HOME (operador) calibra y vuelve a HOME. Prueba e2e nueva en `tests/e2e/xr.spec.ts` (el mock acepta `lost` y cuenta sesiones).
- Sigue: probar en la tablet que ARCore recupera el ancla al sacar la tablet del soporte tras varios minutos, y la temperatura con la cámara encendida todo el día.
- Necesito: nada.
