// Material fantasma (opacidad 0,15), reversible y sin fugas:
// - El material original de cada malla se guarda en un WeakMap (no retiene mallas desechadas).
// - Cada material original tiene un único clon fantasma con conteo de referencias; al volver a 0 se
//   libera. Los clones comparten texturas con el original (Material.clone no las duplica).
import type * as THREE from 'three';

const GHOST_OPACITY = 0.15;

export function createGhosting() {
  const originals = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const clones = new Map<THREE.Material, { mat: THREE.Material; refs: number }>();

  const acquire = (m: THREE.Material): THREE.Material => {
    let e = clones.get(m);
    if (!e) {
      const c = m.clone();
      c.transparent = true;
      c.opacity = GHOST_OPACITY * (m.transparent ? m.opacity : 1);
      c.depthWrite = false;
      c.name = `${m.name}:ghost`;
      c.userData.cxGhost = true;
      e = { mat: c, refs: 0 };
      clones.set(m, e);
    }
    e.refs++;
    return e.mat;
  };
  const release = (m: THREE.Material) => {
    const e = clones.get(m);
    if (!e) return;
    e.refs--;
    if (e.refs <= 0) {
      e.mat.dispose();
      clones.delete(m);
    }
  };

  return {
    apply(targets: THREE.Object3D[], on: boolean) {
      for (const root of targets) {
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || o.userData.cxFx) return;
          const orig = originals.get(mesh);
          if (on && !orig) {
            originals.set(mesh, mesh.material);
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(acquire) : acquire(mesh.material);
          } else if (!on && orig) {
            mesh.material = orig;
            originals.delete(mesh);
            if (Array.isArray(orig)) orig.forEach(release);
            else release(orig);
          }
        });
      }
    },
    /** Clones vivos (para pruebas de fugas). */
    liveClones: () => clones.size,
    dispose() {
      for (const e of clones.values()) e.mat.dispose();
      clones.clear();
    },
  };
}
