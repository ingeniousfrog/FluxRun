import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { TrackBoundary } from './TrackBoundary';
import type { CarInput, CarPhysicsState } from './CarPhysics';

const WHEEL_RADIUS = 0.52;
const WHEEL_BASE = {
  frontOffset: 0.92,
  rearOffset: -0.92,
  halfTrack: 0.85,
  radius: WHEEL_RADIUS,
};

const UPRIGHT = new CANNON.Quaternion();
const WALL_HIT_FEEDBACK_SECONDS = 0.18;

export class VehicleController {
  readonly chassisBody: CANNON.Body;
  readonly vehicle: CANNON.RaycastVehicle;
  private readonly boundary: TrackBoundary | null;
  private grip = 1;
  private steerSmoothed = 0;
  private wallHitFeedback = 0;
  private lastState: CarPhysicsState = {
    position: new CANNON.Vec3(),
    velocity: new CANNON.Vec3(),
    speed: 0,
    heading: 0,
    onTrack: true,
    driftAmount: 0,
    hitWall: false,
  };

  constructor(
    world: CANNON.World,
    chassisMaterial: CANNON.Material,
    boundary: TrackBoundary | null,
    startX: number,
    startZ: number,
    startHeading: number,
  ) {
    this.boundary = boundary;
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1.05, 0.36, 0.78));
    this.chassisBody = new CANNON.Body({
      mass: 1480,
      material: chassisMaterial,
      linearDamping: 0.14,
      angularDamping: 0.72,
    });
    this.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.02, 0));
    this.chassisBody.position.set(startX, 1.28, startZ);
    this.chassisBody.quaternion.setFromEuler(0, startHeading, 0);
    world.addBody(this.chassisBody);

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexForwardAxis: 2,
      indexRightAxis: 0,
      indexUpAxis: 1,
    });
    this.addWheels();
    this.vehicle.addToWorld(world);
  }

  setGrip(grip: number): void {
    this.grip = grip;
    const slip = 1.05 + grip * 0.55;
    for (let i = 0; i < this.vehicle.wheelInfos.length; i += 1) {
      this.vehicle.wheelInfos[i].frictionSlip = slip;
    }
  }

  reset(startX: number, startZ: number, startHeading: number): void {
    this.steerSmoothed = 0;
    this.wallHitFeedback = 0;
    this.chassisBody.position.set(startX, 1.28, startZ);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);
    this.chassisBody.quaternion.setFromEuler(0, startHeading, 0);
    this.chassisBody.wakeUp();
  }

  holdStill(): void {
    for (let w = 0; w < 4; w += 1) {
      this.vehicle.applyEngineForce(0, w);
      this.vehicle.setBrake(40, w);
    }
  }

  snapUpright(): void {
    const yaw = this.getYaw();
    UPRIGHT.setFromEuler(0, yaw, 0);
    this.chassisBody.quaternion.copy(UPRIGHT);
  }

  drive(delta: number, input: CarInput): CarPhysicsState {
    const speed = Math.hypot(this.chassisBody.velocity.x, this.chassisBody.velocity.z);
    const speedSteerScale = THREE.MathUtils.lerp(1, 0.42, Math.min(1, speed / 38));
    const maxSteer = 0.34 * speedSteerScale;
    const targetSteer = -input.steer * maxSteer;
    this.steerSmoothed = THREE.MathUtils.lerp(this.steerSmoothed, targetSteer, Math.min(1, delta * 9));
    this.vehicle.setSteeringValue(this.steerSmoothed, 0);
    this.vehicle.setSteeringValue(this.steerSmoothed, 1);

    const engineBase = -input.throttle * 2800 * this.grip * (input.boost ? 1.32 : 1);
    let engine = engineBase;
    let brake = input.brake * 220 + (input.handbrake ? 120 : 0);

    if (input.brake > 0 && !input.handbrake) {
      const heading = this.getYaw();
      const vel = this.chassisBody.velocity;
      const forwardVel = vel.x * Math.sin(heading) + vel.z * Math.cos(heading);

      if (forwardVel > 1.6) {
        brake = input.brake * 220;
      } else if (forwardVel < -0.5) {
        brake = input.brake * 70;
        engine = input.brake * 1500 * this.grip;
      } else {
        const coastingForward = forwardVel > 0.35;
        brake = coastingForward ? input.brake * 200 : 0;
        if (!coastingForward) {
          engine = input.brake * 1600 * this.grip;
        }
      }
    }

    for (let i = 0; i < 4; i += 1) {
      const isRear = i >= 2;
      this.vehicle.applyEngineForce(isRear ? engine : 0, i);
      this.vehicle.setBrake(brake, i);
      if (input.handbrake && isRear) {
        this.vehicle.wheelInfos[i].frictionSlip = 0.42;
      }
    }

    if (!input.handbrake) {
      const slip = 1.05 + this.grip * 0.55;
      for (let i = 0; i < 4; i += 1) {
        this.vehicle.wheelInfos[i].frictionSlip = slip;
      }
    }

    return this.readState(0);
  }

  finalizeFrame(delta: number): CarPhysicsState {
    const speed = Math.hypot(this.chassisBody.velocity.x, this.chassisBody.velocity.z);
    const uprightStrength = THREE.MathUtils.lerp(0.28, 0.08, Math.min(1, speed / 24));
    this.enforceUpright(uprightStrength);
    this.clampVerticalVelocity();
    if (this.boundary && speed > 6) {
      this.boundary.enforce(this.chassisBody);
    }
    this.lastState = this.readState(delta);
    return this.lastState;
  }

  getState(): CarPhysicsState {
    return this.lastState;
  }

  getWheelInfos(): CANNON.WheelInfo[] {
    return this.vehicle.wheelInfos;
  }

  getSteerSmoothed(): number {
    return this.steerSmoothed;
  }

  destroy(world: CANNON.World): void {
    this.vehicle.removeFromWorld(world);
    world.removeBody(this.chassisBody);
  }

  private readState(delta: number): CarPhysicsState {
    const vel = this.chassisBody.velocity;
    const finalSpeed = Math.hypot(vel.x, vel.z);
    const heading = this.getYaw();

    let hitWall = false;
    let onTrack = true;
    if (this.boundary) {
      const boundary = this.boundary.enforce(this.chassisBody);
      if (boundary.hitWall) {
        this.wallHitFeedback = WALL_HIT_FEEDBACK_SECONDS;
      } else if (delta > 0) {
        this.wallHitFeedback = Math.max(0, this.wallHitFeedback - delta);
      }
      hitWall = boundary.hitWall || this.wallHitFeedback > 0;
      onTrack = boundary.onTrack;
    }

    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const lateral = vel.x * forwardZ - vel.z * forwardX;
    const driftAmount = finalSpeed > 4 ? Math.abs(lateral) / Math.max(4, finalSpeed) : 0;

    void delta;
    return {
      position: this.chassisBody.position,
      velocity: vel,
      speed: finalSpeed,
      heading,
      onTrack,
      driftAmount,
      hitWall,
    };
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
        chassisConnectionPointLocal: new CANNON.Vec3(x, 0.08, z),
        suspensionStiffness: 52,
        suspensionRestLength: 0.38,
        maxSuspensionForce: 200000,
        maxSuspensionTravel: 0.22,
        dampingCompression: 7.5,
        dampingRelaxation: 5.8,
        frictionSlip: 1.55,
        rollInfluence: 0.035,
        customSlidingRotationalSpeed: -24,
        useCustomSlidingRotationalSpeed: true,
      });
    }
  }
}
