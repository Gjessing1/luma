import type { Playlist, Screen } from '@luma/core/playlist';
import type { Target } from '@luma/core/wallpaper';

export const intervals: [number, string][] = [
  [15, '15 minutes'],
  [30, '30 minutes'],
  [60, 'hour'],
  [180, '3 hours'],
  [360, '6 hours'],
  [720, '12 hours'],
  [1440, 'day'],
];
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
  playlist: Pick<Playlist, 'mode' | 'intervalMinutes' | 'dailyTimes' | 'shuffle'>,
): string {
  let when = `Daily at ${playlist.dailyTimes.join(', ')}`;
  if (playlist.mode === 'interval') {
    const known = intervals.find(([minutes]) => minutes === playlist.intervalMinutes);
    when = `Every ${known ? known[1] : `${playlist.intervalMinutes} minutes`}`;
  }
  return `${when} · ${playlist.shuffle ? 'shuffled' : 'in order'}`;
}
