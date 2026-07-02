import * as CANNON from 'cannon-es';
import { TrackBoundary } from './TrackBoundary';
import { getBarrierEdgeOffset } from '../track/trackLayout';
import type { GeneratedTrack } from '../track/types';

export type CarInput = {
  steer: number;
  throttle: number;
  brake: number;
  boost: boolean;
  handbrake: boolean;
};

export type CarPhysicsState = {
  position: CANNON.Vec3;
  velocity: CANNON.Vec3;
  speed: number;
  heading: number;
  onTrack: boolean;
  driftAmount: number;
  hitWall: boolean;
};

const WHEEL_RADIUS = 0.34;
const WHEEL_BASE = {
  frontOffset: 0.72,
  rearOffset: -0.72,
  halfTrack: 0.62,
  radius: WHEEL_RADIUS,
};

const UPRIGHT = new CANNON.Quaternion();

export class CarPhysics {
  readonly world = new CANNON.World({ gravity: new CANNON.Vec3(0, -16, 0) });
  readonly chassisBody: CANNON.Body;
  readonly vehicle: CANNON.RaycastVehicle;
  private readonly barrierBodies: CANNON.Body[] = [];
  private readonly wallMaterial = new CANNON.Material('wall');
  private readonly groundMaterial = new CANNON.Material('ground');
  private readonly chassisMaterial: CANNON.Material;
  private boundary: TrackBoundary | null = null;
  private grip = 1;

  constructor(startX: number, startZ: number, startHeading: number) {
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = false;

    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(320, 0.6, 320)),
      material: this.groundMaterial,
    });
    ground.position.set(0, -0.6, 0);
    this.world.addBody(ground);

    this.chassisMaterial = new CANNON.Material('chassis');
    const chassisShape = new CANNON.Box(new CANNON.Vec3(0.95, 0.22, 0.58));
    this.chassisBody = new CANNON.Body({
      mass: 180,
      material: this.chassisMaterial,
      linearDamping: 0.08,
      angularDamping: 0.92,
    });
    this.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, -0.08, 0));
    this.chassisBody.position.set(startX, 1.1, startZ);
    this.chassisBody.quaternion.setFromEuler(0, startHeading, 0);

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.groundMaterial, this.chassisMaterial, {
        friction: 0.42,
        restitution: 0.02,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.wallMaterial, this.chassisMaterial, {
        friction: 0.08,
        restitution: 0.55,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      }),
    );

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexForwardAxis: 2,
      indexRightAxis: 0,
      indexUpAxis: 1,
    });
    this.addWheels();
    this.vehicle.addToWorld(this.world);
  }

  buildTrackColliders(track: GeneratedTrack): void {
    this.boundary = new TrackBoundary(track);
    for (const body of this.barrierBodies) {
      this.world.removeBody(body);
    }
    this.barrierBodies.length = 0;

    const edge = getBarrierEdgeOffset(track.width / 2);
    const step = 2;
    const samples = track.samples;

    for (let i = 0; i < samples.length; i += step) {
      const sample = samples[i];
      const yaw = Math.atan2(sample.tangent.x, sample.tangent.z);

      for (const side of [-1, 1]) {
        const nx = sample.normal.x * side;
        const nz = sample.normal.z * side;
        const px = sample.position.x + nx * edge;
        const pz = sample.position.z + nz * edge;

        const body = new CANNON.Body({
          mass: 0,
          material: this.wallMaterial,
          shape: new CANNON.Box(new CANNON.Vec3(1.1, 0.72, 0.32)),
        });
        body.position.set(px, 0.62, pz);
        body.quaternion.setFromEuler(0, yaw, 0);
        this.world.addBody(body);
        this.barrierBodies.push(body);
      }
    }
  }

  setGrip(grip: number): void {
    this.grip = grip;
    const slip = 1.25 + grip * 0.5;
    for (let i = 0; i < this.vehicle.wheelInfos.length; i += 1) {
      this.vehicle.wheelInfos[i].frictionSlip = slip;
    }
  }

  reset(startX: number, startZ: number, startHeading: number): void {
    this.chassisBody.position.set(startX, 1.1, startZ);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.quaternion.setFromEuler(0, startHeading, 0);
    this.chassisBody.wakeUp();
    this.settle(90);
  }

  settle(steps = 60): void {
    for (let i = 0; i < steps; i += 1) {
      for (let w = 0; w < 4; w += 1) {
        this.vehicle.applyEngineForce(0, w);
        this.vehicle.setBrake(0, w);
      }
      this.world.step(1 / 60, 1 / 60, 3);
    }
    this.enforceUpright(1);
  }

  update(delta: number, input: CarInput): CarPhysicsState {
    const maxSteer = 0.38;
    const steer = -input.steer * maxSteer;
    this.vehicle.setSteeringValue(steer, 0);
    this.vehicle.setSteeringValue(steer, 1);

    const engine = -input.throttle * 2600 * this.grip * (input.boost ? 1.4 : 1);
    const brake = input.brake * 160 + (input.handbrake ? 80 : 0);

    for (let i = 0; i < 4; i += 1) {
      const isRear = i >= 2;
      this.vehicle.applyEngineForce(isRear ? engine : 0, i);
      this.vehicle.setBrake(brake, i);
      if (input.handbrake && isRear) {
        this.vehicle.wheelInfos[i].frictionSlip = 0.55;
      }
    }

    if (!input.handbrake) {
      const slip = 1.25 + this.grip * 0.5;
      for (let i = 0; i < 4; i += 1) {
        this.vehicle.wheelInfos[i].frictionSlip = slip;
      }
    }

    this.world.step(1 / 60, delta, 3);
    this.enforceUpright(0.42);
    this.clampVerticalVelocity();

    let hitWall = false;
    let onTrack = true;
    if (this.boundary) {
      for (let i = 0; i < 4; i += 1) {
        const boundary = this.boundary.enforce(this.chassisBody);
        hitWall = hitWall || boundary.hitWall;
        onTrack = boundary.onTrack;
      }
    }

    const vel = this.chassisBody.velocity;
    const speed = Math.hypot(vel.x, vel.z);
    const heading = this.getYaw();

    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const lateral = vel.x * forwardZ - vel.z * forwardX;
    const driftAmount = speed > 4 ? Math.abs(lateral) / Math.max(4, speed) : 0;

    return {
      position: this.chassisBody.position,
      velocity: vel,
      speed,
      heading,
      onTrack,
      driftAmount,
      hitWall,
    };
  }

  getWheelInfos(): CANNON.WheelInfo[] {
    return this.vehicle.wheelInfos;
  }

  private getYaw(): number {
    const q = this.chassisBody.quaternion;
    return Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y ** 2 + q.z ** 2),
    );
  }

  private enforceUpright(strength: number): void {
    const yaw = this.getYaw();
    UPRIGHT.setFromEuler(0, yaw, 0);
    this.chassisBody.quaternion.slerp(UPRIGHT, strength, this.chassisBody.quaternion);
    this.chassisBody.angularVelocity.x = 0;
    this.chassisBody.angularVelocity.z = 0;
  }

  private clampVerticalVelocity(): void {
    const vel = this.chassisBody.velocity;
    if (vel.y > 2) vel.y = 2;
    if (vel.y < -8) vel.y = -8;
    if (this.chassisBody.position.y < 0.35) {
      this.chassisBody.position.y = 0.35;
      if (vel.y < 0) vel.y = 0;
    }
  }

  private addWheels(): void {
    const offsets = [
      [WHEEL_BASE.halfTrack, WHEEL_BASE.frontOffset],
      [-WHEEL_BASE.halfTrack, WHEEL_BASE.frontOffset],
      [WHEEL_BASE.halfTrack, WHEEL_BASE.rearOffset],
      [-WHEEL_BASE.halfTrack, WHEEL_BASE.rearOffset],
    ];

    for (const [x, z] of offsets) {
      this.vehicle.addWheel({
        radius: WHEEL_BASE.radius,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        axleLocal: new CANNON.Vec3(1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(x, -0.04, z),
        suspensionStiffness: 42,
        suspensionRestLength: 0.32,
        maxSuspensionForce: 140000,
        maxSuspensionTravel: 0.22,
        dampingCompression: 6,
        dampingRelaxation: 4.5,
        frictionSlip: 1.7,
        rollInfluence: 0.02,
        customSlidingRotationalSpeed: -24,
        useCustomSlidingRotationalSpeed: true,
      });
    }
  }
}
