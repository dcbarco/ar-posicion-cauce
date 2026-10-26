// Pureza de la lógica (brief, sección 10): src/core/sim/** y src/core/table/{spec,bounds}.ts
// no importan three (ni gsap, ni la UI) ni usan document/window — tampoco a través de sus imports relativos.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { abs, listFiles, readText, rel, stripComments } from '../helpers/repo';

const ENTRIES = [
  ...listFiles(abs('src', 'core', 'sim'), ['.ts']).filter((f) => !/\.(test|spec)\.ts$/.test(f)),
  abs('src', 'core', 'table', 'spec.ts'),
  abs('src', 'core', 'table', 'bounds.ts'),
].filter((f) => existsSync(f));

const FORBIDDEN_IMPORT = /^(three|three\/.*|gsap|gsap\/.*)$|\/ui\/|\/fx\/|\/audio\//;
const FORBIDDEN_GLOBAL = /(?<![\w$.])(document|window|navigator|localStorage|requestAnimationFrame)\b/;

function importsOf(src: string): { spec: string; typeOnly: boolean }[] {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of src.matchAll(/\bimport\s+(type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g))
    out.push({ spec: m[2] ?? '', typeOnly: Boolean(m[1]) });
  for (const m of src.matchAll(/\bexport\s+(type\s+)?[^'"]*?\s+from\s+['"]([^'"]+)['"]/g)) out.push({ spec: m[2] ?? '', typeOnly: Boolean(m[1]) });
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1] ?? '', typeOnly: false });
  return out;
}

function resolveTs(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}/index.ts`]) if (existsSync(c) && c.endsWith('.ts')) return c;
  return null;
}

/** Quita el contenido de las cadenas para no confundir 'window' en un texto con el global. */
const blankStrings = (s: string) => s.replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');

describe('pureza de la lógica', () => {
  it('hay archivos que revisar (al menos spec.ts y bounds.ts)', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(2);
  });

  it.each(ENTRIES.map((f) => [rel(f), f] as const))('%s y sus dependencias son puras', (_name, entry) => {
    const problems: string[] = [];
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
      const f = stack.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      const src = stripComments(readText(f));
      for (const { spec, typeOnly } of importsOf(src)) {
        // Los imports de solo tipos se borran al compilar; aun así three no debe aparecer en sim/table.
        if (FORBIDDEN_IMPORT.test(spec)) problems.push(`${rel(f)} importa "${spec}"${typeOnly ? ' (solo tipos)' : ''}`);
        if (spec.startsWith('.') && !typeOnly) {
          const r = resolveTs(f, spec);
          if (r) stack.push(r);
        }
      }
      const code = blankStrings(src);
      code.split('\n').forEach((line, i) => {
        const m = FORBIDDEN_GLOBAL.exec(line);
        if (m) problems.push(`${rel(f)}:${i + 1} usa ${m[1]}`);
      });
    }
    expect(problems).toEqual([]);
  });
});
