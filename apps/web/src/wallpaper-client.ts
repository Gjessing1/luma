import type { LiveWallpaperConfig } from '@luma/core/live-wallpaper';
import { slotOf, type Running, type Screen } from '@luma/core/playlist';
import {
  defaultRotation,
  migrateRotation,
  wallpaperStyle,
  validateRotation,
  type Rotation,
  type Wallpaper,
} from '@luma/core/wallpaper';

export interface NativeRotation {
  config: Rotation;
  nextAt?: number;
  lastApplied?: number;
  lastId?: string;
  error?: string;
}
export interface NativeState {
  supportsStyles?: boolean;
  supportsPlaylists?: boolean;
  supportsLiveWallpaper?: boolean;
  supportsLiveVideo?: boolean;
  supportsZoom?: boolean;
  // APK 0.1.5 runs time of day playlists.
  supportsTimedSchedule?: boolean;
  live?: {
    config: LiveWallpaperConfig;
    active: boolean;
    weather?: { condition: string; night: boolean; updatedAt: number };
    weatherError?: string;
    videoError?: string;
  };
  rotations?: Partial<Record<Screen, NativeRotation>>;
  // APK 0.1.3 and older run a single rotation and report it at the top level.
  config?: Rotation;
  nextAt?: number;
  error?: string;
  lastApplied?: number;
  lastId?: string;
  model?: string;
}
export function nativeRotations(state: NativeState): Partial<Record<Screen, NativeRotation>> {
  if (state.rotations) return state.rotations;
  if (!state.config) return {};
  const { config, nextAt, lastApplied, lastId, error } = state;
  return { [slotOf(config.target)]: { config, nextAt, lastApplied, lastId, error } };
}
export function runningRotations(state: NativeState): Running {
  const running: Running = {};
  const rotations = nativeRotations(state);
  if (rotations.home) running.home = rotations.home.config;
  if (rotations.lock) running.lock = rotations.lock.config;
  return running;
}
export interface WallpaperBridge {
  getState(): Promise<NativeState>;
  configureLive(options: { config: LiveWallpaperConfig }): Promise<NativeState>;
  openLiveWallpaperPreview(): Promise<void>;
  configure(options: { config: Rotation }): Promise<NativeState>;
  apply(options: { config: Rotation }): Promise<NativeState>;
  // Shells before 0.1.4 ignore the slot and act on their single rotation.
  next(options: { slot: Screen }): Promise<NativeState>;
  pause(options: { slot: Screen }): Promise<NativeState>;
  stop(options: { slot: Screen }): Promise<NativeState>;
  exportImage(options: { id: string; config: Rotation }): Promise<void>;
  openWallpaperSettings(): Promise<void>;
}
export function wallpaperBridge(): WallpaperBridge | null {
  return window.Capacitor?.Plugins?.Wallpaper ?? null;
}
export function imageUrl(id: string, config: Rotation, thumb = false): string {
  const style = wallpaperStyle(config, id);
  const query = new URLSearchParams({
    device: config.device,
    x: String(style.focalX),
    y: String(style.focalY),
    zoom: String(style.zoom ?? 100),
    dim: String(style.effects.dim),
    blur: String(style.effects.blur),
    warmth: String(style.effects.warmth),
    grayscale: style.effects.grayscale ? '1' : '0',
    thumb: thumb ? '1' : '0',
  });
  return `/api/wallpapers/${id}/image?${query}`;
}
export function sourceUrl(id: string): string {
  return `/api/wallpapers/${id}/source`;
}
export function loadRotation(): Rotation {
  try {
    const saved = JSON.parse(localStorage.getItem('luma.rotation') ?? 'null') as Rotation | null;
    const config = saved
      ? { ...defaultRotation, ...saved, effects: { ...defaultRotation.effects, ...saved.effects } }
      : structuredClone(defaultRotation);
    validateRotation(config);
    return migrateRotation(config, localStorage.getItem('luma.preview'));
  } catch {
    return { ...structuredClone(defaultRotation), styles: {} };
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export async function upload(file: File): Promise<Wallpaper> {
  return api('/api/wallpapers', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  });
}
