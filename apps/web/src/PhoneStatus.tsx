import {
  firstPlaylistName,
  runningPlaylistId,
  slotOf,
  type PhoneSettings,
  type Screen,
} from '@luma/core/playlist';
import { devices, type Device } from '@luma/core/wallpaper';
import { scheduleLabel } from './playlist-text';
import {
  nativeRotations,
  wallpaperBridge,
  type NativeRotation,
  type NativeState,
} from './wallpaper-client';

interface Props {
  settings: PhoneSettings;
  setDevice: (device: Device) => void;
  native: NativeState;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  refreshNative: (state: NativeState) => void;
  select: (playlistId: string) => void;
}
// What each screen of this phone shows right now, so it is never a guess which playlist runs.
export function PhoneStatus({
  settings,
  setDevice,
  native,
  busy,
  run,
  refreshNative,
  select,
}: Props) {
  const bridge = wallpaperBridge();
  const rotations = nativeRotations(native);
  const row = { settings, busy, run, refreshNative, select };
  return (
    <section className="settings-panel phone-status" aria-label="On this phone">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THIS PHONE</span>
          <h2>Now showing</h2>
        </div>
        <label className="profile-select">
          Galaxy profile
          <select value={settings.device} onChange={(e) => setDevice(e.target.value as Device)}>
            {Object.entries(devices).map(([key, d]) => (
              <option key={key} value={key}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bridge ? (
        <div className="screen-rows">
          <ScreenRow {...row} screen="home" rotation={rotations.home} />
          {!rotations.lock && rotations.home?.config.target === 'both' ? (
            <ScreenRow {...row} screen="lock" rotation={rotations.home} shared />
          ) : (
            <ScreenRow {...row} screen="lock" rotation={rotations.lock} />
          )}
        </div>
      ) : (
        <p className="muted">
          Open Luma on Android to start playlists. You can prepare them here; each phone keeps its
          own.
        </p>
      )}
      {bridge && !native.supportsPlaylists && (
        <p className="muted">
          Install the Android update to run a home and a lock playlist at the same time.
        </p>
      )}
    </section>
  );
}

interface RowProps extends Omit<Props, 'setDevice' | 'native'> {
  screen: Screen;
  rotation?: NativeRotation;
  shared?: boolean;
}
function ScreenRow({
  settings,
  busy,
  run,
  refreshNative,
  select,
  screen,
  rotation,
  shared = false,
}: RowProps) {
  const bridge = wallpaperBridge();
  const title = screen === 'home' ? 'Home screen' : 'Lock screen';
  if (!rotation)
    return (
      <div className="screen-row" data-screen={screen}>
        <span className="screen-name">{title}</span>
        <p className="muted">No playlist. The current wallpaper stays.</p>
      </div>
    );
  const id = runningPlaylistId(rotation.config);
  const name =
    settings.playlists.find((p) => p.id === id)?.name ?? rotation.config.name ?? firstPlaylistName;
  const enabled = rotation.config.enabled;
  const slot = slotOf(rotation.config.target);
  return (
    <div className="screen-row" data-screen={screen}>
      <span className="screen-name">{title}</span>
      <div className="screen-playlist">
        <button className="link-button" onClick={() => select(id)}>
          {name}
        </button>
        <span className={`status-pill ${enabled ? 'active' : ''}`}>
          {enabled ? 'Running' : 'Paused'}
        </span>
      </div>
      <p className="muted">
        {shared ? 'Same playlist as the home screen' : scheduleLabel(rotation.config)}
        {!shared && enabled && rotation.nextAt
          ? ` · next around ${new Date(rotation.nextAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
          : ''}
      </p>
      {rotation.error && !shared ? <p className="error">Phone: {rotation.error}</p> : null}
      {!shared && (
        <div className="button-row">
          {enabled && (
            <button
              disabled={busy}
              onClick={() => run(async () => refreshNative(await bridge!.pause({ slot })))}
            >
              Pause
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => run(async () => refreshNative(await bridge!.next({ slot })))}
          >
            Next wallpaper
          </button>
        </div>
      )}
    </div>
  );
}
