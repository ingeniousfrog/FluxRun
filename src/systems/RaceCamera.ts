import * as THREE from 'three';

export type CameraMode = 'chase' | 'cockpit';

const _desired = new THREE.Vector3();
const _lookPoint = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();
const _localEye = new THREE.Vector3();
const _localLook = new THREE.Vector3();

export class RaceCamera {
  private readonly smoothedTarget = new THREE.Vector3();
  private readonly smoothedLook = new THREE.Vector3();
  private mode: CameraMode = 'chase';

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = 58;
    this.camera.near = 0.15;
    this.camera.far = 420;
    this.camera.updateProjectionMatrix();
  }

  getMode(): CameraMode {
    return this.mode;
  }

  toggleMode(): CameraMode {
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  snapTo(target: THREE.Vector3, heading: number, carQuat?: THREE.Quaternion): void {
    this.smoothedTarget.copy(target);
    if (this.mode === 'cockpit' && carQuat) {
      this.applyCockpitSnap(target, carQuat);
      return;
    }
    _forward.set(Math.sin(heading), 0, Math.cos(heading));
    _lookPoint.copy(target).addScaledVector(_forward, 4).setY(target.y + 0.85);
    this.smoothedLook.copy(_lookPoint);
    this.camera.position.copy(this.computeChasePosition(target, heading, 0));
    this.camera.lookAt(_lookPoint);
  }

  update(
    delta: number,
    target: THREE.Vector3,
    heading: number,
    _velocity: THREE.Vector3,
    speed: number,
    carQuat: THREE.Quaternion,
  ): void {
    if (this.mode === 'cockpit') {
      this.updateCockpit(delta, target, carQuat, speed);
      return;
    }
    this.updateChase(delta, target, heading, speed);
  }

  private updateChase(delta: number, target: THREE.Vector3, heading: number, speed: number): void {
    _forward.set(Math.sin(heading), 0, Math.cos(heading));

    const lead = Math.min(6, speed * 0.16);
    _desired.copy(target).addScaledVector(_forward, lead);
    const alpha = 1 - Math.exp(-delta * 5.5);
    this.smoothedTarget.lerp(_desired, alpha);

    _lookPoint.copy(this.smoothedTarget).addScaledVector(_forward, 4.2 + speed * 0.035);
    _lookPoint.y = this.smoothedTarget.y + 0.55 + speed * 0.004;
    this.smoothedLook.lerp(_lookPoint, alpha);

    _cameraPos.copy(this.computeChasePosition(this.smoothedTarget, heading, speed));
    this.camera.position.lerp(_cameraPos, alpha);

    const targetFov = THREE.MathUtils.clamp(56 + speed * 0.09, 56, 70);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, alpha);
    this.camera.near = 0.15;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.smoothedLook);
  }

  private updateCockpit(
    delta: number,
    target: THREE.Vector3,
    carQuat: THREE.Quaternion,
    speed: number,
  ): void {
    _localEye.set(0, 0.72, -0.2);
    _localLook.set(0, 0.54, 3.4);
    _cameraPos.copy(_localEye).applyQuaternion(carQuat).add(target);
    _lookPoint.copy(_localLook).applyQuaternion(carQuat).add(target);

    const alpha = 1 - Math.exp(-delta * 12);
    this.camera.position.lerp(_cameraPos, alpha);
    this.smoothedLook.lerp(_lookPoint, alpha);
    this.camera.lookAt(this.smoothedLook);

    const targetFov = THREE.MathUtils.clamp(70 + speed * 0.028, 70, 78);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, alpha);
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
  }

  private applyCockpitSnap(target: THREE.Vector3, carQuat: THREE.Quaternion): void {
    _localEye.set(0, 0.72, -0.2);
    _localLook.set(0, 0.54, 3.4);
    this.camera.position.copy(_localEye).applyQuaternion(carQuat).add(target);
    _lookPoint.copy(_localLook).applyQuaternion(carQuat).add(target);
    this.smoothedLook.copy(_lookPoint);
    this.camera.lookAt(_lookPoint);
    this.camera.fov = 72;
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
  }

  private computeChasePosition(target: THREE.Vector3, heading: number, speed: number): THREE.Vector3 {
    _forward.set(Math.sin(heading), 0, Math.cos(heading));
    const back = THREE.MathUtils.clamp(7.2 + speed * 0.018, 7.2, 10.8);
    const height = THREE.MathUtils.clamp(3.1 + speed * 0.01, 3.1, 4.9);
    _cameraPos.set(
      target.x - _forward.x * back,
      target.y + height,
      target.z - _forward.z * back,
    );
    return _cameraPos;
  }
}
