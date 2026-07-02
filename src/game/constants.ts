export const BOARD_COLS = 12;
export const BOARD_ROWS = 9;
export const CELL_SIZE = 1.12;
export const SOURCE_POINT = { x: 0, y: 7 } as const;
export const RUSH_MIN_ROUTE = 5;
export const BUILD_REPEAT_SECONDS = 0.14;

export const ARENA = {
  halfWidth: (BOARD_COLS * CELL_SIZE) / 2 + 2.4,
  halfDepth: (BOARD_ROWS * CELL_SIZE) / 2 + 2.2,
} as const;
