package io.gjessing.luma;

import android.app.WallpaperManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;
import java.util.Map;

public class WallpaperRotationTest {
    private static final String FIRST = "a5bc359c-c9b0-4c2b-9515-2ba59841db75";
    private static final String SECOND = "a5bc359c-c9b0-4c2b-9515-2ba59841db76";
    private JSONObject config() throws Exception {
        return new JSONObject("{\"ids\":[\"" + FIRST + "\",\"" + SECOND + "\"],\"device\":\"s25\",\"target\":\"both\",\"mode\":\"interval\",\"intervalMinutes\":15,\"dailyTimes\":[\"07:00\",\"21:00\"],\"shuffle\":false,\"enabled\":true,\"focalX\":50,\"focalY\":50,\"effects\":{\"dim\":0,\"blur\":0,\"warmth\":0,\"grayscale\":false}}");
    }
    @Test public void calculatesDailyAndIntervalTimes() throws Exception {
        JSONObject config = config();
        WallpaperRotation.validate(config);
        Calendar now = Calendar.getInstance();
        now.set(2026, Calendar.OCTOBER, 26, 12, 0, 0); now.set(Calendar.MILLISECOND, 0);
        assertEquals(now.getTimeInMillis() + 900000, WallpaperRotation.nextTime(config, now.getTimeInMillis()));
        config.put("mode", "daily");
        Calendar expected = (Calendar) now.clone(); expected.set(Calendar.HOUR_OF_DAY, 21);
        assertEquals(expected.getTimeInMillis(), WallpaperRotation.nextTime(config, now.getTimeInMillis()));
        now.set(Calendar.HOUR_OF_DAY, 23); expected.add(Calendar.DAY_OF_YEAR, 1); expected.set(Calendar.HOUR_OF_DAY, 7);
        assertEquals(expected.getTimeInMillis(), WallpaperRotation.nextTime(config, now.getTimeInMillis()));
        config.put("intervalMinutes", 1);
        try { WallpaperRotation.validate(config); fail("Must reject short intervals"); } catch (Exception expectedError) { assertTrue(expectedError.getMessage().contains("15 minutes")); }
    }
    @Test public void validatesIndependentStyles() throws Exception {
        JSONObject settings = config();
        JSONObject style = new JSONObject("{\"focalX\":75,\"focalY\":20,\"effects\":{\"dim\":35,\"blur\":0,\"warmth\":0,\"grayscale\":false}}");
        settings.put("styles", new JSONObject().put(FIRST, style));
        WallpaperRotation.validate(settings);
        style.put("focalX", -1);
        try { WallpaperRotation.validate(settings); fail("Must reject invalid per-wallpaper crop"); }
        catch (Exception expected) { assertTrue(expected.getMessage().contains("Invalid crop")); }
        style.put("focalX", 75).put("zoom", 150);
        WallpaperRotation.validate(settings);
        for (double zoom : new double[]{99, 301, Double.NaN}) {
            style.put("zoom", Double.isNaN(zoom) ? "big" : zoom);
            try { WallpaperRotation.validate(settings); fail("Must reject invalid zoom"); }
            catch (Exception expected) { assertTrue(expected.getMessage().contains("zoom")); }
        }
    }
    private void image(File file, int color) throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(120, 260, Bitmap.Config.ARGB_8888); bitmap.eraseColor(color);
        try (FileOutputStream output = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output); }
        finally { bitmap.recycle(); }
    }
    private interface PrefsTest { void run(Context context, File directory) throws Exception; }
    /** Runs against this app's real preferences and restores them, with its own cached files. */
    private void withPrefs(PrefsTest test) throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Map<String, ?> original = WallpaperRotation.prefs(context).getAll();
        File directory = new File(WallpaperRotation.directory(context), "instrumentation"); directory.mkdirs();
        try {
            image(new File(directory, FIRST + ".jpg"), Color.rgb(30, 100, 75));
            image(new File(directory, SECOND + ".jpg"), Color.rgb(80, 40, 110));
            WallpaperRotation.prefs(context).edit().clear().commit();
            test.run(context, directory);
        } finally {
            android.content.SharedPreferences.Editor editor = WallpaperRotation.prefs(context).edit().clear();
            for (Map.Entry<String, ?> entry : original.entrySet()) {
                Object value = entry.getValue();
                if (value instanceof String) editor.putString(entry.getKey(), (String) value);
                else if (value instanceof Long) editor.putLong(entry.getKey(), (Long) value);
                else if (value instanceof Integer) editor.putInt(entry.getKey(), (Integer) value);
                else if (value instanceof Boolean) editor.putBoolean(entry.getKey(), (Boolean) value);
            }
            editor.commit(); WallpaperRotation.scheduleAll(context);
            for (File file : directory.listFiles()) file.delete(); directory.delete();
        }
    }
    private void awaitLastId(Context context, String slot, String id) throws Exception {
        long deadline = System.currentTimeMillis() + 10000;
        while (!id.equals(WallpaperRotation.prefs(context).getString(WallpaperRotation.key("lastId", slot), "")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
        assertEquals(id, WallpaperRotation.prefs(context).getString(WallpaperRotation.key("lastId", slot), ""));
    }
    @Test public void rotatesOfflineThroughTheRealReceiverAndPauses() throws Exception {
        withPrefs((context, directory) -> {
            // A 0.1.3 rotation and its alarm (no slot extra) migrate into the home slot.
            WallpaperRotation.prefs(context).edit().putString("config", config().toString()).putString("generation", "instrumentation").putInt("index", -1).commit();
            synchronized (WallpaperRotation.LOCK) { WallpaperRotation.advance(context, "home"); }
            assertFalse(WallpaperRotation.prefs(context).contains("config"));
            JSONObject home = WallpaperRotation.state(context).getJSONObject("rotations").getJSONObject("home");
            assertEquals(FIRST, home.getString("lastId"));
            assertTrue(home.getLong("nextAt") > System.currentTimeMillis());
            context.sendBroadcast(new Intent(context, WallpaperAlarmReceiver.class).setAction(WallpaperRotation.ROTATE));
            awaitLastId(context, "home", SECOND);
            WallpaperManager manager = WallpaperManager.getInstance(context);
            WallpaperRotation.applyFile(context, new File(directory, FIRST + ".jpg"), "lock", FIRST);
            int lockId = manager.getWallpaperId(WallpaperManager.FLAG_LOCK);
            WallpaperRotation.applyFile(context, new File(directory, SECOND + ".jpg"), "home", SECOND);
            assertEquals("Home-only apply preserves lock wallpaper", lockId, manager.getWallpaperId(WallpaperManager.FLAG_LOCK));
            int homeId = manager.getWallpaperId(WallpaperManager.FLAG_SYSTEM);
            WallpaperRotation.applyFile(context, new File(directory, FIRST + ".jpg"), "lock", FIRST);
            assertEquals("Lock-only apply preserves home wallpaper", homeId, manager.getWallpaperId(WallpaperManager.FLAG_SYSTEM));
            synchronized (WallpaperRotation.LOCK) { WallpaperRotation.pause(context, "home"); }
            home = WallpaperRotation.state(context).getJSONObject("rotations").getJSONObject("home");
            assertFalse(home.getJSONObject("config").getBoolean("enabled"));
            assertFalse(home.has("nextAt"));
            assertFalse(home.has("error"));
        });
    }
    @Test public void runsSeparateHomeAndLockPlaylists() throws Exception {
        withPrefs((context, directory) -> {
            JSONObject home = config().put("target", "home").put("playlistId", "desert").put("name", "Desert");
            JSONObject lock = config().put("target", "lock").put("playlistId", "seasons").put("name", "Seasons").put("mode", "daily");
            WallpaperRotation.validate(home);
            synchronized (WallpaperRotation.LOCK) {
                WallpaperRotation.install(context, home, "instrumentation", FIRST);
                WallpaperRotation.install(context, lock, "instrumentation", FIRST);
            }
            JSONObject rotations = WallpaperRotation.state(context).getJSONObject("rotations");
            assertEquals("desert", rotations.getJSONObject("home").getJSONObject("config").getString("playlistId"));
            assertEquals("seasons", rotations.getJSONObject("lock").getJSONObject("config").getString("playlistId"));
            long homeNext = rotations.getJSONObject("home").getLong("nextAt");
            assertNotEquals(homeNext, rotations.getJSONObject("lock").getLong("nextAt"));
            // The lock alarm advances only the lock playlist and leaves the home schedule alone.
            context.sendBroadcast(new Intent(context, WallpaperAlarmReceiver.class).setAction(WallpaperRotation.ROTATE).putExtra("slot", "lock"));
            awaitLastId(context, "lock", SECOND);
            rotations = WallpaperRotation.state(context).getJSONObject("rotations");
            assertEquals(FIRST, rotations.getJSONObject("home").getString("lastId"));
            assertEquals(homeNext, rotations.getJSONObject("home").getLong("nextAt"));
            synchronized (WallpaperRotation.LOCK) { WallpaperRotation.pause(context, "lock"); }
            assertTrue(WallpaperRotation.config(context, "home").getBoolean("enabled"));
            // A Home & lock playlist takes both screens; a lock playlist then stops it entirely.
            synchronized (WallpaperRotation.LOCK) { WallpaperRotation.install(context, config().put("playlistId", "both"), "instrumentation", FIRST); }
            assertNull(WallpaperRotation.config(context, "lock"));
            assertEquals("both", WallpaperRotation.config(context, "home").getString("playlistId"));
            synchronized (WallpaperRotation.LOCK) { WallpaperRotation.install(context, lock, "instrumentation", FIRST); }
            assertNull(WallpaperRotation.config(context, "home"));
            assertEquals(java.util.Collections.singleton("instrumentation"), WallpaperRotation.generations(context));
        });
        JSONObject invalid = config().put("playlistId", "Not valid");
        try { WallpaperRotation.validate(invalid); fail("Must reject invalid playlist IDs"); }
        catch (Exception expected) { assertTrue(expected.getMessage().contains("playlist")); }
    }
}
