import * as THREE from 'three';
import { MaterialLibrary } from '../assets/MaterialLibrary';
import { createWorldKit } from '../assets/modelFactories';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
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
  boardToWorld,
  clampCursor,
  createInitialBoard,
  createPiece,
  findEnergyRoute,
  getCell,
  getPieceCells,
  placePiece,
  replacePiece,
  resolveMatches,
  rotatePiece,
  traceFlow,
} from './pipes';
import type { Board, BoardPoint, Phase, Piece, Relic, RouteStats, ViewMode } from './types';

type PhaseBeforePause = Exclude<Phase, 'paused'>;

const RULE_TIPS: ReadonlyArray<Relic> = [
  { id: 'queue', name: 'Pipe queue', short: 'Current pipe is placed first', value: 0 },
  { id: 'replace', name: 'Replace', short: 'Unflooded pipes can be replaced', value: 0 },
  { id: 'energy', name: 'Energy loop', short: 'Color chains and boosters raise rush power', value: 0 },
];

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

  private board: Board = createInitialBoard();
  private pipeQueue: Piece[] = Array.from({ length: 6 }, (_, index) => createPiece(index));
  private pieceSequence = 6;
  private cursor: BoardPoint = { x: 1, y: 5 };
  private phase: Phase = 'build';
  private phaseBeforePause: PhaseBeforePause = 'build';
  private viewMode: ViewMode = '2d';
  private routeStats: RouteStats = findEnergyRoute(this.board);
  private frame = 0;
  private elapsed = 0;
  private buildRepeat = 0;
  private score = 0;
  private leaks = 3;
  private message = 'BUILD, THEN OPEN VALVE';
  private muted = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;

    const stick = this.getElement('#touch-stick');
    const knob = this.getElement('#touch-knob');
    const boostButton = this.getElement('#boost-button');
    const actionButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-action]'));
    this.input = new InputController(stick, knob, boostButton, actionButtons);

    this.debugTools = new DebugTools(this.tuning, () => {
      this.renderer.toneMappingExposure = this.tuning.exposure;
      resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    });

    this.createScene();
    this.cameraRig.setMode(this.viewMode);
    this.refreshRouteStats();
    this.refreshBoardView();
    this.cameraRig.snapTo(new THREE.Vector3(0, 0, 0));
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

  private get currentPiece(): Piece {
    return this.pipeQueue[0];
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
    const cameraLag = this.phase === 'failed' || this.phase === 'cleared'
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
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 32;
    key.shadow.camera.left = -13;
    key.shadow.camera.right = 13;
    key.shadow.camera.top = 13;
    key.shadow.camera.bottom = -13;
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
        if (this.phase === 'flow' || this.phase === 'rush') this.audio.startAmbience();
        this.message = this.phase === 'rush' ? 'RUSH RESUMED' : this.phase === 'flow' ? 'FLOW RESUMED' : 'BUILD RESUMED';
      } else {
        this.phaseBeforePause = this.phase as PhaseBeforePause;
        this.phase = 'paused';
        this.audio.stopAmbience();
        this.message = 'PAUSED';
      }
    }

    if (this.input.consumeRestart()) {
      this.resetBoard();
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

    if (this.input.consumeRush()) {
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
    if (matchResult.upgraded > 0) {
      this.score += matchResult.upgraded * 20;
      this.message = `CHAIN +${matchResult.upgraded}`;
      this.hud.flashStatus('combo');
      this.audio.pickup(matchResult.upgraded);
    } else {
      this.score += existing ? -25 : 5;
      this.message = existing ? 'REPLACED -25' : 'PIPE PLACED';
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
    this.score -= 10;
    this.message = 'SKIPPED PIPE -10';
    this.advancePipeQueue();
    this.audio.rotate();
    this.refreshBoardView();
    this.hud.flashStatus('place');
  }

  private startFlow(): void {
    if (this.phase === 'failed' || this.phase === 'cleared') {
      this.resetBoard();
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
      const trace = traceFlow(this.board);
      this.phase = 'flow';
      this.flow.startFlow(trace);
      this.message = 'WATER FLOWING';
      this.audio.rush();
      this.audio.startAmbience();
      this.hud.flashStatus('rush');
      this.refreshBoardView();
    }
  }

  private updateFlow(delta: number): void {
    const result = this.flow.update(delta, this.board, this.input.isDashHeld(), TARGET_PIPE_LENGTH);

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
      this.startRush();
      return;
    }

    if (result.kind === 'failed') {
      this.failBoard(result.reason);
      return;
    }

    this.leaks -= 1;
    this.message = result.reason;
    this.audio.fail();
    this.hud.flashStatus('hit');
    if (this.leaks <= 0) {
      this.failBoard(this.message);
    } else {
      this.flow.onLeakSurvived();
    }
    this.refreshBoardView();
  }

  private startRush(): void {
    const route = this.flow.sealedRoute.length > 0 ? this.flow.sealedRoute : this.routeStats.route;
    this.phase = 'rush';
    this.rush.start(route);
    this.combat.start(Math.max(1, this.leaks), route);
    this.message = 'TANK RUSH';
    this.audio.rush();
    this.hud.flashStatus('rush');
    this.refreshBoardView();
  }

  private updateRush(delta: number): void {
    const strafe = this.input.readMovement(this.strafeInput);
    this.rush.update(
      delta,
      this.board,
      new THREE.Vector2(strafe.x, 0),
      this.input.isDashHeld(),
      this.tuning,
      this.routeStats.multiplier,
    );

    this.combat.update(
      delta,
      this.elapsed,
      this.rush.getTankPosition(),
      this.rush.route,
      this.rush.routeProgress,
      this.tuning,
      this.routeStats,
      (killScore) => {
        this.score += killScore;
        this.hud.flashStatus('combo');
        this.audio.pickup(1);
      },
      () => {
        this.audio.hit();
        this.hud.flashStatus('hit');
      },
    );

    if (this.rush.reachedDrain) {
      this.clearBoard();
      return;
    }

    if (this.combat.health <= 0) {
      this.failBoard('HULL DESTROYED');
    }
  }

  private clearBoard(): void {
    this.phase = 'cleared';
    const energyBonus = Math.round(this.routeStats.energy * this.routeStats.multiplier);
    this.score += 500 + energyBonus + Math.max(0, this.flow.flowedPath.length - TARGET_PIPE_LENGTH) * 35 + this.combat.health * 75;
    this.message = 'DRAIN REACHED';
    this.audio.cleared();
    this.audio.stopAmbience();
    const endPoint = this.rush.route[this.rush.route.length - 1]
      ?? this.flow.flowedPath[this.flow.flowedPath.length - 1]
      ?? { x: 0, y: 0 };
    this.vfx.spawnRing(boardToWorld(endPoint, 0.42), '#9cf15f');
    this.rush.reset();
    this.combat.reset();
  }

  private failBoard(reason: string): void {
    this.phase = 'failed';
    this.message = reason;
    this.audio.fail();
    this.audio.stopAmbience();
    this.rush.reset();
    this.combat.reset();
  }

  private resetBoard(): void {
    this.board = createInitialBoard();
    this.pipeQueue = Array.from({ length: 6 }, (_, index) => createPiece(index));
    this.pieceSequence = 6;
    this.cursor = { x: 1, y: 5 };
    this.phase = 'build';
    this.flow.reset();
    this.rush.reset();
    this.combat.reset();
    this.score = 0;
    this.leaks = 3;
    this.message = 'BUILD, THEN OPEN VALVE';
    this.audio.stopAmbience();
    this.refreshRouteStats();
    this.refreshBoardView();
    this.cameraRig.snapTo(new THREE.Vector3(0, 0, 0));
  }

  private advancePipeQueue(): void {
    this.pipeQueue = [...this.pipeQueue.slice(1), createPiece(this.pieceSequence)];
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
      return !cell || (!cell.locked && !flooded);
    });
  }

  private get plannedRouteLength(): number {
    const trace = this.phase === 'flow' ? this.flow.trace : traceFlow(this.board);
    return trace.status === 'drain' ? trace.path.length : Math.max(0, trace.path.length - 1);
  }

  private getFlowStartBlocker(): string | null {
    const trace = traceFlow(this.board);
    if (trace.status !== 'drain') return 'CONNECT TO DRAIN FIRST';
    const missingPipes = TARGET_PIPE_LENGTH - trace.path.length;
    if (missingPipes > 0) return `NEED ${missingPipes} MORE PIPES`;
    return null;
  }

  private refreshRouteStats(): void {
    this.routeStats = findEnergyRoute(this.board);
  }

  private refreshBoardView(): void {
    const flowed = this.phase === 'build'
      ? []
      : this.phase === 'rush'
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
      rush: this.message,
      paused: 'PAUSED',
      failed: 'FAILED / RESTART',
      cleared: 'CLEARED / RESTART',
    };
    const flowBlocker = this.getFlowStartBlocker();
    const flowed = this.phase === 'build'
      ? this.plannedRouteLength
      : this.phase === 'rush'
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
      multiplier: this.routeStats.multiplier,
      currentPipe: this.canPlaceOrReplaceCurrent() ? this.currentPiece.name : `${this.currentPiece.name} BLOCKED`,
      nextPipes: this.pipeQueue.slice(1, 6).map((piece) => piece.name),
      canPlacePiece: this.canPlaceOrReplaceCurrent(),
      flowBlocker,
      relics: RULE_TIPS,
      message: phaseMessage[this.phase],
      muted: this.muted,
    });
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
        : this.phase === 'rush'
          ? Math.floor(this.rush.routeProgress) + 1
          : this.flow.flowedPath.length,
      routeEnergy: this.routeStats.energy,
      multiplier: this.routeStats.multiplier,
      health: this.phase === 'rush' ? this.combat.health : this.leaks,
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
    };
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
}
