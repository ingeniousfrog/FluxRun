import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MaterialLibrary } from '../../src/assets/MaterialLibrary';
import { RacePhysicsWorld } from '../../src/physics/RacePhysicsWorld';
import { AiOpponentManager } from '../../src/systems/AiOpponentManager';
import { getBarrierEdgeOffset } from '../../src/track/trackLayout';
import { crossTrackError } from '../../src/track/trackNavigation';
import { generateTrack, randomRaceSeed } from '../../src/track/TrackGenerator';

function createAiRace(seed: number): {
  readonly ai: AiOpponentManager;
  readonly materials: MaterialLibrary;
  readonly world: RacePhysicsWorld;
} {
  const track = generateTrack(seed);
  const scene = new THREE.Scene();
  const materials = new MaterialLibrary();
  const ai = new AiOpponentManager(scene, materials);
  const world = new RacePhysicsWorld();
  world.buildTrack(track);
  ai.setup(track, world, 1);
  world.settleAll(60);
  return { ai, materials, world };
}

describe('RacePhysicsWorld', () => {
  it('accelerates a vehicle with throttle input', () => {
    const track = generateTrack(101);
    const world = new RacePhysicsWorld();
    world.buildTrack(track);
    const start = track.samples[0];
    const heading = Math.atan2(start.tangent.x, start.tangent.z);
    const vehicle = world.addVehicle(start.position.x, start.position.z, heading);
    world.settleAll(40);

    for (let i = 0; i < 180; i += 1) {
      vehicle.drive(1 / 60, {
        steer: 0,
        throttle: 1,
        brake: 0,
        boost: false,
        handbrake: false,
      });
      world.simulate(1 / 60);
    }

    expect(vehicle.getState().speed).toBeGreaterThan(6);
    world.dispose();
  });

  it('reports guardrail hits and keeps the chassis inside the barrier line', () => {
    const track = generateTrack(228);
    const world = new RacePhysicsWorld();
    world.buildTrack(track);
    const sample = track.samples[40];
    const heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    const vehicle = world.addVehicle(sample.position.x, sample.position.z, heading);
    world.settleAll(20);

    const edge = getBarrierEdgeOffset(track.width / 2);
    vehicle.chassisBody.position.set(
      sample.position.x + sample.normal.x * (edge + 1.4),
      1.28,
      sample.position.z + sample.normal.z * (edge + 1.4),
    );
    vehicle.chassisBody.velocity.set(sample.normal.x * 18, 0, sample.normal.z * 18);

    for (let i = 0; i < 8; i += 1) {
      vehicle.drive(1 / 60, {
        steer: 0,
        throttle: 0,
        brake: 0,
        boost: false,
        handbrake: false,
      });
      world.simulate(1 / 60);
    }

    const state = vehicle.getState();
    const lateral = Math.abs(crossTrackError(sample, state.position.x, state.position.z));
    expect(state.hitWall).toBe(true);
    expect(lateral).toBeLessThan(edge);
    expect(state.speed).toBeLessThan(18);
    world.dispose();
  });
});

describe('AiOpponentManager', () => {
  it('does not mark AI as finished immediately after the green light', () => {
    const track = generateTrack(4242);
    const scene = new THREE.Scene();
    const materials = new MaterialLibrary();
    const ai = new AiOpponentManager(scene, materials);
    const world = new RacePhysicsWorld();
    world.buildTrack(track);
    ai.setup(track, world, 1);
    world.settleAll(60);

    let peakSpeed = 0;
    for (let i = 0; i < 480; i += 1) {
      ai.driveAll(1 / 60, true);
      world.simulate(1 / 60);
      ai.finalizeLaps();
      for (const snap of ai.getSnapshots()) {
        peakSpeed = Math.max(peakSpeed, snap.speed);
      }
    }

    const snapshots = ai.getSnapshots();
    expect(snapshots.every((snap) => !snap.finished)).toBe(true);
    expect(peakSpeed).toBeGreaterThan(5);
    world.dispose();
    materials.dispose();
  });

  it('keeps AI moving forward on the circuit', () => {
    const track = generateTrack(4242);
    const scene = new THREE.Scene();
    const materials = new MaterialLibrary();
    const ai = new AiOpponentManager(scene, materials);
    const world = new RacePhysicsWorld();
    world.buildTrack(track);
    ai.setup(track, world, 1);
    world.settleAll(60);

    let peakProgress = 0;
    let peakSpeed = 0;
    for (let i = 0; i < 2400; i += 1) {
      ai.driveAll(1 / 60, true);
      world.simulate(1 / 60);
      ai.finalizeLaps();
      for (const snap of ai.getSnapshots()) {
        peakProgress = Math.max(peakProgress, snap.progress);
        peakSpeed = Math.max(peakSpeed, snap.speed);
      }
    }

    expect(peakSpeed).toBeGreaterThan(5);
    expect(peakProgress).toBeGreaterThan(0.01);
    world.dispose();
    materials.dispose();
  }, 10_000);

  it('can complete a three-lap race without stopping or leaving the route', () => {
    const { ai, materials, world } = createAiRace(4242);
    const maxSteps = 60 * 120;
    let minMovingSpeed = Infinity;
    let offTrackFrames = 0;

    for (let i = 0; i < maxSteps; i += 1) {
      ai.driveAll(1 / 60, true);
      world.simulate(1 / 60);
      ai.finalizeLaps();

      const snapshots = ai.getSnapshots();
      for (const snap of snapshots) {
        if (!snap.onTrack) {
          offTrackFrames += 1;
        }
        if (!snap.finished && i > 120) {
          minMovingSpeed = Math.min(minMovingSpeed, snap.speed);
        }
      }

      const allFinished = snapshots.every((snap) => snap.finished);
      if (allFinished) break;
    }

    const snapshots = ai.getSnapshots();
    expect(snapshots.every((snap) => snap.finished)).toBe(true);
    expect(snapshots.every((snap) => snap.progress >= 1)).toBe(true);
    expect(minMovingSpeed).toBeGreaterThan(0.2);
    expect(offTrackFrames).toBe(0);
    world.dispose();
    materials.dispose();
  }, 10_000);
});

describe('randomRaceSeed', () => {
  it('returns a different seed when an exclude is provided', () => {
    const exclude = 123456789;
    const next = randomRaceSeed(exclude);
    expect(next).not.toBe(exclude);
  });
});
