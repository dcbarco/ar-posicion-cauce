// Contrato de textos (brief, sección 4; D11, D12, D16). Lee src/content/es/*.json y src/content/schema.json.
// También escanea src/**/*.ts buscando claves literales y comprueba que existan.
import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_IDS,
  abs,
  keyType,
  limitFor,
  loadContent,
  loadLimits,
  readJsonIfExists,
  readText,
  rel,
  sourceFiles,
  stripComments,
  visibleLength,
  BRIEF_LIMITS,
  TEXT_TYPES,
} from '../helpers/repo';

const content = loadContent('es');
const limits = loadLimits();
const hasMock = content.files.some((f) => f.file.endsWith('/mock.json'));

describe('archivos de textos (src/content/es)', () => {
  it('la carpeta existe y tiene al menos common.json', () => {
    expect(content.exists).toBe(true);
    expect(
      content.files.map((f) => f.file),
      'falta src/content/es/common.json (Agente 4)',
    ).toContain('src/content/es/common.json');
  });

  it('todos los JSON son válidos y planos (clave → cadena)', () => {
    const problems: string[] = [];
    for (const f of content.files) {
      if (f.error) {
        problems.push(`${f.file}: JSON inválido (${f.error})`);
        continue;
      }
      if (!f.data || typeof f.data !== 'object' || Array.isArray(f.data)) {
        problems.push(`${f.file}: no es un objeto plano`);
        continue;
      }
      for (const [k, v] of Object.entries(f.data as Record<string, unknown>)) {
        if (k === '$schema') continue;
        if (typeof v !== 'string') problems.push(`${f.file}: "${k}" no es cadena`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('src/content/schema.json, si existe, es JSON válido', () => {
    expect(() => readJsonIfExists(abs('src', 'content', 'schema.json'))).not.toThrow();
    if (limits.source === 'brief') console.warn('[QA] schema.json ausente o sin límites legibles: se usan los límites del brief + D11');
  });

  it('el schema no relaja los límites del brief', () => {
    const looser = TEXT_TYPES.filter((t) => limits.byType[t] > BRIEF_LIMITS[t]).map(
      (t) => `${t}: schema ${limits.byType[t]} > brief ${BRIEF_LIMITS[t]}`,
    );
    expect(looser).toEqual([]);
  });

  it('existen los archivos que el schema marca como obligatorios', () => {
    const schema = readJsonIfExists(abs('src', 'content', 'schema.json')) as
      | { files?: Record<string, { path: string; required?: boolean }[]> }
      | undefined;
    const required = (schema?.files?.es ?? []).filter((f) => f.required).map((f) => f.path);
    const present = new Set(content.files.map((f) => f.file));
    expect(required.filter((p) => !present.has(p))).toEqual([]);
  });

  it('las claves cumplen keyPattern del schema (si lo define)', () => {
    const schema = readJsonIfExists(abs('src', 'content', 'schema.json')) as { keyPattern?: string } | undefined;
    if (!schema?.keyPattern) return;
    const re = new RegExp(schema.keyPattern);
    expect([...content.keys.keys()].filter((k) => !re.test(k))).toEqual([]);
  });

  it('ninguna clave aparece en dos archivos', () => {
    expect(content.duplicates).toEqual([]);
  });
});

describe('cada clave', () => {
  const entries = [...content.keys.entries()];

  it('tiene un segmento de tipo title|label|tip|body|modal (D11)', () => {
    expect(entries.filter(([k]) => keyType(k) === null).map(([k]) => k)).toEqual([]);
  });

  it('usa solo minúsculas, dígitos, _ y puntos', () => {
    expect(entries.filter(([k]) => !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(k)).map(([k]) => k)).toEqual([]);
  });

  it('ninguna cadena vacía ni solo espacios', () => {
    expect(entries.filter(([, { value }]) => typeof value === 'string' && value.trim() === '').map(([k]) => k)).toEqual([]);
  });

  it('sin espacios al inicio o al final (regla del schema)', () => {
    expect(entries.filter(([, { value }]) => typeof value === 'string' && value !== value.trim()).map(([k]) => k)).toEqual([]);
  });

  it('las claves que no son exp.* viven en common.json', () => {
    expect(
      entries.filter(([k, { file }]) => !k.startsWith('exp.') && !file.endsWith('/common.json')).map(([k, { file }]) => `${k} (${file})`),
    ).toEqual([]);
  });

  it('respeta el límite de su tipo', () => {
    const over: string[] = [];
    for (const [k, { value }] of entries) {
      if (typeof value !== 'string') continue;
      const lim = limitFor(k, limits);
      if (lim !== null && visibleLength(value) > lim) over.push(`${k} (${visibleLength(value)} > ${lim})`);
    }
    expect(over).toEqual([]);
  });

  it('las claves exp.<experiencia>.* viven en <experiencia>.json', () => {
    const wrong: string[] = [];
    for (const [k, { file }] of entries) {
      const m = /^exp\.([a-z0-9_]+)\./.exec(k);
      if (m && !file.endsWith(`/${m[1]}.json`)) wrong.push(`${k} está en ${file}`);
    }
    expect(wrong).toEqual([]);
  });

  it('las variables {x} están bien cerradas', () => {
    const bad = entries
      .filter(([, { value }]) => typeof value === 'string')
      .filter(([, { value }]) => {
        const s = value as string;
        return (s.match(/\{/g) ?? []).length !== (s.match(/\}/g) ?? []).length || /\{[^}]*\{/.test(s) || /\{\s*\}/.test(s);
      })
      .map(([k]) => k);
    expect(bad).toEqual([]);
  });
});

// ───────────────────── Claves usadas en el código ─────────────────────

/** Una cadena literal "parece" clave de texto si es dotted lowercase y tiene un segmento de tipo. */
const looksLikeKey = (s: string) => /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(s) && keyType(s) !== null;

interface UsedKey {
  key: string;
  where: string;
}

/**
 * Claves construidas con UNA variable cuyo dominio se conoce: el `*` (lugar de `${…}`) se expande con
 * los valores. Si cambia el dominio en el código, actualiza aquí (lo verás en el aviso de claves dinámicas).
 */
const KNOWN_DYNAMIC: { prefix: string; values: readonly string[] }[] = [
  { prefix: 'home.card.', values: EXPERIENCE_IDS },
  { prefix: 'operator.body.', values: ['no_xr', 'no_ar', 'insecure', 'session_failed'] }, // XrSupport.reason
  { prefix: 'exp.mock.demo.label.speed_', values: ['slow', 'normal', 'fast'] }, // SPEEDS de mock-experience
  { prefix: 'exp.mock.demo.label.', values: ['cube', 'sphere', 'cone'] }, // SHAPES de mock-experience
];

/** Sustituye `${NOMBRE}` por `const NOMBRE = '…'` del mismo archivo; luego expande KNOWN_DYNAMIC. */
function resolveTemplate(lit: string, consts: Map<string, string>): string[] | null {
  const s = lit.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (m, name: string) => consts.get(name) ?? m);
  const holes = s.match(/\$\{[^}]*\}/g) ?? [];
  if (holes.length === 0) return [s];
  if (holes.length > 1) return null;
  const glob = s.replace(/\$\{[^}]*\}/, '*');
  const known = KNOWN_DYNAMIC.find((k) => glob.startsWith(k.prefix + '*'));
  return known ? known.values.map((v) => glob.replace('*', v)) : null;
}

function collectUsedKeys(): { used: UsedKey[]; noType: UsedKey[]; dynamic: UsedKey[] } {
  const used: UsedKey[] = [];
  const noType: UsedKey[] = [];
  const dynamic: UsedKey[] = [];
  for (const f of sourceFiles()) {
    const src = stripComments(readText(f));
    const file = rel(f);
    const lineOf = (idx: number) => src.slice(0, idx).split('\n').length;
    const consts = new Map<string, string>();
    for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"\n]*)\2\s*;/g)) consts.set(m[1] ?? '', m[3] ?? '');

    // 1) t('...'), api.t('...'), ctx.t('...'), this.ctx.t('...') con primer argumento literal.
    const callRe = /(?:^|[^\w$])(?:[\w$]+\.)*t\(\s*(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
    // 2) labelKey / titleKey / bodyKey / key: '...'
    const propRe = /\b(?:labelKey|titleKey|bodyKey)\s*:\s*(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
    for (const re of [callRe, propRe]) {
      for (const m of src.matchAll(re)) {
        const q = m[1];
        const lit = m[2] ?? '';
        const where = `${file}:${lineOf(m.index ?? 0)}`;
        if (q === '`' && lit.includes('${')) {
          const keys = resolveTemplate(lit, consts);
          if (keys) for (const key of keys) (keyType(key) === null ? noType : used).push({ key, where });
          else dynamic.push({ key: lit, where });
          continue;
        }
        if (keyType(lit) === null) noType.push({ key: lit, where });
        else used.push({ key: lit, where });
      }
    }

    // 3) Cualquier otra cadena literal con forma de clave (cubre ternarios: t(c ? 'a.tip.x' : 'a.tip.y')).
    for (const m of src.matchAll(/(['"])([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)\1/g)) {
      const lit = m[2] ?? '';
      if (looksLikeKey(lit)) used.push({ key: lit, where: `${file}:${lineOf(m.index ?? 0)}` });
    }
  }
  return { used, noType, dynamic };
}

describe('claves usadas en src/**/*.ts', () => {
  const { used, noType, dynamic } = collectUsedKeys();

  it('autocomprobación: el escáner encuentra claves (home.card.* y lock.tip.* de la UI)', () => {
    const keys = new Set(used.map((u) => u.key));
    // La UI (stub o final) siempre pinta HOME y TABLE LOCK.
    expect(keys.has('home.card.taller.title') || keys.size === 0).toBe(true);
    expect(used.length).toBeGreaterThan(0);
  });

  it('toda clave literal usada por t()/labelKey tiene segmento de tipo', () => {
    expect(noType.map((u) => `${u.key} (${u.where})`)).toEqual([]);
  });

  it('toda clave literal usada existe en src/content/es', () => {
    if (dynamic.length) console.warn('[QA] claves dinámicas no verificadas:\n  ' + dynamic.map((d) => `${d.key} (${d.where})`).join('\n  '));
    const missing = new Map<string, string>();
    for (const u of used) {
      if (content.keys.has(u.key)) continue;
      if (u.key.startsWith('exp.mock.') && !hasMock) continue; // mock.json opcional
      if (!missing.has(u.key)) missing.set(u.key, u.where);
    }
    expect([...missing].map(([k, w]) => `${k} (${w})`)).toEqual([]);
  });
});
