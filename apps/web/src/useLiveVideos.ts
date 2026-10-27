import { useEffect, useState } from 'react';
import type { LiveVideo } from '@luma/core/live-wallpaper';
import { api } from './wallpaper-client';

export function useLiveVideos() {
  const [videos, setVideos] = useState<LiveVideo[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<LiveVideo[]>('/api/live-wallpapers')
      .then(setVideos)
      .catch(() => {
        setError('Live wallpapers could not load. Reopen this page to try again.');
      })
      .finally(() => setLoaded(true));
  }, []);
  async function remove(video: LiveVideo) {
    await api(`/api/live-wallpapers/${video.id}`, { method: 'DELETE' });
    setVideos((current) => current.filter((entry) => entry.id !== video.id));
  }
  return { videos, loaded, error, remove };
}
