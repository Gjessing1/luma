import { describe, expect, it } from 'vitest';
import {
  addToPlaylist,
  moveInPlaylist,
  playlistOrder,
  removeFromPlaylist,
  setMode,
  setStartTime,
  spreadStartTimes,
  suggestStartTime,
  timeSlots,
} from './playlist-edit.js';
import {
  differsFromRunning,
  newPlaylist,
  playlistFromRotation,
  playlistRotation,
  upgradeSettings,
  validatePlaylist,
  type PhoneSettings,
  type Playlist,
} from './playlist.js';

const a = 'a5bc359c-c9b0-4c2b-9515-2ba59841db71';
const b = 'a5bc359c-c9b0-4c2b-9515-2ba59841db72';
const c = 'a5bc359c-c9b0-4c2b-9515-2ba59841db73';

function playlist(): Playlist {
  return addToPlaylist(newPlaylist('day', 'Day'), [a, b, c]);
}
function phone(p: Playlist): PhoneSettings {
  return { device: 's25', styles: {}, playlists: [p], current: p.id };
}

describe('editing playlists', () => {
  it('adds only new wallpapers and moves them by drag position', () => {
    const p = addToPlaylist(playlist(), [b, c]);
    expect(p.ids).toEqual([a, b, c]);
    expect(moveInPlaylist(p, 2, 0).ids).toEqual([c, a, b]);
    expect(moveInPlaylist(p, 0, 5)).toBe(p);
    expect(removeFromPlaylist(p, [b]).ids).toEqual([a, c]);
  });
  it('spreads times when switching to time of day and keeps the interval order', () => {
    const timed = setMode(moveInPlaylist(playlist(), 2, 0), 'timed');
    expect(timed.ids).toEqual([c, a, b]);
    expect(timed.startTimes).toEqual({ [c]: '06:00', [a]: '12:00', [b]: '18:00' });
    validatePlaylist(timed);
    expect(timeSlots(timed).map((s) => `${s.start}-${s.end}`)).toEqual([
      '06:00-12:00',
      '12:00-18:00',
      '18:00-06:00',
    ]);
    expect(setMode(timed, 'interval').ids).toEqual([c, a, b]);
  });
  it('orders a timed playlist by start time and drags wallpapers between fixed times', () => {
    let timed = setMode(playlist(), 'timed');
    timed = setStartTime(timed, c, '05:00');
    expect(playlistOrder(timed)).toEqual([c, a, b]);
    timed = moveInPlaylist(timed, 0, 2);
    expect(playlistOrder(timed)).toEqual([a, b, c]);
    expect(timed.startTimes).toEqual({ [a]: '05:00', [b]: '06:00', [c]: '12:00' });
  });
  it('suggests a free time for an added wallpaper', () => {
    expect(suggestStartTime([])).toBe('07:00');
    expect(suggestStartTime(['07:00', '19:30'])).toBe('21:45');
    expect(suggestStartTime(['07:00', '23:45'])).toBe('15:30');
    const timed = addToPlaylist(setMode(addToPlaylist(newPlaylist('d', 'D'), [a]), 'timed'), [b]);
    expect(timed.startTimes).toEqual({ [a]: '06:00', [b]: '15:00' });
    expect(spreadStartTimes(24).at(-1)).toBe('23:15');
  });
  it('sends clock-ordered start times and notices when they change', () => {
    const timed = setStartTime(setMode(playlist(), 'timed'), a, '20:00');
    const rotation = playlistRotation(timed, phone(timed), true);
    expect(rotation.ids).toEqual([b, c, a]);
    expect(rotation.startTimes).toEqual(['12:00', '18:00', '20:00']);
    expect(playlistFromRotation(rotation).startTimes).toEqual(timed.startTimes);
    expect(differsFromRunning(timed, phone(timed), rotation)).toBe(false);
    const moved = setStartTime(timed, a, '21:00');
    expect(differsFromRunning(moved, phone(moved), rotation)).toBe(true);
    expect(playlistRotation(playlist(), phone(playlist()), true).startTimes).toBeUndefined();
  });
  it('rejects duplicate start times and oversized timed playlists', () => {
    const timed = setStartTime(setMode(playlist(), 'timed'), a, '12:00');
    expect(() => validatePlaylist(timed)).toThrow('Two wallpapers start at 12:00');
    const ids = Array.from(
      { length: 25 },
      (_, i) => `${a.slice(0, -2)}${String(i).padStart(2, '0')}`,
    );
    expect(() =>
      validatePlaylist(setMode(addToPlaylist(newPlaylist('x', 'X'), ids), 'timed')),
    ).toThrow('up to 24');
  });
  it('upgrades playlists saved without start times', () => {
    const { startTimes: _, ...old } = newPlaylist('old', 'Old');
    const upgraded = upgradeSettings({
      ...phone(newPlaylist('x', 'X')),
      playlists: [old as Playlist],
    });
    expect(upgraded.playlists[0]!.startTimes).toEqual({});
  });
});
