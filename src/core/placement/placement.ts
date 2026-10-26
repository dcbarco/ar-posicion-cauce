// Retícula de colocación (sección 5.4): tras el lock NO usa hit-test; usa rayo–plano con el tope
// bloqueado (Y = 0 en mesa local), recortado al área útil y suavizado.
import * as THREE from 'three';
import type { ReticleState, TableBounds } from '../contracts';

const TOP = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const SMOOTH_PER_60FPS = 0.25;
/** Distancia al borde (m) bajo la cual la retícula pasa a ámbar. */
export const EDGE_WARN_M = 0.05;

/** Intersección de un rayo (mesa local) con el tope. Escribe en `out`; null si no corta. */
export function rayToTop(ray: THREE.Ray, out: THREE.Vector3): THREE.Vector3 | null {
  return ray.intersectPlane(TOP, out);
}

export class PlacementCursor {
  readonly target = new THREE.Vector3();
  readonly smoothed = new THREE.Vector3();
  state: ReticleState = 'hidden';
  private has = false;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly bounds: TableBounds) {}

  /** `ray` en mesa local. `radius` = huella del objeto a colocar. */
  update(ray: THREE.Ray | null, radius: number, dt: number): ReticleState {
    const hit = ray ? rayToTop(ray, this.tmp) : null;
    if (!hit) {
      this.state = 'hidden';
      return this.state;
    }
    this.target.copy(hit);
    const inside = this.bounds.contains(this.target, radius);
    this.bounds.clamp(this.target, radius);
    this.target.y = 0;
    if (!this.has) {
      this.smoothed.copy(this.target);
      this.has = true;
    } else {
      // Interpolación ~0,25 por frame a 60 fps, independiente del framerate.
      const k = 1 - Math.pow(1 - SMOOTH_PER_60FPS, dt * 60);
      this.smoothed.lerp(this.target, k);
    }
    const nearEdge = this.bounds.edgeDistance(this.smoothed) - radius < EDGE_WARN_M;
    this.state = !inside || nearEdge ? 'warn' : 'ok';
    return this.state;
  }

  reset(): void {
    this.has = false;
    this.state = 'hidden';
  }
}
