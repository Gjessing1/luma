#!/usr/bin/env bash
# Creates only Luma's own deploy/data directories. Caddy/Homepage changes are separate.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
deploy_dir="$HOME/docker/luma"
mkdir -p "$deploy_dir" "$HOME/data/luma"
if [[ ! -f "$deploy_dir/docker-compose.yml" ]]; then cp "$root/docker-compose.yml" "$deploy_dir/docker-compose.yml"; fi
if [[ ! -f "$deploy_dir/.env" ]]; then
  grep -v '_DATA_DIR=' "$root/.env.example" > "$deploy_dir/.env"
  chmod 600 "$deploy_dir/.env"
fi
echo "Luma deployment: $deploy_dir; data: $HOME/data/luma"
echo 'CI uses scripts/ci-deploy.sh; no shared runner mount or restart is needed.'
echo 'Caddy must proxy port 3048 with SSO, exempting only /api/app/version and /api/app/download.'
