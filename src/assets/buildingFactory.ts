import * as THREE from 'three';
import type { GeneratedTrack } from '../track/types';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function createWindowTexture(base: string, lit: string): THREE.CanvasTexture | THREE.DataTexture {
  if (typeof document === 'undefined') {
    const tex = new THREE.DataTexture(new Uint8Array([90, 100, 110, 255]), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 64);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      ctx.fillStyle = Math.random() > 0.35 ? lit : '#1a2530';
      ctx.fillRect(4 + col * 15, 4 + row * 7, 10, 5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildOffice(rng: () => number, w: number, d: number, h: number): THREE.Group {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#8a96a4',
    roughness: 0.55,
    metalness: 0.35,
    map: createWindowTexture('#7a8694', '#d8e8ff'),
  });
  wallMat.map!.repeat.set(w * 0.35, h * 0.22);

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.02, 0.25, d * 1.02),
    new THREE.MeshStandardMaterial({ color: '#5a6470', roughness: 0.7, metalness: 0.4 }),
  );
  roof.position.y = h + 0.12;
  roof.castShadow = true;
  group.add(roof);

  if (rng() > 0.5) {
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6),
      new THREE.MeshStandardMaterial({ color: '#b0b8c0', metalness: 0.8, roughness: 0.3 }),
    );
    antenna.position.set(0, h + 1.4, 0);
    group.add(antenna);
  }
  return group;
}

function buildWarehouse(w: number, d: number, h: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#b8c0c8', roughness: 0.75, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.62, 1.8, 4),
    new THREE.MeshStandardMaterial({ color: '#6a7480', roughness: 0.65, metalness: 0.25, flatShading: true }),
  );
  roof.position.y = h + 0.6;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.35, h * 0.65, 0.08),
    new THREE.MeshStandardMaterial({ color: '#4a5560', roughness: 0.5, metalness: 0.45 }),
  );
  door.position.set(0, h * 0.33, d / 2 + 0.04);
  group.add(door);
  return group;
}

function buildApartment(rng: () => number, w: number, d: number, h: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: '#c8b8a8',
    roughness: 0.68,
    metalness: 0.15,
    map: createWindowTexture('#b0a090', '#fff0c8'),
  });
  mat.map!.repeat.set(w * 0.4, h * 0.18);

  const floors = 3 + Math.floor(rng() * 4);
  const floorH = h / floors;
  for (let f = 0; f < floors; f += 1) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, floorH * 0.88, d), mat);
    floor.position.y = f * floorH + floorH / 2;
    floor.castShadow = true;
    floor.receiveShadow = true;
    group.add(floor);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.04, 0.12, d * 1.06),
      new THREE.MeshStandardMaterial({ color: '#9098a0', roughness: 0.8, metalness: 0.1 }),
    );
    slab.position.y = (f + 1) * floorH;
    group.add(slab);
  }
  return group;
}

function buildGarage(w: number, d: number, h: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#d0d8e0', roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2;
  body.castShadow = true;
  group.add(body);

  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, h * 0.9, d * 0.9),
      new THREE.MeshStandardMaterial({ color: '#e03030', roughness: 0.5, metalness: 0.2 }),
    );
    stripe.position.set(side * (w / 2 - 0.06), h / 2, 0);
    group.add(stripe);
  }
  return group;
}

export function scatterBuildings(track: GeneratedTrack, parent: THREE.Group): void {
  const rng = mulberry32(track.seed ^ 0xbd4a1f3c);
  const half = track.width / 2;

  for (let i = 0; i < track.samples.length; i += 14) {
    const sample = track.samples[i];
    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);

    for (const side of [-1, 1]) {
      if (rng() < 0.18) continue;

      const dist = range(rng, 16, 30);
      const px = sample.position.x + sample.normal.x * side * dist;
      const pz = sample.position.z + sample.normal.z * side * dist;

      const roll = rng();
      let building: THREE.Group;
      const scale = range(rng, 0.85, 1.25);
      if (roll < 0.3) {
        building = buildOffice(rng, range(rng, 5, 9), range(rng, 5, 8), range(rng, 12, 26));
      } else if (roll < 0.55) {
        building = buildWarehouse(range(rng, 8, 14), range(rng, 6, 10), range(rng, 4, 6));
      } else if (roll < 0.8) {
        building = buildApartment(rng, range(rng, 5, 8), range(rng, 5, 7), range(rng, 10, 18));
      } else {
        building = buildGarage(range(rng, 6, 10), range(rng, 4, 6), range(rng, 3.5, 5));
      }

      building.position.set(px, 0, pz);
      building.rotation.y = yaw + (side === 1 ? -Math.PI / 2 : Math.PI / 2) + range(rng, -0.3, 0.3);
      building.scale.setScalar(scale);
      parent.add(building);
    }
  }

  for (let i = 5; i < track.samples.length; i += 38) {
    const sample = track.samples[i];
    const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    const dist = half + range(rng, 14, 20);
    const grandstand = new THREE.Group();
    const seats = new THREE.Mesh(
      new THREE.BoxGeometry(10, 3.5, 4),
      new THREE.MeshStandardMaterial({ color: '#506070', roughness: 0.8, metalness: 0.1 }),
    );
    seats.position.y = 1.75;
    seats.castShadow = true;
    grandstand.add(seats);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 0.2, 4.5),
      new THREE.MeshStandardMaterial({ color: '#e8ecf0', roughness: 0.4, metalness: 0.35 }),
    );
    roof.position.y = 3.6;
    grandstand.add(roof);
    grandstand.position.set(
      sample.position.x + sample.normal.x * dist,
      0,
      sample.position.z + sample.normal.z * dist,
    );
    grandstand.rotation.y = yaw;
    parent.add(grandstand);
  }
}
