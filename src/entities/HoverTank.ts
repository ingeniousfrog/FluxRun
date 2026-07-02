import * as THREE from 'three';
import { createHoverTankModel } from '../assets/modelFactories';
import type { MaterialLibrary } from '../assets/MaterialLibrary';

export class HoverTank {
  readonly group: THREE.Group;
  readonly position = new THREE.Vector3();
  readonly forward = new THREE.Vector3(0, 0, -1);

  constructor(materials: MaterialLibrary) {
    this.group = createHoverTankModel(materials);
  }

  sync(position: THREE.Vector3, forward: THREE.Vector3, boost: boolean, damagePulse: number): void {
    this.position.copy(position);
    this.forward.copy(forward).normalize();
    this.group.position.copy(position);
    this.group.rotation.y = Math.atan2(this.forward.x, this.forward.z);
    const bob = Math.sin(performance.now() * 0.012) * 0.045;
    this.group.position.y = 0.18 + bob + (boost ? 0.08 : 0);
    this.group.scale.setScalar(1 + Math.max(0, damagePulse) * 0.08);
  }
}
