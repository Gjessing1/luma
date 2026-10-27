import { useEffect, useRef, useState } from 'react';
import type { LiveVideo } from '@luma/core/live-wallpaper';
import { api } from './wallpaper-client';

export function useLiveVideos() {
  const [videos, setVideos] = useState<LiveVideo[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<LiveVideo[]>('/api/live-wallpapers')
      .then(setVideos)
      .catch(() => {
        setError('Live wallpapers could not load. Reopen this page to try again.');
      });
  }, []);
  async function remove(video: LiveVideo) {
    await api(`/api/live-wallpapers/${video.id}`, { method: 'DELETE' });
    setVideos((current) => current.filter((entry) => entry.id !== video.id));
  }
  return { videos, error, remove };
}

interface Props {
  videos: LiveVideo[];
  error: string;
  selected?: string;
  onSelect?: (video: LiveVideo) => void;
  onBrowse?: () => void;
  onDelete?: (video: LiveVideo) => void;
}

export function LiveVideoCollection({
  videos,
  error,
  selected,
  onSelect,
  onBrowse,
  onDelete,
}: Props) {
  if (!videos.length && !error) return null;
  return (
    <section className="live-collection" aria-label="Live wallpaper collection">
      <div className="section-heading">
        <div>
          <h2>Live collection</h2>
          <p className="muted">Muted video loops, cropped for your phone.</p>
        </div>
        {onBrowse && <button onClick={onBrowse}>Choose a live wallpaper ↗</button>}
      </div>
      {error && <p role="status">{error}</p>}
      <div className="live-video-grid">
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            selected={video.id === selected}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function VideoCard({
  video,
  selected,
  onSelect,
  onDelete,
}: {
  video: LiveVideo;
  selected: boolean;
  onSelect?: (video: LiveVideo) => void;
  onDelete?: (video: LiveVideo) => void;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const path = `/api/live-wallpapers/${video.id}`;
  useEffect(() => {
    function pauseHidden() {
      if (document.hidden) player.current?.pause();
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) player.current?.pause();
    });
    if (player.current) observer.observe(player.current);
    document.addEventListener('visibilitychange', pauseHidden);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', pauseHidden);
    };
  }, []);
  async function togglePreview() {
    if (!player.current) return;
    if (playing) player.current.pause();
    else {
      try {
        setError('');
        await player.current.play();
      } catch {
        setError('Preview unavailable. Try reopening the page.');
      }
    }
  }
  return (
    <article className={`live-video-card ${selected ? 'selected' : ''}`}>
      <video
        ref={player}
        poster={`${path}/poster.jpg`}
        src={`${path}/wallpaper.mp4`}
        preload="none"
        muted
        loop
        playsInline
        aria-label={`${video.name} video preview`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setError('Preview unavailable. Try reopening the page.')}
      />
      <div className="live-video-info">
        <h3>{video.name}</h3>
        <p>{video.description}</p>
        <p className="muted">
          {Math.round(video.duration)} sec · {(video.bytes / 1048576).toFixed(1)} MB
        </p>
        <div className="button-row">
          <button
            onClick={() => {
              void togglePreview();
            }}
            aria-label={`${playing ? 'Pause' : 'Preview'} ${video.name}`}
          >
            {playing ? 'Pause preview' : '▶ Preview motion'}
          </button>
          {onSelect && (
            <button aria-pressed={selected} onClick={() => onSelect(video)}>
              {selected ? 'Selected' : 'Choose wallpaper'}
            </button>
          )}
          {onDelete && (
            <button
              className="danger"
              aria-label={`Delete ${video.name}`}
              onClick={() => {
                if (
                  confirm(
                    `Delete “${video.name}” from the shared live collection? Phones that already downloaded it keep playing their copy.`,
                  )
                )
                  onDelete(video);
              }}
            >
              Delete
            </button>
          )}
        </div>
        {error && <p role="status">{error}</p>}
        <details>
          <summary>Source & license</summary>
          <p>
            <a href={video.source.url} target="_blank" rel="noreferrer">
              {video.source.author}
            </a>{' '}
            ·{' '}
            <a href={video.licenseUrl} target="_blank" rel="noreferrer">
              {video.source.license}
            </a>
          </p>
          <p>{video.changes}</p>
        </details>
      </div>
    </article>
  );
}
