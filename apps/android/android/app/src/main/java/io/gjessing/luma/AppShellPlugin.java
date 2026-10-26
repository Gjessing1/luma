package io.gjessing.luma;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.webkit.CookieManager;
import android.widget.Toast;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The web layer's handle on the shell (A7): the installed version and the update download. The page
 * reaches it as window.Capacitor.Plugins.AppShell, so the web app has no Capacitor dependency.
 */
@CapacitorPlugin(name = "AppShell")
public class AppShellPlugin extends Plugin {
    private final ShellNavigation navigation = new ShellNavigation(BuildConfig.SERVER_URL);

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        return navigation.shouldAllow(url) ? false : null;
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("versionCode", BuildConfig.VERSION_CODE);
        result.put("versionName", BuildConfig.VERSION_NAME);
        call.resolve(result);
    }

    /**
     * Downloads the published APK with the WebView's session cookie, so an SSO-protected download
     * works without a second login in the system browser. The completed-download notification opens
     * the installer. Never a WebView navigation: Capacitor's remote-mode proxy re-serves any
     * Accept: text/html navigation as HTML, which would render the APK as text.
     */
    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String raw = call.getString("url");
        String name = call.getString("fileName", "update.apk");
        Uri url = raw == null ? null : Uri.parse(raw);
        Uri server = Uri.parse(BuildConfig.SERVER_URL);
        if (url == null || !server.getScheme().equals(url.getScheme()) || !server.getAuthority().equals(url.getAuthority())) {
            call.reject("Updates download only from the app's own server");
            return;
        }
        if (!name.matches("[A-Za-z0-9._-]+\\.apk")) name = "update.apk";
        DownloadManager.Request request = new DownloadManager.Request(url)
            .setMimeType("application/vnd.android.package-archive")
            .setTitle(name)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
        String cookie = CookieManager.getInstance().getCookie(raw);
        if (cookie != null) request.addRequestHeader("Cookie", cookie);
        DownloadManager downloads = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        downloads.enqueue(request);
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), R.string.update_downloading, Toast.LENGTH_LONG).show());
        call.resolve();
    }
}
