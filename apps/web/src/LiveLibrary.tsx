import { useRef } from 'react';
import type { LiveVideo } from '@luma/core/live-wallpaper';

interface Props {
  videos: LiveVideo[];
  loaded: boolean;
  error: string;
  query: string;
  onSelect: (video: LiveVideo) => void;
}

// Live videos share the photo grid and card size so both halves of the library browse the same
// way; the full player, licence and delete controls stay on the Live wallpaper page.
export function LiveLibrary({ videos, loaded, error, query, onSelect }: Props) {
  const visible = videos.filter((video) => video.name.toLowerCase().includes(query.toLowerCase()));
  if (error) return <div className="empty-state">{error}</div>;
  if (!loaded) return <div className="empty-state">Loading live wallpapers…</div>;
  if (!visible.length)
    return (
      <div className="empty-state">
        <div className="empty-icon">✧</div>
        <h2>{query ? 'No matching live wallpapers.' : 'No live wallpapers yet.'}</h2>
      </div>
    );
  return (
    <>
      <div className="wallpaper-grid">
        {visible.map((video) => (
          <LiveTile key={video.id} video={video} onSelect={onSelect} />
        ))}
      </div>
      <div className="collection-footer">
        <span>{visible.length} live wallpapers</span>
      </div>
    </>
  );
}

function LiveTile({ video, onSelect }: { video: LiveVideo; onSelect: (video: LiveVideo) => void }) {
  const player = useRef<HTMLVideoElement>(null);
  const path = `/api/live-wallpapers/${video.id}`;
  function playPreview() {
    player.current?.play().catch(() => {});
  }
  function stopPreview() {
    player.current?.pause();
  }
  return (
    <article className="wallpaper-card">
      <button
        className="wallpaper-image"
        aria-label={`Preview live wallpaper ${video.name}`}
        title={video.description}
        onClick={() => onSelect(video)}
        onMouseEnter={playPreview}
        onMouseLeave={stopPreview}
        onFocus={playPreview}
        onBlur={stopPreview}
      >
        <video
          ref={player}
          poster={`${path}/poster.jpg`}
          src={`${path}/wallpaper.mp4`}
          preload="none"
          muted
          loop
          playsInline
          aria-hidden="true"
        />
        <span className="image-type">LIVE</span>
        <span className="preview-label">Preview & set ↗</span>
      </button>
      <div className="card-info">
        <div>
          <h3>{video.name}</h3>
          <span>
            {Math.round(video.duration)} sec · {(video.bytes / 1048576).toFixed(1)} MB
          </span>
        </div>
      </div>
    </article>
  );
}
