#!/usr/bin/env bash
# Read only this app's compose/env files through the host daemon. This avoids
# adding a per-app bind mount to the shared Forgejo runner configuration.
set -euo pipefail
source_dir="${DEPLOY_DIR:-/home/gjessing/docker/Productivity/luma}"
scratch_dir="$(mktemp -d)"
trap 'rm -rf "$scratch_dir"' EXIT
chmod 700 "$scratch_dir"
docker run --rm -v "$source_dir:/deploy:ro" alpine:3 tar -C /deploy -cf - docker-compose.yml .env | tar -C "$scratch_dir" -xf -
chmod 600 "$scratch_dir/.env"
docker compose --project-name luma --project-directory "$scratch_dir" pull
docker compose --project-name luma --project-directory "$scratch_dir" up -d --remove-orphans
