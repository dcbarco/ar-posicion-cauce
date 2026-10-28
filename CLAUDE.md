# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Mesa CAUCE (`cauce-ar`): web de realidad aumentada **sin marcador** (WebXR `immersive-ar`, sin frameworks AR) para una sola tablet anclada a una mesa de 100 × 70 cm. Vite + TypeScript estricto + Three.js + GSAP. Sitio 100 % estático desplegado en Cloudflare Workers (static assets). Todo el proyecto (código, comentarios, docs, textos) está en español.

El brief completo y vinculante es `Prompt maestro — Mesa CAUCE (WebXR sin marcador).md` (requisitos R1–R3, contratos de la sección 4, estándares de la sección 9, propiedad de archivos por agente). Las decisiones que lo amplían o corrigen (D1–D25) están en `docs/ARQUITECTURA.md` y prevalecen sobre el brief.

## Comandos

Node ≥ 22.12.

```sh
npm run dev            # vite --host en :5173 (predev copia decodificadores Draco/Basis a public/vendor/)
npm run dev:https      # igual, con certificado autofirmado: la tablet entra por https://<IP-wifi>:5173 sin adb
npm run build          # tsc --noEmit && vite build → dist/
npm run typecheck
npm run lint
npm test               # vitest run (tests/contract + tests/sim)
npx vitest run tests/sim/watershed.test.ts      # un archivo
npx vitest run -t "pureza"                       # por nombre
npm run test:e2e       # Playwright contra ?sim=1 (primera vez: npx playwright install chromium)
QA_F2=1 npm run test:e2e                         # activa las pruebas test.fixme de humo F2
npm run models:optimize [-- --build]             # gltf-transform; --build re-ejecuta los scripts procedurales
npm run models:validate                          # valida y reescribe public/models/manifest.json
node tools/models/validate.mjs --check           # valida sin escribir
node tools/models/viewer/serve.mjs [puerto]      # visor de modelos autónomo en :5180
npm run check          # typecheck + lint + test + models:validate — debe pasar antes de integrar
npm run deploy         # build + wrangler deploy
```

Modos por URL: `?sim=1` simulador de escritorio sin XR (mesa virtual orbitable; ratón = toque, rueda = pellizco, Shift+arrastre = girar; el Table Lock se da por hecho); `?ui=1` página de componentes de la UI (`src/ui/playground.ts`); `?sala=1` modo sala (D25: la sesión AR y la calibración se conservan entre visitantes; el operador calibra desde HOME manteniendo el logo 3 s). En dev, `window.__cauce` expone `app`, `getState()`, `renderer` y `scene` (lo usan las pruebas e2e).

En la tablet: `adb reverse tcp:5173 tcp:5173` y abrir `http://localhost:5173` en Chrome; depurar con `chrome://inspect`.

## Arquitectura

- **Arranque:** `src/main.ts` construye `App` (`src/core/app.ts`) inyectándole `createUi()` (`src/ui`), `createFxKit` (`src/fx`) y `createAudioKit()` (`src/audio`). `App` es el orquestador: renderer, escena, máquina de estados HOME → INTRO → SCAN → LOCK → PLACE → EXPLORE, sesión XR o `DesktopSim`, gestos, salud del tracking e inactividad.
- **Contratos:** `src/core/contracts.ts` (con `CONTRACT_VERSION`) define `Experience`, `ExperienceContext`, `ControlSpec`, `GestureEvent`, `AppEvents`, `UiApi`/`UiModule`, `FxKit`, `AudioKit` y el formato del manifiesto de modelos. Núcleo ↔ UI se comunican **solo** por eventos tipados y `UiApi` (D3): la UI nunca importa lógica de experiencias y las experiencias nunca tocan el DOM; declaran sus controles con `getControls()` y la UI decide cómo pintarlos.
- **Marco "mesa local":** todo el contenido cuelga de `tableFrame` (pose del `XRAnchor` del Table Lock). Origen en el centro del tope, +X a lo largo de 1,00 m, +Z a lo largo de 0,70 m, +Y arriba, metros. `src/core/table/spec.ts` (`TABLE`) es la única fuente de verdad de la mesa; `bounds.ts` limita al área útil.
- **Gestos (D5/D6):** el núcleo convierte punteros en rayos en el marco local y llama `experience.onGesture`; si devuelve `true` los consumió, si no el núcleo aplica mover/girar/escalar por defecto. Arrastrar desde una bandeja llega como `ui:tray-drag` → `GestureEvent` con `fromTray`.
- **Experiencias:** `src/experiences/registry.ts` mapea `taller | cuenca | cosmos` a fábricas con import dinámico. Hoy solo Taller tiene lógica real; Cuenca y Cosmos usan `MockExperience`. Lógica en `experiences/<exp>/logic/`, coreografías en `experiences/<exp>/anim/`. Los pesos de Cuenca viven en `experiences/cuenca/logic/rules.json`.
- **Lógica pura:** `src/core/sim/**` (`nbody.ts`, `watershed.ts`) y `src/core/table/{spec,bounds}.ts` no pueden importar `three`, `gsap`, `ui/`, `fx/`, `audio/` ni usar `document`/`window`/`navigator`, ni siquiera transitivamente — lo hace cumplir `tests/contract/purity.test.ts`.
- **Modelos:** fuentes en `assets-src/`, scripts procedurales en `tools/models/build/`, registro en `tools/models/models.config.json` (límites de triángulos, tamaño, explosión). `optimize.mjs` → `public/models/**/*.glb`; `validate.mjs` verifica nombres (`part_*`, `pivot_*`, `anchor_*`, `anim_*`), `extras` y licencia y genera `public/models/manifest.json` (distinto del manifiesto PWA, D10). Las claves de texto de piezas siguen D16: `exp.<exp>.<modelo>.title.<partId>` / `.body.<partId>`.
- **Textos:** todo texto visible sale de `src/content/es/*.json` vía `t('clave')` (`src/core/i18n.ts`). El tipo de una clave es su primer segmento `title|label|tip|body|modal` (D11), con límites 36/28/90/160/220 en `src/content/schema.json`. `tests/contract/no-hardcoded-text.test.ts` falla si se asigna texto literal a `textContent`, `aria-label`, etc.; `content-keys.test.ts` comprueba existencia y longitudes. Clave faltante: `⟦clave⟧` en dev, `''` en producción (D12).

## Reglas que el código asume

- Sin asignaciones en bucles por frame: reutiliza vectores/matrices temporales a nivel de módulo (patrón `_v`, `_ray` de `app.ts`). Toda `Experience` implementa `dispose()` completo.
- Versiones de dependencias fijadas exactas (D2); no usar rangos.
- Propiedad por carpetas (sección 4 del brief): cambios a `core/contracts.ts` se piden en `docs/PEDIDOS-DE-CONTRATO.md`. Cada agente deja 3 líneas en `docs/bitacora/agente-<n>.md` al terminar una tarea. Bugs en `docs/BUGS.md` (S1/S2/S3); `it.fails('BUG-xxx …')` documenta un bug abierto.
- Animaciones nuevas se registran en `docs/ANIMACION.md`.
- Los archivos tienen acentos y ñ en UTF-8: no editarlos con `Get-Content`/`Set-Content` de PowerShell (produce mojibake); usar las herramientas de edición o `node:fs`.
