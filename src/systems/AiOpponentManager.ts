import * as THREE from 'three';
import type { MaterialLibrary } from '../assets/MaterialLibrary';
import { RaceCar } from '../entities/RaceCar';
import type { VehicleController } from '../physics/VehicleController';
import type { RacePhysicsWorld } from '../physics/RacePhysicsWorld';
import {
  findStartGridSampleIndex,
  sampleAtOffset,
} from '../track/trackNavigation';
import type { LapSnapshot } from './LapSystem';
import type { GeneratedTrack } from '../track/types';

type AiProfile = {
  readonly name: string;
  readonly color: string;
  readonly skill: number;
  readonly row: number;
  readonly lane: number;
};

const AI_ROSTER: AiProfile[] = [
  { name: 'Viper', color: '#1a5cff', skill: 0.92, row: 0, lane: -0.34 },
  { name: 'Blaze', color: '#ff6a1a', skill: 0.86, row: 1, lane: 0 },
  { name: 'Ghost', color: '#e8e8f0', skill: 0.8, row: 2, lane: 0.34 },
];

const LAUNCH_DURATION = 1.4;
const AI_TOTAL_LAPS = 3;

function angleDelta(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function positiveModulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}

type AiRacer = {
  readonly profile: AiProfile;
  readonly car: RaceCar;
  vehicle: VehicleController;
  targetIndex: number;
  steerSmoothed: number;
  gridOffset: number;
  finishDistance: number;
  raceDistance: number;
  scriptedSpeed: number;
  lapSnapshot: LapSnapshot;
  readonly chassisPos: THREE.Vector3;
  readonly chassisQuat: THREE.Quaternion;
};

export type AiRaceSnapshot = {
  readonly name: string;
  readonly color: string;
  readonly progress: number;
  readonly finished: boolean;
  readonly position: THREE.Vector3;
  readonly heading: number;
  readonly speed: number;
  readonly onTrack: boolean;
};

export class AiOpponentManager {
  private readonly racers: AiRacer[] = [];
  private readonly scene: THREE.Scene;
  private track!: GeneratedTrack;
  private raceTimer = 0;

  constructor(scene: THREE.Scene, materials: MaterialLibrary) {
    this.scene = scene;
    for (const profile of AI_ROSTER) {
      const car = new RaceCar(materials, profile.color);
      this.racers.push({
        profile,
        car,
        vehicle: null as unknown as VehicleController,
        targetIndex: 0,
        steerSmoothed: 0,
        gridOffset: 0,
        finishDistance: 1,
        raceDistance: 0,
        scriptedSpeed: 0,
        lapSnapshot: {
          progress: 0,
          speed: 0,
          lateral: 0,
          lap: 0,
          lapProgress: 0,
          finished: false,
          onTrack: true,
        },
        chassisPos: new THREE.Vector3(),
        chassisQuat: new THREE.Quaternion(),
      });
    }
  }

  setup(track: GeneratedTrack, world: RacePhysicsWorld, grip: number): void {
    this.track = track;
    this.raceTimer = 0;
    const samples = track.samples;
    const halfWidth = track.width * 0.5;
    const start = samples[0];
    const sampleSpacing = track.length / samples.length;
    const rowGap = Math.max(5.5, sampleSpacing * 5);

    for (let i = 0; i < this.racers.length; i += 1) {
      const racer = this.racers[i];
      const backDist = 7 + racer.profile.row * rowGap;
      const laneOffset = racer.profile.lane * halfWidth * 0.55;
      const sx = start.position.x - start.tangent.x * backDist + start.normal.x * laneOffset;
      const sz = start.position.z - start.tangent.z * backDist + start.normal.z * laneOffset;
      const h = Math.atan2(start.tangent.x, start.tangent.z);

      racer.vehicle = world.addVehicle(sx, sz, h);
      racer.vehicle.setGrip(grip);
      const spawnIndex = findStartGridSampleIndex(samples, sx, sz, track.length);
      racer.targetIndex = spawnIndex;
      racer.steerSmoothed = 0;
      racer.gridOffset = -backDist;
      racer.finishDistance = AI_TOTAL_LAPS * track.length - racer.gridOffset;
      racer.raceDistance = 0;
      racer.scriptedSpeed = 0;
      racer.lapSnapshot = {
        progress: 0,
        speed: 0,
        lateral: 0,
        lap: 0,
        lapProgress: 0,
        finished: false,
        onTrack: true,
      };

      if (!racer.car.root.parent) {
        this.scene.add(racer.car.root);
      }
      this.syncVisual(racer, 0);
    }
  }

  driveAll(delta: number, racing: boolean): void {
    if (!this.track) return;
    if (racing) {
      this.raceTimer += delta;
    } else {
      this.raceTimer = 0;
    }

    for (const racer of this.racers) {
      if (!racing) {
        racer.vehicle.drive(delta, {
          steer: 0,
          throttle: 0,
          brake: 0.5,
          boost: false,
          handbrake: false,
        });
        this.syncVisual(racer, delta);
        continue;
      }

      if (racer.lapSnapshot.finished) {
        racer.scriptedSpeed = THREE.MathUtils.lerp(racer.scriptedSpeed, 0, Math.min(1, delta * 3));
        this.placeScriptedRacer(racer);
        this.syncVisual(racer, delta);
        continue;
      }

      this.advanceScriptedRacer(racer, delta);
      this.syncVisual(racer, delta);
    }
  }

  finalizeLaps(): void {
    for (const racer of this.racers) this.updateLapSnapshot(racer);
  }

  getSnapshots(): AiRaceSnapshot[] {
    return this.racers.map((racer) => {
      const body = racer.vehicle.chassisBody;
      const q = body.quaternion;
      const heading = Math.atan2(
        2 * (q.w * q.y + q.x * q.z),
        1 - 2 * (q.y ** 2 + q.z ** 2),
      );
      return {
        name: racer.profile.name,
        color: racer.profile.color,
        progress: racer.lapSnapshot.progress,
        finished: racer.lapSnapshot.finished,
        position: racer.car.position.clone(),
        heading,
        speed: racer.lapSnapshot.speed,
        onTrack: racer.lapSnapshot.onTrack,
      };
    });
  }

  private advanceScriptedRacer(racer: AiRacer, delta: number): void {
    const samples = this.track.samples;
    const launching = this.raceTimer < LAUNCH_DURATION;
    const lookAhead = Math.floor(THREE.MathUtils.clamp(10 + racer.scriptedSpeed * 0.35, 10, 24));
    const lookSample = sampleAtOffset(samples, racer.targetIndex, lookAhead);
    const cornerSample = sampleAtOffset(samples, racer.targetIndex, lookAhead + 12);
    const turnAngle = Math.abs(angleDelta(
      Math.atan2(cornerSample.tangent.x, cornerSample.tangent.z),
      Math.atan2(lookSample.tangent.x, lookSample.tangent.z),
    ));
    const cornerSeverity = THREE.MathUtils.clamp(turnAngle / 0.85, 0, 1);
    const cruise = THREE.MathUtils.lerp(29, 15, cornerSeverity) * racer.profile.skill;
    const launchScale = launching
      ? THREE.MathUtils.smoothstep(this.raceTimer, 0, LAUNCH_DURATION)
      : 1;
    const targetSpeed = Math.max(6, cruise * THREE.MathUtils.lerp(0.45, 1, launchScale));
    racer.scriptedSpeed = THREE.MathUtils.lerp(
      racer.scriptedSpeed,
      targetSpeed,
      Math.min(1, delta * (targetSpeed > racer.scriptedSpeed ? 2.6 : 4.2)),
    );
    racer.raceDistance = Math.min(
      racer.finishDistance,
      racer.raceDistance + racer.scriptedSpeed * delta,
    );
    this.placeScriptedRacer(racer);
    this.updateLapSnapshot(racer);
  }

  private placeScriptedRacer(racer: AiRacer): void {
    const trackDistance = positiveModulo(racer.gridOffset + racer.raceDistance, this.track.length);
    const sampleIndex = Math.floor((trackDistance / this.track.length) * this.track.samples.length) % this.track.samples.length;
    const sample = this.track.samples[sampleIndex];
    const laneOffset = racer.profile.lane * this.track.width * 0.18;
    const heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    const body = racer.vehicle.chassisBody;

    body.position.set(
      sample.position.x + sample.normal.x * laneOffset,
      1.28,
      sample.position.z + sample.normal.z * laneOffset,
    );
    body.quaternion.setFromEuler(0, heading, 0);
    body.velocity.set(
      sample.tangent.x * racer.scriptedSpeed,
      0,
      sample.tangent.z * racer.scriptedSpeed,
    );
    body.angularVelocity.set(0, 0, 0);
    body.wakeUp();
    racer.targetIndex = sampleIndex;
  }

  private updateLapSnapshot(racer: AiRacer): void {
    const startLineDistance = THREE.MathUtils.clamp(
      racer.raceDistance + racer.gridOffset,
      0,
      AI_TOTAL_LAPS * this.track.length,
    );
    const lap = Math.min(AI_TOTAL_LAPS, Math.floor(startLineDistance / this.track.length));
    const lapProgress = lap >= AI_TOTAL_LAPS
      ? 1
      : (startLineDistance - lap * this.track.length) / this.track.length;
    const progress = THREE.MathUtils.clamp(racer.raceDistance / racer.finishDistance, 0, 1);

    racer.lapSnapshot = {
      progress,
      speed: racer.scriptedSpeed,
      lateral: racer.profile.lane * this.track.width * 0.18,
      lap,
      lapProgress,
      finished: racer.raceDistance >= racer.finishDistance,
      onTrack: true,
    };
  }

  private syncVisual(racer: AiRacer, delta: number): void {
    const body = racer.vehicle.chassisBody;
    racer.chassisPos.set(body.position.x, body.position.y, body.position.z);
    racer.chassisQuat.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    racer.car.syncFromPhysics(
      racer.chassisPos,
      racer.chassisQuat,
      racer.vehicle.getWheelInfos(),
      racer.steerSmoothed,
      speed,
      0,
      delta || 0.016,
    );
  }
}
