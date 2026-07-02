import type { Phase, Relic, ViewMode } from '../game/types';

export type HudState = {
  readonly phase: Phase;
  readonly viewMode: ViewMode;
  readonly flowed: number;
  readonly targetLength: number;
  readonly flowReady: boolean;
  readonly score: number;
  readonly leaks: number;
  readonly health: number;
  readonly energy: number;
  readonly multiplier: number;
  readonly currentPipe: string;
  readonly nextPipes: ReadonlyArray<string>;
  readonly canPlacePiece: boolean;
  readonly flowBlocker: string | null;
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
  private readonly pieceHelp = this.getElement('#piece-help');
  private readonly queueList = this.getElement('#pipe-queue');
  private readonly statusLine = this.getElement('#status-line');
  private readonly guideTitle = this.getElement('#guide-title');
  private readonly guideText = this.getElement('#guide-text');
  private readonly relicList = this.getElement('#relic-list');
  private readonly muteButton = this.getElement('#mute-action');
  private readonly viewButton = this.getElement('#view-action');

  update(state: HudState): void {
    const phaseLabel: Record<Phase, string> = {
      build: 'BUILD',
      flow: 'FLOW',
      rush: 'RUSH',
      paused: 'PAUSED',
      failed: 'FAILED',
      cleared: 'CLEARED',
    };
    this.phaseValue.textContent = phaseLabel[state.phase];
    this.routeValue.textContent = `${state.flowed.toString().padStart(2, '0')}/${state.targetLength}`;
    this.energyValue.textContent = state.phase === 'flow'
      ? 'OPEN'
      : state.phase === 'rush'
        ? String(state.energy)
        : state.flowReady
          ? String(state.energy)
          : 'CLOSED';
    this.comboValue.textContent = `x${state.multiplier.toFixed(2)}`;
    this.healthValue.textContent = String(state.phase === 'rush' ? state.health : state.leaks);
    this.scoreValue.textContent = String(state.score).padStart(6, '0');
    this.pieceValue.textContent = state.currentPipe;
    this.pieceHelp.textContent = state.phase === 'rush'
      ? 'Strafe with WASD. FAST boosts speed. Auto-fire chains kills.'
      : state.phase === 'flow'
        ? 'Keep laying pipes ahead of the water. Space/FAST speeds pressure.'
        : 'PLACE lays this pipe. NEXT skips to another.';
    this.statusLine.textContent = state.message;
    this.muteButton.textContent = state.muted ? 'SND OFF' : 'SND ON';
    this.viewButton.textContent = state.viewMode === '2d' ? '2.5D VIEW' : '2D VIEW';
    this.queueList.replaceChildren(...state.nextPipes.map((name) => this.createPipeQueueItem(name)));

    const guide = this.createGuide(state);
    this.guideTitle.textContent = guide.title;
    this.guideText.textContent = guide.text;

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

  private createPipeQueueItem(name: string): HTMLElement {
    const item = document.createElement('li');
    item.textContent = name;
    return item;
  }

  private createGuide(state: HudState): { title: string; text: string } {
    if (state.phase === 'build') {
      if (!state.canPlacePiece) {
        return {
          title: 'Move or replace',
          text: 'That cell is locked or already flooded. Move the ghost, or replace an unflooded pipe for a score penalty.',
        };
      }
      if (state.flowBlocker?.startsWith('NEED')) {
        return {
          title: state.flowBlocker,
          text: 'The route reaches the drain, but it is too short for this board. Add a longer loop, then press FLOW.',
        };
      }
      return {
        title: state.flowReady ? 'Ready to open valve' : 'Connect source to drain',
        text: state.flowReady
          ? 'The route is sealed. Press Enter/FLOW when you want to release water.'
          : 'Build at your pace. Water stays closed until the route reaches the drain and you press FLOW.',
      };
    }

    if (state.phase === 'flow') {
      return {
        title: 'Water is moving',
        text: 'Keep placing pipes ahead of the blue water. Flooded pipes are locked. Seal the route to launch the tank rush.',
      };
    }

    if (state.phase === 'rush') {
      return {
        title: 'Tank rush active',
        text: 'Ride your sealed energy loop, strafe through turrets and drones, and reach the drain with hull integrity intact.',
      };
    }

    if (state.phase === 'cleared') {
      return {
        title: 'Drain reached',
        text: 'Press R/RST to start a fresh board. Longer routes, color chains, and combos raise energy and score.',
      };
    }

    if (state.phase === 'failed') {
      return {
        title: 'Run over',
        text: 'A leak, hull breach, or short route ended the run. Press R/RST and rebuild the circuit.',
      };
    }

    return {
      title: 'Paused',
      text: 'Press P/Esc again to resume. V switches between 2D and 2.5D view.',
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
