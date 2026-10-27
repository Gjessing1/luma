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
import { destinationLabel, scheduleLabel, screensLabel } from './playlist-text';
import { ScheduleEditor } from './ScheduleEditor';
import { runningRotations, wallpaperBridge, type NativeState } from './wallpaper-client';

interface Props {
  playlist: Playlist;
  settings: PhoneSettings;
  save: (next: Playlist) => string | null;
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
  const empty = playlist.ids.length === 0;
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
        <div className="playlist-title">
          <span className="eyebrow">PLAYLIST</span>
          {/* The title is the name field, so the name isn't shown twice. */}
          <input
            className="title-input"
            aria-label="Playlist name"
            defaultValue={playlist.name}
            key={playlist.id}
            maxLength={60}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (!name) e.target.value = playlist.name;
              else if (name !== playlist.name) save({ ...playlist, name });
            }}
          />
          <p className="playlist-summary">
            {destinationLabel(playlist.target)} · {scheduleLabel(playlist)}
          </p>
        </div>
        <span className={`status-pill ${own?.enabled ? 'active' : ''}`}>
          {own
            ? `${own.enabled ? 'Running' : 'Paused'} on ${screensLabel(screens)}`
            : 'Not on this phone'}
        </span>
      </div>
      {children}
      <ScheduleEditor playlist={playlist} save={save} />
      {/* Sticks to the bottom of the screen while the playlist is in view, so an edit anywhere
          in the list can be sent to the phone without scrolling to the end. */}
      <div
        className={`playlist-actions ${bridge && !empty ? 'is-sticky' : ''} ${changed ? 'is-changed' : ''}`}
      >
        <div className="action-notes">
          {changed && <p className="change-note">Not on the phone yet. Save to update it.</p>}
          {bridge && !empty && replaced.length > 0 && (
            <p className="replace-note">
              Starting stops {replaced.map((r) => `“${nameOf(r)}”`).join(' and ')} on this phone.
            </p>
          )}
          {bridge && empty && <p>Add wallpapers to start this playlist.</p>}
        </div>
        <button
          className="primary"
          disabled={busy || !bridge || !native.supportsStyles || empty || needsUpdate}
          onClick={start}
        >
          {startLabel}
        </button>
      </div>
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
      {/* Hidden rather than disabled for the only playlist: a phone always keeps one. */}
      {settings.playlists.length > 1 && (
        <button
          className="link-button danger delete-playlist"
          disabled={busy || (own && !native.supportsPlaylists)}
          onClick={deletePlaylist}
        >
          Delete playlist
        </button>
      )}
    </section>
  );
}
