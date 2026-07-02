import * as THREE from 'three';
import { HoverTank } from '../entities/HoverTank';
import { boardToWorld, getCell } from '../game/pipes';
import { CELL_SIZE } from '../game/constants';
import type { Board, BoardPoint } from '../game/types';
import type { RelicModifiers } from '../game/types';
import type { DebugTuning } from './DebugTools';

const MAX_LATERAL = CELL_SIZE * 0.38;

export type RushCellEvent = {
  readonly kind: 'reservoir' | 'cross' | 'oneWay';
  readonly world: THREE.Vector3;
  readonly crossKick: number;
};

export class RushSystem {
  readonly tank: HoverTank;
  route: BoardPoint[] = [];
  routeProgress = 0;
  lateralOffset = 0;
  boostTimer = 0;
  reachedDrain = false;
  damagePulse = 0;
  lastCellKey = '';

  private readonly scratchPosition = new THREE.Vector3();
  private readonly scratchForward = new THREE.Vector3();

  constructor(materials: ConstructorParameters<typeof HoverTank>[0]) {
    this.tank = new HoverTank(materials);
    this.tank.group.visible = false;
  }

  start(route: ReadonlyArray<BoardPoint>): void {
    this.route = [...route];
    this.routeProgress = 0;
    this.lateralOffset = 0;
    this.boostTimer = 0;
    this.reachedDrain = false;
    this.damagePulse = 0;
    this.lastCellKey = '';
    this.tank.group.visible = true;
  }

  reset(): void {
    this.route = [];
    this.routeProgress = 0;
    this.lateralOffset = 0;
    this.boostTimer = 0;
    this.reachedDrain = false;
    this.damagePulse = 0;
    this.lastCellKey = '';
    this.tank.group.visible = false;
  }

  pulseDamage(): void {
    this.damagePulse = 1;
  }

  update(
    delta: number,
    board: Board,
    strafeInput: THREE.Vector2,
    boostHeld: boolean,
    tuning: DebugTuning,
    energyMultiplier: number,
    modifiers: RelicModifiers,
  ): RushCellEvent[] {
    const events: RushCellEvent[] = [];
    if (this.route.length < 2) return events;

    this.damagePulse = Math.max(0, this.damagePulse - delta * 3.5);

    const sample = this.sampleRoute(this.routeProgress);
    const cell = getCell(board, sample.cell.x, sample.cell.y);
    const cellKey = `${sample.cell.x},${sample.cell.y}`;
    let speed = tuning.rushSpeed * energyMultiplier * (1 + modifiers.rushSpeedBonus);

    if (cell?.kind === 'reservoir') {
      speed *= 1.45;
      this.boostTimer = Math.max(this.boostTimer, 0.55);
      if (this.lastCellKey !== cellKey) {
        events.push({ kind: 'reservoir', world: sample.position.clone(), crossKick: 0 });
      }
    }

    if (cell?.kind === 'cross') {
      const kick = modifiers.crossPlayerChoice
        ? Math.sign(strafeInput.x || 1) * CELL_SIZE * 0.22
        : (this.routeProgress % 2 < 1 ? 1 : -1) * CELL_SIZE * 0.18;
      this.lateralOffset += kick;
      if (this.lastCellKey !== cellKey) {
        events.push({ kind: 'cross', world: sample.position.clone(), crossKick: kick });
      }
    }

    if (cell?.kind === 'oneWay' && this.lastCellKey !== cellKey) {
      events.push({ kind: 'oneWay', world: sample.position.clone(), crossKick: 0 });
      this.boostTimer = Math.max(this.boostTimer, 0.25);
    }

    if (boostHeld || this.boostTimer > 0) {
      speed *= tuning.boostMultiplier;
      this.boostTimer = Math.max(0, this.boostTimer - delta);
    }

    this.routeProgress += delta * speed * 0.22;
    this.lateralOffset = THREE.MathUtils.clamp(
      this.lateralOffset + strafeInput.x * tuning.strafeSpeed * delta,
      -MAX_LATERAL,
      MAX_LATERAL,
    );

    const nextSample = this.sampleRoute(this.routeProgress);
    const right = new THREE.Vector3(nextSample.forward.z, 0, -nextSample.forward.x).normalize();
    const worldPos = nextSample.position.clone().addScaledVector(right, this.lateralOffset);

    this.tank.sync(worldPos, nextSample.forward, boostHeld || this.boostTimer > 0, this.damagePulse);
    this.lastCellKey = cellKey;

    if (this.routeProgress >= this.route.length - 1.02) {
      this.reachedDrain = true;
    }

    return events;
  }

  getCameraTarget(): THREE.Vector3 {
    return this.tank.position.clone();
  }

  getTankPosition(): THREE.Vector3 {
    return this.tank.position.clone();
  }

  getTankForward(): THREE.Vector3 {
    return this.tank.forward.clone();
  }

  private sampleRoute(progress: number): {
    position: THREE.Vector3;
    forward: THREE.Vector3;
    cell: BoardPoint;
  } {
    const clamped = THREE.MathUtils.clamp(progress, 0, Math.max(0, this.route.length - 1));
    const index = Math.floor(clamped);
    const t = clamped - index;
    const a = this.route[index] ?? this.route[0];
    const b = this.route[Math.min(index + 1, this.route.length - 1)];

    const posA = boardToWorld(a, 0.16);
    const posB = boardToWorld(b, 0.16);
    this.scratchPosition.copy(posA).lerp(posB, t);
    this.scratchForward.subVectors(posB, posA);
    if (this.scratchForward.lengthSq() < 0.0001) {
      this.scratchForward.set(1, 0, 0);
    } else {
      this.scratchForward.normalize();
    }

    return {
      position: this.scratchPosition.clone(),
      forward: this.scratchForward.clone(),
      cell: t < 0.5 ? a : b,
    };
  }
}
