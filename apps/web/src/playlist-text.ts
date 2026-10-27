import type { Playlist, Screen } from '@luma/core/playlist';
import type { Target } from '@luma/core/wallpaper';

export const intervals: [number, string][] = [
  [15, '15 min'],
  [30, '30 min'],
  [60, '1 hour'],
  [180, '3 hours'],
  [360, '6 hours'],
  [720, '12 hours'],
  [1440, '1 day'],
];
export function intervalLabel(minutes: number): string {
  const known = intervals.find(([n]) => n === minutes);
  if (known) return known[1];
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} min`;
}
export function destinationLabel(target: Target): string {
  if (target === 'both') return 'Home & lock screen';
  if (target === 'home') return 'Home screen';
  return 'Lock screen';
}
export function screensLabel(screens: Screen[]): string {
  if (screens.length === 2) return 'home & lock screen';
  return `${screens[0]} screen`;
}
export function scheduleLabel(
  playlist: Pick<Playlist, 'mode' | 'intervalMinutes' | 'dailyTimes' | 'shuffle'> & {
    ids: string[];
  },
): string {
  if (playlist.mode === 'timed') return `By time of day · ${playlist.ids.length} start times`;
  let when = `Daily at ${playlist.dailyTimes.join(', ')}`;
  // "Every hour" reads better than "Every 1 hour".
  if (playlist.mode === 'interval')
    when = `Every ${intervalLabel(playlist.intervalMinutes).replace(/^1 /, '')}`;
  return `${when} · ${playlist.shuffle ? 'shuffled' : 'in order'}`;
}
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
