import { devices, type Rotation, type Device, type Target } from '@luma/core/wallpaper';
import { wallpaperBridge, type NativeState } from './wallpaper-client';

interface Props {
  config: Rotation;
  setConfig: (config: Rotation) => void;
  state: NativeState;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  refreshNative: (state: NativeState) => void;
}
export function RotationSettings({ config, setConfig, state, busy, run, refreshNative }: Props) {
  const bridge = wallpaperBridge();
  function change(patch: Partial<Rotation>) {
    setConfig({ ...config, ...patch });
  }
  return (
    <section className="settings-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THIS PHONE</span>
          <h2>Rotation</h2>
        </div>
        <span className={`status-pill ${state.config?.enabled ? 'active' : ''}`}>
          {state.config?.enabled ? 'Running on phone' : 'Paused'}
        </span>
      </div>
      <p className="muted">
        Each phone keeps its own playlist and schedule. Both phones use the shared library.
      </p>
      <div className="settings-grid">
        <label>
          Galaxy profile
          <select
            value={config.device}
            onChange={(e) => change({ device: e.target.value as Device })}
          >
            {Object.entries(devices).map(([key, d]) => (
              <option key={key} value={key}>
                {d.name} · {d.width} × {d.height}
              </option>
            ))}
          </select>
        </label>
        <label>
          Apply to
          <select
            value={config.target}
            onChange={(e) => change({ target: e.target.value as Target })}
          >
            <option value="both">Home & lock screen</option>
            <option value="home">Home screen</option>
            <option value="lock">Lock screen</option>
          </select>
        </label>
        <label>
          Change wallpaper
          <select
            value={config.mode}
            onChange={(e) => change({ mode: e.target.value as Rotation['mode'] })}
          >
            <option value="interval">At an interval</option>
            <option value="daily">At daily times</option>
          </select>
        </label>
        {config.mode === 'interval' ? (
          <label>
            Every
            <select
              value={config.intervalMinutes}
              onChange={(e) => change({ intervalMinutes: Number(e.target.value) })}
            >
              {[
                [15, '15 minutes'],
                [30, '30 minutes'],
                [60, 'Hour'],
                [180, '3 hours'],
                [360, '6 hours'],
                [720, '12 hours'],
                [1440, 'Day'],
              ].map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Daily times (local time)
            <input
              aria-label="Daily times"
              defaultValue={config.dailyTimes.join(', ')}
              key={config.mode}
              onBlur={(e) => change({ dailyTimes: e.target.value.split(',').map((t) => t.trim()) })}
              placeholder="07:00, 21:00"
            />
          </label>
        )}
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={config.shuffle}
          onChange={(e) => change({ shuffle: e.target.checked })}
        />
        Shuffle without immediate repeats
      </label>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || !bridge || config.ids.length === 0}
          onClick={() =>
            run(async () =>
              refreshNative(await bridge!.configure({ config: { ...config, enabled: true } })),
            )
          }
        >
          Save & start rotation
        </button>
        <button
          disabled={busy || !bridge || !state.config?.enabled}
          onClick={() => run(async () => refreshNative(await bridge!.pause()))}
        >
          Pause
        </button>
        <button
          disabled={busy || !bridge || !state.config?.ids.length}
          onClick={() => run(async () => refreshNative(await bridge!.next()))}
        >
          Next wallpaper ↗
        </button>
      </div>
      <div className="schedule-note">
        <span className="dot" />
        <p>
          {bridge
            ? 'Images are downloaded before starting. Rotation continues offline and resumes after a restart. Android may delay changes to save battery.'
            : 'Open Luma on Android to apply wallpapers and run schedules. You can manage the shared library here.'}
        </p>
      </div>
      {state.nextAt ? (
        <p className="muted">Next change around {new Date(state.nextAt).toLocaleString()}</p>
      ) : null}
      {state.lastApplied ? (
        <p className="muted">Last applied {new Date(state.lastApplied).toLocaleString()}</p>
      ) : null}
      {state.error ? <p className="error">Phone: {state.error}</p> : null}
    </section>
  );
}
