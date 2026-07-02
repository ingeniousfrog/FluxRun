import type { PipeColor, RouteStats, WeaponElement, WeaponProfile } from './types';

const ELEMENT_LABELS: Record<PipeColor, string> = {
  cyan: 'Pierce Beam',
  amber: 'Blast Shell',
  magenta: 'Slow Field',
  lime: 'Repair Pulse',
};

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
  if (routeStats.colors <= 1) return 'cyan';
  if (routeStats.colors === 2) return routeStats.reflectors > routeStats.boosters ? 'magenta' : 'amber';
  if (routeStats.colors === 3) return 'lime';
  return 'mixed';
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
