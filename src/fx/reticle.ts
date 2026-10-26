// Retícula de colocación (ReticleFx). Dos formas distintas, no solo dos colores:
//  - ok   (verde): anillo + punto central + 4 marcas hacia afuera.
//  - warn (ámbar): rombo (cuadrado girado) + signo de exclamación; late más rápido.
// Latido suave por escala; cambio de estado por fundido + escala (cero asignaciones en update).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ReticleFx, ReticleState } from '../core/contracts';
import { AMBER, damp, LED, type FxQuality } from './quality';

function okGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.RingGeometry(0.026, 0.032, 48), new THREE.CircleGeometry(0.0045, 16)];
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.PlaneGeometry(0.0035, 0.012);
    tick.translate(0, 0.045, 0);
    tick.rotateZ((i * Math.PI) / 2);
    parts.push(tick);
  }
  const g = mergeGeometries(parts) ?? new THREE.RingGeometry(0.026, 0.032, 48);
  for (const p of parts) p.dispose();
  g.rotateX(-Math.PI / 2);
  return g;
}

function warnGeometry(): THREE.BufferGeometry {
  const diamond = new THREE.RingGeometry(0.034, 0.041, 4, 1);
  const bar = new THREE.PlaneGeometry(0.0055, 0.016);
  bar.translate(0, 0.005, 0);
  const dot = new THREE.PlaneGeometry(0.0055, 0.0055);
  dot.translate(0, -0.0105, 0);
  const parts = [diamond, bar, dot];
  const g = mergeGeometries(parts) ?? diamond.clone();
  for (const p of parts) p.dispose();
  g.rotateX(-Math.PI / 2);
  return g;
}

function flatMat(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
}

export function createReticle(quality: () => FxQuality): ReticleFx {
  const root = new THREE.Group();
  root.name = 'fx:reticle';
  root.userData.cxFx = true;
  root.visible = false;

  const okGeo = okGeometry();
  const warnGeo = warnGeometry();
  const shadowGeo = new THREE.CircleGeometry(0.05, 32).rotateX(-Math.PI / 2);
  const okMat = flatMat(LED);
  const warnMat = flatMat(AMBER);
  const shadowMat = flatMat('#000000');

  const ok = new THREE.Mesh(okGeo, okMat);
  const warn = new THREE.Mesh(warnGeo, warnMat);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.0005;
  ok.position.y = warn.position.y = 0.002;
  shadow.renderOrder = 9;
  ok.renderOrder = warn.renderOrder = 10;
  for (const m of [ok, warn, shadow]) {
    m.raycast = () => {};
    m.frustumCulled = false;
    m.userData.cxFx = true;
    root.add(m);
  }

  let state: ReticleState = 'hidden';
  let okO = 0;
  let warnO = 0;
  let t = 0;

  return {
    object: root,
    setState(s) {
      state = s;
      if (s !== 'hidden') root.visible = true;
    },
    update(dt) {
      t += dt;
      const q = quality();
      okO = damp(okO, state === 'ok' ? 1 : 0, 12, dt);
      warnO = damp(warnO, state === 'warn' ? 1 : 0, 12, dt);
      okMat.opacity = okO * 0.95;
      warnMat.opacity = warnO;
      shadowMat.opacity = Math.max(okO, warnO) * 0.22;
      // latido: ok 0,8 Hz suave; warn 1,6 Hz más marcado
      const beatOk = 1 + 0.05 * q.reticleBeat * Math.sin(t * Math.PI * 1.6);
      const beatWarn = 1 + 0.08 * q.reticleBeat * Math.sin(t * Math.PI * 3.2);
      const sOk = (0.8 + 0.2 * okO) * beatOk;
      const sWarn = (0.8 + 0.2 * warnO) * beatWarn;
      ok.scale.set(sOk, 1, sOk);
      warn.scale.set(sWarn, 1, sWarn);
      ok.visible = okO > 0.01;
      warn.visible = warnO > 0.01;
      if (state === 'hidden' && okO < 0.01 && warnO < 0.01) root.visible = false;
    },
    dispose() {
      root.removeFromParent();
      okGeo.dispose();
      warnGeo.dispose();
      shadowGeo.dispose();
      okMat.dispose();
      warnMat.dispose();
      shadowMat.dispose();
    },
  };
}
