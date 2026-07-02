export type Direction = 'N' | 'E' | 'S' | 'W';

export type PipeColor = 'cyan' | 'amber' | 'magenta' | 'lime';

export type ModuleKind = 'straight' | 'elbow' | 'tee' | 'cross' | 'booster' | 'reflector';

export type BoardPoint = {
  readonly x: number;
  readonly y: number;
};

export type PipeCell = {
  readonly id: string;
  readonly kind: ModuleKind;
  readonly color: PipeColor;
  readonly rotation: number;
  readonly level: number;
  readonly locked?: boolean;
};

export type Board = {
  readonly cols: number;
  readonly rows: number;
  readonly cells: ReadonlyArray<PipeCell | null>;
};

export type PieceBlock = {
  readonly x: number;
  readonly y: number;
  readonly kind: ModuleKind;
  readonly color: PipeColor;
  readonly rotation: number;
};

export type Piece = {
  readonly id: string;
  readonly name: string;
  readonly blocks: ReadonlyArray<PieceBlock>;
  readonly rotation: number;
};

export type PlacedCell = BoardPoint & {
  readonly cell: PipeCell;
};

export type RouteStats = {
  readonly route: ReadonlyArray<BoardPoint>;
  readonly energy: number;
  readonly multiplier: number;
  readonly boosters: number;
  readonly reflectors: number;
  readonly colors: number;
  readonly levelSum: number;
  readonly complete: boolean;
};

export type Phase = 'build' | 'rush' | 'paused' | 'failed' | 'cleared';

export type Relic = {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly value: number;
};
