package io.gjessing.luma;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import org.json.JSONObject;
import java.util.Random;

/** Procedural scenes use no images, video decoders, WebViews or network resources. */
final class LiveSceneRenderer {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final float[] xs = new float[100], ys = new float[100], sizes = new float[100];

    LiveSceneRenderer() {
        Random random = new Random(24);
        for (int i = 0; i < xs.length; i++) {
            xs[i] = random.nextFloat(); ys[i] = random.nextFloat(); sizes[i] = random.nextFloat();
        }
    }

    void draw(Canvas canvas, JSONObject config, JSONObject weather, float seconds, float offset) {
        float w = canvas.getWidth(), h = canvas.getHeight();
        String scene = config.optString("scene", "aurora");
        if (scene.equals("weather")) {
            String condition = config.optString("weather", "clear");
            boolean night = config.optBoolean("night");
            if (condition.equals("auto")) {
                condition = weather == null ? "clear" : weather.optString("condition", "clear");
                night = weather != null && weather.optBoolean("night");
            }
            landscape(canvas, w, h, seconds, condition, night, offset);
        } else {
            gradient(canvas, w, h, 0xff030916, scene.equals("aurora") ? 0xff152e46 : 0xff10243c);
            stars(canvas, w, h, seconds, offset);
            if (scene.equals("aurora")) aurora(canvas, w, h, seconds);
        }
    }

    private void gradient(Canvas canvas, float w, float h, int top, int bottom) {
        paint.setColor(Color.WHITE);
        paint.setShader(new LinearGradient(0, 0, 0, h, top, bottom, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, w, h, paint);
        paint.setShader(null);
    }

    private void stars(Canvas canvas, float w, float h, float t, float offset) {
        for (int i = 0; i < xs.length; i++) {
            float x = ((xs[i] + t * .001f * (sizes[i] + .2f) + offset * .04f) % 1f) * w;
            float y = ys[i] * h * .9f;
            int alpha = (int) (110 + 100 * (.5 + .5 * Math.sin(t * .6 + i)));
            paint.setColor(Color.argb(alpha, 206, 228, 255));
            canvas.drawCircle(x, y, w * (.0007f + sizes[i] * .0013f), paint);
        }
    }

    private void aurora(Canvas canvas, float w, float h, float t) {
        for (int band = 0; band < 3; band++) {
            path.reset();
            float base = h * (.25f + band * .16f);
            for (int step = 0; step <= 48; step++) {
                float x = step * w / 48;
                float y = base + h * .09f * (float) Math.sin(step * .1 + t * .15 + band * 2) + h * .04f * (float) Math.cos(step * .24 - t * .08);
                if (step == 0) path.moveTo(x, y); else path.lineTo(x, y);
            }
            for (int step = 48; step >= 0; step--) {
                float x = step * w / 48;
                float y = base + h * .09f * (float) Math.sin(step * .1 + t * .15 + band * 2) + h * .04f * (float) Math.cos(step * .24 - t * .08);
                path.lineTo(x, y + h * .2f);
            }
            path.close();
            paint.setShader(new LinearGradient(0, base - h * .12f, 0, base + h * .25f,
                band == 1 ? 0x889684ed : 0x8871edb9, Color.TRANSPARENT, Shader.TileMode.CLAMP));
            canvas.drawPath(path, paint);
            paint.setShader(null);
        }
    }

    private void landscape(Canvas canvas, float w, float h, float t, String condition, boolean night, float offset) {
        boolean wet = condition.equals("rain") || condition.equals("storm");
        boolean cloudy = wet || condition.equals("clouds") || condition.equals("snow");
        int top, bottom;
        if (night) { top = 0xff071022; bottom = 0xff293953; }
        else if (condition.equals("storm")) { top = 0xff1c293d; bottom = 0xff53657c; }
        else if (cloudy) { top = 0xff34475d; bottom = 0xff8b9baf; }
        else { top = 0xff397eae; bottom = 0xffe8c69a; }
        gradient(canvas, w, h, top, bottom);
        if (night) stars(canvas, w, h, t, offset);
        paint.setColor(night ? 0xffe2e6f1 : 0xffffdfa0);
        canvas.drawCircle(w * .73f, h * .24f, w * .065f, paint);
        if (cloudy) {
            paint.setColor(night ? 0xdd263347 : 0xdd91a2b2);
            for (int i = 0; i < 6; i++) {
                float x = ((i * .23f + t * .004f) % 1.5f - .25f) * w;
                float y = h * (.17f + (i % 3) * .09f);
                canvas.drawOval(x - w * .2f, y, x + w * .3f, y + h * .065f, paint);
            }
        }
        for (int layer = 0; layer < 3; layer++) {
            path.reset();
            path.moveTo(-w * .1f, h);
            for (int point = -1; point <= 9; point++) {
                float x = point * w / 8 + offset * w * .025f * (layer + 1);
                float y = h * (.59f + layer * .13f) + h * .06f * (float) Math.sin(point * 2.2 + layer * 1.7);
                path.lineTo(x, y);
            }
            path.lineTo(w * 1.1f, h); path.close();
            int[] colors = night ? new int[]{0xff1b2b42, 0xff111e31, 0xff091321} : new int[]{0xff587487, 0xff344f61, 0xff1d3548};
            if (condition.equals("snow") && layer == 0) colors[0] = night ? 0xff6d7e96 : 0xffd4dfe7;
            paint.setColor(colors[layer]); canvas.drawPath(path, paint);
        }
        if (wet || condition.equals("snow")) {
            boolean snow = condition.equals("snow");
            paint.setColor(snow ? 0xddedf5ff : 0x9997bfdc);
            paint.setStrokeWidth(w * .002f);
            for (int i = 0; i < 75; i++) {
                float y = ((ys[i] + t * (snow ? .025f : .4f) * (.5f + sizes[i])) % 1f) * h;
                float x = ((xs[i] + t * .012f) % 1f) * w;
                if (snow) canvas.drawCircle(x, y, w * (.002f + sizes[i] * .003f), paint);
                else canvas.drawLine(x, y, x - w * .014f, y + h * .018f, paint);
            }
        }
        // Storms stay steady and dark rather than flashing behind launcher content.
    }
}
