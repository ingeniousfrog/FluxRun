import { ALL_RELICS } from './relics';

const STORAGE_KEY = 'fluxrun_meta_v1';

export type MetaData = {
  bestScore: number;
  bestSector: number;
  runsPlayed: number;
  unlockedRelicIds: string[];
  lastDailySeed: string;
  lastDailyScore: number;
};

const DEFAULT_META: MetaData = {
  bestScore: 0,
  bestSector: 0,
  runsPlayed: 0,
  unlockedRelicIds: [
    'skip-free',
    'slow-flow',
    'scatter',
    'cross-steer',
    'reservoir-heal',
    'flood-adjacent',
  ],
  lastDailySeed: '',
  lastDailyScore: 0,
};

export function loadMeta(): MetaData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_META };
    const parsed = JSON.parse(raw) as Partial<MetaData>;
    return {
      ...DEFAULT_META,
      ...parsed,
      unlockedRelicIds: parsed.unlockedRelicIds ?? DEFAULT_META.unlockedRelicIds,
    };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function saveMeta(meta: MetaData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export function unlockRelicsForRun(meta: MetaData, sectorReached: number): { meta: MetaData; newIds: string[] } {
  void sectorReached;
  const unlocked = new Set(meta.unlockedRelicIds);
  const newIds: string[] = [];
  const eligibleRuns = meta.runsPlayed + 1;
  for (const relic of ALL_RELICS) {
    if (relic.unlockAfterRuns <= eligibleRuns && !unlocked.has(relic.id)) {
      unlocked.add(relic.id);
      newIds.push(relic.id);
    }
  }
  return {
    meta: { ...meta, unlockedRelicIds: [...unlocked] },
    newIds,
  };
}

export function recordRunResult(meta: MetaData, score: number, sectorReached: number, newRelicIds: string[]): MetaData {
  const unlocked = new Set(meta.unlockedRelicIds);
  for (const id of newRelicIds) unlocked.add(id);
  return {
    ...meta,
    bestScore: Math.max(meta.bestScore, score),
    bestSector: Math.max(meta.bestSector, sectorReached),
    runsPlayed: meta.runsPlayed + 1,
    unlockedRelicIds: [...unlocked],
  };
}

export function recordDailyScore(meta: MetaData, seed: string, score: number): MetaData {
  const improved = meta.lastDailySeed !== seed || score > meta.lastDailyScore;
  return {
    ...meta,
    lastDailySeed: seed,
    lastDailyScore: improved ? score : meta.lastDailyScore,
  };
}
