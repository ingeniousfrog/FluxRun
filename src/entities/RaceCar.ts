import * as THREE from 'three';
import { createRaceCarModel } from '../assets/modelFactories';
import type { MaterialLibrary } from '../assets/MaterialLibrary';
import type { WheelInfo } from 'cannon-es';

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class RaceCar {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly body: THREE.Object3D;
  private readonly wheels: THREE.Object3D[] = [];
  private wheelFL: THREE.Object3D | null = null;
  private wheelFR: THREE.Object3D | null = null;
  private spin = 0;
  private accelPitch = 0;
  private wallFlash = 0;

  constructor(materials: MaterialLibrary) {
    const model = createRaceCarModel(materials);
    model.scale.setScalar(1.08);
    this.root.add(model);
    const body = model.getObjectByName('carBody');
    if (!body) throw new Error('Race car model missing carBody');
    this.body = body;
    model.traverse((child) => {
      if (child.name.startsWith('wheel')) {
        this.wheels.push(child);
        if (child.name === 'wheelFL') this.wheelFL = child;
        if (child.name === 'wheelFR') this.wheelFR = child;
      }
    });
  }

  flashWallHit(): void {
    this.wallFlash = 1;
  }

  syncFromPhysics(
    chassisPos: THREE.Vector3,
    chassisQuat: THREE.Quaternion,
    _wheelInfos: WheelInfo[],
    steer: number,
    speed: number,
    drift: number,
    delta: number,
  ): void {
    this.root.position.copy(chassisPos);
    this.root.position.y -= 0.04;
    this.root.quaternion.copy(chassisQuat);

    this.forward.set(0, 0, 1).applyQuaternion(chassisQuat).normalize();
    this.position.copy(this.root.position);

    this.spin += speed * delta * 0.62;
    this.accelPitch = THREE.MathUtils.lerp(
      this.accelPitch,
      THREE.MathUtils.clamp(-drift * 0.22, -0.06, 0.05),
      delta * 6,
    );
    this.body.rotation.x = this.accelPitch;
    this.body.rotation.z = THREE.MathUtils.lerp(
      this.body.rotation.z,
      steer * 0.05 * Math.min(1, speed / 20),
      delta * 8,
    );

    if (this.wallFlash > 0) {
      this.wallFlash = Math.max(0, this.wallFlash - delta * 3.5);
      this.body.rotation.z += Math.sin(this.wallFlash * 18) * this.wallFlash * 0.06;
    }

    if (this.wheelFL) this.wheelFL.rotation.y = lerpAngle(this.wheelFL.rotation.y, steer * 0.48, delta * 10);
    if (this.wheelFR) this.wheelFR.rotation.y = lerpAngle(this.wheelFR.rotation.y, steer * 0.48, delta * 10);

    for (const wheel of this.wheels) {
      wheel.rotation.x = this.spin;
    }
  }
}
