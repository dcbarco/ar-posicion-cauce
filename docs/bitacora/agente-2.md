# Bitácora — Agente 2 (Modelos 3D)

- **Hice:** pipeline (`tools/models/optimize.mjs`, `validate.mjs` con gltf-validator + chequeo de interpenetración al 100 %, registro `models.config.json`, visor `tools/models/viewer/`), motor 4T procedural (26 piezas, 80 k tris, 887 KB, `anim_cycle` 8 s con cinemática exacta), 8 fichas de Cuenca (5–10 k tris, Ø 11 cm) y mapas `andina`/`valle` (16 bits, 200×140, drenaje D8 verificado); todo valida y está en el manifiesto y en `CATALOGO-MODELOS.md`.
- **Sigue:** satélite, sonda y cohete de dos etapas (F1), luego motor eléctrico, Pelton, brazo y texturas de planetas (F2); pulir cadena animada y AO del motor.
- **Necesito:** A1 → P-011 (versionar URLs de GLB por la caché inmutable de `/models/*` y usar `pivot_*` como nodos animados internos); A4 → P-002 respondido, nombres de las fichas de Cuenca (`exp.cuenca.<id>.*`) cuando escriba Cuenca.
