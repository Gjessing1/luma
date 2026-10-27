package io.gjessing.luma;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.webkit.CookieManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "Wallpaper")
public class WallpaperPlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private interface Task { void run() throws Exception; }
    @Override protected void handleOnDestroy() { executor.shutdown(); }
    private boolean trustedPage() {
        String raw = getBridge().getWebView().getUrl();
        if (raw == null) return false;
        Uri page = Uri.parse(raw), server = Uri.parse(BuildConfig.SERVER_URL);
        return server.getScheme().equals(page.getScheme()) && server.getAuthority().equals(page.getAuthority());
    }
    private void execute(PluginCall call, Task task) {
        getActivity().runOnUiThread(() -> {
            if (!trustedPage()) { call.reject("Open Luma to use wallpaper controls"); return; }
            if (executor.isShutdown()) { call.reject("Luma is restarting. Please try again."); return; }
            executor.execute(() -> {
                try { task.run(); call.resolve(JSObject.fromJSONObject(WallpaperRotation.state(getContext()))); }
                catch (Exception error) { call.reject(error.getMessage(), error); }
            });
        });
    }
    @PluginMethod public void getState(PluginCall call) { execute(call, () -> {}); }
    /** No slot pauses every screen, as the single rotation did before saved playlists. */
    @PluginMethod public void pause(PluginCall call) { execute(call, () -> {
        String slot = call.getString("slot");
        synchronized (WallpaperRotation.LOCK) {
            if (slot == null) for (String each : WallpaperRotation.SLOTS) WallpaperRotation.pause(getContext(), each);
            else WallpaperRotation.pause(getContext(), WallpaperRotation.checkedSlot(slot));
        }
    }); }
    @PluginMethod public void stop(PluginCall call) { execute(call, () -> {
        synchronized (WallpaperRotation.LOCK) {
            WallpaperRotation.stop(getContext(), WallpaperRotation.checkedSlot(call.getString("slot")));
            deleteUnused();
        }
    }); }
    @PluginMethod public void next(PluginCall call) { execute(call, () -> {
        String slot = call.getString("slot");
        synchronized (WallpaperRotation.LOCK) {
            if (slot == null) slot = WallpaperRotation.config(getContext(), "home") != null ? "home" : "lock";
            WallpaperRotation.advance(getContext(), WallpaperRotation.checkedSlot(slot));
        }
    }); }
    private JSONObject validated(PluginCall call) throws Exception {
        JSONObject config = call.getObject("config");
        if (config == null) throw new Exception("Missing playlist settings");
        WallpaperRotation.validate(config);
        return config;
    }
    private void download(String id, JSONObject config, File destination) throws Exception {
        if (!id.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}")) throw new Exception("Invalid image ID");
        JSONObject styles = config.optJSONObject("styles");
        JSONObject style = styles == null ? config : styles.optJSONObject(id);
        if (style == null) style = new JSONObject("{\"focalX\":50,\"focalY\":50,\"effects\":{\"dim\":0,\"blur\":0,\"warmth\":0,\"grayscale\":false}}");
        JSONObject effects = style.getJSONObject("effects");
        Uri uri = Uri.parse(BuildConfig.SERVER_URL).buildUpon().appendEncodedPath("api/wallpapers/" + id + "/image")
            .appendQueryParameter("device", config.getString("device"))
            .appendQueryParameter("x", style.getString("focalX")).appendQueryParameter("y", style.getString("focalY"))
            .appendQueryParameter("zoom", String.valueOf(style.optDouble("zoom", 100)))
            .appendQueryParameter("dim", effects.getString("dim")).appendQueryParameter("blur", effects.getString("blur"))
            .appendQueryParameter("warmth", effects.getString("warmth")).appendQueryParameter("grayscale", effects.getBoolean("grayscale") ? "1" : "0").build();
        HttpURLConnection connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
        connection.setConnectTimeout(15000); connection.setReadTimeout(30000); connection.setInstanceFollowRedirects(false);
        String cookie = CookieManager.getInstance().getCookie(BuildConfig.SERVER_URL);
        if (cookie != null) connection.setRequestProperty("Cookie", cookie);
        try {
            if (connection.getResponseCode() != 200 || !"image/jpeg".equals(connection.getContentType())) throw new Exception("Image download failed. Check your connection and sign in again.");
            try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(destination)) {
                byte[] buffer = new byte[16384]; int read; long total = 0;
                while ((read = input.read(buffer)) != -1) { total += read; if (total > 25 * 1024 * 1024) throw new Exception("Image is too large"); output.write(buffer, 0, read); }
            }
        } finally { connection.disconnect(); }
    }
    @PluginMethod public void configure(PluginCall call) { execute(call, () -> {
        JSONObject config = validated(call);
        JSONArray ids = config.getJSONArray("ids");
        if (ids.length() == 0) throw new Exception("Choose wallpapers first");
        File root = WallpaperRotation.directory(getContext());
        File generation = new File(root, UUID.randomUUID().toString());
        if (!generation.mkdirs()) throw new Exception("Could not create wallpaper storage");
        boolean committed = false;
        try {
            for (int i = 0; i < ids.length(); i++) download(ids.getString(i), config, new File(generation, ids.getString(i) + ".jpg"));
            // Keep the old playlist intact until every new image is safely on disk.
            synchronized (WallpaperRotation.LOCK) {
            WallpaperRotation.applyFile(getContext(), new File(generation, ids.getString(0) + ".jpg"), config.getString("target"), ids.getString(0));
            WallpaperRotation.install(getContext(), config, generation.getName(), ids.getString(0));
            committed = true;
            }
        } catch (Exception error) { if (!committed) deleteTree(generation); throw error; }
        synchronized (WallpaperRotation.LOCK) { deleteUnused(); }
    }); }
    @PluginMethod public void apply(PluginCall call) { execute(call, () -> {
        JSONObject config = validated(call);
        String id = config.getJSONArray("ids").getString(0);
        File temporary = File.createTempFile("apply-", ".jpg", getContext().getCacheDir());
        try { download(id, config, temporary); synchronized (WallpaperRotation.LOCK) { WallpaperRotation.applyFile(getContext(), temporary, config.getString("target"), id); } }
        finally { temporary.delete(); }
    }); }
    @PluginMethod public void exportImage(PluginCall call) { execute(call, () -> {
        if (Build.VERSION.SDK_INT < 29) throw new Exception("Gallery export requires Android 10 or newer");
        JSONObject config = validated(call);
        String id = call.getString("id", "");
        File temporary = File.createTempFile("export-", ".jpg", getContext().getCacheDir());
        Uri uri = null;
        try {
            download(id, config, temporary);
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, "Luma-" + System.currentTimeMillis() + ".jpg");
            values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Luma");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
            uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Could not save to Gallery");
            try (InputStream input = new FileInputStream(temporary); OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                if (output == null) throw new Exception("Could not write to Gallery");
                byte[] buffer = new byte[16384]; int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            }
            values.clear(); values.put(MediaStore.Images.Media.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, values, null, null);
        } catch (Exception error) { if (uri != null) getContext().getContentResolver().delete(uri, null, null); throw error; }
        finally { temporary.delete(); }
    }); }
    @PluginMethod public void openWallpaperSettings(PluginCall call) {
        if (!trustedPage()) { call.reject("Open Luma to use wallpaper controls"); return; }
        try { getActivity().startActivity(new Intent(Intent.ACTION_SET_WALLPAPER)); call.resolve(); }
        catch (Exception error) { try { getActivity().startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); call.resolve(); } catch (Exception fallback) { call.reject("Open Settings → Wallpaper and style on your Galaxy"); } }
    }
    @PluginMethod public void configureLive(PluginCall call) { execute(call, () -> {
        JSONObject config = call.getObject("config");
        LiveWallpaperSettings.validate(config);
        if (config.getString("scene").equals("video"))
            LiveVideoFiles.download(getContext(), config.getString("videoId"));
        synchronized (LiveWallpaperSettings.class) {
            LiveWallpaperSettings.save(getContext(), config);
        }
    }); }
    @PluginMethod public void openLiveWallpaperPreview(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!trustedPage()) { call.reject("Open Luma to use wallpaper controls"); return; }
            try {
                android.app.WallpaperManager manager = android.app.WallpaperManager.getInstance(getContext());
                if (!manager.isWallpaperSupported() || !manager.isSetWallpaperAllowed()) throw new Exception("This device does not allow changing wallpaper");
                Intent intent = new Intent(android.app.WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
                    .putExtra(android.app.WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                        LiveWallpaperSettings.previewComponent(getContext()));
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception error) { call.reject("Could not open live wallpaper preview. Open Settings → Wallpaper and style → Live wallpapers → Luma.", error); }
        });
    }
    /** Removes cached playlists that neither screen plays any more. Call while holding LOCK. */
    private void deleteUnused() throws Exception {
        java.util.Set<String> kept = WallpaperRotation.generations(getContext());
        File[] cached = WallpaperRotation.directory(getContext()).listFiles();
        if (cached != null) for (File file : cached) if (!kept.contains(file.getName())) deleteTree(file);
    }
    private static void deleteTree(File file) { File[] children = file.listFiles(); if (children != null) for (File child : children) deleteTree(child); file.delete(); }
}
