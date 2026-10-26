# Luma

One-line description.

## Development

```sh
nvm use            # Node 24 locally and in Docker
npm install
cp .env.example .env
npm run dev        # tsc watch · backend http://localhost:3048 · web http://localhost:5173
npm run gate       # format → lint → build → typecheck → test (+ docker build if packaging changed)
```

## Layout

- `packages/core`: shared domain types and logic
- `apps/web`: React + Vite web app

- `apps/android`: Capacitor Android shell over the hosted web app (own lockfile)

- `backend`: Fastify API; serves the built web app in production

## Deployment

Pushing to `main` builds the image on Forgejo Actions, pushes it to `git.gjessing.io/gjessing1/luma-backend`
and redeploys it on the host. Health check: `GET /api/health`.

## Android

`npm run android:release` builds the signed APK, publishes it and checks what the live server serves.
Install it from `https://luma.gjessing.io/api/app/download`.
