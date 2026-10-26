import { useEffect, useRef, useState } from 'react';
import {
  defaultLiveWallpaper,
  liveScenes,
  weatherModes,
  validateLiveWallpaper,
  type LiveWallpaperConfig,
} from '@luma/core/live-wallpaper';
import { wallpaperBridge, type NativeState } from './wallpaper-client';

interface Props {
  state: NativeState;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  refreshNative: (state: NativeState) => void;
}
function loadDraft(): LiveWallpaperConfig {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('luma.live') ?? 'null');
    validateLiveWallpaper(saved);
    return saved;
  } catch {
    return { ...defaultLiveWallpaper };
  }
}
export function LiveWallpaperSettings({ state, busy, run, refreshNative }: Props) {
  const [config, setConfig] = useState<LiveWallpaperConfig>(
    () => state.live?.config ?? loadDraft(),
  );
  const hydrated = useRef(!!state.live);
  useEffect(() => {
    if (!hydrated.current && state.live) {
      setConfig(state.live.config);
      hydrated.current = true;
    }
  }, [state.live]);
  const bridge = wallpaperBridge();
  const supported = !!bridge && !!state.supportsLiveWallpaper;
  useEffect(() => {
    localStorage.setItem('luma.live', JSON.stringify(config));
  }, [config]);
  function change(patch: Partial<LiveWallpaperConfig>) {
    setConfig({ ...config, ...patch });
  }
  async function save(preview: boolean) {
    validateLiveWallpaper(config);
    refreshNative(await bridge!.configureLive({ config }));
    if (preview) await bridge!.openLiveWallpaperPreview();
  }
  return (
    <section className="settings-panel">
      <div className="section-heading">
        <h2>Live scenes</h2>
        <span className={`status-pill ${state.live?.active ? 'active' : ''}`}>
          {state.live?.active ? 'Active on phone' : 'Not active'}
        </span>
      </div>
      <div className="live-scenes">
        {liveScenes.map((scene) => (
          <button
            key={scene.id}
            className="live-scene-card"
            aria-pressed={config.scene === scene.id}
            onClick={() => change({ scene: scene.id })}
          >
            <span className={`live-art live-${scene.id}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong>{scene.name}</strong>
            <span>{scene.description}</span>
          </button>
        ))}
      </div>
      <p className="muted">Illustrations above. Android’s preview shows the actual animation.</p>
      {config.scene === 'weather' && (
        <>
          <div className="settings-grid">
            <label>
              Weather source
              <select
                value={config.weather}
                onChange={(e) =>
                  change({ weather: e.target.value as LiveWallpaperConfig['weather'] })
                }
              >
                {weatherModes.map((weather) => (
                  <option key={weather} value={weather}>
                    {weather === 'auto' ? 'Automatic · Open-Meteo' : `Try ${weather}`}
                  </option>
                ))}
              </select>
            </label>
            {config.weather === 'auto' ? (
              <>
                <label>
                  Latitude
                  <input
                    type="number"
                    min="-90"
                    max="90"
                    step="0.01"
                    value={config.latitude}
                    onChange={(e) => change({ latitude: e.target.valueAsNumber })}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    min="-180"
                    max="180"
                    step="0.01"
                    value={config.longitude}
                    onChange={(e) => change({ longitude: e.target.valueAsNumber })}
                  />
                </label>
              </>
            ) : (
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={config.night}
                  onChange={(e) => change({ night: e.target.checked })}
                />
                Night sky
              </label>
            )}
          </div>
          <p className="muted">
            Clear, clouds, rain, snow and storm presets work offline. Automatic mode sends your
            saved coordinates to{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>{' '}
            while this wallpaper is visible, at most every 30 minutes. It follows day/night there
            and keeps the last result offline. Default coordinates are Oslo; enter your own
            location. No GPS permission is needed.
          </p>
          {state.live?.weather && (
            <p className="muted">
              Last weather: {state.live.weather.condition} ·{' '}
              {state.live.weather.night ? 'night' : 'day'} ·{' '}
              {new Date(state.live.weather.updatedAt).toLocaleString()}
            </p>
          )}
          {state.live?.weatherError && (
            <p role="status" className="muted">
              {state.live.weatherError}
            </p>
          )}
        </>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={config.motion}
          onChange={(e) => change({ motion: e.target.checked })}
        />
        Animate wallpaper
      </label>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || !supported}
          onClick={() => run(() => save(true))}
        >
          Save & open Android preview
        </button>
        {state.live?.active && (
          <button disabled={busy || !supported} onClick={() => run(() => save(false))}>
            Save live wallpaper
          </button>
        )}
      </div>
      <p className="muted">
        In Android’s preview, confirm Set wallpaper and choose Home screen if offered. Your phone
        controls the available destinations. Activating Luma pauses photo rotation that targets Home
        or Both; lock-only photo rotation continues. Saved changes also update an already active
        Luma wallpaper. Apply a photo from Library to switch back.
      </p>
      <p className="muted">
        Animation pauses when hidden and slows in Battery Saver. Turn off animation for a still
        scene.
      </p>
      {!bridge && (
        <p className="muted">Open Luma on Android to preview and set a live wallpaper.</p>
      )}
      {bridge && !state.supportsLiveWallpaper && (
        <p className="muted">Install the Android update to use live wallpapers.</p>
      )}
    </section>
  );
}
