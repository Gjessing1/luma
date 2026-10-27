package io.gjessing.luma;

import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;

/** Native copy of the small core contract: the service must work without a WebView. */
final class LiveWallpaperSettings {
    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("live-wallpaper", Context.MODE_PRIVATE);
    }

    static JSONObject config(Context context) throws Exception {
        return new JSONObject(prefs(context).getString("config",
            "{\"scene\":\"aurora\",\"weather\":\"clear\",\"latitude\":59.91,\"longitude\":10.75,\"night\":false,\"motion\":true}"));
    }

    static void validate(JSONObject config) throws Exception {
        if (config == null) throw new Exception("Missing live wallpaper settings");
        if (!config.getString("scene").matches("aurora|stars|weather|video")) throw new Exception("Unknown live scene");
        if (config.getString("scene").equals("video") && !LiveVideoFiles.validId(config.optString("videoId", null)))
            throw new Exception("Choose a video wallpaper");
        if (!config.getString("weather").matches("auto|clear|clouds|rain|snow|storm")) throw new Exception("Unknown weather mode");
        for (String key : new String[]{"latitude", "longitude"}) {
            double value = config.getDouble(key);
            if (!Double.isFinite(value) || Math.abs(value) > (key.equals("latitude") ? 90 : 180))
                throw new Exception("Invalid " + key);
        }
        if (!(config.get("night") instanceof Boolean) || !(config.get("motion") instanceof Boolean))
            throw new Exception("Invalid live wallpaper options");
    }

    static void save(Context context, JSONObject config) throws Exception {
        validate(config);
        if (config.getString("scene").equals("video") && !LiveVideoFiles.file(context, config.getString("videoId")).isFile())
            throw new Exception("Download the video before saving");
        JSONObject previous = config(context);
        SharedPreferences.Editor editor = prefs(context).edit().remove("videoError");
        if (previous.getDouble("latitude") != config.getDouble("latitude") || previous.getDouble("longitude") != config.getDouble("longitude"))
            editor.remove("weather").remove("weatherAttemptAt").remove("weatherError");
        if (!editor.putString("config", config.toString()).commit()) throw new Exception("Could not save live wallpaper");
    }

    static boolean active(Context context) {
        android.app.WallpaperInfo info = WallpaperManager.getInstance(context).getWallpaperInfo();
        return info != null && (info.getComponent().equals(new ComponentName(context, LumaWallpaperService.class))
            || info.getComponent().equals(new ComponentName(context, LumaWallpaperServiceAlternate.class)));
    }

    /** The Luma component that is not running, so setting it always starts a fresh engine. */
    static ComponentName previewComponent(Context context) {
        android.app.WallpaperInfo info = WallpaperManager.getInstance(context).getWallpaperInfo();
        ComponentName primary = new ComponentName(context, LumaWallpaperService.class);
        if (info != null && info.getComponent().equals(primary)) return new ComponentName(context, LumaWallpaperServiceAlternate.class);
        return primary;
    }

    static JSONObject state(Context context) throws Exception {
        JSONObject state = new JSONObject().put("config", config(context)).put("active", active(context));
        String weather = prefs(context).getString("weather", null);
        if (weather != null) state.put("weather", new JSONObject(weather));
        String error = prefs(context).getString("weatherError", null);
        if (error != null) state.put("weatherError", error);
        String videoError = prefs(context).getString("videoError", null);
        if (videoError != null) state.put("videoError", videoError);
        return state;
    }

    static boolean pauseHomeRotation(Context context) throws Exception {
        synchronized (WallpaperRotation.LOCK) {
            JSONObject config = WallpaperRotation.config(context);
            if (!active(context) || config == null || !config.optBoolean("enabled") || config.optString("target").equals("lock")) return false;
            config.put("enabled", false);
            WallpaperRotation.prefs(context).edit().putString("config", config.toString()).commit();
            WallpaperRotation.schedule(context);
            return true;
        }
    }
}
