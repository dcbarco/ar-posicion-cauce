# QA — Mesa CAUCE

Dueño: Agente 5. Aquí viven el plan de pruebas en la tablet, sus resultados y las mediciones de rendimiento.

## Pruebas automáticas

| Comando | Qué corre |
| --- | --- |
| `npm test` | Vitest: contratos (`tests/contract/`) y lógica pura (`tests/sim/`). |
| `npm run test:e2e` | Playwright: humo en el simulador (`tests/e2e/`). Arranca `npm run dev` (puerto 5173) o reutiliza uno abierto. Primera vez: `npx playwright install chromium`. |
| `npm run check` | Tipos + lint + Vitest + validación de modelos. Debe estar en verde antes de integrar. |

- **Contratos:** `TABLE`, `createBounds`, i18n/eventos, manifiesto de modelos, claves de texto (existencia, tipo, longitud, archivo), cero textos en código y pureza de `core/sim` y `core/table`.
- **F1 (plantillas):** `tests/sim/nbody.test.ts`, `watershed.test.ts` y `taller.test.ts` se saltan solas hasta que exista el módulo con la API de `PEDIDOS-DE-CONTRATO.md` (P-006).
- **F2 (humo):** las pruebas `test.fixme` de `tests/e2e/smoke.spec.ts` se activan en F2. Para correrlas ya contra la MockExperience: `QA_F2=1 npm run test:e2e`.
- `it.fails('BUG-xxx …')` documenta un bug abierto: pasa mientras el bug exista.

## Documentos

- [`PLAN-TABLET.md`](./PLAN-TABLET.md): protocolo en la tablet real, para una persona no técnica.
- `resultados/AAAA-MM-DD-tablet.md`: una copia llena del plan por cada sesión de prueba.
- [`../BUGS.md`](../BUGS.md): registro de bugs (S1/S2/S3).
