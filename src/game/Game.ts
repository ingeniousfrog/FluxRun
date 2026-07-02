import * as THREE from 'three';
import { MaterialLibrary } from '../assets/MaterialLibrary';
import { createWorldKit } from '../assets/modelFactories';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { AudioSystem } from '../systems/AudioSystem';
import { BoardView } from '../systems/BoardView';
import { CameraRig } from '../systems/CameraRig';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Hud } from '../systems/Hud';
import { VfxSystem } from '../systems/VfxSystem';
import {
  BUILD_REPEAT_SECONDS,
  FLOW_CELLS_PER_SECOND,
  TARGET_PIPE_LENGTH,
} from './constants';
import {
  boardToWorld,
  clampCursor,
  createInitialBoard,
  createPiece,
  getCell,
  getPieceCells,
  placePiece,
  replacePiece,
  resolveMatches,
  rotatePiece,
  traceFlow,
} from './pipes';
import type { Board, BoardPoint, FlowTrace, Phase, Piece, Relic, ViewMode } from './types';

type PhaseBeforePause = Exclude<Phase, 'paused'>;

const RULE_TIPS: ReadonlyArray<Relic> = [
  { id: 'queue', name: 'Pipe queue', short: 'Current pipe is placed first', value: 0 },
  { id: 'replace', name: 'Replace', short: 'Unflooded pipes can be replaced', value: 0 },
  { id: 'target', name: 'Goal', short: 'Reach drain after target length', value: 0 },
];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 90);
  private readonly materials = new MaterialLibrary();
  private readonly boardView = new BoardView(this.materials);
  private readonly vfx = new VfxSystem();
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

  private board: Board = createInitialBoard();
  private pipeQueue: Piece[] = Array.from({ length: 6 }, (_, index) => createPiece(index));
  private pieceSequence = 6;
  private cursor: BoardPoint = { x: 1, y: 5 };
  private phase: Phase = 'build';
  private phaseBeforePause: PhaseBeforePause = 'build';
  private viewMode: ViewMode = '2d';
  private trace: FlowTrace = traceFlow(this.board);
  private flowedPath: BoardPoint[] = [];
  private flowProgress = 0;
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
    this.refreshFlowTrace();
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

    if (this.phase === 'failed' || this.phase === 'cleared') {
      this.cameraRig.update(delta, new THREE.Vector3(0, 0, 0), this.tuning.cameraLag * 1.4);
    } else {
      this.cameraRig.update(delta, new THREE.Vector3(0, 0, 0), this.tuning.cameraLag * 2);
    }

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
      this.cameraRig.snapTo(new THREE.Vector3(0, 0, 0));
      this.message = this.viewMode === '2d' ? '2D TOP VIEW' : '2.5D ANGLED VIEW';
    }

    if (this.input.consumePause()) {
      if (this.phase === 'paused') {
        this.phase = this.phaseBeforePause;
        if (this.phase === 'flow') this.audio.startAmbience();
        this.message = this.phase === 'flow' ? 'FLOW RESUMED' : 'BUILD RESUMED';
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

    if (this.input.consumePlace()) {
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
    const placement = existing
      ? replacePiece(this.board, this.currentPiece, this.cursor)
      : placePiece(this.board, this.currentPiece, this.cursor);
    if (!placement.placed.length) {
      this.message = 'PIPE LOCKED';
      this.hud.flashStatus('hit');
      this.audio.hit();
      return;
    }

    this.board = resolveMatches(placement.board).board;
    this.score += existing ? -25 : 5;
    this.message = existing ? 'REPLACED -25' : 'PIPE PLACED';
    this.audio.place();
    for (const placed of placement.placed) {
      this.vfx.spawnRing(boardToWorld(placed, 0.34), existing ? '#ffbd4a' : '#42d9ff');
    }
    this.advancePipeQueue();
    this.refreshFlowTrace();
    this.refreshBoardView();
    this.hud.flashStatus(existing ? 'hit' : 'place');
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

    this.refreshFlowTrace();
    const blocker = this.getFlowStartBlocker();
    if (blocker) {
      this.message = blocker;
      this.audio.hit();
      this.hud.flashStatus('hit');
      this.refreshBoardView();
      return;
    }

    if (this.phase !== 'flow') {
      this.phase = 'flow';
      this.flowProgress = 0;
      this.flowedPath = [];
      this.message = 'WATER FLOWING';
      this.audio.rush();
      this.hud.flashStatus('rush');
      this.refreshBoardView();
    }
  }

  private updateFlow(delta: number): void {
    this.refreshFlowTrace();
    const currentCell = this.trace.path[Math.floor(this.flowProgress)];
    const currentPipe = currentCell ? getCell(this.board, currentCell.x, currentCell.y) : null;
    const pipeSpeed = currentPipe?.kind === 'reservoir' ? FLOW_CELLS_PER_SECOND * 0.45 : FLOW_CELLS_PER_SECOND;
    const manualPressure = this.input.isDashHeld() ? 1.8 : 1;
    this.flowProgress += delta * pipeSpeed * manualPressure;

    const flowIndex = Math.min(Math.floor(this.flowProgress), Math.max(0, this.trace.path.length - 1));
    const nextFlowed = this.trace.path.slice(0, flowIndex + 1);
    if (nextFlowed.length > this.flowedPath.length) {
      const newCells = nextFlowed.slice(this.flowedPath.length);
      this.score += newCells.length * 15;
      this.audio.pickup(newCells.length);
      for (const point of newCells) {
        this.vfx.spawnRing(boardToWorld(point, 0.38), '#74e7ff');
      }
    }
    this.flowedPath = [...nextFlowed];

    const reachedEndOfTrace = this.flowProgress >= this.trace.path.length - 0.04;
    if (!reachedEndOfTrace) {
      this.refreshBoardView();
      return;
    }

    if (this.trace.status === 'drain') {
      if (this.flowedPath.length >= TARGET_PIPE_LENGTH) {
        this.clearBoard();
      } else {
        this.failBoard('TOO SHORT');
      }
      return;
    }

    this.leaks -= 1;
    this.message = this.trace.status === 'blocked' ? 'WRONG CONNECTOR' : 'PIPE LEAK';
    this.audio.fail();
    this.hud.flashStatus('hit');
    if (this.leaks <= 0) {
      this.failBoard(this.message);
    } else {
      this.flowProgress = Math.max(0, this.trace.path.length - 1.35);
    }
    this.refreshBoardView();
  }

  private clearBoard(): void {
    this.phase = 'cleared';
    this.score += 500 + Math.max(0, this.flowedPath.length - TARGET_PIPE_LENGTH) * 35 + this.leaks * 75;
    this.message = 'DRAIN REACHED';
    this.audio.cleared();
    this.vfx.spawnRing(boardToWorld(this.flowedPath[this.flowedPath.length - 1] ?? { x: 0, y: 0 }, 0.42), '#9cf15f');
  }

  private failBoard(reason: string): void {
    this.phase = 'failed';
    this.message = reason;
    this.audio.fail();
  }

  private resetBoard(): void {
    this.board = createInitialBoard();
    this.pipeQueue = Array.from({ length: 6 }, (_, index) => createPiece(index));
    this.pieceSequence = 6;
    this.cursor = { x: 1, y: 5 };
    this.phase = 'build';
    this.flowedPath = [];
    this.flowProgress = 0;
    this.score = 0;
    this.leaks = 3;
    this.message = 'BUILD, THEN OPEN VALVE';
    this.audio.stopAmbience();
    this.refreshFlowTrace();
    this.refreshBoardView();
  }

  private advancePipeQueue(): void {
    this.pipeQueue = [...this.pipeQueue.slice(1), createPiece(this.pieceSequence)];
    this.pieceSequence += 1;
  }

  private canPlaceOrReplaceCurrent(): boolean {
    const cells = getPieceCells(this.currentPiece, this.cursor);
    return cells.every(({ x, y }) => {
      const cell = getCell(this.board, x, y);
      const flooded = this.isFlooded({ x, y });
      return !cell || (!cell.locked && !flooded);
    });
  }

  private isFlooded(point: BoardPoint): boolean {
    return this.flowedPath.some((flowed) => flowed.x === point.x && flowed.y === point.y);
  }

  private get plannedRouteLength(): number {
    return this.trace.status === 'drain' ? this.trace.path.length : Math.max(0, this.trace.path.length - 1);
  }

  private getFlowStartBlocker(): string | null {
    if (this.trace.status !== 'drain') return 'CONNECT TO DRAIN FIRST';
    const missingPipes = TARGET_PIPE_LENGTH - this.trace.path.length;
    if (missingPipes > 0) return `NEED ${missingPipes} MORE PIPES`;
    return null;
  }

  private refreshFlowTrace(): void {
    this.trace = traceFlow(this.board);
  }

  private refreshBoardView(): void {
    const previewPath = this.phase === 'flow' ? this.trace.path : this.trace.path;
    this.boardView.sync(this.board, this.currentPiece, this.cursor, this.flowedPath, previewPath, this.phase);
    this.updateHud();
  }

  private updateHud(): void {
    const phaseMessage: Record<Phase, string> = {
      build: this.message,
      flow: this.message,
      paused: 'PAUSED',
      failed: 'FAILED / RESTART',
      cleared: 'CLEARED / RESTART',
    };
    const flowBlocker = this.getFlowStartBlocker();

    this.hud.update({
      phase: this.phase,
      viewMode: this.viewMode,
      flowed: this.phase === 'build' ? this.plannedRouteLength : this.flowedPath.length,
      targetLength: TARGET_PIPE_LENGTH,
      flowReady: !flowBlocker,
      score: this.score,
      leaks: this.leaks,
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
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      phase: this.phase,
      score: this.score,
      routeLength: this.phase === 'build' ? this.plannedRouteLength : this.flowedPath.length,
      routeEnergy: this.getFlowStartBlocker() ? 0 : 1,
      multiplier: this.viewMode === '2d' ? 2 : 2.5,
      health: this.leaks,
      enemies: 0,
      projectiles: 0,
      board: {
        occupied: this.board.cells.filter(Boolean).length,
        cols: this.board.cols,
        rows: this.board.rows,
      },
      player: {
        position: {
          x: boardToWorld(this.flowedPath[this.flowedPath.length - 1] ?? { x: 0, y: 0 }).x,
          y: 0.16,
          z: boardToWorld(this.flowedPath[this.flowedPath.length - 1] ?? { x: 0, y: 0 }).z,
        },
        speed: this.phase === 'flow' ? FLOW_CELLS_PER_SECOND * (this.input.isDashHeld() ? 1.8 : 1) : 0,
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
