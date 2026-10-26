// Borde luminoso de la mesa (TableEdgeFx): banda plana con núcleo brillante y halo, corrientes de luz
// que corren por el perímetro (modo lock), pulso al interactuar y barrido de cierre del Table Lock.
// Un solo draw call; todo el movimiento va por uniforms (cero asignaciones en update).
import * as THREE from 'three';
import type { TableEdgeFx } from '../core/contracts';
import type { TableSpec } from '../core/table/spec';
import { damp, LED, LED_HOT, type FxQuality } from './quality';

const HALF_BAND = 0.014; // m a cada lado de la línea del borde
const MODE_OPACITY = { lock: 1, rest: 0.35, hidden: 0 } as const;
const SWEEP_S = 1.4;
const SWEEP_TAIL = 0.35; // fracción de perímetro que dura la estela

const vert = /* glsl */ `
attribute float aU;
attribute float aV;
varying float vU;
varying float vV;
void main() {
  vU = aU;
  vV = aV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uOpacity;
uniform float uTime;
uniform float uPulse;
uniform float uSweep;
uniform float uSweepOn;
uniform float uFlow;
uniform float uGlow;
varying float vU;
varying float vV;
void main() {
  float d = abs(vV);
  float core = 1.0 - smoothstep(0.08, 0.26, d);
  float halo = (1.0 - d);
  halo = halo * halo * 0.5 * uGlow;
  // corrientes: pulsos que corren a lo largo del perímetro (el "cauce")
  float wave = fract(vU * 14.0 - uTime * 0.35);
  float flow = uFlow * smoothstep(0.0, 0.15, wave) * (1.0 - smoothstep(0.15, 0.5, wave)) * core;
  // barrido: cabeza brillante en uSweep con estela hacia atrás
  float behind = uSweep - vU;
  float trail = uSweepOn * step(0.0, behind) * exp(-behind * 9.0);
  float lit = core + halo;
  float a = lit * (1.0 + uPulse * 0.9) + flow * 0.9 + trail * (core * 2.0 + halo * 1.5);
  vec3 col = mix(uColor, uHot, clamp(core * (trail + uPulse * 0.6 + flow * 0.5), 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uOpacity);
}`;

function buildBand(length: number, width: number): THREE.BufferGeometry {
  const hx = length / 2;
  const hz = width / 2;
  const corners: [number, number][] = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
    [-hx, -hz],
  ];
  const perim = 2 * (length + width);
  const pos: number[] = [];
  const u: number[] = [];
  const v: number[] = [];
  let acc = 0;
  for (let i = 0; i < corners.length; i++) {
    const [x, z] = corners[i] as [number, number];
    if (i > 0) {
      const [px, pz] = corners[i - 1] as [number, number];
      acc += Math.hypot(x - px, z - pz);
    }
    const sx = Math.sign(x);
    const sz = Math.sign(z);
    // inglete exacto en las esquinas de un rectángulo: desplazamiento diagonal
    pos.push(x - sx * HALF_BAND, 0, z - sz * HALF_BAND, x + sx * HALF_BAND, 0, z + sz * HALF_BAND);
    u.push(acc / perim, acc / perim);
    v.push(-1, 1);
  }
  const idx: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(u, 1));
  g.setAttribute('aV', new THREE.Float32BufferAttribute(v, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function createTableEdge(table: TableSpec, quality: () => FxQuality): TableEdgeFx {
  const geo = buildBand(table.length, table.width);
  const uniforms = {
    uColor: { value: new THREE.Color(table.ledColor || LED) },
    uHot: { value: new THREE.Color(LED_HOT) },
    uOpacity: { value: 0 },
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uSweep: { value: 0 },
    uSweepOn: { value: 0 },
    uFlow: { value: 0 },
    uGlow: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending, // no aditivo: sobre el tope blanco y el video claro, lo aditivo desaparece
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'fx:table-edge';
  mesh.position.y = 0.0015; // sobre el tope, sin z-fighting con el ocluyente
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.userData.cxFx = true;
  mesh.visible = false;

  let mode: 'lock' | 'rest' | 'hidden' = 'hidden';
  let targetOpacity = 0;
  let sweeping = false;
  let sweepResolve: (() => void) | null = null;
  let sweepTimer: ReturnType<typeof setTimeout> | undefined;

  const endSweep = () => {
    sweeping = false;
    uniforms.uSweepOn.value = 0;
    clearTimeout(sweepTimer);
    const r = sweepResolve;
    sweepResolve = null;
    // Tras el barrido la mesa queda como línea sutil permanente.
    if (mode !== 'hidden') fx.setMode('rest');
    r?.();
  };

  const fx: TableEdgeFx = {
    object: mesh,
    setMode(m) {
      mode = m;
      targetOpacity = MODE_OPACITY[m];
      if (m !== 'hidden') mesh.visible = true;
    },
    pulse() {
      uniforms.uPulse.value = 1;
    },
    sweep() {
      if (sweepResolve) endSweep();
      if (mode === 'hidden') fx.setMode('lock');
      sweeping = true;
      uniforms.uSweep.value = 0;
      uniforms.uSweepOn.value = 1;
      uniforms.uPulse.value = 0.6;
      return new Promise<void>((resolve) => {
        sweepResolve = resolve;
        // Red de seguridad: si nadie llama a update(), la promesa se resuelve igual.
        sweepTimer = setTimeout(endSweep, (SWEEP_S + 1) * 1000 * 2);
      });
    },
    update(dt) {
      const q = quality();
      uniforms.uTime.value += dt;
      uniforms.uGlow.value = q.edgeGlow;
      uniforms.uFlow.value = damp(uniforms.uFlow.value, mode === 'lock' ? q.edgeFlow : 0, 4, dt);
      uniforms.uOpacity.value = damp(uniforms.uOpacity.value, sweeping ? 1 : targetOpacity, 6, dt);
      uniforms.uPulse.value = damp(uniforms.uPulse.value, 0, 4, dt);
      if (sweeping) {
        uniforms.uSweep.value += dt / SWEEP_S;
        if (uniforms.uSweep.value >= 1 + SWEEP_TAIL) endSweep();
      }
      if (mode === 'hidden' && !sweeping && uniforms.uOpacity.value < 0.005) mesh.visible = false;
    },
    dispose() {
      if (sweepResolve) endSweep();
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
  return fx;
}
