import * as THREE from 'three';
import { BOARD_COLS, BOARD_ROWS, CELL_SIZE, DRAIN_POINT, SOURCE_POINT } from './constants';
import type {
  Board,
  BoardPoint,
  Direction,
  FlowTrace,
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
  source: ['E'],
  drain: ['W'],
  straight: ['N', 'S'],
  elbow: ['N', 'E'],
  tee: ['W', 'N', 'E'],
  cross: ['N', 'E', 'S', 'W'],
  reservoir: ['W', 'E'],
  oneWay: ['W', 'E'],
};

const COLORS: ReadonlyArray<PipeColor> = ['cyan', 'amber', 'magenta', 'lime'];

const PIECE_TEMPLATES: ReadonlyArray<{
  readonly name: string;
  readonly blocks: ReadonlyArray<Omit<PieceBlock, 'color'>>;
}> = [
  {
    name: 'Straight',
    blocks: [
      { x: 0, y: 0, kind: 'straight', rotation: 1 },
    ],
  },
  {
    name: 'Elbow',
    blocks: [
      { x: 0, y: 0, kind: 'elbow', rotation: 1 },
    ],
  },
  {
    name: 'Cross',
    blocks: [
      { x: 0, y: 0, kind: 'cross', rotation: 0 },
    ],
  },
  {
    name: 'T Split',
    blocks: [
      { x: 0, y: 0, kind: 'tee', rotation: 1 },
    ],
  },
  {
    name: 'Reservoir',
    blocks: [
      { x: 0, y: 0, kind: 'reservoir', rotation: 0 },
    ],
  },
  {
    name: 'One Way',
    blocks: [
      { x: 0, y: 0, kind: 'oneWay', rotation: 0 },
    ],
  },
];

export function createInitialBoard(): Board {
  const empty = createEmptyBoard(BOARD_COLS, BOARD_ROWS);
  const seedCells: ReadonlyArray<PlacedCell> = [
    seedCell(SOURCE_POINT.x, SOURCE_POINT.y, 'source', 'cyan', 0, 1),
    seedCell(DRAIN_POINT.x, DRAIN_POINT.y, 'drain', 'lime', 0, 1),
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

export function replacePiece(
  board: Board,
  piece: Piece,
  cursor: BoardPoint,
  flooded?: ReadonlySet<string>,
): { board: Board; placed: ReadonlyArray<PlacedCell> } {
  const placed = getPieceCells(piece, cursor);
  if (!placed.every(({ x, y }) => isInside(board, x, y))) {
    return { board, placed: [] };
  }
  const cells = board.cells.slice();
  for (const placedCell of placed) {
    const key = `${placedCell.x},${placedCell.y}`;
    const existing = getCell(board, placedCell.x, placedCell.y);
    if (existing?.locked || flooded?.has(key)) return { board, placed: [] };
    cells[toIndex(board, placedCell.x, placedCell.y)] = placedCell.cell;
  }
  return { board: { ...board, cells }, placed };
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
  const boosters = routeCells.filter((cell) => cell.kind === 'reservoir').length;
  const reflectors = routeCells.filter((cell) => cell.kind === 'cross').length;
  const levelSum = routeCells.reduce((sum, cell) => sum + cell.level, 0);
  const complete = best.x === DRAIN_POINT.x && best.y === DRAIN_POINT.y;
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
  if (cell.kind === 'source' || cell.kind === 'drain') return BASE_CONNECTORS[cell.kind];
  return BASE_CONNECTORS[cell.kind].map((direction) => rotateDirection(direction, cell.rotation));
}

export function traceFlow(board: Board): FlowTrace {
  const path: BoardPoint[] = [SOURCE_POINT];
  let current: BoardPoint = SOURCE_POINT;
  let incoming: Direction | null = null;
  const visitedEdges = new Set<string>();

  for (let step = 0; step < board.cols * board.rows * 2; step += 1) {
    const cell = getCell(board, current.x, current.y);
    if (!cell) return { path, status: 'leak', leakAt: current };
    if (cell.kind === 'drain') return { path, status: 'drain', leakAt: null };

    const connectors = connectorsFor(cell);
    if (incoming && !connectors.includes(incoming)) {
      return { path, status: 'blocked', leakAt: current };
    }

    const exit = chooseExit(cell, connectors, incoming);
    if (!exit) return { path, status: 'leak', leakAt: current };

    const edgeKey = `${current.x},${current.y},${exit}`;
    if (visitedEdges.has(edgeKey)) return { path, status: 'flowing', leakAt: null };
    visitedEdges.add(edgeKey);

    const offset = OFFSETS[exit];
    const next = { x: current.x + offset.x, y: current.y + offset.y };
    if (!isInside(board, next.x, next.y)) {
      return { path, status: 'leak', leakAt: next };
    }

    const nextCell = getCell(board, next.x, next.y);
    if (!nextCell) {
      return { path: [...path, next], status: 'leak', leakAt: next };
    }

    const nextIncoming = opposite(exit);
    if (!connectorsFor(nextCell).includes(nextIncoming)) {
      return { path: [...path, next], status: 'blocked', leakAt: next };
    }

    path.push(next);
    current = next;
    incoming = nextIncoming;
  }

  return { path, status: 'flowing', leakAt: null };
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

function chooseExit(cell: Pick<PipeCell, 'kind' | 'rotation'>, connectors: ReadonlyArray<Direction>, incoming: Direction | null): Direction | null {
  if (cell.kind === 'source') return 'E';
  if (cell.kind === 'drain') return null;
  if (cell.kind === 'oneWay') {
    const exits = connectorsFor(cell);
    return incoming === exits[0] ? exits[1] : null;
  }
  if (!incoming) return connectors[0] ?? null;
  const straight = opposite(incoming);
  if (connectors.includes(straight)) return straight;
  return connectors.find((direction) => direction !== incoming) ?? null;
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
