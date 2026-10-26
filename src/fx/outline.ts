// Contorno de selección por "casco invertido": cada malla del objetivo recibe un hijo que comparte su
// geometría (no se duplica memoria) con un material de caras traseras desplazadas por la normal.
// El grosor escala con la distancia para verse parecido en pantalla. Un solo material compartido.
import * as THREE from 'three';
import { damp, LED } from './quality';

const vert = /* glsl */ `
uniform float uThickness;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * uThickness * max(0.25, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
}`;

const THICKNESS = 0.006; // m por metro de distancia (≈ 3–4 mm a 60 cm)

export function createOutline() {
  const uniforms = {
    uColor: { value: new THREE.Color(LED).multiplyScalar(1.15) },
    uOpacity: { value: 0 },
    uThickness: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  mat.name = 'fx:outline';
  let hulls: THREE.Mesh[] = [];
  let t = 0;
  let on = 0;

  const clear = () => {
    for (const h of hulls) h.removeFromParent();
    hulls = [];
  };

  return {
    set(target: THREE.Object3D | null) {
      clear();
      on = 0;
      uniforms.uThickness.value = 0;
      if (!target) return;
      target.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || o.userData.cxFx) return;
        if ((o as THREE.SkinnedMesh).isSkinnedMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
        if (!m.geometry?.getAttribute('normal')) return;
        const hull = new THREE.Mesh(m.geometry, mat);
        hull.name = 'fx:outline-hull';
        hull.userData.cxFx = true;
        hull.raycast = () => {};
        hull.renderOrder = m.renderOrder;
        hull.castShadow = false;
        hull.receiveShadow = false;
        hulls.push(hull);
      });
      // Se agregan después de recorrer para no visitar los propios cascos.
      let i = 0;
      target.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || o.userData.cxFx) return;
        if ((o as THREE.SkinnedMesh).isSkinnedMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
        if (!m.geometry?.getAttribute('normal')) return;
        const hull = hulls[i++];
        if (hull) o.add(hull);
      });
      on = 1;
    },
    update(dt: number) {
      if (!hulls.length) return;
      t += dt;
      uniforms.uThickness.value = damp(uniforms.uThickness.value, THICKNESS * on, 14, dt);
      uniforms.uOpacity.value = on * (0.8 + 0.2 * Math.sin(t * 4));
    },
    dispose() {
      clear();
      mat.dispose();
    },
  };
}
