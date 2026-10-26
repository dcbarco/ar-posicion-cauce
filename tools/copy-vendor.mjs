// Copia los decodificadores de three (Draco glTF y Basis/KTX2) a public/vendor/ para que
// se sirvan con rutas estables en dev y en el build. Se ejecuta en predev/prebuild.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libs = resolve(root, 'node_modules/three/examples/jsm/libs');
const out = resolve(root, 'public/vendor');

const copies = [
  ['draco/gltf/draco_decoder.js', 'draco/draco_decoder.js'],
  ['draco/gltf/draco_decoder.wasm', 'draco/draco_decoder.wasm'],
  ['draco/gltf/draco_wasm_wrapper.js', 'draco/draco_wasm_wrapper.js'],
  ['basis/basis_transcoder.js', 'basis/basis_transcoder.js'],
  ['basis/basis_transcoder.wasm', 'basis/basis_transcoder.wasm'],
];
for (const [from, to] of copies) {
  const dest = resolve(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(resolve(libs, from), dest);
}
console.info(`[vendor] ${copies.length} archivos copiados a public/vendor`);
