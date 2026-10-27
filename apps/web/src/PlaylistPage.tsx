import { useState } from 'react';
import {
  currentPlaylist,
  maxPlaylists,
  type PhoneSettings,
  type Playlist,
} from '@luma/core/playlist';
import { addToPlaylist } from '@luma/core/playlist-edit';
import type { Device, Wallpaper } from '@luma/core/wallpaper';
import { PhoneStatus } from './PhoneStatus';
import { PlaylistLineup } from './PlaylistLineup';
import { PlaylistPicker } from './PlaylistPicker';
import { PlaylistSettings } from './PlaylistSettings';
import { WallpaperPicker } from './WallpaperPicker';
import { runningRotations, type NativeState } from './wallpaper-client';

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
export function PlaylistPage(props: Props) {
  const { settings, native, busy, run, refreshNative, wallpapers, loading, save } = props;
  const playlist = currentPlaylist(settings);
  const [picking, setPicking] = useState(false);
  function nameOf(id: string): string {
    return wallpapers.find((w) => w.id === id)?.name ?? 'Removed from library';
  }
  let hint = 'Drag ⠿ to change the order.';
  if (playlist.mode === 'timed')
    hint = 'Tap a time to change it. Dragging moves a wallpaper to another time slot.';
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
        select={props.select}
        create={props.create}
        canCreate={settings.playlists.length < maxPlaylists}
      />
      <PlaylistSettings
        key={playlist.id}
        playlist={playlist}
        settings={settings}
        save={save}
        thumbnail={props.thumbnail}
        name={nameOf}
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
              <PlaylistLineup
                playlist={playlist}
                wallpapers={wallpapers}
                thumbnail={props.thumbnail}
                save={save}
                open={props.open}
              />
              <p className="muted small lineup-hint">{hint}</p>
            </>
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
