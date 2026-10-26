import type { WallpaperBridge } from './wallpaper-client';
// The Android shell (A7) injects Capacitor's bridge into the hosted page. Reaching it through
// window.Capacitor keeps the web app free of a Capacitor dependency, and inert in a browser.

export interface ShellInfo {
  versionCode: number;
  versionName: string;
}

// AppShellPlugin.java in apps/android.
interface AppShell {
  getInfo(): Promise<ShellInfo>;
  downloadUpdate(options: { url: string; fileName: string }): Promise<void>;
}

declare global {
  interface Window {
    Capacitor?: {
      Plugins?: { AppShell?: AppShell; Wallpaper?: WallpaperBridge };
    };
  }
}

export function appShell(): AppShell | null {
  return window.Capacitor?.Plugins?.AppShell ?? null;
}
