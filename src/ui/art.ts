// Ilustraciones placeholder propias (SVG en línea) para las tarjetas de HOME y el panel de cambio.
// Lenguaje CAUCE (paleta D24): trazos crema sobre el azul de la marca y un cauce de energía naranja →
// amarillo. Sin texto. Se reemplazan por arte final cuando exista (ExperienceMeta.image).
import type { ExperienceId } from '../core/contracts';

const NS = 'http://www.w3.org/2000/svg';

// Paleta CAUCE (mismos valores que src/ui/tokens.css; el SVG en línea no lee variables CSS en atributos).
const ORANGE = '#d3632b';
const YELLOW = '#f2c744';
const TEAL = '#2c8190';
const TEAL_DEEP = '#1e626e';
const CREAM = '#faf6dc';

const DEFS = `
<defs>
  <linearGradient id="cxg-bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${TEAL}"/><stop offset="1" stop-color="${TEAL_DEEP}"/>
  </linearGradient>
  <linearGradient id="cxg-led" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${ORANGE}" stop-opacity="0"/><stop offset=".5" stop-color="${YELLOW}"/><stop offset="1" stop-color="${ORANGE}" stop-opacity="0"/>
  </linearGradient>
</defs>`;

/** Mesa vista en perspectiva con el borde iluminado: base común de las tres ilustraciones. */
const TABLE = `
<path d="M40 150 L280 150 L250 112 L70 112 Z" fill="${TEAL_DEEP}" stroke="${CREAM}" stroke-opacity=".7" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M40 150 L280 150" stroke="${ORANGE}" stroke-width="3" class="cx-art__glow"/>`;

const ART: Record<ExperienceId, string> = {
  // Taller: engranaje + pistón con piezas que se separan y una línea de energía.
  taller: `
${TABLE}
<g fill="none" stroke="${CREAM}" stroke-width="2.5" stroke-linejoin="round">
  <g class="cx-art__spin" style="transform-origin:120px 92px">
    <circle cx="120" cy="92" r="22"/><circle cx="120" cy="92" r="7"/>
    <path d="M120 64v-8M120 128v-8M92 92h-8M156 92h-8M100 72l-6-6M146 118l-6-6M100 112l-6 6M146 66l-6 6"/>
  </g>
  <rect x="182" y="58" width="34" height="26" rx="4" class="cx-art__float"/>
  <path d="M199 84 L199 104 M190 104 h18" />
  <rect x="186" y="104" width="26" height="12" rx="3"/>
</g>
<path d="M60 132 C 90 132, 96 92, 120 92 S 170 70, 199 71" fill="none" stroke="url(#cxg-led)" stroke-width="4" stroke-linecap="round" class="cx-art__flow"/>`,
  // Cuenca: montañas, río que baja y sale por el borde de la mesa.
  cuenca: `
${TABLE}
<path d="M70 112 L110 62 L140 92 L170 50 L215 98 L250 112 Z" fill="${TEAL}" stroke="${CREAM}" stroke-width="2.5" stroke-linejoin="round"/>
<path d="M164 58 L170 50 L177 58" fill="none" stroke="${CREAM}" stroke-width="2.5"/>
<g fill="${YELLOW}"><circle cx="96" cy="100" r="6"/><circle cx="108" cy="104" r="5"/><circle cx="226" cy="104" r="5"/></g>
<path d="M170 56 C 160 80, 190 90, 160 112 S 130 140, 150 150 L 152 168" fill="none" stroke="${CREAM}" stroke-width="5" stroke-linecap="round"/>
<path d="M170 56 C 160 80, 190 90, 160 112 S 130 140, 150 150" fill="none" stroke="url(#cxg-led)" stroke-width="3" stroke-linecap="round" class="cx-art__flow"/>`,
  // Cosmos: estrella central, órbitas como cauces de luz y un planeta en movimiento.
  cosmos: `
${TABLE}
<g fill="none" stroke="${CREAM}" stroke-width="2" opacity=".6">
  <ellipse cx="160" cy="88" rx="96" ry="30"/><ellipse cx="160" cy="88" rx="58" ry="18"/>
</g>
<circle cx="160" cy="88" r="13" fill="${YELLOW}"/>
<circle cx="160" cy="88" r="20" fill="${YELLOW}" opacity=".3" class="cx-art__pulse" style="transform-origin:160px 88px"/>
<g class="cx-art__orbit" style="transform-origin:160px 88px"><circle cx="218" cy="88" r="7" fill="${ORANGE}" stroke="${CREAM}" stroke-width="2"/></g>
<circle cx="70" cy="80" r="5" fill="${CREAM}"/>
<path d="M64 88 C 100 120, 200 122, 248 98" fill="none" stroke="url(#cxg-led)" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8" class="cx-art__flow"/>`,
};

export function artFor(id: ExperienceId): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 180');
  svg.setAttribute('class', `cx-art cx-art--${id}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  // Contenido constante (nunca datos externos).
  svg.innerHTML = `${DEFS}<rect width="320" height="180" fill="url(#cxg-bg)"/>${ART[id]}`;
  return svg;
}

/** Logo oficial de CAUCE (public/logo/cauce.png, recortado de "logo cauce blanco completo.png"). */
export function brandLogo(alt: string, cls = 'cx-logo'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.src = `${import.meta.env.BASE_URL}logo/cauce.png`;
  img.alt = alt;
  img.decoding = 'async';
  img.draggable = false;
  return img;
}

/** Fondo de HOME: corrientes de luz que se desplazan lentamente (solo transform). */
export function flowBackdrop(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1600 900');
  svg.setAttribute('class', 'cx-backdrop');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  let paths = '';
  for (let i = 0; i < 7; i++) {
    const y = 120 + i * 110;
    const a = 40 + (i % 3) * 30;
    paths += `<path d="M-200 ${y} C 200 ${y - a}, 400 ${y + a}, 800 ${y} S 1400 ${y - a}, 1800 ${y}" stroke-opacity="${(0.08 + (i % 3) * 0.05).toFixed(2)}"/>`;
  }
  svg.innerHTML = `<g fill="none" stroke="${ORANGE}" stroke-width="2" class="cx-backdrop__flow">${paths}</g>`;
  return svg;
}
