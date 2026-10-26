package io.gjessing.luma;

import android.app.WallpaperColors;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Canvas;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LumaWallpaperService extends WallpaperService {
    @Override public Engine onCreateEngine() { return new SceneEngine(); }

    private final class SceneEngine extends Engine implements SharedPreferences.OnSharedPreferenceChangeListener {
        private final Handler handler = new Handler(Looper.getMainLooper());
        private final ExecutorService worker = Executors.newSingleThreadExecutor();
        private final LiveSceneRenderer renderer = new LiveSceneRenderer();
        private final Runnable frame = this::draw;
        private final Runnable weatherPoll = this::pollWeather;
        private JSONObject config;
        private JSONObject weather;
        private boolean visible, surface, destroyed;
        private float offset;
        private final long started = SystemClock.elapsedRealtime();

        @Override public void onCreate(SurfaceHolder holder) {
            super.onCreate(holder);
            setTouchEventsEnabled(false);
            setOffsetNotificationsEnabled(true);
            LiveWallpaperSettings.prefs(LumaWallpaperService.this).registerOnSharedPreferenceChangeListener(this);
            reload();
        }

        @Override public WallpaperColors onComputeColors() {
            // All scenes have dark upper skies; keep launcher/status icons readable.
            return new WallpaperColors(Color.valueOf(0xff08111f), Color.valueOf(0xff4d6980), null);
        }

        private void reload() {
            try {
                config = LiveWallpaperSettings.config(LumaWallpaperService.this);
                String raw = LiveWallpaperSettings.prefs(LumaWallpaperService.this).getString("weather", null);
                weather = raw == null ? null : new JSONObject(raw);
            } catch (Exception ignored) { /* Keep the previous valid scene. */ }
        }

        @Override public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
            if (destroyed) return;
            reload();
            if (android.os.Build.VERSION.SDK_INT >= 27 && ("config".equals(key) || "weather".equals(key))) notifyColorsChanged();
            if (visible && surface) {
                handler.removeCallbacks(frame);
                handler.post(frame);
                if ("config".equals(key)) { handler.removeCallbacks(weatherPoll); handler.post(weatherPoll); }
            }
        }

        @Override public void onVisibilityChanged(boolean value) {
            visible = value;
            handler.removeCallbacks(frame);
            handler.removeCallbacks(weatherPoll);
            if (value && !destroyed) {
                if (!isPreview()) worker.execute(() -> {
                    try { LiveWallpaperSettings.pauseHomeRotation(LumaWallpaperService.this); }
                    catch (Exception ignored) { /* The alarm also checks for a live wallpaper. */ }
                });
                if (surface) handler.post(frame);
                handler.post(weatherPoll);
            }
        }

        private void pollWeather() {
            if (!visible || destroyed) return;
            worker.execute(() -> LiveWeather.refresh(getApplicationContext()));
            handler.postDelayed(weatherPoll, 60000);
        }

        @Override public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            surface = true;
            handler.removeCallbacks(frame);
            if (visible) handler.post(frame);
        }

        @Override public void onOffsetsChanged(float x, float y, float xStep, float yStep, int xPixels, int yPixels) {
            offset = x - .5f;
            if (visible && surface) { handler.removeCallbacks(frame); handler.post(frame); }
        }

        private void draw() {
            if (!visible || !surface || destroyed || config == null) return;
            Canvas canvas = null;
            try {
                canvas = getSurfaceHolder().lockCanvas();
                if (canvas != null) renderer.draw(canvas, config, weather,
                    config.optBoolean("motion", true) ? (SystemClock.elapsedRealtime() - started) / 1000f : 0, offset);
            } catch (IllegalArgumentException | IllegalStateException ignored) {
                // Android can remove a surface between the visibility callback and a draw.
            } finally {
                if (canvas != null) {
                    try { getSurfaceHolder().unlockCanvasAndPost(canvas); }
                    catch (IllegalArgumentException | IllegalStateException ignored) { /* Surface was removed. */ }
                }
            }
            if (config.optBoolean("motion", true)) {
                PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
                handler.postDelayed(frame, power.isPowerSaveMode() ? 100 : 33);
            }
        }

        @Override public void onSurfaceDestroyed(SurfaceHolder holder) {
            surface = false;
            handler.removeCallbacks(frame);
            super.onSurfaceDestroyed(holder);
        }

        @Override public void onDestroy() {
            destroyed = true;
            visible = false;
            handler.removeCallbacksAndMessages(null);
            LiveWallpaperSettings.prefs(LumaWallpaperService.this).unregisterOnSharedPreferenceChangeListener(this);
            worker.shutdownNow();
            super.onDestroy();
        }
    }
}
