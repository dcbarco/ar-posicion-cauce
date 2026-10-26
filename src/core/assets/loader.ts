// Cargador de modelos: GLB con Meshopt/Draco/KTX2 según public/models/manifest.json.
// Cada GLB se descarga una vez (caché); cada loadModel() entrega un clon con sus propias
// piezas, pivotes y anclas. Geometrías y materiales se comparten con la caché hasta purge().
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LoadedModel, LoadedPart, ModelManifest, ModelManifestEntry, PartExtras } from '../contracts';

const BASE = `${import.meta.env.BASE_URL}models/`;
const VENDOR = `${import.meta.env.BASE_URL}vendor/`;

export interface AssetLoader {
  manifest(): Promise<ModelManifest>;
  /** Precarga (descarga y decodifica) sin clonar. `onProgress` 0..1 sobre el total de ids. */
  preload(ids: readonly string[], onProgress?: (p: number) => void): Promise<void>;
  loadModel(id: string): Promise<LoadedModel>;
  /** Libera de la GPU todo lo cacheado que no esté en `keep`. */
  purge(keep?: readonly string[]): void;
  dispose(): void;
}

export function createAssetLoader(renderer: THREE.WebGLRenderer): AssetLoader {
  const draco = new DRACOLoader().setDecoderPath(`${VENDOR}draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${VENDOR}basis/`).detectSupport(renderer);
  const gltfLoader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

  let manifestP: Promise<ModelManifest> | null = null;
  const cache = new Map<string, Promise<GLTF>>();

  const manifest = () =>
    (manifestP ??= fetch(`${BASE}manifest.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<ModelManifest>) : { version: 1, models: [] }))
      .catch(() => ({ version: 1, models: [] })));

  const entryOf = async (id: string): Promise<ModelManifestEntry> => {
    const e = (await manifest()).models.find((m) => m.id === id);
    if (!e) throw new Error(`[assets] el modelo "${id}" no está en el manifiesto`);
    return e;
  };

  const fetchGltf = (id: string, onProgress?: (p: number) => void): Promise<GLTF> => {
    let p = cache.get(id);
    if (!p) {
      p = entryOf(id).then(
        (e) =>
          new Promise<GLTF>((resolve, reject) =>
            gltfLoader.load(
              // P-011: /models/* es inmutable en caché; la versión en la URL fuerza el modelo nuevo.
              `${BASE}${e.file}?v=${e.hash ?? `${e.sizeKB}-${e.tris}`}`,
              resolve,
              (ev) => ev.lengthComputable && onProgress?.(ev.loaded / ev.total),
              reject,
            ),
          ),
      );
      cache.set(id, p);
      p.catch(() => cache.delete(id));
    }
    return p;
  };

  return {
    manifest,
    async preload(ids, onProgress) {
      if (ids.length === 0) return onProgress?.(1);
      const prog = ids.map(() => 0);
      const report = () => onProgress?.(prog.reduce((a, b) => a + b, 0) / ids.length);
      await Promise.all(
        ids.map((id, i) =>
          fetchGltf(id, (p) => {
            prog[i] = p;
            report();
          }).then(() => {
            prog[i] = 1;
            report();
          }),
        ),
      );
    },
    async loadModel(id) {
      const [gltf, entry] = await Promise.all([fetchGltf(id), entryOf(id)]);
      const scene = skeletonClone(gltf.scene) as THREE.Group;
      const parts = new Map<string, LoadedPart>();
      const pivots = new Map<string, THREE.Object3D>();
      const anchors = new Map<string, THREE.Object3D>();
      scene.traverse((o) => {
        if (o.name.startsWith('part_')) {
          const extras = o.userData as PartExtras;
          const partId = extras.partId ?? o.name.slice(5);
          parts.set(partId, { id: partId, node: o, extras: { ...extras, partId }, restPosition: o.position.clone(), restQuaternion: o.quaternion.clone() });
        } else if (o.name.startsWith('pivot_')) pivots.set(o.name.slice(6), o);
        else if (o.name.startsWith('anchor_')) anchors.set(o.name.slice(7), o);
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return {
        id,
        entry,
        scene,
        animations: gltf.animations,
        parts,
        pivots,
        anchors,
        dispose() {
          scene.removeFromParent();
          parts.clear();
          pivots.clear();
          anchors.clear();
        },
      };
    },
    purge(keep = []) {
      for (const [id, p] of cache) {
        if (keep.includes(id)) continue;
        cache.delete(id);
        void p.then((g) => disposeObject(g.scene));
      }
    },
    dispose() {
      this.purge();
      draco.dispose();
      ktx2.dispose();
    },
  };
}

/** Libera geometrías, materiales y texturas de un subárbol. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
