# Notas de sesión — 2026-10-27

Para retomar (`claude --resume` o leyendo este archivo). Nada de esto está commiteado todavía.

## Estado al cerrar

- **Pendiente principal:** verificar en la tablet la corrección de **BUG-009 (S1)**: retícula, rectángulo del
  Table Lock y modelo no se veían. Abrir `https://10.15.1.199:5173` (o la IP Wi-Fi que muestre Vite), esperar
  1–2 min en HOME y entrar a Taller → AR. Deben verse retícula circular, rectángulo y motor.
- Tras reiniciar el PC hay que volver a levantar el servidor: `npm run dev:https`.

## Actualización (tarde del 2026-10-27): el arreglo del dt no bastó

- Las fotos del panel en la tablet muestran `retLock vis`, `borde vis` y `render calls>0`: se dibuja pero no se
  compone sobre la cámara. Con sesión XR simulada en el escritorio (`tests/e2e/xr.spec.ts`) todo el flujo funciona.
- La primera prueba buena (26-oct 22:33) ya era por `https://IP`; a la mañana siguiente falló sin que el código
  de render hubiera cambiado → probable actualización nocturna de Chrome que expone WebXR Layers, con lo que
  three r186 cambia solo a XRProjectionLayer. Se fuerza el XRWebGLLayer clásico (`session.ts`).
- Prueba en tablet: Taller → AR. Debe verse un **cubo magenta** pequeño abajo a la derecha del centro siempre;
  leer las líneas `capa` y `opacidad`. Comparar con `?xrlayers=1` (vía de capas de three).
  - Sin cubo en ningún caso → problema de composición del WebGL en Chrome/ARCore (probar otro navegador/actualizar ARCore).
  - Cubo visible pero sin retícula/borde → mirar `opacidad` (NaN/0).

## Causa real de BUG-009 (hipótesis anterior)

Al entrar a la sesión XR los frames de WebXR traen otra base de tiempo. En `App.onFrame` el `dt` solo tenía
tope superior: el primer frame daba `dt` negativo y enorme (≈ −190 s si se pasaron 3 min en HOME), `damp()`
devolvía `Infinity` y luego `NaN` en las opacidades → todo se dibujaba (`renderer.info` > 0) pero invisible.
Con entradas rápidas a AR el salto era pequeño y se recuperaba; por eso "funcionaba en la primera salida".
No tenía que ver con la reorientación D19.

Arreglo: `dt` acotado a (0, 100] ms en `src/core/app.ts` (onFrame) y `damp()` blindado en `src/fx/quality.ts`.
Prueba: `tests/sim/damp.test.ts`.

## Cambios de la sesión (sin commit)

- **D19 revertido** al commit 7fc6746 (a pedido): `lock.ts` (yawFacing +Z hacia la cámara), D-pad de
  `screens.ts`, sin giro −90° en `taller.ts`, cámara de `desktop-sim.ts`, texto D19 en `ARQUITECTURA.md`.
- **Cuenca y Cosmos deshabilitadas** ("Próximamente", en gris) en HOME y en el panel de cambio:
  constante `SOON` en `src/ui/screens.ts`, clave `home.label.soon`, estilos `.is-soon` / `.cx-soon` en `ui.css`.
  Las pruebas humo F2 (`QA_F2=1`) que entran a esas experiencias fallarán mientras sigan en `SOON`.
- **Botón atrás de Android** retrocede dentro de la app: `src/ui/back.ts`. Con pantalla completa del
  navegador, Chrome gasta el primer "atrás" en salir de ella (no evitable desde la página; solución: PWA
  a pantalla completa, aún no hecha — no hay manifiesto ni íconos).
- **Pantalla completa y AR** (`src/core/xr/session.ts`): si la página estaba a pantalla completa, sale antes
  de pedir la sesión, espera el `resize` y la restaura al terminar. Resultó no ser la causa del bug; se dejó.
- **Escaneo más tolerante** (`app.ts`): los fallos del hit-test restan en vez de reiniciar; la retícula usa
  el último plano visto si el hit-test parpadea; a los 6 s sin superficie se estima el tope 0,45 m bajo la
  tablet. Revisar si conviene conservarlo una vez confirmado BUG-009 (el escaneo original quizá bastaba).
- **Panel de diagnóstico** `src/core/diag.ts` + `App.diagnostics()`: activo por defecto en dev fuera del
  simulador (`?diag=0` lo apaga, `?diag=1` lo fuerza). **Quitar el "por defecto" en `src/main.ts`** cuando
  BUG-009 esté confirmado. Excluido de la prueba de textos en `tests/contract/no-hardcoded-text.test.ts`.
- Registrado BUG-009 en `docs/BUGS.md`; notas en `docs/bitacora/agente-1.md` y `agente-3.md`.

Verificación al cerrar: typecheck, lint y 145 pruebas OK. E2E no corrido (el puerto 5173 estaba ocupado por
el servidor del usuario).

## Siguientes pasos

1. Confirmar BUG-009 en la tablet → cerrar en `BUGS.md`, quitar diagnóstico por defecto.
2. Decidir si se conserva el escaneo tolerante / plano estimado.
3. Commit de todo (rama nueva; el árbol está en `main`).
4. Opcional: PWA a pantalla completa (manifiesto + íconos) para el botón atrás en modo quiosco.

## Equipo (PC de desarrollo)

MSI Cyborg 15 A12VF, 8 GB de RAM (2 ranuras DDR5; ampliar a 16 GB sería la mejora de fondo). Disco C: con
~23 GB libres. OVRService, KinectMonitor y MSI_Center_Service ya quedaron en inicio Manual (detenidos).

### Optimización de RAM al arranque (segunda parte de la sesión, tras el primer reinicio)

Medido antes: 1,9 GB libres de 7,7 GB con Claude + Vite abiertos; comprometido 8,4 GB; pool no paginado 645 MB.

**Hecho sin administrador** (mismo mecanismo que Administrador de tareas → Aplicaciones de inicio; se revierte ahí):
- Inicio desactivado: Webex (`CiscoSpark`, `CiscoMeetingDaemon`), Figma Agent, arranque automático de Edge,
  OneDrive, Ollama (`Ollama.lnk` de la carpeta Inicio).
- Tareas programadas desactivadas: `Start Syncthing at logon (...)` y `OneDrive Startup Task-...`
  (reactivar en el Programador de tareas).

**Lanzado como administrador (requiere aceptar UAC; resultado no verificado por Claude):** script
`optimizar-inicio.ps1` en el scratchpad de la sesión
(`C:\Users\CENTRO~1\AppData\Local\Temp\claude\C--Projects-ar-position-cauce\ca45c8ea-08c1-41bd-8f03-303fafe14279\scratchpad\`):
- `DellClientManagementService` → Manual; `DellTechHub` → Deshabilitado (aloja AWCC, AlienFX y SubAgents Dell;
  sin él no se configuran luces de periféricos Alienware).
- `McAfee WebAdvisor` → Deshabilitado (conviene desinstalarlo desde Configuración → Aplicaciones).
- `NvContainerLocalSystem` → Manual (GeForce Experience / NVIDIA Share; el driver no se toca).
- `OVRService`, `KinectMonitor`, `MSI_Center_Service` → Manual.
- Tareas desactivadas: `OmApSvcBroker`, `OneDC_Updater`, `NvNodeLauncher_*`.
- **No se tocan** `MSI Foundation Service` ni `Micro Star SCM` (teclas Fn y ventiladores).
- Revertir un servicio: `Set-Service <Nombre> -StartupType Automatic` (PowerShell de administrador).

**Al volver del reinicio:**
1. Comprobar RAM libre al arrancar (esperado: +1–1,5 GB respecto a antes) y si el script dio algún ERROR.
2. Levantar `npm run dev:https` y hacer la prueba de BUG-009 en la tablet (sección "Estado al cerrar").
