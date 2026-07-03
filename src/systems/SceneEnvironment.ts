import * as THREE from 'three';
import { scatterBuildings } from '../assets/buildingFactory';
import { disposeObjectTree } from '../assets/disposeObjectTree';
import { createGrassTexture } from '../assets/proceduralTextures';
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

export class SceneEnvironment {
  readonly root = new THREE.Group();
  private readonly grassTexture = createGrassTexture();

  constructor(track: GeneratedTrack) {
    this.buildGround();
    this.buildBackdrop();
    this.buildGrandstands(track);
    scatterBuildings(track, this.root);
    this.scatterTrees(track);
    this.scatterTrackProps(track);
    this.scatterFlags(track);
  }

  dispose(): void {
    disposeObjectTree(this.root);
  }

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(320, 72),
      new THREE.MeshStandardMaterial({
        map: this.grassTexture,
        roughness: 0.94,
        metalness: 0.02,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  private buildBackdrop(): void {
    const hillMat = new THREE.MeshStandardMaterial({
      color: '#4f8f5a',
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    });
    const count = 18;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 120 + (i % 3) * 8;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(16 + (i % 4) * 4, 22 + (i % 5) * 3, 5), hillMat);
      hill.position.set(Math.cos(angle) * radius, 4, Math.sin(angle) * radius);
      hill.rotation.y = angle;
      this.root.add(hill);
    }
  }

  private scatterTrees(track: GeneratedTrack): void {
    const rng = mulberry32(track.seed ^ 0x51ed12f7);
    const trunk = new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.9, metalness: 0 });
    const leaves = new THREE.MeshStandardMaterial({ color: '#2f6e3a', roughness: 0.85, metalness: 0, flatShading: true });
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6);
    const leavesGeo = new THREE.ConeGeometry(1.4, 3.2, 7);

    for (let i = 0; i < track.samples.length; i += 12) {
      const sample = track.samples[i];
      for (const side of [-1, 1]) {
        if (rng() > 0.55) continue;
        const dist = 11 + rng() * 9;
        const tree = new THREE.Group();
        const t = new THREE.Mesh(trunkGeo, trunk);
        t.position.y = 0.8;
        t.castShadow = true;
        const l = new THREE.Mesh(leavesGeo, leaves);
        l.position.y = 2.8;
        l.castShadow = true;
        tree.add(t, l);
        tree.position.set(
          sample.position.x + sample.normal.x * side * dist,
          0,
          sample.position.z + sample.normal.z * side * dist,
        );
        tree.rotation.y = rng() * Math.PI * 2;
        tree.scale.setScalar(0.85 + rng() * 0.5);
        this.root.add(tree);
      }
    }
  }

  private buildGrandstands(track: GeneratedTrack): void {
    const rng = mulberry32(track.seed ^ 0x9e3779b9);
    const seatMat = new THREE.MeshStandardMaterial({ color: '#3a4550', roughness: 0.75, metalness: 0.15 });
    const accentMat = new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.5, metalness: 0.2 });
    const frameMat = new THREE.MeshStandardMaterial({ color: '#8a949e', roughness: 0.45, metalness: 0.55 });

    for (let i = 0; i < track.samples.length; i += 28) {
      if (rng() > 0.45) continue;
      const sample = track.samples[i];
      const side = rng() < 0.5 ? 1 : -1;
      const dist = 14 + rng() * 6;
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);

      const stand = new THREE.Group();
      const tiers = 4 + Math.floor(rng() * 3);
      for (let t = 0; t < tiers; t += 1) {
        const tier = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 2.2), t % 2 === 0 ? seatMat : accentMat);
        tier.position.set(0, 1.2 + t * 0.9, -t * 0.4);
        tier.castShadow = true;
        tier.receiveShadow = true;
        stand.add(tier);
      }
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.5, 0.2), frameMat);
      pillar.position.set(-5.8, 2.2, 0);
      const pillarR = pillar.clone();
      pillarR.position.x = 5.8;
      stand.add(pillar, pillarR);

      stand.position.set(
        sample.position.x + sample.normal.x * side * dist,
        0,
        sample.position.z + sample.normal.z * side * dist,
      );
      stand.rotation.y = yaw + (side === 1 ? 0 : Math.PI);
      this.root.add(stand);
    }
  }

  private scatterFlags(track: GeneratedTrack): void {
    const poleMat = new THREE.MeshStandardMaterial({ color: '#c8d0d8', roughness: 0.4, metalness: 0.6 });
    const colors = ['#c8102e', '#1a5cff', '#ffbd4a', '#2f6e3a'];
    for (let i = 12; i < track.samples.length; i += 35) {
      const sample = track.samples[i];
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), poleMat);
        const flagColor = colors[(i + side) % colors.length];
        const flag = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 0.55),
          new THREE.MeshStandardMaterial({ color: flagColor, side: THREE.DoubleSide, roughness: 0.6 }),
        );
        pole.position.set(
          sample.position.x + sample.normal.x * side * (track.width / 2 + 2.2),
          1.6,
          sample.position.z + sample.normal.z * side * (track.width / 2 + 2.2),
        );
        flag.position.set(0.5 * side, 1.2, 0);
        flag.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
        const group = new THREE.Group();
        group.add(pole, flag);
        this.root.add(group);
      }
    }
  }

  private scatterTrackProps(track: GeneratedTrack): void {
    const tireMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92, metalness: 0.05 });
    const tireGeo = new THREE.TorusGeometry(0.42, 0.16, 8, 16);
    const half = track.width / 2 + 1.8;

    for (let i = 8; i < track.samples.length; i += 22) {
      const sample = track.samples[i];
      for (const side of [-1, 1]) {
        const stack = new THREE.Group();
        for (let t = 0; t < 3; t += 1) {
          const tire = new THREE.Mesh(tireGeo, tireMat);
          tire.rotation.x = Math.PI / 2;
          tire.position.set(0, 0.35 + t * 0.28, 0);
          tire.castShadow = true;
          stack.add(tire);
        }
        stack.position.set(
          sample.position.x + sample.normal.x * side * half,
          0.05,
          sample.position.z + sample.normal.z * side * half,
        );
        const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
        stack.rotation.y = yaw + (side === 1 ? Math.PI / 2 : -Math.PI / 2);
        this.root.add(stack);
      }
    }
  }
}
