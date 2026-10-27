import { useEffect, useState } from 'react';
import {
  currentPlaylist,
  maxPlaylists,
  runningPlaylistId,
  type PhoneSettings,
  type Playlist,
} from '@luma/core/playlist';
import {
  addToPlaylist,
  playlistOrder,
  removeFromPlaylist,
  timeSlots,
} from '@luma/core/playlist-edit';
import type { Device, Wallpaper } from '@luma/core/wallpaper';
import { DayTimeline } from './DayTimeline';
import { PhoneStatus } from './PhoneStatus';
import { PlaylistLineup } from './PlaylistLineup';
import { PlaylistPicker } from './PlaylistPicker';
import { PlaylistSettings } from './PlaylistSettings';
import { WallpaperPicker } from './WallpaperPicker';
import { nativeRotations, runningRotations, type NativeState } from './wallpaper-client';

interface Props {
  settings: PhoneSettings;
  setDevice: (device: Device) => void;
  native: NativeState;
  refreshNative: (state: NativeState) => void;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  wallpapers: Wallpaper[];
  loading: boolean;
  thumbnail: (id: string) => string;
  open: (id: string) => void;
  // Uploads go to the library and straight into the selected playlist.
  upload: () => void;
  save: (next: Playlist) => string | null;
  select: (playlistId: string) => void;
  create: () => void;
  remove: (playlistId: string) => void;
}
interface Removed {
  name: string;
  before: Playlist;
  after: Playlist;
}
// How long Undo stays offered after removing a wallpaper.
const undoMilliseconds = 8000;
export function PlaylistPage(props: Props) {
  const { settings, native, busy, run, refreshNative, wallpapers, loading, save } = props;
  const playlist = currentPlaylist(settings);
  const [picking, setPicking] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), undoMilliseconds);
    return () => clearTimeout(timer);
  }, [removed]);
  // Saving stores the playlist object as given, so any later edit, or another playlist being
  // selected, makes the undo stale and hides it instead of reverting that edit.
  const canUndo = removed !== null && removed.after === playlist;
  function nameOf(id: string): string {
    return wallpapers.find((w) => w.id === id)?.name ?? 'Removed from library';
  }
  function removeWallpaper(id: string) {
    const after = removeFromPlaylist(playlist, [id]);
    if (!save(after)) setRemoved({ name: nameOf(id), before: playlist, after });
  }
  function undoRemove() {
    if (canUndo) save(removed.before);
    setRemoved(null);
  }
  function cover(candidate: Playlist): string | undefined {
    const first = playlistOrder(candidate).find((id) => wallpapers.some((w) => w.id === id));
    return first ? props.thumbnail(first) : undefined;
  }
  // A paused playlist still shows its last wallpaper.
  let showing: string | undefined;
  for (const rotation of Object.values(nativeRotations(native)))
    if (rotation && runningPlaylistId(rotation.config) === playlist.id) showing = rotation.lastId;
  let hint = 'Drag ⠿ to change the order.';
  if (playlist.mode === 'timed')
    hint = 'Tap a time to change it. Dragging moves a wallpaper to another time slot.';
  else if (playlist.shuffle)
    hint = 'Shuffle is on, so the order only matters if you switch to In order.';
  return (
    <>
      <PhoneStatus
        settings={settings}
        setDevice={props.setDevice}
        native={native}
        busy={busy}
        run={run}
        refreshNative={refreshNative}
        select={props.select}
      />
      <PlaylistPicker
        playlists={settings.playlists}
        current={playlist.id}
        running={runningRotations(native)}
        cover={cover}
        select={props.select}
        create={props.create}
        canCreate={settings.playlists.length < maxPlaylists}
      />
      <PlaylistSettings
        key={playlist.id}
        playlist={playlist}
        settings={settings}
        save={save}
        remove={() => props.remove(playlist.id)}
        native={native}
        busy={busy}
        run={run}
        refreshNative={refreshNative}
      >
        <div className="lineup-section">
          <div className="lineup-heading">
            <h3>
              Wallpapers <small>{playlist.ids.length}</small>
            </h3>
            {playlist.ids.length > 0 && (
              <button className="add-wallpapers" onClick={() => setPicking(true)}>
                + Add
              </button>
            )}
          </div>
          {loading ? (
            <p className="muted">Loading wallpapers…</p>
          ) : playlist.ids.length === 0 ? (
            <div className="lineup-empty">
              <p>No wallpapers yet. Pick some from the library or upload new photos.</p>
              <div className="button-row">
                <button className="primary" onClick={() => setPicking(true)}>
                  + Add from library
                </button>
                <button onClick={props.upload}>Upload photos</button>
              </div>
            </div>
          ) : (
            <>
              {playlist.mode === 'timed' && (
                <DayTimeline
                  slots={timeSlots(playlist)}
                  thumbnail={props.thumbnail}
                  name={nameOf}
                />
              )}
              <PlaylistLineup
                playlist={playlist}
                wallpapers={wallpapers}
                thumbnail={props.thumbnail}
                save={save}
                open={props.open}
                remove={removeWallpaper}
                showing={showing}
              />
              <p className="muted small lineup-hint">{hint}</p>
            </>
          )}
          {canUndo && (
            <div className="undo-bar" role="status">
              <span>Removed “{removed.name}”</span>
              <button className="link-button" onClick={undoRemove}>
                Undo
              </button>
            </div>
          )}
        </div>
      </PlaylistSettings>
      {picking && (
        <WallpaperPicker
          playlist={playlist}
          wallpapers={wallpapers}
          thumbnail={props.thumbnail}
          add={(ids) => save(addToPlaylist(playlist, ids))}
          upload={props.upload}
          close={() => setPicking(false)}
        />
      )}
    </>
  );
}
