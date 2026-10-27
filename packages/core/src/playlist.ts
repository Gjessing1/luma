import {
  defaultRotation,
  isPlaylistId,
  isPlaylistName,
  migrateRotation,
  validateRotation,
  wallpaperStyle,
  type Device,
  type Rotation,
  type Target,
  type WallpaperStyle,
} from './wallpaper.js';

export type Screen = 'home' | 'lock';
export interface Playlist {
  id: string;
  name: string;
  ids: string[];
  target: Target;
  mode: Rotation['mode'];
  intervalMinutes: number;
  dailyTimes: string[];
  shuffle: boolean;
}
// The Galaxy profile and per-wallpaper adjustments belong to the phone, so every playlist
// on it renders a wallpaper the same way (A11).
export interface PhoneSettings {
  device: Device;
  styles: Record<string, WallpaperStyle>;
  playlists: Playlist[];
  current: string;
}
// Rotations saved before named playlists existed carry no playlist ID or name.
export const firstPlaylistId = 'default';
export const firstPlaylistName = 'My playlist';
export const maxPlaylists = 30;
// What the phone runs per screen. A Home & lock playlist sits in the home slot and leaves the
// lock slot empty, so each screen shows at most one playlist.
export type Running = Partial<Record<Screen, Rotation>>;

export function newPlaylist(id: string, name: string): Playlist {
  return {
    id,
    name,
    ids: [],
    target: defaultRotation.target,
    mode: defaultRotation.mode,
    intervalMinutes: defaultRotation.intervalMinutes,
    dailyTimes: [...defaultRotation.dailyTimes],
    shuffle: defaultRotation.shuffle,
  };
}
export function playlistFromRotation(rotation: Rotation): Playlist {
  return {
    id: rotation.playlistId ?? firstPlaylistId,
    name: rotation.name ?? firstPlaylistName,
    ids: [...rotation.ids],
    target: rotation.target,
    mode: rotation.mode,
    intervalMinutes: rotation.intervalMinutes,
    dailyTimes: [...rotation.dailyTimes],
    shuffle: rotation.shuffle,
  };
}
export function settingsFromRotation(rotation: Rotation, preview?: string | null): PhoneSettings {
  const migrated = migrateRotation(rotation, preview);
  const playlist = playlistFromRotation(migrated);
  return {
    device: migrated.device,
    styles: migrated.styles ?? {},
    playlists: [playlist],
    current: playlist.id,
  };
}
export function currentPlaylist(settings: PhoneSettings): Playlist {
  return settings.playlists.find((p) => p.id === settings.current) ?? settings.playlists[0]!;
}
// The rotation the phone runs for a playlist. Only the playlist's own adjustments are sent.
export function playlistRotation(
  playlist: Playlist,
  settings: PhoneSettings,
  enabled: boolean,
): Rotation {
  const { id, ...fields } = playlist;
  const styles: Record<string, WallpaperStyle> = {};
  for (const wallpaper of playlist.ids) {
    const style = settings.styles[wallpaper];
    if (style) styles[wallpaper] = style;
  }
  return {
    ...defaultRotation,
    effects: { ...defaultRotation.effects },
    ...fields,
    ids: [...fields.ids],
    dailyTimes: [...fields.dailyTimes],
    playlistId: id,
    device: settings.device,
    styles,
    enabled,
  };
}
export function validatePlaylist(playlist: Playlist): void {
  if (!isPlaylistId(playlist.id)) throw new Error('Invalid playlist');
  if (!isPlaylistName(playlist.name)) throw new Error('Name the playlist (up to 60 characters)');
  validateRotation(
    playlistRotation(playlist, { ...emptySettings(), playlists: [playlist] }, false),
  );
}
export function validatePhoneSettings(settings: PhoneSettings): void {
  if (!Array.isArray(settings.playlists) || settings.playlists.length < 1)
    throw new Error('Keep at least one playlist');
  if (settings.playlists.length > maxPlaylists)
    throw new Error(`Keep up to ${maxPlaylists} playlists`);
  const seen = new Set<string>();
  for (const playlist of settings.playlists) {
    validatePlaylist(playlist);
    if (seen.has(playlist.id)) throw new Error('Duplicate playlist');
    seen.add(playlist.id);
  }
  validateRotation({ ...defaultRotation, device: settings.device, styles: settings.styles });
}
function emptySettings(): PhoneSettings {
  return { device: defaultRotation.device, styles: {}, playlists: [], current: firstPlaylistId };
}

export function screensOf(target: Target): Screen[] {
  if (target === 'both') return ['home', 'lock'];
  return [target];
}
export function slotOf(target: Target): Screen {
  return target === 'lock' ? 'lock' : 'home';
}
export function runningOn(running: Running, screen: Screen): Rotation | undefined {
  if (screen === 'home') return running.home;
  if (running.lock) return running.lock;
  return running.home?.target === 'both' ? running.home : undefined;
}
export function runningPlaylistId(rotation: Rotation): string {
  return rotation.playlistId ?? firstPlaylistId;
}
// The screens currently showing a playlist, whether it is running or paused.
export function screensShowing(playlistId: string, running: Running): Screen[] {
  const screens: Screen[] = [];
  for (const screen of ['home', 'lock'] as const) {
    const rotation = runningOn(running, screen);
    if (rotation && runningPlaylistId(rotation) === playlistId) screens.push(screen);
  }
  return screens;
}
// Other playlists that stop when a playlist starts on `target`. A Home & lock playlist stops
// entirely when either of its screens gets another playlist.
export function replacedBy(playlistId: string, target: Target, running: Running): Rotation[] {
  const replaced: Rotation[] = [];
  for (const screen of screensOf(target)) {
    const rotation = runningOn(running, screen);
    if (rotation && runningPlaylistId(rotation) !== playlistId && !replaced.includes(rotation))
      replaced.push(rotation);
  }
  return replaced;
}
// Adds playlists the phone runs but this browser has not saved, e.g. after site data was
// cleared. The phone's copy is authoritative for what runs (A8).
export function adoptRunning(settings: PhoneSettings, running: Running): PhoneSettings {
  let next = settings;
  for (const rotation of [running.home, running.lock]) {
    if (!rotation) continue;
    const migrated = migrateRotation(rotation);
    const styles = { ...migrated.styles, ...next.styles };
    const known = next.playlists.some((p) => p.id === runningPlaylistId(rotation));
    if (known && Object.keys(styles).length === Object.keys(next.styles).length) continue;
    next = {
      ...next,
      styles,
      playlists: known ? next.playlists : [...next.playlists, playlistFromRotation(migrated)],
    };
  }
  return next;
}
// True when the saved playlist would run differently from what the phone runs now.
export function differsFromRunning(
  playlist: Playlist,
  settings: PhoneSettings,
  rotation: Rotation,
): boolean {
  const wanted = playlistRotation(playlist, settings, rotation.enabled);
  const saved = migrateRotation(rotation);
  if (
    wanted.name !== (saved.name ?? firstPlaylistName) ||
    wanted.target !== saved.target ||
    wanted.device !== saved.device ||
    wanted.mode !== saved.mode ||
    wanted.shuffle !== saved.shuffle ||
    wanted.ids.join() !== saved.ids.join()
  )
    return true;
  if (wanted.mode === 'interval' && wanted.intervalMinutes !== saved.intervalMinutes) return true;
  if (wanted.mode === 'daily' && wanted.dailyTimes.join() !== saved.dailyTimes.join()) return true;
  for (const id of wanted.ids) {
    if (!sameStyle(wallpaperStyle(wanted, id), wallpaperStyle(saved, id))) return true;
  }
  return false;
}
function sameStyle(a: WallpaperStyle, b: WallpaperStyle): boolean {
  return (
    a.focalX === b.focalX &&
    a.focalY === b.focalY &&
    (a.zoom ?? 100) === (b.zoom ?? 100) &&
    a.effects.dim === b.effects.dim &&
    a.effects.blur === b.effects.blur &&
    a.effects.warmth === b.effects.warmth &&
    a.effects.grayscale === b.effects.grayscale
  );
}
