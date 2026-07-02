import * as THREE from 'three';

type PointerState = {
  active: boolean;
  id: number | null;
  centerX: number;
  centerY: number;
  radius: number;
};

type QueuedActions = {
  moveX: number;
  moveY: number;
  rotateClockwise: number;
  rotateCounterClockwise: number;
  place: number;
  nextPiece: number;
  rush: number;
  restart: number;
  pause: number;
  mute: number;
  view: number;
  relicPickSlot: number;
};

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = new THREE.Vector2();
  private readonly keyVector = new THREE.Vector2();
  private readonly aimVector = new THREE.Vector2();
  private readonly pointerState: PointerState = {
    active: false,
    id: null,
    centerX: 0,
    centerY: 0,
    radius: 1,
  };

  private dashDown = false;
  private manualAimDown = false;
  private readonly queued: QueuedActions = {
    moveX: 0,
    moveY: 0,
    rotateClockwise: 0,
    rotateCounterClockwise: 0,
    place: 0,
    nextPiece: 0,
    rush: 0,
    restart: 0,
    pause: 0,
    mute: 0,
    view: 0,
    relicPickSlot: -1,
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.shouldPreventDefault(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) {
      this.queueKeyAction(event.code);
    }
    this.keys.add(event.code);
    if (event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.dashDown = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.dashDown = false;
    }
    if (event.code === 'Space') {
      this.queued.place += 1;
    }
  };

  private readonly onStickDown = (event: PointerEvent) => {
    event.preventDefault();
    const rect = this.stick.getBoundingClientRect();
    this.pointerState.active = true;
    this.pointerState.id = event.pointerId;
    this.pointerState.centerX = rect.left + rect.width / 2;
    this.pointerState.centerY = rect.top + rect.height / 2;
    this.pointerState.radius = rect.width * 0.42;
    try {
      this.stick.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic test events do not always have a capturable pointer id.
    }
    this.updatePointer(event.clientX, event.clientY);
  };

  private readonly onStickMove = (event: PointerEvent) => {
    if (!this.pointerState.active || event.pointerId !== this.pointerState.id) return;
    event.preventDefault();
    this.updatePointer(event.clientX, event.clientY);
  };

  private readonly onStickUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerState.id) return;
    event.preventDefault();
    this.pointerState.active = false;
    this.pointerState.id = null;
    this.pointer.set(0, 0);
    this.updateKnob();
  };

  private readonly onDashDown = (event: PointerEvent) => {
    event.preventDefault();
    this.dashDown = true;
  };

  private readonly onDashUp = (event: PointerEvent) => {
    event.preventDefault();
    this.dashDown = false;
  };

  private readonly onWindowBlur = () => {
    this.keys.clear();
    this.dashDown = false;
    this.manualAimDown = false;
    this.pointer.set(0, 0);
    this.aimVector.set(0, 0);
    this.pointerState.active = false;
    this.updateKnob();
  };

  constructor(
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly dashButton: HTMLElement,
    private readonly buttons: ReadonlyArray<HTMLElement> = [],
    private readonly canvas: HTMLCanvasElement | null = null,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('pointerup', this.onStickUp);
    this.stick.addEventListener('pointercancel', this.onStickUp);
    this.dashButton.addEventListener('pointerdown', this.onDashDown);
    this.dashButton.addEventListener('pointerup', this.onDashUp);
    this.dashButton.addEventListener('pointercancel', this.onDashUp);
    this.dashButton.addEventListener('pointerleave', this.onDashUp);
    for (const button of this.buttons) {
      button.addEventListener('pointerdown', this.onActionButton);
    }

    if (this.canvas) {
      this.canvas.addEventListener('pointermove', this.onCanvasMove);
      this.canvas.addEventListener('pointerdown', this.onCanvasDown);
      this.canvas.addEventListener('pointerup', this.onCanvasUp);
    }
  }

  readMovement(target: THREE.Vector2): THREE.Vector2 {
    this.keyVector.set(0, 0);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.keyVector.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.keyVector.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.keyVector.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.keyVector.y += 1;

    target.copy(this.keyVector).add(this.pointer);
    if (target.lengthSq() > 1) target.normalize();
    return target;
  }

  readAimDirection(tankPosition: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 | null {
    if (!this.canvas) return null;
    const useManual = this.manualAimDown || this.aimVector.lengthSq() > 0.04;
    if (!useManual) return null;

    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((rect.left + rect.width / 2 + this.aimVector.x * rect.width * 0.35) / rect.width) * 2 - 1;
    const ndcY = -(((rect.top + rect.height / 2 + this.aimVector.y * rect.height * 0.35) / rect.height) * 2 - 1);
    const ndc = new THREE.Vector3(ndcX, ndcY, 0.5);
    ndc.unproject(camera);
    const dir = ndc.sub(tankPosition);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) return null;
    return dir.normalize();
  }

  isDashHeld(): boolean {
    return this.dashDown;
  }

  consumeBuildMove(): THREE.Vector2 {
    const move = new THREE.Vector2(this.queued.moveX, this.queued.moveY);
    this.queued.moveX = 0;
    this.queued.moveY = 0;
    return move;
  }

  consumeRotateClockwise(): boolean {
    return this.consume('rotateClockwise');
  }

  consumeRotateCounterClockwise(): boolean {
    return this.consume('rotateCounterClockwise');
  }

  consumePlace(): boolean {
    return this.consume('place');
  }

  consumeNextPiece(): boolean {
    return this.consume('nextPiece');
  }

  consumeRush(): boolean {
    return this.consume('rush');
  }

  consumeRestart(): boolean {
    return this.consume('restart');
  }

  consumePause(): boolean {
    return this.consume('pause');
  }

  consumeMute(): boolean {
    return this.consume('mute');
  }

  consumeViewToggle(): boolean {
    return this.consume('view');
  }

  consumeRelicPickSlot(): number | null {
    if (this.queued.relicPickSlot < 0) return null;
    const slot = this.queued.relicPickSlot;
    this.queued.relicPickSlot = -1;
    return slot;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.stick.removeEventListener('pointerdown', this.onStickDown);
    this.stick.removeEventListener('pointermove', this.onStickMove);
    this.stick.removeEventListener('pointerup', this.onStickUp);
    this.stick.removeEventListener('pointercancel', this.onStickUp);
    this.dashButton.removeEventListener('pointerdown', this.onDashDown);
    this.dashButton.removeEventListener('pointerup', this.onDashUp);
    this.dashButton.removeEventListener('pointercancel', this.onDashUp);
    this.dashButton.removeEventListener('pointerleave', this.onDashUp);
    for (const button of this.buttons) {
      button.removeEventListener('pointerdown', this.onActionButton);
    }
    if (this.canvas) {
      this.canvas.removeEventListener('pointermove', this.onCanvasMove);
      this.canvas.removeEventListener('pointerdown', this.onCanvasDown);
      this.canvas.removeEventListener('pointerup', this.onCanvasUp);
    }
  }

  private readonly onActionButton = (event: PointerEvent) => {
    event.preventDefault();
    const action = (event.currentTarget as HTMLElement).dataset.action;
    if (action === 'rotate') this.queued.rotateClockwise += 1;
    if (action === 'place') this.queued.place += 1;
    if (action === 'next') this.queued.nextPiece += 1;
    if (action === 'rush') this.queued.rush += 1;
    if (action === 'restart') this.queued.restart += 1;
    if (action === 'pause') this.queued.pause += 1;
    if (action === 'mute') this.queued.mute += 1;
    if (action === 'view') this.queued.view += 1;
    if (action === 'relic') {
      const index = Number((event.currentTarget as HTMLElement).dataset.relicIndex ?? 0);
      this.queued.relicPickSlot = index;
    }
  };

  private readonly onCanvasMove = (event: PointerEvent) => {
    if (!this.manualAimDown || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.aimVector.set(
      (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.35),
      (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.35),
    );
    if (this.aimVector.lengthSq() > 1) this.aimVector.normalize();
  };

  private readonly onCanvasDown = (event: PointerEvent) => {
    if (event.button === 2) {
      event.preventDefault();
      this.manualAimDown = true;
      this.onCanvasMove(event);
    }
  };

  private readonly onCanvasUp = (event: PointerEvent) => {
    if (event.button === 2) {
      this.manualAimDown = false;
      this.aimVector.set(0, 0);
    }
  };

  private queueKeyAction(code: string): void {
    if (code === 'ArrowLeft' || code === 'KeyA') this.queued.moveX -= 1;
    if (code === 'ArrowRight' || code === 'KeyD') this.queued.moveX += 1;
    if (code === 'ArrowUp' || code === 'KeyW') this.queued.moveY -= 1;
    if (code === 'ArrowDown' || code === 'KeyS') this.queued.moveY += 1;
    if (code === 'KeyE') this.queued.rotateClockwise += 1;
    if (code === 'KeyQ') this.queued.rotateCounterClockwise += 1;
    if (code === 'Tab') this.queued.nextPiece += 1;
    if (code === 'Enter') this.queued.rush += 1;
    if (code === 'KeyR') this.queued.restart += 1;
    if (code === 'KeyP' || code === 'Escape') this.queued.pause += 1;
    if (code === 'KeyM') this.queued.mute += 1;
    if (code === 'KeyV') this.queued.view += 1;
    if (code === 'Digit1') this.queued.relicPickSlot = 0;
    if (code === 'Digit2') this.queued.relicPickSlot = 1;
    if (code === 'Digit3') this.queued.relicPickSlot = 2;
  }

  private consume(key: keyof Omit<QueuedActions, 'moveX' | 'moveY'>): boolean {
    if (this.queued[key] <= 0) return false;
    this.queued[key] -= 1;
    return true;
  }

  private shouldPreventDefault(code: string): boolean {
    return [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Space',
      'Enter',
      'Tab',
      'KeyQ',
      'KeyE',
      'KeyR',
      'KeyP',
      'KeyM',
      'KeyV',
      'Escape',
      'Digit1',
      'Digit2',
      'Digit3',
    ].includes(code);
  }

  private updatePointer(clientX: number, clientY: number): void {
    const dx = clientX - this.pointerState.centerX;
    const dy = clientY - this.pointerState.centerY;
    this.pointer.set(dx / this.pointerState.radius, dy / this.pointerState.radius);
    if (this.pointer.lengthSq() > 1) this.pointer.normalize();
    this.updateKnob();
  }

  private updateKnob(): void {
    const distance = 38;
    this.knob.style.transform = `translate(calc(-50% + ${this.pointer.x * distance}px), calc(-50% + ${this.pointer.y * distance}px))`;
  }
}
