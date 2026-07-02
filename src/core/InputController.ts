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
  rush: number;
  restart: number;
  pause: number;
  mute: number;
};

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = new THREE.Vector2();
  private readonly keyVector = new THREE.Vector2();
  private readonly pointerState: PointerState = {
    active: false,
    id: null,
    centerX: 0,
    centerY: 0,
    radius: 1,
  };

  private dashDown = false;
  private readonly queued: QueuedActions = {
    moveX: 0,
    moveY: 0,
    rotateClockwise: 0,
    rotateCounterClockwise: 0,
    place: 0,
    rush: 0,
    restart: 0,
    pause: 0,
    mute: 0,
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
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
    this.pointer.set(0, 0);
    this.pointerState.active = false;
    this.updateKnob();
  };

  constructor(
    private readonly stick: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly dashButton: HTMLElement,
    private readonly buttons: ReadonlyArray<HTMLElement> = [],
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
  }

  private readonly onActionButton = (event: PointerEvent) => {
    event.preventDefault();
    const action = (event.currentTarget as HTMLElement).dataset.action;
    if (action === 'rotate') this.queued.rotateClockwise += 1;
    if (action === 'place') this.queued.place += 1;
    if (action === 'rush') this.queued.rush += 1;
    if (action === 'restart') this.queued.restart += 1;
    if (action === 'pause') this.queued.pause += 1;
    if (action === 'mute') this.queued.mute += 1;
  };

  private queueKeyAction(code: string): void {
    if (code === 'ArrowLeft' || code === 'KeyA') this.queued.moveX -= 1;
    if (code === 'ArrowRight' || code === 'KeyD') this.queued.moveX += 1;
    if (code === 'ArrowUp' || code === 'KeyW') this.queued.moveY -= 1;
    if (code === 'ArrowDown' || code === 'KeyS') this.queued.moveY += 1;
    if (code === 'KeyE') this.queued.rotateClockwise += 1;
    if (code === 'KeyQ') this.queued.rotateCounterClockwise += 1;
    if (code === 'Space') this.queued.place += 1;
    if (code === 'Enter') this.queued.rush += 1;
    if (code === 'KeyR') this.queued.restart += 1;
    if (code === 'KeyP' || code === 'Escape') this.queued.pause += 1;
    if (code === 'KeyM') this.queued.mute += 1;
  }

  private consume(key: keyof Omit<QueuedActions, 'moveX' | 'moveY'>): boolean {
    if (this.queued[key] <= 0) return false;
    this.queued[key] -= 1;
    return true;
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
