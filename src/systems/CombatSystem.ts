import * as THREE from 'three';
import { createEnemy, createProjectile, type Enemy, type Projectile } from '../entities/combat';
import { analyzeRouteSegment, boardToWorld, getCell } from '../game/pipes';
import { ARENA } from '../game/constants';
import type { Board, BoardPoint, RelicModifiers, RouteStats, WeaponProfile } from '../game/types';
import type { MaterialLibrary } from '../assets/MaterialLibrary';
import type { DebugTuning } from './DebugTools';
import { disposeObject3D } from '../utils/dispose';

export class CombatSystem {
  readonly group = new THREE.Group();
  health = 3;
  maxHealth = 3;
  combo = 0;
  bossSpawned = false;
  bossDefeated = false;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private spawnTimer = 1.2;
  private fireTimer = 0;
  private enemySequence = 0;
  private projectileSequence = 0;
  private slowTimer = 0;

  constructor(private readonly materials: MaterialLibrary) {
    this.group.name = 'combat';
  }

  start(initialHealth: number, route: ReadonlyArray<BoardPoint>, isBossSector = false): void {
    this.health = initialHealth;
    this.maxHealth = initialHealth;
    this.combo = 0;
    this.spawnTimer = 0;
    this.fireTimer = 0;
    this.bossSpawned = false;
    this.bossDefeated = !isBossSector;
    this.slowTimer = 0;
    this.clearAll();
    if (route.length > 1) {
      this.spawnEnemy(route, 0, 0, null);
    }
  }

  reset(): void {
    this.health = 3;
    this.maxHealth = 3;
    this.combo = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.clearAll();
  }

  update(
    delta: number,
    elapsed: number,
    tankPosition: THREE.Vector3,
    tankForward: THREE.Vector3,
    aimDirection: THREE.Vector3 | null,
    route: ReadonlyArray<BoardPoint>,
    routeProgress: number,
    board: Board,
    tuning: DebugTuning,
    routeStats: RouteStats,
    weapon: WeaponProfile,
    modifiers: RelicModifiers,
    isBossSector: boolean,
    onEnemyKilled: (score: number) => void,
    onPlayerHit: () => void,
    onShot: () => void,
    onBossDefeated: () => void,
  ): void {
    this.slowTimer = Math.max(0, this.slowTimer - delta);

    if (isBossSector && !this.bossSpawned && routeProgress > route.length * 0.55) {
      this.spawnBoss(route, tankPosition);
    }

    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0 && this.enemies.length < 8) {
      this.spawnEnemy(route, routeProgress, elapsed, board);
      this.spawnTimer = 2.4 - Math.min(1.2, elapsed * 0.04);
    }

    this.fireTimer -= delta;
    const fireTarget = this.resolveAimTarget(tankPosition, tankForward, aimDirection);
    if (fireTarget && this.fireTimer <= 0) {
      const damage = 1 + Math.floor(routeStats.levelSum * 0.15);
      const directions = modifiers.scatterFire
        ? [-0.22, 0, 0.22].map((angle) => this.rotateDirection(fireTarget, angle))
        : [fireTarget];
      for (const direction of directions) {
        const velocity = direction.multiplyScalar(14);
        this.spawnPlayerProjectile(tankPosition, velocity, damage, weapon);
      }
      this.fireTimer = 1 / (tuning.fireRate * routeStats.multiplier * (1 + modifiers.fireRateBonus));
      onShot();
    }

    const slowFactor = this.slowTimer > 0 ? 0.55 : 1;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.fireTimer -= delta;
      if (enemy.kind === 'turret' && enemy.fireTimer <= 0) {
        const velocity = tankPosition.clone().sub(enemy.position).normalize().multiplyScalar(7.5);
        this.spawnEnemyProjectile(enemy.position, velocity);
        enemy.fireTimer = 1.1;
      }
      if (enemy.kind === 'drone' || enemy.kind === 'boss') {
        enemy.position.addScaledVector(
          tankPosition.clone().sub(enemy.position).normalize(),
          delta * (enemy.kind === 'boss' ? 1.1 : 1.8) * slowFactor,
        );
        enemy.group.position.copy(enemy.position);
      }
    }

    for (const projectile of this.projectiles) {
      projectile.life -= delta;
      projectile.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.position.copy(projectile.position);
    }

    this.resolveCollisions(
      tankPosition,
      routeStats.multiplier,
      weapon,
      modifiers,
      onEnemyKilled,
      onPlayerHit,
      onBossDefeated,
    );

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

  private spawnEnemy(
    route: ReadonlyArray<BoardPoint>,
    routeProgress: number,
    elapsed: number,
    board: Board | null,
  ): void {
    const routeIndex = Math.min(
      route.length - 1,
      Math.max(1, Math.floor(routeProgress) + 2 + (this.enemySequence % 4)),
    );
    const anchor = route[routeIndex] ?? route[route.length - 1];
    const segment = analyzeRouteSegment(route, routeIndex);
    const cell = board ? getCell(board, anchor.x, anchor.y) : null;

    let kind: 'turret' | 'drone' | 'mine' = 'turret';
    if (cell?.kind === 'cross' || segment === 'corner') kind = 'mine';
    else if (segment === 'straight') kind = 'turret';
    else kind = 'drone';

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

  private spawnBoss(route: ReadonlyArray<BoardPoint>, tankPosition: THREE.Vector3): void {
    const anchor = route[Math.max(1, route.length - 3)] ?? route[route.length - 1];
    const world = boardToWorld(anchor, 0.35);
    world.x += 1.2;
    const enemy = createEnemy('sector-boss', 'boss', world, this.materials);
    enemy.hp = 18;
    this.bossSpawned = true;
    this.enemies.push(enemy);
    this.group.add(enemy.group);
    void tankPosition;
  }

  private spawnPlayerProjectile(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    damage: number,
    weapon: WeaponProfile,
  ): void {
    const projectile = createProjectile(
      `p-${this.projectileSequence}`,
      'player',
      position.clone().add(new THREE.Vector3(0, 0.2, 0)),
      velocity,
      this.materials,
      damage,
      weapon.element,
      weapon.pierce,
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

  private resolveAimTarget(
    tankPosition: THREE.Vector3,
    tankForward: THREE.Vector3,
    aimDirection: THREE.Vector3 | null,
  ): THREE.Vector3 | null {
    if (aimDirection && aimDirection.lengthSq() > 0.08) {
      return aimDirection.clone().normalize();
    }
    const nearest = this.findNearestEnemy(tankPosition);
    if (nearest) {
      return nearest.position.clone().sub(tankPosition).normalize();
    }
    return tankForward.lengthSq() > 0.01 ? tankForward.clone().normalize() : null;
  }

  private rotateDirection(direction: THREE.Vector3, angle: number): THREE.Vector3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new THREE.Vector3(
      direction.x * cos - direction.z * sin,
      0,
      direction.x * sin + direction.z * cos,
    ).normalize();
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
    weapon: WeaponProfile,
    modifiers: RelicModifiers,
    onEnemyKilled: (score: number) => void,
    onPlayerHit: () => void,
    onBossDefeated: () => void,
  ): void {
    for (const projectile of this.projectiles) {
      if (projectile.owner !== 'player') continue;

      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (projectile.position.distanceTo(enemy.position) > enemy.radius + projectile.radius) continue;

        const damage = projectile.damage * (enemy.kind === 'boss' ? 1 + modifiers.bossDamageBonus : 1);
        enemy.hp -= damage;
        if (!projectile.pierce) projectile.life = 0;

        if (weapon.splashRadius > 0) {
          for (const splashTarget of this.enemies) {
            if (!splashTarget.alive || splashTarget.id === enemy.id) continue;
            if (splashTarget.position.distanceTo(enemy.position) <= weapon.splashRadius) {
              splashTarget.hp -= Math.max(1, Math.floor(damage * 0.55));
            }
          }
        }

        if (weapon.slowDuration > 0) {
          this.slowTimer = Math.max(this.slowTimer, weapon.slowDuration);
        }

        if (enemy.hp <= 0) {
          enemy.alive = false;
          this.combo += 1;
          if (weapon.healOnKill > 0) {
            this.health = Math.min(this.maxHealth, this.health + weapon.healOnKill);
          }
          onEnemyKilled(Math.round(enemy.score * multiplier * (1 + this.combo * 0.08)));
          if (enemy.kind === 'boss') {
            this.bossDefeated = true;
            onBossDefeated();
          }
        }
        if (!projectile.pierce) break;
      }
    }

    for (const projectile of this.projectiles) {
      if (projectile.owner !== 'player' && tankPosition.distanceTo(projectile.position) <= 0.55 + projectile.radius) {
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
