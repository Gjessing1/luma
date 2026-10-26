# Roadmap — Luma

Open work only. **This file is committed to git**, so its history records what shipped and when.

**How to use this file**

- `[ ]` open · `[~]` partly shipped, and only the remainder is described.
- Sections are in priority order, and so are the items inside each one: the first open item is the
  next thing to do.
- **Delete an item when it ships**, in the same commit as the work. Before deleting, move any rule the
  code must keep following into [ARCHITECTURE.md](ARCHITECTURE.md).
- Each item states the outcome, any scope limits, and what's left. Put investigation notes in the
  commit or a design doc, not here.
- Nothing cites this file, and code never cites it. See [README.md](README.md).

## Inbox

Unsorted ideas and bugs. Triage them into a section below.

- [ ] …

---

## Foundation — first deploy

- [ ] Fill in [VISION.md](VISION.md): the problem, core features, non-goals.
- [ ] Record the first decisions in [ARCHITECTURE.md](ARCHITECTURE.md): data model and auth model.
- [ ] `scripts/host-setup.sh` + `scripts/forgejo-setup.sh --push`. CI goes green and
      `/api/health` on the host reports the pushed commit.
- [ ] Caddy site + SSO decision; reachable at `https://luma.gjessing.io`.
- [ ] Add the data dir to backups if it holds anything that can't be recreated.

## Android app — installed on the phone

The shell is already in `apps/android`; this makes it real. See [ANDROID.md](ANDROID.md).

- [ ] Signing key in `~/.config/luma/` (ANDROID.md, first release), backed up, with its
      fingerprint noted in ANDROID.md.
- [ ] Replace the placeholder icon in `apps/android/scripts/generate-icons.mjs`.
- [ ] `npm run android:release` reports the live version; the APK installs on the phone from
      `/api/app/download` and signs in through SSO.

From here on, a user-visible item is done only when it works in the browser **and** in the app.

## Core — the smallest version worth using daily

- [ ] …

## Next

- [ ] …

## Later / maybe

- [ ] PWA install + offline shell (`vite-plugin-pwa`).
