import { BOARD_COLS, BOARD_ROWS } from './constants';
import { createEmptyBoard, getCell, setCellsFromPoints } from './pipes';
import { applyNarrativeToSector } from './narrative';
import { SECTOR_COUNT } from './RunState';
import type { Board, BoardPoint, SectorConfig } from './types';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPoints(rng: () => number, count: number, avoid: Set<string>): BoardPoint[] {
  const points: BoardPoint[] = [];
  let attempts = 0;
  while (points.length < count && attempts < 200) {
    attempts += 1;
    const x = 2 + Math.floor(rng() * (BOARD_COLS - 4));
    const y = 1 + Math.floor(rng() * (BOARD_ROWS - 2));
    const key = `${x},${y}`;
    if (avoid.has(key)) continue;
    if (y === 5 && sectorSafeRow(x)) continue;
    avoid.add(key);
    points.push({ x, y });
  }
  return points;
}

function sectorSafeRow(x: number): boolean {
  return x >= 2 && x <= 13;
}

export function createSectorConfig(sectorIndex: number, runSeed: number): SectorConfig {
  const rng = mulberry32(runSeed + sectorIndex * 9973);
  const sourceY = sectorIndex === 0 ? 5 : 3 + Math.floor(rng() * 5);
  const drainY = sectorIndex === 0 ? 5 : 3 + Math.floor(rng() * 5);
  const source: BoardPoint = { x: 0, y: sourceY };
  const drain: BoardPoint = { x: BOARD_COLS - 1, y: drainY };
  const reserved = new Set<string>([
    `${source.x},${source.y}`,
    `${drain.x},${drain.y}`,
    `${source.x + 1},${source.y}`,
    `${drain.x - 1},${drain.y}`,
  ]);

  const obstacleCount = sectorIndex === 0 ? 1 : sectorIndex === 1 ? 4 : 3;
  const crackCount = sectorIndex === 1 ? 3 : sectorIndex === 2 ? 2 : 0;
  const wellCount = sectorIndex >= 1 ? 1 : 0;

  const config: SectorConfig = {
    index: sectorIndex,
    seed: runSeed + sectorIndex * 131,
    source,
    drain,
    obstacles: pickPoints(rng, obstacleCount, reserved),
    cracks: pickPoints(rng, crackCount, reserved),
    wells: pickPoints(rng, wellCount, reserved),
    isBoss: sectorIndex >= SECTOR_COUNT - 1,
    narrative: '',
    title: '',
  };

  return applyNarrativeToSector(config);
}

export function generateSectorBoard(config: SectorConfig): Board {
  let board: Board = {
    ...createEmptyBoard(BOARD_COLS, BOARD_ROWS),
    source: config.source,
    drain: config.drain,
  };
  board = setCellsFromPoints(board, [config.source], 'source', 'cyan', 0, true);
  board = setCellsFromPoints(board, [config.drain], 'drain', 'lime', 0, true);
  board = setCellsFromPoints(board, config.obstacles, 'obstacle', 'magenta', 0, true);
  board = setCellsFromPoints(board, config.cracks, 'crack', 'amber', 0, true);
  board = setCellsFromPoints(board, config.wells, 'well', 'cyan', 0, true);
  return board;
}

export function boardPassesWellRequirement(board: Board, config: SectorConfig): boolean {
  if (config.wells.length === 0) return true;
  return config.wells.every((well) => Boolean(getCell(board, well.x, well.y)?.kind === 'well'));
}
