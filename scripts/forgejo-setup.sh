#!/usr/bin/env bash
# Create this project's Forgejo repo and wire it for CI.
#
#   scripts/forgejo-setup.sh [--push] [--github]
#
# Token: a Forgejo PAT for gjessing1, from $FORGEJO_TOKEN or ~/.config/forgejo/token
# (one line, chmod 600). Scopes: write:repository (create repo, set secrets) and
# write:package (the same token becomes the REGISTRY_TOKEN secret CI pushes images
# with — the automatic GITHUB_TOKEN only gets package read on this instance).
# Use a separate package token by exporting REGISTRY_TOKEN.
#
# Steps (each skipped if already done):
#   1. create git.gjessing.io/gjessing1/<slug> (private, default branch main)
#   2. set the REGISTRY_TOKEN Actions secret
#   3. add `origin` → Forgejo   (--github: also create Gjessing1/<slug> via gh and
#      add `github` + a combined `both` remote that pushes to both forges)
#   4. --push: push main — this triggers CI build + deploy, so run
#      scripts/host-setup.sh first.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
slug="$(node -p "require('./package.json').name")"
api="https://git.gjessing.io/api/v1"
owner="gjessing1"
forgejo_url="https://git.gjessing.io/$owner/$slug.git"
push=false
github=false
for arg in "$@"; do
  case "$arg" in
    --push) push=true ;;
    --github) github=true ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 1 ;;
  esac
done

token="${FORGEJO_TOKEN:-}"
if [[ -z "$token" && -r "$HOME/.config/forgejo/token" ]]; then
  token="$(tr -d '[:space:]' < "$HOME/.config/forgejo/token")"
fi
if [[ -z "$token" ]]; then
  cat >&2 <<EOF
No Forgejo token. Create one at https://git.gjessing.io/user/settings/applications
(scopes: write:repository, write:package), then either
  export FORGEJO_TOKEN=...          or
  install -m 600 /dev/stdin ~/.config/forgejo/token <<< '...'
EOF
  exit 1
fi
registry_token="${REGISTRY_TOKEN:-$token}"

# Prints the HTTP status; body goes to $body_file.
body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT
call() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-s -o "$body_file" -w '%{http_code}' -X "$method"
    -H "Authorization: token $token" -H 'Content-Type: application/json')
  [[ -n "$data" ]] && args+=(-d "$data")
  curl "${args[@]}" "$api$path"
}

echo "== repo $owner/$slug"
status="$(call GET "/repos/$owner/$slug")"
if [[ "$status" == 200 ]]; then
  echo "   exists"
else
  status="$(call POST /user/repos "{\"name\":\"$slug\",\"private\":true,\"default_branch\":\"main\"}")"
  if [[ "$status" != 201 ]]; then
    echo "   create failed: HTTP $status $(cat "$body_file")" >&2
    exit 1
  fi
  echo "   created"
fi

echo "== Actions secret REGISTRY_TOKEN"
payload="$(node -e 'process.stdout.write(JSON.stringify({data: process.argv[1]}))' "$registry_token")"
status="$(call PUT "/repos/$owner/$slug/actions/secrets/REGISTRY_TOKEN" "$payload")"
if [[ "$status" != 201 && "$status" != 204 ]]; then
  echo "   failed: HTTP $status $(cat "$body_file")" >&2
  exit 1
fi
echo "   set"

echo "== git remotes"
git config user.name >/dev/null || git config user.name 'Gjessing1'
git config user.email >/dev/null || git config user.email 'larsgjessing@gmail.com'
if git remote get-url origin >/dev/null 2>&1; then
  echo "   origin exists: $(git remote get-url origin)"
else
  git remote add origin "$forgejo_url"
  echo "   origin → $forgejo_url"
fi

if $github; then
  github_url="https://github.com/Gjessing1/$slug.git"
  if ! gh repo view "Gjessing1/$slug" >/dev/null 2>&1; then
    gh repo create "Gjessing1/$slug" --private
  fi
  git remote get-url github >/dev/null 2>&1 || git remote add github "$github_url"
  if ! git remote get-url both >/dev/null 2>&1; then
    git remote add both "$forgejo_url"
    git remote set-url --add --push both "$forgejo_url"
    git remote set-url --add --push both "$github_url"
  fi
  echo "   github → $github_url; both → Forgejo + GitHub (use: git push both main)"
fi

if $push; then
  echo "== push main (triggers CI build + deploy)"
  if $github; then
    git push -u both main
  else
    git push -u origin main
  fi
  echo "   watch: https://git.gjessing.io/$owner/$slug/actions"
fi
