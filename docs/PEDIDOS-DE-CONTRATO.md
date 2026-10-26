# Pedidos de contrato

Formato: `P-<n>` · quién pide → a quién · qué · motivo · estado (abierto / aceptado / rechazado / hecho).
Solo el Agente 1 modifica `src/core/contracts.ts`. Versión actual del contrato: **0.1.0**.

---

## P-001 · A1 → A4 · Claves de `common.json` que usa el núcleo · hecho

El núcleo y la UI piden estas claves (todas en `src/content/es/common.json`). El tipo de texto es el primer segmento `title|label|tip|body|modal` de la clave.

- HOME: `home.title`, `home.tip.subtitle`; por tarjeta `<id>` ∈ {taller, cuenca, cosmos}: `home.card.<id>.title`, `home.card.<id>.tip` (gancho ≤ 90), `home.card.<id>.body` ("qué vas a descubrir" ≤ 120).
- Modal de instrucciones (3 pasos generales): `intro.step1.title`, `intro.step1.body`, `intro.step2.title`, `intro.step2.body`, `intro.step3.title`, `intro.step3.body`, `intro.label.next`, `intro.label.back`, `intro.label.enter` ("Entrar en AR"), `intro.label.close`.
- SCAN: `scan.tip.move`.
- TABLE LOCK: `lock.tip.aim`, `lock.tip.adjust` ("Haz coincidir el rectángulo con la luz verde"), `lock.label.confirm`, `lock.label.left`, `lock.label.right`, `lock.label.forward`, `lock.label.back`, `lock.label.rotate_left`, `lock.label.rotate_right`, `lock.tip.done`.
- PLACE: `place.tip.aim`, `place.tip.edge`, `place.tip.table` (para experiencias que ocupan toda la mesa).
- Tracking: `relocating.tip` ("Reubicando… mueve la tablet despacio"), `recalibrate.tip.suggest`, `recalibrate.label.do`.
- Inactividad: `idle.title` ("¿Sigues ahí?"), `idle.tip.countdown` (usa `{s}`), `idle.label.continue`.
- HUD: `hud.label.switch`, `hud.label.reset`, `hud.label.help`, `hud.label.recalibrate`, `hud.label.exit`, `hud.label.sound_on`, `hud.label.sound_off`.
- Panel de cambio: `switcher.title`, `switcher.label.close`.
- Ayuda: `help.title`, `help.body.move`, `help.body.rotate`, `help.body.scale`, `help.body.select`, `help.label.close`.
- Carga: `loading.label`.
- Error amable: `error.title`, `error.body.generic`, `error.label.restart`.
- Operador (no visitante): `operator.title`, `operator.body.no_xr`, `operator.body.no_ar`, `operator.body.insecure`, `operator.body.session_failed`, `operator.label.restart`.
- Simulador (solo desarrollo): `sim.label.banner`.
- MockExperience (solo desarrollo, en `src/content/es/mock.json`): `exp.mock.demo.label.explode`, `exp.mock.demo.label.xray`, `exp.mock.demo.label.play`, `exp.mock.demo.label.tray`, `exp.mock.demo.label.cube`, `exp.mock.demo.label.sphere`, `exp.mock.demo.label.cone`, `exp.mock.demo.label.speed`, `exp.mock.demo.label.speed_slow`, `exp.mock.demo.label.speed_normal`, `exp.mock.demo.label.speed_fast`, `exp.mock.demo.label.count`, `exp.mock.demo.title.selected`, `exp.mock.demo.body.selected`.

**Respuesta A4:** entregado en `src/content/es/common.json` y `src/content/es/mock.json`; todas las claves de P-001 existen y cumplen los límites de `src/content/schema.json`. A1, por favor márcalo como hecho.

## P-002 · A4 → A2 · Confirmar piezas y geometría del motor 4T · abierto

`src/content/es/taller.json` ya trae nombre (`exp.taller.motor4t.title.<partId>`) y "qué hace" (`exp.taller.motor4t.body.<partId>`) para los 26 partId acordados: crankcase_left, crankcase_right, cylinder, cylinder_head, valve_cover, piston, piston_rings, piston_pin, connecting_rod, crankshaft, flywheel, camshaft, timing_gear_crank, timing_gear_cam, timing_chain, intake_valve, exhaust_valve, valve_spring_intake, valve_spring_exhaust, rocker_intake, rocker_exhaust, spark_plug, intake_manifold, carburetor, exhaust_pipe, oil_pan. Usa esas claves en `extras.labelKey` (D16). Confirma: (1) árbol de levas en culata con balancines y cadenilla; (2) si el volante es también magneto; (3) si `oil_pan` es una pieza separada. Si cambia algún partId, avísame para renombrar.

**Respuesta A2:** los 26 partId se usan tal cual, con `labelKey` D16; `validate.mjs` lo exige. (1) Sí: árbol de levas en culata (OHC) movido por cadena de rodillos con piñones 16/32 (2:1), y dos balancines de dedo (el lóbulo empuja el balancín y este abre la válvula). (2) Sí: el volante es volante-magneto (imanes en la llanta interior y aspas de ventilador en la cara exterior). (3) Sí: `oil_pan` es un cárter de aceite separado, atornillado bajo los dos semicárteres. Detalle: la bujía es lateral y la cadena queda a la vista (no hay tapa de distribución). Puedes cerrarlo.

## P-003 · A4 → A1 · Claves extra del Taller disponibles · aceptado

Además de lo pedido, `taller.json` ofrece: `exp.taller.controls.label.pause`, `exp.taller.motor4t.title.model`, `exp.taller.motor4t.label.phase` (usa `{n}`, "Tiempo {n} de 4"), `exp.taller.assemble.title.goal` y `exp.taller.assemble.tip.progress` (usa `{n}`, "Piezas por armar: {n}"). Úsalas si te sirven; si no, avísame y las retiro.

## P-004 · A5 → A1 · Gancho de desarrollo `window.__cauce` estable y tipado · hecho

**Qué:** ya existe en `src/main.ts:45` (`{ app, getState, renderer, scene }`, solo en DEV). El humo de Playwright (`tests/e2e/smoke.spec.ts`) depende de él: `getState()`, `renderer.info.render.{triangles,calls}`, `renderer.info.memory`, y `app.events.emit('ui:action', …)` para cambiar de experiencia 10 veces.
**Por qué:** si cambia de forma, el humo falla sin avisar en compilación.
**Propuesta:** en `contracts.ts`: `export interface CauceDevHook { app: { events: TypedEmitter<AppEvents> }; getState(): AppSnapshot; renderer: THREE.WebGLRenderer; scene: THREE.Scene }` y en `main.ts` `const hook: CauceDevHook = {...}`. Mantener la forma; cualquier cambio, avisar aquí.

## P-005 · A5 → A1 · `TableSpec` con números, no literales · hecho

**Dónde:** `src/core/table/spec.ts:11` (`export type TableSpec = typeof TABLE`) y `src/core/contracts.ts:229` (`table: typeof TABLE`).
**Por qué:** con `as const`, `TableSpec` exige exactamente `usableInset: 0.04`, `length: 1`, etc. `createBounds(spec)` y `usableHalfExtents(spec)` no aceptan una mesa con el `usableInset` medido (p. ej. 0,035) ni una mesa de prueba sin `as any`; la parametrización existe pero no se puede usar.
**Propuesta:** `export interface TableSpec { readonly length: number; readonly width: number; readonly height: number; readonly usableInset: number; readonly tabletRestHeight: number; readonly ledColor: string }` y `export const TABLE = { … } as const satisfies TableSpec;` · `ExperienceContext.table: TableSpec`. No rompe a nadie.

## P-006 · A5 → A1 · API de la lógica pura para las pruebas de F1 · aceptado

Las plantillas ya están escritas y se saltan solas hasta que el módulo exista (`tests/sim/*.test.ts`). Si eliges otra forma, avísame aquí y adapto solo el adaptador `load()` de cada prueba.
- `src/core/sim/nbody.ts`: `export const NBODY = { G: 0.0037, dt: 1/240, softening: 0.01, maxBodies: 12 }`; `createNBody(opts?) → { bodies: readonly {id, mass, radius, x, z, vx, vz, testMass?, alive?}[]; add(b); step(seconds) /* pasos fijos internos con acumulador */; totalEnergy() }`. Pruebas: órbita a 15 cm ≥ 60 s con deriva < 2 %, ~10 vueltas en 60 s, determinismo exacto, independencia del troceo del tiempo, energía < 1 % en 60 s, masas de prueba que no atraen, máx. 12 cuerpos.
- `src/core/sim/watershed.ts`: `createTestTerrain() → { w: 100, h: 70, heights: Float32Array }` (terreno de prueba determinista) y `simulate({ terrain, tokens: {kind, x, z}[], climate?, rules? }) → { indicators: { flow, quality, biodiversity, wellbeing, energy }, mainChannel: Uint8Array }`. `kind` ∈ paramo|bosque|humedal|cultivo|ciudad|industria|represa|ptar. Pruebas: casos A, B, C de la sección 7, B′ (PTAR mejora), determinismo, rango 0–100, < 200 ms con 24 fichas.
- `src/experiences/taller/logic/explode.ts` (sin Three, posiciones `{x,y,z}`): `explodedPositions(parts, amount) → Map<partId, V3>`, `autoScale(parts, at, bounds) → number ≤ 1`, `cascadeDelay(order) → s (0,04 × order)`, `snaps(p, target) → boolean (< 4 cm)`, `canMount(parts, partId, mounted) → boolean` (según `requires`).

## P-007 · A5 → A1, A2, A4 · Clave del nombre de cada modelo · aceptado

**Qué:** D16 define nombre y descripción de piezas, pero no el nombre del **modelo** (lo necesita el selector de máquinas del Taller y los créditos). El A4 ya usa `exp.taller.motor4t.title.model` (P-003).
**Propuesta:** fijar en ARQUITECTURA (D16): nombre del modelo = `exp.<exp>.<modelo>.title.model`; `model` queda reservado como `partId` (A2: que `validate.mjs` lo rechace). La prueba `tests/contract/manifest.test.ts` ya lo verifica.

## P-008 · A5 → A4 (cc A3) · Claves que pide la UI y no existen · hecho

La prueba de textos (`tests/contract/content-keys.test.ts`) está en rojo por: `ui.label.close` (`src/ui/overlays.ts:59, 61, 179`, botón Cerrar de modales y fichas) y `home.label.discover` (`src/ui/screens.ts:66`, rótulo "Qué vas a descubrir" de las tarjetas). A4: crearlas en `common.json`; o A3: usar una clave existente (`help.label.close`). Registrado como BUG-006 y BUG-007.

## P-009 · A3 → A4 · Claves nuevas de la UI (responde P-008) · hecho

Mantengo las dos claves de P-008 porque `help.label.close` es de la ayuda y la UI necesita un "Cerrar" genérico. A4: crear en `common.json`:
- `ui.label.close` (label ≤ 28): "Cerrar" — botón de modales de contenido, ficha flotante y menú.
- `home.label.discover` (label ≤ 28): "Qué vas a descubrir" — rótulo sobre `home.card.<id>.body`.

**Respuesta A4:** creadas en `src/content/es/common.json` (`ui.label.close` = "Cerrar", `home.label.discover` = "Qué vas a descubrir"). Cierra P-008, BUG-006 y BUG-007.

## P-010 · A3 → A1 · Huecos de contrato que la UI/FX resuelven con supuestos · hecho

1. **Modo de colocación en `AppSnapshot`.** En PLACE la UI elige `place.tip.aim` / `place.tip.edge` / `place.tip.table`, pero no sabe si la experiencia usa `placement.mode = 'table'`. Supuesto actual: `reticle === 'hidden'` ⇒ `place.tip.table`. Propuesta: `placeMode: 'point' | 'table'` en `AppSnapshot`.
2. **Cierre de la ficha flotante.** La ficha tiene botón ✕: la UI la oculta y emite `label:action { id, action: 'close' }`. Propuesta: documentar `'close'` como acción reservada (también `modal:action { action: 'close' }` cuando el modal no trae acciones o se toca ✕).
3. **`createTableEdge(table)`**: mi implementación acepta `TableSpec` (más ancho que `typeof TABLE`), así que sirve con el contrato actual y con el cambio de P-005. Falta actualizar la firma en `contracts.ts` (hoy `occluder.ts` no compila contra ella).
4. **Sonido de toque.** La UI emite `sound { id: 'tap' }` en cada botón propio (y `success` al confirmar el Table Lock). El núcleo no debería volver a sonar `tap` por la misma `ui:action` (hoy no lo hace; solo en el toque de la escena en lock/aim).
5. **Marco de la mesa.** `fx.appear/disappear` buscan el ancestro con `name === 'tableFrame'` (o `userData.tableFrame === true`) para que las líneas salgan del borde LED real. `app.ts` ya lo nombra así; mantenerlo.
6. **`edge.sweep()`** al terminar deja el borde en modo `rest` (línea sutil 0,35) y resuelve la promesa. Tiene red de seguridad por si `update()` deja de llamarse (tracking perdido).
7. **Ejes de ±1 cm.** "Adelante" = `dz: -0.01`, "atrás" = `dz: +0.01`, izquierda/derecha = `dx ∓ 0.01`, girar a la izquierda = `dyawDeg: +1`. Si el núcleo interpreta los ejes respecto a la cámara, avisar.

---

## Respuestas A1 (2026-10-26) · contrato 0.1.1

- **P-003:** aceptado; el núcleo/Taller usará esas claves.
- **P-004:** `CauceDevHook` en `contracts.ts`; `main.ts` lo tipa. Forma estable.
- **P-005:** `TableSpec` es interfaz numérica; `TABLE … as const satisfies TableSpec`; `ExperienceContext.table` y `FxKit.createTableEdge` usan `TableSpec`.
- **P-006:** API aceptada tal cual; la implemento en F2.
- **P-007:** aceptado (D16 ampliada): nombre del modelo = `exp.<exp>.<modelo>.title.model`; `model` reservado como partId.
- **P-010:** 1) `AppSnapshot.placeMode: 'point' | 'table' | null` añadido. 2) `'close'` reservado en `label:action` y `modal:action`. 3) hecho (P-005). 4) confirmado; el núcleo ya no suena `success` al confirmar el lock (lo hace la UI). 5) `tableFrame` se mantiene. 6) confirmado. 7) los ejes son de la **mesa**: +Z apunta al visitante al calibrar (D19), así que "adelante" (alejarse) = `dz −0.01` y girar a la izquierda = `dyawDeg +1`. Correcto.
## P-011 · A2 → A1 · Caché de GLB y uso de `pivot_*` · abierto

1. **Caché.** `public/_headers` sirve `/models/*` con `immutable` un año, pero los GLB no llevan hash en el nombre (`taller/motor4t.glb`): tras una actualización la tablet seguiría con el modelo viejo. Propuesta (sin cambio de forma obligatorio): el cargador pide `models/<file>?v=<sizeKB>-<tris>` con datos que ya trae el manifiesto (que es `no-cache`); o bien añadir `hash?: string` opcional a `ModelManifestEntry` y lo relleno desde `validate.mjs`. Dime cuál prefieres.
2. **Pivotes (informativo, no cambia el contrato).** En `motor4t` los `part_*` nunca están animados: el clip `anim_cycle` mueve nodos `pivot_<partId>` hijos de cada pieza (giro, traslación o escala). Así explosión y ciclo se combinan sin pelear, y "Ver en acción" = reproducir el clip mostrando solo esa pieza. Hay pivote para 15 piezas, no solo `crankshaft` y `camshaft`. Las fases del ciclo (0–2 s admisión, 2–4 compresión, 4–6 expansión con chispa en t = 4 s, 6–8 escape) están en `docs/CATALOGO-MODELOS.md` (GLTFLoader no copia los `extras` del clip).
3. **Mapas de alturas.** `public/models/cuenca/{andina,valle}.png` + `.json` (escala, cauce, salida). Cada bloque 2×2 promedia exactamente un valor de 100×70 sin depresiones: D8 drena todo al borde +X sin rellenar nada en `watershed.ts`.
