import type { Phase, Relic, RouteComparison, RouteStats, RushPreview, SectorConfig, ViewMode } from '../game/types';
import type { MetaData } from '../game/MetaProgress';
import { weaponColorHex } from '../game/weaponProfile';

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
  readonly relicChoices: ReadonlyArray<Relic>;
  readonly message: string;
  readonly muted: boolean;
  readonly routeComparison: RouteComparison | null;
  readonly rushPreview: RushPreview | null;
  readonly rushReadySeconds: number;
  readonly sector: SectorConfig | null;
  readonly runScore: number;
  readonly narrative: string;
  readonly isDaily: boolean;
  readonly runLabel: string;
  readonly meta: MetaData;
  readonly lastUnlockedRelics: ReadonlyArray<string>;
  readonly playerRoute: RouteStats | null;
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
  private readonly relicChoices = this.getElement('#relic-choices');
  private readonly muteButton = this.getElement('#mute-action');
  private readonly viewButton = this.getElement('#view-action');
  private readonly routeTradeoff = this.getElement('#route-tradeoff');
  private readonly sectorLabel = this.getElement('#sector-label');
  private readonly narrativeLine = this.getElement('#narrative-line');
  private readonly metaBest = this.getElement('#meta-best');
  private readonly metaRuns = this.getElement('#meta-runs');
  private readonly metaDaily = this.getElement('#meta-daily');

  update(state: HudState): void {
    const phaseLabel: Record<Phase, string> = {
      build: 'BUILD',
      flow: 'FLOW',
      rush_ready: 'RUSH READY',
      rush: 'RUSH',
      paused: 'PAUSED',
      failed: 'FAILED',
      sector_cleared: 'SECTOR CLEAR',
      relic_pick: 'RELIC PICK',
      run_cleared: 'RUN CLEAR',
    };
    this.phaseValue.textContent = phaseLabel[state.phase];
    this.routeValue.textContent = `${state.flowed.toString().padStart(2, '0')}/${state.targetLength}`;
    this.energyValue.textContent = state.phase === 'flow'
      ? 'OPEN'
      : state.phase === 'rush' || state.phase === 'rush_ready'
        ? String(state.energy)
        : state.flowReady
          ? String(state.energy)
          : 'CLOSED';
    this.comboValue.textContent = `x${state.multiplier.toFixed(2)}`;
    this.healthValue.textContent = String(
      state.phase === 'rush' || state.phase === 'rush_ready' ? state.health : state.leaks,
    );
    this.scoreValue.textContent = String(state.score).padStart(6, '0');
    this.pieceValue.textContent = state.currentPipe;
    this.pieceHelp.textContent = this.pieceHelpText(state);
    this.statusLine.textContent = state.message;
    this.muteButton.textContent = state.muted ? 'SND OFF' : 'SND ON';
    this.viewButton.textContent = state.viewMode === '2d' ? '2.5D VIEW' : '2D VIEW';
    this.queueList.replaceChildren(...state.nextPipes.map((name) => this.createPipeQueueItem(name)));
    this.sectorLabel.textContent = state.sector
      ? `${state.sector.title} · ${state.runLabel} · RUN ${state.runScore}`
      : `${state.runLabel} · RUN ${state.runScore}`;
    this.narrativeLine.textContent = state.narrative;
    this.metaBest.textContent = String(state.meta.bestScore).padStart(6, '0');
    this.metaRuns.textContent = String(state.meta.runsPlayed);
    this.metaDaily.textContent = state.meta.lastDailySeed
      ? `DAILY BEST ${state.meta.lastDailyScore}`
      : '';

    const guide = this.createGuide(state);
    this.guideTitle.textContent = guide.title;
    this.guideText.textContent = guide.text;

    this.relicList.replaceChildren(
      ...state.relics.map((relic) => this.createRelicItem(relic)),
    );

    this.routeTradeoff.textContent = this.formatRouteTradeoff(state);
    this.relicChoices.replaceChildren(
      ...state.relicChoices.map((relic, index) => this.createRelicChoice(relic, index)),
    );
    this.relicChoices.style.display = state.phase === 'relic_pick' ? 'grid' : 'none';
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

  private pieceHelpText(state: HudState): string {
    if (state.phase === 'relic_pick') return 'Press 1/2/3 or tap a relic to continue the run.';
    if (state.phase === 'rush_ready') {
      return 'Enter/FLOW to launch now. Esc cancels and returns to build.';
    }
    if (state.phase === 'rush') {
      return 'WASD strafe. Right-click or stick aim. FAST boosts. Pipes on-route trigger boosts.';
    }
    if (state.phase === 'flow') {
      return 'Keep laying pipes ahead of water. Each leak costs 1 hull layer for Rush.';
    }
    return 'PLACE lays pipe. NEXT skips. Compare short vs loop routes below.';
  }

  private formatRouteTradeoff(state: HudState): string {
    if (!state.routeComparison || !state.playerRoute) return 'YOUR — · SHORT — · LOOP —';
    const yours = state.playerRoute;
    const { shortest, loopPotential } = state.routeComparison;
    return `YOUR ${yours.route.length}p E${yours.energy} x${yours.multiplier.toFixed(2)} | SHORT ${shortest.route.length}p E${shortest.energy} | LOOP ${loopPotential.route.length}p E${loopPotential.energy} x${loopPotential.multiplier.toFixed(2)}`;
  }

  private createPipeQueueItem(name: string): HTMLElement {
    const item = document.createElement('li');
    item.textContent = name;
    return item;
  }

  private createRelicItem(relic: Relic): HTMLElement {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    const description = document.createElement('span');
    name.textContent = relic.name;
    description.textContent = relic.short;
    item.append(name, description);
    return item;
  }

  private createRelicChoice(relic: Relic, index: number): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-action relic-choice';
    button.dataset.action = 'relic';
    button.dataset.relicId = relic.id;
    button.dataset.relicIndex = String(index);
    button.innerHTML = `<strong>${index + 1}. ${relic.name}</strong><span>${relic.short}</span>`;
    return button;
  }

  private createGuide(state: HudState): { title: string; text: string } {
    if (state.phase === 'relic_pick') {
      return {
        title: 'Choose a relic',
        text: 'Pick one upgrade to carry into the next sector. Relics stack for the rest of this run.',
      };
    }

    if (state.phase === 'rush_ready' && state.rushPreview) {
      const color = weaponColorHex(state.rushPreview.weaponElement);
      return {
        title: `Rush preview · ${state.rushPreview.weaponLabel}`,
        text: `● ${state.rushPreview.weaponLabel} (${color}) · Energy ${state.rushPreview.energy}, x${state.rushPreview.multiplier.toFixed(2)}, ${state.rushPreview.boostZones} boost zones, ${state.rushPreview.hullLayers} hull layers, ~${state.rushPreview.rushSeconds}s ride.`,
      };
    }

    if (state.phase === 'build') {
      if (!state.canPlacePiece) {
        return {
          title: 'Move or replace',
          text: 'That cell is locked, flooded, or blocked by terrain. Move the ghost or replace an unflooded pipe.',
        };
      }
      if (state.flowBlocker?.startsWith('NEED')) {
        return {
          title: state.flowBlocker,
          text: 'Route reaches drain but is too short. Build a longer energy loop for stronger Rush.',
        };
      }
      return {
        title: state.flowReady ? 'Ready to open valve' : 'Connect source to drain',
        text: state.flowReady
          ? 'Review the route tradeoff, then press FLOW. Leaks during flow become Rush hull layers.'
          : 'Plan short vs loop routes. Wells must stay on the line. Obstacles block placement.',
      };
    }

    if (state.phase === 'flow') {
      return {
        title: 'Water is moving',
        text: 'Keep placing ahead of the flood. Each leak removes one hull layer from the upcoming Rush.',
      };
    }

    if (state.phase === 'rush') {
      return {
        title: 'Tank rush active',
        text: 'Reservoirs boost, crosses kick sideways, colors change your weapon. Reach the drain intact.',
      };
    }

    if (state.phase === 'sector_cleared') {
      return {
        title: 'Sector cleared',
        text: 'Read the log, then press Enter to continue. Relic pick follows if another sector remains.',
      };
    }

    if (state.phase === 'failed' || state.phase === 'run_cleared') {
      const unlockText = state.lastUnlockedRelics.length > 0
        ? ` UNLOCKED: ${state.lastUnlockedRelics.map((id) => id).join(', ')}`
        : '';
      if (state.phase === 'failed') {
        return {
          title: 'Run over',
          text: `Leak, hull breach, or boss ended the run. Press R/RST to rebuild from sector one.${unlockText}`,
        };
      }
      return {
        title: 'Run complete',
        text: `All sectors cleared. Press R/RST for a new run.${unlockText}`,
      };
    }

    return {
      title: 'Paused',
      text: 'Press P/Esc to resume. V toggles 2D / 2.5D view.',
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
