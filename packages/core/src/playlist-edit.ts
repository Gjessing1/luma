import { timedOrder, type Playlist } from './playlist.js';

const day = 24 * 60;

// The order the playlist shows and runs in: start times for a timed playlist, else its own.
export function playlistOrder(playlist: Playlist): string[] {
  return playlist.mode === 'timed' ? timedOrder(playlist) : playlist.ids;
}
export function addToPlaylist(playlist: Playlist, ids: string[]): Playlist {
  const added = ids.filter((id) => !playlist.ids.includes(id));
  const next = { ...playlist, ids: [...playlist.ids, ...added] };
  return playlist.mode === 'timed' ? withStartTimes(next) : next;
}
// Start times go with the wallpaper, so adding it back later suggests a fresh time.
export function removeFromPlaylist(playlist: Playlist, ids: string[]): Playlist {
  const startTimes = { ...playlist.startTimes };
  for (const id of ids) delete startTimes[id];
  return { ...playlist, ids: playlist.ids.filter((id) => !ids.includes(id)), startTimes };
}
// Moves within playlistOrder. In a timed playlist the times stay in place and the wallpapers
// move between them, because dragging by time order would otherwise undo itself.
export function moveInPlaylist(playlist: Playlist, from: number, to: number): Playlist {
  const order = [...playlistOrder(playlist)];
  if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to)
    return playlist;
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved!);
  if (playlist.mode !== 'timed') return { ...playlist, ids: order };
  const times = timedOrder(playlist).map((id) => playlist.startTimes[id]);
  const startTimes = { ...playlist.startTimes };
  for (const [index, id] of order.entries()) {
    const time = times[index];
    if (time === undefined) delete startTimes[id];
    else startTimes[id] = time;
  }
  return { ...playlist, startTimes };
}
export function setStartTime(playlist: Playlist, id: string, time: string): Playlist {
  return { ...playlist, startTimes: { ...playlist.startTimes, [id]: time } };
}
export function setMode(playlist: Playlist, mode: Playlist['mode']): Playlist {
  const next = { ...playlist, mode };
  return mode === 'timed' ? withStartTimes(next) : next;
}
// Gives every wallpaper without a start time one. A playlist with no times yet is spread over
// the waking day in its current order.
export function withStartTimes(playlist: Playlist): Playlist {
  const missing = playlist.ids.filter((id) => playlist.startTimes[id] === undefined);
  if (missing.length === 0) return playlist;
  const startTimes = { ...playlist.startTimes };
  if (missing.length === playlist.ids.length) {
    const spread = spreadStartTimes(missing.length);
    for (const [index, id] of missing.entries()) startTimes[id] = spread[index]!;
    return { ...playlist, startTimes };
  }
  const taken = playlist.ids.map((id) => startTimes[id]).filter((t): t is string => !!t);
  for (const id of missing) {
    const time = suggestStartTime(taken);
    startTimes[id] = time;
    taken.push(time);
  }
  return { ...playlist, startTimes };
}
// Evenly from 06:00 towards midnight, on quarter hours.
export function spreadStartTimes(count: number): string[] {
  const first = 6 * 60;
  const step = Math.max(15, Math.floor((day - first) / count / 15) * 15);
  const times: string[] = [];
  for (let index = 0; index < count; index++) times.push(clockTime((first + index * step) % day));
  return times;
}
// A new wallpaper goes halfway between the last start and midnight, so it lands at the end of
// the day like an appended item. When that is too tight it takes the middle of the longest gap.
export function suggestStartTime(taken: string[]): string {
  if (taken.length === 0) return '07:00';
  const minutes = taken.map(toMinutes).sort((a, b) => a - b);
  const last = minutes[minutes.length - 1]!;
  const evening = roundQuarter(last + (day - last) / 2);
  if (day - last >= 30 && evening > last && evening < day) return clockTime(evening);
  let gapStart = last;
  let gapLength = minutes[0]! + day - last;
  for (let index = 1; index < minutes.length; index++) {
    const length = minutes[index]! - minutes[index - 1]!;
    if (length > gapLength) {
      gapStart = minutes[index - 1]!;
      gapLength = length;
    }
  }
  let candidate = roundQuarter(gapStart + gapLength / 2) % day;
  while (minutes.includes(candidate)) candidate = (candidate + 1) % day;
  return clockTime(candidate);
}
export interface TimeSlot {
  id: string;
  start: string;
  // The next wallpaper's start; the last one runs until the first one the next day.
  end: string;
  minutes: number;
}
export function timeSlots(playlist: Playlist): TimeSlot[] {
  const order = timedOrder(playlist).filter((id) => playlist.startTimes[id] !== undefined);
  const slots: TimeSlot[] = [];
  for (const [index, id] of order.entries()) {
    const start = playlist.startTimes[id]!;
    const end = playlist.startTimes[order[(index + 1) % order.length]!]!;
    let minutes = (toMinutes(end) - toMinutes(start) + day) % day;
    if (minutes === 0) minutes = day;
    slots.push({ id, start, end, minutes });
  }
  return slots;
}
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}
function clockTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
function roundQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}
