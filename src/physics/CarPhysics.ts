export type CarInput = {
  steer: number;
  throttle: number;
  brake: number;
  boost: boolean;
  handbrake: boolean;
};

export type CarPhysicsState = {
  position: import('cannon-es').Vec3;
  velocity: import('cannon-es').Vec3;
  speed: number;
  heading: number;
  onTrack: boolean;
  driftAmount: number;
  hitWall: boolean;
};
