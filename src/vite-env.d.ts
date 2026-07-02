/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  phase: 'build' | 'flow' | 'paused' | 'failed' | 'cleared';
  score: number;
  routeLength: number;
  routeEnergy: number;
  multiplier: number;
  health: number;
  enemies: number;
  projectiles: number;
  board: {
    occupied: number;
    cols: number;
    rows: number;
  };
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
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
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
}
