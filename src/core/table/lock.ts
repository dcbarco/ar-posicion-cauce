// Table Lock (sección 5.2): fija la pose de la mesa en el mundo de ARCore sin marcador.
// Coordenadas "mundo" = espacio de referencia XR (lo que three usa como mundo en la sesión).
import * as THREE from 'three';

export interface LockPose {
  position: THREE.Vector3; // centro del tope
  yaw: number; // rad, giro de la mesa alrededor de +Y
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

/** Yaw para que el eje +Z de la mesa apunte hacia la cámara (el visitante mira un lado largo). */
export function yawFacing(center: THREE.Vector3, cameraPos: THREE.Vector3): number {
  return Math.atan2(cameraPos.x - center.x, cameraPos.z - center.z);
}

export class TableLock {
  /** Pose provisional durante el ajuste (aim/adjust). */
  readonly pose: LockPose = { position: new THREE.Vector3(), yaw: 0 };
  anchor: XRAnchor | null = null;
  locked = false;
  private readonly lastPos = new THREE.Vector3();
  private hasLast = false;

  constructor(readonly frame: THREE.Object3D) {
    frame.matrixAutoUpdate = false;
  }

  /** Paso 1: el visitante tocó con la retícula sobre el centro del tope. Normal forzada a (0,1,0). */
  setCenter(hit: THREE.Vector3, cameraPos: THREE.Vector3): void {
    this.pose.position.copy(hit);
    this.pose.yaw = yawFacing(hit, cameraPos);
    this.applyPose();
  }

  /** Desplazamiento en ejes del MUNDO (arrastre de un dedo sobre el plano). */
  moveWorld(dx: number, dz: number): void {
    this.pose.position.x += dx;
    this.pose.position.z += dz;
    this.applyPose();
  }

  /** Desplazamiento en ejes de la MESA (botones ±1 cm). */
  nudgeLocal(dx: number, dz: number, dyaw: number): void {
    const c = Math.cos(this.pose.yaw);
    const s = Math.sin(this.pose.yaw);
    // R_y(yaw)·(dx,0,dz) = (dx·c + dz·s, 0, −dx·s + dz·c)
    this.pose.position.x += dx * c + dz * s;
    this.pose.position.z += -dx * s + dz * c;
    this.pose.yaw += dyaw;
    this.applyPose();
  }

  rotate(dyaw: number): void {
    this.pose.yaw += dyaw;
    this.applyPose();
  }

  /** Paso 3: crea un XRAnchor; si no hay soporte, queda la pose fija en el espacio de referencia. */
  async confirm(frame: XRFrame | null, refSpace: XRReferenceSpace | null): Promise<void> {
    this.locked = true;
    this.hasLast = false;
    this.anchor?.delete();
    this.anchor = null;
    if (!frame || !refSpace || typeof frame.createAnchor !== 'function') return;
    const p = this.pose.position;
    _q.setFromAxisAngle(_up, this.pose.yaw);
    try {
      const rt = new XRRigidTransform({ x: p.x, y: p.y, z: p.z }, { x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      this.anchor = (await frame.createAnchor(rt, refSpace)) ?? null;
    } catch (err) {
      console.warn('[lock] no se pudo crear el ancla; se usa pose fija', err);
      this.anchor = null;
    }
  }

  unlock(): void {
    this.locked = false;
    this.anchor?.delete();
    this.anchor = null;
    this.hasLast = false;
  }

  /**
   * Cada frame tras el lock: lee la pose del ancla. Devuelve el salto (m) respecto al frame anterior,
   * o null si el ancla no está siguiéndose este frame (se conserva la última pose).
   */
  updateFromAnchor(frame: XRFrame, refSpace: XRReferenceSpace): number | null {
    if (!this.anchor) return 0;
    if (!frame.trackedAnchors?.has(this.anchor)) return null;
    const pose = frame.getPose(this.anchor.anchorSpace, refSpace);
    if (!pose) return null;
    _m.fromArray(pose.transform.matrix);
    _m.decompose(_p, _q, _s);
    const jump = this.hasLast ? _p.distanceTo(this.lastPos) : 0;
    this.lastPos.copy(_p);
    this.hasLast = true;
    // Normal forzada a +Y: solo se conserva el yaw del ancla.
    _e.setFromQuaternion(_q, 'YXZ');
    this.pose.position.copy(_p);
    this.pose.yaw = _e.y;
    this.applyPose();
    return jump;
  }

  applyPose(): void {
    _q.setFromAxisAngle(_up, this.pose.yaw);
    this.frame.matrix.compose(this.pose.position, _q, _s.set(1, 1, 1));
    this.frame.matrixWorldNeedsUpdate = true;
  }
}
