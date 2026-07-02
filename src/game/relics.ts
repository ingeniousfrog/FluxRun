import type { Relic, RelicModifiers, RouteStats } from './types';
import { TARGET_PIPE_LENGTH } from './constants';

export const DEFAULT_MODIFIERS: RelicModifiers = {
  skipPenalty: 10,
  replacePenalty: 25,
  placeBonus: 5,
  flowSpeedMultiplier: 1,
  fastFlowMultiplier: 1,
  leakIgnoresHp: false,
  leakMultiplierPenalty: 0,
  scatterFire: false,
  reservoirHeal: 0,
  crossPlayerChoice: false,
  autoAimOnly: false,
  floodAdjacentPlace: false,
  rushSpeedBonus: 0,
  fireRateBonus: 0,
  bossDamageBonus: 0,
  ignoreCracks: false,
  oneWayEnergyBonus: 0,
  loopMultiplierBonus: 0,
  chainScoreBonus: 20,
  hullPlateBonus: 0,
  killScoreBonus: 0,
  dailyClearBonus: 0,
  queuePreviewBonus: 0,
};

export const ALL_RELICS: ReadonlyArray<Relic & { unlockAfterRuns: number }> = [
  { id: 'skip-free', name: 'Queue Bypass', short: 'Skip pipe costs no score', category: 'build', value: 0, unlockAfterRuns: 0 },
  { id: 'cheap-replace', name: 'Soft Swap', short: 'Replace penalty halved', category: 'build', value: 0, unlockAfterRuns: 1 },
  { id: 'flood-adjacent', name: 'Wet Edge', short: 'Place beside flooded cells', category: 'build', value: 0, unlockAfterRuns: 0 },
  { id: 'long-queue', name: 'Deep Queue', short: '+2 visible pipe previews', category: 'build', value: 2, unlockAfterRuns: 3 },
  { id: 'slow-flow', name: 'Thick Coolant', short: 'Water speed -30%', category: 'flow', value: 0, unlockAfterRuns: 0 },
  { id: 'leak-buffer', name: 'Seal Foam', short: 'Leaks cost multiplier, not hull', category: 'flow', value: 0, unlockAfterRuns: 2 },
  { id: 'pressure-boost', name: 'Overpressure', short: 'FAST speeds flow +50%', category: 'flow', value: 0, unlockAfterRuns: 4 },
  { id: 'scatter', name: 'Fork Volley', short: 'Rush fire splits into 3 shots', category: 'rush', value: 0, unlockAfterRuns: 0 },
  { id: 'reservoir-heal', name: 'Coolant Bath', short: 'Reservoir zones heal +1 hull', category: 'rush', value: 1, unlockAfterRuns: 0 },
  { id: 'afterburner', name: 'Afterburner', short: 'Rush speed +18%', category: 'rush', value: 0, unlockAfterRuns: 2 },
  { id: 'rapid-coil', name: 'Rapid Coil', short: 'Fire rate +25%', category: 'rush', value: 0, unlockAfterRuns: 3 },
  { id: 'cross-steer', name: 'Junction Key', short: 'Steer at cross junctions', category: 'route', value: 0, unlockAfterRuns: 0 },
  { id: 'loop-hunter', name: 'Loop Hunter', short: 'Long loops +0.15 multiplier', category: 'route', value: 0, unlockAfterRuns: 1 },
  { id: 'one-way-gate', name: 'Check Valve', short: 'One-way cells +10 energy each', category: 'route', value: 10, unlockAfterRuns: 2 },
  { id: 'color-amp', name: 'Chromatic Amp', short: 'Color chains +30 score', category: 'route', value: 30, unlockAfterRuns: 4 },
  { id: 'boss-slayer', name: 'Core Piercer', short: 'Boss damage +50%', category: 'rush', value: 0, unlockAfterRuns: 5 },
  { id: 'hull-plate', name: 'Hull Plate', short: 'Start rush with +1 hull layer', category: 'rush', value: 1, unlockAfterRuns: 3 },
  { id: 'energy-siphon', name: 'Energy Siphon', short: 'Kills restore +5 energy score', category: 'rush', value: 5, unlockAfterRuns: 4 },
  { id: 'crack-seal', name: 'Crack Seal', short: 'Crack tiles no longer leak', category: 'flow', value: 0, unlockAfterRuns: 5 },
  { id: 'daily-spark', name: 'Daily Spark', short: 'Daily run +100 clear bonus', category: 'route', value: 100, unlockAfterRuns: 1 },
];

export function computeModifiers(selected: ReadonlyArray<Relic>): RelicModifiers {
  const mods = { ...DEFAULT_MODIFIERS };
  const ids = new Set(selected.map((relic) => relic.id));

  if (ids.has('skip-free')) mods.skipPenalty = 0;
  if (ids.has('cheap-replace')) mods.replacePenalty = 12;
  if (ids.has('flood-adjacent')) mods.floodAdjacentPlace = true;
  if (ids.has('slow-flow')) mods.flowSpeedMultiplier = 0.7;
  if (ids.has('leak-buffer')) mods.leakIgnoresHp = true;
  if (ids.has('leak-buffer')) mods.leakMultiplierPenalty = 0.12;
  if (ids.has('pressure-boost')) mods.fastFlowMultiplier = 1.5;
  if (ids.has('scatter')) mods.scatterFire = true;
  if (ids.has('reservoir-heal')) mods.reservoirHeal = 1;
  if (ids.has('afterburner')) mods.rushSpeedBonus = 0.18;
  if (ids.has('rapid-coil')) mods.fireRateBonus = 0.25;
  if (ids.has('cross-steer')) mods.crossPlayerChoice = true;
  if (ids.has('boss-slayer')) mods.bossDamageBonus = 0.5;
  if (ids.has('loop-hunter')) mods.loopMultiplierBonus = 0.15;
  if (ids.has('one-way-gate')) mods.oneWayEnergyBonus = 10;
  if (ids.has('color-amp')) mods.chainScoreBonus = 30;
  if (ids.has('hull-plate')) mods.hullPlateBonus = 1;
  if (ids.has('energy-siphon')) mods.killScoreBonus = 5;
  if (ids.has('crack-seal')) mods.ignoreCracks = true;
  if (ids.has('daily-spark')) mods.dailyClearBonus = 100;
  if (ids.has('long-queue')) mods.queuePreviewBonus = 2;

  return mods;
}

export function applyRelicToRouteStats(stats: RouteStats, relics: ReadonlyArray<Relic>): RouteStats {
  const mods = computeModifiers(relics);
  let energy = stats.energy + mods.oneWayEnergyBonus * stats.oneWays;
  let multiplier = stats.multiplier;
  if (mods.loopMultiplierBonus > 0 && stats.route.length > TARGET_PIPE_LENGTH) {
    multiplier = Number((multiplier + mods.loopMultiplierBonus).toFixed(2));
  }
  return { ...stats, energy, multiplier };
}

export function pickRelicChoices(
  unlockedIds: ReadonlyArray<string>,
  runsPlayed: number,
  count: number,
  excludeIds: ReadonlySet<string>,
  rng: () => number,
): Relic[] {
  const pool = ALL_RELICS.filter(
    (relic) =>
      unlockedIds.includes(relic.id) &&
      !excludeIds.has(relic.id) &&
      relic.unlockAfterRuns <= runsPlayed,
  );
  const shuffled = [...pool].sort(() => rng() - 0.5);
  return shuffled.slice(0, count).map(({ unlockAfterRuns: _, ...relic }) => relic);
}

export function relicById(id: string): Relic | null {
  const found = ALL_RELICS.find((relic) => relic.id === id);
  if (!found) return null;
  const { unlockAfterRuns: _, ...relic } = found;
  return relic;
}

export function hasRelic(selected: ReadonlyArray<Relic>, id: string): boolean {
  return selected.some((relic) => relic.id === id);
}
