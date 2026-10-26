# Luma Android verification

Use a debug build against a disposable local backend, not the live library:

```sh
source ~/android-sdk/env.sh
cd apps/android/android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest -PserverUrl=http://10.0.2.2:3097
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w io.gjessing.luma.test/androidx.test.runner.AndroidJUnitRunner
```

The instrumentation checks daily/interval timing, native JPEG application, local
playlist advancement, pause, and the actual alarm receiver without network access.
It restores this app's previous preferences and uses its own temporary cached files.
It changes the emulator wallpaper; run only on a test emulator.

For WebView checks, run the disposable backend at 3097 with the built web root,
launch `io.gjessing.luma/.MainActivity`, forward the app's `webview_devtools_remote_<pid>`
socket with adb, then use playwright-core `chromium.connectOverCDP`. Drive the actual
Capacitor plugin from the page, inspect `getState()`, Gallery export and downloaded
image files with `run-as`. Do not change system time or disable networking on a shared
emulator. Failed-download rollback can be tested using a nonexistent image ID.

Existing host emulator: check `adb devices` before starting another. Do not stop an
emulator started by another project. Keep Gradle and Docker builds separate from
interactive UI verification on a busy host.

Trap: debug HTTP must be accepted for the configured same origin in ShellNavigation;
only authentication redirects need the HTTPS-only restriction.

Trap: target `:app:assembleDebugAndroidTest`, not the root task. The root task also builds Capacitor’s own upstream test APK, whose legacy Kotlin dependencies conflict.

Trap: attach with `noDefaults: true` when using Playwright CDP against an Android WebView. Android does not implement Browser.setDownloadBehavior. Applying wallpaper may recreate the Activity through a system color overlay update; reconnect to the replacement page and check native state, rather than treating the old page closing as an app crash.

2026-10-26 follow-up: `webview.mjs` defaults to `http://10.0.2.2:3097`
(`LUMA_ANDROID_TEST_ORIGIN` overrides it). Port 3048 is the production API; never
point a mutating harness there. Seed the disposable backend with the abstract
starter set before running. The harness presses Android Back through adb, checks
both tab and modal navigation, compares native cached JPEG SHA-256s against each
image’s own render, and applies to Home, Lock and Both. Instrumentation verifies
that home-only/lock-only writes preserve the other WallpaperManager ID.

Trap: WebView CDP has no Storage.getCookies; `page.request` fails even against an
unprotected local test server. Fetch expected test images directly from Node at
127.0.0.1 instead. Activity recoloring may replace the WebView more than once;
reconnect until a replacement page remains alive rather than using one fixed wait.
Start the Activity only after instrumentation finishes: its runner kills the app
process on completion, invalidating a devtools socket forwarded during the run.

Live wallpaper verification: after the ordinary WebView harness, run
`node apps/android/e2e/live-wallpaper.mjs` against the same disposable server and
forwarded CDP socket. It opens the actual system preview and uses adb to confirm
Set wallpaper/Home, checks the active component, changes all native scenes/weather
presets, verifies animation/still frames and home rotation pause, and returns to a
static wallpaper at the end. Run only on the emulator: this changes its wallpaper.
Native instrumentation also checks the protected service registration, WMO weather
mapping and distinct procedural frames without a network.

Trap (2026-10-26): Canvas Paint keeps alpha from the last particle. Reset its color
to opaque before drawing a gradient background or successive frames leave trails;
the cached-weather/preset pixel equivalence test catches this.

Trap (2026-10-26): the AOSP live picker uses `LiveWallpaperPreview`, not
`WallpaperPreviewActivity`; always handle the destination dialog after Set wallpaper.
`dumpsys wallpaper` prints the component with its full class name. Engine visibility
is in `dumpsys activity service io.gjessing.luma/.LumaWallpaperService`.

The direct CHANGE_LIVE_WALLPAPER entry can report `LiveWallpaperChange` as
`topResumedActivity`, rather than `LiveWallpaperPreview`/`mResumedActivity`.
Check the livepicker package and action as well as the displayed preview; a single
hard-coded Activity class name can fail while the actual picker works.
