import * as CANNON from 'cannon-es';
import { getBarrierEdgeOffset, TRACK_BARRIER_HALF_DEPTH } from '../track/trackLayout';
import type { GeneratedTrack, TrackSample } from '../track/types';

const SEARCH_RADIUS = 24;
/** Physics + visual half-width — boundary uses car edge, not center. */
const CAR_LATERAL_EXTENT = 1.02;

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
    this.limit = edge - CAR_LATERAL_EXTENT - TRACK_BARRIER_HALF_DEPTH - 0.1;
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

      chassis.position.x -= nx * overflow;
      chassis.position.z -= nz * overflow;

      const vx = chassis.velocity.x;
      const vz = chassis.velocity.z;
      const vn = vx * nx + vz * nz;
      if (vn > 0) {
        const bounce = 0.62;
        chassis.velocity.x = vx - (1 + bounce) * vn * nx;
        chassis.velocity.z = vz - (1 + bounce) * vn * nz;
        const speed = Math.hypot(chassis.velocity.x, chassis.velocity.z);
        if (speed > 4) {
          chassis.velocity.x *= 0.88;
          chassis.velocity.z *= 0.88;
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
    let bestIndex = this.nearestIndex;
    let bestDistSq = Infinity;
    const start = Math.max(0, this.nearestIndex - SEARCH_RADIUS);
    const end = Math.min(this.samples.length - 1, this.nearestIndex + SEARCH_RADIUS);

    for (let i = start; i <= end; i += 1) {
      const sample = this.samples[i];
      const dx = x - sample.position.x;
      const dz = z - sample.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = i;
      }
    }

    this.nearestIndex = bestIndex;
    return { sample: this.samples[bestIndex] };
  }
}
