import { useEffect, useRef, useState } from 'react';
import {
  devices,
  migrateRotation,
  wallpaperStyle,
  validateRotation,
  type Target,
  type Rotation,
  type Wallpaper,
} from '@luma/core/wallpaper';
import { useNavigation } from './useNavigation';
import { appShell } from './android-shell';
import type { PublishedApp } from './app-update';
import { AppUpdateNotice } from './AppUpdateNotice';
import { LiveWallpaperSettings } from './LiveWallpaperSettings';
import { LiveVideoCollection, useLiveVideos } from './LiveVideoCollection';
import { defaultLiveWallpaper } from '@luma/core/live-wallpaper';
import { RotationSettings } from './RotationSettings';
import { WallpaperDetail } from './WallpaperDetail';
import {
  api,
  imageUrl,
  loadRotation,
  upload,
  wallpaperBridge,
  type NativeState,
} from './wallpaper-client';

export function App() {
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [config, setConfig] = useState<Rotation>(loadRotation);
  const [native, setNative] = useState<NativeState>({});
  const { tab, setTab, selected, setSelected } = useNavigation();
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [release, setRelease] = useState<PublishedApp | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const liveVideos = useLiveVideos();
  const hadDraft = useRef(localStorage.getItem('luma.rotation') !== null);
  async function refresh() {
    setWallpapers(await api<Wallpaper[]>('/api/wallpapers'));
  }
  function refreshNative(state: NativeState) {
    setNative(state);
    if (state.config) {
      const saved = migrateRotation(state.config);
      setConfig((current) => ({ ...saved, styles: current.styles ?? saved.styles }));
    }
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    wallpaperBridge()
      ?.getState()
      .then((state) => {
        setNative(state);
        if (state.config && !hadDraft.current) setConfig(migrateRotation(state.config));
        else if (!hadDraft.current && state.model?.startsWith('SM-S931'))
          setConfig((c) => ({ ...c, device: 's25' }));
      })
      .catch((e) => setError(String(e)));
    api<PublishedApp>('/api/app/version')
      .then(setRelease)
      .catch(() => {});
  }, []);
  useEffect(() => {
    localStorage.setItem('luma.rotation', JSON.stringify(config));
  }, [config]);
  useEffect(() => {
    function refreshState() {
      if (!document.hidden)
        wallpaperBridge()
          ?.getState()
          .then(setNative)
          .catch(() => {});
    }
    document.addEventListener('visibilitychange', refreshState);
    return () => document.removeEventListener('visibilitychange', refreshState);
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice('Saved successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function move(id: string, offset: number) {
    const ids = [...config.ids];
    const index = ids.indexOf(id);
    const other = index + offset;
    if (index < 0 || other < 0 || other >= ids.length) return;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    setConfig({ ...config, ids });
  }
  function toggle(id: string) {
    setConfig((c) => ({
      ...c,
      ids: c.ids.includes(id) ? c.ids.filter((item) => item !== id) : [...c.ids, id],
    }));
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    await run(async () => {
      let imported = 0;
      try {
        for (const file of files) {
          setNotice(`Importing ${++imported} of ${files.length}…`);
          await upload(file);
        }
      } finally {
        await refresh();
        if (input.current) input.current.value = '';
      }
    });
  }
  const visible = wallpapers.filter(
    (w) =>
      (!favorites || w.favorite) &&
      (tab !== 'playlist' || config.ids.includes(w.id)) &&
      w.name.toLowerCase().includes(query.toLowerCase()),
  );
  if (tab === 'playlist')
    visible.sort((a, b) => config.ids.indexOf(a.id) - config.ids.indexOf(b.id));
  const detail = wallpapers.find((w) => w.id === selected);
  const profile = devices[config.device];
  const missing = config.ids.filter((id) => !wallpapers.some((w) => w.id === id));
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a className="brand" href="/">
          <img src="/favicon.svg" alt="" />
          <span>
            luma<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="sidebar-label">WALLPAPERS</span>
        <nav>
          {(
            [
              ['library', '▦', 'Library'],
              ['playlist', '◫', 'My playlist'],
              ['schedule', '◷', 'Schedule'],
              ['live', '✧', 'Live wallpaper'],
            ] as const
          ).map(([key, icon, title]) => (
            <button
              className={tab === key ? 'nav-active' : ''}
              key={key}
              aria-label={title}
              onClick={() => setTab(key)}
            >
              <span>{icon}</span>
              {title}
              <small>
                {key === 'library'
                  ? wallpapers.length
                  : key === 'playlist'
                    ? config.ids.length
                    : ''}
              </small>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="device-symbol">▯</span>
          <strong>{profile.name}</strong>
          <span>
            {profile.width} × {profile.height}
          </span>
          <span className="device-local">
            {wallpaperBridge() ? 'Android connected' : 'Web browser'}
          </span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>Shared library</span>
          <span>{profile.name}</span>
        </header>
        <AppUpdateNotice />
        <section className="intro">
          <div>
            <h1>
              {
                {
                  library: 'Library',
                  playlist: 'Playlist',
                  schedule: 'Schedule',
                  live: 'Live wallpaper',
                }[tab]
              }
            </h1>
            <p>
              {tab === 'library'
                ? 'Add photos and choose wallpapers for your phone.'
                : tab === 'playlist'
                  ? 'Choose the wallpapers to rotate on this phone.'
                  : tab === 'live'
                    ? 'Choose an animated background for your home screen.'
                    : 'Set when this phone changes wallpaper.'}
            </p>
          </div>
          <button
            className="primary upload-button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <span>+</span> Add wallpapers
          </button>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            hidden
            onChange={(e) => {
              void importFiles(e.target.files);
            }}
          />
        </section>
        {error && (
          <div role="alert" className="alert error">
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="alert">
            {notice}
          </div>
        )}
        {tab === 'live' ? (
          <LiveWallpaperSettings
            state={native}
            busy={busy}
            run={(action) => {
              void run(action);
            }}
            refreshNative={setNative}
          />
        ) : tab === 'schedule' ? (
          <RotationSettings
            config={config}
            setConfig={setConfig}
            state={native}
            busy={busy}
            run={(action) => {
              validateAndRun(action);
            }}
            refreshNative={refreshNative}
          />
        ) : (
          <>
            {tab === 'library' && !query && !favorites && (
              <LiveVideoCollection
                videos={liveVideos.videos}
                error={liveVideos.error}
                onBrowse={() => setTab('live')}
                onSelect={(video) => {
                  localStorage.setItem(
                    'luma.live',
                    JSON.stringify({ ...defaultLiveWallpaper, scene: 'video', videoId: video.id }),
                  );
                  setTab('live');
                }}
              />
            )}
            <div className="library-toolbar">
              <div className="filter-tabs">
                <button
                  className={!favorites ? 'filter-active' : ''}
                  onClick={() => setFavorites(false)}
                >
                  All wallpapers{' '}
                  <small>{tab === 'playlist' ? config.ids.length : wallpapers.length}</small>
                </button>
                <button
                  className={favorites ? 'filter-active' : ''}
                  onClick={() => setFavorites(true)}
                >
                  ♡ Favorites
                </button>
              </div>
              <input
                type="search"
                aria-label="Search wallpapers"
                placeholder="Search wallpapers…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {tab === 'playlist' && (
              <div className="playlist-note">
                <p>
                  {config.ids.length} selected · {config.shuffle ? 'Shuffled' : 'Selection order'} ·{' '}
                  {config.mode === 'interval'
                    ? `Every ${config.intervalMinutes} minutes`
                    : config.dailyTimes.join(', ')}
                </p>
                <button onClick={() => setTab('schedule')}>Save playlist & schedule ↗</button>
              </div>
            )}
            {missing.length > 0 && (
              <div className="alert">
                {missing.length} playlist image(s) were removed from the library.
                <button
                  onClick={() =>
                    setConfig({ ...config, ids: config.ids.filter((id) => !missing.includes(id)) })
                  }
                >
                  Remove missing entries
                </button>
              </div>
            )}
            {loading ? (
              <div className="empty-state">Loading wallpapers…</div>
            ) : visible.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">▧</div>
                <h2>
                  {query || favorites
                    ? 'No matching wallpapers.'
                    : tab === 'playlist'
                      ? 'Playlist is empty.'
                      : 'No wallpapers yet.'}
                </h2>
                <p>
                  {tab === 'playlist'
                    ? 'Add wallpapers from your library with the playlist button.'
                    : 'Upload photos to the shared library.'}
                </p>
                <button
                  onClick={() => (tab === 'playlist' ? setTab('library') : input.current?.click())}
                >
                  {tab === 'playlist' ? 'Browse library' : 'Add your first wallpaper'}
                </button>
                {tab === 'library' && !query && !favorites && (
                  <button
                    className="starter-button"
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        setNotice('Adding abstract backgrounds…');
                        await api('/api/wallpapers/starter', { method: 'POST' });
                        await refresh();
                      });
                    }}
                  >
                    Add abstract backgrounds
                  </button>
                )}
              </div>
            ) : (
              <div className="wallpaper-grid">
                {visible.map((w) => (
                  <article className="wallpaper-card" key={w.id}>
                    <button
                      className="wallpaper-image"
                      onClick={() => setSelected(w.id)}
                      aria-label={`Preview ${w.name}`}
                    >
                      <img loading="lazy" src={imageUrl(w.id, config, true)} alt={w.name} />
                      <span className="image-type">IMAGE</span>
                      <span className="preview-label">Preview & style ↗</span>
                    </button>
                    <button
                      className={`favorite-button ${w.favorite ? 'is-favorite' : ''}`}
                      aria-label={`${w.favorite ? 'Unfavorite' : 'Favorite'} ${w.name}`}
                      onClick={() => {
                        void run(async () => {
                          await api(`/api/wallpapers/${w.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ favorite: !w.favorite }),
                          });
                          await refresh();
                        });
                      }}
                    >
                      {w.favorite ? '♥' : '♡'}
                    </button>
                    <div className="card-info">
                      <div>
                        <h3>{w.name}</h3>
                        <span>
                          {tab === 'playlist' ? `${config.ids.indexOf(w.id) + 1} · ` : ''}
                          {w.width} × {w.height}
                        </span>
                      </div>
                      <button
                        className={`playlist-add ${config.ids.includes(w.id) ? 'is-added' : ''}`}
                        aria-label={`${config.ids.includes(w.id) ? 'Remove from' : 'Add to'} playlist: ${w.name}`}
                        onClick={() => toggle(w.id)}
                      >
                        {config.ids.includes(w.id) ? '✓' : '+'}
                      </button>
                    </div>
                    {tab === 'playlist' && (
                      <div className="playlist-order">
                        <button
                          aria-label={`Move ${w.name} earlier`}
                          disabled={config.ids.indexOf(w.id) === 0}
                          onClick={() => move(w.id, -1)}
                        >
                          ← Earlier
                        </button>
                        <button
                          aria-label={`Move ${w.name} later`}
                          disabled={config.ids.indexOf(w.id) === config.ids.length - 1}
                          onClick={() => move(w.id, 1)}
                        >
                          Later →
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            <div className="collection-footer">
              <span>{visible.length} wallpapers</span>
            </div>
          </>
        )}
        <footer>
          <span>Luma</span>
          {!appShell() && release && (
            <a href="/api/app/download">Android APK · {release.versionName}</a>
          )}
        </footer>
      </main>
      {detail && (
        <WallpaperDetail
          wallpaper={detail}
          key={detail.id}
          config={{ ...config, ...wallpaperStyle(config, detail.id) }}
          setConfig={(next) =>
            setConfig((current) => ({
              ...current,
              styles: {
                ...current.styles,
                [detail.id]: {
                  focalX: next.focalX,
                  focalY: next.focalY,
                  zoom: next.zoom ?? 100,
                  effects: next.effects,
                },
              },
            }))
          }
          close={() => setSelected(null)}
          supportsZoom={!wallpaperBridge() || !!native.supportsZoom}
          busy={busy}
          run={(action) => {
            void run(action);
          }}
          apply={async (target: Target) => {
            const single = {
              ...config,
              ...wallpaperStyle(config, detail.id),
              target,
              ids: [detail.id],
              enabled: false,
            };
            validateRotation(single);
            const state = await wallpaperBridge()!.apply({ config: single });
            setNative(state);
          }}
          remove={async () => {
            await api(`/api/wallpapers/${detail.id}`, { method: 'DELETE' });
            setConfig((c) => ({ ...c, ids: c.ids.filter((id) => id !== detail.id) }));
            setSelected(null);
            await refresh();
          }}
          rename={async (name) => {
            await api(`/api/wallpapers/${detail.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            await refresh();
          }}
        />
      )}
    </div>
  );
  function validateAndRun(action: () => Promise<void>) {
    void run(async () => {
      validateRotation(config);
      await action();
    });
  }
}
