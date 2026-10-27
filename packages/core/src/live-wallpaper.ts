import { parseWallpaperSource, type WallpaperSource } from './wallpaper.js';

export const liveScenes = [
  { id: 'aurora', name: 'Aurora', description: 'Slow ribbons of green and violet light.' },
  { id: 'stars', name: 'Drifting stars', description: 'A dark starfield with gentle motion.' },
  {
    id: 'weather',
    name: 'Weather landscape',
    description: 'A mountain sky that follows the weather.',
  },
] as const;
export const weatherModes = ['auto', 'clear', 'clouds', 'rain', 'snow', 'storm'] as const;
export interface LiveWallpaperConfig {
  scene: (typeof liveScenes)[number]['id'] | 'video';
  videoId?: string;
  weather: (typeof weatherModes)[number];
  latitude: number;
  longitude: number;
  night: boolean;
  motion: boolean;
}
export const defaultLiveWallpaper: LiveWallpaperConfig = {
  scene: 'aurora',
  weather: 'clear',
  latitude: 59.91,
  longitude: 10.75,
  night: false,
  motion: true,
};
export function validateLiveWallpaper(value: unknown): asserts value is LiveWallpaperConfig {
  if (!value || typeof value !== 'object') throw new Error('Missing live wallpaper settings');
  const config = value as LiveWallpaperConfig;
  if (config.scene === 'video') {
    if (!isLiveVideoId(config.videoId)) throw new Error('Choose a video wallpaper');
  } else if (!liveScenes.some((scene) => scene.id === config.scene))
    throw new Error('Unknown live scene');
  if (!weatherModes.includes(config.weather)) throw new Error('Unknown weather mode');
  if (!Number.isFinite(config.latitude) || Math.abs(config.latitude) > 90)
    throw new Error('Latitude must be between −90 and 90');
  if (!Number.isFinite(config.longitude) || Math.abs(config.longitude) > 180)
    throw new Error('Longitude must be between −180 and 180');
  if (typeof config.night !== 'boolean' || typeof config.motion !== 'boolean')
    throw new Error('Invalid live wallpaper options');
}

export function isLiveVideoId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

export interface LiveVideo {
  id: string;
  name: string;
  description: string;
  source: WallpaperSource;
  licenseUrl: string;
  changes: string;
  width: number;
  height: number;
  duration: number;
  bytes: number;
  sha256: string;
}

export function parseLiveVideo(value: unknown): LiveVideo {
  if (!value || typeof value !== 'object') throw new Error('Invalid video wallpaper');
  const video = value as LiveVideo;
  if (!isLiveVideoId(video.id)) throw new Error('Invalid video ID');
  for (const key of ['name', 'description', 'changes'] as const) {
    if (typeof video[key] !== 'string' || !video[key].trim() || video[key].length > 1000)
      throw new Error('Invalid video details');
  }
  const source = parseWallpaperSource(video.source);
  if (!source) throw new Error('Missing video credit');
  parseWallpaperSource({ ...source, url: video.licenseUrl });
  for (const number of [video.width, video.height, video.duration, video.bytes]) {
    if (!Number.isFinite(number) || number <= 0)
      throw new Error('Invalid video dimensions or size');
  }
  if (video.bytes > 40 * 1024 * 1024 || video.duration > 60)
    throw new Error('Video must be at most 40 MB and 60 seconds');
  if (typeof video.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(video.sha256))
    throw new Error('Invalid video checksum');
  return { ...video, source };
}
