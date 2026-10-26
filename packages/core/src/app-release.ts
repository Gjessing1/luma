// The Android APK the host currently publishes (A7). scripts/release-android.sh writes version.json
// next to the APK under LUMA_DATA_DIR/app; the backend serves both from there.

export interface AppRelease {
  versionCode: number;
  versionName: string;
  file: string;
  sha256: string;
}

export function parseAppRelease(value: unknown): AppRelease {
  if (typeof value !== 'object' || value === null) {
    throw new Error('version.json is not an object');
  }
  const { versionCode, versionName, file, sha256 } = value as Record<string, unknown>;
  if (typeof versionCode !== 'number' || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('version.json has an invalid versionCode');
  }
  if (typeof versionName !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(versionName)) {
    throw new Error('version.json has an invalid versionName');
  }
  // A bare file name only, so the metadata can never point the download outside the app dir.
  if (typeof file !== 'string' || !/^luma-[0-9A-Za-z._-]+\.apk$/.test(file)) {
    throw new Error('version.json has an invalid APK file name');
  }
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('version.json has an invalid sha256');
  }
  return { versionCode, versionName, file, sha256 };
}

// versionCode is the only ordering Android itself trusts: it refuses to install a lower one.
export function appUpdateAvailable(installedCode: number, publishedCode: number): boolean {
  return publishedCode > installedCode;
}
