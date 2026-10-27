package io.gjessing.luma;

import android.content.Context;
import android.media.MediaPlayer;
import android.view.SurfaceHolder;

/** Each preview/launcher engine owns its decoder and only reads the offline cache. */
final class LiveVideoPlayer {
    private final Context context;
    private MediaPlayer player;
    private boolean prepared, rendered, animate;
    private String id;
    private String failedId;

    LiveVideoPlayer(Context context) { this.context = context; }

    boolean show(String videoId, SurfaceHolder holder, boolean motion) {
        if (videoId.equals(failedId)) return false;
        animate = motion;
        if (!videoId.equals(id)) {
            release();
            id = videoId;
            try {
                MediaPlayer next = new MediaPlayer();
                player = next;
                next.setDataSource(LiveVideoFiles.file(context, videoId).getAbsolutePath());
                // setDisplay would make MediaPlayer toggle keep-screen-on through the holder, which
                // a wallpaper engine's holder rejects with an exception that kills the process.
                next.setSurface(holder.getSurface());
                next.setVolume(0, 0);
                next.setLooping(true);
                next.setOnPreparedListener(media -> {
                    if (player != media) return;
                    prepared = true;
                    media.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING);
                    // Decode the first frame even for a still scene, then pause once it is visible.
                    media.start();
                });
                next.setOnInfoListener((media, what, extra) -> {
                    if (what == MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START && player == media) {
                        rendered = true;
                        if (!animate) media.pause();
                        // Clear a stale still-frame or failure notice from an earlier engine.
                        LiveWallpaperSettings.prefs(context).edit().remove("videoError").apply();
                    }
                    return false;
                });
                next.setOnErrorListener((media, what, extra) -> {
                    fail(videoId);
                    return true;
                });
                next.prepareAsync();
            } catch (Exception error) { fail(videoId); return false; }
        }
        if (prepared && rendered && player != null) {
            try {
                if (animate && !player.isPlaying()) player.start();
                else if (!animate && player.isPlaying()) player.pause();
            } catch (IllegalStateException error) { fail(videoId); return false; }
        }
        return true;
    }

    private void fail(String videoId) {
        release();
        failedId = videoId;
        LiveWallpaperSettings.prefs(context).edit().putString("videoError", "Video playback failed. Choose another wallpaper or save this one again.").apply();
    }

    void release() {
        if (player != null) { player.release(); player = null; }
        prepared = false;
        rendered = false;
        id = null;
    }

    void retry() { failedId = null; }
}
