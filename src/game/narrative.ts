import type { SectorConfig } from './types';

const SECTOR_LOGS: ReadonlyArray<{ title: string; narrative: string }> = [
  {
    title: 'Sector 01 — Intake Bay',
    narrative: 'LOG:// Relay coolant through the collapsed intake. The drain still pulls. Something downstream is hungry.',
  },
  {
    title: 'Sector 02 — Spill Tunnels',
    narrative: 'LOG:// Pressure spikes in the spill tunnels. Crack grids leak integrity. Route longer loops to overcharge the tank.',
  },
  {
    title: 'Sector 03 — Core Lock',
    narrative: 'LOG:// Final gate. A sentry occupies the main line. Build a loop wide enough to survive the rush, then punch through.',
  },
];

export function narrativeForSector(index: number): { title: string; narrative: string } {
  return SECTOR_LOGS[Math.min(index, SECTOR_LOGS.length - 1)] ?? SECTOR_LOGS[0];
}

export function applyNarrativeToSector(config: SectorConfig): SectorConfig {
  const story = narrativeForSector(config.index);
  return { ...config, title: story.title, narrative: story.narrative };
}

export const RUN_VICTORY_LOG =
  'LOG:// Circuit complete. All sectors flooded and drained. The hover tank returns to standby — for now.';

export const RUN_FAILURE_LOG =
  'LOG:// Integrity lost. The line collapses. Rebuild from intake and try a different loop.';
