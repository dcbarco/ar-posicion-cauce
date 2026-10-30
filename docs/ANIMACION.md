# Animaciones — Mesa CAUCE

Dueño: Agente 3. Una fila por animación. Reglas (sección 9): UI 250–600 ms, *ease-out*, solo `transform`/`opacity`, respuesta al toque < 100 ms; piezas 3D 600–1200 ms con asentamiento ≤ 8 %, siempre con `dt`. Las animaciones de UI son `@keyframes`/transiciones CSS (no dependen de `window.requestAnimationFrame`, que puede no correr en sesión inmersiva); las 3D avanzan en `update(dt)`. `prefers-reduced-motion` reduce las de UI a 1 ms.

Curvas: `--cx-ease` = ease-out cubic `cubic-bezier(.215,.61,.355,1)`; `--cx-ease-expo` = ease-out expo `cubic-bezier(.16,1,.3,1)`; `easeOutBack(1.1)` ≈ 5 % de rebote.

## Interfaz (DOM)

| Nombre | Disparador | Duración | Curva | Archivo |
|---|---|---|---|---|
| Presión de botón / tarjeta / ítem | `:active` | 80 ms (vuelta 250 ms) | ease-out cubic | `src/ui/ui.css` (`.cx-btn:active`) |
| Entrada genérica (fade/up/down/left/right) | alta de un nodo (`enter()`) | 350 ms | ease-out cubic | `src/ui/dom.ts`, `ui.css` (`.cx-in--*`) |
| Entrada "pop" de diálogos y fichas | apertura de modal/ficha/menú | 420 ms | ease-out expo | `ui.css` (`cx-pop-in`, `cx-label-in`) |
| Salida genérica | baja de un nodo (`leave()`) | 250 ms | ease-out cubic | `src/ui/dom.ts`, `ui.css` (`.cx-out--*`) |
| Tarjetas de HOME en cascada | pantalla HOME | 350 ms + 90 ms × índice | ease-out cubic | `src/ui/screens.ts` (`homeScreen`) |
| Fondo de corrientes de HOME | siempre en HOME | 18 s bucle alterno | lineal | `ui.css` (`cx-drift`) |
| Ilustraciones vivas (engranaje, órbita, brillo) | siempre en tarjetas | 2,4–12 s bucle | lineal / ease-in-out | `src/ui/art.ts`, `ui.css` (`.cx-art__*`) |
| Logo de arranque (línea que recorre la mesa) | pantalla BOOT | 2,6 s bucle | lineal | `ui.css` (`cx-run`) |
| Barra indeterminada | pantalla BOOT | 1,4 s bucle | ease-out cubic | `ui.css` (`cx-indet`) |
| Pasos del modal de instrucciones | Siguiente / Atrás | 350 ms | ease-out cubic | `screens.ts` (`openIntro`), `ui.css` (`.cx-steps__seg`) |
| Progreso de precarga | `loadProgress` | 350 ms (scaleX) | ease-out cubic | `ui.css` (`.cx-progress__fill`) |
| Anillo que invita a "Entrar en AR" | último paso del intro | 2,4 s bucle | ease-out cubic | `ui.css` (`cx-ring`) |
| Indicación superior (hint) entra / cambia | cambio de pantalla AR o de mensaje | 350 ms | ease-out cubic | `screens.ts` (`setHint`), `ui.css` (`cx-hint-in`) |
| Tablet que se mece (SCAN) | estado `scan` | 2,4 s bucle alterno | ease-in-out | `ui.css` (`cx-sway`) |
| Rieles laterales (HUD, ±1 cm) | entrada a lock/place/explore | 350 ms | ease-out cubic | `ui.css` (`.cx-rail.cx-in > *`) |
| Burbujas del dock de controles | entrada a explore | 420 ms (escala 0,92 → 1) | ease-out expo | `ui.css` (`.cx-dock.cx-in > .cx-dock__bubbles > *`) |
| Morph burbuja → hoja de controles | toque en una burbuja | abre 420 ms (clip-path del círculo de la burbuja al rectángulo); contenido entra 250 ms con 120 ms de retraso; cierra 420 ms; cambio de grupo = cierre 240 ms + apertura | ease-out expo / cubic | `src/ui/controls.ts` (`open`/`close`), `ui.css` (`.cx-dock__sheet`) — única animación de `clip-path` de la UI |
| Ícono de burbuja ↔ ✕ | burbuja activa | 350 ms (giro 90° + escala) | ease-out expo | `ui.css` (`.cx-bubble__ico`, `.cx-bubble__close`) |
| Repetición de ±1 cm / ±1° | mantener presionado | 420 ms de espera, luego cada 110 ms | — | `src/ui/dom.ts` (`repeatButton`) |
| Interruptor (perilla + relleno + ✓/–) | toque | 250 ms | ease-out cubic | `ui.css` (`.cx-switch*`) |
| Relleno del slider | arrastre | inmediato (scaleX) | — | `src/ui/components.ts` (`sliderControl`) |
| Ítem de bandeja elegido | toque simple | 400 ms | ease-out cubic | `ui.css` (`cx-picked`) |
| Fantasma de arrastre desde bandeja | arrastre > 12 px | sigue al dedo; sale en 250 ms | — | `components.ts` (`trayControl`) |
| Velo "Reubicando…" | `relocating` | 450 ms (≥ 300 ms) | ease-out cubic | `ui.css` (`.cx-veil`) — centro transparente, nunca tapa el modelo |
| Sugerencia de recalibrar | `suggestRecalibrate` | 350 ms | ease-out cubic | `ui.css` (`.cx-suggest`) |
| Cuenta regresiva de inactividad | `idleCountdown` | 1 s por paso (scaleX lineal) + mano que saluda 1,2 s | lineal / ease-in-out | `screens.ts` (`renderIdle`), `ui.css` (`cx-wave`) |
| Toast | evento `toast` | entra 350 ms, vive 3,2 s, sale 250 ms | ease-out cubic | `src/ui/overlays.ts` (`createToastHost`) |
| Ficha flotante anclada | `label:show`; posición cada `tick` | entra 420 ms (escala 0,92 → 1); oculta 250 ms si el ancla sale de cámara | ease-out expo | `overlays.ts` (`createFloatingLabelHost`) — a un costado del ancla con línea guía (D26); la caja se mueve por transform, la tarjeta interior anima |
| Indicador de giro (spinner) | velo de reubicación | 1 s bucle | lineal | `ui.css` (`cx-spin`) |
| Cambio de máquina del Taller | control «Máquina» | se arma (cascada) → se disuelve 500 ms → la nueva se condensa 900 ms desde el borde | ease-out cubic / expo | `taller.ts` (`switchMachine`) con `fx.disappear` / `fx.appear` |
| Giro del motor eléctrico | «Funcionar» | `anim_spin` 2 s bucle × velocidad | lineal | `motor_electric.glb` |
| Corriente por fases (bobinas A, B, C) | motor eléctrico funcionando | sigue el giro: 2 ciclos por vuelta; arranca y se apaga con suavizado (τ ≈ 170 ms) | cos² | `anim/machine-fx.ts` (`createCoilFx`) |
| Rueda y generador de la Pelton | «Funcionar» | `anim_run` 3 s bucle (2 vueltas) × velocidad | lineal | `pelton.glb` |
| Chorro y salpicadura | Pelton funcionando | caudal sube/baja con τ ≈ 200 ms; gotas con gravedad, vida ≤ 0,9 s | lineal | `anim/machine-fx.ts` (`createPeltonFx`) |
| Brillo del bombillo | Pelton funcionando | sigue la velocidad (τ ≈ 250 ms) | exponencial | `anim/machine-fx.ts` |
| Demostración del brazo (recoger y dejar la esfera) | «Demostración» | 8,2 s por corrida (ida y vuelta alternadas) × velocidad | smoothstep entre claves | `logic/arm.ts` (`demoKeys`, `samplePose`), `taller.ts` (`updateArm`) |
| Ejes y pinza del brazo hacia su objetivo | sliders «Eje 1…6», «Pinza abierta» | suavizado exponencial (7 s⁻¹) | exponencial | `taller.ts` (`updateArm`) |

## Escena 3D (FX)

| Nombre | Disparador | Duración | Curva | Archivo |
|---|---|---|---|---|
| Borde LED: cambio de modo lock/rest/hidden | `TableEdgeFx.setMode` | ~0,5 s (amortiguación exp., tasa 6) | exponencial | `src/fx/edge.ts` |
| Borde LED: corrientes por el perímetro | modo `lock` (calidad alta/media) | continuo, 0,35 vueltas/s | lineal | `src/fx/edge.ts` (shader) |
| Borde LED: pulso | `pulse()` | ~0,6 s de decaimiento | exponencial | `src/fx/edge.ts` |
| Barrido de cierre del Table Lock | `sweep()` | 1,4 s + estela; termina en `rest` (0,35) | lineal + estela exp. | `src/fx/edge.ts` |
| Retícula: latido | siempre visible | ok 0,8 Hz ±5 %; warn 1,6 Hz ±8 % | seno | `src/fx/reticle.ts` |
| Retícula: cambio ok ↔ warn (anillo ↔ rombo con "!") | `setState` | ~0,3 s (fundido + escala 0,8→1) | exponencial | `src/fx/reticle.ts` |
| Aparición (sello de marca) | `fx.appear(target)` | 1100 ms: líneas 0–75 %, condensación 40–100 % | líneas lineales; objeto `easeOutBack(1.1)` | `src/fx/brand.ts` |
| Aparición desde arriba | `fx.appear(target, { from: 'above' })` | 1100 ms; cae 12 cm | ease-out cubic | `src/fx/brand.ts` |
| Desaparición | `fx.disappear(target)` | 800 ms: anticipación +4 % (0–15 %), se encoge (15–60 %), líneas al borde (25–100 %) | ease-out / ease-in cubic | `src/fx/brand.ts` |
| Contorno de selección | `fx.outline(target)` | grosor entra en ~0,2 s; brillo oscila 0,64 Hz | exponencial / seno | `src/fx/outline.ts` |
| Fantasma | `fx.ghost(targets, on)` | inmediato (opacidad 0,15) | — | `src/fx/ghost.ts` |

## Niveles de calidad

| Efecto | Alto | Medio | Bajo |
|---|---|---|---|
| Líneas del sello (cantidad × muestras) | 28 × 28 | 18 × 20 | 10 × 12 |
| Halo del borde | 1 | 0,8 | 0,45 |
| Corrientes del borde (lock) | 1 | 0,6 | apagadas |
| Latido de la retícula | 1 | 1 | 0,5 |
