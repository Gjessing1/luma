export interface WallpaperSource {
  url: string;
  author: string;
  license: string;
}

export function parseWallpaperSource(value: unknown): WallpaperSource | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) throw new Error('Invalid photo source');
  const { url, author, license } = value as Record<string, unknown>;
  if (
    typeof url !== 'string' ||
    url.length > 1000 ||
    !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/i.test(url)
  )
    throw new Error('Photo source must be an HTTPS link');
  if (typeof author !== 'string' || !author.trim() || author.length > 200)
    throw new Error('Invalid photo credit');
  if (typeof license !== 'string' || !license.trim() || license.length > 200)
    throw new Error('Invalid photo license');
  return { url, author: author.trim(), license: license.trim() };
}

export interface Wallpaper {
  id: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  favorite: boolean;
  source?: WallpaperSource;
}

export const devices = {
  's24-ultra': { name: 'Galaxy S24 Ultra', width: 1440, height: 3120 },
  s25: { name: 'Galaxy S25', width: 1080, height: 2340 },
} as const;
export type Device = keyof typeof devices;
export type Target = 'home' | 'lock' | 'both';
export interface Effects {
  dim: number;
  blur: number;
  grayscale: boolean;
  warmth: number;
}
export interface WallpaperStyle {
  focalX: number;
  focalY: number;
  // Percent of the cover crop; optional because phones saved styles before zoom existed.
  zoom?: number;
  effects: Effects;
}
export const maxZoom = 300;
export const originalStyle: WallpaperStyle = {
  focalX: 50,
  focalY: 50,
  zoom: 100,
  effects: { dim: 0, blur: 0, grayscale: false, warmth: 0 },
};
export interface Rotation extends WallpaperStyle {
  // Which saved playlist a running rotation came from; absent before saved playlists existed.
  playlistId?: string;
  name?: string;
  styles?: Record<string, WallpaperStyle>;
  ids: string[];
  device: Device;
  target: Target;
  mode: 'interval' | 'daily';
  intervalMinutes: number;
  dailyTimes: string[];
  shuffle: boolean;
  enabled: boolean;
}
export const defaultRotation: Rotation = {
  ids: [],
  device: 's24-ultra',
  target: 'both',
  mode: 'interval',
  intervalMinutes: 60,
  dailyTimes: ['07:00', '21:00'],
  shuffle: true,
  enabled: false,
  focalX: 50,
  focalY: 50,
  zoom: 100,
  effects: { dim: 0, blur: 0, grayscale: false, warmth: 0 },
};
export function isWallpaperId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}
export function validateRotation(rotation: Rotation): void {
  if (
    !Array.isArray(rotation.ids) ||
    rotation.ids.length > 200 ||
    !rotation.ids.every(isWallpaperId)
  )
    throw new Error('Choose up to 200 wallpapers');
  if (rotation.playlistId !== undefined && !isPlaylistId(rotation.playlistId))
    throw new Error('Invalid playlist');
  if (rotation.name !== undefined && !isPlaylistName(rotation.name))
    throw new Error('Name the playlist (up to 60 characters)');
  if (!(rotation.device in devices)) throw new Error('Unknown Galaxy profile');
  if (!['home', 'lock', 'both'].includes(rotation.target)) throw new Error('Invalid destination');
  if (!['interval', 'daily'].includes(rotation.mode)) throw new Error('Invalid schedule');
  if (
    !Number.isInteger(rotation.intervalMinutes) ||
    rotation.intervalMinutes < 15 ||
    rotation.intervalMinutes > 10080
  )
    throw new Error('Interval must be 15 minutes to 7 days');
  if (
    !Array.isArray(rotation.dailyTimes) ||
    rotation.dailyTimes.length < 1 ||
    rotation.dailyTimes.length > 24 ||
    !rotation.dailyTimes.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
  )
    throw new Error('Use daily times like 07:00, 21:00');
  validateStyle(rotation);
  if (rotation.styles !== undefined) {
    if (!rotation.styles || typeof rotation.styles !== 'object' || Array.isArray(rotation.styles))
      throw new Error('Invalid wallpaper adjustments');
    for (const [id, style] of Object.entries(rotation.styles)) {
      if (!isWallpaperId(id)) throw new Error('Invalid wallpaper ID');
      validateStyle(style);
    }
  }
  if (
    typeof rotation.effects.grayscale !== 'boolean' ||
    typeof rotation.shuffle !== 'boolean' ||
    typeof rotation.enabled !== 'boolean'
  )
    throw new Error('Invalid toggle');
  if (rotation.enabled && rotation.ids.length === 0)
    throw new Error('Add wallpapers to the playlist first');
}
export function isPlaylistId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id);
}
export function isPlaylistName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 60;
}
export function validateStyle(style: WallpaperStyle): void {
  if (!style || !style.effects) throw new Error('Invalid wallpaper adjustments');
  for (const n of [
    style.focalX,
    style.focalY,
    style.effects.dim,
    style.effects.blur,
    style.effects.warmth,
  ]) {
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Invalid crop or effect');
  }
  if (typeof style.effects.grayscale !== 'boolean') throw new Error('Invalid toggle');
  if (style.zoom !== undefined && !isZoom(style.zoom)) throw new Error('Invalid zoom');
}
export function isZoom(value: number): boolean {
  return Number.isFinite(value) && value >= 100 && value <= maxZoom;
}
export function wallpaperStyle(config: Rotation, id: string): WallpaperStyle {
  return config.styles === undefined ? config : (config.styles[id] ?? originalStyle);
}
export function migrateRotation(config: Rotation, preview?: string | null): Rotation {
  if (config.styles !== undefined) return config;
  const styles: Record<string, WallpaperStyle> = {};
  // Preserve existing phone adjustments while making new library choices independent.
  for (const id of [...config.ids, ...(preview && isWallpaperId(preview) ? [preview] : [])]) {
    styles[id] = {
      focalX: config.focalX,
      focalY: config.focalY,
      zoom: config.zoom ?? 100,
      effects: { ...config.effects },
    };
  }
  return { ...config, ...originalStyle, effects: { ...originalStyle.effects }, styles };
}
export function cropRectangle(
  width: number,
  height: number,
  device: Device,
  x = 50,
  y = 50,
  zoom = 100,
) {
  const profile = devices[device];
  const ratio = profile.width / profile.height;
  // Zooming shrinks the cover crop, which leaves room to pan on both axes.
  const scale = 100 / zoom;
  const cropWidth = Math.max(1, Math.floor(Math.min(width, Math.floor(height * ratio)) * scale));
  const cropHeight = Math.max(1, Math.floor(Math.min(height, Math.floor(width / ratio)) * scale));
  return {
    left: Math.round(((width - cropWidth) * x) / 100),
    top: Math.round(((height - cropHeight) * y) / 100),
    width: cropWidth,
    height: cropHeight,
  };
}
