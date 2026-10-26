#!/usr/bin/env bash
# Build a release-signed APK suitable for publication and in-place updates.
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
signing_env="${LUMA_KEYSTORE_ENV:-${XDG_CONFIG_HOME:-$HOME/.config}/luma/keystore.env}"

if [[ -f /home/gjessing/android-sdk/env.sh && -z "${ANDROID_HOME:-}" ]]; then
  # Host-local convenience; other machines export ANDROID_HOME/JAVA_HOME themselves.
  . /home/gjessing/android-sdk/env.sh
fi
if [[ -f "$signing_env" ]]; then
  # shellcheck source=/dev/null
  . "$signing_env"
fi
for name in LUMA_KEYSTORE_FILE LUMA_KEYSTORE_PASSWORD LUMA_KEY_ALIAS LUMA_KEY_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing $name in $signing_env. docs/ANDROID.md (first release) shows how to create it." >&2
    exit 1
  fi
  export "$name"
done

cd "$root"
npm ci --no-audit --no-fund --prefer-offline >/dev/null
npx cap sync android
(cd android && ./gradlew clean assembleRelease)

apk="$root/android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$apk" ]]; then
  echo "Release APK was not produced at $apk" >&2
  exit 1
fi
echo "$apk"
