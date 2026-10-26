// Sello de marca: líneas de luz verde que corren desde el borde LED de la mesa y condensan el objeto
// (appear), o que salen del objeto y vuelven al borde mientras se disuelve (disappear).
// Las líneas son cintas planas en un solo Mesh por efecto (1 draw call); la animación es por uniforms
// y escala del objeto, avanzada con dt en update() (no depende de window.requestAnimationFrame).
import * as THREE from 'three';
import { TABLE } from '../core/table/spec';
import { clamp01, easeInCubic, easeOutBack, easeOutCubic, LED, LED_HOT, type FxQuality } from './quality';

const vert = /* glsl */ `
attribute float aS;
attribute float aDelay;
attribute float aSide;
varying float vS;
varying float vDelay;
varying float vSide;
void main() {
  vS = aS;
  vDelay = aDelay;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform float uT;      // progreso global de las líneas 0..1
uniform float uDir;    // 0 = del borde al objeto, 1 = del objeto al borde
uniform float uTrail;  // largo de la estela (fracción del recorrido)
uniform float uFade;
uniform vec3 uColor;
uniform vec3 uHot;
varying float vS;
varying float vDelay;
varying float vSide;
void main() {
  float s = mix(vS, 1.0 - vS, uDir);
  float p = clamp((uT - vDelay) / (1.0 - 0.35), 0.0, 1.0);
  float head = p * (1.0 + uTrail);
  float x = head - s;
  float inTrail = step(0.0, x) * step(x, uTrail);
  float k = 1.0 - x / uTrail;
  float a = inTrail * k * k;
  a *= smoothstep(0.0, 0.7, 1.0 - abs(vSide));
  vec3 col = mix(uColor, uHot, smoothstep(0.75, 1.0, k) * inTrail);
  gl_FragColor = vec4(col, a * uFade);
}`;

export interface BrandEffect {
  target: THREE.Object3D;
  kind: 'appear' | 'disappear';
  from: 'edge' | 'above';
  dur: number;
  t: number;
  origScale: THREE.Vector3;
  origY: number;
  mesh: THREE.Mesh | null;
  mat: THREE.ShaderMaterial | null;
  resolve: () => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  done: boolean;
}

const _box = new THREE.Box3();
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _side = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Marco "mesa local": ancestro marcado por el núcleo; si no hay, el padre del objeto. */
export function findTableFrame(o: THREE.Object3D): THREE.Object3D | null {
  let p: THREE.Object3D | null = o.parent;
  while (p) {
    if (p.name === 'tableFrame' || p.userData.tableFrame === true) return p;
    p = p.parent;
  }
  return o.parent;
}

/** Punto del perímetro del tope para el parámetro u ∈ [0,1). */
function perimeterPoint(u: number, out: THREE.Vector3): THREE.Vector3 {
  const L = TABLE.length;
  const W = TABLE.width;
  const P = 2 * (L + W);
  let d = (((u % 1) + 1) % 1) * P;
  const hx = L / 2;
  const hz = W / 2;
  if (d < L) return out.set(-hx + d, 0.002, -hz);
  d -= L;
  if (d < W) return out.set(hx, 0.002, -hz + d);
  d -= W;
  if (d < L) return out.set(hx - d, 0.002, hz);
  d -= L;
  return out.set(-hx, 0.002, hz - d);
}

/** Construye las cintas de luz (en coordenadas del marco) hacia la caja `box` del objeto. */
function buildStreaks(box: THREE.Box3, from: 'edge' | 'above', q: FxQuality, seed: number): THREE.BufferGeometry {
  const N = q.streaks;
  const K = q.streakSegments;
  const w = q.streakWidth / 2;
  const pos = new Float32Array(N * (K + 1) * 2 * 3);
  const sArr = new Float32Array(N * (K + 1) * 2);
  const dArr = new Float32Array(N * (K + 1) * 2);
  const sideArr = new Float32Array(N * (K + 1) * 2);
  const idx: number[] = [];
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  let r = seed;
  const rnd = () => {
    r = (r * 16807) % 2147483647;
    return (r - 1) / 2147483646;
  };
  const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const lens = [0, 0];
  let vi = 0;
  for (let i = 0; i < N; i++) {
    const [E, B, T] = pts as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    // destino: un punto dentro del volumen del objeto
    T.set(center.x + (rnd() - 0.5) * size.x * 0.7, box.min.y + rnd() * size.y, center.z + (rnd() - 0.5) * size.z * 0.7);
    if (from === 'edge') {
      perimeterPoint((i + rnd() * 0.7) / N, E);
      // pie del objeto en la dirección del borde
      _v.set(E.x - center.x, 0, E.z - center.z).normalize();
      const rad = Math.max(0.02, Math.min(size.x, size.z) * 0.5);
      B.set(center.x + _v.x * rad, 0.002, center.z + _v.z * rad);
    } else {
      const ang = (i / N) * Math.PI * 2 + rnd();
      const rad = Math.max(size.x, size.z) * (0.4 + rnd() * 0.5);
      E.set(center.x + Math.cos(ang) * rad, box.max.y + 0.22 + rnd() * 0.08, center.z + Math.sin(ang) * rad);
      B.set(center.x + Math.cos(ang) * rad * 0.6, box.max.y + 0.06, center.z + Math.sin(ang) * rad * 0.6);
    }
    lens[0] = E.distanceTo(B);
    lens[1] = B.distanceTo(T);
    const total = lens[0] + lens[1] || 1;
    const delay = rnd() * 0.35;
    _side.set(0, 0, 0);
    for (let k = 0; k <= K; k++) {
      const s = k / K;
      const d = s * total;
      if (d <= lens[0]) _a.lerpVectors(E, B, lens[0] ? d / lens[0] : 0);
      else _a.lerpVectors(B, T, lens[1] ? (d - lens[0]) / lens[1] : 1);
      // dirección local para orientar la cinta
      const d2 = Math.min(total, d + total / K);
      if (d2 <= lens[0]) _b.lerpVectors(E, B, lens[0] ? d2 / lens[0] : 0);
      else _b.lerpVectors(B, T, lens[1] ? (d2 - lens[0]) / lens[1] : 1);
      _v.subVectors(_b, _a);
      if (_v.lengthSq() > 1e-10) {
        _v.normalize();
        if (Math.abs(_v.y) < 0.9) _side.crossVectors(_v, UP).normalize();
      }
      if (_side.lengthSq() < 0.5) _side.set(1, 0, 0);
      for (let side = -1; side <= 1; side += 2) {
        pos[vi * 3] = _a.x + _side.x * w * side;
        pos[vi * 3 + 1] = _a.y + _side.y * w * side;
        pos[vi * 3 + 2] = _a.z + _side.z * w * side;
        sArr[vi] = s;
        dArr[vi] = delay;
        sideArr[vi] = side;
        vi++;
      }
      if (k < K) {
        const base = vi - 2;
        idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.BufferAttribute(sArr, 1));
  g.setAttribute('aDelay', new THREE.BufferAttribute(dArr, 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(sideArr, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

let seedCounter = 1;

export function startBrandEffect(
  kind: 'appear' | 'disappear',
  target: THREE.Object3D,
  q: FxQuality,
  opts: { from?: 'edge' | 'above'; durationMs?: number },
  prev: BrandEffect | undefined,
): BrandEffect {
  const from = opts.from ?? 'edge';
  const dur = Math.max(0.25, (opts.durationMs ?? (kind === 'appear' ? 1100 : 800)) / 1000);
  // Si había un efecto en curso sobre el mismo objeto, se hereda su pose original.
  const origScale = prev ? prev.origScale.clone() : target.scale.clone();
  const origY = prev ? prev.origY : target.position.y;
  target.scale.copy(origScale);
  target.position.y = origY;
  target.visible = true;

  const fx: BrandEffect = { target, kind, from, dur, t: 0, origScale, origY, mesh: null, mat: null, resolve: () => {}, timer: undefined, done: false };

  const frame = findTableFrame(target);
  if (frame) {
    target.updateWorldMatrix(true, true);
    frame.updateWorldMatrix(true, false);
    _box.setFromObject(target);
    if (!_box.isEmpty()) {
      _inv.copy(frame.matrixWorld).invert();
      _box.applyMatrix4(_inv);
      const geo = buildStreaks(_box, from, q, (seedCounter = (seedCounter * 48271) % 2147483647) || 1);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uT: { value: 0 },
          uDir: { value: kind === 'appear' ? 0 : 1 },
          uTrail: { value: 0.35 },
          uFade: { value: 1 },
          uColor: { value: new THREE.Color(LED) },
          uHot: { value: new THREE.Color(LED_HOT) },
        },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending, // no aditivo: sobre el tope blanco y el video claro, lo aditivo desaparece
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `fx:${kind}`;
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      mesh.userData.cxFx = true;
      frame.add(mesh);
      fx.mesh = mesh;
      fx.mat = mat;
    }
  }
  if (kind === 'appear') {
    target.scale.copy(origScale).multiplyScalar(0.001);
  }
  return fx;
}

/** Avanza el efecto. Devuelve true cuando terminó. Sin asignaciones. */
export function stepBrandEffect(fx: BrandEffect, dt: number): boolean {
  fx.t += dt;
  const k = clamp01(fx.t / fx.dur);
  const u = fx.mat?.uniforms;
  const tg = fx.target;
  if (fx.kind === 'appear') {
    // 0–75 %: las líneas corren del borde al objeto; 40–100 %: el objeto se condensa con asentamiento.
    if (u) {
      (u.uT as THREE.IUniform<number>).value = clamp01(k / 0.75);
      (u.uFade as THREE.IUniform<number>).value = 1 - clamp01((k - 0.8) / 0.2);
    }
    const g = clamp01((k - 0.4) / 0.6);
    const s = g <= 0 ? 0.001 : Math.max(0.001, easeOutBack(g));
    tg.scale.copy(fx.origScale).multiplyScalar(s);
    if (fx.from === 'above') tg.position.y = fx.origY + 0.12 * (1 - easeOutCubic(g));
  } else {
    // 0–15 %: anticipación (crece 4 %); 15–60 %: se encoge; 25–100 %: líneas vuelven al borde.
    const a = clamp01(k / 0.15);
    const sh = clamp01((k - 0.15) / 0.45);
    const s = k < 0.15 ? 1 + 0.04 * easeOutCubic(a) : Math.max(0.001, 1.04 * (1 - easeInCubic(sh)));
    tg.scale.copy(fx.origScale).multiplyScalar(s);
    if (u) {
      (u.uT as THREE.IUniform<number>).value = clamp01((k - 0.25) / 0.75);
      (u.uFade as THREE.IUniform<number>).value = 1 - clamp01((k - 0.85) / 0.15);
    }
  }
  return k >= 1;
}

/** Cierra el efecto: deja el objeto en su pose final y libera la geometría/material. */
export function finishBrandEffect(fx: BrandEffect): void {
  if (fx.done) return;
  fx.done = true;
  clearTimeout(fx.timer);
  fx.target.scale.copy(fx.origScale);
  fx.target.position.y = fx.origY;
  // disappear no quita el objeto de la escena: lo deja oculto con su escala original.
  if (fx.kind === 'disappear') fx.target.visible = false;
  if (fx.mesh) {
    fx.mesh.removeFromParent();
    fx.mesh.geometry.dispose();
  }
  fx.mat?.dispose();
  fx.mesh = null;
  fx.mat = null;
  fx.resolve();
}
