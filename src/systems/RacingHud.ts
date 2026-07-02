import type { LapSnapshot } from '../systems/LapSystem';
import { RaceMinimap } from '../systems/RaceMinimap';
import { SpeedometerHud } from '../systems/SpeedometerHud';
import type { GeneratedTrack, RacePhase, TrackLayout } from '../track/types';
import type { WeatherPreset } from '../track/types';

export class RacingHud {
  private readonly phaseValue = this.require('#phase-value');
  private readonly lapValue = this.require('#route-value');
  private readonly weatherValue = this.require('#energy-value');
  private readonly speedValue = this.require('#combo-value');
  private readonly bestValue = this.require('#health-value');
  private readonly timeValue = this.require('#score-value');
  private readonly statusLine = this.require('#status-line');
  private readonly trackLabel = this.require('#sector-label');
  private readonly guideTitle = this.require('#guide-title');
  private readonly guideText = this.require('#guide-text');
  private readonly metaBest = this.require('#meta-best');
  private readonly metaRuns = this.require('#meta-runs');
  private readonly muteButton = this.require('#mute-action');
  private readonly minimap: RaceMinimap;
  private readonly speedometer: SpeedometerHud;

  constructor() {
    const minimapCanvas = document.querySelector<HTMLCanvasElement>('#minimap');
    const speedoRoot = document.querySelector<HTMLElement>('#speedometer');
    if (!minimapCanvas || !speedoRoot) throw new Error('Missing dashboard HUD elements');
    this.minimap = new RaceMinimap(minimapCanvas);
    this.speedometer = new SpeedometerHud(speedoRoot);
  }

  setTrack(track: GeneratedTrack): void {
    this.minimap.setTrack(track);
  }

  setMuted(muted: boolean): void {
    this.muteButton.textContent = muted ? 'SND OFF' : 'SND ON';
  }

  render(input: {
    phase: RacePhase;
    trackName: string;
    layout: TrackLayout;
    weather: WeatherPreset;
    drive: LapSnapshot;
    lapTime: number;
    bestLap: number | null;
    totalLaps: number;
    message: string;
    runs: number;
    personalBest: number | null;
    countdown: number;
    carX: number;
    carZ: number;
    heading: number;
  }): void {
    const phaseLabel =
      input.phase === 'countdown'
        ? `GO ${Math.ceil(input.countdown)}`
        : input.phase === 'race'
          ? 'RACE'
          : input.phase === 'finished'
            ? 'FINISH'
            : 'PAUSE';

    this.phaseValue.textContent = phaseLabel;
    this.lapValue.textContent = `${Math.min(input.drive.lap + 1, input.totalLaps)}/${input.totalLaps}`;
    this.weatherValue.textContent = input.weather.label;
    this.speedValue.textContent = `${Math.round(input.drive.speed * 3.6)} KM/H`;
    this.bestValue.textContent = input.bestLap ? this.formatTime(input.bestLap) : '--:--';
    this.timeValue.textContent = this.formatTime(input.lapTime);
    this.statusLine.textContent = input.message;
    this.trackLabel.textContent = `${input.trackName.toUpperCase()} · ${input.layout.toUpperCase()}`;
    this.guideTitle.textContent = '任意赛道 · 任意天气';
    this.guideText.textContent = 'W 油门 · S 刹车 · A/D 转向 · Shift 加速 · 空格 手刹漂移';
    this.metaBest.textContent = input.personalBest ? this.formatTime(input.personalBest) : '--:--';
    this.metaRuns.textContent = String(input.runs);

    this.minimap.render(input.carX, input.carZ, input.heading);
    this.speedometer.render(input.drive.speed);
  }

  private formatTime(seconds: number): string {
    const whole = Math.max(0, seconds);
    const mins = Math.floor(whole / 60);
    const secs = whole - mins * 60;
    return `${String(mins).padStart(2, '0')}:${secs.toFixed(2).padStart(5, '0')}`;
  }

  private require(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
