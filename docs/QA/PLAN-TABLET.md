# Plan de prueba en la tablet real — Mesa CAUCE

**Para quién:** la persona del proyecto, sin conocimientos técnicos. **Duración:** unos 60 minutos, más la prueba con visitantes.
**Dónde anotar:** copia este archivo como `docs/QA/resultados/AAAA-MM-DD-tablet.md` (por ejemplo `2026-11-03-tablet.md`) y llena las casillas y las columnas **Resultado** y **Notas**. Si no puedes editar archivos, imprime esta hoja, llénala a mano y envíale una foto al equipo.
**Cómo marcar:** `[x]` = hecho. En **Resultado** escribe **PASA**, **FALLA** o **NO SE PUDO** (y explica por qué en Notas). Si algo falla, toma foto o video de la pantalla y anota la hora.

---

## 0. Datos de la sesión

| Dato | Valor |
| --- | --- |
| Fecha y hora | |
| Persona que prueba | |
| Versión de la app (se ve en el pie de HOME o pregunta al equipo) | |
| Tablet | Samsung Galaxy Tab S10 FE+ |
| Versión de Chrome (Ajustes de Chrome → Acerca de Chrome) | |
| "Servicios de Google Play para RA" instalado (sí / no) | |
| Luz de la sala (día / artificial / mixta) | |
| `usableInset` medido (borde interior de la luz LED, en cm) | |

## 1. Preparación (antes de empezar)

- [ ] La tablet tiene más del 70 % de batería.
- [ ] Brillo medio-alto. Modo **No molestar** activado.
- [ ] La app se abre desde el **ícono instalado** (no desde el navegador con barra de direcciones).
- [ ] Una regla o cinta métrica a mano.
- [ ] Un cronómetro (el del celular sirve).
- [ ] Una hoja o cartón para tapar la cámara.
- [ ] Si se piden fps: el equipo deja activado el contador en pantalla (pregunta cómo verlo).

---

## 2. Pruebas

### 2.1 Precisión del Table Lock (calibrar la mesa)

**Pasa si:** el rectángulo verde digital queda a **2 cm o menos** de la luz verde real, en los 5 intentos.

1. [ ] Abre una experiencia y toca **Entrar en AR**.
2. [ ] Sigue las instrucciones: apunta al centro de la mesa, toca, y ajusta el rectángulo hasta que coincida con la luz verde.
3. [ ] Confirma. Con la regla, mide la mayor separación entre el borde digital y la luz real (mira las 4 esquinas).
4. [ ] Toca **Recalibrar mesa** y repite hasta completar 5 intentos.

| Intento | Separación máxima (cm) | Tiempo para calibrar (s) | Resultado | Notas |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

### 2.2 Vuelta de 360°

**Pasa si:** al rodear la mesa 3 veces con un modelo puesto, el modelo **nunca desaparece** ni salta más de 3 cm.

1. [ ] Calibra y coloca un modelo en el centro de la mesa.
2. [ ] Camina despacio alrededor de la mesa, apuntando siempre al modelo. Da 3 vueltas completas.
3. [ ] Observa: ¿desapareció alguna vez? ¿Saltó de lugar? ¿Cuánto (aprox.)?

| Vuelta | ¿Desapareció? (sí/no) | ¿Saltó? ¿Cuánto (cm)? | Resultado | Notas |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

### 2.3 Tracking perdido (tapar la cámara)

**Pasa si:** aparece el aviso "Reubicando…", el modelo **sigue ahí** y, al destapar, se recupera **sin parpadeos**.

1. [ ] Con un modelo colocado, tapa la cámara trasera con la hoja durante 3 segundos (cuenta "uno, dos, tres").
2. [ ] Destapa y espera.

| Intento | ¿Apareció "Reubicando…"? | ¿El modelo siguió visible? | ¿Volvió sin parpadear? | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

4. [ ] Extra: tapa la cámara **10 segundos**. ¿Aparece la sugerencia de **Recalibrar mesa**? (Debe aparecer tras ~8 s.) Resultado: ______

### 2.4 Reflejos y luz

**Pasa si:** la calibración y la colocación funcionan en las tres condiciones.

| Condición | ¿Calibró bien? | ¿Colocó bien? | ¿Hubo saltos? | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| Luz de día | | | | | |
| Solo luz artificial | | | | | |
| Reflejo fuerte sobre el vidrio (lámpara o linterna apuntando al tope) | | | | | |

### 2.5 Resistencia de 10 minutos

**Pasa si:** durante 10 minutos de uso continuo no hay tirones ni la app se pone lenta.

1. [ ] Usa cada experiencia unos 3 minutos sin cerrar la app (mueve piezas, cambia de experiencia, explora).
2. [ ] Anota cada minuto si notas lentitud (y, si está visible, los fps).

| Minuto | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fps (si se ve) | | | | | | | | | | |
| ¿Lento? (sí/no) | | | | | | | | | | |

Resultado: ______ · ¿La tablet se calentó mucho? ______ · Notas: ______

### 2.6 Inactividad (reinicio solo)

**Pasa si:** a los 60 s sin tocar aparece "¿Sigues ahí?" y, 10 s después, la app vuelve sola a HOME, limpia.

1. [ ] Coloca un modelo y deja la tablet quieta **sin tocarla**. Inicia el cronómetro.
2. [ ] Anota en qué segundo aparece "¿Sigues ahí?": ______ s (esperado ≈ 60).
3. [ ] Anota en qué segundo vuelve a HOME: ______ s (esperado ≈ 70).
4. [ ] Repite y esta vez toca **Continuar** cuando aparezca el aviso: ¿la experiencia sigue igual? ______
5. [ ] Al volver a HOME, entra a otra experiencia: ¿empieza limpia (sin piezas movidas ni restos de la anterior)? ______

Resultado: ______ · Notas: ______

### 2.7 Interrupciones

**Pasa si:** nada de esto rompe la sesión ni deja la app en un estado raro (si la sesión AR se cierra, la app vuelve sola a HOME).

| Acción | Qué pasó | Resultado | Notas |
| --- | --- | --- | --- |
| Girar la tablet de horizontal a vertical y de vuelta | | | |
| Bajar la barra de notificaciones y volver | | | |
| Bloquear la pantalla (botón de encendido) 5 s y desbloquear | | | |
| Botón de inicio de Android y volver a la app | | | |
| Recibir una notificación (pídele a alguien que te escriba) | | | |

### 2.8 Rendimiento por experiencia

**Pasa si:** cada experiencia se mantiene en **30 fps o más**. Pídele al equipo que active el contador de fps.

| Experiencia | fps típico | fps más bajo visto | Tiempo desde tocar la tarjeta hasta AR listo (s, esperado ≤ 8) | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| Taller (explosión total) | | | | | |
| Cosmos (12 cuerpos con estelas) | | | | | |
| Cuenca Viva (time-lapse) | | | | | |

### 2.9 Uso real con 5 visitantes (sin ayuda)

**Pasa si:** al menos 4 de 5 (80 %) calibran solos; la primera colocación toma **45 s o menos**; nadie pregunta "¿qué hago ahora?" más de una vez.

Instrucción para el visitante: "Prueba esta mesa. Yo solo miro; haz lo que creas". **No le ayudes** salvo que lo pida dos veces.

| Visitante (edad aprox.) | ¿Calibró solo? | Tiempo hasta colocar el primer modelo (s) | ¿Cuántas veces preguntó "qué hago"? | ¿Qué le costó? | ¿Qué le gustó? |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

Resultado: ______ (calibraron solos: __ de 5)

---

## 3. Resumen

| Prueba | Resultado |
| --- | --- |
| 2.1 Precisión del Table Lock | |
| 2.2 Vuelta de 360° | |
| 2.3 Tracking perdido | |
| 2.4 Reflejos y luz | |
| 2.5 Resistencia de 10 min | |
| 2.6 Inactividad | |
| 2.7 Interrupciones | |
| 2.8 Rendimiento | |
| 2.9 Uso real (5 visitantes) | |

**Lo peor que pasó (en una frase):** ______

## 4. Qué hacer con los resultados

- Guarda el archivo lleno en `docs/QA/resultados/` (o envía la foto de la hoja) junto con las fotos o videos.
- El Agente 5 convierte cada **FALLA** en un bug en `docs/BUGS.md` (S1 si el modelo se pierde o la app se cierra; S2 si una interacción no funciona o va a menos de 20 fps; S3 si es algo menor) y lo asigna a su dueño.
