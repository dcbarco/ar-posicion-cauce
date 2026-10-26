// Utilidades de QA (Agente 5): lectura del repo desde las pruebas (entorno node).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const abs = (...p: string[]): string => join(ROOT, ...p);
export const rel = (p: string): string => relative(ROOT, p).split(sep).join('/');

/** Lista recursiva de archivos con alguna de las extensiones dadas. Devuelve rutas absolutas. */
export function listFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out.sort();
}

export function readText(p: string): string {
  const txt = readFileSync(p, 'utf8');
  return txt.charCodeAt(0) === 0xfeff ? txt.slice(1) : txt; // quita BOM
}

/** JSON del archivo, `undefined` si no existe o está vacío. Lanza si el JSON es inválido. */
export function readJsonIfExists(p: string): unknown {
  if (!existsSync(p)) return undefined;
  const txt = readText(p).trim();
  if (txt === '') return undefined;
  return JSON.parse(txt) as unknown;
}

/** Quita comentarios // y /* *\/ de código TS (heurística: respeta cadenas simples). */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const chunk = src.slice(i, end === -1 ? src.length : end + 2);
      out += chunk.replace(/[^\n]/g, ' ');
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Archivos .ts de src/ que no son pruebas. */
export function sourceFiles(): string[] {
  return listFiles(abs('src'), ['.ts']).filter((f) => !/\.(test|spec)\.ts$/.test(f) && !f.endsWith('.d.ts'));
}

/** Un archivo es stub si lo declara en sus primeras líneas (`STUB`). */
export function isStub(src: string): boolean {
  return /\bSTUB\b/.test(src.split('\n').slice(0, 5).join('\n'));
}

// ───────────────────────── Textos ─────────────────────────

export const TEXT_TYPES = ['title', 'label', 'tip', 'body', 'modal'] as const;
export type TextType = (typeof TEXT_TYPES)[number];

/** Límites del brief (sección 4) y D11. */
export const BRIEF_LIMITS: Record<TextType, number> = { title: 36, label: 28, tip: 90, body: 160, modal: 220 };

/** Excepciones documentadas en ARQUITECTURA (D11): patrón con `*` → límite. */
export const BRIEF_OVERRIDES: Record<string, number> = { 'home.card.*.body': 120 };

export const EXPERIENCE_IDS = ['taller', 'cuenca', 'cosmos'] as const;

/** Tipo de una clave: primer segmento que sea un tipo de texto (D11). */
export function keyType(key: string): TextType | null {
  for (const seg of key.split('.')) if ((TEXT_TYPES as readonly string[]).includes(seg)) return seg as TextType;
  return null;
}

export function globToRegExp(glob: string): RegExp {
  return new RegExp('^' + glob.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^.]+') + '$');
}

export interface ContentData {
  dir: string;
  exists: boolean;
  /** archivo (relativo) → objeto crudo parseado (o error) */
  files: { file: string; data?: unknown; error?: string }[];
  /** clave → { valor, archivo } (primera aparición) */
  keys: Map<string, { value: unknown; file: string }>;
  duplicates: { key: string; files: string[] }[];
}

export function loadContent(lang = 'es'): ContentData {
  const dir = abs('src', 'content', lang);
  const res: ContentData = { dir, exists: existsSync(dir), files: [], keys: new Map(), duplicates: [] };
  const seen = new Map<string, string[]>();
  for (const f of listFiles(dir, ['.json'])) {
    const file = rel(f);
    try {
      const data = JSON.parse(readText(f)) as unknown;
      res.files.push({ file, data });
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
          if (k === '$schema') continue;
          const list = seen.get(k) ?? [];
          list.push(file);
          seen.set(k, list);
          if (!res.keys.has(k)) res.keys.set(k, { value: v, file });
        }
      }
    } catch (e) {
      res.files.push({ file, error: (e as Error).message });
    }
  }
  for (const [key, files] of seen) if (files.length > 1) res.duplicates.push({ key, files });
  return res;
}

export interface Limits {
  byType: Record<TextType, number>;
  /** Excepciones: la primera que coincide gana. */
  overrides: { re: RegExp; max: number; from: string }[];
  source: 'schema' | 'brief';
}

function numericLimit(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['max', 'maxLength', 'limit', 'maxChars']) if (typeof o[k] === 'number') return o[k];
  }
  return null;
}

/**
 * Lee límites de `src/content/schema.json` de forma tolerante (el formato lo define el Agente 4):
 * - un objeto con al menos 3 tipos de texto como propiedades con límite numérico (p. ej. `limits`);
 * - excepciones como `{ pattern: "<regex>", max: n }` (arreglo `overrides`) o `{ "<glob con *>": n }`.
 * Si no hay schema, usa el brief + D11.
 */
export function loadLimits(): Limits {
  const schema = readJsonIfExists(abs('src', 'content', 'schema.json'));
  const limits: Limits = {
    byType: { ...BRIEF_LIMITS },
    overrides: Object.entries(BRIEF_OVERRIDES).map(([g, max]) => ({ re: globToRegExp(g), max, from: 'D11' })),
    source: 'brief',
  };
  if (schema === undefined) return limits;
  let foundTypes = false;
  const fromSchema: Limits['overrides'] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const o = node as Record<string, unknown>;
    const typeHits = TEXT_TYPES.filter((t) => numericLimit(o[t]) !== null);
    if (!foundTypes && typeHits.length >= 3) {
      foundTypes = true;
      for (const t of typeHits) limits.byType[t] = numericLimit(o[t]) as number;
    }
    if (typeof o.pattern === 'string' && numericLimit(o) !== null) {
      try {
        fromSchema.push({ re: new RegExp(o.pattern), max: numericLimit(o) as number, from: 'schema' });
      } catch {
        /* patrón inválido: lo reporta la prueba del schema */
      }
    }
    for (const [k, v] of Object.entries(o)) {
      const lim = numericLimit(v);
      if (k.includes('.') && lim !== null && keyType(k.replace(/\*/g, 'x')) !== null)
        fromSchema.push({ re: globToRegExp(k), max: lim, from: 'schema' });
      walk(v);
    }
  };
  walk(schema);
  if (foundTypes) limits.source = 'schema';
  limits.overrides = [...fromSchema, ...limits.overrides];
  return limits;
}

export function limitFor(key: string, limits: Limits): number | null {
  for (const o of limits.overrides) if (o.re.test(key)) return o.max;
  const t = keyType(key);
  return t ? limits.byType[t] : null;
}

/** Longitud visible: en puntos de código (las tildes y la ñ cuentan 1). */
export const visibleLength = (s: string): number => [...s.normalize('NFC')].length;
