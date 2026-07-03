import type { LapSnapshot } from '../systems/LapSystem';
import { RaceMinimap, type MinimapRacer } from '../systems/RaceMinimap';
import { SpeedometerHud } from '../systems/SpeedometerHud';
import { StartSequenceOverlay } from '../systems/StartSequenceOverlay';
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
  private readonly muteButton = this.require('#mute-action');
  private readonly minimap: RaceMinimap;
  private readonly speedometer: SpeedometerHud;
  private readonly startOverlay: StartSequenceOverlay;

  constructor() {
    const minimapCanvas = document.querySelector<HTMLCanvasElement>('#minimap');
    const speedoRoot = document.querySelector<HTMLElement>('#speedometer');
    if (!minimapCanvas || !speedoRoot) throw new Error('Missing dashboard HUD elements');
    this.minimap = new RaceMinimap(minimapCanvas);
    this.speedometer = new SpeedometerHud(speedoRoot);
    this.startOverlay = new StartSequenceOverlay();
  }

  onRaceGo(callback: () => void): void {
    this.startOverlay.onGo(callback);
  }

  setTrack(track: GeneratedTrack): void {
    this.minimap.setTrack(track);
    this.startOverlay.setTrackName(track.name);
  }

  setMuted(muted: boolean): void {
    this.muteButton.textContent = muted ? 'MUT' : 'SND';
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
    racePosition: number;
    totalRacers: number;
    cameraMode?: 'chase' | 'cockpit';
    opponents: ReadonlyArray<MinimapRacer>;
  }): void {
    const racing = input.phase === 'race' || input.phase === 'finished';
    document.documentElement.classList.toggle('cockpit-view', input.cameraMode === 'cockpit');
    this.phaseValue.textContent = racing
      ? `${input.racePosition}/${input.totalRacers}`
      : input.phase === 'countdown'
        ? String(Math.ceil(input.countdown))
        : input.phase === 'ready'
          ? 'RDY'
          : '--';

    this.lapValue.textContent = `${Math.min(input.drive.lap + 1, input.totalLaps)}/${input.totalLaps}`;
    this.weatherValue.textContent = input.weather.label;
    const kmh = Math.round(input.drive.speed * 3.6);
    this.speedValue.textContent = String(kmh).padStart(3, '0');
    this.bestValue.textContent = input.bestLap ? this.formatTime(input.bestLap) : '--:--';
    this.timeValue.textContent = this.formatTime(input.lapTime);
    this.statusLine.textContent = input.message;
    this.trackLabel.textContent = input.trackName.toUpperCase();

    this.startOverlay.update(input.phase, input.countdown);
    this.minimap.render(input.carX, input.carZ, input.heading, input.opponents);
    this.speedometer.render(input.drive.speed);

    void input.layout;
    void input.runs;
    void input.personalBest;
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
