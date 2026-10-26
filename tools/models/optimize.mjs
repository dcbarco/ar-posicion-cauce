#!/usr/bin/env node
// Optimiza GLB con gltf-transform: dedup → prune (conserva anclas vacías) → weld → resample → texturas → Meshopt.
//
// Uso:
//   npm run models:optimize                      todos los modelos de models.config.json
//   npm run models:optimize -- motor4t           solo esos ids
//   npm run models:optimize -- --build           además re-ejecuta el script procedural de cada modelo
//   node tools/models/optimize.mjs in.glb out.glb   un archivo suelto
//
// Texturas: KTX2 si `toktx` está en el PATH (requiere @gltf-transform/cli, pedido P en PEDIDOS-DE-CONTRATO);
// si no, WebP ≤ 1024 px con sharp (temporal, anotado en CATALOGO-MODELOS.md).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, meshopt, prune, resample, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { createIO } from './lib/gltf.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = JSON.parse(readFileSync(resolve(ROOT, 'tools/models/models.config.json'), 'utf8'));

function hasToktx() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['toktx'], { encoding: 'utf8' });
  return r.status === 0;
}

export async function optimizeFile(inPath, outPath, { log = console.log } = {}) {
  const io = await createIO();
  const doc = await io.read(inPath);
  const hasTextures = doc.getRoot().listTextures().length > 0;
  const steps = [
    dedup(),
    prune({ keepLeaves: true, keepExtras: true }),
    weld(),
    resample({ tolerance: 1e-5 }),
  ];
  let texNote = null;
  if (hasTextures) {
    if (hasToktx()) {
      texNote = 'toktx encontrado: use `npx gltf-transform etc1s|uastc` (CLI) para KTX2; aquí se deja WebP';
    }
    steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }));
    texNote ??= 'texturas WebP ≤ 1024 px (sin toktx; pendiente KTX2)';
  }
  steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  mkdirSync(dirname(outPath), { recursive: true });
  await io.write(outPath, doc);
  const kb = statSync(outPath).size / 1024;
  const inKb = statSync(inPath).size / 1024;
  log(`  ${inPath.replace(ROOT, '.')} (${inKb.toFixed(0)} KB) → ${outPath.replace(ROOT, '.')} (${kb.toFixed(0)} KB)${texNote ? ' · ' + texNote : ''}`);
  return { kb, texNote };
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => a.endsWith('.glb') || a.endsWith('.gltf'));
  if (files.length === 2) {
    await optimizeFile(resolve(files[0]), resolve(files[1]));
    return;
  }
  const rebuild = args.includes('--build');
  const ids = args.filter((a) => !a.startsWith('--'));
  const models = CONFIG.models.filter((m) => ids.length === 0 || ids.includes(m.id));
  if (models.length === 0) {
    console.log('optimize: no hay modelos que procesar.');
    return;
  }
  let failed = 0;
  for (const m of models) {
    console.log(`▸ ${m.id}`);
    try {
      const src = resolve(ROOT, m.src);
      if (m.build && (rebuild || !existsSync(src))) {
        execFileSync(process.execPath, [resolve(ROOT, m.build), ...(m.buildArgs ?? [])], { stdio: 'inherit', cwd: ROOT });
      }
      if (!existsSync(src)) throw new Error(`no existe ${m.src}`);
      await optimizeFile(src, resolve(ROOT, 'public/models', m.file));
    } catch (e) {
      failed++;
      console.error(`  ✗ ${m.id}: ${e.message}`);
    }
  }
  console.log(failed ? `optimize: ${failed} con error.` : 'optimize: listo. Ahora: npm run models:validate');
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
