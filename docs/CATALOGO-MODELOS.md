# Catálogo de modelos — Mesa CAUCE

Dueño: Agente 2. Fuente de verdad de licencias y decisiones de cada modelo. El manifiesto (`public/models/manifest.json`) lo genera `validate.mjs`; no se edita a mano.

## Pipeline

| Paso | Comando | Qué hace |
| --- | --- | --- |
| Construir + optimizar | `npm run models:optimize -- --build` | Corre el script procedural de cada modelo (`tools/models/build/*.mjs` → `assets-src/**.src.glb`) y lo optimiza a `public/models/**`. Sin `--build` solo optimiza los `.src.glb` existentes. Admite ids: `-- --build motor4t`. |
| Optimizar un archivo suelto | `node tools/models/optimize.mjs in.glb out.glb` | dedup → prune (conserva anclas vacías y extras) → weld → resample → texturas → Meshopt (con cuantización). |
| Validar + manifiesto | `npm run models:validate` | Ver lista abajo. Sale con 0 si todo es válido o no hay modelos; 1 si hay errores. Un modelo con errores **no** entra al manifiesto. `--check` valida sin escribir; `--at=0.5` (depuración) evalúa la explosión a otra fracción. |
| Mapas de alturas | `node tools/models/build/cuenca-heightmaps.mjs` | Genera `public/models/cuenca/{andina,valle}.{png,json}`. |
| Visor | `node tools/models/viewer/serve.mjs` → <http://localhost:5180/> | Visor autónomo (three desde `node_modules`): selector de modelos del manifiesto, slider de explosión con cascada, clips (play/pausa, velocidad), rayos X, alambre, cajas de interpenetración, huellas 0,35 × 0,35 y 0,90 × 0,60, clic para aislar pieza. `?id=<id>` o `?file=/assets-src/....glb` para abrir directo. |

**Registro:** `tools/models/models.config.json` (id, experiencia, `kind` hero|prop, script, licencia, autor, fuente, clips con duración y bucle, piezas/pivotes/anclas obligatorios, límites de triángulos y huella). Todo GLB en `public/models` debe estar registrado (si no, error: licencia desconocida).

**`validate.mjs` comprueba:** licencia CC0 | CC-BY | own (CC-BY exige URL), autor y fuente; `gltf-validator` sobre el archivo **y** sobre una copia decodificada (el validador no lee buffers Meshopt); ≤ 8 materiales; texturas ≤ 2048 (≤ 1024 si no son KTX2); triángulos (héroe ≤ 150 k; props según registro); peso ≤ 15 MB y presupuesto ≤ 12 MB por experiencia; nombres `part_|pivot_|anchor_|geo_` y clips `anim_*`; cada `part_*` cuelga de la escena con `extras` completos (`partId` = sufijo, `group`, `explode` con `dir` unitario, `dist` ≥ 0, `order` entero, `labelKey` = `exp.<exp>.<modelo>.title.<partId>` (D16), `requires` válido, sin ciclos y coherente con `order`; `model` reservado (P-007)); mallas solo dentro de piezas; anclas vacías; origen en la base; armado ≤ 0,35 × 0,35; desarmado ≤ 0,90 × 0,60 y sin piezas bajo el tope; **ninguna caja de pieza se cruza al 100 %** (tolerancia 0,5 mm); huella de props (diámetro).

**Texturas.** No hay `toktx` en este entorno. Hoy ningún modelo usa texturas (PBR por factores), así que no aplica. Si un modelo trae texturas, `optimize.mjs` las pasa a **WebP ≤ 1024 px** (temporal) y el manifiesto lo anota en `notes`. Para KTX2 hará falta `toktx` + `@gltf-transform/cli` (no pedido aún: no hay texturas que lo necesiten).

**Convención de nodos (todos los modelos):**

- `part_<id>` — pieza separable; lleva `extras` (`PartExtras`). **Nunca está animado**: la explosión mueve este nodo y no choca con los clips.
- `pivot_<id>` — hijo de la pieza, nodo **animado** por los clips (giro, traslación o escala). En el motor hay pivote para toda pieza que se mueve en `anim_cycle`, no solo `crankshaft` y `camshaft`. Para "Ver en acción" basta reproducir el clip y mostrar solo esa pieza.
- `geo_<id>` — nodo con la malla (la cuantización Meshopt puede ponerle escala/traslación; no usarlo como referencia).
- `anchor_<nombre>` — vacío, para fichas flotantes y efectos.

## Modelos

### motor4t — Motor de combustión 4 tiempos (Taller)

| Campo | Valor |
| --- | --- |
| Archivo | `public/models/taller/motor4t.glb` |
| Licencia / autor / fuente | own · Mesa CAUCE — Agente 2 · `repo:tools/models/build/motor4t.mjs` |
| Triángulos / peso | 80 436 · 887 KB (Meshopt) · 8 materiales · ~47 primitivas |
| Armado | 0,203 (X) × 0,335 (Z) × 0,396 (Y) m |
| Desarmado (100 %) | 0,804 × 0,555 m de huella, 0,625 m de alto; sin cruces de cajas |
| Clip | `anim_cycle` · 8 s · bucle |
| Anclas | `anchor_label_top` (0, 0,43, 0) · `anchor_combustion` (centro de la cámara, y ≈ 0,275) |
| Validación | OK (gltf-validator sin errores ni advertencias) |

**Búsqueda de modelos externos.** No se encontró uno CC0/CC-BY con las 26 piezas separables y cinemática coherente; se construyó procedural (three.js en Node + gltf-transform, sin Blender), con piezas y explosión pensadas desde el inicio.

**Geometría.** Monocilíndrico, diámetro 70 mm, carrera 60 mm (manivela 30 mm), biela 110 mm, eje del cigüeñal a 0,10 m. El cigüeñal y el árbol de levas giran sobre **X**; biela y válvulas se mueven en el plano Y–Z (vista clásica desde los costados ±X). Frente +Z: escape al frente, admisión y carburador atrás. Volante-magneto a −X (imanes en la llanta, ventilador), distribución por cadena a +X (piñones 16/32, relación 2:1). Árbol de levas en culata (OHC) con dos balancines de dedo; válvula de admisión en (−10, −17) mm y de escape en (+10, +17) mm; bujía lateral en el cuadrante libre (−X, +Z). Interiores modelados: cárter hueco en herradura con alojamientos de rodamiento, pistón hueco con 3 surcos y alojamientos del bulón, bulón hueco, cilindro con camisa y aletas, culata con cámara de combustión, asientos, guías, torres de levas y ejes de balancín, tapa de válvulas hueca, colector y escape con pared (tubo hueco).

**Materiales (8):** aluminio, pintura negra (aletas, volante), acero pulido, pintura roja (tapa de válvulas), latón (piñones, carburador, resortes), acero de escape (tono térmico), cerámica (bujía), acero oscuro (camisa, cadena, segmentos).

**Ciclo `anim_cycle` (8 s, bucle).** Cigüeñal 2 vueltas, árbol de levas 1 vuelta (θ/2). Pistón, segmentos y bulón con cinemática exacta biela-manivela; biela con traslación + giro (error de cierre biela/muñequilla < 0,02 mm). Levas con perfil coseno² coherente con la geometría de la leva; válvulas, resortes (escala Y) y balancines sincronizados. Distribución: AAA 10° antes de PMS, RCA 50° después de PMI, AAE 50° antes de PMI, RCE 10° después de PMS; alzada 6,8 mm; holgura mínima válvula-pistón 16 mm.

| Tiempo | Segundos | Ángulo de cigüeñal |
| --- | --- | --- |
| 1 Admisión | 0–2 | 0–180° |
| 2 Compresión | 2–4 | 180–360° |
| 3 Expansión (chispa en t = 4 s, PMS) | 4–6 | 360–540° |
| 4 Escape | 6–8 | 540–720° |

(La misma tabla va en `extras` del clip: `phases`, `ignitionAt`; GLTFLoader no la copia, así que se documenta aquí.) La **cadena de distribución es estática** en el clip (los piñones giran); limitación conocida.

**Piezas, explosión y montaje** (`order` 1 = sale primero; se deriva de `requires`, así la cascada de la explosión es el inverso exacto del reto de armado):

| order | partId | group | dir | dist (m) | requires | pivote |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | oil_pan | case | 0,0,−1 | 0,225 | crankcase_left, crankcase_right | |
| 1 | valve_cover | case | −0,88, 0,48, 0 | 0,284 | rocker_intake, rocker_exhaust, camshaft, timing_gear_cam | |
| 1 | flywheel | motion | −1,0,0 | 0,300 | crankcase_left | sí |
| 1 | spark_plug | ignition | −0,91, −0,23, 0,34 | 0,351 | cylinder_head | |
| 1 | carburetor | intake | −0,94, −0,24, −0,24 | 0,255 | intake_manifold | |
| 1 | exhaust_pipe | exhaust | 0,95, 0, 0,32 | 0,269 | cylinder_head | |
| 2 | rocker_intake | valvetrain | 0,50, 0,53, −0,68 | 0,300 | valve_spring_intake | sí |
| 2 | rocker_exhaust | valvetrain | 0,66, 0,42, −0,62 | 0,385 | valve_spring_exhaust | sí |
| 2 | timing_gear_cam | valvetrain | 0,99, 0,13, 0 | 0,237 | camshaft, timing_chain | sí |
| 2 | intake_manifold | intake | −0,68, 0, −0,73 | 0,177 | cylinder_head | |
| 3 | valve_spring_intake | valvetrain | 0,56, 0,33, −0,76 | 0,270 | intake_valve | sí |
| 3 | valve_spring_exhaust | valvetrain | 0,71, 0,25, −0,66 | 0,362 | exhaust_valve | sí |
| 3 | timing_chain | valvetrain | 1,0,0 | 0,300 | timing_gear_crank, camshaft | |
| 4 | intake_valve | valvetrain | 0,59, 0,02, −0,81 | 0,254 | cylinder_head | sí |
| 4 | exhaust_valve | valvetrain | 0,73, 0,01, −0,69 | 0,350 | cylinder_head | sí |
| 4 | camshaft | valvetrain | 0, 0,48, −0,88 | 0,269 | cylinder_head | sí |
| 4 | timing_gear_crank | valvetrain | 1,0,0 | 0,235 | crankcase_right | sí |
| 5 | cylinder_head | case | 0,1,0 | 0,270 | cylinder | |
| 6 | cylinder | case | 0,1,0 | 0,125 | crankcase_left, crankcase_right, piston_rings, piston_pin | |
| 7 | piston_rings | motion | 0, 0,38, 0,92 | 0,222 | piston | sí |
| 7 | piston_pin | motion | 0,46, 0, 0,89 | 0,230 | piston, connecting_rod | sí |
| 7 | crankcase_right | case | 1,0,0 | 0,175 | crankshaft | |
| 7 | crankcase_left | case | −1,0,0 | 0,175 | crankshaft | |
| 8 | piston | motion | 0,0,1 | 0,205 | connecting_rod | sí |
| 9 | connecting_rod | motion | 0, −0,42, 0,91 | 0,226 | crankshaft | sí |
| 10 | crankshaft | motion | (0,1,0) | 0 | — (se monta primero) | sí |

Disposición al 100 %: columna central (cigüeñal, cilindro, culata), cárteres a los lados ±X, volante y bujía a −X, distribución y escape a +X, grupo pistón-biela al frente (+Z), tren de válvulas y árbol de levas atrás-derecha (−Z, +X), admisión atrás-izquierda.

**Pendiente / mejoras:** AO horneado y mapas de normales (hoy solo PBR por factores; requeriría UV + horneado, sin Blender en este entorno); cadena animada; agujero de bujía en la culata (hoy la bujía atraviesa el metal sin agujero visible al desarmar).

### Fichas de Cuenca Viva (8)

Procedurales propias (`repo:tools/models/build/cuenca-fichas.mjs`), estilo low-poly facetado, sin texturas. Disco base Ø 11 cm × 8 mm con **anillo de color por ficha** (reconocible a distancia). Origen en el centro de la base, Y arriba. Nodos: `geo_base`, `geo_detail`, `geo_water` (si hay agua, para que el Agente 3 pueda cambiarle el material), anclas. Licencia own.

| id | tris | KB | anclas | notas |
| --- | --- | --- | --- | --- |
| cuenca_paramo | 5 196 | 92 | label_top | 7 frailejones (tallo con hojas secas + roseta plateada de 3 coronas), pajonal, rocas |
| cuenca_bosque | 5 028 | 109 | label_top | 8 árboles de copas facetadas en dos verdes, helechos |
| cuenca_humedal | 5 176 | 78 | label_top, water | espejo de agua irregular, juncos y espadañas, hojas flotantes |
| cuenca_cultivo | 8 984 | 196 | label_top | surcos: mitad café (con cerezas rojas), mitad papa; poste y cerca |
| cuenca_ciudad | 9 860 | 129 | label_top, sewage | 4 manzanas, edificios con fajas de ventanas, casas de teja, iglesia; `sewage` = punto de vertimiento |
| cuenca_industria | 5 416 | 61 | label_top, smoke_1, smoke_2, outfall | nave con techo de sierra, 2 chimeneas a franjas, tanques, tubería y canal de vertimiento |
| cuenca_represa | 5 388 | 89 | label_top, spillway, turbine | presa en arco (río a lo largo de X: aguas arriba −X), embalse, vertedero, compuertas, casa de máquinas y tubería forzada |
| cuenca_ptar | 5 128 | 77 | label_top, water | 2 clarificadores (agua cruda y tratada), sedimentador, edificio; `pivot_clarifier` + clip `anim_idle` (12 s, bucle) del puente giratorio |

Huella validada ≤ 12 cm de diámetro en todas. Juntas pesan ≈ 0,8 MB.

### Mapas de alturas (Cuenca Viva)

| Archivo | Contenido |
| --- | --- |
| `public/models/cuenca/andina.png` + `.json` | Andina: páramo y cabecera alta en −X, cañón en V que se abre a valle hacia +X. Máx. 11,5 cm. |
| `public/models/cuenca/valle.png` + `.json` | Valle intermontano: fondo plano a lo largo de X entre dos cordilleras, cabecera cerrada en −X. Máx. 11,7 cm. |

- **Formato:** PNG gris **16 bits**, 200 × 140 (D14: la simulación promedia 2×2 → 100 × 70).
- **Escala altura ↔ valor:** `h (m) = v / 65535 × 0,12` (v = 0…65535; 1 unidad ≈ 1,8 µm). Relieve máximo 12 cm (techo suave desde 9 cm, sin mesetas recortadas).
- **Píxel → mesa:** columna i → `x = −0,50 + (i + 0,5) × 0,005`; fila j → `z = −0,35 + (j + 0,5) × 0,005` (fila 0 = borde z = −0,35).
- **Río:** nace en x = −0,45 y sale por el borde x = +0,50; la polilínea del cauce, el nacimiento y la salida están en el `.json`.
- **Drenaje garantizado:** relleno de depresiones (priority-flood, ε = 4 unidades) a **100 × 70** sembrado solo en la celda de salida; la malla fina se ajusta por bloque para que cada 2×2 promedie **exactamente** el valor grueso. Verificado con D8 a 100 × 70: 0 pozos y 100 % de las celdas drena al borde +X por la salida del río.

## Registro de licencias

| Modelo / asset | Licencia | Autor | Fuente |
| --- | --- | --- | --- |
| motor4t | own | Mesa CAUCE — Agente 2 | repo:tools/models/build/motor4t.mjs |
| cuenca_* (8 fichas) | own | Mesa CAUCE — Agente 2 | repo:tools/models/build/cuenca-fichas.mjs |
| andina.png, valle.png | own | Mesa CAUCE — Agente 2 | repo:tools/models/build/cuenca-heightmaps.mjs |
