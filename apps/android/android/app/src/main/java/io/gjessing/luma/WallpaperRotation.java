package io.gjessing.luma;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.WallpaperManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.Calendar;
import java.util.Random;

/** Cached JPEGs and the native alarm survive WebView/process death and network loss. */
final class WallpaperRotation {
    static final Object LOCK = new Object();
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("wallpaper", Context.MODE_PRIVATE); }
    static File directory(Context context) { return new File(context.getFilesDir(), "wallpapers"); }
    static JSONObject config(Context context) throws Exception {
        String raw = prefs(context).getString("config", null);
        return raw == null ? null : new JSONObject(raw);
    }
    static void validate(JSONObject config) throws Exception {
        JSONArray ids = config.getJSONArray("ids");
        if (ids.length() > 200 || (config.getBoolean("enabled") && ids.length() == 0)) throw new Exception("Choose 1–200 wallpapers");
        for (int i = 0; i < ids.length(); i++) if (!ids.getString(i).matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) throw new Exception("Invalid wallpaper ID");
        if (!config.getString("device").matches("s24-ultra|s25")) throw new Exception("Unknown Galaxy profile");
        if (!config.getString("target").matches("home|lock|both")) throw new Exception("Unknown wallpaper destination");
        if (!config.getString("mode").matches("interval|daily")) throw new Exception("Unknown schedule");
        int minutes = config.getInt("intervalMinutes");
        if (minutes < 15 || minutes > 10080) throw new Exception("Minimum interval is 15 minutes");
        JSONArray times = config.getJSONArray("dailyTimes");
        if (times.length() < 1 || times.length() > 24) throw new Exception("Choose 1–24 daily times");
        for (int i = 0; i < times.length(); i++) if (!times.getString(i).matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw new Exception("Use HH:mm daily times");
        validateStyle(config);
        if (config.has("styles")) {
            JSONObject styles = config.getJSONObject("styles");
            java.util.Iterator<String> keys = styles.keys();
            while (keys.hasNext()) {
                String id = keys.next();
                if (!id.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) throw new Exception("Invalid wallpaper ID");
                validateStyle(styles.getJSONObject(id));
            }
        }
        config.getBoolean("shuffle");
    }
    private static void validateStyle(JSONObject style) throws Exception {
        for (String key : new String[]{"focalX", "focalY"}) checkRange(style.getDouble(key));
        JSONObject effects = style.getJSONObject("effects");
        for (String key : new String[]{"dim", "blur", "warmth"}) checkRange(effects.getDouble(key));
        effects.getBoolean("grayscale");
    }
    private static void checkRange(double n) throws Exception { if (Double.isNaN(n) || Double.isInfinite(n) || n < 0 || n > 100) throw new Exception("Invalid crop or effect"); }
    static PendingIntent alarm(Context context) {
        return PendingIntent.getBroadcast(context, 1, new Intent(context, WallpaperAlarmReceiver.class).setAction("io.gjessing.luma.ROTATE"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static long nextTime(JSONObject config, long now) throws Exception {
        if (config.getString("mode").equals("interval")) return now + config.getLong("intervalMinutes") * 60000;
        long next = Long.MAX_VALUE;
        JSONArray times = config.getJSONArray("dailyTimes");
        for (int i = 0; i < times.length(); i++) {
            String[] parts = times.getString(i).split(":");
            Calendar time = Calendar.getInstance();
            time.setTimeInMillis(now);
            time.set(Calendar.HOUR_OF_DAY, Integer.parseInt(parts[0]));
            time.set(Calendar.MINUTE, Integer.parseInt(parts[1]));
            time.set(Calendar.SECOND, 0);
            time.set(Calendar.MILLISECOND, 0);
            if (time.getTimeInMillis() <= now) time.add(Calendar.DAY_OF_YEAR, 1);
            next = Math.min(next, time.getTimeInMillis());
        }
        return next;
    }
    static void schedule(Context context) throws Exception {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        manager.cancel(alarm(context));
        JSONObject config = config(context);
        if (config == null || !config.getBoolean("enabled")) { prefs(context).edit().remove("nextAt").apply(); return; }
        long time = nextTime(config, System.currentTimeMillis());
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, alarm(context));
        prefs(context).edit().putLong("nextAt", time).apply();
    }
    static void applyFile(Context context, File file, String target, String id) throws Exception {
        WallpaperManager manager = WallpaperManager.getInstance(context);
        if (!manager.isWallpaperSupported() || !manager.isSetWallpaperAllowed()) throw new Exception("This device does not allow changing wallpaper");
        Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath());
        if (bitmap == null) throw new Exception("Wallpaper is not downloaded. Save the playlist again.");
        int flags = target.equals("home") ? WallpaperManager.FLAG_SYSTEM : target.equals("lock") ? WallpaperManager.FLAG_LOCK : WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK;
        try { manager.setBitmap(bitmap, null, false, flags); }
        finally { bitmap.recycle(); }
        prefs(context).edit().putLong("lastApplied", System.currentTimeMillis()).putString("lastId", id).remove("error").apply();
    }
    static void advance(Context context) throws Exception {
        JSONObject config = config(context);
        if (config == null || config.getJSONArray("ids").length() == 0) throw new Exception("Save a playlist first");
        JSONArray ids = config.getJSONArray("ids");
        int index = (prefs(context).getInt("index", -1) + 1) % ids.length();
        if (config.getBoolean("shuffle") && ids.length() > 1) {
            int previous = prefs(context).getInt("index", -1);
            index = new Random().nextInt(ids.length() - 1);
            if (index >= previous && previous >= 0) index++;
        }
        String id = ids.getString(index);
        String generation = prefs(context).getString("generation", "");
        applyFile(context, new File(new File(directory(context), generation), id + ".jpg"), config.getString("target"), id);
        prefs(context).edit().putInt("index", index).apply();
    }
    static JSONObject state(Context context) throws Exception {
        SharedPreferences prefs = prefs(context);
        JSONObject state = new JSONObject();
        JSONObject config = config(context);
        if (config != null) state.put("config", config);
        state.put("model", android.os.Build.MODEL);
        state.put("supportsStyles", true);
        for (String key : new String[]{"nextAt", "lastApplied"}) if (prefs.contains(key)) state.put(key, prefs.getLong(key, 0));
        for (String key : new String[]{"error", "lastId"}) if (prefs.contains(key)) state.put(key, prefs.getString(key, ""));
        return state;
    }
}
