// Taller — efectos propios de cada máquina (Agente 3): corriente por fases en las bobinas del motor
// eléctrico, chorro y salpicadura de la Pelton y brillo del bombillo de su generador.
// Todo cuelga de `model.scene` (espacio del modelo) y se libera con dispose(). Sin asignaciones por frame.
import * as THREE from 'three';
import type { LoadedModel } from '../../../core/contracts';

export interface MachineFxState {
  playing: boolean;
  /** Multiplicador de velocidad del clip (0,1–2). */
  speed: number;
  /** Tiempo dentro del clip principal (s) y su duración. */
  clipTime: number;
  clipDuration: number;
  /** Explosión global 0..1 (los efectos se apagan si la máquina está abierta). */
  explode: number;
}

export interface MachineFx {
  update(dt: number, s: MachineFxState): void;
  /** Motor eléctrico: fase con más corriente (0 = A, 1 = B, 2 = C), o −1 si no hay corriente. */
  phase(): number;
  dispose(): void;
}

const COIL_GLOW = new THREE.Color('#FF8A3D');
const LAMP_GLOW = new THREE.Color('#F2C744');
const WATER = '#8FD3F0';

/** Clona el material de las mallas cuyo material se llame `name` (para animarlo sin tocar la caché). */
function cloneByName(root: THREE.Object3D, name: string, out: THREE.MeshStandardMaterial[]): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.material.name !== name) return;
    const m = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = m;
    out.push(m);
  });
}

export function createMachineFx(model: LoadedModel): MachineFx | null {
  if (model.id === 'motor_electric') return createCoilFx(model);
  if (model.id === 'pelton') return createPeltonFx(model);
  return null;
}

// ───────── motor eléctrico: las tres fases se encienden por turnos ─────────
function createCoilFx(model: LoadedModel): MachineFx {
  const phases = ['cobre_a', 'cobre_b', 'cobre_c'].map((n) => {
    const list: THREE.MeshStandardMaterial[] = [];
    cloneByName(model.scene, n, list);
    for (const m of list) m.emissive.copy(COIL_GLOW);
    return list;
  });
  const clip = model.animations.find((a) => a.name === 'anim_spin');
  const polePairs = Number((clip?.userData as { polePairs?: number } | undefined)?.polePairs ?? 2);
  let active = -1;
  let level = 0; // brillo general (sube y baja suave al arrancar y parar)
  return {
    update(dt, s) {
      const on = s.playing && s.explode < 0.02;
      level += ((on ? 1 : 0) - level) * (1 - Math.exp(-dt * 6));
      const turn = s.clipDuration > 0 ? (s.clipTime % s.clipDuration) / s.clipDuration : 0;
      const e = turn * Math.PI * 2 * polePairs; // ángulo eléctrico
      let best = 0;
      active = -1;
      for (let k = 0; k < 3; k++) {
        const c = Math.max(0, Math.cos(e - (k * Math.PI * 2) / 3));
        const v = c * c * level;
        if (v > best) {
          best = v;
          active = k;
        }
        for (const m of phases[k]!) m.emissiveIntensity = v * 1.6;
      }
      if (level < 0.05) active = -1;
    },
    phase: () => active,
    dispose() {
      for (const list of phases) for (const m of list) m.dispose();
    },
  };
}

// ───────── Pelton: chorro, salpicadura y bombillo ─────────
const DROPS = 90;

function createPeltonFx(model: LoadedModel): MachineFx {
  const a = model.anchors.get('jet_start');
  const b = model.anchors.get('jet_end');
  const start = a ? a.position.clone() : new THREE.Vector3();
  const end = b ? b.position.clone() : new THREE.Vector3(0, 0, 0.06);
  const len = start.distanceTo(end);

  const waterMat = new THREE.MeshStandardMaterial({ color: WATER, emissive: WATER, emissiveIntensity: 0.25, transparent: true, opacity: 0.7, roughness: 0.1, depthWrite: false });
  // Cilindro sobre Y → a lo largo del chorro (+Z: las dos anclas comparten x e y), con el origen en el inyector.
  const jetGeo = new THREE.CylinderGeometry(0.0042, 0.0058, len, 12, 1, true).translate(0, len / 2, 0).rotateX(Math.PI / 2);
  const jet = new THREE.Mesh(jetGeo, waterMat);
  jet.position.copy(start);
  jet.name = 'fx:jet';
  jet.raycast = () => {};
  jet.visible = false;

  // Gotas: salen del punto de impacto hacia los lados y atrás, y caen al foso.
  const pos = new Float32Array(DROPS * 3);
  const vel = new Float32Array(DROPS * 3);
  const life = new Float32Array(DROPS);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dropMat = new THREE.PointsMaterial({ color: WATER, size: 0.004, transparent: true, opacity: 0.8, depthWrite: false });
  const drops = new THREE.Points(dropGeo, dropMat);
  drops.frustumCulled = false;
  drops.raycast = () => {};
  drops.visible = false;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spawn = (i: number) => {
    pos[i * 3] = end.x + (rnd() - 0.5) * 0.01;
    pos[i * 3 + 1] = end.y;
    pos[i * 3 + 2] = end.z;
    vel[i * 3] = (rnd() < 0.5 ? -1 : 1) * (0.08 + rnd() * 0.12);
    vel[i * 3 + 1] = -0.05 + rnd() * 0.18;
    vel[i * 3 + 2] = -0.1 - rnd() * 0.25; // el agua sale hacia atrás: entregó su fuerza a la cuchara
    life[i] = rnd() * 0.6;
  };
  for (let i = 0; i < DROPS; i++) spawn(i);
  model.scene.add(jet, drops);

  const lamp: THREE.MeshStandardMaterial[] = [];
  cloneByName(model.scene, 'bombillo', lamp);
  for (const m of lamp) {
    m.emissive.copy(LAMP_GLOW);
    m.emissiveIntensity = 0; // apagado hasta que el generador gire
  }

  let flow = 0; // caudal visible 0..1
  let t = 0;
  return {
    update(dt, s) {
      t += dt;
      const on = s.playing && s.explode < 0.02;
      flow += ((on ? 1 : 0) - flow) * (1 - Math.exp(-dt * 5));
      const visible = flow > 0.02;
      jet.visible = drops.visible = visible;
      if (visible) {
        const w = flow * (1 + 0.06 * Math.sin(t * 47));
        jet.scale.set(w, w, 1);
        waterMat.opacity = 0.7 * flow;
        dropMat.opacity = 0.8 * flow;
        const floor = 0.02;
        for (let i = 0; i < DROPS; i++) {
          life[i]! += dt;
          vel[i * 3 + 1]! -= 9.8 * dt * 0.35; // gravedad (atenuada: a escala de maqueta)
          pos[i * 3]! += vel[i * 3]! * dt;
          pos[i * 3 + 1]! += vel[i * 3 + 1]! * dt;
          pos[i * 3 + 2]! += vel[i * 3 + 2]! * dt;
          if (pos[i * 3 + 1]! < floor || life[i]! > 0.9) spawn(i);
        }
        (dropGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
      const glow = on ? 0.25 + 1.5 * Math.min(1, s.speed / 2) : 0;
      for (const m of lamp) m.emissiveIntensity += (glow - m.emissiveIntensity) * (1 - Math.exp(-dt * 4));
    },
    phase: () => -1,
    dispose() {
      jet.removeFromParent();
      drops.removeFromParent();
      jetGeo.dispose();
      dropGeo.dispose();
      waterMat.dispose();
      dropMat.dispose();
      for (const m of lamp) m.dispose();
    },
  };
}
