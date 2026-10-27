import { describe, expect, it } from 'vitest';
import {
  cropRectangle,
  defaultRotation,
  devices,
  validateRotation,
  originalStyle,
  migrateRotation,
  wallpaperStyle,
} from './wallpaper.js';

describe('Galaxy framing', () => {
  it('uses matching 19.5:9 crops for both Galaxy profiles', () => {
    expect(devices['s24-ultra'].width / devices['s24-ultra'].height).toBe(
      devices.s25.width / devices.s25.height,
    );
    expect(cropRectangle(4000, 3000, 's24-ultra')).toEqual(cropRectangle(4000, 3000, 's25'));
  });
  it('keeps focal positions and extreme images inside image bounds', () => {
    for (const [width, height] of [
      [4000, 3000],
      [600, 4000],
      [1, 1],
      [1, 3000],
    ] as const) {
      for (const [x, zoom] of [
        [0, 100],
        [50, 100],
        [100, 100],
        [0, 300],
        [100, 175],
      ] as const) {
        const crop = cropRectangle(width, height, 's25', x, 100, zoom);
        expect(crop.left).toBeGreaterThanOrEqual(0);
        expect(crop.top).toBeGreaterThanOrEqual(0);
        expect(crop.left + crop.width).toBeLessThanOrEqual(width);
        expect(crop.top + crop.height).toBeLessThanOrEqual(height);
      }
    }
  });
  it('lets a zoomed screen-shaped photo move on both axes', () => {
    expect(cropRectangle(1440, 3120, 's24-ultra', 0, 0)).toEqual(
      cropRectangle(1440, 3120, 's24-ultra', 100, 100),
    );
    const zoomed = cropRectangle(1440, 3120, 's24-ultra', 100, 100, 200);
    expect(zoomed).toEqual({ left: 720, top: 1560, width: 720, height: 1560 });
  });
  it('accepts styles saved before zoom existed and rejects zoom outside 100–300%', () => {
    const id = 'a5bc359c-c9b0-4c2b-9515-2ba59841db77';
    const { zoom: _unused, ...legacy } = originalStyle;
    expect(() => validateRotation({ ...defaultRotation, styles: { [id]: legacy } })).not.toThrow();
    for (const zoom of [99, 301, NaN])
      expect(() =>
        validateRotation({ ...defaultRotation, styles: { [id]: { ...originalStyle, zoom } } }),
      ).toThrow('zoom');
  });
});
describe('playlist validation', () => {
  it('rejects an empty running playlist and malformed times', () => {
    expect(() => validateRotation({ ...defaultRotation, enabled: true })).toThrow('playlist');
    expect(() => validateRotation({ ...defaultRotation, dailyTimes: ['25:00'] })).toThrow(
      'daily times',
    );
    expect(() => validateRotation({ ...defaultRotation, intervalMinutes: 1 })).toThrow(
      '15 minutes',
    );
    expect(() =>
      validateRotation({ ...defaultRotation, effects: { ...defaultRotation.effects, dim: NaN } }),
    ).toThrow();
  });
  it('accepts a daily Galaxy S25 playlist', () => {
    expect(() =>
      validateRotation({
        ...defaultRotation,
        device: 's25',
        mode: 'daily',
        ids: ['a5bc359c-c9b0-4c2b-9515-2ba59841db75'],
        enabled: true,
      }),
    ).not.toThrow();
  });
});

describe('per-wallpaper adjustments', () => {
  const first = 'a5bc359c-c9b0-4c2b-9515-2ba59841db75';
  const second = 'a5bc359c-c9b0-4c2b-9515-2ba59841db76';
  it('preserves legacy edits for selected images without styling new library choices', () => {
    const legacy = {
      ...defaultRotation,
      ids: [first],
      focalX: 80,
      effects: { ...defaultRotation.effects, dim: 35 },
    };
    const migrated = migrateRotation(legacy, second);
    expect(wallpaperStyle(migrated, first)).toMatchObject({ focalX: 80, effects: { dim: 35 } });
    expect(wallpaperStyle(migrated, second)).toMatchObject({ focalX: 80, effects: { dim: 35 } });
    expect(wallpaperStyle(migrated, 'a5bc359c-c9b0-4c2b-9515-2ba59841db77')).toEqual(originalStyle);
    expect(migrateRotation(migrated)).toBe(migrated);
    migrated.styles![first]!.effects.dim = 10;
    expect(wallpaperStyle(migrated, second).effects.dim).toBe(35);
    expect(legacy.effects.dim).toBe(35);
  });
  it('rejects malformed per-image styles before saving a native playlist', () => {
    expect(() =>
      validateRotation({
        ...defaultRotation,
        styles: { [first]: { ...originalStyle, focalY: NaN } },
      }),
    ).toThrow();
    expect(() =>
      validateRotation({ ...defaultRotation, styles: { invalid: originalStyle } }),
    ).toThrow();
    expect(() =>
      validateRotation({ ...defaultRotation, styles: { [first]: originalStyle } }),
    ).not.toThrow();
  });
});
