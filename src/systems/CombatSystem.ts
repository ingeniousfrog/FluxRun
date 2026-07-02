import * as THREE from 'three';
import { createEnemy, createProjectile, type Enemy, type Projectile } from '../entities/combat';
import { boardToWorld } from '../game/pipes';
import { ARENA } from '../game/constants';
import type { BoardPoint, RouteStats } from '../game/types';
import type { MaterialLibrary } from '../assets/MaterialLibrary';
import type { DebugTuning } from './DebugTools';
import { disposeObject3D } from '../utils/dispose';

export class CombatSystem {
  readonly group = new THREE.Group();
  health = 3;
  combo = 0;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private spawnTimer = 1.2;
  private fireTimer = 0;
  private enemySequence = 0;
  private projectileSequence = 0;

  constructor(private readonly materials: MaterialLibrary) {
    this.group.name = 'combat';
  }

  start(initialHealth: number, route: ReadonlyArray<BoardPoint>): void {
    this.health = initialHealth;
    this.combo = 0;
    this.spawnTimer = 0;
    this.fireTimer = 0;
    this.clearAll();
    if (route.length > 1) {
      this.spawnEnemy(route, 0, 0);
    }
  }

  reset(): void {
    this.health = 3;
    this.combo = 0;
    this.clearAll();
  }

  update(
    delta: number,
    elapsed: number,
    tankPosition: THREE.Vector3,
    route: ReadonlyArray<BoardPoint>,
    routeProgress: number,
    tuning: DebugTuning,
    routeStats: RouteStats,
    onEnemyKilled: (score: number) => void,
    onPlayerHit: () => void,
  ): void {
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0 && this.enemies.length < 8) {
      this.spawnEnemy(route, routeProgress, elapsed);
      this.spawnTimer = 2.4 - Math.min(1.2, elapsed * 0.04);
    }

    this.fireTimer -= delta;
    const nearest = this.findNearestEnemy(tankPosition);
    if (nearest && this.fireTimer <= 0) {
      const damage = 1 + Math.floor(routeStats.levelSum * 0.15);
      const velocity = nearest.position.clone().sub(tankPosition).normalize().multiplyScalar(14);
      this.spawnPlayerProjectile(tankPosition, velocity, damage);
      this.fireTimer = 1 / (tuning.fireRate * routeStats.multiplier);
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.fireTimer -= delta;
      if (enemy.kind === 'turret' && enemy.fireTimer <= 0) {
        const velocity = tankPosition.clone().sub(enemy.position).normalize().multiplyScalar(7.5);
        this.spawnEnemyProjectile(enemy.position, velocity);
        enemy.fireTimer = enemy.kind === 'turret' ? 1.1 : 0.9;
      }
      if (enemy.kind === 'drone') {
        enemy.position.addScaledVector(
          tankPosition.clone().sub(enemy.position).normalize(),
          delta * 1.8,
        );
        enemy.group.position.copy(enemy.position);
      }
    }

    for (const projectile of this.projectiles) {
      projectile.life -= delta;
      projectile.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.position.copy(projectile.position);
    }

    this.resolveCollisions(tankPosition, routeStats.multiplier, onEnemyKilled, onPlayerHit);
    this.projectiles = this.projectiles.filter((projectile) => {
      if (projectile.life > 0 && this.isInsideArena(projectile.position)) return true;
      this.group.remove(projectile.mesh);
      disposeObject3D(projectile.mesh);
      return false;
    });
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.alive) return true;
      this.group.remove(enemy.group);
      disposeObject3D(enemy.group);
      return false;
    });
  }

  get enemyCount(): number {
    return this.enemies.filter((enemy) => enemy.alive).length;
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }

  dispose(): void {
    this.clearAll();
  }

  private spawnEnemy(route: ReadonlyArray<BoardPoint>, routeProgress: number, elapsed: number): void {
    const kinds = ['turret', 'drone', 'mine'] as const;
    const kind = kinds[this.enemySequence % kinds.length];
    const routeIndex = Math.min(
      route.length - 1,
      Math.max(1, Math.floor(routeProgress) + 2 + (this.enemySequence % 4)),
    );
    const anchor = route[routeIndex] ?? route[route.length - 1];
    const side = this.enemySequence % 2 === 0 ? 1 : -1;
    const world = boardToWorld(anchor, 0.2);
    world.x += side * (1.4 + (this.enemySequence % 3) * 0.35);
    world.z += ((this.enemySequence % 5) - 2) * 0.5;

    const enemy = createEnemy(`enemy-${this.enemySequence}`, kind, world, this.materials);
    enemy.fireTimer += (elapsed % 1) * 0.2;
    this.enemySequence += 1;
    this.enemies.push(enemy);
    this.group.add(enemy.group);
  }

  private spawnPlayerProjectile(position: THREE.Vector3, velocity: THREE.Vector3, damage: number): void {
    const projectile = createProjectile(
      `p-${this.projectileSequence}`,
      'player',
      position.clone().add(new THREE.Vector3(0, 0.2, 0)),
      velocity,
      this.materials,
      damage,
    );
    this.projectileSequence += 1;
    this.projectiles.push(projectile);
    this.group.add(projectile.mesh);
  }

  private spawnEnemyProjectile(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const projectile = createProjectile(
      `e-${this.projectileSequence}`,
      'enemy',
      position.clone().add(new THREE.Vector3(0, 0.25, 0)),
      velocity,
      this.materials,
    );
    this.projectileSequence += 1;
    this.projectiles.push(projectile);
    this.group.add(projectile.mesh);
  }

  private findNearestEnemy(position: THREE.Vector3): Enemy | null {
    let best: Enemy | null = null;
    let bestDistance = Infinity;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const distance = position.distanceToSquared(enemy.position);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }
    return best;
  }

  private resolveCollisions(
    tankPosition: THREE.Vector3,
    multiplier: number,
    onEnemyKilled: (score: number) => void,
    onPlayerHit: () => void,
  ): void {
    for (const projectile of this.projectiles) {
      if (projectile.owner === 'player') {
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          if (projectile.position.distanceTo(enemy.position) <= enemy.radius + projectile.radius) {
            enemy.hp -= projectile.damage;
            projectile.life = 0;
            if (enemy.hp <= 0) {
              enemy.alive = false;
              this.combo += 1;
              onEnemyKilled(Math.round(enemy.score * multiplier * (1 + this.combo * 0.08)));
            }
            break;
          }
        }
        continue;
      }

      if (tankPosition.distanceTo(projectile.position) <= 0.55 + projectile.radius) {
        projectile.life = 0;
        this.health -= projectile.damage;
        this.combo = 0;
        onPlayerHit();
      }
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind !== 'mine') continue;
      if (tankPosition.distanceTo(enemy.position) <= enemy.radius + 0.45) {
        enemy.alive = false;
        this.health -= 1;
        this.combo = 0;
        onPlayerHit();
      }
    }
  }

  private isInsideArena(position: THREE.Vector3): boolean {
    return Math.abs(position.x) <= ARENA.halfWidth && Math.abs(position.z) <= ARENA.halfDepth;
  }

  private clearAll(): void {
    for (const enemy of this.enemies) {
      this.group.remove(enemy.group);
      disposeObject3D(enemy.group);
    }
    for (const projectile of this.projectiles) {
      this.group.remove(projectile.mesh);
      disposeObject3D(projectile.mesh);
    }
    this.enemies = [];
    this.projectiles = [];
  }
}
