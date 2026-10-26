# Luma

A private wallpaper library and rotation app for our Galaxy S24 Ultra and Galaxy S25.
The library is shared; each phone has its own playlist and offline schedule.

- Upload JPEG, PNG, WebP and AVIF images, or import six original starter wallpapers.
- Search, favorite, rename, preview, download and delete wallpapers.
- Build and reorder a personal playlist; shuffle without immediate repeats.
- Rotate every 15 minutes to 24 hours, or at one or more daily local times.
- Apply to the home screen, lock screen, or both. Downloaded rotation survives
  process death, loss of connectivity, device restart, timezone changes and APK updates.
- Frame images at 1440×3120 (S24 Ultra) or 1080×2340 (S25). Both are 19.5:9.
- Style with AMOLED dimming, blur, warmth and grayscale; export to Gallery for
  Samsung's Photo ambient / weather / frame effects through its own One UI picker.

## Use

Open [Luma](https://luma.gjessing.io) with the household SSO login. Install the
[latest signed Android APK](https://home.gjessing.io/downloads/luma-latest.apk).
The same stable download is available in Homepage → Android Downloads → Luma APK.

1. Import images from either phone or a desktop browser.
2. Use **+** on library cards to build this phone's playlist.
3. In **Schedule**, select the Galaxy profile, destination and times.
4. Select **Save & start rotation** while connected. All selected images are
   downloaded before replacing the previous offline playlist.
5. Use **Pause** or **Next wallpaper** whenever needed.

Open a wallpaper's preview to adjust framing and effects. These are device-wide
playlist settings; save the playlist again to update its downloaded images.
**Apply** changes just the selected wallpaper now and leaves the saved schedule
in place. Rotation can subsequently replace that manually applied wallpaper.

Samsung's proprietary live effects are configured manually in **Wallpaper and
style** after **Export to Gallery**. Pause Luma's rotation for the affected screen
if you want Samsung's effect to remain active. Luma does not automate Samsung's
private APIs, play Wallpaper Engine workshop scenes, or provide video/live
wallpapers in this release. Android battery management may delay scheduled changes;
force-stopping an app suspends its alarms until the next launch.

## Updates and releases

Web UI changes arrive with the normal Docker deployment; reopen the app to load
them. Native changes require a signed APK. The app checks on open, resume and
every six hours while visible, then offers a download through Android's download
manager. Android's installer requires the user's confirmation.

- `GET /api/app/version`: current versionCode, versionName, SHA-256, bytes and APK URL.
- `GET /api/app/download`: stable latest signed APK.
- Homepage `/downloads/luma-latest.apk` proxies that same download.
- Only these release endpoints bypass SSO in Caddy; the image library stays protected.
- Versioned APKs and release metadata live in `LUMA_DATA_DIR/app`. Docker redeploys
  preserve them. `npm run android:release` is the only publishing command and verifies
  the live download's SHA-256. It refuses to overwrite an existing release/versionCode.

For a future native release, increment `versionCode` and `versionName` in
`apps/android/android/app/build.gradle`, commit/push the source, wait for the backend
health SHA to match, then run `npm run android:release`. Keep the same signing key
in `~/.config/luma/keystore.env` and back it up securely outside this host.

## Development

```sh
nvm use
npm ci
cp .env.example .env
npm run dev             # API :3048, Vite :5173
npm run gate            # format, lint, build, types, tests, conditional Docker build
```

The project was created with `projects/shell/scripts/new-project.sh`.
`packages/core` holds shared types, validation and crop logic; `backend` serves the
library/API and React build; `apps/android` is a Capacitor 8 hosted shell with
native wallpaper, cache, alarm and Gallery integration. Android has its own lockfile.

```sh
source ~/android-sdk/env.sh
npm ci --prefix apps/android
cd apps/android && npx cap sync android
cd android && ./gradlew :app:assembleDebug -PserverUrl=http://10.0.2.2:3048
```

Browser and emulator instructions are in `apps/web/e2e/README.md` and
`apps/android/e2e/README.md`. `npm run test:web` starts a disposable backend.

## Hosting

Persistent library images and metadata are under `LUMA_DATA_DIR/wallpapers`.
Uploads are oriented and normalized to JPEG (maximum 6000px per side, EXIF stripped),
so keep your original source photos separately. Back up the whole data directory.
The server binds to loopback and Docker's bridge at port 3048, behind Caddy/SSO;
it is not intended to be exposed directly without authentication.

Pushes to `main` build, smoke-test and publish
`git.gjessing.io/gjessing1/luma-backend:latest`, then redeploy the compose stack in
`~/docker/luma`. The CI deploy helper reads only this app's compose/env files through
the host Docker daemon and requires no changes to the shared runner configuration.
The compose network uses an explicit subnet because this host's default address
pools are exhausted. Health: `GET /api/health` reports the running git SHA.

## Added photos

The household collection includes 13 real photos: Milky Way over the French Alps
and above Earth, Lofoten peaks, sunlit and misty forests, ISS exterior/cupola/spacewalk views, ice crystals in microgravity, orbital aurora and sunset, the Moon, and the Bahamas from orbit. Credits
and source links appear in each photo's preview. Sources and download URLs are
recorded in `scripts/curated-photos.json`.

`node scripts/import-photos.mjs` imports that list through the local API. It skips
photos whose source URL is already present and leaves existing wallpapers and
phone playlists alone. `--download-only` prepares a temporary cache without importing.
Set `LUMA_IMPORT_ORIGIN` to target a disposable backend for verification.
