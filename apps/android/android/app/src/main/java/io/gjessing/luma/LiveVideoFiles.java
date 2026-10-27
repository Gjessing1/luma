package io.gjessing.luma;

import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.webkit.CookieManager;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

final class LiveVideoFiles {
    static boolean validId(String id) { return id != null && id.matches("[a-z][a-z0-9-]{0,63}"); }

    static File file(Context context, String id) throws Exception {
        if (!validId(id)) throw new Exception("Invalid video wallpaper ID");
        return new File(new File(context.getFilesDir(), "live-videos"), id + ".mp4");
    }

    static void download(Context context, String id) throws Exception {
        File destination = file(context, id);
        if (destination.isFile()) return;
        if (!destination.getParentFile().isDirectory() && !destination.getParentFile().mkdirs())
            throw new Exception("Could not create video storage");
        File temporary = File.createTempFile("download-", ".mp4", destination.getParentFile());
        HttpURLConnection connection = (HttpURLConnection) new URL(BuildConfig.SERVER_URL + "/api/live-wallpapers/" + id + "/wallpaper.mp4").openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(false);
        String cookie = CookieManager.getInstance().getCookie(BuildConfig.SERVER_URL);
        if (cookie != null) connection.setRequestProperty("Cookie", cookie);
        try {
            if (connection.getResponseCode() != 200 || !"video/mp4".equals(connection.getContentType()))
                throw new Exception("Video download failed. Check your connection and sign in again.");
            long expected = connection.getContentLengthLong();
            if (expected > 40 * 1024 * 1024) throw new Exception("Video is too large");
            long total = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[16384]; int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > 40 * 1024 * 1024) throw new Exception("Video is too large");
                    output.write(buffer, 0, read);
                }
                output.getFD().sync();
            }
            if (total == 0 || (expected >= 0 && expected != total)) throw new Exception("Video download was incomplete");
            validate(temporary);
            if (!temporary.renameTo(destination)) throw new Exception("Could not save video wallpaper");
        } finally {
            connection.disconnect();
            temporary.delete();
        }
    }

    static Bitmap firstFrame(Context context, String id) {
        try (MediaMetadataRetriever media = new MediaMetadataRetriever()) {
            media.setDataSource(file(context, id).getAbsolutePath());
            return media.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
        } catch (Exception error) {
            return null;
        }
    }

    static void validate(File file) throws Exception {
        try (MediaMetadataRetriever media = new MediaMetadataRetriever()) {
            media.setDataSource(file.getAbsolutePath());
            long duration = Long.parseLong(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
            int width = Integer.parseInt(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int height = Integer.parseInt(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            if (duration <= 0 || duration > 60000 || width <= 0 || height <= 0 || width > 4096 || height > 4096)
                throw new Exception("Video must be at most 60 seconds and 4096 pixels");
        } catch (RuntimeException error) {
            throw new Exception("Video could not be read", error);
        }
    }
}
