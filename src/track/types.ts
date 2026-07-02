import type * as THREE from 'three';

export type WeatherType = 'clear' | 'rain' | 'fog' | 'storm' | 'snow';

export type WeatherPreset = {
  readonly type: WeatherType;
  readonly label: string;
  readonly grip: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly rainIntensity: number;
  readonly exposure: number;
  readonly sky: string;
  readonly skyBottom?: string;
  readonly ambient: string;
};

export type TrackLayout = 'oval' | 'circuit' | 'technical';

export type TrackSample = {
  readonly s: number;
  readonly t: number;
  readonly position: THREE.Vector3;
  readonly tangent: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly halfWidth: number;
};

export type GeneratedTrack = {
  readonly seed: number;
  readonly name: string;
  readonly layout: TrackLayout;
  readonly controlPoints: ReadonlyArray<THREE.Vector3>;
  readonly samples: ReadonlyArray<TrackSample>;
  readonly length: number;
  readonly width: number;
  readonly difficulty: number;
};

export type RacePhase = 'countdown' | 'race' | 'finished' | 'paused';
