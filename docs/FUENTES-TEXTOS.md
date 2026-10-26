# Fuentes de los textos — Mesa CAUCE

Dueño: Agente 4. Cada afirmación factual de `src/content/es/*.json` se respalda aquí.
Estado: **verificado** (consultado en la fuente) · **conocimiento sólido, por verificar** (dato de manual estándar; falta cotejar la URL o la página exacta).

> En esta sesión no se consultaron las fuentes en línea: todo queda como "por verificar" hasta que alguien coteje el enlace o la página. Son datos de manual básico de mecánica y no se esperan cambios.

## Fuentes de referencia

| ID | Fuente | Tipo |
| --- | --- | --- |
| F1 | Heywood, J. B. *Internal Combustion Engine Fundamentals*, 2.ª ed., McGraw-Hill, 2018. Cap. 1 (ciclo de 4 tiempos) y cap. 2 (geometría pistón–biela–cigüeñal). | Libro de texto universitario |
| F2 | Bosch. *Manual de la técnica del automóvil* (Automotive Handbook), ed. vigente. Secciones de motor Otto, distribución y encendido. | Manual técnico |
| F3 | U.S. Department of Energy, "Internal Combustion Engine Basics", energy.gov (Vehicle Technologies Office). https://www.energy.gov/eere/vehicles/articles/internal-combustion-engine-basics | Divulgación oficial |
| F4 | Encyclopaedia Britannica, "Gasoline engine" y "Four-stroke cycle". https://www.britannica.com/technology/gasoline-engine | Enciclopedia |
| F5 | Manuales de servicio de motocicletas monocilíndricas 4T de baja cilindrada (carburador, árbol de levas en culata con balancines y cadenilla). | Manual de taller |

## Afirmaciones del Taller (motor 4T)

| Clave(s) | Afirmación | Fuente | Estado |
| --- | --- | --- | --- |
| `exp.taller.motor4t.tip.stroke1` | Admisión: el pistón baja con la válvula de admisión abierta y entra la mezcla aire–gasolina. | F1, F3, F4 | por verificar |
| `exp.taller.motor4t.tip.stroke2` | Compresión: ambas válvulas cerradas, el pistón sube y comprime la mezcla. | F1, F3, F4 | por verificar |
| `exp.taller.motor4t.tip.stroke3` | Combustión/expansión: la bujía enciende la mezcla y los gases empujan el pistón hacia abajo (único tiempo que entrega trabajo). | F1, F3, F4 | por verificar |
| `exp.taller.motor4t.tip.stroke4` | Escape: válvula de escape abierta, el pistón sube y expulsa los gases. | F1, F3, F4 | por verificar |
| `exp.taller.motor4t.tip.flow`, `exp.taller.assemble.modal.success` | Cadena de energía: química (combustible) → presión de gases → pistón → biela → cigüeñal (giro) → volante. | F1, F3 | por verificar |
| `…body.crankshaft`, `…body.connecting_rod` | El sistema biela–manivela convierte el movimiento alternativo en giro (analogía con pedales de bicicleta). | F1 cap. 2 | por verificar |
| `…body.flywheel` | El volante almacena energía de giro y mantiene el cigüeñal girando en los tiempos sin empuje. | F1, F2 | por verificar |
| `…body.timing_gear_cam`, `…body.timing_chain` | El árbol de levas gira a la mitad de la velocidad del cigüeñal (relación 2:1, piñón de levas con el doble de dientes), porque el ciclo completo ocupa dos vueltas del cigüeñal. | F1, F2, F5 | por verificar |
| `…body.camshaft`, `…body.rocker_*` | Las levas empujan los balancines, que actúan como palancas y abren las válvulas. | F2, F5 | por verificar |
| `…body.valve_spring_*` | Los resortes cierran las válvulas cuando la leva deja de empujar. | F2 | por verificar |
| `…body.piston_rings` | Los anillos de compresión sellan los gases y el anillo de aceite raspa el aceite sobrante de la pared del cilindro. | F1, F2 | por verificar |
| `…body.piston_pin` | El pasador une pistón y biela y permite que la biela oscile. | F2 | por verificar |
| `…body.spark_plug` | La bujía produce una chispa eléctrica que inicia la combustión en el momento adecuado. | F2, F3 | por verificar |
| `…body.carburetor` | El carburador mezcla aire con gasolina pulverizada en una proporción controlada. | F2, F4 | por verificar |
| `…body.exhaust_pipe` | El tubo de escape conduce los gases fuera del motor y, con su silenciador, reduce el ruido. | F2 | por verificar |
| `…body.oil_pan`, `…body.crankcase_*` | El cárter guarda el aceite de lubricación; las carcasas alojan el cigüeñal. | F2, F5 | por verificar |

## Vocabulario regional (Colombia)

| Término usado | Equivalente técnico | Nota |
| --- | --- | --- |
| Exosto | Tubo de escape | Uso común en Colombia; se acompaña de "tubo de escape" en el nombre de la pieza. |
| Cadenilla | Cadena de distribución | Uso común en talleres de moto en Colombia. |
| Pasador del pistón | Bulón | Se prefirió "pasador" por ser más transparente para un visitante. |

## Dudas abiertas

- **Volante en el modelo:** en muchas motos 4T el volante es también el rotor del magneto (genera electricidad). El texto no lo menciona; confirmar con el Agente 2 qué representa el modelo.
- **Cárter de aceite separado:** en motos monocilíndricas el aceite suele estar dentro de las propias carcasas. Si el modelo del Agente 2 no tiene un cárter separado, ajustar `oil_pan`.
- **Balancines vs. empujadores:** el texto asume árbol de levas en culata con balancines (SOHC). Confirmar con la geometría del modelo.
- **Ejes del brazo robótico** (`joint1..6`): nombres según un brazo industrial típico (base, hombro, codo, antebrazo, muñeca, giro de la pinza); ajustar cuando exista el modelo.
