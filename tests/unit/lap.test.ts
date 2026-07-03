import { describe, expect, it } from 'vitest';
import { generateTrack } from '../../src/track/TrackGenerator';
import { LapSystem } from '../../src/systems/LapSystem';

describe('LapSystem', () => {
  it('treats grid slots behind the start line as zero progress', () => {
    const track = generateTrack(42);
    const lap = new LapSystem(track, 3);
    lap.reset();

    const gridIndex = track.samples.length - 6;
    const grid = track.samples[gridIndex];
    lap.reset(gridIndex);
    const snap = lap.update(grid.position.x, grid.position.z, 0);

    expect(grid.s).toBeGreaterThan(track.length * 0.5);
    expect(snap.lap).toBe(0);
    expect(snap.lapProgress).toBe(0);
    expect(snap.progress).toBe(0);
    expect(snap.finished).toBe(false);
  });

  it('does not finish on the first start-line crossing from the grid', () => {
    const track = generateTrack(42);
    const lap = new LapSystem(track, 3);

    const behindIndex = track.samples.length - 8;
    const behind = track.samples[behindIndex];
    lap.reset(behindIndex);
    lap.update(behind.position.x, behind.position.z, 12);

    const start = track.samples[2];
    const snap = lap.update(start.position.x, start.position.z, 10);

    expect(snap.lap).toBe(0);
    expect(snap.finished).toBe(false);
    expect(snap.lapProgress).toBeGreaterThan(0);
  });

  it('keeps position progress stable regardless of heading', () => {
    const track = generateTrack(77);
    const lap = new LapSystem(track, 3);
    lap.reset();

    const mid = track.samples[Math.floor(track.samples.length * 0.18)];
    const forward = lap.update(mid.position.x, mid.position.z, 18);
    const backward = lap.update(mid.position.x, mid.position.z, 2);

    expect(backward.lap).toBe(forward.lap);
    expect(backward.lapProgress).toBeCloseTo(forward.lapProgress, 5);
    expect(backward.progress).toBeCloseTo(forward.progress, 5);
  });
});
