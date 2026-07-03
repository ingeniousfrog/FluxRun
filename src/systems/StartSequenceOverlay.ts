import type { RacePhase } from '../track/types';

export class StartSequenceOverlay {
  private readonly overlay: HTMLElement;
  private readonly readyPanel: HTMLElement;
  private readonly lightsPanel: HTMLElement;
  private readonly lights: HTMLElement[];
  private readonly countdownDigit: HTMLElement;
  private readonly goButton: HTMLButtonElement;
  private readonly trackTitle: HTMLElement;
  private onGoCallback: (() => void) | null = null;

  constructor() {
    this.overlay = this.require('#race-start-overlay');
    this.readyPanel = this.require('#ready-panel');
    this.lightsPanel = this.require('#lights-panel');
    this.lights = Array.from(document.querySelectorAll<HTMLElement>('#lights-panel .start-light'));
    this.countdownDigit = this.require('#countdown-digit');
    this.goButton = document.querySelector<HTMLButtonElement>('#go-button')!;
    this.trackTitle = this.require('#ready-track-name');
    if (!this.goButton) throw new Error('Missing #go-button');

    this.goButton.addEventListener('click', () => {
      this.onGoCallback?.();
    });
  }

  onGo(callback: () => void): void {
    this.onGoCallback = callback;
  }

  setTrackName(name: string): void {
    this.trackTitle.textContent = name;
  }

  update(phase: RacePhase, countdown: number): void {
    if (phase === 'ready') {
      this.overlay.classList.remove('hidden');
      this.readyPanel.classList.remove('hidden');
      this.lightsPanel.classList.add('hidden');
      this.countdownDigit.classList.add('hidden');
      this.countdownDigit.textContent = '';
      return;
    }

    if (phase === 'countdown') {
      this.overlay.classList.remove('hidden');
      this.readyPanel.classList.add('hidden');
      this.lightsPanel.classList.remove('hidden');
      this.countdownDigit.classList.remove('hidden');

      const step = Math.ceil(countdown);
      for (let i = 0; i < this.lights.length; i += 1) {
        const on = i < step;
        this.lights[i].classList.toggle('on', on);
        this.lights[i].classList.toggle('yellow', step === 1 && on);
      }

      if (countdown <= 0.15) {
        for (const light of this.lights) {
          light.classList.remove('on', 'yellow');
          light.classList.add('go');
        }
        this.countdownDigit.textContent = 'GO!';
        this.countdownDigit.classList.add('go-text');
      } else {
        for (const light of this.lights) light.classList.remove('go');
        this.countdownDigit.textContent = String(step);
        this.countdownDigit.classList.remove('go-text');
      }
      return;
    }

    this.overlay.classList.add('hidden');
    this.readyPanel.classList.add('hidden');
    this.lightsPanel.classList.add('hidden');
    this.countdownDigit.classList.add('hidden');
    for (const light of this.lights) {
      light.classList.remove('on', 'yellow', 'go');
    }
  }

  private require(selector: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Missing overlay element: ${selector}`);
    return el;
  }
}
