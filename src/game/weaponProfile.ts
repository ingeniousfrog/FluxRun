import type { PipeColor, RouteStats, WeaponElement, WeaponProfile } from './types';

const ELEMENT_LABELS: Record<PipeColor, string> = {
  cyan: 'Pierce Beam',
  amber: 'Blast Shell',
  magenta: 'Slow Field',
  lime: 'Repair Pulse',
};

const COLOR_PRIORITY: PipeColor[] = ['cyan', 'amber', 'magenta', 'lime'];

export function deriveWeaponProfile(routeStats: RouteStats): WeaponProfile {
  const dominant = pickDominantColor(routeStats);
  if (dominant === 'mixed') {
    return {
      element: 'mixed',
      pierce: false,
      splashRadius: 0.8,
      slowDuration: 0,
      healOnKill: 0,
      label: 'Hybrid Volley',
    };
  }

  return profileForColor(dominant);
}

function pickDominantColor(routeStats: RouteStats): WeaponElement {
  const counts = routeStats.colorCounts;
  const total = COLOR_PRIORITY.reduce((sum, color) => sum + counts[color], 0);
  if (total === 0) return 'cyan';

  const ranked = [...COLOR_PRIORITY].sort((a, b) => counts[b] - counts[a]);
  const top = counts[ranked[0]];
  const second = counts[ranked[1]];
  const kinds = COLOR_PRIORITY.filter((color) => counts[color] > 0).length;

  if (kinds >= 3 && second > 0 && top > 0 && (top - second) / top < 0.1) {
    return 'mixed';
  }

  return ranked[0];
}

function profileForColor(color: PipeColor): WeaponProfile {
  switch (color) {
    case 'cyan':
      return {
        element: 'cyan',
        pierce: true,
        splashRadius: 0,
        slowDuration: 0,
        healOnKill: 0,
        label: ELEMENT_LABELS.cyan,
      };
    case 'amber':
      return {
        element: 'amber',
        pierce: false,
        splashRadius: 1.4,
        slowDuration: 0,
        healOnKill: 0,
        label: ELEMENT_LABELS.amber,
      };
    case 'magenta':
      return {
        element: 'magenta',
        pierce: false,
        splashRadius: 0,
        slowDuration: 1.8,
        healOnKill: 0,
        label: ELEMENT_LABELS.magenta,
      };
    case 'lime':
      return {
        element: 'lime',
        pierce: false,
        splashRadius: 0,
        slowDuration: 0,
        healOnKill: 1,
        label: ELEMENT_LABELS.lime,
      };
  }
}

export function weaponColorHex(element: WeaponElement): string {
  switch (element) {
    case 'cyan': return '#42d9ff';
    case 'amber': return '#ffbd4a';
    case 'magenta': return '#ff5ec8';
    case 'lime': return '#9cf15f';
    case 'mixed': return '#f4f0e5';
  }
}
