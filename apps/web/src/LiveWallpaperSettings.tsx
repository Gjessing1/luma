import { useEffect, useRef, useState } from 'react';
import {
  defaultLiveWallpaper,
  liveScenes,
  weatherModes,
  validateLiveWallpaper,
  type LiveWallpaperConfig,
} from '@luma/core/live-wallpaper';
import { wallpaperBridge, type NativeState } from './wallpaper-client';
import { LiveVideoCollection, useLiveVideos } from './LiveVideoCollection';

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
  const [config, setConfig] = useState<LiveWallpaperConfig>(() =>
    localStorage.getItem('luma.live') ? loadDraft() : (state.live?.config ?? loadDraft()),
  );
  const hydrated = useRef(!!state.live || localStorage.getItem('luma.live') !== null);
  const actions = useRef<HTMLDivElement>(null);
  const live = useLiveVideos();
  const [showGenerated, setShowGenerated] = useState(() => {
    try {
      return localStorage.getItem('luma.showGenerated') === '1';
    } catch {
      return false;
    }
  });
  function rememberGenerated(open: boolean) {
    setShowGenerated(open);
    try {
      localStorage.setItem('luma.showGenerated', open ? '1' : '0');
    } catch {
      // Only a display preference.
    }
  }
  useEffect(() => {
    if (!hydrated.current && state.live) {
      setConfig(state.live.config);
      hydrated.current = true;
    }
  }, [state.live]);
  const bridge = wallpaperBridge();
  const supported =
    !!bridge &&
    !!state.supportsLiveWallpaper &&
    (config.scene !== 'video' || !!state.supportsLiveVideo);
  useEffect(() => {
    localStorage.setItem('luma.live', JSON.stringify(config));
  }, [config]);
  // A running engine that has drawn a generated scene cannot attach a video decoder.
  const switchingToVideo =
    !!state.live?.active && config.scene === 'video' && state.live.config.scene !== 'video';
  function selectionName(): string {
    if (config.scene === 'video') {
      const video = live.videos.find((entry) => entry.id === config.videoId);
      return video ? video.name : 'A video that is no longer in the collection';
    }
    const scene = liveScenes.find((entry) => entry.id === config.scene);
    return `${scene?.name ?? config.scene} (generated scene)`;
  }
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
        <p className="muted">
          Choose a video loop or a generated scene, then save it to this phone.
        </p>
        <span className={`status-pill ${state.live?.active ? 'active' : ''}`}>
          {state.live?.active ? 'Active on phone' : 'Not active'}
        </span>
      </div>
      <LiveVideoCollection
        videos={live.videos}
        error={live.error}
        selected={config.scene === 'video' ? config.videoId : undefined}
        onDelete={(video) => run(() => live.remove(video))}
        onSelect={(video) => {
          change({ scene: 'video', videoId: video.id });
          actions.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
      />
      <details
        className="generated-scenes"
        open={showGenerated}
        onToggle={(event) => rememberGenerated(event.currentTarget.open)}
      >
        <summary>Generated scenes · Aurora, Drifting stars, Weather landscape</summary>
        <p className="muted">
          Drawn by the Android app itself, so they can’t be deleted. Leave this folded away if you
          don’t use them.
        </p>
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
        <p className="muted">
          Illustrations above. Save & open Android preview shows the actual animation on your phone.
          This preview is for live scenes; Library photos apply directly without opening it.
        </p>
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
      </details>
      <label className="check-row">
        <input
          type="checkbox"
          checked={config.motion}
          onChange={(e) => change({ motion: e.target.checked })}
        />
        Animate wallpaper
      </label>
      {config.scene === 'video' && (
        <p className="muted">
          Save to download the selected video to this phone. Keep Luma open until the download
          finishes.
        </p>
      )}
      {state.live?.videoError && <p role="status">{state.live.videoError}</p>}
      <p className="live-selection">
        Selected: <strong>{selectionName()}</strong>
      </p>
      {switchingToVideo && (
        <p className="muted">
          Android starts a video only on a freshly set wallpaper: save, then tap Set wallpaper in
          Android’s preview.
        </p>
      )}
      <div className="button-row" ref={actions}>
        <button
          className="primary"
          disabled={busy || !supported}
          onClick={() => run(() => save(true))}
        >
          Save & open Android preview
        </button>
        {state.live?.active && !switchingToVideo && (
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
        Videos download once when saved and play offline. They pause when hidden, in Battery Saver,
        or when animation is off. Generated scenes slow in Battery Saver.
      </p>
      {!bridge && (
        <p className="muted">Open Luma on Android to preview and set a live wallpaper.</p>
      )}
      {bridge && !state.supportsLiveWallpaper && (
        <p className="muted">Install the Android update to use live wallpapers.</p>
      )}
      {bridge &&
        state.supportsLiveWallpaper &&
        config.scene === 'video' &&
        !state.supportsLiveVideo && (
          <p className="muted">
            Install Android 0.1.3 or newer to set video wallpapers. You can preview them here.
          </p>
        )}
    </section>
  );
}
