import { appUpdateAvailable } from '@luma/core/app-release';
import { appShell } from './android-shell';

export interface PublishedApp {
  versionCode: number;
  versionName: string;
  bytes: number;
}

// The newer APK the server publishes, or null: in a browser, when nothing is published, or when
// the installed app is current. Only native changes need a new APK; the UI updates with each web
// deploy (A7).
export async function checkAppUpdate(): Promise<PublishedApp | null> {
  const shell = appShell();
  if (!shell) {
    return null;
  }
  const installed = await shell.getInfo();
  const response = await fetch('/api/app/version', { cache: 'no-store' });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const published = (await response.json()) as PublishedApp;
  if (!appUpdateAvailable(installed.versionCode, published.versionCode)) {
    return null;
  }
  return published;
}

// The shell downloads with the WebView's session cookie, so it works behind SSO. Android shows the
// finished download, which opens the installer.
export async function downloadAppUpdate(published: PublishedApp): Promise<void> {
  const shell = appShell();
  if (!shell) {
    throw new Error('Downloads run from the Android app');
  }
  await shell.downloadUpdate({
    url: new URL('/api/app/download', window.location.origin).href,
    fileName: `luma-${published.versionName}.apk`,
  });
}
