import * as THREE from 'three';
import type { MaterialLibrary } from './MaterialLibrary';

function addPart(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createBodyShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.44, 0.7);
  s.bezierCurveTo(-0.66, 0.7, -0.76, 0.5, -0.76, 0.3);
  s.bezierCurveTo(-0.78, 0.05, -0.72, -0.2, -0.6, -0.42);
  s.bezierCurveTo(-0.48, -0.62, -0.28, -0.72, -0.08, -0.74);
  s.lineTo(0.08, -0.74);
  s.bezierCurveTo(0.28, -0.72, 0.48, -0.62, 0.6, -0.42);
  s.bezierCurveTo(0.72, -0.2, 0.78, 0.05, 0.76, 0.3);
  s.bezierCurveTo(0.76, 0.5, 0.66, 0.7, 0.44, 0.7);
  s.lineTo(-0.44, 0.7);
  return s;
}

function createCabinShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0.22);
  s.lineTo(-0.3, -0.28);
  s.quadraticCurveTo(-0.3, -0.38, -0.18, -0.4);
  s.lineTo(0.18, -0.4);
  s.quadraticCurveTo(0.3, -0.38, 0.3, -0.28);
  s.lineTo(0.3, 0.22);
  s.quadraticCurveTo(0.3, 0.38, 0.16, 0.4);
  s.lineTo(-0.16, 0.4);
  s.quadraticCurveTo(-0.3, 0.38, -0.3, 0.22);
  return s;
}

function createWheelMesh(materials: MaterialLibrary): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.1, 16, 28), materials.tire);
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  wheel.add(tire);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 20), materials.rim);
  rim.rotation.z = Math.PI / 2;
  rim.castShadow = true;
  wheel.add(rim);

  for (let i = 0; i < 6; i += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.05), materials.rim);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.y = (i / 6) * Math.PI * 2;
    wheel.add(spoke);
  }

  return wheel;
}

export function createRaceCarModel(materials: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = 'raceCar';

  const body = new THREE.Group();
  body.name = 'carBody';
  group.add(body);

  const shell = new THREE.ExtrudeGeometry(createBodyShape(), {
    depth: 0.3,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 4,
    curveSegments: 20,
  });
  shell.rotateX(-Math.PI / 2);
  shell.translate(0, 0.3, 0);
  addPart(body, shell, materials.carBody, 0, 0, 0);

  const cabin = new THREE.ExtrudeGeometry(createCabinShape(), {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 14,
  });
  cabin.rotateX(-Math.PI / 2);
  cabin.translate(0, 0.52, 0);
  addPart(body, cabin, materials.carBody, 0, 0, 0);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.24, 0.5),
    materials.glass,
  );
  glass.position.set(0, 0.58, 0.2);
  glass.rotation.x = -0.48;
  glass.castShadow = true;
  body.add(glass);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.05, 0.48), materials.carBody);
  hood.position.set(0, 0.4, 0.5);
  hood.rotation.x = -0.12;
  hood.castShadow = true;
  body.add(hood);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.035, 0.16), materials.carDark);
  splitter.position.set(0, 0.24, 0.82);
  body.add(splitter);

  for (const side of [-1, 1]) {
    addPart(body, new THREE.BoxGeometry(0.12, 0.06, 0.7), materials.carDark, side * 0.78, 0.28, 0.02);
    addPart(body, new THREE.BoxGeometry(0.16, 0.08, 0.12), materials.accent('amber'), side * 0.7, 0.32, 0.8);
    addPart(body, new THREE.BoxGeometry(0.2, 0.05, 0.08), materials.accent('magenta'), side * 0.74, 0.36, -0.78);

    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.09), materials.trim);
    mirror.position.set(side * 0.54, 0.58, 0.16);
    body.add(mirror);

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.12, 10), materials.trim);
    exhaust.position.set(side * 0.26, 0.27, -0.78);
    exhaust.rotation.x = Math.PI / 2;
    body.add(exhaust);
  }

  addPart(body, new THREE.BoxGeometry(0.05, 0.3, 0.05), materials.trim, -0.44, 0.64, -0.6);
  addPart(body, new THREE.BoxGeometry(0.05, 0.3, 0.05), materials.trim, 0.44, 0.64, -0.6);
  addPart(body, new THREE.BoxGeometry(1.28, 0.035, 0.22), materials.trim, 0, 0.8, -0.62);
  addPart(body, new THREE.BoxGeometry(0.1, 0.015, 0.88), materials.accent('cyan'), 0, 0.51, 0);

  const wheelLayout = [
    ['wheelFL', 0.62, 0.72],
    ['wheelFR', -0.62, 0.72],
    ['wheelBL', 0.62, -0.72],
    ['wheelBR', -0.62, -0.72],
  ] as const;

  for (const [name, x, z] of wheelLayout) {
    const wheel = createWheelMesh(materials);
    wheel.name = name;
    wheel.position.set(x, 0.34, z);
    group.add(wheel);
  }

  return group;
}
