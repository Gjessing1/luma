# Luma Android verification

Use a debug build against a disposable local backend, not the live library:

```sh
source ~/android-sdk/env.sh
cd apps/android/android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest -PserverUrl=http://10.0.2.2:3048
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w io.gjessing.luma.test/androidx.test.runner.AndroidJUnitRunner
```

The instrumentation checks daily/interval timing, native JPEG application, local
playlist advancement, pause, and the actual alarm receiver without network access.
It restores this app's previous preferences and uses its own temporary cached files.
It changes the emulator wallpaper; run only on a test emulator.

For WebView checks, run the disposable backend at 3048 with the built web root,
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
