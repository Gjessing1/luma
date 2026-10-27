import { screensShowing, type Playlist, type Running } from '@luma/core/playlist';
import { destinationLabel, screensLabel } from './playlist-text';

interface Props {
  playlists: Playlist[];
  current: string;
  running: Running;
  select: (playlistId: string) => void;
  create: () => void;
  canCreate: boolean;
}
export function PlaylistPicker({ playlists, current, running, select, create, canCreate }: Props) {
  return (
    <div className="playlist-picker" role="group" aria-label="Saved playlists">
      {playlists.map((playlist) => {
        const screens = screensShowing(playlist.id, running);
        return (
          <button
            key={playlist.id}
            className={`playlist-chip ${playlist.id === current ? 'chip-active' : ''}`}
            aria-pressed={playlist.id === current}
            onClick={() => select(playlist.id)}
          >
            <strong>{playlist.name}</strong>
            <small>
              {destinationLabel(playlist.target)} · {playlist.ids.length}
            </small>
            {screens.length > 0 && (
              <span className="chip-status">● On {screensLabel(screens)}</span>
            )}
          </button>
        );
      })}
      <button className="playlist-chip new-chip" disabled={!canCreate} onClick={create}>
        + New playlist
      </button>
    </div>
  );
}
