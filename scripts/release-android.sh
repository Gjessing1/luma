#!/usr/bin/env bash
# The one command that ships an Android release (docs: ANDROID.md release rules): build the signed
# APK declared in build.gradle, publish it where the live backend serves it, then download it back
# through the live API and check its SHA-256.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
gradle_file="$root/apps/android/android/app/build.gradle"
# LUMA_DATA_DIR of the live stack, bind-mounted at /data (A6).
app_dir="${LUMA_ANDROID_APP_DIR:-/home/gjessing/data/luma/app}"
verify_url="${LUMA_ANDROID_VERIFY_URL:-http://127.0.0.1:3048/api/app/version}"

version_code="$(sed -nE 's/^[[:space:]]*versionCode[[:space:]]+([0-9]+)[[:space:]]*$/\1/p' "$gradle_file")"
version_name="$(sed -nE 's/^[[:space:]]*versionName[[:space:]]+"([^"]+)"[[:space:]]*$/\1/p' "$gradle_file")"
if [[ ! "$version_code" =~ ^[1-9][0-9]*$ || ! "$version_name" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]]; then
  echo "Could not read one versionCode and versionName from $gradle_file" >&2
  exit 1
fi
if [[ -f /home/gjessing/android-sdk/env.sh && -z "${ANDROID_HOME:-}" ]]; then
  # Host-local convenience; other machines export ANDROID_HOME themselves.
  . /home/gjessing/android-sdk/env.sh
fi
if [[ ! -d "$(dirname "$app_dir")" ]]; then
  echo "The live data dir $(dirname "$app_dir") is missing; set LUMA_ANDROID_APP_DIR" >&2
  exit 1
fi

apk="$("$root/apps/android/build-apk.sh" | tail -1)"

aapt="$(find "$ANDROID_HOME/build-tools" -mindepth 2 -maxdepth 2 -type f -name aapt | sort -V | tail -1)"
apksigner="$(find "$ANDROID_HOME/build-tools" -mindepth 2 -maxdepth 2 -type f -name apksigner | sort -V | tail -1)"
if [[ -z "$aapt" || -z "$apksigner" ]]; then
  echo "Android build tools (aapt and apksigner) are required to publish an APK" >&2
  exit 1
fi
badging="$("$aapt" dump badging "$apk")"
if [[ "$badging" == *"application-debuggable"* ]]; then
  echo "Refusing to publish a debuggable APK: $apk" >&2
  exit 1
fi
if [[ "$badging" != *"versionCode='$version_code'"* || "$badging" != *"versionName='$version_name'"* ]]; then
  echo "APK version does not match $version_name ($version_code)" >&2
  exit 1
fi
if ! "$apksigner" verify "$apk"; then
  echo "Refusing to publish an unsigned or invalid APK: $apk" >&2
  exit 1
fi

file="luma-$version_name.apk"
mkdir -p "$app_dir"
install -m 0644 "$apk" "$app_dir/$file"
sha256="$(sha256sum "$app_dir/$file" | cut -d ' ' -f 1)"
# Written last and renamed into place, so the API never names an APK that is still copying.
metadata_tmp="$app_dir/.version.json.$$"
printf '{"versionCode":%s,"versionName":"%s","file":"%s","sha256":"%s"}\n' \
  "$version_code" "$version_name" "$file" "$sha256" > "$metadata_tmp"
chmod 0644 "$metadata_tmp"
mv "$metadata_tmp" "$app_dir/version.json"
echo "Published $file (versionCode $version_code) to $app_dir"

response="$(curl --fail --silent --show-error --header 'Cache-Control: no-cache' "$verify_url")"
read -r published_sha apk_url < <(
  node -e '
    const release = JSON.parse(process.argv[1]);
    if (release.versionCode !== Number(process.argv[2]) || release.versionName !== process.argv[3]) {
      console.error(`Live API reports ${release.versionName} (${release.versionCode}), expected ${process.argv[3]} (${process.argv[2]})`);
      process.exit(1);
    }
    process.stdout.write(`${release.sha256} ${release.apkUrl}\n`);
  ' "$response" "$version_code" "$version_name"
)
download_url="$(node -e 'process.stdout.write(new URL(process.argv[1], process.argv[2]).href)' "$apk_url" "$verify_url")"
downloaded="$(mktemp --suffix=.apk)"
trap 'rm -f "$downloaded"' EXIT
curl --fail --silent --show-error --output "$downloaded" "$download_url"
downloaded_sha="$(sha256sum "$downloaded" | cut -d ' ' -f 1)"
if [[ "$downloaded_sha" != "$published_sha" || "$published_sha" != "$sha256" ]]; then
  echo "The APK the live API serves does not match the one just published" >&2
  exit 1
fi
echo "Verified live Android $version_name ($version_code) at $download_url"
