#!/usr/bin/env bash
# One-time host setup for deploying this project on gjessing-server.
#
#   scripts/host-setup.sh [--apply-runner]
#
# - Creates /home/gjessing/docker/<slug>/ with docker-compose.yml + .env (never
#   overwrites an existing file).
# - Creates the persistent data dir /home/gjessing/data/<slug>.
# - Checks the Forgejo runner mounts the deploy dir into jobs (CI's deploy step
#   needs it). Prints the lines to add; --apply-runner edits runner-config.yml
#   (backup first) and restarts the runner — that runner is shared by every repo,
#   so do it when no CI job is running.
# - Prints the Caddy site block to add by hand.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
slug="$(node -p "require('$root/package.json').name")"
port="$(sed -nE 's/^PORT=([0-9]+)$/\1/p' "$root/.env.example")"
deploy_dir="$HOME/docker/$slug"
data_dir="$HOME/data/$slug"
runner_config="$HOME/docker/forgejo/runner-config.yml"
apply_runner=false
[[ "${1:-}" == "--apply-runner" ]] && apply_runner=true

echo "== deploy dir: $deploy_dir"
mkdir -p "$deploy_dir"
if [[ -e "$deploy_dir/docker-compose.yml" ]]; then
  echo "   docker-compose.yml exists — left as is"
else
  cp "$root/docker-compose.yml" "$deploy_dir/docker-compose.yml"
  echo "   wrote docker-compose.yml"
fi
if [[ -e "$deploy_dir/.env" ]]; then
  echo "   .env exists — left as is"
else
  grep -v '_DATA_DIR=' "$root/.env.example" > "$deploy_dir/.env"
  chmod 600 "$deploy_dir/.env"
  echo "   wrote .env (from .env.example — fill in real secrets)"
fi

echo "== data dir: $data_dir"
mkdir -p "$data_dir"

echo "== forgejo runner mount"
if grep -qF -- "-v $deploy_dir:$deploy_dir" "$runner_config" 2>/dev/null; then
  echo "   already mounted"
elif $apply_runner; then
  backup="$runner_config.bak-$slug-$(date +%Y%m%d)"
  cp "$runner_config" "$backup"
  sed -i -E "s#^(  options: .*)\$#\1 -v $deploy_dir:$deploy_dir#" "$runner_config"
  sed -i -E "s#^(    - /home/gjessing/docker/forgejo/npm-cache)\$#\1\n    - $deploy_dir#" "$runner_config"
  echo "   edited (backup: $backup); restarting runner"
  (cd "$HOME/docker/forgejo" && docker compose restart runner)
else
  cat <<EOF
   NOT mounted — CI's deploy step will fail until it is. In $runner_config:
     container.options:  append  -v $deploy_dir:$deploy_dir
     container.valid_volumes:    - $deploy_dir
   then: cd ~/docker/forgejo && docker compose restart runner
   (or re-run this script with --apply-runner)
EOF
fi

cat <<EOF
== caddy (add by hand to ~/docker/caddy/Caddyfile, then reload caddy)
   http://$slug.gjessing.io {
       import proxy $port
   }
   Decide on SSO: most apps sit behind tinyauth/pocket-id; apps with non-browser
   clients (extensions, Android push, scripts) must not — see how nodefav/ntfy do it.
EOF
