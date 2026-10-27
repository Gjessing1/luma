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
    static final String ROTATE = "io.gjessing.luma.ROTATE";
    // One playlist per screen. A Home & lock playlist lives in the home slot and keeps the lock
    // slot empty, so the two alarms never write the same screen.
    static final String[] SLOTS = {"home", "lock"};
    private static final String[] SLOT_KEYS = {"config", "generation", "index", "nextAt", "lastApplied", "lastId", "error"};
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("wallpaper", Context.MODE_PRIVATE); }
    static File directory(Context context) { return new File(context.getFilesDir(), "wallpapers"); }
    static String key(String name, String slot) { return name + "." + slot; }
    static String slotOf(String target) { return target.equals("lock") ? "lock" : "home"; }
    static String checkedSlot(String slot) throws Exception {
        if (!"home".equals(slot) && !"lock".equals(slot)) throw new Exception("Unknown screen");
        return slot;
    }
    /** 0.1.3 and older kept a single rotation; move it into the slot for its screen. */
    static void migrate(Context context) throws Exception {
        SharedPreferences prefs = prefs(context);
        String raw = prefs.getString("config", null);
        if (raw == null) return;
        String slot = slotOf(new JSONObject(raw).getString("target"));
        prefs.edit().putString(key("config", slot), raw)
            .putString(key("generation", slot), prefs.getString("generation", ""))
            .putInt(key("index", slot), prefs.getInt("index", -1))
            .remove("config").remove("generation").remove("index").remove("nextAt").remove("error").commit();
        schedule(context, slot);
    }
    static JSONObject config(Context context, String slot) throws Exception {
        migrate(context);
        String raw = prefs(context).getString(key("config", slot), null);
        return raw == null ? null : new JSONObject(raw);
    }
    static void validate(JSONObject config) throws Exception {
        if (config.has("playlistId") && !config.getString("playlistId").matches("[a-z0-9-]{1,64}")) throw new Exception("Invalid playlist");
        if (config.has("name") && (config.getString("name").trim().isEmpty() || config.getString("name").length() > 60)) throw new Exception("Name the playlist (up to 60 characters)");
        JSONArray ids = config.getJSONArray("ids");
        if (ids.length() > 200 || (config.getBoolean("enabled") && ids.length() == 0)) throw new Exception("Choose 1–200 wallpapers");
        for (int i = 0; i < ids.length(); i++) if (!ids.getString(i).matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) throw new Exception("Invalid wallpaper ID");
        if (!config.getString("device").matches("s24-ultra|s25")) throw new Exception("Unknown Galaxy profile");
        if (!config.getString("target").matches("home|lock|both")) throw new Exception("Unknown wallpaper destination");
        if (!config.getString("mode").matches("interval|daily|timed")) throw new Exception("Unknown schedule");
        int minutes = config.getInt("intervalMinutes");
        if (minutes < 15 || minutes > 10080) throw new Exception("Minimum interval is 15 minutes");
        JSONArray times = config.getJSONArray("dailyTimes");
        if (times.length() < 1 || times.length() > 24) throw new Exception("Choose 1–24 daily times");
        for (int i = 0; i < times.length(); i++) if (!times.getString(i).matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw new Exception("Use HH:mm daily times");
        if (config.getString("mode").equals("timed")) validateStartTimes(config);
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
    /** Time of day: ids[i] shows from startTimes[i], so the lists align and run in clock order. */
    private static void validateStartTimes(JSONObject config) throws Exception {
        JSONArray ids = config.getJSONArray("ids"), starts = config.getJSONArray("startTimes");
        if (starts.length() != ids.length() || starts.length() > 24) throw new Exception("Give each of up to 24 wallpapers a start time");
        String previous = "";
        for (int i = 0; i < starts.length(); i++) {
            String time = starts.getString(i);
            if (!time.matches("([01][0-9]|2[0-3]):[0-5][0-9]") || time.compareTo(previous) <= 0) throw new Exception("Use different HH:mm start times in clock order");
            previous = time;
        }
    }
    private static void validateStyle(JSONObject style) throws Exception {
        for (String key : new String[]{"focalX", "focalY"}) checkRange(style.getDouble(key));
        // Styles saved before zoom existed have no key and render unzoomed. getDouble rejects
        // non-numbers, which optDouble would silently replace with its fallback.
        double zoom = style.has("zoom") ? style.getDouble("zoom") : 100;
        if (Double.isNaN(zoom) || zoom < 100 || zoom > 300) throw new Exception("Invalid zoom");
        JSONObject effects = style.getJSONObject("effects");
        for (String key : new String[]{"dim", "blur", "warmth"}) checkRange(effects.getDouble(key));
        effects.getBoolean("grayscale");
    }
    private static void checkRange(double n) throws Exception { if (Double.isNaN(n) || Double.isInfinite(n) || n < 0 || n > 100) throw new Exception("Invalid crop or effect"); }
    static PendingIntent alarm(Context context, String slot) {
        Intent intent = new Intent(context, WallpaperAlarmReceiver.class).setAction(ROTATE).putExtra("slot", slot);
        // Request code 1 is also the alarm 0.1.3 set, so scheduling the home slot replaces it.
        return PendingIntent.getBroadcast(context, slot.equals("lock") ? 2 : 1, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static long nextTime(JSONObject config, long now) throws Exception {
        if (config.getString("mode").equals("interval")) return now + config.getLong("intervalMinutes") * 60000;
        long next = Long.MAX_VALUE;
        JSONArray times = config.getJSONArray(config.getString("mode").equals("timed") ? "startTimes" : "dailyTimes");
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
    static boolean timed(JSONObject config) throws Exception { return config.getString("mode").equals("timed"); }
    /** The image whose start time came last; before the first start, the last one from yesterday. */
    static int timedIndex(JSONObject config, long now) throws Exception {
        JSONArray starts = config.getJSONArray("startTimes");
        Calendar time = Calendar.getInstance();
        time.setTimeInMillis(now);
        int minutes = time.get(Calendar.HOUR_OF_DAY) * 60 + time.get(Calendar.MINUTE);
        int index = starts.length() - 1;
        for (int i = 0; i < starts.length(); i++) {
            String[] parts = starts.getString(i).split(":");
            if (Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]) <= minutes) index = i;
        }
        return index;
    }
    /** Where a newly started playlist begins: the image for the current time, or the first. */
    static int firstIndex(JSONObject config, long now) throws Exception { return timed(config) ? timedIndex(config, now) : 0; }
    /** After boot or a clock change a missed start would leave the wrong image until the next one. */
    static void catchUp(Context context) throws Exception {
        for (String slot : SLOTS) {
            JSONObject config = config(context, slot);
            if (config == null || !config.getBoolean("enabled") || !timed(config)) continue;
            if (prefs(context).getInt(key("index", slot), -1) != timedIndex(config, System.currentTimeMillis())) advance(context, slot);
        }
    }
    static void schedule(Context context, String slot) throws Exception {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        manager.cancel(alarm(context, slot));
        JSONObject config = config(context, slot);
        if (config == null || !config.getBoolean("enabled")) { prefs(context).edit().remove(key("nextAt", slot)).apply(); return; }
        long time = nextTime(config, System.currentTimeMillis());
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, time, alarm(context, slot));
        prefs(context).edit().putLong(key("nextAt", slot), time).apply();
    }
    static void scheduleAll(Context context) throws Exception { for (String slot : SLOTS) schedule(context, slot); }
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
    static void advance(Context context, String slot) throws Exception {
        if (slot.equals("home") && LiveWallpaperSettings.pauseHomeRotation(context)) return;
        JSONObject config = config(context, slot);
        if (config == null || config.getJSONArray("ids").length() == 0) throw new Exception("Save a playlist first");
        JSONArray ids = config.getJSONArray("ids");
        int previous = prefs(context).getInt(key("index", slot), -1);
        int index = (previous + 1) % ids.length();
        // A late alarm still shows the image for the current time instead of drifting by one.
        if (timed(config)) index = timedIndex(config, System.currentTimeMillis());
        else if (config.getBoolean("shuffle") && ids.length() > 1) {
            index = new Random().nextInt(ids.length() - 1);
            if (index >= previous && previous >= 0) index++;
        }
        String id = ids.getString(index);
        String generation = prefs(context).getString(key("generation", slot), "");
        applyFile(context, new File(new File(directory(context), generation), id + ".jpg"), config.getString("target"), id);
        prefs(context).edit().putInt(key("index", slot), index).putLong(key("lastApplied", slot), System.currentTimeMillis())
            .putString(key("lastId", slot), id).remove(key("error", slot)).apply();
    }
    /** Records a started playlist, already applied with its first image, and stops what it replaces. */
    static void install(Context context, JSONObject config, String generation, int index) throws Exception {
        String firstId = config.getJSONArray("ids").getString(index);
        String target = config.getString("target"), slot = slotOf(target);
        SharedPreferences.Editor editor = prefs(context).edit();
        if (target.equals("both")) clear(editor, "lock");
        JSONObject home = config(context, "home");
        if (target.equals("lock") && home != null && home.getString("target").equals("both")) clear(editor, "home");
        clear(editor, slot);
        editor.putString(key("config", slot), config.toString()).putString(key("generation", slot), generation).putInt(key("index", slot), index)
            .putLong(key("lastApplied", slot), System.currentTimeMillis()).putString(key("lastId", slot), firstId);
        if (!editor.commit()) throw new Exception("Could not save the playlist");
        scheduleAll(context);
    }
    private static void clear(SharedPreferences.Editor editor, String slot) { for (String name : SLOT_KEYS) editor.remove(key(name, slot)); }
    static void pause(Context context, String slot) throws Exception {
        JSONObject config = config(context, slot);
        if (config == null || !config.getBoolean("enabled")) return;
        config.put("enabled", false);
        prefs(context).edit().putString(key("config", slot), config.toString()).commit();
        schedule(context, slot);
    }
    /** Forgets a screen's playlist; the wallpaper it showed stays until something else is applied. */
    static void stop(Context context, String slot) throws Exception {
        SharedPreferences.Editor editor = prefs(context).edit();
        clear(editor, slot);
        editor.commit();
        schedule(context, slot);
    }
    /** Cache folders that a saved slot still plays from. */
    static java.util.Set<String> generations(Context context) throws Exception {
        java.util.Set<String> names = new java.util.HashSet<>();
        for (String slot : SLOTS) if (config(context, slot) != null) names.add(prefs(context).getString(key("generation", slot), ""));
        return names;
    }
    static JSONObject state(Context context) throws Exception {
        SharedPreferences prefs = prefs(context);
        JSONObject state = new JSONObject();
        JSONObject rotations = new JSONObject();
        for (String slot : SLOTS) {
            JSONObject config = config(context, slot);
            if (config == null) continue;
            JSONObject rotation = new JSONObject().put("config", config);
            for (String name : new String[]{"nextAt", "lastApplied"}) if (prefs.contains(key(name, slot))) rotation.put(name, prefs.getLong(key(name, slot), 0));
            for (String name : new String[]{"lastId", "error"}) if (prefs.contains(key(name, slot))) rotation.put(name, prefs.getString(key(name, slot), ""));
            rotations.put(slot, rotation);
        }
        state.put("rotations", rotations);
        state.put("model", android.os.Build.MODEL);
        state.put("supportsStyles", true);
        state.put("supportsLiveWallpaper", true);
        state.put("supportsLiveVideo", true);
        state.put("supportsZoom", true);
        state.put("supportsPlaylists", true);
        state.put("supportsTimedSchedule", true);
        state.put("live", LiveWallpaperSettings.state(context));
        if (prefs.contains("lastApplied")) state.put("lastApplied", prefs.getLong("lastApplied", 0));
        if (prefs.contains("lastId")) state.put("lastId", prefs.getString("lastId", ""));
        return state;
    }
}
