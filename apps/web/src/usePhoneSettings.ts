import { useEffect, useRef, useState } from 'react';
import {
  adoptRunning,
  settingsFromRotation,
  upgradeSettings,
  validatePhoneSettings,
  type PhoneSettings,
} from '@luma/core/playlist';
import {
  loadRotation,
  runningRotations,
  wallpaperBridge,
  type NativeState,
} from './wallpaper-client';

const storageKey = 'luma.phone';

function loadSettings(): PhoneSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as PhoneSettings | null;
    if (stored) {
      const saved = upgradeSettings(stored);
      validatePhoneSettings(saved);
      return saved;
    }
  } catch {
    // Unreadable settings fall back to the single playlist draft kept before saved playlists.
  }
  return settingsFromRotation(loadRotation(), localStorage.getItem('luma.preview'));
}

// Saved playlists and adjustments live in this browser; the phone's own copy of what runs is
// authoritative (A8), so anything it runs that this browser lacks is added back.
export function usePhoneSettings(onError: (error: unknown) => void) {
  const [settings, setSettings] = useState<PhoneSettings>(loadSettings);
  const [native, setNative] = useState<NativeState>({});
  const hadDraft = useRef(
    localStorage.getItem(storageKey) !== null || localStorage.getItem('luma.rotation') !== null,
  );
  function refreshNative(state: NativeState) {
    setNative(state);
    setSettings((current) => adoptRunning(current, runningRotations(state)));
  }
  useEffect(() => {
    wallpaperBridge()
      ?.getState()
      .then((state) => {
        setNative(state);
        const running = runningRotations(state);
        setSettings((current) => {
          if (hadDraft.current) return adoptRunning(current, running);
          const first = running.home ?? running.lock;
          if (first) return adoptRunning(settingsFromRotation(first), running);
          if (state.model?.startsWith('SM-S931')) return { ...current, device: 's25' };
          return current;
        });
      })
      .catch(onError);
    function refreshState() {
      if (!document.hidden)
        wallpaperBridge()
          ?.getState()
          .then(refreshNative)
          .catch(() => {});
    }
    document.addEventListener('visibilitychange', refreshState);
    return () => document.removeEventListener('visibilitychange', refreshState);
  }, []);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  }, [settings]);
  return { settings, setSettings, native, setNative, refreshNative };
}
