import { describe, expect, it } from 'vitest';
import { deriveWeaponProfile } from '../../src/game/weaponProfile';
import type { RouteStats } from '../../src/game/types';

function statsWithColors(counts: RouteStats['colorCounts']): RouteStats {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    route: [],
    energy: total * 10,
    multiplier: 1,
    boosters: 0,
    reflectors: 0,
    colors: Object.values(counts).filter((value) => value > 0).length,
    levelSum: 0,
    complete: true,
    estimatedRushSeconds: 8,
    colorCounts: counts,
    dominantColor: 'amber',
    oneWays: 0,
  };
}

describe('weaponProfile', () => {
  it('picks amber blast shell for pure amber routes', () => {
    const profile = deriveWeaponProfile(statsWithColors({ cyan: 0, amber: 12, magenta: 0, lime: 0 }));
    expect(profile.element).toBe('amber');
    expect(profile.label).toBe('Blast Shell');
  });

  it('uses cyan priority on ties', () => {
    const profile = deriveWeaponProfile(statsWithColors({ cyan: 8, amber: 8, magenta: 0, lime: 0 }));
    expect(profile.element).toBe('cyan');
  });

  it('returns mixed for balanced multi-color routes', () => {
    const profile = deriveWeaponProfile(statsWithColors({ cyan: 9, amber: 9, magenta: 8, lime: 0 }));
    expect(profile.element).toBe('mixed');
    expect(profile.label).toBe('Hybrid Volley');
  });
});
