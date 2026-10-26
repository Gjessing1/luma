package io.gjessing.luma;

import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/** Offers a retry when the page itself fails to load, instead of a blank WebView. */
final class ShellWebViewClient extends BridgeWebViewClient {
    private final MainActivity activity;

    ShellWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request.isForMainFrame()) activity.showConnectionError();
    }
}
