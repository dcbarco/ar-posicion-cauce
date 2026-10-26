// Simulador de escritorio (?sim=1): cámara orbitable alrededor de una mesa virtual.
// Ratón izquierdo = dedo; rueda = pellizco; Shift+arrastre = girar con dos dedos;
// botón derecho = orbitar; botón central = zoom. Tecla L = simular pérdida de tracking.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class DesktopSim {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly floor: THREE.Mesh;
  trackingLost = false;
  private readonly abort = new AbortController();

  constructor(dom: HTMLElement, scene: THREE.Scene, tableHeight: number) {
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.02, 50);
    // Visitante de pie, tablet a ~1,3 m del piso → 0,37 m sobre el tope, a 0,75 m del borde.
    this.camera.position.set(0, 0.45, 0.95);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.target.set(0, 0, 0);
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.enableZoom = false; // la rueda es el pellizco
    this.controls.enablePan = false;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 3;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enableDamping = true;
    this.controls.update();

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#8C5A44', roughness: 0.95 }),
    );
    this.floor.position.y = -tableHeight;
    this.floor.receiveShadow = true;
    scene.add(this.floor);
    scene.background = new THREE.Color('#3A2E2A');

    addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'l' || e.key === 'L') this.trackingLost = !this.trackingLost;
      },
      { signal: this.abort.signal },
    );
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(): void {
    this.controls.update();
  }

  dispose(): void {
    this.abort.abort();
    this.controls.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.floor.removeFromParent();
  }
}
