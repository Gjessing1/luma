import { describe, expect, it } from 'vitest';
import { defaultLiveWallpaper, validateLiveWallpaper } from './live-wallpaper.js';

describe('live wallpaper settings at the bridge boundary', () => {
  it('accepts offline scenes and coordinates at the geographic boundaries', () => {
    expect(() => validateLiveWallpaper(defaultLiveWallpaper)).not.toThrow();
    expect(() =>
      validateLiveWallpaper({
        ...defaultLiveWallpaper,
        scene: 'weather',
        weather: 'auto',
        latitude: -90,
        longitude: 180,
      }),
    ).not.toThrow();
  });
  it.each([
    null,
    { ...defaultLiveWallpaper, scene: 'video' },
    { ...defaultLiveWallpaper, weather: 'unknown' },
    { ...defaultLiveWallpaper, latitude: NaN },
    { ...defaultLiveWallpaper, longitude: Infinity },
    { ...defaultLiveWallpaper, latitude: 91 },
    { ...defaultLiveWallpaper, longitude: -181 },
    { ...defaultLiveWallpaper, motion: 'false' },
    { ...defaultLiveWallpaper, night: null },
  ])('rejects invalid or incomplete settings: %j', (config) => {
    expect(() => validateLiveWallpaper(config)).toThrow();
  });
});
