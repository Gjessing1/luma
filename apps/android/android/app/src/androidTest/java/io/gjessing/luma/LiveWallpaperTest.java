package io.gjessing.luma;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class LiveWallpaperTest {
    private JSONObject config() throws Exception {
        return new JSONObject("{\"scene\":\"weather\",\"weather\":\"clear\",\"latitude\":59.91,\"longitude\":10.75,\"motion\":true,\"night\":false}");
    }

    @Test public void serviceIsRegisteredAndProtectedByAndroid() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ServiceInfo info = context.getPackageManager().getServiceInfo(new ComponentName(context, LumaWallpaperService.class), 0);
        assertTrue(info.exported);
        assertEquals(Manifest.permission.BIND_WALLPAPER, info.permission);
        assertNotNull(android.app.WallpaperManager.getInstance(context));
    }

    @Test public void rejectsInvalidLocationAndOptionsBeforeSaving() throws Exception {
        JSONObject config = config();
        LiveWallpaperSettings.validate(config);
        config.put("latitude", 91);
        try { LiveWallpaperSettings.validate(config); fail("Latitude out of bounds"); } catch (Exception expected) { assertTrue(expected.getMessage().contains("latitude")); }
        config.put("latitude", 59.91).put("motion", "false");
        try { LiveWallpaperSettings.validate(config); fail("Boolean required"); } catch (Exception expected) { assertTrue(expected.getMessage().contains("options")); }
    }

    @Test public void weatherCodesIncludeFreezingRainSnowFogAndStorm() throws Exception {
        assertEquals("rain", LiveWeather.condition(67));
        assertEquals("snow", LiveWeather.condition(86));
        assertEquals("clouds", LiveWeather.condition(48));
        assertEquals("storm", LiveWeather.condition(99));
        assertEquals("clear", LiveWeather.condition(0));
        try { LiveWeather.condition(-1); fail("Reject corrupt weather"); } catch (Exception expected) { assertTrue(expected.getMessage().contains("code")); }
    }

    @Test public void scenesProduceDistinctFramesAndWeatherWorksWithoutNetwork() throws Exception {
        LiveSceneRenderer renderer = new LiveSceneRenderer();
        Bitmap first = Bitmap.createBitmap(360, 780, Bitmap.Config.ARGB_8888);
        Bitmap second = Bitmap.createBitmap(360, 780, Bitmap.Config.ARGB_8888);
        try {
            JSONObject config = config().put("scene", "aurora");
            renderer.draw(new Canvas(first), config, null, 0, 0);
            renderer.draw(new Canvas(second), config, null, 10, 0);
            assertFalse("Aurora must animate", first.sameAs(second));
            config.put("scene", "stars");
            renderer.draw(new Canvas(first), config, null, 0, 0);
            renderer.draw(new Canvas(second), config, null, 10, 0);
            assertFalse("Stars must animate", first.sameAs(second));
            config.put("scene", "weather").put("weather", "clear");
            renderer.draw(new Canvas(first), config, null, 0, 0);
            for (String condition : new String[]{"clouds", "rain", "snow", "storm"}) {
                config.put("weather", condition);
                renderer.draw(new Canvas(second), config, null, 10, 0);
                assertFalse(condition + " must differ from a clear sky", first.sameAs(second));
            }
            config.put("weather", "rain");
            renderer.draw(new Canvas(first), config, null, 0, 0);
            config.put("weather", "storm");
            renderer.draw(new Canvas(second), config, null, 0, 0);
            assertFalse("Storm sky must be darker than ordinary rain", first.sameAs(second));
            config.put("weather", "auto");
            JSONObject weather = new JSONObject().put("condition", "snow").put("night", true);
            renderer.draw(new Canvas(first), config, weather, 0, 0);
            config.put("weather", "snow").put("night", true);
            renderer.draw(new Canvas(second), config, null, 0, 0);
            assertTrue("Automatic weather must match the cached condition", first.sameAs(second));
        } finally { first.recycle(); second.recycle(); }
    }
}
