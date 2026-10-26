package io.gjessing.luma;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

/**
 * A shell over the hosted web app (A7): the WebView loads BuildConfig.SERVER_URL and signs in
 * through the SSO chain like a browser, so a web deploy updates the UI without a new APK. Native
 * code here is only what a browser tab can't do: launcher, back button, passkeys, the update
 * download and the offline retry.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "Luma";
    private boolean connectionDialogVisible;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        boolean debug = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        config = new CapConfig.Builder(this)
            .setServerUrl(BuildConfig.SERVER_URL)
            // Lets the backend and its logs tell the app from a browser.
            .setAppendedUserAgentString("luma-android/" + BuildConfig.VERSION_CODE)
            .setLoggingEnabled(debug)
            .setWebContentsDebuggingEnabled(debug)
            .setResolveServiceWorkerRequests(false)
            .setInitialFocus(true)
            .create();
        registerPlugin(AppShellPlugin.class);
        registerPlugin(WallpaperPlugin.class);
        super.onCreate(savedInstanceState);
        enableWebAuthentication();
        if (bridge != null) bridge.setWebViewClient(new ShellWebViewClient(bridge, this));
        // BridgeActivity does not consume Back, so without this Back closes the app from any page.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge == null ? null : bridge.getWebView();
                if (webView != null && webView.canGoBack()) webView.goBack();
                else finish();
            }
        });
    }

    /**
     * Android WebView keeps WebAuthn disabled until the host enables it. Browser mode, not app
     * mode: the passkey provider then signs for the page's own HTTPS origin, the one Pocket ID
     * accepts, instead of the app's apk-key-hash origin, which it never would. The manifest's
     * CREDENTIAL_MANAGER_SET_ORIGIN permits handing that origin over, and ShellNavigation keeps the
     * WebView on the app server and its SSO chain, so those are the only origins it speaks for.
     */
    private void enableWebAuthentication() {
        if (bridge == null) return;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            Log.w(TAG, "Android System WebView does not support WebAuthn");
            return;
        }
        WebSettingsCompat.setWebAuthenticationSupport(
            bridge.getWebView().getSettings(),
            WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_BROWSER
        );
    }

    void showConnectionError() {
        if (connectionDialogVisible || isFinishing()) return;
        connectionDialogVisible = true;
        runOnUiThread(() -> new AlertDialog.Builder(this)
            .setTitle(R.string.server_unavailable_title)
            .setMessage(getString(R.string.server_unavailable_message, BuildConfig.SERVER_URL))
            .setPositiveButton(R.string.retry, (dialog, which) -> {
                connectionDialogVisible = false;
                bridge.getWebView().reload();
            })
            .setOnCancelListener(dialog -> connectionDialogVisible = false)
            .show());
    }
}
