// "Cero textos en código" (brief, secciones 4 y 15). Heurística: busca literales con palabras visibles
// asignadas a textContent / innerText / innerHTML / title / placeholder / aria-label, createTextNode,
// alert/confirm. Excluye pruebas y archivos marcados `STUB` en sus primeras líneas.
// Falso positivo legítimo: añade el archivo:línea a ALLOW con el motivo.
import { describe, expect, it } from 'vitest';
import { isStub, readText, rel, sourceFiles, stripComments } from '../helpers/repo';

/** `archivo:línea` → motivo. */
const ALLOW: Record<string, string> = {};

/** Archivos completos fuera de la regla (solo herramientas de desarrollo que el visitante no ve). */
const ALLOW_FILES: Record<string, string> = {
  'src/ui/playground.ts': 'D18: página de componentes ?ui=1, solo para el equipo (título y contador de draw calls de depuración)',
  'src/core/diag.ts': 'panel de diagnóstico ?diag=1, solo para el equipo (estado interno y consola)',
};

/** ¿El literal contiene texto legible (≥ 2 letras seguidas) fuera de ${…} y de etiquetas/atributos HTML? */
export function hasVisibleWords(literal: string): boolean {
  const s = literal
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ');
  return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡]{2,}/.test(s);
}

const STR = String.raw`(['"\x60])((?:(?!\1)[^\\]|\\.)*)\1`;
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`\.(?:textContent|innerText|innerHTML|outerHTML|title|placeholder|alt)\s*\+?=\s*` + STR, 'g'),
  new RegExp(String.raw`\.(?:insertAdjacentHTML)\(\s*['"][a-z]+['"]\s*,\s*` + STR, 'g'),
  new RegExp(String.raw`setAttribute\(\s*['"](?:aria-label|title|placeholder|alt|aria-description)['"]\s*,\s*` + STR, 'g'),
  new RegExp(String.raw`(?:createTextNode|alert|confirm|prompt)\(\s*` + STR, 'g'),
  new RegExp(String.raw`\b(?:document\.title)\s*=\s*` + STR, 'g'),
];

describe('cero textos visibles en código', () => {
  it('el detector reconoce texto y deja pasar símbolos y plantillas sin palabras', () => {
    expect(hasVisibleWords('Hola')).toBe(true);
    expect(hasVisibleWords('¿Sigues ahí?')).toBe(true);
    expect(hasVisibleWords('<b>Mueve</b> la tablet')).toBe(true);
    expect(hasVisibleWords('←')).toBe(false);
    expect(hasVisibleWords('${t(k)}: ${v}')).toBe(false);
    expect(hasVisibleWords('<div class="hud"></div>')).toBe(false);
    expect(hasVisibleWords('42 %')).toBe(false);
  });

  it('src/**/*.ts no asigna textos literales al DOM', () => {
    const hits = new Set<string>();
    for (const f of sourceFiles()) {
      const raw = readText(f);
      if (isStub(raw) || ALLOW_FILES[rel(f)]) continue;
      const src = stripComments(raw);
      for (const re of PATTERNS) {
        for (const m of src.matchAll(re)) {
          const lit = m[2] ?? '';
          if (!hasVisibleWords(lit)) continue;
          const where = `${rel(f)}:${src.slice(0, m.index ?? 0).split('\n').length}`;
          if (ALLOW[where]) continue;
          hits.add(`${where} → ${JSON.stringify(lit.slice(0, 60))}`);
        }
      }
    }
    expect([...hits], 'usa t(clave) y pide la clave al Agente 4').toEqual([]);
  });
});
