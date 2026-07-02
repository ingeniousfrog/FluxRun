import { describe, expect, it } from 'vitest';
import {
  boardPassesWellRequirement,
  createSectorConfig,
  generateSectorBoard,
  getUncoveredWells,
} from '../../src/game/BoardGenerator';
import { createEmptyBoard, setCellsFromPoints } from '../../src/game/pipes';

import type { Board } from '../../src/game/types';

function boardWithWellOnRoute(): Board {
  let board: Board = {
    ...createEmptyBoard(16, 11),
    source: { x: 0, y: 5 },
    drain: { x: 15, y: 5 },
  };
  board = setCellsFromPoints(board, [{ x: 0, y: 5 }], 'source', 'cyan', 0, true);
  board = setCellsFromPoints(board, [{ x: 15, y: 5 }], 'drain', 'lime', 0, true);
  board = setCellsFromPoints(board, [{ x: 8, y: 5 }], 'well', 'cyan', 0, true);
  const line = Array.from({ length: 14 }, (_, index) => ({ x: index + 1, y: 5 }));
  board = setCellsFromPoints(board, line, 'straight', 'amber', 1, false);
  return board;
}

function boardWithWellOffRoute(): Board {
  let board: Board = {
    ...createEmptyBoard(16, 11),
    source: { x: 0, y: 5 },
    drain: { x: 15, y: 5 },
  };
  board = setCellsFromPoints(board, [{ x: 0, y: 5 }], 'source', 'cyan', 0, true);
  board = setCellsFromPoints(board, [{ x: 15, y: 5 }], 'drain', 'lime', 0, true);
  board = setCellsFromPoints(board, [{ x: 8, y: 3 }], 'well', 'cyan', 0, true);
  const line = Array.from({ length: 14 }, (_, index) => ({ x: index + 1, y: 5 }));
  board = setCellsFromPoints(board, line, 'straight', 'amber', 1, false);
  return board;
}

describe('energy wells', () => {
  it('passes when all wells sit on the trace', () => {
    const config = createSectorConfig(1, 99);
    const board = boardWithWellOnRoute();
    const wellsConfig = { ...config, wells: [{ x: 8, y: 5 }] };
    expect(boardPassesWellRequirement(board, wellsConfig)).toBe(true);
    expect(getUncoveredWells(board, wellsConfig)).toEqual([]);
  });

  it('fails when a well is off the trace', () => {
    const config = createSectorConfig(1, 99);
    const board = boardWithWellOffRoute();
    const wellsConfig = { ...config, wells: [{ x: 8, y: 3 }] };
    expect(boardPassesWellRequirement(board, wellsConfig)).toBe(false);
    expect(getUncoveredWells(board, wellsConfig)).toEqual([{ x: 8, y: 3 }]);
  });

  it('ignores wells on sectors without well terrain', () => {
    const config = createSectorConfig(0, 12);
    const board = generateSectorBoard(config);
    expect(boardPassesWellRequirement(board, config)).toBe(true);
  });
});
