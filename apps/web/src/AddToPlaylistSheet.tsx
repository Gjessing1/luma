import { useState } from 'react';
import type { Playlist } from '@luma/core/playlist';
import type { Wallpaper } from '@luma/core/wallpaper';
import { destinationLabel } from './playlist-text';
import { useBackClose } from './useBackClose';
import { useModal } from './useModal';

interface Props {
  wallpaper: Wallpaper;
  playlists: Playlist[];
  thumbnail: string;
  // Each returns an error to show, or null when it worked.
  toggle: (playlistId: string) => string | null;
  create: () => string | null;
  canCreate: boolean;
  close: () => void;
}
// From a library card: tick the playlists this wallpaper belongs to. Changes save immediately.
export function AddToPlaylistSheet(props: Props) {
  const { wallpaper, playlists, thumbnail, toggle, create, canCreate, close } = props;
  const back = useBackClose(close);
  const dialog = useModal(back);
  const [error, setError] = useState('');
  return (
    <div className="sheet-backdrop" onClick={back}>
      <section
        ref={dialog}
        className="sheet playlist-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${wallpaper.name} to playlists`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-header">
          <img className="sheet-thumb" src={thumbnail} alt="" />
          <div>
            <h2>Add to playlist</h2>
            <p className="muted small">{wallpaper.name}</p>
          </div>
          <button className="sheet-close" aria-label="Close" onClick={back}>
            ×
          </button>
        </header>
        <div className="playlist-options">
          {playlists.map((playlist) => {
            const inside = playlist.ids.includes(wallpaper.id);
            return (
              <button
                key={playlist.id}
                className={`playlist-option ${inside ? 'is-in' : ''}`}
                role="checkbox"
                aria-checked={inside}
                onClick={() => setError(toggle(playlist.id) ?? '')}
              >
                <span className="option-check" aria-hidden="true">
                  {inside ? '✓' : ''}
                </span>
                <span>
                  <strong>{playlist.name}</strong>
                  <small>
                    {destinationLabel(playlist.target)} · {playlist.ids.length} wallpaper
                    {playlist.ids.length === 1 ? '' : 's'}
                  </small>
                </span>
              </button>
            );
          })}
          <button
            className="playlist-option new-option"
            disabled={!canCreate}
            onClick={() => setError(create() ?? '')}
          >
            <span className="option-check" aria-hidden="true">
              +
            </span>
            <span>
              <strong>New playlist</strong>
              <small>With this wallpaper in it</small>
            </span>
          </button>
        </div>
        <footer className="sheet-footer">
          {error && <p className="error small">{error}</p>}
          <button className="primary" onClick={back}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
