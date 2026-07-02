export function dailySeed(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function seedToNumber(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

export function isDailyRun(runSeed: number, date = new Date()): boolean {
  return runSeed === seedToNumber(dailySeed(date));
}

export type RunMode = {
  readonly seed: number;
  readonly isDaily: boolean;
  readonly label: string;
};

export function parseRunModeFromUrl(search = typeof window !== 'undefined' ? window.location.search : ''): RunMode {
  const params = new URLSearchParams(search);
  if (params.has('daily')) {
    const seed = dailySeed();
    return { seed: seedToNumber(seed), isDaily: true, label: 'DAILY' };
  }
  const seedParam = params.get('seed');
  if (seedParam) {
    const numeric = Number(seedParam);
    const seed = Number.isFinite(numeric) ? Math.floor(numeric) : seedToNumber(seedParam);
    return { seed: seed || 1, isDaily: false, label: `SEED ${seedParam}` };
  }
  const randomSeed = Math.floor(Math.random() * 2147483647) || 1;
  return { seed: randomSeed, isDaily: false, label: 'FREE RUN' };
}
