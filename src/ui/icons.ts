// Íconos SVG en línea (trazo = currentColor, caja 24×24). Sin texto: los nombres son identificadores.
// `ControlSpec.icon` y los ítems de bandeja usan estos nombres; uno desconocido cae en `dot`.

const P: Record<string, string> = {
  dot: '<circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
  'chevron-right': '<path d="M9 5l7 7-7 7"/>',
  'rotate-left': '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  'rotate-right': '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  switch: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M14 17h6M17 14v6"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4.5v4h4"/><circle cx="12" cy="12" r="1.6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.5M12 17v.3"/>',
  recalibrate: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M12 3v3M12 18v3M7 12h2M15 12h2"/>',
  exit: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  'sound-on': '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  'sound-off': '<path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M7 5v14M17 5v14"/>',
  undo: '<path d="M8 5L3.5 9.5 8 14"/><path d="M3.5 9.5H14a5.5 5.5 0 0 1 0 11h-4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  xray: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2.5"/><circle cx="12" cy="12" r="3.5"/>',
  explode: '<rect x="9" y="9" width="6" height="6" rx="1"/><path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3"/>',
  speed: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  sphere: '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="8.5" ry="3.2"/>',
  cone: '<path d="M12 3L4.5 18.5a7.5 2.5 0 0 0 15 0z"/>',
  hand: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11M12 10V4.5a1.5 1.5 0 0 1 3 0V11M15 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 14.5a1.5 1.5 0 0 1 2.4-1.8L9 15"/>',
  tablet: '<rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  table: '<rect x="2.5" y="8" width="19" height="8" rx="1"/><path d="M5 16v4M19 16v4"/>',
  tap: '<circle cx="12" cy="9" r="3"/><circle cx="12" cy="9" r="6.5" stroke-dasharray="2.5 2.5"/><path d="M12 15v6"/>',
  drag: '<circle cx="7" cy="12" r="2.5"/><path d="M10.5 12H20M16 8l4 4-4 4"/>',
  pinch: '<path d="M5 5l5 5M19 19l-5-5M5 5v4M5 5h4M19 19v-4M19 19h-4"/>',
  twist: '<path d="M5 12a7 7 0 0 1 12-5M19 12a7 7 0 0 1-12 5"/><path d="M17 3v4h-4M7 21v-4h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  planet: '<circle cx="12" cy="12" r="5.5"/><ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-20 12 12)"/>',
  drop: '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3z"/>',
  tree: '<path d="M12 21v-5M12 3l6 8h-3l4 5H5l4-5H6z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
};

const NS = 'http://www.w3.org/2000/svg';

/** Crea un `<svg>` del ícono. Decorativo por defecto (`aria-hidden`); el texto accesible va en el botón. */
export function icon(name: string | undefined, cls = 'cx-ico'): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // Contenido constante del mapa P (nunca datos externos).
  svg.innerHTML = P[name ?? 'dot'] ?? P.dot ?? '';
  return svg;
}

export function hasIcon(name: string): boolean {
  return name in P;
}
