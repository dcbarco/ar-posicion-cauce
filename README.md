# Mesa CAUCE (`cauce-ar`)

Web de realidad aumentada **sin marcador** (WebXR `immersive-ar`) para una tablet anclada a una mesa de 100 × 70 cm. Vite + TypeScript + Three.js + GSAP. Sitio 100 % estático desplegado en **Cloudflare Workers (static assets)**.

- Brief: `Prompt maestro — Mesa CAUCE (WebXR sin marcador).md`
- Decisiones de arquitectura: `docs/ARQUITECTURA.md`
- Guía para agentes y comandos: `CLAUDE.md`

## Desarrollo

Requiere Node ≥ 22.12.

```sh
npm ci
npm run dev          # http://localhost:5173  (?sim=1 simulador de escritorio sin XR)
npm run check        # typecheck + lint + test + models:validate
npm run build        # → dist/
```

WebXR exige HTTPS (o `localhost`). En la tablet: `adb reverse tcp:5173 tcp:5173` y abrir `http://localhost:5173` en Chrome, o `npm run dev:https` y entrar por `https://<IP-wifi>:5173`.

## Despliegue en Cloudflare Workers

Configuración en `wrangler.jsonc`: Worker `cauce-ar` que sirve `dist/` como assets estáticos (sin código de servidor). Las cabeceras (`Permissions-Policy: xr-spatial-tracking`, caché) salen de `public/_headers`.

**Desde GitHub (Workers Builds):** Cloudflare → Workers & Pages → Create → Import a repository → este repo.

| Campo | Valor |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Rama de producción | `main` |

La versión de Node la toma de `.node-version`. Cada push a `main` despliega; las demás ramas generan versiones de vista previa.

**Manual:** `npx wrangler login` y luego `npm run deploy`.
