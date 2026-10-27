import { useEffect, useRef, useState } from 'react';
import {
  devices,
  wallpaperStyle,
  validateRotation,
  type Target,
  type Rotation,
  type Wallpaper,
} from '@luma/core/wallpaper';
import {
  currentPlaylist,
  maxPlaylists,
  newPlaylist,
  playlistRotation,
  validatePlaylist,
  type Playlist,
} from '@luma/core/playlist';
import { useNavigation } from './useNavigation';
import { appShell } from './android-shell';
import type { PublishedApp } from './app-update';
import { AppUpdateNotice } from './AppUpdateNotice';
import { useLiveVideos } from './useLiveVideos';
import { LiveLibrary, liveKey } from './LiveLibrary';
import { LiveDetail, type LiveItem } from './LiveDetail';
import { liveScenes } from '@luma/core/live-wallpaper';
import { PhoneStatus } from './PhoneStatus';
import { PlaylistPicker } from './PlaylistPicker';
import { PlaylistSettings } from './PlaylistSettings';
import { usePhoneSettings } from './usePhoneSettings';
import { WallpaperDetail } from './WallpaperDetail';
import { api, imageUrl, runningRotations, upload, wallpaperBridge } from './wallpaper-client';

export function App() {
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const { tab, setTab, selected, setSelected } = useNavigation();
  const [query, setQuery] = useState('');
  const [chosenFilter, setFilter] = useState<'all' | 'favorites' | 'live'>(() =>
    selected?.startsWith('video:') || selected?.startsWith('scene:') ? 'live' : 'all',
  );
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [release, setRelease] = useState<PublishedApp | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const liveVideos = useLiveVideos();
  const { settings, setSettings, native, setNative, refreshNative } = usePhoneSettings((e) =>
    setError(String(e)),
  );
  const playlist = currentPlaylist(settings);
  // The current playlist with every adjustment on this phone, for previews and one-off applies.
  const config: Rotation = {
    ...playlistRotation(playlist, settings, false),
    styles: settings.styles,
  };
  async function refresh() {
    setWallpapers(await api<Wallpaper[]>('/api/wallpapers'));
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    api<PublishedApp>('/api/app/version')
      .then(setRelease)
      .catch(() => {});
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
  function changePlaylist(patch: Partial<Playlist>) {
    const next = { ...playlist, ...patch };
    try {
      validatePlaylist(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setError('');
    setSettings((current) => ({
      ...current,
      playlists: current.playlists.map((p) => (p.id === next.id ? next : p)),
    }));
  }
  function selectPlaylist(id: string) {
    setSettings((current) => ({ ...current, current: id }));
  }
  function createPlaylist() {
    const names = new Set(settings.playlists.map((p) => p.name));
    let number = settings.playlists.length + 1;
    while (names.has(`Playlist ${number}`)) number++;
    const created = newPlaylist(newPlaylistId(), `Playlist ${number}`);
    setSettings((current) => ({
      ...current,
      playlists: [...current.playlists, created],
      current: created.id,
    }));
  }
  function removePlaylist(id: string) {
    setSettings((current) => {
      const playlists = current.playlists.filter((p) => p.id !== id);
      return { ...current, playlists, current: playlists[0]!.id };
    });
  }
  function move(id: string, offset: number) {
    const ids = [...playlist.ids];
    const index = ids.indexOf(id);
    const other = index + offset;
    if (index < 0 || other < 0 || other >= ids.length) return;
    [ids[index], ids[other]] = [ids[other]!, ids[index]!];
    changePlaylist({ ids });
  }
  function toggle(id: string) {
    changePlaylist({
      ids: playlist.ids.includes(id)
        ? playlist.ids.filter((item) => item !== id)
        : [...playlist.ids, id],
    });
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
  // Live videos can't join the photo playlist, so the playlist never shows the Live chip.
  const filter = tab === 'playlist' && chosenFilter === 'live' ? 'all' : chosenFilter;
  const favorites = filter === 'favorites';
  const visible = wallpapers.filter(
    (w) =>
      (!favorites || w.favorite) &&
      (tab !== 'playlist' || playlist.ids.includes(w.id)) &&
      w.name.toLowerCase().includes(query.toLowerCase()),
  );
  if (tab === 'playlist')
    visible.sort((a, b) => playlist.ids.indexOf(a.id) - playlist.ids.indexOf(b.id));
  const detail = wallpapers.find((w) => w.id === selected);
  const liveDetail = findLive(selected);
  const profile = devices[settings.device];
  // Only once the library has loaded: before that every playlist image would look missing.
  const missing = loading ? [] : playlist.ids.filter((id) => !wallpapers.some((w) => w.id === id));
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
              ['playlist', '◫', 'Playlists'],
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
              <small>{key === 'library' ? wallpapers.length : settings.playlists.length}</small>
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
            <h1>{tab === 'library' ? 'Library' : 'Playlists'}</h1>
            <p>
              {tab === 'library'
                ? 'Add photos and choose wallpapers for your phone.'
                : 'Save playlists for the home and lock screen. Each screen runs one at a time.'}
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
        {tab === 'playlist' && (
          <>
            <PhoneStatus
              settings={settings}
              setDevice={(device) => setSettings((current) => ({ ...current, device }))}
              native={native}
              busy={busy}
              run={(action) => {
                void run(action);
              }}
              refreshNative={refreshNative}
              select={selectPlaylist}
            />
            <PlaylistPicker
              playlists={settings.playlists}
              current={playlist.id}
              running={runningRotations(native)}
              select={selectPlaylist}
              create={createPlaylist}
              canCreate={settings.playlists.length < maxPlaylists}
            />
            <PlaylistSettings
              key={playlist.id}
              playlist={playlist}
              settings={settings}
              change={changePlaylist}
              remove={() => removePlaylist(playlist.id)}
              native={native}
              busy={busy}
              run={(action) => {
                void run(action);
              }}
              refreshNative={refreshNative}
            />
            <h2 className="playlist-images-heading">Wallpapers in “{playlist.name}”</h2>
          </>
        )}
        <div className="library-toolbar">
          <div className="filter-tabs" role="group" aria-label="Wallpaper type">
            <button
              className={filter === 'all' ? 'filter-active' : ''}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              Images <small>{tab === 'playlist' ? playlist.ids.length : wallpapers.length}</small>
            </button>
            <button
              className={favorites ? 'filter-active' : ''}
              aria-pressed={favorites}
              onClick={() => setFilter('favorites')}
            >
              ♡ Favorites
            </button>
            {tab === 'library' && (
              <button
                className={filter === 'live' ? 'filter-active' : ''}
                aria-pressed={filter === 'live'}
                onClick={() => setFilter('live')}
              >
                ✧ Live <small>{liveVideos.videos.length}</small>
              </button>
            )}
          </div>
          {tab === 'library' && (
            <label className="adding-to">
              Add to playlist
              <select value={playlist.id} onChange={(e) => selectPlaylist(e.target.value)}>
                {settings.playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            type="search"
            aria-label="Search wallpapers"
            placeholder="Search wallpapers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {missing.length > 0 && (
          <div className="alert">
            {missing.length} image(s) in “{playlist.name}” were removed from the library.
            <button
              onClick={() =>
                changePlaylist({ ids: playlist.ids.filter((id) => !missing.includes(id)) })
              }
            >
              Remove missing entries
            </button>
          </div>
        )}
        {filter === 'live' ? (
          <LiveLibrary
            videos={liveVideos.videos}
            loaded={liveVideos.loaded}
            error={liveVideos.error}
            query={query}
            active={native.live?.active ? native.live.config : undefined}
            onOpen={setSelected}
          />
        ) : loading ? (
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
                ? `Open the Library, choose “${playlist.name}” under Add to playlist and tap + on a wallpaper.`
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
                      {tab === 'playlist' ? `${playlist.ids.indexOf(w.id) + 1} · ` : ''}
                      {w.width} × {w.height}
                    </span>
                  </div>
                  <button
                    className={`playlist-add ${playlist.ids.includes(w.id) ? 'is-added' : ''}`}
                    aria-label={`${playlist.ids.includes(w.id) ? 'Remove from' : 'Add to'} ${playlist.name}: ${w.name}`}
                    onClick={() => toggle(w.id)}
                  >
                    {playlist.ids.includes(w.id) ? '✓' : '+'}
                  </button>
                </div>
                {tab === 'playlist' && (
                  <div className="playlist-order">
                    <button
                      aria-label={`Move ${w.name} earlier`}
                      disabled={playlist.ids.indexOf(w.id) === 0}
                      onClick={() => move(w.id, -1)}
                    >
                      ← Earlier
                    </button>
                    <button
                      aria-label={`Move ${w.name} later`}
                      disabled={playlist.ids.indexOf(w.id) === playlist.ids.length - 1}
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
        {filter !== 'live' && (
          <div className="collection-footer">
            <span>{visible.length} wallpapers</span>
          </div>
        )}
        <footer>
          <span>Luma</span>
          {!appShell() && release && (
            <a href="/api/app/download">Android APK · {release.versionName}</a>
          )}
        </footer>
      </main>
      {liveDetail && (
        <LiveDetail
          item={liveDetail}
          key={selected}
          device={settings.device}
          state={native}
          busy={busy}
          run={(action) => {
            void run(action);
          }}
          refreshNative={setNative}
          close={() => setSelected(null)}
          remove={liveVideos.remove}
        />
      )}
      {detail && (
        <WallpaperDetail
          wallpaper={detail}
          key={detail.id}
          config={{ ...config, ...wallpaperStyle(config, detail.id) }}
          setConfig={(next) =>
            setSettings((current) => ({
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
            setSettings((current) => ({
              ...current,
              playlists: current.playlists.map((p) => ({
                ...p,
                ids: p.ids.filter((id) => id !== detail.id),
              })),
            }));
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
  function findLive(key: string | null): LiveItem | undefined {
    for (const video of liveVideos.videos)
      if (key === liveKey('video', video.id)) return { kind: 'video', video };
    for (const scene of liveScenes)
      if (key === liveKey('scene', scene.id)) return { kind: 'scene', scene };
    return undefined;
  }
}
// crypto.randomUUID needs a secure context; the emulator's plain-HTTP debug origin is not one.
function newPlaylistId(): string {
  let id = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(16)))
    id += byte.toString(16).padStart(2, '0');
  return id;
}
