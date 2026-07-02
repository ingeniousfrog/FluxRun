export const BOARD_COLS = 16;
export const BOARD_ROWS = 11;
export const CELL_SIZE = 1.12;
export const SOURCE_POINT = { x: 0, y: 5 } as const;
export const DRAIN_POINT = { x: 15, y: 5 } as const;
export const TARGET_PIPE_LENGTH = 16;
export const FLOW_CELLS_PER_SECOND = 1.05;
export const BUILD_REPEAT_SECONDS = 0.14;

export const ARENA = {
  halfWidth: (BOARD_COLS * CELL_SIZE) / 2 + 2.4,
  halfDepth: (BOARD_ROWS * CELL_SIZE) / 2 + 2.2,
} as const;
