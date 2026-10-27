import { useRef, useState } from 'react';
import {
  defaultLiveWallpaper,
  type liveScenes,
  weatherModes,
  validateLiveWallpaper,
  type LiveVideo,
  type LiveWallpaperConfig,
} from '@luma/core/live-wallpaper';
import type { Device } from '@luma/core/wallpaper';
import { wallpaperBridge, type NativeState } from './wallpaper-client';
import { useModal } from './useModal';

export type LiveItem =
  { kind: 'video'; video: LiveVideo } | { kind: 'scene'; scene: (typeof liveScenes)[number] };

interface Props {
  item: LiveItem;
  device: Device;
  state: NativeState;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  refreshNative: (state: NativeState) => void;
  close: () => void;
  remove: (video: LiveVideo) => Promise<void>;
}

// Motion and weather options carry over between live wallpapers, so start from the last draft,
// then what the phone runs, and only then the defaults.
function startingConfig(state: NativeState, item: LiveItem): LiveWallpaperConfig {
  let base: LiveWallpaperConfig = state.live?.config ?? defaultLiveWallpaper;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('luma.live') ?? 'null');
    validateLiveWallpaper(saved);
    base = saved;
  } catch {
    // No usable draft on this phone.
  }
  if (item.kind === 'video') return { ...base, scene: 'video', videoId: item.video.id };
  return { ...base, scene: item.scene.id, videoId: undefined };
}

export function LiveDetail({
  item,
  device,
  state,
  busy,
  run,
  refreshNative,
  close,
  remove,
}: Props) {
  const dialogRef = useModal(close);
  const player = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [config, setConfig] = useState(() => startingConfig(state, item));
  const bridge = wallpaperBridge();
  const name = item.kind === 'video' ? item.video.name : item.scene.name;
  const supported =
    !!bridge &&
    !!state.supportsLiveWallpaper &&
    (config.scene !== 'video' || !!state.supportsLiveVideo);
  const live = state.live;
  const isActive =
    !!live?.active &&
    live.config.scene === config.scene &&
    (config.scene !== 'video' || live.config.videoId === config.videoId);
  // A running engine that has drawn a generated scene cannot attach a video decoder.
  const switchingToVideo =
    !!live?.active && config.scene === 'video' && live.config.scene !== 'video';
  function change(patch: Partial<LiveWallpaperConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    localStorage.setItem('luma.live', JSON.stringify(next));
  }
  async function save(preview: boolean) {
    validateLiveWallpaper(config);
    localStorage.setItem('luma.live', JSON.stringify(config));
    refreshNative(await bridge!.configureLive({ config }));
    if (preview) await bridge!.openLiveWallpaperPreview();
  }
  function toggleMotion() {
    if (!player.current) return;
    if (player.current.paused) player.current.play().catch(() => setPlaying(false));
    else player.current.pause();
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={dialogRef}
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Live wallpaper preview"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={close} aria-label="Close preview">
          ×
        </button>
        <div className="preview-stage">
          <div className={`phone-preview ${device}`} aria-label={`${name} preview`}>
            {item.kind === 'video' ? (
              <video
                ref={player}
                poster={`/api/live-wallpapers/${item.video.id}/poster.jpg`}
                src={`/api/live-wallpapers/${item.video.id}/wallpaper.mp4`}
                autoPlay
                muted
                loop
                playsInline
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            ) : (
              <span className={`live-art live-${item.scene.id}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
          {item.kind === 'video' ? (
            <div className="tool-bar">
              <button onClick={toggleMotion}>
                {playing ? '❚❚ Pause motion' : '▶ Play motion'}
              </button>
            </div>
          ) : (
            <p className="preview-caption">
              Illustration · Save & open Android preview shows the real animation on your phone.
            </p>
          )}
        </div>
        <div className="detail-controls">
          <span className="eyebrow">
            {item.kind === 'video' ? 'LIVE VIDEO' : 'GENERATED SCENE'}
          </span>
          <h2>{name}</h2>
          <p className="muted">
            {item.kind === 'video' ? item.video.description : item.scene.description}
          </p>
          {item.kind === 'video' && (
            <>
              <p className="muted">
                {Math.round(item.video.duration)} sec loop ·{' '}
                {(item.video.bytes / 1048576).toFixed(1)} MB · muted
              </p>
              <p className="photo-credit">
                <a href={item.video.source.url} target="_blank" rel="noreferrer">
                  Video: {item.video.source.author} ↗
                </a>
                <a href={item.video.licenseUrl} target="_blank" rel="noreferrer">
                  {item.video.source.license}
                </a>
              </p>
              <p className="muted small">{item.video.changes}</p>
            </>
          )}
          <span className={`status-pill ${isActive ? 'active' : ''}`}>
            {isActive ? 'Active on phone' : 'Not active'}
          </span>
          <h3>Set as live wallpaper</h3>
          {config.scene === 'weather' && (
            <WeatherOptions config={config} change={change} state={state} />
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={config.motion}
              onChange={(e) => change({ motion: e.target.checked })}
            />
            Animate wallpaper
          </label>
          {item.kind === 'video' && (
            <p className="muted small">
              Saving downloads this video to the phone once. Keep Luma open until it finishes.
            </p>
          )}
          {live?.videoError && <p role="status">{live.videoError}</p>}
          {switchingToVideo && (
            <p className="muted small">
              Android starts a video only on a freshly set wallpaper: save, then tap Set wallpaper
              in Android’s preview.
            </p>
          )}
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || !supported}
              onClick={() => run(() => save(true))}
            >
              Save & open Android preview
            </button>
            {live?.active && !switchingToVideo && (
              <button disabled={busy || !supported} onClick={() => run(() => save(false))}>
                Save live wallpaper
              </button>
            )}
          </div>
          {!bridge && <p className="muted small">Open Luma on Android to set a live wallpaper.</p>}
          {bridge && !state.supportsLiveWallpaper && (
            <p className="muted small">Install the Android update to use live wallpapers.</p>
          )}
          {bridge &&
            state.supportsLiveWallpaper &&
            item.kind === 'video' &&
            !state.supportsLiveVideo && (
              <p className="muted small">
                Install Android 0.1.3 or newer to set video wallpapers. You can preview them here.
              </p>
            )}
          <details>
            <summary>How live wallpapers work</summary>
            <p className="muted small">
              In Android’s preview, confirm Set wallpaper and choose Home screen if offered. Your
              phone controls the available destinations. Activating Luma pauses photo rotation that
              targets Home or Both; lock-only photo rotation continues. Saved changes also update an
              already active Luma wallpaper. Apply a photo from the Library to switch back.
            </p>
            <p className="muted small">
              Videos play offline and pause when hidden, in Battery Saver, or when animation is off.
              Generated scenes are drawn by the app, slow down in Battery Saver and can’t be
              deleted.
            </p>
          </details>
          {item.kind === 'video' && (
            <div className="button-row">
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `Delete “${name}” from the shared live collection? Phones that already downloaded it keep playing their copy.`,
                    )
                  )
                    run(async () => {
                      await remove(item.video);
                      close();
                    });
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function WeatherOptions({
  config,
  change,
  state,
}: {
  config: LiveWallpaperConfig;
  change: (patch: Partial<LiveWallpaperConfig>) => void;
  state: NativeState;
}) {
  return (
    <>
      <label>
        Weather source
        <select
          value={config.weather}
          onChange={(e) => change({ weather: e.target.value as LiveWallpaperConfig['weather'] })}
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
      <p className="muted small">
        Clear, clouds, rain, snow and storm presets work offline. Automatic mode sends your saved
        coordinates to{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{' '}
        while this wallpaper is visible, at most every 30 minutes. It follows day/night there and
        keeps the last result offline. Default coordinates are Oslo; enter your own location. No GPS
        permission is needed.
      </p>
      {state.live?.weather && (
        <p className="muted small">
          Last weather: {state.live.weather.condition} ·{' '}
          {state.live.weather.night ? 'night' : 'day'} ·{' '}
          {new Date(state.live.weather.updatedAt).toLocaleString()}
        </p>
      )}
      {state.live?.weatherError && (
        <p role="status" className="muted small">
          {state.live.weatherError}
        </p>
      )}
    </>
  );
}
