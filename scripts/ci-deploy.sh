#!/usr/bin/env bash
# Read only this app's compose/env files through the host daemon. This avoids
# adding a per-app bind mount to the shared Forgejo runner configuration.
set -euo pipefail
source_dir="${DEPLOY_DIR:-/home/gjessing/docker/productivity/luma}"
scratch_dir="$(mktemp -d)"
trap 'rm -rf "$scratch_dir"' EXIT
chmod 700 "$scratch_dir"
docker run --rm -v "$source_dir:/deploy:ro" alpine:3 tar -C /deploy -cf - docker-compose.yml .env | tar -C "$scratch_dir" -xf -
chmod 600 "$scratch_dir/.env"
# Pull here, where the job's registry login lives.
docker compose --project-name luma --project-directory "$scratch_dir" pull
# Recreate from the real deploy dir, through a compose client on the host daemon,
# so the project's working_dir label (and any relative path) points there and not
# at this deleted scratch dir. act-latest is the job image, so it is always local.
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$source_dir:$source_dir:ro" -w "$source_dir" catthehacker/ubuntu:act-latest \
  docker compose --project-name luma up -d --remove-orphans --pull never
