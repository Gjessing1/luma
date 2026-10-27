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
                String slot = intent.getStringExtra("slot");
                try {
                    if (WallpaperRotation.ROTATE.equals(intent.getAction())) {
                        // Alarms set by 0.1.3 carry no slot; its single rotation became the home slot's.
                        slot = slot == null ? "home" : WallpaperRotation.checkedSlot(slot);
                        // Schedule first: a corrupt image must not silently stop all future rotations.
                        org.json.JSONObject config = WallpaperRotation.config(context, slot);
                        WallpaperRotation.schedule(context, slot);
                        if (config != null && config.optBoolean("enabled")) WallpaperRotation.advance(context, slot);
                    } else WallpaperRotation.scheduleAll(context);
                } catch (Exception error) {
                    WallpaperRotation.prefs(context).edit().putString(WallpaperRotation.key("error", slot == null ? "home" : slot), error.getMessage()).apply();
                    Log.e("Luma", "Wallpaper rotation failed", error);
                } finally { pending.finish(); }
            }
        });
    }
}
