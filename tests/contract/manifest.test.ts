// Contrato de modelos (brief, secciones 4 y 9; D16): public/models/manifest.json con forma ModelManifest.
// Si el manifiesto aún no existe o está vacío, se trata como { models: [] } y la prueba pasa.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ModelManifest, ModelManifestEntry } from '../../src/core/contracts';
import { abs, loadContent, readJsonIfExists } from '../helpers/repo';

const MANIFEST_PATH = abs('public', 'models', 'manifest.json');
const raw = readJsonIfExists(MANIFEST_PATH);
const manifest: ModelManifest = (raw as ModelManifest | undefined) ?? { version: 1, models: [] };
const models: ModelManifestEntry[] = Array.isArray(manifest.models) ? manifest.models : [];

const LICENSES = ['CC0', 'CC-BY', 'own'];
const EXPERIENCES = ['taller', 'cuenca', 'cosmos', 'shared'];
const MAX_TRIS = 150_000;
const EXPLODED_MAX = { x: 0.9, z: 0.6 };
const HERO_BASE_MAX = 0.35;
/** Sección 16: cada GLB < 15 MB. */
const MAX_SIZE_KB = 15 * 1024;
const EPS = 1e-6;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isVec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(isNum);

/** Problemas de forma de una entrada (lista vacía = OK). */
function shapeProblems(m: ModelManifestEntry): string[] {
  const p: string[] = [];
  const e = m as unknown as Record<string, unknown>;
  for (const k of ['id', 'file', 'author', 'sourceUrl'] as const) if (!isStr(e[k])) p.push(`${k} vacío o no es texto`);
  if (!EXPERIENCES.includes(e.experience as string)) p.push(`experience inválida: ${String(e.experience)}`);
  if (!isNum(e.tris) || (e.tris as number) < 0) p.push('tris no es número ≥ 0');
  if (!isNum(e.sizeKB) || (e.sizeKB as number) <= 0) p.push('sizeKB no es número > 0');
  if (!Array.isArray(e.parts)) p.push('parts no es arreglo');
  if (!Array.isArray(e.clips)) p.push('clips no es arreglo');
  if (!LICENSES.includes(e.license as string)) p.push(`license inválida: ${String(e.license)}`);
  const b = e.bounds as Record<string, { min?: unknown; max?: unknown }> | undefined;
  for (const k of ['assembled', 'exploded']) {
    const box = b?.[k];
    if (!box || !isVec3(box.min) || !isVec3(box.max)) p.push(`bounds.${k} sin min/max [x,y,z]`);
    else if (box.min.some((v, i) => v > (box.max as number[])[i]!)) p.push(`bounds.${k}: min > max`);
  }
  return p;
}

describe('manifiesto de modelos', () => {
  it('es JSON válido con forma { version, models[] } (o no existe aún)', () => {
    if (raw === undefined) {
      console.warn('[QA] public/models/manifest.json no existe o está vacío: se asume models: []');
      return;
    }
    expect(typeof raw).toBe('object');
    expect(Array.isArray((raw as ModelManifest).models)).toBe(true);
    expect(isNum((raw as ModelManifest).version)).toBe(true);
  });

  it('ids únicos', () => {
    const ids = models.map((m) => m.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it.each(models.map((m) => [m.id ?? '(sin id)', m] as const))('%s: campos obligatorios y tipos', (_id, m) => {
    expect(shapeProblems(m)).toEqual([]);
  });

  it.each(models.map((m) => [m.id, m] as const))('%s: el archivo .glb existe y pesa < 15 MB', (_id, m) => {
    expect(m.file).toMatch(/\.glb$/);
    expect(existsSync(abs('public', 'models', m.file)), `falta public/models/${m.file}`).toBe(true);
    expect(m.sizeKB).toBeLessThanOrEqual(MAX_SIZE_KB);
  });

  it.each(models.map((m) => [m.id, m] as const))('%s: tris ≤ 150 000', (_id, m) => {
    expect(m.tris).toBeLessThanOrEqual(MAX_TRIS);
  });

  it.each(models.map((m) => [m.id, m] as const))('%s: licencia CC0 | CC-BY | own con autor y fuente', (_id, m) => {
    expect(LICENSES).toContain(m.license);
    expect(isStr(m.author)).toBe(true);
    expect(isStr(m.sourceUrl)).toBe(true);
  });

  const heroes = models.filter((m) => Array.isArray(m.parts) && m.parts.length > 0);

  it.each(heroes.map((m) => [m.id, m] as const))('%s: desarmado cabe en 0,90 × 0,60 m (X × Z)', (_id, m) => {
    const { min, max } = m.bounds.exploded;
    expect(max[0] - min[0]).toBeLessThanOrEqual(EXPLODED_MAX.x + EPS);
    expect(max[2] - min[2]).toBeLessThanOrEqual(EXPLODED_MAX.z + EPS);
  });

  it.each(heroes.map((m) => [m.id, m] as const))('%s: armado ocupa ≤ 0,35 × 0,35 m de base', (_id, m) => {
    const { min, max } = m.bounds.assembled;
    expect(max[0] - min[0]).toBeLessThanOrEqual(HERO_BASE_MAX + EPS);
    expect(max[2] - min[2]).toBeLessThanOrEqual(HERO_BASE_MAX + EPS);
  });

  it.each(heroes.map((m) => [m.id, m] as const))('%s: piezas con partId único y labelKey D16', (_id, m) => {
    const ids = m.parts.map((p) => p.partId);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'partId duplicados').toEqual([]);
    // `exp.<exp>.<modelo>.title.model` es el nombre del modelo (P-003 / P-007): ninguna pieza puede llamarse así.
    expect(ids, 'partId "model" está reservado para el nombre del modelo').not.toContain('model');
    const bad = m.parts
      .filter((p) => {
        const exp = m.experience === 'shared' ? '(taller|cuenca|cosmos)' : m.experience;
        return !new RegExp(`^exp\\.${exp}\\.${m.id}\\.title\\.${p.partId}$`).test(p.labelKey ?? '');
      })
      .map((p) => `${p.partId} → ${p.labelKey}`);
    expect(bad, 'labelKey debe ser exp.<exp>.<modelo>.title.<partId> (D16)').toEqual([]);
  });

  it.each(heroes.map((m) => [m.id, m] as const))('%s: requires apunta a piezas existentes y sin ciclos', (_id, m) => {
    const ids = new Set(m.parts.map((p) => p.partId));
    const dangling = m.parts.flatMap((p) => (p.requires ?? []).filter((r) => !ids.has(r)).map((r) => `${p.partId} → ${r}`));
    expect(dangling).toEqual([]);
    // Detección de ciclos (DFS).
    const req = new Map(m.parts.map((p) => [p.partId, p.requires ?? []]));
    const state = new Map<string, 1 | 2>();
    const cyc: string[] = [];
    const visit = (id: string, path: string[]): void => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) {
        cyc.push([...path, id].join(' → '));
        return;
      }
      state.set(id, 1);
      for (const r of req.get(id) ?? []) visit(r, [...path, id]);
      state.set(id, 2);
    };
    for (const id of ids) visit(id, []);
    expect(cyc).toEqual([]);
  });

  it.each(models.map((m) => [m.id, m] as const))('%s: clips anim_* con duración > 0 y loop booleano', (_id, m) => {
    for (const c of m.clips) {
      expect(c.name).toMatch(/^anim_[a-z0-9_]+$/i);
      expect(c.duration).toBeGreaterThan(0);
      expect(typeof c.loop).toBe('boolean');
    }
  });

  it('cada labelKey de pieza (y su body D16) existe en los textos', () => {
    const allParts = heroes.flatMap((m) => m.parts.map((p) => ({ m, p })));
    if (allParts.length === 0) return;
    const content = loadContent();
    if (content.keys.size === 0) {
      console.warn('[QA] src/content/es/*.json aún no existe: se salta la verificación de labelKeys del manifiesto');
      return;
    }
    const missing: string[] = [];
    for (const { p } of allParts) {
      if (!content.keys.has(p.labelKey)) missing.push(p.labelKey);
      const bodyKey = p.labelKey.replace('.title.', '.body.');
      if (!content.keys.has(bodyKey)) missing.push(bodyKey);
    }
    expect(missing).toEqual([]);
  });
});
