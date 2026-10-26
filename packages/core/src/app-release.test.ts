import { describe, expect, it } from 'vitest';
import { appUpdateAvailable, parseAppRelease } from './app-release.js';

const valid = {
  versionCode: 3,
  versionName: '0.3.0',
  file: 'luma-0.3.0.apk',
  sha256: 'a'.repeat(64),
};

describe('parseAppRelease', () => {
  it('accepts what the release script writes', () => {
    expect(parseAppRelease(valid)).toEqual(valid);
  });

  it('refuses a file name that could leave the app dir', () => {
    expect(() => parseAppRelease({ ...valid, file: '../luma-0.3.0.apk' })).toThrow(/file name/);
    expect(() => parseAppRelease({ ...valid, file: 'other-0.3.0.apk' })).toThrow(/file name/);
  });

  it('refuses a versionCode Android would not accept', () => {
    expect(() => parseAppRelease({ ...valid, versionCode: 0 })).toThrow(/versionCode/);
    expect(() => parseAppRelease({ ...valid, versionCode: 1.5 })).toThrow(/versionCode/);
  });

  it('refuses a malformed checksum', () => {
    expect(() => parseAppRelease({ ...valid, sha256: 'abc' })).toThrow(/sha256/);
  });
});

describe('appUpdateAvailable', () => {
  it('compares versionCodes only', () => {
    expect(appUpdateAvailable(2, 3)).toBe(true);
    expect(appUpdateAvailable(3, 3)).toBe(false);
    expect(appUpdateAvailable(4, 3)).toBe(false);
  });
});
