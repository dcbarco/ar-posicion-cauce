// FxKit (Agente 3): borde luminoso de la mesa, retícula, sello de marca (appear/disappear con líneas
// de luz desde el borde LED), contorno de selección y material fantasma, con niveles de calidad.
// Todo se anima con el dt de update() — nunca con frames ni con window.requestAnimationFrame, que
// no corre durante una sesión inmersiva — y sin asignaciones por frame.
import type * as THREE from 'three';
import type { FxKit, QualityLevel, ReticleFx, TableEdgeFx } from '../core/contracts';
import type { TableSpec } from '../core/table/spec';
import { finishBrandEffect, startBrandEffect, stepBrandEffect, type BrandEffect } from './brand';
import { createTableEdge } from './edge';
import { createGhosting } from './ghost';
import { createOutline } from './outline';
import { QUALITY, type FxQuality } from './quality';
import { createReticle } from './reticle';

export function createFxKit(_renderer: THREE.WebGLRenderer, _scene: THREE.Scene): FxKit {
  let level: QualityLevel = 'high';
  let q: FxQuality = QUALITY.high;
  const getQ = () => q;

  const edges = new Set<TableEdgeFx>();
  const reticles = new Set<ReticleFx>();
  const outline = createOutline();
  const ghosting = createGhosting();

  // Efectos de marca activos (array denso + mapa por objetivo; borrado por intercambio).
  const active: BrandEffect[] = [];
  const byTarget = new Map<THREE.Object3D, BrandEffect>();

  const remove = (fx: BrandEffect) => {
    const i = active.indexOf(fx);
    if (i >= 0) {
      active[i] = active[active.length - 1] as BrandEffect;
      active.pop();
    }
    if (byTarget.get(fx.target) === fx) byTarget.delete(fx.target);
  };

  const run = (kind: 'appear' | 'disappear', target: THREE.Object3D, opts: { from?: 'edge' | 'above'; durationMs?: number } = {}) => {
    const prev = byTarget.get(target);
    if (prev) {
      remove(prev);
      finishBrandEffect(prev);
    }
    const fx = startBrandEffect(kind, target, q, opts, prev);
    const p = new Promise<void>((resolve) => {
      fx.resolve = resolve;
    });
    // Red de seguridad: si update() deja de llamarse, el objeto no queda a medio camino para siempre.
    fx.timer = setTimeout(() => {
      remove(fx);
      finishBrandEffect(fx);
    }, fx.dur * 3000 + 1000);
    active.push(fx);
    byTarget.set(target, fx);
    return p;
  };

  return {
    createTableEdge(table: TableSpec) {
      const e = createTableEdge(table, getQ);
      const dispose = e.dispose;
      e.dispose = () => {
        edges.delete(e);
        dispose();
      };
      edges.add(e);
      return e;
    },
    createReticle() {
      const r = createReticle(getQ);
      const dispose = r.dispose;
      r.dispose = () => {
        reticles.delete(r);
        dispose();
      };
      reticles.add(r);
      return r;
    },
    appear(target, opts) {
      return run('appear', target, opts);
    },
    disappear(target, opts) {
      return run('disappear', target, opts);
    },
    outline(target) {
      outline.set(target);
    },
    ghost(targets, on) {
      ghosting.apply(targets, on);
    },
    setQuality(l) {
      level = l;
      q = QUALITY[level];
    },
    update(dt) {
      for (let i = active.length - 1; i >= 0; i--) {
        const fx = active[i] as BrandEffect;
        if (stepBrandEffect(fx, dt)) {
          remove(fx);
          finishBrandEffect(fx);
        }
      }
      outline.update(dt);
    },
    dispose() {
      while (active.length) {
        const fx = active.pop() as BrandEffect;
        finishBrandEffect(fx);
      }
      byTarget.clear();
      outline.dispose();
      ghosting.dispose();
      for (const e of [...edges]) e.dispose();
      for (const r of [...reticles]) r.dispose();
    },
  };
}
