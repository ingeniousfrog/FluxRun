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

function createMonsterWheelMesh(materials: MaterialLibrary): THREE.Group {
  const wheel = new THREE.Group();
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.2, 18, 28),
    materials.tire,
  );
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  wheel.add(tire);

  const tread = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.34, 20), materials.tire);
  tread.rotation.z = Math.PI / 2;
  tread.castShadow = true;
  wheel.add(tread);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.32, 16), materials.rim);
  rim.rotation.z = Math.PI / 2;
  rim.castShadow = true;
  wheel.add(rim);

  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const treadBlock = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.18), materials.carDark);
    treadBlock.position.set(0, Math.sin(angle) * 0.56, Math.cos(angle) * 0.56);
    treadBlock.rotation.x = angle;
    treadBlock.castShadow = true;
    wheel.add(treadBlock);
  }

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const lug = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8), materials.carDark);
    lug.rotation.z = Math.PI / 2;
    lug.position.set(0.18, Math.sin(angle) * 0.16, Math.cos(angle) * 0.16);
    wheel.add(lug);
  }

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), materials.trim);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  return wheel;
}

export function createRaceCarModel(materials: MaterialLibrary, bodyMaterial?: THREE.Material): THREE.Group {
  const paint = bodyMaterial ?? materials.carBody;
  const group = new THREE.Group();
  group.name = 'raceCar';

  const body = new THREE.Group();
  body.name = 'carBody';
  group.add(body);

  const frame = new THREE.Group();
  frame.position.y = 0.52;
  body.add(frame);

  addPart(frame, new THREE.BoxGeometry(1.72, 0.28, 1.05), paint, 0, 0.08, 0.02);
  addPart(frame, new THREE.BoxGeometry(1.58, 0.22, 0.72), paint, 0, 0.28, -0.08);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.42, 0.62), paint);
  cabin.position.set(0, 0.52, -0.06);
  cabin.castShadow = true;
  frame.add(cabin);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.34, 0.08), materials.glass);
  windshield.position.set(0, 0.58, 0.24);
  windshield.rotation.x = -0.42;
  windshield.castShadow = true;
  frame.add(windshield);

  const rearWindow = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.28, 0.08), materials.glass);
  rearWindow.position.set(0, 0.56, -0.34);
  rearWindow.rotation.x = 0.32;
  frame.add(rearWindow);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.38, 0.14), materials.carDark);
  grille.position.set(0, 0.06, 0.58);
  grille.castShadow = true;
  frame.add(grille);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.18, 0.22), materials.carDark);
  bumper.position.set(0, -0.02, 0.72);
  bumper.castShadow = true;
  frame.add(bumper);

  const bullBar = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.12, 0.08), materials.trim);
  bullBar.position.set(0, 0.02, 0.84);
  frame.add(bullBar);

  for (const side of [-1, 1]) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.72), paint);
    fender.position.set(side * 0.92, 0.02, 0.18);
    fender.castShadow = true;
    frame.add(fender);

    const rearFender = fender.clone();
    rearFender.position.set(side * 0.92, 0.02, -0.42);
    frame.add(rearFender);

    const step = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.48), materials.trim);
    step.position.set(side * 0.78, -0.04, -0.02);
    frame.add(step);

    const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.08), materials.accent('amber'));
    headlight.position.set(side * 0.52, 0.12, 0.66);
    frame.add(headlight);

    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.06), materials.accent('magenta'));
    taillight.position.set(side * 0.58, 0.18, -0.52);
    frame.add(taillight);

    const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8), materials.trim);
    shock.position.set(side * 0.72, -0.08, 0.38);
    frame.add(shock);
    const shockRear = shock.clone();
    shockRear.position.set(side * 0.72, -0.08, -0.48);
    frame.add(shockRear);
  }

  const rollCageMat = materials.trim;
  const cagePosts = [
    [-0.42, 0.72, 0.18], [0.42, 0.72, 0.18],
    [-0.42, 0.72, -0.28], [0.42, 0.72, -0.28],
  ] as const;
  for (const [x, y, z] of cagePosts) {
    addPart(frame, new THREE.CylinderGeometry(0.035, 0.035, 0.52, 8), rollCageMat, x, y, z);
  }
  addPart(frame, new THREE.BoxGeometry(0.92, 0.035, 0.035), rollCageMat, 0, 0.96, 0.18);
  addPart(frame, new THREE.BoxGeometry(0.92, 0.035, 0.035), rollCageMat, 0, 0.96, -0.28);
  addPart(frame, new THREE.BoxGeometry(0.035, 0.035, 0.52), rollCageMat, -0.42, 0.96, -0.05);
  addPart(frame, new THREE.BoxGeometry(0.035, 0.035, 0.52), rollCageMat, 0.42, 0.96, -0.05);

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.28, 10), materials.carDark);
  exhaust.position.set(0.38, 0.42, -0.58);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.rotation.z = 0.18;
  frame.add(exhaust);
  const exhaustL = exhaust.clone();
  exhaustL.position.x = -0.38;
  exhaustL.rotation.z = -0.18;
  frame.add(exhaustL);

  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.12), materials.accent('lime'));
  flag.position.set(0, 1.08, -0.42);
  frame.add(flag);

  const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.28), materials.carDark);
  roofScoop.position.set(0, 0.78, 0.08);
  frame.add(roofScoop);

  const numberPlate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.02), materials.accent('amber'));
  numberPlate.position.set(0, 0.34, 0.78);
  frame.add(numberPlate);

  const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.46, 12), materials.carDark);
  winch.position.set(0, 0.08, 0.94);
  winch.rotation.z = Math.PI / 2;
  frame.add(winch);

  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 1.42), materials.accent('lime'));
    stripe.position.set(side * 0.48, 0.38, 0.02);
    frame.add(stripe);

    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.04), materials.carDark);
    mirror.position.set(side * 0.62, 0.58, 0.24);
    mirror.rotation.y = side * 0.34;
    frame.add(mirror);

    const mudFlapF = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.04), materials.carDark);
    mudFlapF.position.set(side * 0.72, -0.18, 0.52);
    mudFlapF.rotation.x = -0.12;
    frame.add(mudFlapF);

    const mudFlapR = mudFlapF.clone();
    mudFlapR.position.z = -0.72;
    mudFlapR.rotation.x = 0.12;
    frame.add(mudFlapR);
  }

  for (const z of [0.92, -0.92]) {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.82, 10), materials.trim);
    axle.position.set(0, 0.52, z);
    axle.rotation.z = Math.PI / 2;
    axle.castShadow = true;
    group.add(axle);

    for (const side of [-1, 1]) {
      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.045, 0.055), materials.trim);
      upperArm.position.set(side * 0.42, 0.42, z + (z > 0 ? -0.18 : 0.18));
      upperArm.rotation.z = side * 0.18;
      upperArm.rotation.y = z > 0 ? 0.22 : -0.22;
      group.add(upperArm);

      const lowerArm = upperArm.clone();
      lowerArm.position.y = 0.26;
      lowerArm.rotation.z = -side * 0.12;
      group.add(lowerArm);
    }
  }

  const wheelLayout = [
    ['wheelFL', 0.85, 0.92],
    ['wheelFR', -0.85, 0.92],
    ['wheelBL', 0.85, -0.92],
    ['wheelBR', -0.85, -0.92],
  ] as const;

  for (const [name, x, z] of wheelLayout) {
    const wheel = createMonsterWheelMesh(materials);
    wheel.name = name;
    wheel.position.set(x, 0.52, z);
    group.add(wheel);
  }

  return group;
}
