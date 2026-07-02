import * as THREE from 'three';

const _desired = new THREE.Vector3();
const _lookPoint = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _cameraPos = new THREE.Vector3();

export class RaceCamera {
  private readonly smoothedTarget = new THREE.Vector3();
  private readonly smoothedLook = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.camera.fov = 58;
    this.camera.near = 0.15;
    this.camera.far = 420;
    this.camera.updateProjectionMatrix();
  }

  snapTo(target: THREE.Vector3, heading: number): void {
    this.smoothedTarget.copy(target);
    _forward.set(Math.sin(heading), 0, Math.cos(heading));
    _lookPoint.copy(target).addScaledVector(_forward, 4).setY(target.y + 0.85);
    this.smoothedLook.copy(_lookPoint);
    this.camera.position.copy(this.computeCameraPosition(target, heading, 0));
    this.camera.lookAt(_lookPoint);
  }

  update(delta: number, target: THREE.Vector3, heading: number, _velocity: THREE.Vector3, speed: number): void {
    _forward.set(Math.sin(heading), 0, Math.cos(heading));

    const lead = Math.min(5.5, speed * 0.14);
    _desired.copy(target).addScaledVector(_forward, lead);
    const alpha = 1 - Math.exp(-delta * 5.5);
    this.smoothedTarget.lerp(_desired, alpha);

    _lookPoint.copy(this.smoothedTarget).addScaledVector(_forward, 3.8 + speed * 0.04);
    _lookPoint.y = this.smoothedTarget.y + 0.75 + speed * 0.006;
    this.smoothedLook.lerp(_lookPoint, alpha);

    _cameraPos.copy(this.computeCameraPosition(this.smoothedTarget, heading, speed));
    this.camera.position.lerp(_cameraPos, alpha);

    const targetFov = THREE.MathUtils.clamp(58 + speed * 0.1, 58, 72);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, alpha);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.smoothedLook);
  }

  private computeCameraPosition(target: THREE.Vector3, heading: number, speed: number): THREE.Vector3 {
    _forward.set(Math.sin(heading), 0, Math.cos(heading));
    const back = THREE.MathUtils.clamp(5.8 + speed * 0.018, 5.8, 9.5);
    const height = THREE.MathUtils.clamp(2.15 + speed * 0.01, 2.15, 3.4);
    _cameraPos.set(
      target.x - _forward.x * back,
      target.y + height,
      target.z - _forward.z * back,
    );
    return _cameraPos;
  }
}
