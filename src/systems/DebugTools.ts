import GUI from 'lil-gui';

export type DebugTuning = {
  rushSpeed: number;
  boostMultiplier: number;
  strafeSpeed: number;
  fireRate: number;
  cameraLag: number;
  exposure: number;
  maxDpr: number;
};

export class DebugTools {
  private gui: GUI | null = null;

  constructor(tuning: DebugTuning, onChange: () => void) {
    const enabled = new URLSearchParams(window.location.search).has('debug');
    if (!enabled) return;

    this.gui = new GUI({ title: 'Game tuning' });
    this.gui.add(tuning, 'rushSpeed', 1.5, 8, 0.1);
    this.gui.add(tuning, 'boostMultiplier', 1, 2.4, 0.05);
    this.gui.add(tuning, 'strafeSpeed', 0.8, 5, 0.1);
    this.gui.add(tuning, 'fireRate', 2, 10, 0.25);
    this.gui.add(tuning, 'cameraLag', 0.02, 0.8, 0.01);
    this.gui.add(tuning, 'maxDpr', 1, 2, 0.25).onChange(onChange);
    this.gui.add(tuning, 'exposure', 0.6, 1.8, 0.01).onChange(onChange);
  }

  dispose(): void {
    this.gui?.destroy();
    this.gui = null;
  }
}
