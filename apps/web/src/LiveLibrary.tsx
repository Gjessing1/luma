import { useRef, useState } from 'react';
import { liveScenes, type LiveVideo, type LiveWallpaperConfig } from '@luma/core/live-wallpaper';

interface Props {
  videos: LiveVideo[];
  loaded: boolean;
  error: string;
  query: string;
  active?: LiveWallpaperConfig;
  onOpen: (key: string) => void;
}

// Keys for the preview dialog, kept in navigation so Back closes it like a photo preview.
export function liveKey(kind: 'video' | 'scene', id: string): string {
  return `${kind}:${id}`;
}

// Live videos share the photo grid and card size so both halves of the library browse the same
// way.
export function LiveLibrary({ videos, loaded, error, query, active, onOpen }: Props) {
  const [showGenerated, setShowGenerated] = useState(() => {
    try {
      return localStorage.getItem('luma.showGenerated') === '1';
    } catch {
      return false;
    }
  });
  function rememberGenerated(open: boolean) {
    setShowGenerated(open);
    try {
      localStorage.setItem('luma.showGenerated', open ? '1' : '0');
    } catch {
      // Only a display preference.
    }
  }
  function matches(name: string) {
    return name.toLowerCase().includes(query.toLowerCase());
  }
  const visible = videos.filter((video) => matches(video.name));
  const scenes = liveScenes.filter((scene) => matches(scene.name));
  if (error) return <div className="empty-state">{error}</div>;
  if (!loaded) return <div className="empty-state">Loading live wallpapers…</div>;
  if (!visible.length && !scenes.length)
    return (
      <div className="empty-state">
        <div className="empty-icon">✧</div>
        <h2>No matching live wallpapers.</h2>
      </div>
    );
  return (
    <>
      {visible.length > 0 && (
        <div className="wallpaper-grid">
          {visible.map((video) => (
            <VideoTile
              key={video.id}
              video={video}
              active={active?.scene === 'video' && active.videoId === video.id}
              onOpen={() => onOpen(liveKey('video', video.id))}
            />
          ))}
        </div>
      )}
      {scenes.length > 0 && (
        <details
          className="generated-scenes"
          // Searching should never hide a match inside a folded section.
          open={showGenerated || !!query}
          onToggle={(event) => {
            if (!query) rememberGenerated(event.currentTarget.open);
          }}
        >
          <summary>Generated scenes · drawn by the app, can’t be deleted</summary>
          <div className="wallpaper-grid">
            {scenes.map((scene) => (
              <article className="wallpaper-card" key={scene.id}>
                <button
                  className="wallpaper-image"
                  aria-label={`Preview live wallpaper ${scene.name}`}
                  onClick={() => onOpen(liveKey('scene', scene.id))}
                >
                  <span className={`live-art live-${scene.id}`} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <TileBadges kind="SCENE" active={active?.scene === scene.id} />
                </button>
                <div className="card-info">
                  <div>
                    <h3>{scene.name}</h3>
                    <span>{scene.description}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
      <div className="collection-footer">
        <span>
          {visible.length} live videos · {scenes.length} generated scenes
        </span>
      </div>
    </>
  );
}

function TileBadges({ kind, active }: { kind: string; active: boolean }) {
  return (
    <>
      <span className="image-type">{kind}</span>
      {active && <span className="active-badge">● ACTIVE</span>}
      <span className="preview-label">Preview ↗</span>
    </>
  );
}

function VideoTile({
  video,
  active,
  onOpen,
}: {
  video: LiveVideo;
  active: boolean;
  onOpen: () => void;
}) {
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
        onClick={onOpen}
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
        <TileBadges kind="LIVE" active={active} />
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
