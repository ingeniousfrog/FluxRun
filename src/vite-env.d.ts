/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  phase: 'ready' | 'countdown' | 'race' | 'finished' | 'paused';
  score: number;
  lap: number;
  totalLaps: number;
  speed: number;
  grip: number;
  onTrack: boolean;
  player: {
    position: { x: number; y: number; z: number };
    heading: number;
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
  trackSeed: number;
  trackLayout: string;
  cameraMode: 'chase' | 'cockpit';
  isDaily: boolean;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
}
