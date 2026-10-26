# syntax=docker/dockerfile:1
# Multi-stage build for the backend + web app (served same-origin).
# The quality gate runs INSIDE this build: a red gate means no image, so CI can
# never push or deploy a broken commit. One install, one gate, one job.
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Manifests only, so the install layer stays cached until a package.json or the
# lockfile changes: a source edit in packages/ must not re-run `npm ci`.
# --parents keeps each manifest at its path, and the glob picks up new
# workspaces without editing this file.
COPY package.json package-lock.json* ./
COPY --parents packages/*/package.json apps/*/package.json backend/package.json ./
# The npm download cache survives across builds on the host BuildKit daemon, so a
# lockfile change re-extracts but does not re-download.
RUN --mount=type=cache,target=/root/.npm \
  npm ci --workspaces --include-workspace-root --no-audit --no-fund --prefer-offline
COPY . .
# build before typecheck: the web app type-checks against packages/core's dist.
RUN npm run format:check && npm run lint && npm run build && npm run typecheck && npm test
# GIT_SHA (CI build-arg; .git is dockerignored so it can't be derived here) is
# reported by /api/health so a deploy can be verified.
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA
RUN npm prune --omit=dev --workspaces --include-workspace-root

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG GIT_SHA=
ENV GIT_SHA=$GIT_SHA
COPY --from=build /app/node_modules ./node_modules
# Every workspace package wholesale: the root node_modules holds a symlink per
# @luma/* package, and a package missing here makes the server crash-loop on
# import (atlas v0.75.0). Copying the whole tree means the list can never rot.
COPY --from=build /app/packages ./packages
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/backend/dist ./backend/dist
# Built web app → backend/public, served same-origin.
COPY --from=build /app/apps/web/dist ./backend/public
WORKDIR /app/backend
ENV LUMA_DATA_DIR=/data
ENV PORT=3048
EXPOSE 3048
# Uid 1000, the same as the host user that owns /home/gjessing/data/luma, so
# files the app writes there stay editable and backup-able without sudo.
USER node
# Shown by `docker ps`. PORT comes from the environment, so an override in the
# deploy .env is still probed correctly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
