# Prompt maestro — Mesa CAUCE (WebXR sin marcador)

Oct 26, 2026 · @Dann castillo

> **Cómo usar este documento.** Las secciones 1–9 y 15–17 son el brief compartido: todos los agentes las leen completas. Las secciones 10–14 son el prompt de cada agente: cada uno ejecuta solo la suya y respeta la propiedad de archivos de la sección 4.

## 1. Misión y principios

Construye una web de realidad aumentada **sin marcador** (WebXR) para una sala de apropiación social de la ciencia, la tecnología y la innovación. Corre en **una sola tablet Samsung Galaxy Tab S10 FE+** anclada a una mesa expositiva. El visitante elige una experiencia educativa, la ubica sobre la mesa y la explora; la mesa física es el objeto que se expande en digital.

**Por qué reemplaza la versión actual (marcador + portal).** Falla en dos cosas: (1) el marcador se pierde y el 3D aparece y desaparece, interrumpiendo la experiencia; (2) ofrece poca información y poca interacción. De ahí los requisitos:

- **R1.** El contenido nunca desaparece por perder un marcador. El visitante puede levantar la tablet y rodear la mesa 360° sin que el modelo se pierda.
- **R2.** Cada experiencia tiene al menos 4 interacciones distintas que cambian el comportamiento del modelo o del sistema y enseñan un concepto.
- **R3.** Cada experiencia enseña algo concreto y verificable (qué se aprende está escrito en su sección).

**Principios de diseño**

1. **La mesa es una constante.** Mide 100 × 70 cm y sus bordes son los límites del mundo digital. Todo se diseña a esa escala.
2. **CAUCE es el hilo conceptual de la sala.** Cauce = el camino por el que fluye algo: agua, energía, materia, cuerpos. Cada experiencia se presenta como un cauce: el Taller es el cauce de la energía dentro de una máquina; Cosmos son los cauces de la gravedad (las órbitas); Cuenca Viva es el cauce literal de un río. El lenguaje visual (líneas de luz que corren, corrientes, trayectorias) y el tono de los textos lo reflejan.
3. **Explorar antes que leer.** El texto es mínimo y aparece en el momento en que el visitante toca algo.
4. **Calidad sobre cantidad.** Tres experiencias pulidas valen más que diez a medias.
5. **A prueba de visitantes.** Funciona como quiosco, se reinicia solo y nunca queda en un estado roto.
6. **Un usuario, una tablet.** No hay multijugador ni sincronización.

## 2. Hechos físicos: mesa, tablet y sala

La mesa es un pedestal blanco con tope de vidrio o acrílico translúcido y luz LED verde en el perímetro. Estos datos son constantes del proyecto:

| Elemento | Valor | Consecuencia para el diseño |
| --- | --- | --- |
| Tope de la mesa | 100 cm (largo) × 70 cm (ancho) | Es el único escenario. Todo cabe en ese rectángulo. |
| Altura del tope | 93 cm desde el piso | El cuerpo de la mesa mide 93 cm de alto y es una caja conocida. |
| Tablet en reposo | 70 cm desde el piso, en soporte impreso 3D con cable de seguridad | Queda 23 cm bajo el tope. En reposo la cámara trasera mira hacia el pedestal, así que el soporte no sirve como referencia de calibración. |
| Visitante | De pie; sostiene la tablet a \~1,1–1,5 m del piso y mira el tope con un ángulo de 20°–70° | El hit-test debe funcionar con ángulos rasantes. Los botones se alcanzan con los pulgares. |
| Superficie del tope | Lisa, brillante, sin textura, con reflejos de luminarias del techo | La detección de planos será poco confiable: se resuelve con Table Lock (sección 5). |
| Entorno | Piso de ladrillo y muros de ladrillo | Muchos rasgos visuales: el tracking de la tablet será estable. |
| Luz LED del borde | Verde, ≈ `#41B270` medido en foto | Es el límite visual del mundo digital y el color de acento de la app. |

**Sistema de coordenadas "mesa local"** (todo el contenido vive en él, en metros):

- Origen en el centro de la superficie del tope. **+X** a lo largo de los 100 cm, **+Z** a lo largo de los 70 cm, **+Y** hacia arriba.
- Esquinas del tope: (±0,50 ; 0 ; ±0,35). El piso está en Y = −0,93.
- **Área útil** = el tope menos un margen `usableInset` hacia adentro (valor inicial 0,04 m; **medir** hasta el borde interior de la luz LED real y ajustarlo).

```ts
// src/core/table/spec.ts — única fuente de verdad de la mesa
export const TABLE = {
  length: 1.00,           // m, eje X
  width: 0.70,            // m, eje Z
  height: 0.93,           // m, tope sobre el piso
  usableInset: 0.04,      // m, TODO medir hasta el borde interior de la luz LED
  tabletRestHeight: 0.70, // m, informativo
  ledColor: '#41B270',
} as const;
```

## 3. Stack y restricciones técnicas

**Decisiones cerradas (no se renegocian sin avisar al Agente 1):**

- **Vite + TypeScript estricto + Three.js** (versión estable reciente, fijada exacta en `package.json`). WebXR Device API directo, sin frameworks AR encima.
- **Animación:** GSAP para UI y piezas; `AnimationMixer` de Three para los clips del GLB.
- **Modelos:** glTF 2.0 (`.glb`) con compresión Meshopt o Draco y texturas KTX2. Pipeline con `gltf-transform`.
- **Física:** solo en Cosmos, con integrador propio (leapfrog). Sin motor de física externo.
- **UI:** HTML/CSS sobre la escena con DOM Overlay. TypeScript vanilla, o Preact si el Agente 3 lo justifica.
- **Pruebas:** Vitest para lógica pura (simulaciones, reglas de Cuenca, geometría de la mesa) y Playwright para humo en escritorio con el modo simulador.

**Requisitos WebXR**

- Sesión `immersive-ar` con `requiredFeatures: ['hit-test', 'dom-overlay']` y `optionalFeatures: ['anchors', 'light-estimation', 'local-floor']`. **No** depender de `depth-sensing` ni de `camera-access`.
- La tablet necesita Chrome para Android actualizado y "Servicios de Google Play para RA" (ARCore). Al cargar, la app comprueba `navigator.xr.isSessionSupported('immersive-ar')`; si falla, muestra una pantalla para el operador de sala (no para el visitante) con el motivo.
- La sesión XR solo puede iniciar con un gesto del usuario: el toque sobre una tarjeta del selector.
- Los toques sobre botones del overlay deben llamar `preventDefault()` en `beforexrselect` para que no disparen `select` en la escena.
- Los gestos multitáctiles (arrastrar, girar, pellizcar) se leen con Pointer Events sobre una capa transparente del overlay; los rayos se calculan con la pose de la vista XR.
- No hay oclusión real de manos ni de personas (la tablet no tiene sensor ToF). La única oclusión es la **mesa virtual invisible** de la sección 5.

**Presupuesto de rendimiento** (tablet de gama media-alta):

- ≥ 30 fps estables, ideal 60.
- Escena visible ≤ 300 k triángulos y ≤ 120 draw calls; un modelo héroe ≤ 150 k triángulos.
- Texturas ≤ 2048 px en KTX2.
- Cada experiencia pesa ≤ 12 MB en red y se precarga mientras el visitante lee el selector.
- Una luz direccional con sombra de 1024 px, más iluminación ambiental por imagen (`light-estimation` si existe; si no, un entorno neutro fijo).

**Desarrollo y pruebas**

- En la tablet: `adb reverse tcp:5173 tcp:5173` y abrir `http://localhost:5173` en Chrome (localhost cuenta como contexto seguro). Depuración remota con `chrome://inspect`.
- En escritorio: **modo simulador** (`?sim=1`), una escena 3D orbitable con una mesa virtual y un ratón que emula el toque. Es obligatorio, porque los agentes en la nube no pueden probar AR real.

## 4. Arquitectura, propiedad de archivos y contratos

Cada agente trabaja en su propia rama (`agent/<n>-<rol>`) y solo edita lo que posee. Se integra a `main` por PR; el Agente 5 valida antes de cada merge.

```
cauce-ar/
├─ index.html, vite.config.ts, wrangler.jsonc, package.json     (Agente 1)
├─ public/models/          GLB finales + manifest.json            (Agente 2)
├─ assets-src/             .blend y texturas originales           (Agente 2)
├─ tools/models/           scripts de optimización y validación   (Agente 2)
├─ src/
│  ├─ main.ts              arranque, selector → sesión XR         (Agente 1)
│  ├─ core/                                                      (Agente 1)
│  │  ├─ contracts.ts      tipos e interfaces compartidas
│  │  ├─ xr/               sesión, espacios de referencia, salud del tracking
│  │  ├─ table/            spec.ts, lock.ts, occluder.ts, bounds.ts
│  │  ├─ placement/        retículo, colocación, límites
│  │  ├─ gestures/         capa de punteros: arrastrar, girar, pellizcar
│  │  ├─ state/            máquina de estados de la app, reinicio por inactividad
│  │  └─ sim/              nbody.ts, watershed.ts (lógica pura, con pruebas)
│  ├─ experiences/{taller,cuenca,cosmos}/
│  │  ├─ logic/            comportamiento y reglas                  (Agente 1)
│  │  └─ anim/             coreografías y efectos                   (Agente 3)
│  ├─ ui/                  overlay, botones, modales, HUD          (Agente 3)
│  ├─ fx/                  shaders: rejilla, agua, brillo LED       (Agente 3)
│  ├─ audio/                                                    (Agente 3)
│  └─ content/es/          JSON de textos                           (Agente 4)
├─ tests/, docs/QA/, docs/BUGS.md                                 (Agente 5)
└─ docs/CATALOGO-MODELOS.md (Agente 2) · docs/GUIA-DE-VOZ.md (Agente 4)
```

**Reglas de propiedad**

- Solo el Agente 1 modifica `core/contracts.ts`. Quien necesite un cambio de contrato lo pide en `docs/PEDIDOS-DE-CONTRATO.md` con el motivo y la forma propuesta; el Agente 1 responde en el mismo archivo.
- El Agente 5 puede corregir bugs en cualquier carpeta, pero con diffs mínimos, un commit por bug y el identificador del bug en el mensaje. Si el arreglo exige rediseñar algo, lo devuelve al dueño.
- Nadie escribe textos visibles directamente en el código: todo sale de `content/es/` mediante `t('clave')`.

### Contrato de modelos (Agente 2 → Agentes 1 y 3)

- Unidades en metros, **Y arriba**, frente hacia **+Z**, origen en el centro de la base del modelo (el pivote queda a nivel del tope de la mesa).
- Un modelo héroe armado ocupa como máximo 0,35 × 0,35 m de base. **Desarmado** debe caber en 0,90 × 0,60 m (el área útil menos margen).
- Nodos: `part_<id>` para cada pieza separable; `pivot_<id>` para piezas que giran; `anchor_<nombre>` (nodos vacíos) para etiquetas y puntos de interés. Clips de animación: `anim_<nombre>`, con su duración y si hacen bucle documentados en el manifiesto.
- Cada nodo `part_*` lleva en `extras`: `{ "partId": "piston", "group": "motion", "explode": { "dir": [0,1,0], "dist": 0.12, "order": 2 }, "labelKey": "exp.taller.motor4t.part.piston" }`.
- `public/models/manifest.json` lista por modelo: `id`, `file`, `tris`, `sizeKB`, `parts[]`, `clips[]`, `bounds` armado y desarmado, `license`, `author`, `sourceUrl`.

### Contrato de textos (Agente 4 → Agentes 1 y 3)

- Claves jerárquicas `exp.<experiencia>.<modelo>.<tipo>.<id>`, en `src/content/es/<experiencia>.json` (clave plana → cadena). Las comunes van en `common.json`.
- Límites de longitud: `title` ≤ 36 caracteres, `label` ≤ 28, `tip` ≤ 90, `body` ≤ 160, `modal` ≤ 220. Una prueba automatizada falla si falta una clave o se pasa el límite.

### Contrato de interacción y UI (Agente 1 define, Agente 3 consume)

La lógica declara **qué controles existen**; la UI decide **cómo se ven y se animan**. Así ninguno bloquea al otro.

```ts
// src/core/contracts.ts (fragmento)
export interface Experience {
  id: 'taller' | 'cuenca' | 'cosmos';
  load(ctx: ExperienceContext): Promise<void>;   // precarga de assets
  onPlaced(): void;                              // el visitante confirmó la ubicación
  update(dt: number, t: number): void;          // cada frame
  onGesture(g: GestureEvent): void;              // toque, arrastre, giro, pellizco sobre la escena
  getControls(): ControlSpec[];                  // lo que la UI debe pintar
  reset(): void;                                 // estado inicial limpio
  dispose(): void;
}
export interface ExperienceContext {
  root: THREE.Group;                // hijo del marco "mesa local": (0,0,0) = centro del tope
  table: typeof TABLE;
  bounds: { contains(p: THREE.Vector3): boolean; clamp(p: THREE.Vector3): THREE.Vector3 };
  assets: { loadModel(id: string): Promise<LoadedModel> };
  t(key: string, vars?: Record<string, string | number>): string;
  events: TypedEmitter<AppEvents>;  // 'explode:set', 'part:selected', 'challenge:done', ...
}
export type ControlSpec =
  | { kind: 'slider'; id: string; labelKey: string; min: number; max: number; value: number; onInput(v: number): void }
  | { kind: 'toggle'; id: string; labelKey: string; value: boolean; onChange(v: boolean): void }
  | { kind: 'button'; id: string; labelKey: string; icon?: string; onPress(): void }
  | { kind: 'tray';   id: string; items: { id: string; labelKey: string; icon: string }[]; onPick(id: string): void }
  | { kind: 'readout'; id: string; labelKey: string; value(): string | number };
```

## 5. Núcleo común (lo implementa el Agente 1, lo comparten las 3 experiencias)

### 5.1 Flujo del visitante

1. **HOME (2D, antes de AR).** Título de la sala y tres tarjetas: *Taller de Máquinas*, *Cuenca Viva*, *Gravedad y Cosmos*. Cada una lleva ilustración, nombre, una frase y "qué vas a descubrir". Al tocar una tarjeta se precargan sus assets y se abre un modal de 3 pasos de instrucciones; el botón final "Entrar en AR" es el gesto que inicia la sesión `immersive-ar`.
2. **SCAN.** "Mueve la tablet despacio hacia la mesa", hasta que el tracking esté listo y haya una superficie horizontal.
3. **TABLE LOCK** (una vez por sesión XR; ver 5.2).
4. **PLACE.** Una retícula sobre el tope indica dónde quedará el objeto. Verde dentro del área útil, ámbar si se acerca al borde. Un toque coloca el objeto con una animación de aparición (cae y se ensambla, o crece desde la luz del borde).
5. **EXPLORE.** HUD con: *Cambiar experiencia*, *Reiniciar*, *Ayuda (?)*, *Recalibrar mesa* y *Salir*, más los controles que declare la experiencia con `getControls()`.
6. **Cambiar experiencia dentro de AR.** Un panel selector sobre la escena. La sesión XR y el Table Lock se conservan: no se recalibra.
7. **IDLE.** Tras 60 s sin interacción aparece "¿Sigues ahí?" durante 10 s; si nadie responde, se termina la sesión y se vuelve a HOME con todo reiniciado.

### 5.2 Table Lock: conocer la mesa sin marcador

**Objetivo:** saber con precisión dónde está la mesa en el mundo de ARCore sin depender de la detección de planos sobre un vidrio liso y reflectante.

1. El visitante apunta al centro del tope; el hit-test mueve una retícula; un toque fija `centerPoint`. Se toma su posición y su altura Y; la normal se **fuerza a (0,1,0)**.
2. Aparece un rectángulo digital de 100 × 70 cm, brillante en verde LED, orientado según hacia dónde mira la cámara (ajustado al múltiplo de 90° más cercano, porque casi siempre el visitante está frente a un lado de la mesa). El visitante lo hace coincidir con la luz verde real: un dedo lo desplaza, dos dedos lo giran, y los botones ±1 cm / ±1° afinan. Texto guía: "Haz coincidir el rectángulo con la luz verde".
3. Al confirmar se crea un `XRAnchor` en esa pose. Si el navegador no soporta anchors, se usa una pose fija en el espacio de referencia.
4. Se crea el marco `tableFrame` (un `Object3D` cuya pose se lee del ancla en cada frame). **Todo el contenido cuelga de él.**
5. Efecto de cierre: un barrido de luz recorre el perímetro y el rectángulo queda como una línea sutil permanente (opacidad \~0,35). La mesa se ve como el objeto que se expande en digital.
6. *Recalibrar mesa* está siempre disponible. Además, si el hit-test difiere más de 4 cm en altura del plano bloqueado durante 2 s seguidos, la app sugiere recalibrar.

Tolerancia aceptada: ≤ 2 cm de desalineación visual con el borde LED.

### 5.3 Mesa virtual (`TableTwin`)

- **Ocluyente:** caja de 1,00 × 0,70 × 0,93 m con la cara superior en Y = 0, con `colorWrite = false`, `depthWrite = true`, `renderOrder = -1`. Oculta todo lo que quede bajo el tope o detrás del pedestal.
- **Receptor de sombras:** plano con `ShadowMaterial` limitado al rectángulo del tope.
- **Borde luminoso:** línea en el verde LED, con pulso cuando el visitante interactúa.
- **Límites:** `bounds.contains(p)` y `bounds.clamp(p)` sobre el área útil; cada objeto declara su `footprintRadius` para no sobresalir.

### 5.4 Colocación y manipulación

- Después del Table Lock, la retícula **no usa hit-test cada frame**: usa la intersección **rayo–plano** con el tope bloqueado, recortada al área útil. Evita saltos por los reflejos del vidrio.
- La retícula se suaviza (interpolación \~0,25 por frame) y late suavemente.
- Gestos sobre la escena: **un dedo** arrastra sobre la mesa (con clamp); **dos dedos** giran (yaw); **pellizco** escala dentro de \[0,6× ; 1,6×\] cuando la experiencia lo permite; **doble toque** recentra; **toque** selecciona; **toque largo** abre el menú contextual.
- Los objetos nunca salen del área útil, salvo cuando una experiencia lo define explícitamente (Cosmos "abierto", el río de Cuenca Viva).

### 5.5 Anti-pérdida de tracking (cumple R1)

- Cada frame, el contenido toma su pose del ancla de `tableFrame`; si el tracking corrige una deriva, el contenido la sigue sin saltos.
- Si `getViewerPose` devuelve `null`, o la pose de la mesa salta más de 15 cm entre frames: se conserva el último estado, se muestra un velo suave "Reubicando… mueve la tablet despacio" (transición ≥ 300 ms) y **el modelo no se oculta**. Al recuperar el tracking se reconcilia con un fundido corto.
- Histéresis anti-parpadeo: se entra en estado "perdido" tras 400 ms sostenidos y se sale tras 200 ms estables.
- Si el tracking no vuelve en 8 s, se ofrece *Recalibrar mesa*.

### 5.6 Luz y material

Luz estimada por `light-estimation` cuando existe (intensidad y dirección suavizadas); si no, un entorno fijo cálido-neutro. Sombras suaves sobre el tope. Materiales PBR, sin blancos puros.

## 6. Experiencia 1 — Taller de Máquinas ("el cauce de la energía")

**Idea.** La mesa se vuelve un banco de taller. Un modelo héroe a la vez se puede desarmar, inspeccionar, hacer funcionar y volver a armar. **Qué se aprende:** cómo una máquina transforma energía en movimiento útil y que cada pieza cumple una función dentro de un sistema.

**Catálogo**

| Modelo | Piezas | Clips principales | Qué se descubre |
| --- | --- | --- | --- |
| Motor de combustión 4 tiempos (monocilíndrico) | 25–35: pistón, biela, cigüeñal, válvulas, árbol de levas, bujía, culata, bloque, volante | Ciclo de 4 tiempos (8 s, bucle), con gas azul (mezcla), naranja (combustión) y gris (escape) | Los 4 tiempos y cómo el cigüeñal convierte el vaivén en giro |
| Motor eléctrico | 15–25: carcasa, estator con bobinas, rotor con imanes, eje, rodamientos, tapas | Giro del rotor + campo magnético + corriente por fases | Imanes y corriente producen giro |
| Turbina hidráulica Pelton | 20–30: inyector, rueda con cucharas, eje, carcasa, generador | Chorro de agua + giro + generación | El agua en movimiento se convierte en electricidad (puente con Cuenca Viva) |
| Brazo robótico de 6 ejes | \~20: base, 6 articulaciones, pinza | Demo de recoger y dejar una esfera | Grados de libertad |

Si el tiempo alcanza, se agregan un dron cuadricóptero y un microscopio óptico (opcionales).

**Interacciones obligatorias (todas las máquinas)**

1. **Explosión** (slider 0–100 %). Las piezas se separan según `explode` (dirección, distancia, orden) con retardo en cascada (40 ms × orden) y suavizado. Al 100 % el conjunto se **autoescala** para caber en el área útil; trazos finos unen cada pieza con su posición original.
2. **Seleccionar pieza.** Un toque la resalta con contorno, el resto pasa a fantasma (opacidad 0,15) y aparece una ficha flotante anclada a la pieza con su nombre y "qué hace". El botón *Ver en acción* reproduce el movimiento de esa pieza aislada.
3. **Funcionar.** Play/pausa del clip principal, velocidad 0,1×–2× y cámara lenta. En el motor 4T, un indicador de fase (1–4) y un aviso explican cada tiempo.
4. **Rayos X y corte.** Interruptor que vuelve la carcasa translúcida y un slider que desplaza un plano de corte (*clipping plane*) a lo largo del modelo.
5. **Reto de armado.** Desde la explosión, el modo *Armar* baraja las piezas sobre la mesa; el visitante arrastra cada una hacia su sombra y se acopla con imán a menos de 4 cm, con respuesta visual y sonora. Hay 3 niveles de ayuda (sin pistas, resalta la siguiente pieza, muestra la sombra de todas). Las dependencias de montaje se declaran en el manifiesto (`requires`). Al terminar, la máquina arranca y aparece un mensaje de logro.
6. **Ver el cauce.** Interruptor que dibuja líneas de luz verde que recorren el camino de la energía: combustible → pistón → cigüeñal → volante; corriente → bobinas → campo → rotor; agua → cucharas → eje → generador. Es la conexión directa con el hilo CAUCE.
7. **Gestos.** Arrastrar mueve, dos dedos giran, pellizco escala (0,6×–1,6×).
8. **Brazo robótico:** un slider por articulación más un modo demostración (recoger y dejar una esfera).

**Varios modelos.** Solo uno a la vez. Al elegir otro, el actual se vuelve a armar y se disuelve en líneas de luz, y el nuevo se condensa desde el borde LED. Opcional: modo *Comparar* con un par predefinido (motor 4T y motor eléctrico) lado a lado.

**La mesa como protagonista.** El modelo nace en el centro. En explosión total las piezas se ordenan como en un banco de taller (en cuadrícula, sin pasar el borde). Opcional: un "muro de herramientas" holográfico vertical sobre el borde lejano con una tarjeta por pieza. La entrada es una animación de líneas de luz verde que corren desde el borde LED y condensan el modelo.

**Criterios de aceptación.** Toda pieza visible tiene nombre y descripción; ninguna pieza se interpenetra al explotar; el reto de armado se completa en menos de 3 minutos; cada máquina mantiene ≥ 30 fps en explosión total.

## 7. Experiencia 2 — Cuenca Viva ("el cauce literal")

**Idea.** La mesa es un bloque de territorio de 100 × 70 cm: una cuenca andina donde un río nace en el páramo, cruza montaña, bosque y valle, y sale por el borde de la mesa. El visitante coloca fichas de uso del territorio y ve cómo cambia el cauce. **Qué se aprende:** una cuenca es un sistema; lo que ocurre aguas arriba afecta aguas abajo, y toda decisión tiene un equilibrio entre desarrollo y cuidado del agua.

**Terreno**

- Bloque de 1,00 × 0,70 m con 6 cm de espesor visible y capas de suelo en los costados (suelo orgánico, subsuelo, roca). Relieve máximo de 12 cm.
- Mapa de alturas de 100 × 70 celdas para la simulación y 200 × 140 para el render.
- El río nace en X = −0,45 m y sale por el borde X = +0,50 m. Dos escenarios iniciales: **Andina** (páramo en un extremo, valle en el otro) y **Valle intermontano**. Un tercero (**Delta y humedal**) es opcional.

**Fichas** (bandeja `tray`; se arrastran desde la bandeja hasta el terreno; hasta 24 en total; radio de colocación 6 cm; no se pueden poner sobre el cauce, salvo la represa)

| Ficha | Efecto principal |
| --- | --- |
| Páramo (frailejones) | Solo en cotas altas. Aumenta la retención de agua y el caudal base; sube la biodiversidad. |
| Bosque andino | Reduce la erosión y los sedimentos, estabiliza el caudal, sube la biodiversidad. |
| Humedal | Filtra contaminantes (descuenta \~60 % de lo que lo cruza) y amortigua crecidas. |
| Cultivo (café, papa, pasto) | Sube alimento y bienestar; consume agua; baja la calidad por agroquímicos y sedimentos, más si la pendiente es alta y no hay bosque. |
| Ciudad | Sube bienestar; consume agua; vierte aguas residuales (baja la calidad) si no hay PTAR. |
| Industria | Sube economía y bienestar; consume agua; vierte una carga contaminante alta. |
| Represa / hidroeléctrica | Energía ∝ caudal × caída; regula crecidas; reduce el caudal aguas abajo; corta la conectividad del río (baja biodiversidad) y acumula sedimentos. |
| Planta de tratamiento (PTAR) | Limpia \~80 % de la carga de ciudades e industrias aguas arriba dentro de su radio de influencia. |

**Indicadores** (HUD, 0–100): *Caudal* (agua que llega al final de la cuenca), *Calidad del agua*, *Biodiversidad* y *Bienestar* (energía + alimento + vivienda, con rendimientos decrecientes). Reto *Equilibrio*: lograr los cuatro ≥ 60 al terminar el time-lapse.

**Simulación** (lógica pura y determinista en `core/sim/watershed.ts`, con pruebas; no es dinámica de fluidos real)

- Dirección de flujo D8 y acumulación de flujo desde una precipitación por celda; el cauce principal son las celdas sobre un umbral de acumulación. Se recalcula al colocar o quitar una ficha (< 200 ms; en un Web Worker si hace falta).
- La calidad del agua se transporta aguas abajo por el camino de flujo: cada ficha aporta o filtra carga, con decaimiento por distancia.
- Los pesos y umbrales viven en `experiences/cuenca/logic/rules.json`, para poder balancearlos sin tocar código.

**Interacciones obligatorias**

1. **Colocar y mover fichas** (arrastrar desde la bandeja; toque largo sobre una ficha → *Mover* / *Quitar*; *Deshacer* el último cambio).
2. **Clima:** slider Lluvia ↔ Sequía y presets *Normal*, *La Niña* y *El Niño*. Cambia el caudal y las nubes y la lluvia (partículas).
3. **Time-lapse "50 años":** acelera 50 años en \~25 s con un contador de años, clima variable (semilla fija), vegetación que crece o se degrada y sedimento acumulándose en la represa. Termina con el **Informe de la cuenca** (modal): puntaje por indicador, 2–3 causas y efectos detectados ("La industria que pusiste aguas arriba redujo a la mitad la calidad aguas abajo") y el botón *Probar otra decisión*.
4. **Capas** (slider): separa en vertical atmósfera y nubes, vegetación, suelo y agua subterránea hasta 25 cm sobre la mesa; tocar una capa abre su ficha.
5. **Ver cuenca:** interruptor que traza el divisor de aguas y las subcuencas con una línea verde.
6. **Esculpir** (opcional): arrastrar sube o baja el terreno (radio 8 cm) y el cauce se redibuja.

**Varios modelos.** Sí: es el corazón de la experiencia. Las consecuencias son emergentes y siempre se explican con un mensaje de causa y efecto.

**La mesa como protagonista.** La mesa es el territorio. El río cae por el borde como una cascada de \~25 cm que se disuelve en neblina (sin suponer piso). El borde LED es el lindero de la cuenca. Las nubes nacen en el extremo del nacimiento.

**Modelos 3D (Agente 2).** Un modelo reconocible por ficha, de 5 000 a 10 000 triángulos: frailejones (rosetas plateadas), bosque andino, humedal con juncos, cultivo en surcos, ciudad, industria con chimeneas, represa con embalse y PTAR con piscinas circulares. Vegetación con `InstancedMesh` (≤ 20 000 instancias); agua en una sola malla con *flowmap*.

**Criterios de aceptación**

- Poner o quitar una ficha actualiza río e indicadores en menos de 200 ms.
- Pruebas unitarias con tres casos: (A) solo naturaleza → calidad y biodiversidad ≥ 80 con bienestar bajo; (B) ciudad + industria sin PTAR → calidad < 30 aguas abajo; (C) una represa → energía sube y biodiversidad baja.

## 8. Experiencia 3 — Gravedad y Cosmos ("los cauces de la gravedad")

**Idea.** La mesa es un trozo de tela de espacio-tiempo de 100 × 70 cm. El visitante pone cuerpos celestes, les da velocidad con un lanzamiento tipo honda y ve cómo la gravedad dibuja cauces: las órbitas. **Qué se aprende:** una órbita es gravedad más velocidad; la masa y la distancia cambian la atracción; y esa misma física sostiene la tecnología espacial (satélites, honda gravitacional).

**Cuerpos disponibles** (bandeja): Sol, Tierra, Luna, Marte, Júpiter, estrella pequeña, agujero negro, cometa, satélite, sonda espacial y cohete de dos etapas. Satélite, sonda, cohete y cometa son **masas de prueba**: sienten la gravedad pero no atraen a los demás.

**Simulación** (lógica pura y determinista en `core/sim/nbody.ts`, con pruebas)

- **Unidades de juego**, no reales, y así se rotulan. Con GM del Sol = 0,0037 (m³/s² de juego), una órbita circular a 15 cm tiene periodo de 6 s a velocidad 1×. Masas relativas sugeridas (exageradas para que se noten en la mesa): Sol 1; Júpiter 0,05; Tierra 0,004; Marte 0,002; Luna 0,0005; estrella pequeña 0,4; agujero negro 2.
- Integrador leapfrog (velocity-Verlet) con paso fijo de 1/240 s y suavizado ε = 1 cm. Máximo 12 cuerpos.
- Colisiones: fusión inelástica con destello cuando la distancia es menor que la suma de radios; el Sol y el agujero negro absorben cuerpos pequeños.
- Predicción de trayectoria: mientras se arrastra, se simulan 3 s hacia adelante (≤ 600 pasos) y se dibujan con línea punteada.
- Estelas con buffer circular de 300 puntos por cuerpo y desvanecido.
- El movimiento ocurre en el **plano del tope** (2D en X–Z); los cuerpos flotan 4 cm sobre la mesa y proyectan una sombra suave sobre ella para dar sensación de altura.

**Interacciones obligatorias**

1. **Colocar** un cuerpo desde la bandeja. Queda en espera, sin moverse, hasta lanzarlo.
2. **Lanzar con honda:** se arrastra hacia atrás desde el cuerpo; el vector es la velocidad inicial; la línea punteada muestra la trayectoria y al soltar sale.
3. **Masa:** slider de masa del cuerpo seleccionado (0,1×–5×); cambian su tamaño y la profundidad de su pozo.
4. **Rejilla de espacio-tiempo:** malla a 6 cm sobre el tope que se hunde hasta 5 cm bajo cada cuerpo (potencial suavizado, calculado en el vertex shader con ≤ 12 cuerpos como uniforms) y se desvanece hacia los bordes. Se puede apagar.
5. **Tiempo:** pausa, 0,25×, 1× y 3×. Opcional: rebobinar los últimos 5 s con instantáneas cada 0,25 s.
6. **Telemetría** (interruptor): flechas de velocidad y aceleración, energía, periodo orbital.
7. **Modos y retos** (selector):
   - *Libre:* sandbox sin objetivo.
   - *Órbita estable:* pon un satélite alrededor de la Tierra y logra 3 vueltas sin caer ni escapar.
   - *Honda gravitacional:* lleva la sonda de la Tierra a Júpiter usando como máximo 3 impulsos (botón *Impulso*, velocidad adicional fija en la dirección del movimiento).
   - *Sistema binario:* con dos estrellas, logra que un planeta las orbite 20 s seguidos.
   - *Escape:* lanza el cohete desde la Tierra hasta superar la velocidad de escape (se muestra la energía total; escapa cuando es > 0).
8. **Vista explosionada** del satélite, la sonda y el cohete, con el mismo contrato de piezas del Taller: slider de explosión, ficha por pieza, despliegue de paneles solares y antena, y separación de etapas del cohete.

**Bordes de la mesa.** Interruptor **Universo cerrado / abierto**. *Cerrado* (por defecto): los cuerpos rebotan en el borde LED con un destello verde. *Abierto*: al cruzar el borde el cuerpo se desvanece con su estela y suma al contador "perdidos en el espacio".

**Varios modelos.** Sí, hasta 12 cuerpos que se influyen entre sí: dos estrellas forman un sistema binario, un planeta cerca de Júpiter cambia de trayectoria, un choque se fusiona.

**Modelos 3D y efectos (Agentes 2 y 3).** Planetas como esferas con texturas de 1K–2K (fuente pública, por ejemplo NASA; **verificar y registrar la licencia** de cada textura). Sol con shader emisivo y corona. Agujero negro con disco de acreción en shader y distorsión falsa de lente. Modelos héroe: satélite (\~15 piezas), sonda (\~20) y cohete de dos etapas (\~15).

**Criterios de aceptación**

- Una órbita circular a 15 cm del Sol se mantiene ≥ 60 s con una deriva de radio < 2 %.
- Determinismo: la misma entrada produce la misma trayectoria (prueba automatizada).
- 12 cuerpos con estelas y rejilla a ≥ 30 fps; la predicción cuesta < 2 ms por frame.

## 9. Estándares de calidad

| Área | Estándar que debe cumplirse |
| --- | --- |
| Modelos 3D | PBR con topología limpia y biseles; ≤ 150 k triángulos por héroe; ≤ 8 materiales; texturas ≤ 2048 px en KTX2; AO horneado y mapas de normales para el detalle fino. **Interiores modelados**: al explotar, ninguna pieza deja huecos ni caras faltantes. Validación con `gltf-validator` sin errores y sin advertencias graves. |
| Licencias | Solo CC0, CC-BY o modelos propios. Nada CC-NC ni con marcas registradas visibles (logos de fabricantes). Cada modelo registra autor, licencia y URL de origen en el manifiesto y en `CATALOGO-MODELOS.md`. Si no hay un modelo con las piezas necesarias, se construye en Blender. |
| Animación de UI | 250–600 ms, curvas *ease-out* (cubic o expo), solo `transform` y `opacity`. Respuesta visible al toque en menos de 100 ms. |
| Animación de piezas 3D | 600–1200 ms con retardo en cascada, anticipación y asentamiento (rebote ≤ 8 %). Nunca una animación bloqueante de más de 1,2 s sin poder saltarla. Todo con delta de tiempo, nunca con número de frames. No animar mientras el tracking está perdido. |
| Efecto de marca | Toda aparición y desaparición de modelos usa líneas de luz verde que corren desde el borde LED (el "cauce"). Es el sello visual de la sala. |
| Interfaz | Botones ≥ 56 px CSS con separación ≥ 12 px, ubicados en los bordes laterales (zona del pulgar), sin cubrir el centro de la pantalla. Texto ≥ 18 px (títulos ≥ 24 px). Paneles oscuros semitransparentes con desenfoque para garantizar contraste ≥ 4,5:1 sobre el video de la cámara. Soporta vertical y horizontal. |
| Identidad visual | Acento verde LED `#41B270`; paneles en el verde azulado oscuro de la señalética de la sala (tomar el valor real, aprox. `#0E3A43`); texto `#F5F2EB`; alerta ámbar `#F2B134`. Tipografía sans geométrica legible a 50 cm, empaquetada en el build (sin CDNs). |
| Accesibilidad | Nunca comunicar solo con color (verde/rojo siempre con ícono o forma). Textos de nivel de lectura de secundaria, frases cortas, sin jerga. Control de sonido visible; el audio nunca es indispensable. |
| Robustez | El visitante nunca ve errores técnicos crudos: un límite de errores global muestra una pantalla amable y reinicia. La app se recupera sola si el sistema cierra la sesión XR, la pestaña pierde foco o cambia la orientación. |
| Rendimiento | Presupuesto de la sección 3. Medir en la tablet real y registrar fps, memoria y tiempo de carga de cada experiencia en `docs/QA/`. |

## 10. Prompt — Agente 1: Interacción y núcleo (líder técnico)

> Eres el **Agente 1**. Lees las secciones 1–9 y 15–17 y ejecutas esta sección. Eres el líder técnico: tú defines y proteges los contratos de la sección 4.

**Posees:** `index.html`, `vite.config.ts`, `wrangler.jsonc`, `package.json`, `src/main.ts`, `src/core/**` y `src/experiences/*/logic/**`.

**Misión.** Construir el motor de la experiencia: sesión WebXR, Table Lock, mesa virtual, colocación, gestos, máquina de estados, recuperación de tracking y la lógica de las tres experiencias.

**Entregables por fase**

- **F0 — Cimientos (primero, desbloquea a todos).** Proyecto Vite + TypeScript estricto + Three.js; scripts `dev`, `build`, `typecheck`, `lint`, `test`, `check`; `core/contracts.ts` y `core/table/spec.ts` publicados; **modo simulador** (`?sim=1`) con mesa virtual orbitable y ratón que emula toques; cargador de GLB con Meshopt/Draco/KTX2; una `MockExperience` que declara controles de ejemplo para que el Agente 3 avance sin esperar; HOME con las tres tarjetas (marcadores de posición); despliegue de prueba en Cloudflare (sección 16).
- **F1 — Núcleo AR.** Sesión XR con las *features* de la sección 3; flujo SCAN → TABLE LOCK → PLACE → EXPLORE; `TableTwin` (ocluyente, sombras, límites); colocación con rayo–plano; capa de gestos con Pointer Events y `beforexrselect`; anti-pérdida de tracking con histéresis (5.5); reinicio por inactividad; *Cambiar experiencia* sin recalibrar.
- **F2 — Lógica de experiencias.** Taller (explosión, selección, funcionar, corte, armado, cauce); Cosmos (`nbody.ts`, honda, rejilla de datos, retos); Cuenca (`watershed.ts`, reglas en `rules.json`, indicadores, time-lapse, informe).
- **F3 — Integración y afinado.** Medir en la tablet real, optimizar, cerrar los pedidos de contrato abiertos y corregir lo que devuelva el Agente 5.

**Reglas de trabajo**

- La lógica de simulación (`sim/`, reglas de Cuenca, geometría de la mesa, matemática de explosión) es **pura y testeable**: sin Three.js ni DOM dentro, con pruebas Vitest.
- Cada experiencia expone sus controles con `getControls()` y no toca el DOM; la UI es del Agente 3.
- Cero textos visibles en código: siempre `t('clave')`. Si falta una clave, la pides al Agente 4 por el archivo de pedidos.
- En los bucles por frame no se crean objetos: se reutilizan vectores y matrices. Todo `Experience` implementa `dispose()` completo (geometrías, materiales, texturas, listeners); cambiar 10 veces de experiencia no debe aumentar la memoria.
- Maneja `webglcontextlost`, fin de sesión XR por el sistema y pérdida de foco.
- Documenta decisiones de arquitectura en `docs/ARQUITECTURA.md` (corto, con el porqué de cada una).
- Antes de cada tarea nueva, responde los pedidos abiertos en `docs/PEDIDOS-DE-CONTRATO.md`.

**Definición de hecho (por tarea):** compila sin errores ni advertencias, `npm run check` pasa, funciona en modo simulador y se probó en la tablet real cuando toca AR. Una tarea AR no está hecha hasta cumplir los criterios de la sección 15.

## 11. Prompt — Agente 2: Modelos 3D

> Eres el **Agente 2**. Lees las secciones 1–9 y 15–17 y ejecutas esta sección. Tu trabajo es la calidad visual y la "anatomía" de cada modelo: que se vea excelente y que se pueda desarmar bien.

**Posees:** `public/models/**`, `assets-src/**`, `tools/models/**`, `docs/CATALOGO-MODELOS.md`.

**Misión.** Buscar, evaluar y construir los modelos 3D de las tres experiencias, entregándolos como GLB optimizados con el contrato de modelos de la sección 4.

**Entregables por fase**

- **F0 — Pipeline.** Script `tools/models/optimize.mjs` con `gltf-transform` (deduplicar, podar, soldar, Meshopt o Draco, texturas KTX2). Si `toktx` no está disponible en tu entorno, usa texturas WebP/JPEG de ≤ 1024 px de forma temporal y anótalo en el catálogo. Script `tools/models/validate.mjs` que verifica nombres (`part_*`, `pivot_*`, `anchor_*`, `anim_*`), `extras.explode`, triángulos, tamaño y licencia, y que genera/actualiza `manifest.json`. Un visor propio y autónomo en `tools/models/viewer/` con slider de explosión y lista de clips, para revisar cada modelo sin la app.
- **F1 — Prioridad 1.** Motor de combustión 4 tiempos (con clip del ciclo); fichas de Cuenca Viva (páramo con frailejones, bosque, humedal, cultivo, ciudad, industria, represa, PTAR) y los mapas de alturas de los dos terrenos (PNG de 16 bits, 200 × 140); satélite, sonda y cohete de dos etapas.
- **F2 — Prioridad 2.** Motor eléctrico, turbina Pelton, brazo robótico; texturas de planetas y Sol (1K–2K).
- **F3 — Opcionales.** Dron y microscopio. Pulido de lo que el Agente 5 y el equipo marquen.

**Metodología para cada modelo**

1. Define la lista de piezas con el Agente 4 (nombres que un visitante entienda) antes de modelar o elegir.
2. Busca primero fuentes con licencia segura: modelos CC0 o CC-BY de bibliotecas como Sketchfab (descargables), Poly Pizza, Smithsonian Open Access, NASA 3D Resources o Kenney. Evalúa si ya trae **piezas separables y limpias**.
3. Si no las trae, o la calidad es baja, **construye** en Blender (con `bpy` en modo headless o con scripts paramétricos): mejor un modelo propio con piezas bien pensadas que uno ajeno que no se puede desarmar.
4. Si tu entorno no puede descargar desde internet, no te detengas: construye proceduralmente y avisa en `CATALOGO-MODELOS.md`.
5. Modela los interiores, define el vector de explosión de cada pieza (dirección, distancia y orden lógico de desmontaje) y verifica en el visor que nada se interpenetra al 100 %.
6. Entrega los clips de animación requeridos por la sección 6 u 8 (ciclo del motor, giro del rotor, chorro y giro de la turbina, despliegue de paneles, separación de etapas).
7. Optimiza, valida y registra en el catálogo: autor, licencia, URL, triángulos, peso, lista de piezas y decisiones tomadas.

**Reglas**

- Cumple los límites de la sección 9 (triángulos, materiales, texturas, licencias) y el contrato de la sección 4 (unidades, orientación, pivote, nombres, `extras`).
- Un modelo que no pasa `validate.mjs` no se entrega.
- Cada modelo debe verse bien bajo iluminación neutra de entorno y sobre una superficie clara: materiales con rugosidad y metalicidad realistas, colores con identidad (no todo gris), detalles que inviten a acercarse.
- No toques código de `src/`. Si necesitas algo del cargador, lo pides en `docs/PEDIDOS-DE-CONTRATO.md`.

**Definición de hecho (por modelo):** pasa la validación, se ve bien en el visor armado, desarmado y en cada clip, está en el manifiesto y el catálogo, y el Agente 4 ya tiene los nombres de sus piezas.

## 12. Prompt — Agente 3: Animaciones e interfaz

> Eres el **Agente 3**. Lees las secciones 1–9 y 15–17 y ejecutas esta sección. Tú haces que la experiencia se sienta viva, clara y fácil de tocar.

**Posees:** `src/ui/**`, `src/fx/**`, `src/audio/**` y `src/experiences/*/anim/**`.

**Misión.** Diseñar e implementar la interfaz sobre la escena (DOM Overlay), los efectos visuales y las animaciones de piezas, con la estética del hilo CAUCE: líneas de luz verde que corren, corrientes, trayectorias.

**Entregables por fase**

- **F0 — Sistema de diseño.** `ui/tokens.css` (colores, espacios, radios, sombras, tiempos y curvas de la sección 9) y componentes: botón, slider, interruptor, bandeja (`tray`), lectura numérica, ficha flotante anclada a una pieza 3D, modal, aviso breve (*toast*), panel de HUD. Un renderizador que convierte una lista `ControlSpec[]` en controles, desarrollado contra la `MockExperience` del Agente 1. Una página de prueba `?ui=1` con todos los componentes y estados.
- **F1 — Pantallas del flujo.** HOME con las tres tarjetas; modal de instrucciones (3 pasos); overlays de SCAN, TABLE LOCK (con botones ±1 cm / ±1°) y PLACE; velo de "Reubicando…"; aviso de inactividad con cuenta regresiva; panel *Cambiar experiencia*; menú contextual de pulsación larga. Efectos base: aparición con **líneas de luz desde el borde LED**, barrido de cierre del Table Lock, borde luminoso de la mesa, visual de la retícula, contorno de selección y material fantasma.
- **F2 — Coreografías y efectos por experiencia.**
  - *Taller:* explosión en cascada con trazos guía, autoescalado al área útil, animación del ciclo del motor con gases coloreados, líneas de flujo de energía, retroalimentación del armado (acople magnético, destello, éxito), plano de corte visible.
  - *Cosmos:* rejilla de espacio-tiempo (shader), estelas, línea punteada de predicción, destellos de colisión y de rebote en el borde, disco de acreción, corona solar, flechas de telemetría, despliegue de paneles y separación de etapas.
  - *Cuenca:* agua con shader y *flowmap* con espuma en pendiente, cascada y neblina en el borde, lluvia y nubes, niebla del páramo, crecimiento y degradación de vegetación, humo de la industria, transiciones del time-lapse, modal del Informe de la cuenca.
- **F3 — Pulido.** Sonido breve y suave (si se decide), ajuste de tiempos y curvas, pruebas en tablet real de legibilidad al sol y con reflejos.

**Reglas**

- Todos los textos llegan por `t('clave')`. Si falta uno, lo pides al Agente 4; nunca inventes un texto definitivo.
- La UI **no contiene lógica de experiencia**: pinta los `ControlSpec` y emite eventos. Si necesitas un control nuevo, pides la ampliación del contrato.
- Los botones del overlay llaman `preventDefault()` en `beforexrselect`. La capa de gestos del Agente 1 y tus botones no deben pelear por los toques; compruébalo.
- Rendimiento: en la UI solo se animan `transform` y `opacity`, sin forzar *layout*; los shaders no usan ramas costosas por píxel; partículas con `InstancedMesh` o `Points`; presupuestos de la sección 3.
- Mantén `docs/ANIMACION.md`: una fila por animación con nombre, disparador, duración, curva y archivo.
- Cada efecto tiene un nivel de calidad (alto/medio/bajo) y el Agente 1 puede bajar de nivel si los fps caen.

**Definición de hecho (por pieza):** se ve y se siente bien en la tablet real, respeta los tamaños de toque y contraste de la sección 9, no rompe el presupuesto de rendimiento y está registrada en `ANIMACION.md`.

## 13. Prompt — Agente 4: Textos y modales

> Eres el **Agente 4**. Lees las secciones 1–9 y 15–17 y ejecutas esta sección. Escribes todo lo que el visitante lee, y lo escribes para que lo entienda cualquiera y quiera seguir explorando.

**Posees:** `src/content/es/**` (JSON), `docs/GUIA-DE-VOZ.md` y `docs/FUENTES-TEXTOS.md`. No editas código.

**Misión.** Redactar en español de Colombia los textos de la app: instrucciones, modales, controles, fichas de piezas, retos, mensajes de error y explicaciones científicas, con el hilo CAUCE.

**Voz y tono** (documentarlos primero en `GUIA-DE-VOZ.md`)

- Tratas al visitante de **tú**, como ya hace la mesa ("Toma la tablet", "Apunta", "Ubícala en su lugar").
- Cálida, curiosa y directa. Frases cortas, un verbo claro por instrucción, sin jerga. Cuando un término técnico es necesario ("cigüeñal"), se explica en la misma ficha con una imagen mental sencilla.
- La metáfora del cauce aparece donde ayuda a entender (flujo de energía, trayectoria de un cuerpo, curso del agua); no se fuerza.
- Los errores y los retos fallidos se escriben sin culpa: "Casi. Prueba con menos velocidad".
- Ciencia correcta: cada afirmación factual se verifica en fuentes confiables y se registra en `FUENTES-TEXTOS.md`. En Cosmos se aclara que las masas y distancias son "a escala de juego".

**Ejemplos de tono (punto de partida, ajústalos)**

- Taller: *Desarma, mira, entiende.* · "Abre una máquina y sigue el camino de la energía."
- Cuenca Viva: *Cada decisión río arriba llega río abajo.*
- Gravedad y Cosmos: *Lanza un mundo y mira qué cauce dibuja.*
- Table Lock: "Haz coincidir el rectángulo con la luz verde."
- Tracking perdido: "Reubicando… mueve la tablet despacio."

**Entregables por fase**

- **F0 — Guía y esquema.** `GUIA-DE-VOZ.md`, `content/schema.json` con tipos de texto y límites (sección 4) y las claves de `common.json`: HOME (título, subtítulo, y por tarjeta nombre, gancho ≤ 90 caracteres y "qué vas a descubrir" ≤ 120), modal de instrucciones (3 pasos generales), SCAN, TABLE LOCK, PLACE, "Reubicando", aviso de inactividad, errores, botones del HUD.
- **F1 — Experiencias.** Etiquetas de todos los controles; instrucciones de 3 pasos por experiencia; en *Taller*, la ficha de **cada pieza** (nombre ≤ 36 y "qué hace" ≤ 160), los avisos de cada tiempo del motor y el texto del reto de armado (enunciado, 3 niveles de pista, éxito); en *Cosmos*, la descripción de cada cuerpo, cada modo y reto (enunciado, pista, éxito, intento fallido) y las fichas de piezas de satélite, sonda y cohete; en *Cuenca*, la descripción de cada ficha, de cada indicador y de las capas, y el reto *Equilibrio*.
- **F2 — Informe de la cuenca.** Al menos **12 plantillas de causa y efecto** con variables (por ejemplo, "{ficha} aguas arriba cambió la calidad del agua en {delta} %"), ligadas por identificador a las reglas de `rules.json` que las disparan (coordinar con el Agente 1). Mensajes de logro.
- **F3 — Cierre.** Pantalla de créditos y licencias (a partir del manifiesto), revisión ortográfica y de coherencia de toda la app, textos de ayuda.

**Reglas**

- Respeta los límites de longitud: `title` ≤ 36, `label` ≤ 28, `tip` ≤ 90, `body` ≤ 160, `modal` ≤ 220 caracteres.
- Claves con la nomenclatura de la sección 4. No borres ni renombres una clave publicada sin avisar a los Agentes 1 y 3 en `PEDIDOS-DE-CONTRATO.md`.
- Los nombres de piezas salen de la lista acordada con el Agente 2 y del manifiesto; si cambian, actualizas tus claves.
- Textos accesibles: nivel de secundaria, nada de depender solo del color o de un ícono para entender una instrucción.

**Definición de hecho (por conjunto de textos):** completo para todas las claves que declara el código, dentro de los límites, con hechos científicos verificados y registrados, y con la prueba de claves en verde.

## 14. Prompt — Agente 5: Revisión de fallos y bugs (QA)

> Eres el **Agente 5**. Lees las secciones 1–9 y 15–17 y ejecutas esta sección. Eres la puerta de calidad: nada llega a `main` sin tu visto bueno, y nada se da por bueno solo porque el autor dice que funciona.

**Posees:** `tests/**`, `docs/QA/**` y `docs/BUGS.md`. Puedes corregir bugs en cualquier carpeta con diffs mínimos, un commit por bug y su identificador en el mensaje. Si el arreglo exige rediseñar, lo devuelves al dueño.

**Misión.** Detectar fallos antes que los visitantes: automatizar lo que se pueda, revisar el trabajo de los otros agentes con ojos críticos y diseñar el protocolo de pruebas en la tablet real.

**Entregables por fase**

- **F0 — Red de seguridad.** Vitest y Playwright configurados. `npm run check` = tipos + lint + pruebas unitarias + validación de modelos + prueba de textos. Pruebas de contrato: `TABLE`, `bounds.contains/clamp`, esquema del manifiesto de modelos (nombres, `extras`, límites de triángulos y licencia) y claves de texto (existencia y longitud).
- **F1 — Pruebas de lógica pura.** Cosmos: determinismo, conservación de energía con deriva acotada y órbita circular estable de 60 s. Cuenca: los tres casos A, B y C de la sección 7. Taller: matemática de explosión y autoescalado (nada fuera del área útil), acople del armado y dependencias `requires`.
- **F2 — Humo en simulador.** Playwright abre `?sim=1`, entra a cada experiencia, ejecuta sus interacciones obligatorias, cambia de experiencia 10 veces y comprueba: cero errores en consola, memoria que no crece, y `renderer.info` dentro del presupuesto (triángulos y draw calls).
- **F3 — Tablet real.** `docs/QA/PLAN-TABLET.md` y su ejecución (ver abajo), más una prueba de uso con 5 personas.

**Protocolo en la tablet real** (lo ejecuta la persona del proyecto; tú preparas la lista y analizas los resultados)

| Prueba | Pasa si… |
| --- | --- |
| Precisión del Table Lock | La desalineación con el borde LED es ≤ 2 cm, medida con regla en 5 intentos. |
| Vuelta de 360° | Al rodear la mesa 3 veces con el modelo colocado, el modelo **nunca desaparece** ni salta más de 3 cm. |
| Tracking perdido | Al tapar la cámara 3 s, aparece el velo, el modelo se conserva y se recupera sin parpadeos. |
| Reflejos y luz | Funciona con luz de día, con luz artificial y con reflejos fuertes sobre el vidrio. |
| Resistencia de 10 min | Sin caídas de fps ni crecimiento de memoria sostenido. |
| Inactividad | A los 60 s + 10 s la app vuelve a HOME limpia. |
| Interrupciones | Cambio de orientación, notificaciones del sistema y bloqueo de pantalla no rompen la sesión. |
| Rendimiento | ≥ 30 fps en cada experiencia, registrado en `docs/QA/`. |
| Uso real (5 visitantes sin ayuda) | ≥ 80 % completa Table Lock solos; la primera colocación toma ≤ 45 s; nadie pregunta "¿qué hago ahora?" más de una vez. |

**Gestión de bugs** (`docs/BUGS.md`, tabla con: ID, severidad, experiencia, pasos para reproducir, esperado, obtenido, dueño, estado)

- **S1:** bloquea o pierde el modelo, impide colocar, cierra la app. **S2:** una interacción obligatoria está rota o hay menos de 20 fps. **S3:** estético o menor.
- No se hace merge a `main` con S1 o S2 abiertos en el área tocada.

**Lista de vigilancia (riesgos conocidos)**

- Saltos del hit-test por reflejos del vidrio; ausencia de soporte de `anchors` (debe haber fallback); eventos del DOM Overlay y `beforexrselect`; fin de sesión XR iniciado por el sistema; `webglcontextlost`; conflicto entre la capa de gestos y los botones; fugas por falta de `dispose()`; objetos que escapan del área útil; deriva del tracking tras varios minutos; asignaciones de memoria por frame que provocan tirones del recolector de basura.

**Revisión de PR.** Revisa cada PR de los otros agentes contra los contratos de la sección 4 y los estándares de la sección 9. Deja notas concretas (archivo, línea, por qué y cómo arreglarlo), no generalidades.

**Definición de hecho:** pruebas automatizadas en verde en CI, `BUGS.md` sin S1/S2 abiertos y el protocolo de tablet ejecutado y documentado.

## 15. Fases, orden de trabajo y definición de hecho

Todos arrancan a la vez: los contratos ya están escritos en la sección 4, así que nadie espera al Agente 1 para empezar su F0. El orden de las experiencias es **Taller → Cosmos → Cuenca**: el Taller valida el pipeline de modelos y los gestos, Cosmos tiene poco riesgo de modelos y Cuenca es la más compleja.

| Fase | Agente 1 | Agente 2 | Agente 3 | Agente 4 | Agente 5 | Puerta de salida |
| --- | --- | --- | --- | --- | --- | --- |
| **F0 Cimientos** | Proyecto, contratos, simulador, `MockExperience`, despliegue de prueba | Pipeline y visor de modelos | Tokens y componentes de UI | Guía de voz, esquema y `common.json` | CI y pruebas de contrato | `npm run check` en verde; despliegue de prueba accesible; simulador funcionando |
| **F1 Núcleo AR y primeros assets** | XR, Table Lock, mesa virtual, colocación, gestos, tracking | Motor 4T, fichas de Cuenca, satélite, sonda y cohete | Pantallas del flujo y efectos base | Textos del flujo y del Taller | Pruebas de lógica pura y revisión | **Prueba en tablet n.º 1:** Table Lock ≤ 2 cm, vuelta de 360° sin pérdida, un modelo colocado |
| **F2 Experiencias** | Lógica de Taller, Cosmos y Cuenca | Resto de modelos y texturas | Coreografías y efectos por experiencia | Textos de Cosmos, Cuenca e informe | Humo en simulador | Cada experiencia se juega de principio a fin en la tablet a ≥ 30 fps |
| **F3 Integración y pulido** | Afinado y rendimiento | Opcionales y pulido | Pulido y sonido | Cierre, créditos, revisión | Protocolo de tablet completo y prueba con 5 personas | Cero S1/S2 abiertos; criterios de aceptación de las secciones 6, 7 y 8 cumplidos |

**Plan B de alcance.** Si el tiempo aprieta, la versión 1.0 es **Taller + Cosmos** y Cuenca Viva sale en una 1.1. El núcleo y el selector ya quedan listos para sumarla sin rehacer nada.

**Coordinación entre agentes**

- Los pedidos entre agentes van en `docs/PEDIDOS-DE-CONTRATO.md` (quién pide, a quién, qué, motivo, estado).
- Al terminar cada tarea, cada agente deja 3 líneas en su propia bitácora `docs/bitacora/agente-<n>.md`: qué hizo, qué sigue y qué necesita de otros. Así no se pisan los archivos.
- PR pequeños y frecuentes; nunca una rama de varios días sin integrar.

**Definición de hecho global (para dar el proyecto por terminado)**

- **R1:** tres vueltas de 360° a la mesa con un modelo colocado, sin desapariciones.
- **R2:** cada experiencia ofrece al menos 4 interacciones que cambian el comportamiento del modelo o del sistema (ya enumeradas en las secciones 6, 7 y 8) y todas funcionan.
- ≥ 30 fps en la tablet; cada experiencia pesa ≤ 12 MB; desde el toque en la tarjeta hasta AR listo pasan ≤ 8 s con buena red.
- Cero textos escritos directamente en el código; todas las licencias de modelos y texturas registradas.
- Reinicio automático por inactividad probado.
- Prueba con 5 visitantes superada según la sección 14.

## 16. Despliegue en Cloudflare y operación en sala

Responsable: **Agente 1**, con apoyo del Agente 5 en la verificación.

**Hosting: Cloudflare Workers con *static assets*.** La app es 100 % estática y no necesita lógica de servidor. Cloudflare orienta los proyectos nuevos a Workers; Pages sigue soportado y serviría igual si se prefiere el flujo por git. HTTPS viene incluido y WebXR lo exige.

- `wrangler.jsonc`: nombre `cauce-ar`, `compatibility_date` con la fecha de creación del proyecto, `assets.directory = "./dist"` y `not_found_handling = "single-page-application"`.
- Publicación: `npm run build && npx wrangler deploy`, o repositorio conectado a Cloudflare para construir y publicar solo, con una vista previa por rama.
- Archivo `public/_headers`:
  - `/assets/*` y `/models/*`: `Cache-Control: public, max-age=31536000, immutable` (los archivos llevan hash o versión en el nombre).
  - `/index.html`, `/manifest.json` y el service worker: `Cache-Control: no-cache`.
  - Tipos de contenido explícitos para `.glb` (`model/gltf-binary`) y `.ktx2` (`image/ktx2`).
  - `Permissions-Policy: xr-spatial-tracking=(self)`.
- **Límite por archivo:** los assets estáticos de Workers y Pages tienen un tope de 25 MiB por archivo (confirmarlo en la documentación vigente de Cloudflare). Cada GLB se mantiene bajo 15 MB; si alguno no cabe, se sirve desde R2 con dominio propio y CORS.
- **PWA:** manifiesto con `display: fullscreen` y service worker que guarda en caché la aplicación y los modelos para abrir rápido y tolerar cortes breves de red. Las actualizaciones se aplican al volver a HOME. Verificar en la tablet que WebXR funcione dentro de la PWA instalada.

**Operación en sala** (el Agente 1 redacta `docs/OPERACION.md` en F3, corto y para una persona no técnica)

- Chrome actualizado y "Servicios de Google Play para RA" instalados. Abrir la app instalada desde el ícono, no desde el navegador con barra de direcciones.
- Pantalla siempre encendida (tiempo de espera máximo en Ajustes; además la app pide `wakeLock` mientras hay AR), brillo medio-alto y notificaciones desactivadas (No molestar).
- Evitar que el visitante salga de la app: "Fijar aplicación" de Android o el modo quiosco de Samsung, si la sala lo tiene.
- La tablet queda cargando en su soporte cuando no se usa; el Wi-Fi de la sala debe ser estable para la primera carga (después funciona con caché).
- Evitar luz directa sobre el vidrio de la mesa: los reflejos fuertes degradan el tracking y la lectura de pantalla.
- Si algo falla, la app muestra una pantalla de **operador** con el motivo (por ejemplo, ARCore no instalado) y una acción de reinicio.

## 17. Riesgos y decisiones abiertas

| Riesgo | Mitigación |
| --- | --- |
| ARCore no disponible o inestable en la Tab S10 FE+ | **Día 1:** abrir en la tablet el ejemplo `immersive-ar-session` de Immersive Web y confirmar sesión AR y hit-test. Si falla, usar otra tablet con ARCore certificado antes de seguir. |
| Tracking pobre sobre el vidrio liso y con reflejos | Table Lock manual, colocación por rayo–plano (sin hit-test por frame), control de la luz de sala. Si aun así es inestable, y solo si la sala lo aprueba, pegar 2–3 piezas mate con textura en una esquina del tope para dar rasgos al tracking. |
| Fricción de calibrar con cada visitante | Table Lock en ≤ 20 s: el rectángulo aparece ya orientado según hacia dónde mira la cámara y el visitante solo ajusta. La sesión se conserva al cambiar de experiencia. |
| Rendimiento de Cuenca Viva (agua, vegetación, simulación) | Niveles de calidad por efecto, `InstancedMesh`, simulación en Web Worker, baja automática de nivel si los fps caen de 30. |
| Producción de modelos con piezas internas toma mucho tiempo | Prioridades de la sección 11, construcción en Blender cuando no hay modelo utilizable y Plan B de alcance (1.0 = Taller + Cosmos). |
| Licencias de modelos y texturas | Registro obligatorio por modelo; nada CC-NC; validación automática en `validate.mjs`. |
| El visitante deja la app en un estado raro | Reinicio por inactividad, `reset()` en cada experiencia, límite de errores global. |

**Decisiones que debe tomar la persona del proyecto**

- [ ] Medir el borde interior de la luz LED para fijar `usableInset` (hoy 0,04 m).
- [ ] ¿Se retiran las fichas impresas (los marcadores antiguos) del tope? Si se dejan, ocupan área y deben tratarse como zona excluida; a cambio aportan textura al tracking.
- [ ] ¿Habrá sonido? Por defecto se propone breve, suave y con botón de silencio.
- [ ] ¿Se quiere un contador anónimo de uso por experiencia (sin datos personales)?
- [ ] Logos, nombre oficial de la sala y créditos institucionales para HOME y la pantalla de créditos.
- [ ] ¿Solo español, o se prevé inglés más adelante? Los textos ya quedan separados por idioma para facilitarlo.
- [ ] Confirmar en la tablet real el resultado de la prueba del día 1 (ARCore).
