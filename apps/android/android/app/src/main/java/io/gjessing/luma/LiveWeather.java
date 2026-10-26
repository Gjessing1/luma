package io.gjessing.luma;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Only called from a worker while a weather engine is visible; no alarm or location access. */
final class LiveWeather {
    private static final long INTERVAL = 30 * 60 * 1000L;
    private static boolean fetching;

    static String condition(int code) throws Exception {
        if (code == 0 || code == 1) return "clear";
        if (code == 2 || code == 3 || code == 45 || code == 48) return "clouds";
        if (code >= 95 && code <= 99) return "storm";
        if (code == 71 || code == 73 || code == 75 || code == 77 || code == 85 || code == 86) return "snow";
        if (code == 51 || code == 53 || code == 55 || code == 56 || code == 57 || code == 61 || code == 63 || code == 65 || code == 66 || code == 67 || code == 80 || code == 81 || code == 82) return "rain";
        throw new Exception("Unknown weather code");
    }

    static void refresh(Context context) {
        JSONObject config;
        long now = System.currentTimeMillis();
        SharedPreferences prefs = LiveWallpaperSettings.prefs(context);
        try {
            synchronized (LiveWeather.class) {
                config = LiveWallpaperSettings.config(context);
                if (!config.getString("scene").equals("weather") || !config.getString("weather").equals("auto") || fetching) return;
                long elapsed = now - prefs.getLong("weatherAttemptAt", 0);
                if (elapsed >= 0 && elapsed < INTERVAL) return;
                fetching = true;
                prefs.edit().putLong("weatherAttemptAt", now).apply();
            }
        } catch (Exception ignored) { return; }
        HttpURLConnection connection = null;
        try {
            Uri uri = Uri.parse("https://api.open-meteo.com/v1/forecast").buildUpon()
                .appendQueryParameter("latitude", config.getString("latitude"))
                .appendQueryParameter("longitude", config.getString("longitude"))
                .appendQueryParameter("current", "weather_code,is_day")
                .appendQueryParameter("timezone", "UTC").appendQueryParameter("forecast_days", "1").build();
            connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            if (connection.getResponseCode() != 200) throw new Exception("Weather unavailable");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[4096];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (bytes.size() + read > 65536) throw new Exception("Weather response too large");
                    bytes.write(buffer, 0, read);
                }
            }
            JSONObject current = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())).getJSONObject("current");
            JSONObject weather = new JSONObject().put("condition", condition(current.getInt("weather_code")))
                .put("night", current.getInt("is_day") == 0).put("updatedAt", now);
            // A response for an old location must never repaint a newly saved one.
            synchronized (LiveWallpaperSettings.class) {
                JSONObject latest = LiveWallpaperSettings.config(context);
                if (latest.getDouble("latitude") == config.getDouble("latitude") && latest.getDouble("longitude") == config.getDouble("longitude"))
                    prefs.edit().putString("weather", weather.toString()).remove("weatherError").apply();
            }
        } catch (Exception error) {
            prefs.edit().putString("weatherError", "Weather update failed; keeping the last result, or a clear sky until the first update. Retrying while visible after 30 minutes.").apply();
        } finally {
            if (connection != null) connection.disconnect();
            synchronized (LiveWeather.class) { fetching = false; }
        }
    }
}
