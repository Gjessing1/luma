import { describe, expect, it } from 'vitest';
import { cropRectangle, defaultRotation, devices, validateRotation } from './wallpaper.js';

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
      for (const x of [0, 50, 100]) {
        const crop = cropRectangle(width, height, 's25', x, 100);
        expect(crop.left).toBeGreaterThanOrEqual(0);
        expect(crop.top).toBeGreaterThanOrEqual(0);
        expect(crop.left + crop.width).toBeLessThanOrEqual(width);
        expect(crop.top + crop.height).toBeLessThanOrEqual(height);
      }
    }
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
