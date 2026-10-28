# Notas de sesión — 2026-10-28

Para retomar (`claude --resume` o leyendo este archivo). Sigue la de `NOTAS-SESION-2026-10-27.md`.
**Nada está commiteado todavía**: todo el trabajo desde 7fc6746 está en el árbol de `main`.

## Estado al cerrar: F1 validada en la tablet con el Taller

Probado en la tablet por la persona del proyecto: el flujo HOME → INTRO → SCAN → LOCK → PLACE → EXPLORE funciona
y el Taller (motor 4 tiempos) se ve y se usa bien en sala. Lo hecho en esta jornada:

| Tema | Qué quedó | Dónde está documentado |
| --- | --- | --- |
| BUG-009 (3D invisible en AR) | Cerrado: se fuerza `XRWebGLLayer` | D23, `BUGS.md` |
| Deriva de altura del tope | Se corrige sola entre 1 y 8 cm; el aviso de recalibrar sale solo con > 8 cm durante 4 s o tracking perdido > 12 s | D22 |
| Diagnóstico | Solo con `?diag=1` | bitácora A1 |
| Tipografía y marca | Space Grotesk + Plus Jakarta Sans, logo oficial | D21 |
| Paleta | CAUCE, tema claro, contrastes medidos | D24 |
| Modo sala `?sala=1` | La sesión AR y la calibración se conservan entre visitantes; el operador calibra manteniendo el logo 3 s | D25 |
| HUD compacto | Ficha de pieza a un costado con línea guía; panel de controles pequeño y plegable | D26, `ANIMACION.md` |

Verificación al cerrar: typecheck, lint y 151 pruebas unitarias OK. **E2E sin correr**: el puerto 5173 está
ocupado por el servidor de la tablet (`npm run dev:https`, que sigue vivo aunque se cierre la consola que lo lanzó).
Para correrlo, detén ese servidor antes de lanzar `npm run test:e2e`.

## Pendientes antes de pasar de fase

1. **Commit** de todo en una rama nueva (p. ej. `f1-tablet`) y PR a `main`. Antes, `npm run check` y `npm run test:e2e`.
2. Decidir si se conserva el **escaneo tolerante** (hit-test que resta en vez de reiniciar y tope estimado a 0,45 m
   a los 6 s), que se añadió mientras se buscaba BUG-009.
3. **BUG-008 (S3, abierto)**: un clic sin mover antes el ratón a veces no coloca el modelo en el simulador.
4. Falta probar en la tablet:
   - el objetivo táctil de 40–44 px del HUD compacto con más visitantes (si cuesta, subirlo a 48 px en `ui.css`, `.cx-rail--controls .cx-ctrl-panel`);
   - el modo sala durante un día completo (temperatura, recuperación del ancla);
   - que mantener el logo no abra el menú de imagen de Chrome.
5. Opcional: PWA a pantalla completa (manifiesto + íconos) para el botón atrás en modo quiosco.

## Siguiente fase: F2 Experiencias

El brief (sección 15) fija el orden **Taller → Cosmos → Cuenca** y el plan B (1.0 = Taller + Cosmos).

| Experiencia | Estado | Qué falta |
| --- | --- | --- |
| Taller | Lógica real con el motor 4T | Motor eléctrico, turbina Pelton y brazo (modelos de A2, textos de A4) |
| Cosmos | `MockExperience`; en la lista `SOON` de `src/ui/screens.ts` (gris, «Próximamente») | Lógica sobre `src/core/sim/nbody.ts`, modelos de satélite, sonda y cohete, textos |
| Cuenca | `MockExperience`; en `SOON` | Lógica sobre `watershed.ts` y `rules.json`, fichas, textos e informe |

- Al habilitar una experiencia, sácala de `SOON`; las pruebas de humo F2 (`QA_F2=1 npm run test:e2e`) la recorren.
- Las experiencias nuevas declaran sus controles con `getControls()`, y el panel compacto los pinta sin cambios en la UI.
  Si una experiencia necesita una bandeja, `.cx-tray` ya tiene su tamaño compacto.
- Puerta de salida de F2: cada experiencia se juega de principio a fin en la tablet a ≥ 30 fps.
