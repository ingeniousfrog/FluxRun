import * as CANNON from 'cannon-es';
import { TrackBoundary } from './TrackBoundary';
import { getBarrierEdgeOffset, TRACK_BARRIER_HALF_DEPTH } from '../track/trackLayout';
import type { GeneratedTrack } from '../track/types';
import { VehicleController } from './VehicleController';

export class RacePhysicsWorld {
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -16, 0) });
  private readonly wallMaterial = new CANNON.Material('wall');
  private readonly groundMaterial = new CANNON.Material('ground');
  private readonly chassisMaterial = new CANNON.Material('chassis');
  private readonly barrierBodies: CANNON.Body[] = [];
  private readonly vehicles: VehicleController[] = [];
  private readonly groundBody: CANNON.Body;
  private track: GeneratedTrack | null = null;

  constructor() {
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = false;

    this.groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(320, 0.6, 320)),
      material: this.groundMaterial,
    });
    this.groundBody.position.set(0, -0.6, 0);
    this.world.addBody(this.groundBody);

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.groundMaterial, this.chassisMaterial, {
        friction: 0.42,
        restitution: 0.02,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.wallMaterial, this.chassisMaterial, {
        friction: 0.18,
        restitution: 0.22,
        contactEquationStiffness: 2e7,
        contactEquationRelaxation: 3,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.chassisMaterial, this.chassisMaterial, {
        friction: 0.22,
        restitution: 0.22,
        contactEquationStiffness: 2e6,
        contactEquationRelaxation: 4,
      }),
    );
  }

  buildTrack(track: GeneratedTrack): void {
    this.track = track;
    for (const body of this.barrierBodies) {
      this.world.removeBody(body);
    }
    this.barrierBodies.length = 0;

    const edge = getBarrierEdgeOffset(track.width / 2);
    const halfDepth = TRACK_BARRIER_HALF_DEPTH + 0.05;
    const segment = Math.max(0.9, (track.length / track.samples.length) * 1.15);

    for (let i = 0; i < track.samples.length; i += 1) {
      const sample = track.samples[i];
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);

      for (const side of [-1, 1]) {
        const nx = sample.normal.x * side;
        const nz = sample.normal.z * side;
        const px = sample.position.x + nx * edge;
        const pz = sample.position.z + nz * edge;

        const body = new CANNON.Body({
          mass: 0,
          material: this.wallMaterial,
          shape: new CANNON.Box(new CANNON.Vec3(halfDepth, 0.58, segment * 0.62)),
        });
        body.position.set(px, 0.58, pz);
        body.quaternion.setFromEuler(0, yaw, 0);
        this.world.addBody(body);
        this.barrierBodies.push(body);
      }
    }
  }

  addVehicle(startX: number, startZ: number, startHeading: number): VehicleController {
    const boundary = this.track ? new TrackBoundary(this.track) : null;
    const vehicle = new VehicleController(
      this.world,
      this.chassisMaterial,
      boundary,
      startX,
      startZ,
      startHeading,
    );
    this.vehicles.push(vehicle);
    return vehicle;
  }

  getVehicles(): ReadonlyArray<VehicleController> {
    return this.vehicles;
  }

  simulate(delta: number): void {
    this.world.step(1 / 60, delta, 5);
    for (const vehicle of this.vehicles) {
      vehicle.finalizeFrame(delta);
    }
  }

  settleAll(steps = 90): void {
    for (let i = 0; i < steps; i += 1) {
      for (const vehicle of this.vehicles) {
        vehicle.holdStill();
      }
      this.world.step(1 / 60, 1 / 60, 5);
    }
    for (const vehicle of this.vehicles) {
      vehicle.snapUpright();
    }
  }

  dispose(): void {
    for (const vehicle of this.vehicles) {
      vehicle.destroy(this.world);
    }
    this.vehicles.length = 0;
    for (const body of this.barrierBodies) {
      this.world.removeBody(body);
    }
    this.barrierBodies.length = 0;
    this.world.removeBody(this.groundBody);
    this.track = null;
  }
}
