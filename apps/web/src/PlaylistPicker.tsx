import { useEffect, useRef } from 'react';
import { screensShowing, type Playlist, type Running } from '@luma/core/playlist';
import { destinationLabel, screensLabel } from './playlist-text';

interface Props {
  playlists: Playlist[];
  current: string;
  running: Running;
  // A thumbnail URL for the playlist's first wallpaper still in the library.
  cover: (playlist: Playlist) => string | undefined;
  select: (playlistId: string) => void;
  create: () => void;
  canCreate: boolean;
}
// One scrolling row on a phone, so thirty playlists don't push the editor off the screen.
export function PlaylistPicker(props: Props) {
  const { playlists, current, running, cover, select, create, canCreate } = props;
  const row = useRef<HTMLDivElement>(null);
  // Keeps the selected chip in view, e.g. a new playlist added at the end of the row. Only the
  // row scrolls; scrollIntoView would also move the page.
  useEffect(() => {
    const container = row.current;
    const chip = container?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!container || !chip) return;
    // On a phone the row runs to the screen edges, so keep the chip inside the page gutter.
    const gutter = parseFloat(getComputedStyle(container).paddingLeft) || 0;
    const box = container.getBoundingClientRect();
    const bounds = chip.getBoundingClientRect();
    if (bounds.left < box.left + gutter) container.scrollLeft -= box.left + gutter - bounds.left;
    else if (bounds.right > box.right - gutter)
      container.scrollLeft += bounds.right - (box.right - gutter);
  }, [current, playlists.length]);
  return (
    <div className="playlist-picker" role="group" aria-label="Saved playlists" ref={row}>
      {playlists.map((playlist) => {
        const screens = screensShowing(playlist.id, running);
        const image = cover(playlist);
        return (
          <button
            key={playlist.id}
            className={`playlist-chip ${playlist.id === current ? 'chip-active' : ''}`}
            aria-pressed={playlist.id === current}
            onClick={() => select(playlist.id)}
          >
            <span className="chip-cover" aria-hidden="true">
              {image && <img src={image} alt="" loading="lazy" />}
            </span>
            <span className="chip-text">
              <strong>{playlist.name}</strong>
              <small>
                {destinationLabel(playlist.target)} · {playlist.ids.length}
              </small>
              {screens.length > 0 && (
                <span className="chip-status">● On {screensLabel(screens)}</span>
              )}
            </span>
          </button>
        );
      })}
      <button
        className="playlist-chip new-chip"
        aria-label="+ New playlist"
        disabled={!canCreate}
        onClick={create}
      >
        <span aria-hidden="true">+</span>
        <small>New</small>
      </button>
    </div>
  );
}
