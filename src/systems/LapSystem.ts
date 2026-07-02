import type { GeneratedTrack, TrackSample } from '../track/types';

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
  private lapProgress = 0;
  private finished = false;
  private lastArcS = 0;
  private crossedStart = false;
  private nearestIndex = 0;
  private lateral = 0;
  private onTrack = true;

  constructor(track: GeneratedTrack, totalLaps = 3) {
    this.samples = track.samples;
    this.trackLength = track.length;
    this.halfWidth = track.width / 2;
    this.totalLaps = totalLaps;
  }

  reset(): void {
    this.lap = 0;
    this.lapProgress = 0;
    this.finished = false;
    this.lastArcS = 0;
    this.crossedStart = false;
    this.nearestIndex = 0;
    this.lateral = 0;
    this.onTrack = true;
  }

  update(x: number, z: number, speed: number): LapSnapshot {
    const nearest = this.findNearest(x, z);
    this.nearestIndex = nearest.index;
    this.lateral = nearest.lateral;
    this.onTrack = nearest.dist <= this.halfWidth + 0.8;

    if (this.lap === 0 && !this.crossedStart && nearest.sample.s > this.trackLength * 0.05) {
      this.crossedStart = true;
    }

    if (this.crossedStart && this.lastArcS > this.trackLength * 0.85 && nearest.sample.s < this.trackLength * 0.15) {
      this.lap += 1;
      if (this.lap >= this.totalLaps) {
        this.finished = true;
        this.lapProgress = 1;
      }
    }

    this.lastArcS = nearest.sample.s;
    this.lapProgress = nearest.sample.s / this.trackLength;

    return {
      progress: (this.lap + this.lapProgress) / this.totalLaps,
      speed,
      lateral: this.lateral,
      lap: this.lap,
      lapProgress: this.lapProgress,
      finished: this.finished,
      onTrack: this.onTrack,
    };
  }

  private findNearest(x: number, z: number): { index: number; sample: TrackSample; dist: number; lateral: number } {
    let bestIndex = this.nearestIndex;
    let bestDistSq = Infinity;
    const start = Math.max(0, this.nearestIndex - 14);
    const end = Math.min(this.samples.length - 1, this.nearestIndex + 14);

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

    const sample = this.samples[bestIndex];
    const lateral = (x - sample.position.x) * sample.normal.x + (z - sample.position.z) * sample.normal.z;
    return { index: bestIndex, sample, dist: Math.sqrt(bestDistSq), lateral };
  }
}
