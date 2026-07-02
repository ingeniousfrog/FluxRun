import * as THREE from 'three';
import { createEnemyModel, createProjectileMesh, type EnemyKind } from '../assets/modelFactories';
import type { MaterialLibrary } from '../assets/MaterialLibrary';

export type Enemy = {
  readonly id: string;
  readonly kind: EnemyKind;
  readonly group: THREE.Group;
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly score: number;
  hp: number;
  fireTimer: number;
  alive: boolean;
};

export type Projectile = {
  readonly id: string;
  readonly owner: 'player' | 'enemy';
  readonly mesh: THREE.Mesh;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly radius: number;
  readonly damage: number;
  life: number;
};

export function createEnemy(
  id: string,
  kind: EnemyKind,
  position: THREE.Vector3,
  materials: MaterialLibrary,
): Enemy {
  const hpByKind: Record<EnemyKind, number> = {
    turret: 3,
    drone: 2,
    mine: 1,
  };
  const scoreByKind: Record<EnemyKind, number> = {
    turret: 260,
    drone: 180,
    mine: 120,
  };
  const group = createEnemyModel(kind, materials);
  group.position.copy(position);
  return {
    id,
    kind,
    group,
    position: position.clone(),
    radius: kind === 'turret' ? 0.62 : 0.48,
    score: scoreByKind[kind],
    hp: hpByKind[kind],
    fireTimer: kind === 'turret' ? 0.6 : 0.9,
    alive: true,
  };
}

export function createProjectile(
  id: string,
  owner: 'player' | 'enemy',
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  materials: MaterialLibrary,
  damage = 1,
): Projectile {
  const mesh = createProjectileMesh(owner, materials);
  mesh.position.copy(position);
  return {
    id,
    owner,
    mesh,
    position: position.clone(),
    velocity: velocity.clone(),
    radius: owner === 'player' ? 0.12 : 0.16,
    damage,
    life: owner === 'player' ? 1.25 : 4.2,
  };
}
