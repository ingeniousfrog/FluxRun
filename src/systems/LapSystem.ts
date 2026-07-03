import * as THREE from 'three';
import type { GeneratedTrack, TrackSample } from '../track/types';
import { findNearestSampleIndex } from '../track/trackNavigation';

export type LapSnapshot = {
  readonly progress: number;
  readonly speed: number;
  readonly lateral: number;
  readonly lap: number;
  readonly lapProgress: number;
  readonly finished: boolean;
  readonly onTrack: boolean;
};

export class LapSystem {
  private readonly samples: ReadonlyArray<TrackSample>;
  private readonly trackLength: number;
  private readonly halfWidth: number;
  private readonly totalLaps: number;

  private lap = 0;
  private finished = false;
  private lastArcS = 0;
  /** True after the first forward crossing of the start/finish line. */
  private crossedStartLine = false;
  private nearestIndex = 0;
  private lateral = 0;
  private onTrack = true;

  constructor(track: GeneratedTrack, totalLaps = 3) {
    this.samples = track.samples;
    this.trackLength = track.length;
    this.halfWidth = track.width / 2;
    this.totalLaps = totalLaps;
  }

  reset(gridIndex = 0): void {
    this.lap = 0;
    this.finished = false;
    this.crossedStartLine = false;
    this.nearestIndex = gridIndex;
    this.lateral = 0;
    this.onTrack = true;
    const sample = this.samples[gridIndex];
    this.lastArcS = sample?.s ?? 0;
  }

  update(x: number, z: number, speed: number): LapSnapshot {
    const nearest = this.findNearest(x, z);
    const rawS = nearest.sample.s;

    const crossedFinishLine =
      this.lastArcS > this.trackLength * 0.85 && rawS < this.trackLength * 0.15;

    if (crossedFinishLine) {
      if (this.crossedStartLine) {
        this.lap += 1;
        if (this.lap >= this.totalLaps) {
          this.finished = true;
        }
      }
      this.crossedStartLine = true;
    }

    this.lastArcS = rawS;

    const lapProgress = this.computeLapProgress(rawS);

    return {
      progress: (this.lap + lapProgress) / this.totalLaps,
      speed,
      lateral: this.lateral,
      lap: this.lap,
      lapProgress,
      finished: this.finished,
      onTrack: this.onTrack,
    };
  }

  /** Arc-length progress on the current lap in [0, 1), independent of car heading. */
  private computeLapProgress(rawS: number): number {
    if (this.finished) return 1;

    // Before the first start-line crossing, keep arc progress near the grid.
    if (this.lap === 0 && !this.crossedStartLine && rawS > this.trackLength * 0.5) {
      return 0;
    }

    if (this.lap === 0 && !this.crossedStartLine) {
      return THREE.MathUtils.clamp(rawS / this.trackLength, 0, 0.99);
    }

    return rawS / this.trackLength;
  }

  private findNearest(x: number, z: number): { index: number; sample: TrackSample; dist: number; lateral: number } {
    this.nearestIndex = findNearestSampleIndex(this.samples, x, z, this.nearestIndex, 28, {
      forwardOnly: true,
    });
    const sample = this.samples[this.nearestIndex];
    const dx = x - sample.position.x;
    const dz = z - sample.position.z;
    const lateral = (x - sample.position.x) * sample.normal.x + (z - sample.position.z) * sample.normal.z;
    this.lateral = lateral;
    this.onTrack = Math.hypot(dx, dz) <= this.halfWidth + 0.8;
    return { index: this.nearestIndex, sample, dist: Math.hypot(dx, dz), lateral };
  }
}
