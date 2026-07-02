import type { Relic } from './types';

export type RunState = {
  runSeed: number;
  sectorIndex: number;
  totalSectors: number;
  runScore: number;
  selectedRelics: Relic[];
  isDaily: boolean;
};

export const SECTOR_COUNT = 3;

export function createRunState(runSeed: number, isDaily = false): RunState {
  return {
    runSeed,
    sectorIndex: 0,
    totalSectors: SECTOR_COUNT,
    runScore: 0,
    selectedRelics: [],
    isDaily,
  };
}

export function advanceSector(run: RunState): RunState {
  return {
    ...run,
    sectorIndex: run.sectorIndex + 1,
  };
}

export function addRelicToRun(run: RunState, relic: Relic): RunState {
  return {
    ...run,
    selectedRelics: [...run.selectedRelics, relic],
  };
}

export function isRunComplete(run: RunState): boolean {
  return run.sectorIndex >= run.totalSectors;
}

export function needsRelicPick(run: RunState): boolean {
  return run.sectorIndex > 0 && run.sectorIndex < run.totalSectors;
}
