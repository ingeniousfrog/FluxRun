import * as THREE from 'three';
import { MaterialLibrary } from '../assets/MaterialLibrary';
import { createWorldKit } from '../assets/modelFactories';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { boardPassesWellRequirement, createSectorConfig, generateSectorBoard } from '../game/BoardGenerator';
import { dailySeed, seedToNumber } from '../game/DailyChallenge';
import { loadMeta, recordDailyScore, recordRunResult, saveMeta } from '../game/MetaProgress';
import { RUN_FAILURE_LOG, RUN_VICTORY_LOG } from '../game/narrative';
import { addRelicToRun, advanceSector, createRunState, isRunComplete, needsRelicPick, type RunState } from '../game/RunState';
import { computeModifiers, hasRelic, pickRelicChoices, relicById } from '../game/relics';
import { deriveWeaponProfile } from '../game/weaponProfile';
import { AudioSystem } from '../systems/AudioSystem';
import { BoardView } from '../systems/BoardView';
import { CameraRig } from '../systems/CameraRig';
import { CombatSystem } from '../systems/CombatSystem';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { FlowSystem } from '../systems/FlowSystem';
import { Hud } from '../systems/Hud';
import { RushSystem } from '../systems/RushSystem';
import { VfxSystem } from '../systems/VfxSystem';
import {
  BUILD_REPEAT_SECONDS,
  TARGET_PIPE_LENGTH,
} from './constants';
import {
  boardDrain,
  boardSource,
  boardToWorld,
  clampCursor,
  compareRoutes,
  createPiece,
  createStraightPiece,
  getCell,
  getPieceCells,
  isPlaceableCell,
  placePiece,
  replacePiece,
  resolveMatches,
  rotatePiece,
  traceFlow,
} from './pipes';
import type {
  Board,
  BoardPoint,
  Phase,
  Piece,
  Relic,
  RouteComparison,
  RouteStats,
  RushPreview,
  SectorConfig,
  ViewMode,
} from './types';

type PhaseBeforePause = Exclude<Phase, 'paused'>;

function emptyRouteStats(): RouteStats {
  return {
    route: [],
    energy: 0,
    multiplier: 1,
    boosters: 0,
    reflectors: 0,
    colors: 0,
    levelSum: 0,
    complete: false,
    estimatedRushSeconds: 0,
  };
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 90);
  private readonly materials = new MaterialLibrary();
  private readonly boardView = new BoardView(this.materials);
  private readonly vfx = new VfxSystem();
  private readonly flow = new FlowSystem();
  private readonly rush = new RushSystem(this.materials);
  private readonly combat = new CombatSystem(this.materials);
  private readonly input: InputController;
  private readonly audio = new AudioSystem();
  private readonly hud = new Hud();
  private readonly cameraRig = new CameraRig(this.camera, new THREE.Vector3(0, 10.6, 11.1));
  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private readonly tuning: DebugTuning = {
    rushSpeed: 2.55,
    boostMultiplier: 1.62,
    strafeSpeed: 2.6,
    fireRate: 5.2,
    cameraLag: 0.13,
    exposure: 1.12,
    maxDpr: 1.75,
  };

  private readonly debugTools: DebugTools;
  private readonly movement = new THREE.Vector2();
  private readonly strafeInput = new THREE.Vector2();

  private board!: Board;
  private sector!: SectorConfig;
  private run!: RunState;
  private meta = loadMeta();
  private pipeQueue: Piece[] = [];
  private pieceSequence = 0;
  private cursor: BoardPoint = { x: 1, y: 5 };
  private phase: Phase = 'build';
  private phaseBeforePause: PhaseBeforePause = 'build';
  private viewMode: ViewMode = '2d';
  private routeStats: RouteStats = emptyRouteStats();
  private routeComparison: RouteComparison = { shortest: emptyRouteStats(), energyLoop: emptyRouteStats() };
  private relicChoices: Relic[] = [];
  private frame = 0;
  private elapsed = 0;
  private buildRepeat = 0;
  private score = 0;
  private leaks = 3;
  private message = 'BUILD, THEN OPEN VALVE';
  private muted = false;
  private rushReadyTimer = 0;
  private narrative = '';
  private multiplierPenalty = 0;
  private rngState = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.run = createRunState(seedToNumber(dailySeed()), true);
    this.sector = createSectorConfig(0, this.run.runSeed);
    this.board = generateSectorBoard(this.sector);
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;

    const stick = this.getElement('#touch-stick');
    const knob = this.getElement('#touch-knob');
    const boostButton = this.getElement('#boost-button');
    const actionButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-action]'));
    this.input = new InputController(stick, knob, boostButton, actionButtons, canvas);
    this.wireRelicButtons();

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    });

    this.createScene();
    this.cameraRig.setMode(this.viewMode);
    this.startNewRun(this.run.runSeed, this.run.isDaily);
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
    this.boardView.dispose();
    this.combat.dispose();
    this.vfx.dispose();
    this.materials.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
  }

  private get modifiers() {
    return computeModifiers(this.run.selectedRelics);
  }

  private get currentPiece(): Piece {
    return this.pipeQueue[0];
  }

  private get weaponProfile() {
    return deriveWeaponProfile(this.routeStats);
  }

  private update(delta: number, elapsed: number): void {
    this.frame += 1;
    this.elapsed = elapsed;
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.handleGlobalInput();

    if (this.phase === 'paused') {
      this.updateHud();
      this.publishDiagnostics();
      return;
    }

    if (this.phase === 'rush_ready') {
      this.updateRushReady(delta);
    }

    if (this.phase === 'build' || this.phase === 'flow') {
      this.updatePipePlacement(delta);
    }

    if (this.phase === 'flow') {
      this.updateFlow(delta);
    }

    if (this.phase === 'rush') {
      this.updateRush(delta);
    }

    const cameraTarget = this.phase === 'rush'
      ? this.rush.getCameraTarget()
      : new THREE.Vector3(0, 0, 0);
    const cameraLag = this.phase === 'failed' || this.phase === 'cleared' || this.phase === 'run_cleared'
      ? this.tuning.cameraLag * 1.4
      : this.phase === 'rush'
        ? this.tuning.cameraLag
        : this.tuning.cameraLag * 2;
    this.cameraRig.update(delta, cameraTarget, cameraLag);

    this.vfx.update(delta);
    this.updateHud();
    this.publishDiagnostics();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private createScene(): void {
    this.scene.background = new THREE.Color('#080d12');
    this.scene.fog = new THREE.Fog('#080d12', 30, 92);

    const ambient = new THREE.HemisphereLight('#c7f8ff', '#14202a', 1.7);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight('#fff1d2', 2.4);
    key.position.set(-4, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#73f6ff', 1.1);
    rim.position.set(5, 4, -5);
    this.scene.add(rim);

    this.scene.add(createWorldKit(this.materials));
    this.scene.add(this.boardView.group);
    this.scene.add(this.rush.tank.group);
    this.scene.add(this.combat.group);
    this.scene.add(this.vfx.group);
  }

  private wireRelicButtons(): void {
    document.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement;
      const relicId = target.closest<HTMLElement>('[data-relic-id]')?.dataset.relicId;
      if (relicId && this.phase === 'relic_pick') {
        const index = Number(target.closest<HTMLElement>('[data-relic-index]')?.dataset.relicIndex ?? 0);
        const relic = this.relicChoices[index];
        if (relic) this.pickRelic(relic.id);
      }
    });
  }

  private handleGlobalInput(): void {
    if (this.input.consumeMute()) {
      this.muted = this.audio.toggleMuted();
      this.message = this.muted ? 'AUDIO MUTED' : 'AUDIO ONLINE';
    }

    if (this.input.consumeViewToggle()) {
      this.viewMode = this.viewMode === '2d' ? '2.5d' : '2d';
      this.cameraRig.setMode(this.viewMode);
      this.cameraRig.snapTo(this.phase === 'rush' ? this.rush.getCameraTarget() : new THREE.Vector3(0, 0, 0));
      this.message = this.viewMode === '2d' ? '2D TOP VIEW' : '2.5D ANGLED VIEW';
    }

    if (this.input.consumePause()) {
      if (this.phase === 'paused') {
        this.phase = this.phaseBeforePause;
        if (this.phase === 'flow' || this.phase === 'rush') this.audio.setPhaseAmbience(this.phase);
        this.message = this.phase === 'rush' ? 'RUSH RESUMED' : this.phase === 'flow' ? 'FLOW RESUMED' : 'BUILD RESUMED';
      } else if (this.phase !== 'relic_pick') {
        this.phaseBeforePause = this.phase as PhaseBeforePause;
        this.phase = 'paused';
        this.audio.stopAmbience();
        this.message = 'PAUSED';
      }
    }

    if (this.phase === 'relic_pick') {
      const slot = this.input.consumeRelicPickSlot();
      if (slot !== null && this.relicChoices[slot]) {
        this.pickRelic(this.relicChoices[slot].id);
      }
    }

    if (this.input.consumeRestart()) {
      this.startNewRun(seedToNumber(dailySeed()), true);
    }
  }

  private pickRelic(relicId: string): void {
    const relic = this.relicChoices.find((item) => item.id === relicId) ?? relicById(relicId);
    if (!relic) return;
    this.run = addRelicToRun(this.run, relic);
    this.relicChoices = [];
    this.beginSector(this.run.sectorIndex);
  }

  private updateRushReady(delta: number): void {
    this.rushReadyTimer -= delta;
    if (this.input.consumeRush()) {
      this.launchRush();
      return;
    }
    if (this.rushReadyTimer <= 0) {
      this.launchRush();
    }
  }

  private updatePipePlacement(delta: number): void {
    this.buildRepeat = Math.max(0, this.buildRepeat - delta);
    const move = this.input.consumeBuildMove();
    const stick = this.input.readMovement(this.movement);
    const stickMove = this.buildRepeat <= 0 && stick.lengthSq() > 0.45
      ? new THREE.Vector2(Math.round(stick.x), Math.round(stick.y))
      : new THREE.Vector2();
    const buildMove = move.lengthSq() ? move : stickMove;

    if (buildMove.lengthSq()) {
      this.cursor = clampCursor({ x: this.cursor.x + buildMove.x, y: this.cursor.y + buildMove.y });
      this.buildRepeat = BUILD_REPEAT_SECONDS;
      this.refreshBoardView();
    }

    if (this.input.consumeRotateClockwise()) {
      this.pipeQueue = [rotatePiece(this.currentPiece, true), ...this.pipeQueue.slice(1)];
      this.audio.rotate();
      this.hud.flashStatus('place');
      this.refreshBoardView();
    }

    if (this.input.consumeRotateCounterClockwise()) {
      this.pipeQueue = [rotatePiece(this.currentPiece, false), ...this.pipeQueue.slice(1)];
      this.audio.rotate();
      this.hud.flashStatus('place');
      this.refreshBoardView();
    }

    if (this.input.consumePlace() && this.phase === 'build') {
      this.placeCurrentPipe();
    }

    if (this.input.consumePlace() && this.phase === 'flow' && !this.input.isDashHeld()) {
      this.placeCurrentPipe();
    }

    if (this.input.consumeNextPiece()) {
      this.skipCurrentPipe();
    }

    if (this.input.consumeRush() && this.phase === 'build') {
      this.startFlow();
    }
  }

  private placeCurrentPipe(): void {
    if (!this.canPlaceOrReplaceCurrent()) {
      this.message = 'CANNOT PLACE THERE';
      this.hud.flashStatus('hit');
      this.audio.hit();
      return;
    }

    const existing = getPieceCells(this.currentPiece, this.cursor).some(({ x, y }) => Boolean(getCell(this.board, x, y)));
    const flooded = this.getFloodedSet();
    const placement = existing
      ? replacePiece(this.board, this.currentPiece, this.cursor, flooded)
      : placePiece(this.board, this.currentPiece, this.cursor);
    if (!placement.placed.length) {
      this.message = 'PIPE LOCKED';
      this.hud.flashStatus('hit');
      this.audio.hit();
      return;
    }

    const matchResult = resolveMatches(placement.board);
    this.board = matchResult.board;
    const chainBonus = hasRelic(this.run.selectedRelics, 'color-amp') ? 30 : 20;
    if (matchResult.upgraded > 0) {
      this.score += matchResult.upgraded * chainBonus;
      this.message = `CHAIN +${matchResult.upgraded}`;
      this.hud.flashStatus('combo');
      this.audio.pickup(matchResult.upgraded);
    } else {
      this.score += existing ? -this.modifiers.replacePenalty : this.modifiers.placeBonus;
      this.message = existing ? `REPLACED -${this.modifiers.replacePenalty}` : 'PIPE PLACED';
      this.hud.flashStatus(existing ? 'hit' : 'place');
    }
    this.audio.place();
    for (const placed of placement.placed) {
      this.vfx.spawnRing(boardToWorld(placed, 0.34), existing ? '#ffbd4a' : '#42d9ff');
    }
    this.advancePipeQueue();
    this.refreshRouteStats();
    if (this.phase === 'flow') {
      this.flow.refreshTrace(this.board);
    }
    this.refreshBoardView();
  }

  private skipCurrentPipe(): void {
    this.score -= this.modifiers.skipPenalty;
    this.message = this.modifiers.skipPenalty > 0 ? `SKIPPED PIPE -${this.modifiers.skipPenalty}` : 'SKIPPED PIPE';
    this.advancePipeQueue();
    this.audio.rotate();
    this.refreshBoardView();
    this.hud.flashStatus('place');
  }

  private startFlow(): void {
    if (this.phase === 'failed' || this.phase === 'cleared' || this.phase === 'run_cleared') {
      this.startNewRun(seedToNumber(dailySeed()), true);
      return;
    }

    this.refreshRouteStats();
    const blocker = this.getFlowStartBlocker();
    if (blocker) {
      this.message = blocker;
      this.audio.hit();
      this.hud.flashStatus('hit');
      this.refreshBoardView();
      return;
    }

    if (this.phase !== 'flow') {
      const trace = this.traceBoard();
      this.phase = 'flow';
      this.flow.startFlow(trace);
      this.message = 'WATER FLOWING';
      this.audio.valveOpen();
      this.audio.setPhaseAmbience('flow');
      this.hud.flashStatus('rush');
      this.refreshBoardView();
    }
  }

  private updateFlow(delta: number): void {
    const flowSpeed = this.modifiers.flowSpeedMultiplier;
    const result = this.flow.update(delta, this.board, this.input.isDashHeld(), TARGET_PIPE_LENGTH, flowSpeed);

    if (result.kind === 'flowing') {
      if (result.newCells.length > 0) {
        this.score += result.newCells.length * 15;
        this.audio.pickup(result.newCells.length);
        for (const point of result.newCells) {
          this.vfx.spawnRing(boardToWorld(point, 0.38), '#74e7ff');
        }
      }
      this.refreshBoardView();
      return;
    }

    if (result.kind === 'rush_ready') {
      this.enterRushReady();
      return;
    }

    if (result.kind === 'failed') {
      this.failBoard(result.reason);
      return;
    }

    if (this.modifiers.leakIgnoresHp) {
      this.multiplierPenalty += this.modifiers.leakMultiplierPenalty;
      this.message = `${result.reason} · MULT -${Math.round(this.modifiers.leakMultiplierPenalty * 100)}%`;
    } else {
      this.leaks -= 1;
      this.message = `${result.reason} · HULL -1`;
    }
    this.audio.fail();
    this.hud.flashStatus('hit');
    if (!this.modifiers.leakIgnoresHp && this.leaks <= 0) {
      this.failBoard(this.message);
    } else {
      this.flow.onLeakSurvived();
    }
    this.refreshBoardView();
  }

  private enterRushReady(): void {
    this.phase = 'rush_ready';
    this.rushReadyTimer = 2;
    this.refreshRouteStats();
    const preview = this.buildRushPreview();
    this.message = `RUSH IN ${this.rushReadyTimer.toFixed(1)}s · ${preview.weaponLabel}`;
    this.audio.rush();
    this.hud.flashStatus('rush');
    this.refreshBoardView();
  }

  private launchRush(): void {
    const route = this.flow.sealedRoute.length > 0 ? this.flow.sealedRoute : this.routeStats.route;
    this.phase = 'rush';
    this.rush.start(route);
    let hull = Math.max(1, this.leaks);
    if (hasRelic(this.run.selectedRelics, 'hull-plate')) hull += 1;
    this.combat.start(hull, route, this.sector.isBoss);
    this.message = 'TANK RUSH';
    this.audio.setPhaseAmbience('rush');
    this.hud.flashStatus('rush');
    this.refreshBoardView();
  }

  private updateRush(delta: number): void {
    const strafe = this.input.readMovement(this.strafeInput);
    const effectiveMultiplier = Math.max(0.5, this.routeStats.multiplier - this.multiplierPenalty);
    const cellEvents = this.rush.update(
      delta,
      this.board,
      new THREE.Vector2(strafe.x, 0),
      this.input.isDashHeld(),
      this.tuning,
      effectiveMultiplier,
      this.modifiers,
    );

    for (const event of cellEvents) {
      if (event.kind === 'reservoir') {
        this.vfx.spawnTrail(event.world, '#42d9ff');
        this.vfx.spawnRing(event.world, '#42d9ff');
        this.audio.reservoirBoost();
        if (this.modifiers.reservoirHeal > 0) {
          this.combat.health = Math.min(this.combat.maxHealth, this.combat.health + this.modifiers.reservoirHeal);
        }
      }
      if (event.kind === 'cross') {
        this.vfx.spawnBurst(event.world, '#ff5ec8', 8);
      }
      if (event.kind === 'oneWay') {
        this.vfx.spawnRing(event.world, '#ffbd4a');
      }
    }

    const aim = this.input.readAimDirection(this.rush.getTankPosition(), this.camera);
    this.combat.update(
      delta,
      this.elapsed,
      this.rush.getTankPosition(),
      this.rush.getTankForward(),
      aim,
      this.rush.route,
      this.rush.routeProgress,
      this.board,
      this.tuning,
      this.routeStats,
      this.weaponProfile,
      this.modifiers,
      this.sector.isBoss,
      (killScore) => {
        let bonus = killScore;
        if (hasRelic(this.run.selectedRelics, 'energy-siphon')) bonus += 5;
        this.score += bonus;
        this.run.runScore += bonus;
        this.hud.flashStatus('combo');
        this.audio.pickup(1);
        this.vfx.spawnBurst(this.rush.getTankPosition(), '#9cf15f', 5);
      },
      () => {
        this.audio.hit();
        this.hud.flashStatus('hit');
        this.rush.pulseDamage();
        this.vfx.spawnBurst(this.rush.getTankPosition(), '#ff5e7b', 6);
      },
      () => {
        this.audio.shot();
      },
      () => {
        this.vfx.spawnBurst(this.rush.getTankPosition(), '#ffbd4a', 16);
      },
    );

    if (this.sector.isBoss && !this.combat.bossDefeated && this.rush.routeProgress > this.rush.route.length * 0.9) {
      // wait for boss kill near end
    }

    if (this.rush.reachedDrain && (!this.sector.isBoss || this.combat.bossDefeated)) {
      this.clearBoard();
      return;
    }

    if (this.combat.health <= 0) {
      this.failBoard('HULL DESTROYED');
    }
  }

  private clearBoard(): void {
    const energyBonus = Math.round(this.routeStats.energy * this.routeStats.multiplier);
    const sectorBonus = 500 + energyBonus + Math.max(0, this.flow.flowedPath.length - TARGET_PIPE_LENGTH) * 35 + this.combat.health * 75;
    let bonus = sectorBonus;
    if (this.run.isDaily && hasRelic(this.run.selectedRelics, 'daily-spark')) bonus += 100;
    this.score += bonus;
    this.run.runScore += bonus;

    const nextRun = advanceSector(this.run);
    this.run = nextRun;

    if (isRunComplete(nextRun)) {
      this.phase = 'run_cleared';
      this.message = 'RUN COMPLETE';
      this.narrative = RUN_VICTORY_LOG;
      this.meta = recordRunResult(this.meta, this.run.runScore, this.run.sectorIndex, []);
      if (this.run.isDaily) this.meta = recordDailyScore(this.meta, dailySeed(), this.run.runScore);
      saveMeta(this.meta);
      this.audio.cleared();
      this.audio.stopAmbience();
      const endPoint = this.rush.route[this.rush.route.length - 1]
        ?? this.flow.flowedPath[this.flow.flowedPath.length - 1]
        ?? boardDrain(this.board);
      this.vfx.spawnRing(boardToWorld(endPoint, 0.42), '#9cf15f');
      this.rush.reset();
      this.combat.reset();
      return;
    }

    this.phase = 'sector_cleared';
    this.message = 'SECTOR CLEARED';
    this.audio.cleared();
    this.audio.stopAmbience();
    const endPoint = this.rush.route[this.rush.route.length - 1]
      ?? this.flow.flowedPath[this.flow.flowedPath.length - 1]
      ?? boardDrain(this.board);
    this.vfx.spawnRing(boardToWorld(endPoint, 0.42), '#9cf15f');
    this.rush.reset();
    this.combat.reset();

    if (needsRelicPick(this.run)) {
      this.openRelicPick();
      return;
    }
    this.beginSector(this.run.sectorIndex);
  }

  private openRelicPick(): void {
    this.phase = 'relic_pick';
    this.rush.reset();
    this.combat.reset();
    this.flow.reset();
    this.relicChoices = pickRelicChoices(
      this.meta.unlockedRelicIds,
      this.meta.runsPlayed,
      3,
      new Set(this.run.selectedRelics.map((relic) => relic.id)),
      () => this.random(),
    );
    this.message = 'PICK A RELIC';
    this.narrative = this.sector.narrative;
    this.audio.setPhaseAmbience('menu');
  }

  private beginSector(sectorIndex: number): void {
    this.sector = createSectorConfig(sectorIndex, this.run.runSeed);
    this.board = generateSectorBoard(this.sector);
    this.pipeQueue = sectorIndex === 0
      ? Array.from({ length: 6 + (hasRelic(this.run.selectedRelics, 'long-queue') ? 2 : 0) }, (_, index) =>
          createStraightPiece(index),
        )
      : Array.from({ length: 6 + (hasRelic(this.run.selectedRelics, 'long-queue') ? 2 : 0) }, (_, index) =>
          createPiece(index),
        );
    this.pieceSequence = this.pipeQueue.length;
    this.cursor = { x: boardSource(this.board).x + 1, y: boardSource(this.board).y };
    this.phase = 'build';
    this.flow.reset();
    this.rush.reset();
    this.combat.reset();
    this.leaks = 3;
    this.multiplierPenalty = 0;
    this.message = 'BUILD, THEN OPEN VALVE';
    this.narrative = this.sector.narrative;
    this.audio.setPhaseAmbience('build');
    this.refreshRouteStats();
    this.refreshBoardView();
    this.cameraRig.snapTo(new THREE.Vector3(0, 0, 0));
  }

  private failBoard(reason: string): void {
    this.phase = 'failed';
    this.message = reason;
    this.narrative = RUN_FAILURE_LOG;
    this.meta = recordRunResult(this.meta, this.run.runScore + this.score, this.run.sectorIndex, []);
    saveMeta(this.meta);
    this.audio.fail();
    this.audio.stopAmbience();
    this.rush.reset();
    this.combat.reset();
  }

  private startNewRun(seed: number, isDaily: boolean): void {
    this.run = createRunState(seed, isDaily);
    this.score = 0;
    this.beginSector(0);
  }

  private advancePipeQueue(): void {
    const factory = this.run.sectorIndex === 0 && this.phase !== 'flow'
      ? createStraightPiece
      : createPiece;
    this.pipeQueue = [...this.pipeQueue.slice(1), factory(this.pieceSequence)];
    this.pieceSequence += 1;
  }

  private getFloodedSet(): ReadonlySet<string> {
    return new Set(this.flow.flowedPath.map((point) => `${point.x},${point.y}`));
  }

  private canPlaceOrReplaceCurrent(): boolean {
    const cells = getPieceCells(this.currentPiece, this.cursor);
    return cells.every(({ x, y }) => {
      const cell = getCell(this.board, x, y);
      const flooded = this.flow.isFlooded({ x, y });
      if (this.phase === 'flow' && flooded) return false;
      if (this.phase === 'flow' && cell && !flooded && !this.flow.isAheadOfFront({ x, y })) {
        return false;
      }
      if (this.modifiers.floodAdjacentPlace && this.phase === 'flow' && flooded) {
        return this.isAdjacentToFlooded({ x, y });
      }
      if (!cell) return isPlaceableCell(this.board, x, y);
      return !cell.locked && !flooded;
    });
  }

  private isAdjacentToFlooded(point: BoardPoint): boolean {
    const neighbors = [
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 },
    ];
    return neighbors.some((neighbor) => this.flow.isFlooded(neighbor));
  }

  private traceBoard() {
    this.flow.ignoreCracks = hasRelic(this.run.selectedRelics, 'crack-seal');
    return traceFlow(this.board, this.flow.ignoreCracks);
  }

  private get plannedRouteLength(): number {
    const trace = this.phase === 'flow' ? this.flow.trace : this.traceBoard();
    return trace.status === 'drain' ? trace.path.length : Math.max(0, trace.path.length - 1);
  }

  private getFlowStartBlocker(): string | null {
    const trace = this.traceBoard();
    if (trace.status !== 'drain') return 'CONNECT TO DRAIN FIRST';
    if (!boardPassesWellRequirement(this.board, this.sector)) return 'ROUTE MUST PASS ENERGY WELL';
    const missingPipes = TARGET_PIPE_LENGTH - trace.path.length;
    if (missingPipes > 0) return `NEED ${missingPipes} MORE PIPES`;
    return null;
  }

  private refreshRouteStats(): void {
    this.routeComparison = compareRoutes(this.board);
    this.routeStats = this.routeComparison.energyLoop;
    if (hasRelic(this.run.selectedRelics, 'loop-hunter') && this.routeStats.route.length > TARGET_PIPE_LENGTH) {
      this.routeStats = {
        ...this.routeStats,
        multiplier: Number((this.routeStats.multiplier + 0.15).toFixed(2)),
      };
    }
  }

  private buildRushPreview(): RushPreview {
    const weapon = this.weaponProfile;
    return {
      energy: this.routeStats.energy,
      multiplier: Math.max(0.5, this.routeStats.multiplier - this.multiplierPenalty),
      weaponLabel: weapon.label,
      boostZones: this.routeStats.boosters,
      crossJunctions: this.routeStats.reflectors,
      rushSeconds: this.routeStats.estimatedRushSeconds,
      hullLayers: Math.max(1, this.leaks) + (hasRelic(this.run.selectedRelics, 'hull-plate') ? 1 : 0),
    };
  }

  private refreshBoardView(): void {
    const flowed = this.phase === 'build'
      ? []
      : this.phase === 'rush' || this.phase === 'rush_ready'
        ? this.rush.route.slice(0, Math.floor(this.rush.routeProgress) + 1)
        : this.flow.flowedPath;
    const preview = this.phase === 'build'
      ? this.routeStats.route
      : this.flow.trace.path;
    this.boardView.sync(
      this.board,
      this.currentPiece,
      this.cursor,
      flowed,
      preview,
      this.phase,
      this.canPlaceOrReplaceCurrent(),
    );
  }

  private updateHud(): void {
    const phaseMessage: Record<Phase, string> = {
      build: this.message,
      flow: this.message,
      rush_ready: this.message,
      rush: this.message,
      paused: 'PAUSED',
      failed: 'FAILED / RESTART',
      cleared: 'CLEARED / RESTART',
      sector_cleared: 'SECTOR CLEAR',
      relic_pick: this.message,
      run_cleared: 'RUN CLEAR / RESTART',
    };
    const flowBlocker = this.getFlowStartBlocker();
    const flowed = this.phase === 'build'
      ? this.plannedRouteLength
      : this.phase === 'rush' || this.phase === 'rush_ready'
        ? Math.min(TARGET_PIPE_LENGTH, Math.floor(this.rush.routeProgress) + 1)
        : this.flow.flowedPath.length;

    this.hud.update({
      phase: this.phase,
      viewMode: this.viewMode,
      flowed,
      targetLength: TARGET_PIPE_LENGTH,
      flowReady: !flowBlocker,
      score: this.score,
      leaks: this.leaks,
      health: this.combat.health,
      energy: this.routeStats.energy,
      multiplier: Math.max(0.5, this.routeStats.multiplier - this.multiplierPenalty),
      currentPipe: this.canPlaceOrReplaceCurrent() ? this.currentPiece.name : `${this.currentPiece.name} BLOCKED`,
      nextPipes: this.pipeQueue.slice(1, 6).map((piece) => piece.name),
      canPlacePiece: this.canPlaceOrReplaceCurrent(),
      flowBlocker,
      relics: this.run.selectedRelics,
      relicChoices: this.relicChoices,
      message: phaseMessage[this.phase],
      muted: this.muted,
      routeComparison: this.routeComparison,
      rushPreview: this.phase === 'rush_ready' ? this.buildRushPreview() : null,
      rushReadySeconds: this.rushReadyTimer,
      sector: this.sector,
      runScore: this.run.runScore,
      narrative: this.narrative,
      isDaily: this.run.isDaily,
    });
  }

  private random(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const playerPosition = this.phase === 'rush'
      ? {
          x: this.rush.tank.position.x,
          y: this.rush.tank.position.y,
          z: this.rush.tank.position.z,
        }
      : this.flow.getFlowHeadWorld();

    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      phase: this.phase,
      score: this.score,
      routeLength: this.phase === 'build'
        ? this.plannedRouteLength
        : this.phase === 'rush' || this.phase === 'rush_ready'
          ? Math.floor(this.rush.routeProgress) + 1
          : this.flow.flowedPath.length,
      routeEnergy: this.routeStats.energy,
      multiplier: this.routeStats.multiplier,
      health: this.phase === 'rush' || this.phase === 'rush_ready' ? this.combat.health : this.leaks,
      enemies: this.combat.enemyCount,
      projectiles: this.combat.projectileCount,
      board: {
        occupied: this.board.cells.filter(Boolean).length,
        cols: this.board.cols,
        rows: this.board.rows,
      },
      player: {
        position: playerPosition,
        speed: this.phase === 'rush'
          ? this.tuning.rushSpeed * (this.input.isDashHeld() ? this.tuning.boostMultiplier : 1)
          : 0,
      },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr),
      },
      sector: this.sector.index,
      runScore: this.run.runScore,
      isDaily: this.run.isDaily,
      relicCount: this.run.selectedRelics.length,
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
}
