import * as THREE from 'three';
import { BOARD_COLS, BOARD_ROWS, CELL_SIZE } from '../game/constants';
import type { ViewMode } from '../game/types';

export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private mode: ViewMode = '2.5d';

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private offset = new THREE.Vector3(0, 9.5, 9.5),
  ) {}

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.camera.fov = mode === '2d' ? 42 : 48;
    this.offset = this.createOffset();
    this.camera.up.copy(mode === '2d' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0));
    this.camera.updateProjectionMatrix();
  }

  snapTo(target: THREE.Vector3): void {
    this.offset = this.createOffset();
    this.desiredPosition.copy(target).add(this.offset);
    this.camera.position.copy(this.desiredPosition);
    this.lookTarget.copy(target).add(this.createLookOffset());
    this.camera.lookAt(this.lookTarget);
  }

  update(delta: number, target: THREE.Vector3, lag: number): void {
    this.offset = this.createOffset();
    this.desiredPosition.copy(target).add(this.offset);
    const factor = 1 - Math.exp(-delta / Math.max(0.001, lag));
    this.camera.position.lerp(this.desiredPosition, factor);
    this.lookTarget.copy(target).add(this.createLookOffset());
    this.camera.lookAt(this.lookTarget);
  }

  private createOffset(): THREE.Vector3 {
    if (this.mode !== '2d') return new THREE.Vector3(0, 10.6, 11.1);

    const aspect = Math.max(0.1, this.camera.aspect || 1);
    const halfBoardWidth = (BOARD_COLS * CELL_SIZE) / 2 + 1.6;
    const halfBoardHeight = (BOARD_ROWS * CELL_SIZE) / 2 + 1.2;
    const neededHalfHeight = Math.max(halfBoardHeight, halfBoardWidth / aspect);
    const fovRadians = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = neededHalfHeight / Math.tan(fovRadians / 2);
    return new THREE.Vector3(0, distance, 0.08);
  }

  private createLookOffset(): THREE.Vector3 {
    return this.mode === '2d' ? new THREE.Vector3(1.1, 0, 0) : new THREE.Vector3(0, 0.35, -1.2);
  }
}
