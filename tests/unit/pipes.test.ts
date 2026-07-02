import { describe, expect, it } from 'vitest';
import { createSectorConfig, generateSectorBoard } from '../../src/game/BoardGenerator';
import {
  compareRoutes,
  createEmptyBoard,
  findLongestRouteToDrain,
  setCellsFromPoints,
  statsFromTrace,
  traceFlow,
} from '../../src/game/pipes';
import { TARGET_PIPE_LENGTH } from '../../src/game/constants';

import type { Board } from '../../src/game/types';

function buildStraightBoard(length: number): Board {
  let board: Board = {
    ...createEmptyBoard(16, 11),
    source: { x: 0, y: 5 },
    drain: { x: 15, y: 5 },
  };
  board = setCellsFromPoints(board, [{ x: 0, y: 5 }], 'source', 'cyan', 0, true);
  board = setCellsFromPoints(board, [{ x: 15, y: 5 }], 'drain', 'lime', 0, true);
  const points = Array.from({ length }, (_, index) => ({ x: index + 1, y: 5 }));
  board = setCellsFromPoints(board, points, 'straight', 'amber', 1, false);
  return board;
}

describe('pipes route truth source', () => {
  it('traceFlow reaches drain on a straight line', () => {
    const board = buildStraightBoard(14);
    const trace = traceFlow(board);
    expect(trace.status).toBe('drain');
    expect(trace.path.length).toBeGreaterThanOrEqual(TARGET_PIPE_LENGTH);
  });

  it('statsFromTrace reflects the player trace, not loop potential', () => {
    const board = buildStraightBoard(14);
    const traceStats = statsFromTrace(board);
    const loop = findLongestRouteToDrain(board);
    expect(traceStats.route.length).toBe(traceFlow(board).path.length);
    expect(loop.energy).toBeGreaterThanOrEqual(traceStats.energy);
  });

  it('compareRoutes exposes shortest and loopPotential', () => {
    const board = buildStraightBoard(14);
    const comparison = compareRoutes(board);
    expect(comparison.shortest.complete).toBe(true);
    expect(comparison.loopPotential.complete).toBe(true);
    expect(comparison.loopPotential.energy).toBeGreaterThanOrEqual(comparison.shortest.energy);
  });

  it('sector 0 generated board trace is valid', () => {
    const config = createSectorConfig(0, 42);
    const board = generateSectorBoard(config);
    const trace = traceFlow(board);
    expect(['drain', 'flowing', 'leak', 'blocked']).toContain(trace.status);
  });
});
