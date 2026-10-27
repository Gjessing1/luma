package io.gjessing.luma;

import android.app.WallpaperColors;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Matrix;
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
        private final LiveVideoPlayer video = new LiveVideoPlayer(LumaWallpaperService.this);
        private final Runnable frame = this::draw;
        private final Runnable weatherPoll = this::pollWeather;
        private JSONObject config;
        private JSONObject weather;
        private boolean visible, surface, destroyed;
        // Canvas leaves the surface connected as a CPU producer for its lifetime, after which
        // MediaPlayer cannot attach. Only a new engine (Android's preview/Set wallpaper) can.
        private boolean canvasUsed;
        private String stillId;
        private Bitmap still;
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
            if (!"config".equals(key) && !"weather".equals(key)) return;
            if ("config".equals(key)) { video.release(); video.retry(); stillId = null; }
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
            if (!value) video.release();
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
            video.release();
            handler.removeCallbacks(frame);
            if (visible) handler.post(frame);
        }

        @Override public void onOffsetsChanged(float x, float y, float xStep, float yStep, int xPixels, int yPixels) {
            offset = x - .5f;
            if (visible && surface) { handler.removeCallbacks(frame); handler.post(frame); }
        }

        private void draw() {
            if (!visible || !surface || destroyed || config == null) return;
            PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
            boolean videoScene = "video".equals(config.optString("scene"));
            if (videoScene && !canvasUsed) {
                if (video.show(config.optString("videoId"), getSurfaceHolder(), config.optBoolean("motion", true) && !power.isPowerSaveMode())) {
                    // Poll power state without drawing Canvas over the decoder's surface.
                    handler.postDelayed(frame, 1000);
                    return;
                }
            } else if (videoScene) {
                needsNewEngine(config.optString("videoId"));
            } else video.release();
            Canvas canvas = null;
            try {
                canvas = getSurfaceHolder().lockCanvas();
                if (canvas != null) canvasUsed = true;
                if (canvas != null && videoScene) drawStill(canvas, config.optString("videoId"));
                else if (canvas != null) renderer.draw(canvas, config, weather,
                    config.optBoolean("motion", true) ? (SystemClock.elapsedRealtime() - started) / 1000f : 0, offset);
            } catch (IllegalArgumentException | IllegalStateException ignored) {
                // Android can remove a surface between the visibility callback and a draw.
            } finally {
                if (canvas != null) {
                    try { getSurfaceHolder().unlockCanvasAndPost(canvas); }
                    catch (IllegalArgumentException | IllegalStateException ignored) { /* Surface was removed. */ }
                }
            }
            if (config.optBoolean("motion", true) && !videoScene) {
                handler.postDelayed(frame, power.isPowerSaveMode() ? 100 : 33);
            }
        }

        private void needsNewEngine(String videoId) {
            if (videoId.equals(stillId)) return;
            LiveWallpaperSettings.prefs(LumaWallpaperService.this).edit()
                .putString("videoError", "Showing a still frame. Tap Save & open Android preview, then Set wallpaper, to start the video.").apply();
        }

        /** The video's first frame, cropped like the player, so a fallback still matches it. */
        private void drawStill(Canvas canvas, String videoId) {
            canvas.drawColor(Color.BLACK);
            if (!videoId.equals(stillId)) {
                stillId = videoId;
                still = LiveVideoFiles.firstFrame(LumaWallpaperService.this, videoId);
            }
            if (still == null) return;
            float scale = Math.max(canvas.getWidth() / (float) still.getWidth(), canvas.getHeight() / (float) still.getHeight());
            Matrix matrix = new Matrix();
            matrix.setScale(scale, scale);
            matrix.postTranslate((canvas.getWidth() - still.getWidth() * scale) / 2, (canvas.getHeight() - still.getHeight() * scale) / 2);
            canvas.drawBitmap(still, matrix, null);
        }

        @Override public void onSurfaceDestroyed(SurfaceHolder holder) {
            surface = false;
            video.release();
            handler.removeCallbacks(frame);
            super.onSurfaceDestroyed(holder);
        }

        @Override public void onDestroy() {
            destroyed = true;
            visible = false;
            handler.removeCallbacksAndMessages(null);
            video.release();
            LiveWallpaperSettings.prefs(LumaWallpaperService.this).unregisterOnSharedPreferenceChangeListener(this);
            worker.shutdownNow();
            super.onDestroy();
        }
    }
}
