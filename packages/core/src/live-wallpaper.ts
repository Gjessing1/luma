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
  scene: (typeof liveScenes)[number]['id'];
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
  if (!liveScenes.some((scene) => scene.id === config.scene)) throw new Error('Unknown live scene');
  if (!weatherModes.includes(config.weather)) throw new Error('Unknown weather mode');
  if (!Number.isFinite(config.latitude) || Math.abs(config.latitude) > 90)
    throw new Error('Latitude must be between −90 and 90');
  if (!Number.isFinite(config.longitude) || Math.abs(config.longitude) > 180)
    throw new Error('Longitude must be between −180 and 180');
  if (typeof config.night !== 'boolean' || typeof config.motion !== 'boolean')
    throw new Error('Invalid live wallpaper options');
}
