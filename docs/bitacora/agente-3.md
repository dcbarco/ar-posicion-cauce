# Bitácora — Agente 3

- 2026-10-26 · Hice: F0+F1 de UI/FX/audio — `tokens.css` + `ui.css` (Lexend empaquetada), componentes (botón, slider, interruptor, selector, bandeja con arrastre `ui:tray-drag`, lectura, ficha anclada, modal, toast, menú contextual, HUD), renderizador `ControlSpec[]` con reconciliación por id, todas las pantallas del flujo (boot, operador, home, intro, scan, lock ±1 cm/±1°, place, explore, velo, recalibrar, inactividad, cambio, ayuda, banner sim), playground `?ui=1` con escena FX, FxKit (borde LED con flujo/pulso/barrido, retícula ok/warn con formas distintas, sello appear/disappear con líneas de luz, contorno, fantasma, 3 niveles) y AudioKit WebAudio. Probado en `?ui=1` y `?sim=1` (headless).
- Sigue: F2 (coreografías por experiencia en `src/experiences/*/anim/`: explosión en cascada, rejilla de Cosmos, agua de Cuenca), prueba en tablet real de legibilidad, contraste al sol y que `beforexrselect` no deja pasar toques.
- Necesito: A4 → `ui.label.close` y `home.label.discover` (P-009); A1 → responder P-010 (`placeMode` en el snapshot, acción `close` reservada, firma `TableSpec` en `createTableEdge`).

- 2026-10-27 · Hice: Cuenca y Cosmos en gris con «Próximamente» y deshabilitadas en HOME y en el panel de cambio (`SOON` en `screens.ts`, clave `home.label.soon`); `back.ts`: el botón atrás de Android retrocede dentro de la app (ayuda/cambio → intro → inicio).
- Sigue: quitar de `SOON` cada experiencia al tener contenido real; PWA a pantalla completa para que Chrome no gaste el «atrás» en salir de ella.
- Necesito: nada.

- 2026-10-28 · Hice: tipografía Space Grotesk (principal) + Plus Jakarta Sans (lectura) en lugar de Lexend, escala de tamaños más pequeña (D21), logo oficial CAUCE en arranque y HOME (el título queda para lectores de pantalla) e ícono de pestaña; el aviso «la mesa se corrió» ocupa casi todo el ancho en vertical (antes partía el texto palabra por palabra).
- Sigue: revisar en la tablet la legibilidad con 16 px a la distancia de uso.
- Necesito: nada.

- 2026-10-28 · Hice: paleta CAUCE con tema claro (D24) en `tokens.css` (paleta + nombres semánticos: `--cx-accent-fill`, `--cx-surface`, `--cx-track`, `--cx-fill-subtle`, `--cx-info`), sin colores sueltos en `ui.css`; ilustraciones de `art.ts` en azul/crema con cauce naranja→amarillo; aviso de recalibrar como franja amarilla; contrastes medidos (WCAG) en el encabezado de `tokens.css`.
- Sigue: validar en la tablet sobre el video de la cámara con luz de sala; el borde 3D de la mesa sigue verde (LED físico).
- Necesito: nada.

- 2026-10-28 · Hice: modo sala (D25) en la UI: gesto oculto del operador (mantener el logo de HOME 3 s y soltar → calibrar, `.cx-logo--hold`), sin botón «Recalibrar mesa» para el visitante, paso 2 de INTRO y velo con textos propios (`intro.room.step2.*`, `relocating.tip.room`), sin pantalla completa con la sesión AR abierta.
- Sigue: comprobar en la tablet que mantener el logo no abre el menú de imagen de Chrome.
- Necesito: nada.

- 2026-10-28 · Hice: ficha de pieza compacta a un costado del ancla con línea guía (ya no tapa la pieza; cambia de lado con histéresis) y panel de controles compacto (--cx-hit 40 px, 14 px, 250 px en vertical) plegable con botón sliders (hud.label.controls_show|hide).
- Sigue: validar en la tablet que los objetivos de 40–44 px se tocan bien con la mano (bajan del mínimo de 56 px del brief por pedido en sala).
- Necesito: nada.
