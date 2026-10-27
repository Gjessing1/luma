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
import { addToPlaylist, removeFromPlaylist } from '@luma/core/playlist-edit';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { useNavigation } from './useNavigation';
import { appShell } from './android-shell';
import type { PublishedApp } from './app-update';
import { AppUpdateNotice } from './AppUpdateNotice';
import { useLiveVideos } from './useLiveVideos';
import { LiveLibrary, liveKey } from './LiveLibrary';
import { LiveDetail, type LiveItem } from './LiveDetail';
import { liveScenes } from '@luma/core/live-wallpaper';
import { PlaylistPage } from './PlaylistPage';
import { usePhoneSettings } from './usePhoneSettings';
import { WallpaperDetail } from './WallpaperDetail';
import { api, imageUrl, upload, wallpaperBridge } from './wallpaper-client';

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
  // The playlist that photos being uploaded join, when the upload started from a playlist.
  const uploadInto = useRef<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
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
  // Returns the reason a change was refused, which is also shown at the top of the page.
  function savePlaylist(next: Playlist): string | null {
    try {
      validatePlaylist(next);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      return message;
    }
    setError('');
    setSettings((current) => ({
      ...current,
      playlists: current.playlists.map((p) => (p.id === next.id ? next : p)),
    }));
    return null;
  }
  function selectPlaylist(id: string) {
    setSettings((current) => ({ ...current, current: id }));
  }
  function createPlaylist(ids: string[] = []) {
    const names = new Set(settings.playlists.map((p) => p.name));
    let number = settings.playlists.length + 1;
    while (names.has(`Playlist ${number}`)) number++;
    const created = { ...newPlaylist(newPlaylistId(), `Playlist ${number}`), ids };
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
  function uploadPhotos(playlistId: string | null) {
    uploadInto.current = playlistId;
    input.current?.click();
  }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const target = uploadInto.current;
    uploadInto.current = null;
    await run(async () => {
      let imported = 0;
      const uploaded: string[] = [];
      let failure: unknown = null;
      try {
        for (const file of files) {
          setNotice(`Importing ${++imported} of ${files.length}…`);
          uploaded.push((await upload(file)).id);
        }
      } catch (e) {
        failure = e;
      }
      await refresh();
      if (input.current) input.current.value = '';
      // Even when a later file fails, the ones already uploaded join the playlist.
      const into = settings.playlists.find((p) => p.id === target);
      if (into && uploaded.length > 0) {
        const problem = savePlaylist(addToPlaylist(into, uploaded));
        if (problem) throw new Error(`Uploaded to the library, not the playlist: ${problem}`);
      }
      if (failure) throw failure;
    });
  }
  const filter = chosenFilter;
  const favorites = filter === 'favorites';
  const visible = wallpapers.filter(
    (w) => (!favorites || w.favorite) && w.name.toLowerCase().includes(query.toLowerCase()),
  );
  const addingWallpaper = wallpapers.find((w) => w.id === adding);
  function thumbnail(id: string): string {
    return imageUrl(id, config, true);
  }
  const detail = wallpapers.find((w) => w.id === selected);
  const liveDetail = findLive(selected);
  const profile = devices[settings.device];
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
          {tab === 'library' && (
            <button
              className="primary upload-button"
              disabled={busy}
              onClick={() => uploadPhotos(null)}
            >
              <span>+</span> Upload photos
            </button>
          )}
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
          <PlaylistPage
            settings={settings}
            setDevice={(device) => setSettings((current) => ({ ...current, device }))}
            native={native}
            refreshNative={refreshNative}
            busy={busy}
            run={(action) => {
              void run(action);
            }}
            wallpapers={wallpapers}
            loading={loading}
            thumbnail={thumbnail}
            open={setSelected}
            upload={() => uploadPhotos(playlist.id)}
            save={savePlaylist}
            select={selectPlaylist}
            create={() => createPlaylist()}
            remove={removePlaylist}
          />
        )}
        {tab === 'library' && (
          <>
            <div className="library-toolbar">
              <div className="filter-tabs" role="group" aria-label="Wallpaper type">
                <button
                  className={filter === 'all' ? 'filter-active' : ''}
                  aria-pressed={filter === 'all'}
                  onClick={() => setFilter('all')}
                >
                  Images <small>{wallpapers.length}</small>
                </button>
                <button
                  className={favorites ? 'filter-active' : ''}
                  aria-pressed={favorites}
                  onClick={() => setFilter('favorites')}
                >
                  ♡ Favorites
                </button>
                <button
                  className={filter === 'live' ? 'filter-active' : ''}
                  aria-pressed={filter === 'live'}
                  onClick={() => setFilter('live')}
                >
                  ✧ Live <small>{liveVideos.videos.length}</small>
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
                <h2>{query || favorites ? 'No matching wallpapers.' : 'No wallpapers yet.'}</h2>
                <p>Upload photos to the shared library.</p>
                <button onClick={() => uploadPhotos(null)}>Upload your first photos</button>
                {!query && !favorites && (
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
                      <img loading="lazy" src={thumbnail(w.id)} alt={w.name} />
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
                          {w.width} × {w.height}
                        </span>
                      </div>
                      {playlistButton(w)}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {filter !== 'live' && (
              <div className="collection-footer">
                <span>{visible.length} wallpapers</span>
              </div>
            )}
          </>
        )}
        <footer>
          <span>Luma</span>
          {!appShell() && release && (
            <a href="/api/app/download">Android APK · {release.versionName}</a>
          )}
        </footer>
      </main>
      {addingWallpaper && (
        <AddToPlaylistSheet
          wallpaper={addingWallpaper}
          playlists={settings.playlists}
          thumbnail={thumbnail(addingWallpaper.id)}
          toggle={(playlistId) => {
            const target = settings.playlists.find((p) => p.id === playlistId)!;
            if (target.ids.includes(addingWallpaper.id))
              return savePlaylist(removeFromPlaylist(target, [addingWallpaper.id]));
            return savePlaylist(addToPlaylist(target, [addingWallpaper.id]));
          }}
          create={() => {
            createPlaylist([addingWallpaper.id]);
            return null;
          }}
          canCreate={settings.playlists.length < maxPlaylists}
          close={() => setAdding(null)}
        />
      )}
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
              playlists: current.playlists.map((p) => removeFromPlaylist(p, [detail.id])),
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
  // Opens the sheet for choosing which playlists hold this wallpaper.
  function playlistButton(wallpaper: Wallpaper) {
    const count = settings.playlists.filter((p) => p.ids.includes(wallpaper.id)).length;
    let label = `Add ${wallpaper.name} to a playlist`;
    if (count > 0)
      label = `${wallpaper.name} is in ${count} playlist${count === 1 ? '' : 's'}. Change`;
    return (
      <button
        className={`playlist-add ${count > 0 ? 'is-added' : ''}`}
        aria-label={label}
        onClick={() => setAdding(wallpaper.id)}
      >
        {count > 0 ? '✓' : '+'}
        {count > 1 && <small>{count}</small>}
      </button>
    );
  }
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
