export type Direction = 'N' | 'E' | 'S' | 'W';

export type PipeColor = 'cyan' | 'amber' | 'magenta' | 'lime';

export type ModuleKind =
  | 'source'
  | 'drain'
  | 'straight'
  | 'elbow'
  | 'tee'
  | 'cross'
  | 'reservoir'
  | 'oneWay'
  | 'obstacle'
  | 'crack'
  | 'well';

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
  readonly source?: BoardPoint;
  readonly drain?: BoardPoint;
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
  readonly estimatedRushSeconds: number;
  readonly colorCounts: Readonly<Record<PipeColor, number>>;
  readonly dominantColor: PipeColor | null;
  readonly oneWays: number;
};

export type RouteComparison = {
  readonly shortest: RouteStats;
  readonly loopPotential: RouteStats;
};

export type Phase =
  | 'build'
  | 'flow'
  | 'rush_ready'
  | 'rush'
  | 'paused'
  | 'failed'
  | 'sector_cleared'
  | 'relic_pick'
  | 'run_cleared';

export type ViewMode = '2d' | '2.5d';

export type FlowStatus = 'waiting' | 'flowing' | 'drain' | 'leak' | 'blocked';

export type FlowTrace = {
  readonly path: ReadonlyArray<BoardPoint>;
  readonly status: FlowStatus;
  readonly leakAt: BoardPoint | null;
};

export type RelicCategory = 'build' | 'flow' | 'rush' | 'route';

export type Relic = {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly category: RelicCategory;
  readonly value: number;
};

export type RelicModifiers = {
  skipPenalty: number;
  replacePenalty: number;
  placeBonus: number;
  flowSpeedMultiplier: number;
  fastFlowMultiplier: number;
  leakIgnoresHp: boolean;
  leakMultiplierPenalty: number;
  scatterFire: boolean;
  reservoirHeal: number;
  crossPlayerChoice: boolean;
  autoAimOnly: boolean;
  floodAdjacentPlace: boolean;
  rushSpeedBonus: number;
  fireRateBonus: number;
  bossDamageBonus: number;
  ignoreCracks: boolean;
  oneWayEnergyBonus: number;
  loopMultiplierBonus: number;
  chainScoreBonus: number;
  hullPlateBonus: number;
  killScoreBonus: number;
  dailyClearBonus: number;
  queuePreviewBonus: number;
};

export type WeaponElement = PipeColor | 'mixed';

export type WeaponProfile = {
  readonly element: WeaponElement;
  readonly pierce: boolean;
  readonly splashRadius: number;
  readonly slowDuration: number;
  readonly healOnKill: number;
  readonly label: string;
};

export type SectorConfig = {
  readonly index: number;
  readonly seed: number;
  readonly source: BoardPoint;
  readonly drain: BoardPoint;
  readonly obstacles: ReadonlyArray<BoardPoint>;
  readonly cracks: ReadonlyArray<BoardPoint>;
  readonly wells: ReadonlyArray<BoardPoint>;
  readonly isBoss: boolean;
  readonly narrative: string;
  readonly title: string;
};

export type RushPreview = {
  readonly energy: number;
  readonly multiplier: number;
  readonly weaponLabel: string;
  readonly weaponElement: WeaponElement;
  readonly boostZones: number;
  readonly crossJunctions: number;
  readonly rushSeconds: number;
  readonly hullLayers: number;
};
