import { useState } from 'react';
import type { Playlist } from '@luma/core/playlist';
import type { Wallpaper } from '@luma/core/wallpaper';
import { useBackClose } from './useBackClose';
import { useModal } from './useModal';

interface Props {
  playlist: Playlist;
  wallpapers: Wallpaper[];
  thumbnail: (id: string) => string;
  // Returns an error to show, or null once the wallpapers are in the playlist.
  add: (ids: string[]) => string | null;
  upload: () => void;
  close: () => void;
}
// Choose several library wallpapers at once; they join the end of the playlist in the order
// they were tapped.
export function WallpaperPicker({ playlist, wallpapers, thumbnail, add, upload, close }: Props) {
  const back = useBackClose(close);
  const dialog = useModal(back);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [error, setError] = useState('');
  const visible = wallpapers.filter(
    (w) => (!favorites || w.favorite) && w.name.toLowerCase().includes(query.toLowerCase()),
  );
  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );
  }
  // The file dialog has to open inside this tap, before the sheet closes.
  function uploadNew() {
    upload();
    back();
  }
  function confirm() {
    const problem = add(picked);
    if (problem) setError(problem);
    else back();
  }
  let addLabel = 'Choose wallpapers';
  if (picked.length > 0)
    addLabel = `Add ${picked.length} wallpaper${picked.length === 1 ? '' : 's'}`;
  return (
    <div className="sheet-backdrop" onClick={back}>
      <section
        ref={dialog}
        className="sheet picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Add wallpapers to ${playlist.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-header">
          <div>
            <h2>Add to “{playlist.name}”</h2>
            <p className="muted small">Tap wallpapers to select them.</p>
          </div>
          <button className="sheet-close" aria-label="Close" onClick={back}>
            ×
          </button>
        </header>
        <div className="picker-toolbar">
          <input
            type="search"
            aria-label="Search the library"
            placeholder="Search…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className={favorites ? 'chip-on' : ''}
            aria-pressed={favorites}
            onClick={() => setFavorites(!favorites)}
          >
            ♡ Favorites
          </button>
        </div>
        <div className="picker-body">
          {wallpapers.length === 0 ? (
            <div className="empty-state">
              <h2>The library is empty.</h2>
              <p>Upload photos and they go straight into this playlist.</p>
              <button className="primary" onClick={uploadNew}>
                Upload photos
              </button>
            </div>
          ) : visible.length === 0 ? (
            <p className="muted">No matching wallpapers.</p>
          ) : (
            <div className="picker-grid">
              {visible.map((w) => {
                const inPlaylist = playlist.ids.includes(w.id);
                const position = picked.indexOf(w.id);
                return (
                  <button
                    key={w.id}
                    className={`picker-tile ${position >= 0 ? 'is-picked' : ''} ${inPlaylist ? 'is-in' : ''}`}
                    aria-pressed={inPlaylist || position >= 0}
                    aria-label={inPlaylist ? `${w.name}, already in the playlist` : w.name}
                    disabled={inPlaylist}
                    onClick={() => toggle(w.id)}
                  >
                    <img src={thumbnail(w.id)} alt="" loading="lazy" />
                    {inPlaylist && <span className="tile-badge">In playlist</span>}
                    {position >= 0 && <span className="tile-check">{position + 1}</span>}
                    <span className="tile-name">{w.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <footer className="sheet-footer">
          {error && <p className="error small">{error}</p>}
          <button className="link-button small-link" onClick={uploadNew}>
            Upload new photos
          </button>
          <button className="primary" disabled={picked.length === 0} onClick={confirm}>
            {addLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
