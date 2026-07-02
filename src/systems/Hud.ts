import type { Phase, Relic, RouteStats } from '../game/types';

export type HudState = {
  readonly phase: Phase;
  readonly route: RouteStats;
  readonly score: number;
  readonly chain: number;
  readonly health: number;
  readonly wave: number;
  readonly pieceName: string;
  readonly relics: ReadonlyArray<Relic>;
  readonly message: string;
  readonly muted: boolean;
};

export class Hud {
  private readonly phaseValue = this.getElement('#phase-value');
  private readonly routeValue = this.getElement('#route-value');
  private readonly energyValue = this.getElement('#energy-value');
  private readonly comboValue = this.getElement('#combo-value');
  private readonly healthValue = this.getElement('#health-value');
  private readonly scoreValue = this.getElement('#score-value');
  private readonly pieceValue = this.getElement('#piece-value');
  private readonly statusLine = this.getElement('#status-line');
  private readonly relicList = this.getElement('#relic-list');
  private readonly muteButton = this.getElement('#mute-action');

  update(state: HudState): void {
    this.phaseValue.textContent = state.phase.toUpperCase();
    this.routeValue.textContent = state.route.route.length.toString().padStart(2, '0');
    this.energyValue.textContent = String(state.route.energy);
    this.comboValue.textContent = `x${state.route.multiplier.toFixed(2)} / ${state.chain}`;
    this.healthValue.textContent = String(state.health).padStart(2, '0');
    this.scoreValue.textContent = String(state.score).padStart(6, '0');
    this.pieceValue.textContent = state.pieceName;
    this.statusLine.textContent = state.message;
    this.muteButton.textContent = state.muted ? 'SND OFF' : 'SND ON';

    this.relicList.replaceChildren(
      ...state.relics.map((relic) => {
        const item = document.createElement('li');
        const name = document.createElement('strong');
        const description = document.createElement('span');
        name.textContent = relic.name;
        description.textContent = relic.short;
        item.append(name, description);
        return item;
      }),
    );
  }

  flashStatus(kind: 'place' | 'combo' | 'hit' | 'rush'): void {
    const color = {
      place: '#42d9ff',
      combo: '#9cf15f',
      hit: '#ff5e7b',
      rush: '#ffbd4a',
    }[kind];
    this.statusLine.animate(
      [
        { transform: 'translateY(0)', borderLeftColor: color },
        { transform: 'translateY(-4px)', borderLeftColor: '#f8f3e2' },
        { transform: 'translateY(0)', borderLeftColor: color },
      ],
      { duration: 260, easing: 'ease-out' },
    );
  }

  flashPickup(): void {
    this.flashStatus('combo');
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
