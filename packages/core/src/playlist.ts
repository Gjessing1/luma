import {
  defaultRotation,
  isClockTime,
  isPlaylistId,
  isWallpaperId,
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
  // Start time per wallpaper for the timed mode. Kept by ID, so reordering for the other modes
  // and switching modes never loses them.
  startTimes: Record<string, string>;
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
    startTimes: {},
    shuffle: defaultRotation.shuffle,
  };
}
export function playlistFromRotation(rotation: Rotation): Playlist {
  const startTimes: Record<string, string> = {};
  for (const [index, id] of rotation.ids.entries()) {
    const start = rotation.startTimes?.[index];
    if (start) startTimes[id] = start;
  }
  return {
    id: rotation.playlistId ?? firstPlaylistId,
    name: rotation.name ?? firstPlaylistName,
    ids: [...rotation.ids],
    target: rotation.target,
    mode: rotation.mode,
    intervalMinutes: rotation.intervalMinutes,
    dailyTimes: [...rotation.dailyTimes],
    startTimes,
    shuffle: rotation.shuffle,
  };
}
// Playlists saved before start times existed have none.
export function upgradeSettings(saved: PhoneSettings): PhoneSettings {
  if (!Array.isArray(saved.playlists)) return saved;
  return {
    ...saved,
    playlists: saved.playlists.map(function withStartTimes(playlist) {
      return { ...playlist, startTimes: playlist.startTimes ?? {} };
    }),
  };
}
// The order a timed playlist runs in: by start time, with wallpapers that have none last.
export function timedOrder(playlist: Pick<Playlist, 'ids' | 'startTimes'>): string[] {
  const timed = playlist.ids.filter((id) => playlist.startTimes[id] !== undefined);
  timed.sort((a, b) => playlist.startTimes[a]!.localeCompare(playlist.startTimes[b]!));
  return [...timed, ...playlist.ids.filter((id) => playlist.startTimes[id] === undefined)];
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
  // Timed playlists send their start times as a list aligned with ids instead.
  const { id, startTimes: _startTimes, ...fields } = playlist;
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
    ...timedFields(playlist),
  };
}
function timedFields(playlist: Playlist): Partial<Rotation> {
  if (playlist.mode !== 'timed') return {};
  const ids = timedOrder(playlist);
  return { ids, startTimes: ids.map((id) => playlist.startTimes[id] ?? '') };
}
export function validatePlaylist(playlist: Playlist): void {
  if (!isPlaylistId(playlist.id)) throw new Error('Invalid playlist');
  if (!isPlaylistName(playlist.name)) throw new Error('Name the playlist (up to 60 characters)');
  const starts = playlist.startTimes;
  if (!starts || typeof starts !== 'object' || Array.isArray(starts))
    throw new Error('Invalid start times');
  for (const [id, start] of Object.entries(starts))
    if (!isWallpaperId(id) || !isClockTime(start)) throw new Error('Use start times like 07:00');
  if (playlist.mode === 'timed' && playlist.ids.some((id) => starts[id] === undefined))
    throw new Error('Give every wallpaper a start time');
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
  if (wanted.mode === 'timed' && wanted.startTimes?.join() !== saved.startTimes?.join())
    return true;
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
