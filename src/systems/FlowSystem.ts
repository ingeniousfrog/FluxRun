import {
  boardToWorld,
  getCell,
  traceFlow,
} from '../game/pipes';
import { FLOW_CELLS_PER_SECOND } from '../game/constants';
import type { Board, BoardPoint, FlowTrace } from '../game/types';

export type FlowUpdateResult =
  | { kind: 'flowing'; newCells: ReadonlyArray<BoardPoint> }
  | { kind: 'rush_ready' }
  | { kind: 'leak'; reason: string }
  | { kind: 'failed'; reason: string };

export class FlowSystem {
  flowedPath: BoardPoint[] = [];
  flowProgress = 0;
  sealedRoute: BoardPoint[] = [];
  trace: FlowTrace = { path: [], status: 'leak', leakAt: null };
  ignoreCracks = false;

  reset(): void {
    this.flowedPath = [];
    this.flowProgress = 0;
    this.sealedRoute = [];
    this.trace = { path: [], status: 'leak', leakAt: null };
  }

  startFlow(trace: FlowTrace): void {
    this.flowProgress = 0;
    this.flowedPath = [];
    this.sealedRoute = [...trace.path];
    this.trace = trace;
  }

  refreshTrace(board: Board): { broken: boolean } {
    const prevPath = this.trace.path;
    const head = this.flowedPath[this.flowedPath.length - 1]
      ?? prevPath[Math.floor(this.flowProgress)]
      ?? prevPath[0];

    this.trace = traceFlow(board, this.ignoreCracks);

    if (!head || this.flowedPath.length === 0) {
      return { broken: false };
    }

    const newIndex = this.trace.path.findIndex((point) => point.x === head.x && point.y === head.y);
    if (newIndex < 0) {
      return { broken: true };
    }

    const prefixMatches = this.flowedPath.every(
      (point, index) => this.trace.path[index]?.x === point.x && this.trace.path[index]?.y === point.y,
    );
    if (!prefixMatches) {
      return { broken: true };
    }

    this.flowProgress = newIndex + (this.flowProgress % 1);
    return { broken: false };
  }

  update(
    delta: number,
    board: Board,
    dashHeld: boolean,
    targetLength: number,
    speedMultiplier = 1,
  ): FlowUpdateResult {
    const { broken } = this.refreshTrace(board);
    if (broken) {
      return { kind: 'leak', reason: 'ROUTE BROKEN' };
    }

    const currentCell = this.trace.path[Math.floor(this.flowProgress)];
    const currentPipe = currentCell ? getCell(board, currentCell.x, currentCell.y) : null;
    const pipeSpeed = (currentPipe?.kind === 'reservoir' ? FLOW_CELLS_PER_SECOND * 0.45 : FLOW_CELLS_PER_SECOND) * speedMultiplier;
    const manualPressure = dashHeld ? 1.8 : 1;
    this.flowProgress += delta * pipeSpeed * manualPressure;

    const flowIndex = Math.min(Math.floor(this.flowProgress), Math.max(0, this.trace.path.length - 1));
    const nextFlowed = this.trace.path.slice(0, flowIndex + 1);
    const newCells = nextFlowed.length > this.flowedPath.length
      ? nextFlowed.slice(this.flowedPath.length)
      : [];
    this.flowedPath = [...nextFlowed];

    const reachedEndOfTrace = this.flowProgress >= this.trace.path.length - 0.04;
    if (!reachedEndOfTrace) {
      return { kind: 'flowing', newCells };
    }

    if (this.trace.status === 'drain' && this.flowedPath.length >= targetLength) {
      return { kind: 'rush_ready' };
    }

    if (this.trace.status === 'drain' && this.flowedPath.length < targetLength) {
      return { kind: 'failed', reason: 'TOO SHORT' };
    }

    return {
      kind: 'leak',
      reason: this.trace.status === 'blocked' ? 'WRONG CONNECTOR' : 'PIPE LEAK',
    };
  }

  isFlooded(point: BoardPoint): boolean {
    return this.flowedPath.some((flowed) => flowed.x === point.x && flowed.y === point.y);
  }

  isAheadOfFront(point: BoardPoint): boolean {
    if (this.flowedPath.length === 0) return true;
    const front = this.flowedPath[this.flowedPath.length - 1];
    const frontIndex = this.trace.path.findIndex((p) => p.x === front.x && p.y === front.y);
    const pointIndex = this.trace.path.findIndex((p) => p.x === point.x && p.y === point.y);
    if (frontIndex < 0 || pointIndex < 0) return !this.isFlooded(point);
    return pointIndex > frontIndex;
  }

  getFlowHeadWorld(): { x: number; y: number; z: number } {
    const head = this.flowedPath[this.flowedPath.length - 1] ?? { x: 0, y: 0 };
    const world = boardToWorld(head, 0.16);
    return { x: world.x, y: world.y, z: world.z };
  }

  onLeakSurvived(): void {
    this.flowProgress = Math.max(0, this.trace.path.length - 1.35);
  }
}
