import * as THREE from 'three';
import { CELL_SIZE } from '../game/constants';
import type { MaterialLibrary } from './MaterialLibrary';

export type EnemyKind = 'turret' | 'drone' | 'mine';

export function createHoverTankModel(materials: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = 'hoverTank';

  const hull = new THREE.Mesh(createWedgeGeometry(0.82, 1.28, 0.34), materials.tankHull);
  hull.name = 'taperedHull';
  hull.position.y = 0.34;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), materials.glass);
  cockpit.name = 'cockpitGlass';
  cockpit.scale.set(1.12, 0.58, 1.28);
  cockpit.position.set(0, 0.55, -0.1);
  cockpit.castShadow = true;
  group.add(cockpit);

  const engineGeometry = new THREE.CylinderGeometry(0.13, 0.18, 0.54, 12);
  const enginePositions = [
    [-0.44, 0.25, 0.38],
    [0.44, 0.25, 0.38],
  ];
  for (const [x, y, z] of enginePositions) {
    const engine = new THREE.Mesh(engineGeometry, materials.tankDark);
    engine.name = 'enginePod';
    engine.rotation.x = Math.PI / 2;
    engine.position.set(x, y, z);
    engine.castShadow = true;
    group.add(engine);

    const flare = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 14), materials.pipe('cyan'));
    flare.name = 'engineFlare';
    flare.rotation.x = -Math.PI / 2;
    flare.position.set(x, y, z + 0.34);
    group.add(flare);
  }

  const finGeometry = new THREE.BoxGeometry(0.1, 0.08, 0.58);
  for (const x of [-0.55, 0.55]) {
    const fin = new THREE.Mesh(finGeometry, materials.pipeTrim);
    fin.name = 'stabilizerFin';
    fin.position.set(x, 0.34, -0.05);
    fin.rotation.z = x > 0 ? -0.2 : 0.2;
    fin.castShadow = true;
    group.add(fin);
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 4), materials.pipe('amber'));
  nose.name = 'frontEmitter';
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.36, -0.78);
  nose.castShadow = true;
  group.add(nose);

  return group;
}

export function createEnemyModel(kind: EnemyKind, materials: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = `enemy-${kind}`;

  if (kind === 'turret') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.22, 8), materials.enemyArmor);
    base.castShadow = true;
    base.position.y = 0.25;
    group.add(base);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), materials.enemyCore);
    core.name = 'chargedCore';
    core.position.y = 0.55;
    core.castShadow = true;
    group.add(core);

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.72), materials.hazard);
    barrel.name = 'aimBarrel';
    barrel.position.set(0, 0.56, -0.48);
    barrel.castShadow = true;
    group.add(barrel);
  } else if (kind === 'drone') {
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), materials.enemyCore);
    body.name = 'facetedDroneCore';
    body.position.y = 0.62;
    body.castShadow = true;
    group.add(body);

    const wingGeometry = new THREE.BoxGeometry(0.74, 0.08, 0.18);
    for (const z of [-0.28, 0.28]) {
      const wing = new THREE.Mesh(wingGeometry, materials.enemyArmor);
      wing.position.set(0, 0.52, z);
      wing.castShadow = true;
      group.add(wing);
    }
  } else {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 22), materials.enemyArmor);
    ring.name = 'mineRing';
    ring.position.y = 0.48;
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    group.add(ring);

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), materials.enemyCore);
    core.name = 'mineCore';
    core.position.y = 0.48;
    core.castShadow = true;
    group.add(core);

    const spikeGeometry = new THREE.ConeGeometry(0.06, 0.28, 8);
    for (let i = 0; i < 6; i += 1) {
      const spike = new THREE.Mesh(spikeGeometry, materials.hazard);
      const angle = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 0.38, 0.48, Math.sin(angle) * 0.38);
      spike.rotation.z = Math.PI / 2;
      spike.rotation.y = -angle;
      spike.castShadow = true;
      group.add(spike);
    }
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 24),
    new THREE.MeshBasicMaterial({ color: '#05070a', transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.name = 'contactShadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);

  return group;
}

export function createProjectileMesh(owner: 'player' | 'enemy', materials: MaterialLibrary): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(owner === 'player' ? 0.08 : 0.1, 10, 6),
    owner === 'player' ? materials.projectilePlayer : materials.projectileEnemy,
  );
  mesh.name = `${owner}-projectile`;
  return mesh;
}

export function createWorldKit(materials: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = 'neonIndustrialWorldKit';

  const railGeometry = new THREE.BoxGeometry(CELL_SIZE * 12.8, 0.16, 0.18);
  const sideGeometry = new THREE.BoxGeometry(0.18, 0.16, CELL_SIZE * 9.8);
  const z = (CELL_SIZE * 9) / 2 + 0.58;
  const x = (CELL_SIZE * 12) / 2 + 0.58;
  const rails = [
    meshAt(railGeometry, materials.worldMetal, 0, 0.11, -z),
    meshAt(railGeometry, materials.worldMetal, 0, 0.11, z),
    meshAt(sideGeometry, materials.worldMetal, -x, 0.11, 0),
    meshAt(sideGeometry, materials.worldMetal, x, 0.11, 0),
  ];
  rails.forEach((rail) => {
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  });

  const towerGeometry = new THREE.BoxGeometry(0.42, 1.8, 0.42);
  const lightGeometry = new THREE.BoxGeometry(0.14, 0.08, 0.62);
  const towerPoints = [
    [-7.9, -5.8],
    [7.9, -5.8],
    [-7.9, 5.8],
    [7.9, 5.8],
    [-6.2, 0],
    [6.2, 0],
  ];

  for (const [towerX, towerZ] of towerPoints) {
    const tower = meshAt(towerGeometry, materials.worldMetal, towerX, 0.9, towerZ);
    tower.name = 'capacitorTower';
    tower.castShadow = true;
    group.add(tower);

    const light = meshAt(lightGeometry, materials.pipe('cyan'), towerX, 1.72, towerZ);
    light.name = 'towerSignal';
    light.rotation.y = Math.PI / 4;
    group.add(light);
  }

  const conduitGeometry = new THREE.TorusGeometry(0.48, 0.035, 6, 20);
  for (const [conduitX, conduitZ] of [
    [-5.6, -4.6],
    [-2.8, 4.8],
    [2.8, -4.7],
    [5.4, 4.2],
  ]) {
    const conduit = meshAt(conduitGeometry, materials.pipeTrim, conduitX, 0.16, conduitZ);
    conduit.name = 'floorConduitLoop';
    conduit.rotation.x = Math.PI / 2;
    group.add(conduit);
  }

  return group;
}

function createWedgeGeometry(width: number, length: number, height: number): THREE.BufferGeometry {
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const points = [
    [-halfWidth, 0, halfLength],
    [halfWidth, 0, halfLength],
    [halfWidth * 0.72, 0, -halfLength * 0.42],
    [0, 0, -halfLength],
    [-halfWidth * 0.72, 0, -halfLength * 0.42],
    [-halfWidth * 0.72, height, halfLength * 0.78],
    [halfWidth * 0.72, height, halfLength * 0.78],
    [halfWidth * 0.48, height, -halfLength * 0.35],
    [0, height * 0.86, -halfLength * 0.86],
    [-halfWidth * 0.48, height, -halfLength * 0.35],
  ];
  const vertices = new Float32Array(points.flat());
  const indices = [
    0, 1, 2, 0, 2, 4, 4, 2, 3,
    5, 7, 6, 5, 9, 7, 9, 8, 7,
    0, 5, 6, 0, 6, 1,
    1, 6, 7, 1, 7, 2,
    2, 7, 8, 2, 8, 3,
    3, 8, 9, 3, 9, 4,
    4, 9, 5, 4, 5, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function meshAt(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}
