import * as THREE from 'three';
import { HoverTank } from '../entities/HoverTank';
import { boardToWorld, getCell } from '../game/pipes';
import { CELL_SIZE } from '../game/constants';
import type { Board, BoardPoint } from '../game/types';
import type { DebugTuning } from './DebugTools';

const MAX_LATERAL = CELL_SIZE * 0.38;

export class RushSystem {
  readonly tank: HoverTank;
  route: BoardPoint[] = [];
  routeProgress = 0;
  lateralOffset = 0;
  boostTimer = 0;
  reachedDrain = false;

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
    this.tank.group.visible = true;
  }

  reset(): void {
    this.route = [];
    this.routeProgress = 0;
    this.lateralOffset = 0;
    this.boostTimer = 0;
    this.reachedDrain = false;
    this.tank.group.visible = false;
  }

  update(
    delta: number,
    board: Board,
    strafeInput: THREE.Vector2,
    boostHeld: boolean,
    tuning: DebugTuning,
    energyMultiplier: number,
  ): void {
    if (this.route.length < 2) return;

    const sample = this.sampleRoute(this.routeProgress);
    const cell = getCell(board, sample.cell.x, sample.cell.y);
    let speed = tuning.rushSpeed * energyMultiplier;

    if (cell?.kind === 'reservoir') {
      speed *= 1.35;
      this.boostTimer = Math.max(this.boostTimer, 0.4);
    }
    if (cell?.kind === 'cross') {
      this.lateralOffset += (Math.random() > 0.5 ? 1 : -1) * CELL_SIZE * 0.12;
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

    this.tank.sync(worldPos, nextSample.forward, boostHeld || this.boostTimer > 0, 0);

    if (this.routeProgress >= this.route.length - 1.02) {
      this.reachedDrain = true;
    }
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
