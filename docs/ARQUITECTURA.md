# Arquitectura — Mesa CAUCE

Corto y con el porqué. Dueño: Agente 1.

## Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | Proyecto en la raíz del repo (no en `cauce-ar/`). Nombre del paquete y del Worker: `cauce-ar`. | Lo pidió la persona del proyecto. |
| D2 | Versiones fijadas: three 0.186.1, vite 8.3.5, TypeScript 6.0.3 (no 7: typescript-eslint aún no lo soporta), vitest 5.0.5, gsap 3.15.0. | Regla "versión exacta". |
| D3 | Comunicación núcleo ↔ UI solo por eventos tipados (`AppEvents`) y `UiApi`. La UI nunca importa lógica de experiencias; las experiencias nunca tocan el DOM. | Que Agente 1 y Agente 3 no se bloqueen. |
| D4 | El núcleo importa `src/ui/index.ts` (`createUi(): UiModule`), `src/fx/index.ts` (`createFxKit(...)`) y `src/audio/index.ts` (`createAudioKit()`). Existen stubs mínimos del Agente 1 que el Agente 3 reemplaza. | El núcleo funciona desde el día 0. |
| D5 | Gestos: el núcleo los convierte a rayos en el marco "mesa local" y se los da a la experiencia (`onGesture`). Si la experiencia devuelve `true`, los consumió; si no, el núcleo aplica mover/girar/escalar por defecto según `placement`. | Taller usa la manipulación por defecto; Cosmos y Cuenca consumen casi todo. |
| D6 | Arrastrar desde una bandeja: la UI emite `ui:tray-drag` (px de pantalla); el núcleo lo convierte en `GestureEvent` `drag` con `fromTray`. `onPick` sigue existiendo (toque simple sobre el ítem = "elegido, toca la mesa para ponerlo"). | Hueco del contrato original: `tray` solo tenía `onPick`. |
| D7 | Nuevo `ControlSpec` `select` (modos, presets de clima, velocidades). Campos opcionales `group`, `disabled`, `step`, `format`. | Varias interacciones son "una de N". |
| D8 | `onPlaced(at)` recibe el punto; `placement.mode = 'table'` para experiencias que ocupan toda la mesa (Cuenca, Cosmos). | Contrato original no decía dónde se colocó. |
| D9 | Pellizco en Taller: la escala del visitante (0,6×–1,6×) se aplica al grupo colocado; el autoescalado de la explosión se aplica a un grupo hijo. Escalas multiplicativas; el clamp usa la huella resultante. | Hueco: no estaba definida la interacción entre ambas. |
| D10 | Manifiesto PWA = `/manifest.webmanifest`; manifiesto de modelos = `/models/manifest.json`. | Evitar confusión entre los dos `manifest.json`. |
| D11 | Textos: el tipo de cada clave es el primer segmento que sea `title`, `label`, `tip`, `body` o `modal`. "Qué vas a descubrir" de HOME es `body` (con meta propia ≤ 120 en `schema.json`). | Hueco: "≤ 120" no casaba con los tipos del contrato. |
| D12 | En producción, una clave que falta devuelve `''` (nunca la clave cruda al visitante); en desarrollo devuelve `⟦clave⟧`. La prueba de textos es la que falla. | R: el visitante nunca ve errores crudos. |
| D13 | Cuenca: "energía" es un valor interno (0–100) que alimenta Bienestar y se muestra como lectura secundaria; no es un 5.º indicador. | Hueco: el caso C de pruebas habla de energía. |
| D14 | Mapas de alturas: el Agente 2 entrega 200×140; la simulación submuestrea promediando bloques 2×2 → 100×70. | Hueco de resolución. |
| D16 | Piezas: `extras.labelKey` = `exp.<exp>.<modelo>.title.<partId>` (nombre ≤ 36) y su descripción en `exp.<exp>.<modelo>.body.<partId>` (≤ 160). Reemplaza el ejemplo `…part.piston` del brief. | Cumple D11 (tipo detectable en la clave). |
| D17 | F0 se trabaja en un solo árbol (`main`), sin ramas por agente: los agentes respetan la propiedad de carpetas y el Agente 1 hace los commits. Las ramas `agent/<n>-<rol>` se usan desde F1 si se trabaja en paralelo largo. | Varios agentes en la misma máquina a la vez. |
| D18 | `?ui=1` monta `src/ui/playground.ts` (`mountPlayground(root: HTMLElement): void`, del Agente 3). | Página de prueba de componentes. |
| D19 | Orientación inicial del rectángulo del Table Lock: su eje +Z apunta hacia la cámara (el visitante mira un lado largo). No se "redondea a 90°" porque el mundo de ARCore no tiene ejes alineados con la sala; el visitante corrige con dos dedos o ±1°. | El brief pedía múltiplos de 90°, pero ¿de qué referencia? |
| D20 | Tras el lock el hit-test sigue activo solo para vigilar la deriva de altura (> 4 cm por 2 s → sugerir recalibrar); la retícula usa rayo–plano. | Cumple 5.2.6 sin usar hit-test para colocar. |
| D15 | Simulador `?sim=1`: sin XR, cámara orbitable alrededor de una mesa virtual visible; el Table Lock se da por hecho (marco = origen); ratón = toque, rueda = pellizco, Shift+arrastre = girar con dos dedos. | Probar todo sin tablet. |
