// Textos visibles: todos salen de src/content/<lang>/*.json (clave plana → cadena).
// Interpolación: "Faltan {n} piezas" con t('clave', { n: 3 }).
import type { Translate } from './contracts';

type Dict = Record<string, string>;

const modules = import.meta.glob<Dict>('../content/*/*.json', { eager: true, import: 'default' });

export function loadDictionary(lang = 'es'): Dict {
  const dict: Dict = {};
  for (const [path, mod] of Object.entries(modules)) {
    if (!path.includes(`/content/${lang}/`)) continue;
    for (const [k, v] of Object.entries(mod)) if (typeof v === 'string') dict[k] = v;
  }
  return dict;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    if (vars && Object.prototype.hasOwnProperty.call(vars, name)) return String(vars[name]);
    if (import.meta.env.DEV) console.warn(`[i18n] falta la variable {${name}}`);
    // En producción nunca se muestra "{s}" crudo al visitante.
    return import.meta.env.DEV ? m : '';
  });
}

const missing = new Set<string>();

export function createTranslator(dict: Dict = loadDictionary()): Translate {
  return (key, vars) => {
    const s = dict[key];
    if (s === undefined) {
      if (!missing.has(key)) {
        missing.add(key);
        console.warn(`[i18n] falta la clave "${key}"`);
      }
      // Nunca un texto inventado: se ve la clave para que se note en revisión.
      return import.meta.env.DEV ? `⟦${key}⟧` : '';
    }
    return interpolate(s, vars);
  };
}

/** Claves pedidas en esta sesión que no existen (para QA). */
export function missingKeys(): string[] {
  return [...missing];
}
