import { describe, expect, it } from 'vitest';
import {
  adoptRunning,
  differsFromRunning,
  firstPlaylistId,
  newPlaylist,
  playlistRotation,
  replacedBy,
  runningOn,
  screensShowing,
  settingsFromRotation,
  validatePhoneSettings,
  type PhoneSettings,
} from './playlist.js';
import { defaultRotation, originalStyle, type Rotation } from './wallpaper.js';

const first = 'a5bc359c-c9b0-4c2b-9515-2ba59841db75';
const second = 'a5bc359c-c9b0-4c2b-9515-2ba59841db76';

function settings(): PhoneSettings {
  return {
    device: 's25',
    styles: { [first]: { ...originalStyle, focalX: 20 }, [second]: originalStyle },
    playlists: [
      { ...newPlaylist('desert', 'Desert'), ids: [first], target: 'home' },
      { ...newPlaylist('seasons', 'Seasons'), ids: [second], target: 'lock' },
    ],
    current: 'desert',
  };
}
function started(id: string, phone = settings()): Rotation {
  return playlistRotation(
    phone.playlists.find((p) => p.id === id)!,
    phone,
    true,
  );
}

describe('saved playlists', () => {
  it('turns a pre-playlist draft into one playlist and keeps its adjustments', () => {
    const legacy = { ...defaultRotation, ids: [first], target: 'lock' as const, focalX: 10 };
    const phone = settingsFromRotation(legacy);
    expect(phone.playlists).toEqual([
      expect.objectContaining({ id: firstPlaylistId, ids: [first], target: 'lock' }),
    ]);
    expect(phone.styles[first]?.focalX).toBe(10);
    expect(() => validatePhoneSettings(phone)).not.toThrow();
  });
  it('sends only the playlist’s own adjustments with the phone profile', () => {
    const rotation = started('desert');
    expect(rotation).toMatchObject({ playlistId: 'desert', name: 'Desert', device: 's25' });
    expect(Object.keys(rotation.styles!)).toEqual([first]);
  });
  it('rejects duplicate playlists and blank names', () => {
    const phone = settings();
    expect(() =>
      validatePhoneSettings({ ...phone, playlists: [phone.playlists[0]!, phone.playlists[0]!] }),
    ).toThrow('Duplicate');
    expect(() =>
      validatePhoneSettings({ ...phone, playlists: [{ ...phone.playlists[0]!, name: ' ' }] }),
    ).toThrow('Name');
  });
});

describe('home and lock screens', () => {
  it('runs a home playlist and a lock playlist side by side', () => {
    const running = { home: started('desert'), lock: started('seasons') };
    expect(screensShowing('desert', running)).toEqual(['home']);
    expect(screensShowing('seasons', running)).toEqual(['lock']);
    expect(replacedBy('seasons', 'lock', running)).toEqual([]);
  });
  it('shows a Home & lock playlist on both screens and stops it for either screen', () => {
    const phone = settings();
    phone.playlists[0]!.target = 'both';
    const running = { home: started('desert', phone) };
    expect(runningOn(running, 'lock')).toBe(running.home);
    expect(screensShowing('desert', running)).toEqual(['home', 'lock']);
    expect(replacedBy('seasons', 'lock', running)).toEqual([running.home]);
  });
  it('treats a rotation from before playlists as the first playlist', () => {
    const { playlistId: _id, name: _name, ...legacy } = started('desert');
    expect(screensShowing(firstPlaylistId, { home: legacy })).toEqual(['home']);
  });
});

describe('phone state', () => {
  it('adopts a running playlist this browser has not saved', () => {
    const phone = settings();
    const running = { lock: { ...started('seasons'), playlistId: 'kitchen', name: 'Kitchen' } };
    const adopted = adoptRunning({ ...phone, styles: {} }, running);
    expect(adopted.playlists.map((p) => p.name)).toEqual(['Desert', 'Seasons', 'Kitchen']);
    expect(adopted.styles[second]).toEqual(originalStyle);
    expect(adoptRunning(adopted, running)).toBe(adopted);
  });
  it('notices edits that the phone is not running yet', () => {
    const phone = settings();
    const rotation = started('desert');
    expect(differsFromRunning(phone.playlists[0]!, phone, rotation)).toBe(false);
    phone.styles[first] = { ...originalStyle, zoom: 150 };
    expect(differsFromRunning(phone.playlists[0]!, phone, rotation)).toBe(true);
    phone.styles[first] = rotation.styles![first]!;
    phone.playlists[0]!.ids.push(second);
    expect(differsFromRunning(phone.playlists[0]!, phone, rotation)).toBe(true);
  });
});
