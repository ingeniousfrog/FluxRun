import * as THREE from 'three';
import type { WheelInfo } from 'cannon-es';

const MAX_MARKS = 280;

export class DriftVfx {
  readonly group = new THREE.Group();
  private readonly smoke: THREE.Points;
  private readonly markMesh: THREE.InstancedMesh;
  private markIndex = 0;

  constructor() {
    const smokeGeo = new THREE.BufferGeometry();
    const smokeCount = 120;
    const smokePos = new Float32Array(smokeCount * 3);
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
    this.smoke = new THREE.Points(
      smokeGeo,
      new THREE.PointsMaterial({ color: '#b8c4cc', size: 0.35, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.group.add(this.smoke);

    const markGeo = new THREE.PlaneGeometry(0.55, 1.2);
    const markMat = new THREE.MeshBasicMaterial({
      color: '#1a1a1a',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.markMesh = new THREE.InstancedMesh(markGeo, markMat, MAX_MARKS);
    this.markMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.markMesh);
  }

  update(
    delta: number,
    carPos: THREE.Vector3,
    heading: number,
    drift: number,
    speed: number,
    wheelInfos: WheelInfo[],
  ): void {
    const smokePos = this.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    const intensity = drift * speed;
    if (intensity > 2.5) {
      for (let i = 0; i < smokePos.count; i += 1) {
        let y = smokePos.getY(i) + delta * 1.8;
        if (y > carPos.y + 2.2) y = carPos.y + 0.2;
        smokePos.setXYZ(
          i,
          carPos.x + (Math.random() - 0.5) * 1.4,
          y,
          carPos.z + (Math.random() - 0.5) * 1.4,
        );
      }
      smokePos.needsUpdate = true;
      this.smoke.visible = true;
    } else {
      this.smoke.visible = false;
    }

    if (intensity > 3.2 && wheelInfos.length >= 4) {
      for (const idx of [2, 3]) {
        if (!wheelInfos[idx]?.isInContact) continue;
        const i = this.markIndex % MAX_MARKS;
        const matrix = new THREE.Matrix4();
        matrix.makeRotationY(heading);
        matrix.setPosition(carPos.x, 0.09, carPos.z);
        this.markMesh.setMatrixAt(i, matrix);
        this.markIndex += 1;
      }
      this.markMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
