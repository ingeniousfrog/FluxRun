import * as THREE from 'three';
import { BOARD_COLS, BOARD_ROWS, CELL_SIZE, SOURCE_POINT } from './constants';
import type {
  Board,
  BoardPoint,
  Direction,
  ModuleKind,
  Piece,
  PieceBlock,
  PipeCell,
  PipeColor,
  PlacedCell,
  RouteStats,
} from './types';

const DIRECTIONS: ReadonlyArray<Direction> = ['N', 'E', 'S', 'W'];

const OFFSETS: Record<Direction, BoardPoint> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

const BASE_CONNECTORS: Record<ModuleKind, ReadonlyArray<Direction>> = {
  straight: ['N', 'S'],
  elbow: ['N', 'E'],
  tee: ['W', 'N', 'E'],
  cross: ['N', 'E', 'S', 'W'],
  booster: ['W', 'E'],
  reflector: ['N', 'E'],
};

const COLORS: ReadonlyArray<PipeColor> = ['cyan', 'amber', 'magenta', 'lime'];

const PIECE_TEMPLATES: ReadonlyArray<{
  readonly name: string;
  readonly blocks: ReadonlyArray<Omit<PieceBlock, 'color'>>;
}> = [
  {
    name: 'Line Surge',
    blocks: [
      { x: -1, y: 0, kind: 'straight', rotation: 1 },
      { x: 0, y: 0, kind: 'booster', rotation: 0 },
      { x: 1, y: 0, kind: 'straight', rotation: 1 },
      { x: 2, y: 0, kind: 'straight', rotation: 1 },
    ],
  },
  {
    name: 'Arc Hook',
    blocks: [
      { x: 0, y: -1, kind: 'straight', rotation: 0 },
      { x: 0, y: 0, kind: 'elbow', rotation: 1 },
      { x: 0, y: 1, kind: 'reflector', rotation: 2 },
      { x: 1, y: 1, kind: 'straight', rotation: 1 },
    ],
  },
  {
    name: 'Tri Split',
    blocks: [
      { x: -1, y: 0, kind: 'straight', rotation: 1 },
      { x: 0, y: 0, kind: 'tee', rotation: 0 },
      { x: 1, y: 0, kind: 'straight', rotation: 1 },
      { x: 0, y: -1, kind: 'reflector', rotation: 1 },
    ],
  },
  {
    name: 'Loop Core',
    blocks: [
      { x: 0, y: 0, kind: 'elbow', rotation: 1 },
      { x: 1, y: 0, kind: 'elbow', rotation: 2 },
      { x: 0, y: 1, kind: 'elbow', rotation: 0 },
      { x: 1, y: 1, kind: 'booster', rotation: 0 },
    ],
  },
  {
    name: 'Zipper',
    blocks: [
      { x: -1, y: 0, kind: 'straight', rotation: 1 },
      { x: 0, y: 0, kind: 'elbow', rotation: 1 },
      { x: 0, y: 1, kind: 'elbow', rotation: 3 },
      { x: 1, y: 1, kind: 'straight', rotation: 1 },
    ],
  },
];

export function createInitialBoard(): Board {
  const empty = createEmptyBoard(BOARD_COLS, BOARD_ROWS);
  const seedCells: ReadonlyArray<PlacedCell> = [
    seedCell(0, 7, 'straight', 'cyan', 1, 2),
    seedCell(1, 7, 'straight', 'cyan', 1, 1),
    seedCell(2, 7, 'booster', 'amber', 0, 1),
    seedCell(3, 7, 'straight', 'amber', 1, 1),
    seedCell(4, 7, 'elbow', 'lime', 3, 1),
    seedCell(4, 6, 'straight', 'lime', 0, 1),
    seedCell(4, 5, 'elbow', 'magenta', 1, 1),
    seedCell(5, 5, 'straight', 'magenta', 1, 1),
  ];
  return setCells(empty, seedCells);
}

export function createEmptyBoard(cols: number, rows: number): Board {
  return {
    cols,
    rows,
    cells: Array.from({ length: cols * rows }, () => null),
  };
}

export function createPiece(sequence: number): Piece {
  const template = PIECE_TEMPLATES[sequence % PIECE_TEMPLATES.length];
  const colorShift = sequence % COLORS.length;
  const blocks = template.blocks.map((block, index) => ({
    ...block,
    color: COLORS[(index + colorShift) % COLORS.length],
  }));
  return {
    id: `${template.name.toLowerCase().replaceAll(' ', '-')}-${sequence}`,
    name: template.name,
    blocks,
    rotation: 0,
  };
}

export function rotatePiece(piece: Piece, clockwise: boolean): Piece {
  const turn = clockwise ? 1 : 3;
  const blocks = piece.blocks.map((block) => {
    const rotated = clockwise ? { x: -block.y, y: block.x } : { x: block.y, y: -block.x };
    return {
      ...block,
      x: rotated.x,
      y: rotated.y,
      rotation: normalizeRotation(block.rotation + turn),
    };
  });
  return {
    ...piece,
    blocks,
    rotation: normalizeRotation(piece.rotation + turn),
  };
}

export function getPieceCells(piece: Piece, cursor: BoardPoint): ReadonlyArray<PlacedCell> {
  return piece.blocks.map((block, index) => ({
    x: cursor.x + block.x,
    y: cursor.y + block.y,
    cell: {
      id: `${piece.id}-${index}`,
      kind: block.kind,
      color: block.color,
      rotation: normalizeRotation(block.rotation),
      level: 1,
    },
  }));
}

export function canPlacePiece(board: Board, piece: Piece, cursor: BoardPoint): boolean {
  return getPieceCells(piece, cursor).every(({ x, y }) => isInside(board, x, y) && !getCell(board, x, y));
}

export function placePiece(board: Board, piece: Piece, cursor: BoardPoint): { board: Board; placed: ReadonlyArray<PlacedCell> } {
  const placed = getPieceCells(piece, cursor);
  if (!placed.every(({ x, y }) => isInside(board, x, y) && !getCell(board, x, y))) {
    return { board, placed: [] };
  }
  return { board: setCells(board, placed), placed };
}

export function resolveMatches(board: Board): { board: Board; upgraded: number } {
  const upgradeIndexes = new Set<number>();

  for (let y = 0; y < board.rows; y += 1) {
    collectRuns(board, rowPoints(board, y), upgradeIndexes);
  }
  for (let x = 0; x < board.cols; x += 1) {
    collectRuns(board, columnPoints(board, x), upgradeIndexes);
  }

  if (!upgradeIndexes.size) return { board, upgraded: 0 };

  const cells = board.cells.map((cell, index) => {
    if (!cell || !upgradeIndexes.has(index)) return cell;
    return {
      ...cell,
      level: Math.min(3, cell.level + 1),
      kind: cell.level >= 2 && cell.kind === 'straight' ? 'booster' : cell.kind,
    };
  });

  return {
    board: { ...board, cells },
    upgraded: upgradeIndexes.size,
  };
}

export function findEnergyRoute(board: Board): RouteStats {
  const start = getCell(board, SOURCE_POINT.x, SOURCE_POINT.y);
  if (!start) return emptyRoute();

  const queue: BoardPoint[] = [SOURCE_POINT];
  const visited = new Set<string>([pointKey(SOURCE_POINT)]);
  const parent = new Map<string, string>();
  const distance = new Map<string, number>([[pointKey(SOURCE_POINT), 0]]);
  let best: BoardPoint = SOURCE_POINT;

  while (queue.length) {
    const point = queue.shift();
    if (!point) continue;
    const cell = getCell(board, point.x, point.y);
    if (!cell) continue;

    for (const direction of connectorsFor(cell)) {
      const offset = OFFSETS[direction];
      const next = { x: point.x + offset.x, y: point.y + offset.y };
      if (!isInside(board, next.x, next.y)) continue;

      const neighbor = getCell(board, next.x, next.y);
      if (!neighbor || !connectorsFor(neighbor).includes(opposite(direction))) continue;

      const key = pointKey(next);
      if (visited.has(key)) continue;

      visited.add(key);
      parent.set(key, pointKey(point));
      distance.set(key, (distance.get(pointKey(point)) ?? 0) + 1);
      queue.push(next);

      if (routeScore(next, distance.get(key) ?? 0) > routeScore(best, distance.get(pointKey(best)) ?? 0)) {
        best = next;
      }
    }
  }

  const route = reconstructRoute(best, parent);
  const routeCells = route.map((point) => getCell(board, point.x, point.y)).filter(Boolean) as PipeCell[];
  const colors = new Set(routeCells.map((cell) => cell.color)).size;
  const boosters = routeCells.filter((cell) => cell.kind === 'booster').length;
  const reflectors = routeCells.filter((cell) => cell.kind === 'reflector').length;
  const levelSum = routeCells.reduce((sum, cell) => sum + cell.level, 0);
  const complete = best.x >= board.cols - 2 && best.y <= 3;
  const energy = Math.round(route.length * 12 + levelSum * 5 + boosters * 14 + reflectors * 10 + colors * 9);
  const multiplier = Number((1 + boosters * 0.18 + reflectors * 0.24 + Math.max(0, colors - 1) * 0.16 + levelSum * 0.025).toFixed(2));

  return {
    route,
    energy,
    multiplier,
    boosters,
    reflectors,
    colors,
    levelSum,
    complete,
  };
}

export function connectorsFor(cell: Pick<PipeCell, 'kind' | 'rotation'>): ReadonlyArray<Direction> {
  return BASE_CONNECTORS[cell.kind].map((direction) => rotateDirection(direction, cell.rotation));
}

export function getCell(board: Board, x: number, y: number): PipeCell | null {
  if (!isInside(board, x, y)) return null;
  return board.cells[toIndex(board, x, y)] ?? null;
}

export function boardToWorld(point: BoardPoint, y = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (point.x - BOARD_COLS / 2 + 0.5) * CELL_SIZE,
    y,
    (point.y - BOARD_ROWS / 2 + 0.5) * CELL_SIZE,
  );
}

export function clampCursor(point: BoardPoint): BoardPoint {
  return {
    x: THREE.MathUtils.clamp(point.x, 1, BOARD_COLS - 2),
    y: THREE.MathUtils.clamp(point.y, 1, BOARD_ROWS - 2),
  };
}

export function isInside(board: Board, x: number, y: number): boolean {
  return x >= 0 && x < board.cols && y >= 0 && y < board.rows;
}

export function opposite(direction: Direction): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % DIRECTIONS.length];
}

function seedCell(
  x: number,
  y: number,
  kind: ModuleKind,
  color: PipeColor,
  rotation: number,
  level: number,
): PlacedCell {
  return {
    x,
    y,
    cell: {
      id: `seed-${x}-${y}`,
      kind,
      color,
      rotation,
      level,
      locked: true,
    },
  };
}

function setCells(board: Board, placed: ReadonlyArray<PlacedCell>): Board {
  const cells = board.cells.slice();
  for (const placedCell of placed) {
    cells[toIndex(board, placedCell.x, placedCell.y)] = placedCell.cell;
  }
  return { ...board, cells };
}

function toIndex(board: Board, x: number, y: number): number {
  return y * board.cols + x;
}

function pointKey(point: BoardPoint): string {
  return `${point.x},${point.y}`;
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 4) + 4) % 4;
}

function rotateDirection(direction: Direction, rotation: number): Direction {
  return DIRECTIONS[(DIRECTIONS.indexOf(direction) + normalizeRotation(rotation)) % DIRECTIONS.length];
}

function collectRuns(board: Board, points: ReadonlyArray<BoardPoint>, upgradeIndexes: Set<number>): void {
  let run: BoardPoint[] = [];
  let color: PipeColor | null = null;

  const flush = () => {
    if (run.length >= 3) {
      for (const point of run) {
        upgradeIndexes.add(toIndex(board, point.x, point.y));
      }
    }
    run = [];
    color = null;
  };

  for (const point of points) {
    const cell = getCell(board, point.x, point.y);
    if (!cell) {
      flush();
      continue;
    }
    if (cell.color !== color) {
      flush();
      color = cell.color;
    }
    run = [...run, point];
  }
  flush();
}

function rowPoints(board: Board, y: number): ReadonlyArray<BoardPoint> {
  return Array.from({ length: board.cols }, (_, x) => ({ x, y }));
}

function columnPoints(board: Board, x: number): ReadonlyArray<BoardPoint> {
  return Array.from({ length: board.rows }, (_, y) => ({ x, y }));
}

function routeScore(point: BoardPoint, distance: number): number {
  return distance * 10 + point.x * 1.6 - point.y * 0.45;
}

function reconstructRoute(best: BoardPoint, parent: Map<string, string>): ReadonlyArray<BoardPoint> {
  const route: BoardPoint[] = [best];
  let key = pointKey(best);
  while (parent.has(key)) {
    const previous = parent.get(key);
    if (!previous) break;
    const [x, y] = previous.split(',').map(Number);
    route.unshift({ x, y });
    key = previous;
  }
  return route;
}

function emptyRoute(): RouteStats {
  return {
    route: [],
    energy: 0,
    multiplier: 1,
    boosters: 0,
    reflectors: 0,
    colors: 0,
    levelSum: 0,
    complete: false,
  };
}
