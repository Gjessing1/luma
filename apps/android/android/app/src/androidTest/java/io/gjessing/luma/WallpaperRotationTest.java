package io.gjessing.luma;

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
    private void image(File file, int color) throws Exception {
        Bitmap bitmap = Bitmap.createBitmap(120, 260, Bitmap.Config.ARGB_8888); bitmap.eraseColor(color);
        try (FileOutputStream output = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output); }
        finally { bitmap.recycle(); }
    }
    @Test public void rotatesOfflineThroughTheRealReceiverAndPauses() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Map<String, ?> original = WallpaperRotation.prefs(context).getAll();
        File directory = new File(WallpaperRotation.directory(context), "instrumentation"); directory.mkdirs();
        try {
            image(new File(directory, FIRST + ".jpg"), Color.rgb(30, 100, 75));
            image(new File(directory, SECOND + ".jpg"), Color.rgb(80, 40, 110));
            WallpaperRotation.prefs(context).edit().clear().putString("config", config().toString()).putString("generation", "instrumentation").putInt("index", -1).commit();
            synchronized (WallpaperRotation.LOCK) { WallpaperRotation.advance(context); WallpaperRotation.schedule(context); }
            assertEquals(FIRST, WallpaperRotation.state(context).getString("lastId"));
            assertTrue(WallpaperRotation.state(context).getLong("nextAt") > System.currentTimeMillis());
            context.sendBroadcast(new Intent(context, WallpaperAlarmReceiver.class).setAction("io.gjessing.luma.ROTATE"));
            long deadline = System.currentTimeMillis() + 10000;
            while (!SECOND.equals(WallpaperRotation.prefs(context).getString("lastId", "")) && System.currentTimeMillis() < deadline) Thread.sleep(100);
            assertEquals(SECOND, WallpaperRotation.state(context).getString("lastId"));
            JSONObject paused = config().put("enabled", false);
            WallpaperRotation.prefs(context).edit().putString("config", paused.toString()).commit();
            WallpaperRotation.schedule(context);
            assertFalse(WallpaperRotation.state(context).has("nextAt"));
            assertFalse(WallpaperRotation.state(context).has("error"));
        } finally {
            android.content.SharedPreferences.Editor editor = WallpaperRotation.prefs(context).edit().clear();
            for (Map.Entry<String, ?> entry : original.entrySet()) {
                Object value = entry.getValue();
                if (value instanceof String) editor.putString(entry.getKey(), (String) value);
                else if (value instanceof Long) editor.putLong(entry.getKey(), (Long) value);
                else if (value instanceof Integer) editor.putInt(entry.getKey(), (Integer) value);
                else if (value instanceof Boolean) editor.putBoolean(entry.getKey(), (Boolean) value);
            }
            editor.commit(); WallpaperRotation.schedule(context);
            for (File file : directory.listFiles()) file.delete(); directory.delete();
        }
    }
}
