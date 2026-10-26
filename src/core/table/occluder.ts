// TableTwin (sección 5.3): mesa virtual invisible que ocluye, recibe sombras y dibuja el borde LED.
import * as THREE from 'three';
import type { FxKit, TableEdgeFx } from '../contracts';
import { TABLE, type TableSpec } from './spec';

export class TableTwin {
  readonly group = new THREE.Group();
  readonly edge: TableEdgeFx;
  private readonly occluder: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  /** Pedestal visible (solo simulador). */
  private visual: THREE.Group | null = null;

  constructor(fx: FxKit, spec: TableSpec = TABLE) {
    this.group.name = 'TableTwin';
    const box = new THREE.BoxGeometry(spec.length, spec.height, spec.width).translate(0, -spec.height / 2, 0);
    this.occluder = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
    this.occluder.renderOrder = -1;
    this.occluder.name = 'table-occluder';

    const plane = new THREE.PlaneGeometry(spec.length, spec.width).rotateX(-Math.PI / 2).translate(0, 0.0005, 0);
    this.shadow = new THREE.Mesh(plane, new THREE.ShadowMaterial({ opacity: 0.28, depthWrite: false }));
    this.shadow.receiveShadow = true;
    this.shadow.name = 'table-shadow';

    this.edge = fx.createTableEdge(spec);
    this.group.add(this.occluder, this.shadow, this.edge.object);
  }

  /** En el simulador la mesa se ve: pedestal blanco con tope translúcido. */
  setSimulatorVisual(on: boolean, spec: TableSpec = TABLE): void {
    if (on && !this.visual) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(spec.length - 0.02, spec.height - 0.02, spec.width - 0.02).translate(0, -spec.height / 2 - 0.01, 0),
        new THREE.MeshStandardMaterial({ color: '#ECEAE4', roughness: 0.85 }),
      );
      body.receiveShadow = true;
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(spec.length, 0.01, spec.width).translate(0, -0.005, 0),
        new THREE.MeshStandardMaterial({ color: '#DDE6E4', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.9 }),
      );
      top.receiveShadow = true;
      g.add(body, top);
      this.visual = g;
      this.group.add(g);
      this.occluder.visible = false;
    } else if (!on && this.visual) {
      this.group.remove(this.visual);
      disposeTree(this.visual);
      this.visual = null;
      this.occluder.visible = true;
    }
  }

  dispose(): void {
    this.setSimulatorVisual(false);
    this.edge.dispose();
    for (const m of [this.occluder, this.shadow]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
}
