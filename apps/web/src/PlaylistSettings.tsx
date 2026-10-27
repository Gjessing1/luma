import {
  differsFromRunning,
  firstPlaylistName,
  playlistRotation,
  replacedBy,
  runningOn,
  runningPlaylistId,
  screensShowing,
  slotOf,
  validatePlaylist,
  type PhoneSettings,
  type Playlist,
} from '@luma/core/playlist';
import type { Rotation } from '@luma/core/wallpaper';
import type { ReactNode } from 'react';
import { destinationLabel, screensLabel } from './playlist-text';
import { ScheduleEditor } from './ScheduleEditor';
import { runningRotations, wallpaperBridge, type NativeState } from './wallpaper-client';

interface Props {
  playlist: Playlist;
  settings: PhoneSettings;
  save: (next: Playlist) => string | null;
  thumbnail: (id: string) => string;
  name: (id: string) => string;
  // The playlist's wallpapers, shown between the name and the schedule.
  children: ReactNode;
  remove: () => void;
  native: NativeState;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  refreshNative: (state: NativeState) => void;
}
export function PlaylistSettings(props: Props) {
  const { playlist, settings, save, remove, native, busy, run, refreshNative, children } = props;
  const bridge = wallpaperBridge();
  const running = runningRotations(native);
  const screens = screensShowing(playlist.id, running);
  const own = screens.length > 0 ? runningOn(running, screens[0]!) : undefined;
  const changed = own !== undefined && differsFromRunning(playlist, settings, own);
  // Shells before 0.1.4 run one rotation, so starting any playlist replaces it.
  let replaced: Rotation[] = replacedBy(playlist.id, playlist.target, running);
  if (!native.supportsPlaylists)
    replaced = [running.home, running.lock].filter(
      (r): r is Rotation => r !== undefined && runningPlaylistId(r) !== playlist.id,
    );
  const needsUpdate = playlist.mode === 'timed' && !!bridge && !native.supportsTimedSchedule;
  let startLabel = `Start on ${destinationLabel(playlist.target).toLowerCase()}`;
  if (own) startLabel = own.enabled ? 'Save & restart' : 'Save & resume';
  function nameOf(rotation: Rotation): string {
    const id = runningPlaylistId(rotation);
    return settings.playlists.find((p) => p.id === id)?.name ?? rotation.name ?? firstPlaylistName;
  }
  function start() {
    run(async () => {
      validatePlaylist(playlist);
      if (playlist.ids.length === 0) throw new Error('Add wallpapers to the playlist first');
      const config = playlistRotation(playlist, settings, true);
      refreshNative(await bridge!.configure({ config }));
    });
  }
  function deletePlaylist() {
    const where = screens.length > 0 ? ` It stops on the ${screensLabel(screens)}.` : '';
    if (!confirm(`Delete the playlist “${playlist.name}”? Wallpapers stay in the library.${where}`))
      return;
    run(async () => {
      if (own) refreshNative(await bridge!.stop({ slot: slotOf(own.target) }));
      remove();
    });
  }
  return (
    <section className="settings-panel" aria-label="Playlist settings">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLAYLIST</span>
          <h2>{playlist.name}</h2>
        </div>
        <span className={`status-pill ${own?.enabled ? 'active' : ''}`}>
          {own
            ? `${own.enabled ? 'Running' : 'Paused'} on ${screensLabel(screens)}`
            : 'Not on this phone'}
        </span>
      </div>
      {changed && (
        <p className="change-note">
          Changed since it started. The phone keeps the earlier version until you save.
        </p>
      )}
      <label className="name-field">
        Name
        <input
          aria-label="Playlist name"
          defaultValue={playlist.name}
          key={playlist.id}
          maxLength={60}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (!name) e.target.value = playlist.name;
            else if (name !== playlist.name) save({ ...playlist, name });
          }}
        />
      </label>
      {children}
      <ScheduleEditor
        playlist={playlist}
        save={save}
        thumbnail={props.thumbnail}
        name={props.name}
      />
      {bridge && replaced.length > 0 && (
        <p className="muted replace-note">
          Starting stops {replaced.map((r) => `“${nameOf(r)}”`).join(' and ')} on this phone.
        </p>
      )}
      <div className="button-row">
        <button
          className="primary"
          disabled={
            busy || !bridge || !native.supportsStyles || playlist.ids.length === 0 || needsUpdate
          }
          onClick={start}
        >
          {startLabel}
        </button>
        <button
          className="danger"
          disabled={busy || settings.playlists.length < 2 || (own && !native.supportsPlaylists)}
          onClick={deletePlaylist}
        >
          Delete playlist
        </button>
      </div>
      {bridge && playlist.ids.length === 0 && (
        <p className="muted">Add wallpapers to start this playlist.</p>
      )}
      {needsUpdate && (
        <p className="muted">
          Install the Android update (0.1.5 or newer) to run a time of day playlist. The other
          schedules work now.
        </p>
      )}
      {bridge && !native.supportsStyles && (
        <p className="muted">
          Install the Android update to save per-wallpaper adjustments for rotation. Applying a
          single wallpaper works now.
        </p>
      )}
      <div className="schedule-note">
        <span className="dot" />
        <p>
          {bridge
            ? 'Images are downloaded before starting. Rotation continues offline and resumes after a restart. Android may delay changes to save battery.'
            : 'Open Luma on Android to apply wallpapers and run schedules. You can manage the shared library here.'}
        </p>
      </div>
    </section>
  );
}
