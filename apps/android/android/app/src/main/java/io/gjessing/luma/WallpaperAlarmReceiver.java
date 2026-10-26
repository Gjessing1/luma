package io.gjessing.luma;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class WallpaperAlarmReceiver extends BroadcastReceiver {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    @Override public void onReceive(Context context, Intent intent) {
        PendingResult pending = goAsync();
        EXECUTOR.execute(() -> {
            synchronized (WallpaperRotation.LOCK) {
                try {
                    // Schedule first: a corrupt image must not silently stop all future rotations.
                    org.json.JSONObject config = WallpaperRotation.config(context);
                    WallpaperRotation.schedule(context);
                    if ("io.gjessing.luma.ROTATE".equals(intent.getAction()) && config != null && config.optBoolean("enabled")) WallpaperRotation.advance(context);
                } catch (Exception error) {
                    WallpaperRotation.prefs(context).edit().putString("error", error.getMessage()).apply();
                    Log.e("Luma", "Wallpaper rotation failed", error);
                } finally { pending.finish(); }
            }
        });
    }
}
