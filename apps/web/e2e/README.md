# Luma browser verification

Run `npm run build` then `npm run test:web`. The harness starts its own server with
an empty temporary data directory on port 3098 and deletes it on exit. It never
uses the live library. Set `LUMA_TEST_PORT` if that port is taken.

Set `CHROMIUM_PATH` to a Chromium headless executable. On this host:

```sh
LD_LIBRARY_PATH=/tmp/luma-browser-libs/usr/lib/x86_64-linux-gnu \
CHROMIUM_PATH="$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell" \
npm run test:web
```

If the host lacks ATK/audio dependencies, download the Ubuntu packages to a scratch
directory with `apt-get download libatk1.0-0t64 libatk-bridge2.0-0t64 libxdamage1
libasound2t64 libatspi2.0-0t64` and extract them with `dpkg -x` (no root required).
The harness uses playwright-core, so an installed Chromium is required.

Checks: empty library, starter import, search, favorites, file upload, playlist
selection and ordering, Galaxy profiles, effect preview, image download, persistence,
rename and delete. Screenshots are written to ignored `test-results/` at desktop,
S24 Ultra and S25 viewport sizes. It also checks for horizontal overflow and JS errors.

The harness also checks that installation links are hidden in an Android shell while a newer-version notice still calls the native download method.

2026-10-26 checks also cover isolated per-wallpaper edits across reloads, Undo and
Reset position/all, all four preview surfaces, browser Back across previews/tabs,
and one-off Home/Lock/Both apply calls independently from rotation settings.
