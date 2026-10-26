# Guía de voz — Mesa CAUCE

Dueño: Agente 4. Todo texto visible sale de `src/content/es/*.json` y sigue esta guía.

## Quién nos lee

Visitantes de pie, con una tablet en la mano, en una sala de ciencia. Muchos son estudiantes de colegio; otros, familias y personas adultas. Leen de pie, por segundos y mientras miran el modelo. Escribimos para **nivel de secundaria**.

## La voz en una línea

Una persona del taller que te acompaña: **cálida, curiosa y directa**. Te invita a tocar antes que a leer.

## Reglas

1. **Español de Colombia y tuteo.** "Toma la tablet", "Apunta", "Ubícala en su lugar". Nada de voseo ni de "usted" con el visitante. Usamos palabras de aquí cuando son claras: *exosto*, *cadenilla*, *tablet*.
2. **Frases cortas.** Una idea por frase. Una instrucción = un verbo claro al inicio: *Mueve*, *Toca*, *Arrastra*, *Desliza*.
3. **Sin jerga.** Si un término técnico hace falta (*cigüeñal*, *biela*), se explica en la misma ficha con una imagen mental sencilla: "Funciona como los pedales de una bicicleta".
4. **Errores sin culpa.** Nunca "Error", "Fallaste" ni "Incorrecto". Sí: "Casi. Prueba con menos velocidad", "No pasa nada, vamos de nuevo". El problema es de la situación, no de la persona.
5. **La metáfora del cauce ayuda, no adorna.** Aparece donde explica algo: el camino de la energía en una máquina, la trayectoria de un cuerpo, el curso del agua. No la metemos en botones ni en avisos técnicos.
6. **Cosmos es "a escala de juego".** Masas, distancias y tiempos están exagerados para que quepan en la mesa. Lo decimos siempre que mostramos números o comparamos tamaños.
7. **Nunca depender solo del color.** No escribimos "toca lo verde" ni "si se pone rojo". Nombramos la forma, el ícono o la posición: "la sombra de la pieza", "el rectángulo de luz", "la pieza que late". En el motor, el gas tiene color **y** nombre (mezcla, combustión, escape).
8. **Ciencia correcta.** Cada afirmación factual tiene fuente en `docs/FUENTES-TEXTOS.md`. Si no está verificada, no se publica o se marca "por verificar" allí.
9. **Respeta los límites.** `title` ≤ 36, `label` ≤ 28, `tip` ≤ 90, `body` ≤ 160, `modal` ≤ 220 caracteres (y "qué vas a descubrir" de HOME ≤ 120). Si no cabe, se corta la idea, no la ortografía.

## Formas por tipo de texto

| Tipo | Uso | Forma |
| --- | --- | --- |
| `title` | Nombre de pantalla, pieza o paso | Sustantivo o frase corta. Sin punto final. |
| `label` | Botón o control | Verbo en imperativo o sustantivo breve. Sin punto final. |
| `tip` | Aviso, guía de un momento | Una o dos frases. Con punto final. |
| `body` | Explicación o ficha | Hasta tres frases cortas: qué es, qué hace, una imagen mental. |
| `modal` | Mensaje con más peso (logro, informe) | Celebra o explica, y dice qué puedes hacer ahora. |

## Ortografía y estilo

- Tildes y signos de apertura siempre: "¿Sigues ahí?", "¡Lo armaste!".
- Puntos suspensivos con el carácter `…`.
- Decimales con coma (0,5) y unidades con espacio (4 cm).
- Variables entre llaves, sin espacios: `{s}`, `{n}`. La frase debe leerse bien con cualquier número.
- Sin mayúsculas sostenidas ni signos dobles (!!).
- Operador de sala: tono técnico-claro, en tú también, con el motivo y la acción concreta. Ese texto no lo ve el visitante.

## Ejemplos

| Mejor así | Y no así |
| --- | --- |
| Reubicando… mueve la tablet despacio. | Error de tracking. Pose nula. |
| Casi. Acerca un poco más la pieza a su sombra. | Pieza mal colocada. |
| El cigüeñal convierte el sube y baja del pistón en giro, como los pedales de una bicicleta. | El cigüeñal transforma movimiento alternativo en rotativo. |
| Toca la pieza que late. | Toca la pieza verde. |
