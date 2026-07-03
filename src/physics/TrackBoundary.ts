import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { getBarrierEdgeOffset, TRACK_BARRIER_HALF_DEPTH } from '../track/trackLayout';
import { findNearestSampleIndex } from '../track/trackNavigation';
import type { GeneratedTrack, TrackSample } from '../track/types';

const SEARCH_RADIUS = 24;
/** Physics + visual half-width — boundary uses car edge, not center. */
const CAR_LATERAL_EXTENT = 1.08;

export type BoundaryState = {
  readonly lateral: number;
  readonly onTrack: boolean;
  readonly hitWall: boolean;
};

export class TrackBoundary {
  private readonly samples: ReadonlyArray<TrackSample>;
  private readonly limit: number;
  private nearestIndex = 0;

  constructor(track: GeneratedTrack) {
    this.samples = track.samples;
    const edge = getBarrierEdgeOffset(track.width / 2);
    this.limit = edge - CAR_LATERAL_EXTENT - TRACK_BARRIER_HALF_DEPTH - 0.14;
  }

  enforce(chassis: CANNON.Body): BoundaryState {
    const x = chassis.position.x;
    const z = chassis.position.z;
    const nearest = this.findNearest(x, z);
    const sample = nearest.sample;
    const lateral = (x - sample.position.x) * sample.normal.x + (z - sample.position.z) * sample.normal.z;
    const absLat = Math.abs(lateral);

    let hitWall = false;
    if (absLat > this.limit) {
      hitWall = true;
      const sign = lateral > 0 ? 1 : -1;
      const nx = sample.normal.x * sign;
      const nz = sample.normal.z * sign;
      const overflow = absLat - this.limit;

      chassis.position.x -= nx * overflow * 1.05;
      chassis.position.z -= nz * overflow * 1.05;

      const vx = chassis.velocity.x;
      const vz = chassis.velocity.z;
      const vn = vx * nx + vz * nz;
      if (vn > 0) {
        const bounce = 0.28;
        chassis.velocity.x = vx - (1 + bounce) * vn * nx;
        chassis.velocity.z = vz - (1 + bounce) * vn * nz;
        const postSpeed = Math.hypot(chassis.velocity.x, chassis.velocity.z);
        if (postSpeed > 5) {
          const damp = THREE.MathUtils.lerp(0.55, 0.72, Math.min(1, postSpeed / 24));
          chassis.velocity.x *= damp;
          chassis.velocity.z *= damp;
        }
      }
    }

    return {
      lateral,
      onTrack: absLat <= this.limit - 0.35,
      hitWall,
    };
  }

  private findNearest(x: number, z: number): { sample: TrackSample } {
    this.nearestIndex = findNearestSampleIndex(this.samples, x, z, this.nearestIndex, SEARCH_RADIUS);
    return { sample: this.samples[this.nearestIndex] };
  }
}
