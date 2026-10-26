// Constructor de GLB con gltf-transform a partir de geometrías de three (sin GLTFExporter ni DOM).
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { finalize, merge } from './geo.mjs';

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function hexLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
}

export async function createIO() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
}

export class GlbBuilder {
  constructor(sceneName, assetExtras = {}) {
    this.doc = new Document();
    const asset = this.doc.getRoot().getAsset();
    asset.generator = 'Mesa CAUCE · tools/models (procedural)';
    this.doc.getRoot().setExtras(assetExtras);
    this.buffer = this.doc.createBuffer();
    this.scene = this.doc.createScene(sceneName);
    this.materials = new Map();
    this.names = new Set();
  }

  material(key, { color, metallic = 0, roughness = 0.5, emissive, doubleSided = false, alpha }) {
    if (this.materials.has(key)) return this.materials.get(key);
    const m = this.doc
      .createMaterial(key)
      .setBaseColorFactor([...hexLinear(color), alpha ?? 1])
      .setMetallicFactor(metallic)
      .setRoughnessFactor(roughness)
      .setDoubleSided(doubleSided);
    if (alpha !== undefined && alpha < 1) m.setAlphaMode('BLEND');
    if (emissive) m.setEmissiveFactor(hexLinear(emissive));
    this.materials.set(key, m);
    return m;
  }

  node(name, { t, r, s, extras } = {}, parent = null) {
    if (this.names.has(name)) throw new Error(`nombre de nodo repetido: ${name}`);
    this.names.add(name);
    const n = this.doc.createNode(name);
    if (t) n.setTranslation(t);
    if (r) n.setRotation(r);
    if (s) n.setScale(s);
    if (extras) n.setExtras(extras);
    if (parent) parent.addChild(n);
    else this.scene.addChild(n);
    return n;
  }

  accessor(array, type) {
    return this.doc.createAccessor().setArray(array).setType(type).setBuffer(this.buffer);
  }

  /** items: [{ g: BufferGeometry, mat: Material }]; agrupa por material y crea una malla multi-primitiva. */
  mesh(name, items) {
    const byMat = new Map();
    for (const { g, mat } of items) {
      if (!g) continue;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat).push(g);
    }
    const mesh = this.doc.createMesh(name);
    for (const [mat, gs] of byMat) {
      const g = finalize(merge(gs));
      const pos = new Float32Array(g.attributes.position.array);
      const nor = new Float32Array(g.attributes.normal.array);
      const idxSrc = g.index.array;
      const idx = pos.length / 3 < 65536 ? new Uint16Array(idxSrc) : new Uint32Array(idxSrc);
      const prim = this.doc
        .createPrimitive()
        .setAttribute('POSITION', this.accessor(pos, 'VEC3'))
        .setAttribute('NORMAL', this.accessor(nor, 'VEC3'))
        .setIndices(this.accessor(idx, 'SCALAR'))
        .setMaterial(mat);
      mesh.addPrimitive(prim);
    }
    return mesh;
  }

  /** channels: [{ node, path: 'translation'|'rotation'|'scale', times: Float32Array, values: Float32Array }] */
  clip(name, channels, extras) {
    const anim = this.doc.createAnimation(name);
    if (extras) anim.setExtras(extras);
    for (const c of channels) {
      const sampler = this.doc
        .createAnimationSampler()
        .setInput(this.accessor(c.times, 'SCALAR'))
        .setOutput(this.accessor(c.values, c.path === 'rotation' ? 'VEC4' : 'VEC3'))
        .setInterpolation(c.interpolation ?? 'LINEAR');
      const ch = this.doc.createAnimationChannel().setTargetNode(c.node).setTargetPath(c.path).setSampler(sampler);
      anim.addSampler(sampler).addChannel(ch);
    }
    return anim;
  }

  async write(path) {
    const io = await createIO();
    await io.write(path, this.doc);
  }
}
