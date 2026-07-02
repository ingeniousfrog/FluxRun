import { describe, expect, it } from 'vitest';
import { loadMeta, unlockRelicsForRun } from '../../src/game/MetaProgress';
import { applyRelicToRouteStats, computeModifiers, relicById } from '../../src/game/relics';
import type { RouteStats } from '../../src/game/types';

const baseStats: RouteStats = {
  route: Array.from({ length: 18 }, (_, index) => ({ x: index, y: 0 })),
  energy: 200,
  multiplier: 1.4,
  boosters: 1,
  reflectors: 0,
  colors: 2,
  levelSum: 4,
  complete: true,
  estimatedRushSeconds: 12,
  colorCounts: { cyan: 2, amber: 14, magenta: 0, lime: 2 },
  dominantColor: 'amber',
  oneWays: 2,
};

describe('relic modifiers', () => {
  it('slow-flow and pressure-boost stack without overwriting', () => {
    const slow = relicById('slow-flow');
    const pressure = relicById('pressure-boost');
    expect(slow).toBeTruthy();
    expect(pressure).toBeTruthy();
    const mods = computeModifiers([slow!, pressure!]);
    expect(mods.flowSpeedMultiplier).toBe(0.7);
    expect(mods.fastFlowMultiplier).toBe(1.5);
  });

  it('one-way-gate adds energy per one-way cell', () => {
    const gate = relicById('one-way-gate');
    const boosted = applyRelicToRouteStats(baseStats, gate ? [gate] : []);
    expect(boosted.energy).toBe(baseStats.energy + 20);
  });

  it('loop-hunter raises multiplier on long routes', () => {
    const hunter = relicById('loop-hunter');
    const boosted = applyRelicToRouteStats(baseStats, hunter ? [hunter] : []);
    expect(boosted.multiplier).toBeCloseTo(baseStats.multiplier + 0.15, 2);
  });

  it('unlockRelicsForRun expands pool after enough runs', () => {
    const meta = { ...loadMeta(), runsPlayed: 4 };
    const { meta: next, newIds } = unlockRelicsForRun(meta, 1);
    expect(next.unlockedRelicIds.length).toBeGreaterThan(meta.unlockedRelicIds.length);
    expect(newIds.length).toBeGreaterThan(0);
  });
});
