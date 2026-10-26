package io.gjessing.luma;

import android.net.Uri;
import java.util.HashSet;
import java.util.Set;

/** Keeps the app server and its chained SSO redirects inside the WebView. */
final class ShellNavigation {
    private final Uri serverOrigin;
    private final Set<String> authenticationOrigins = new HashSet<>();

    ShellNavigation(String serverUrl) {
        serverOrigin = Uri.parse(serverUrl);
    }

    boolean shouldAllow(Uri target) {
        if (sameOrigin(target, serverOrigin)) return true;
        if (!"https".equals(target.getScheme())) return false;
        if (isAuthenticationEntry(target)) {
            authenticationOrigins.add(origin(target));
            return true;
        }
        return authenticationOrigins.contains(origin(target));
    }

    /** Trust a new login origin only when it returns to an origin already in the SSO chain. */
    private boolean isAuthenticationEntry(Uri target) {
        String[] returnParameters = { "redirect_uri", "redirect", "return_url", "returnUrl", "continue" };
        for (String name : returnParameters) {
            String value = target.getQueryParameter(name);
            if (value == null) continue;
            Uri returnUrl = Uri.parse(value);
            if (sameOrigin(returnUrl, serverOrigin) || authenticationOrigins.contains(origin(returnUrl))) {
                return true;
            }
        }
        return false;
    }

    private static boolean sameOrigin(Uri left, Uri right) {
        return left.getScheme() != null &&
            left.getScheme().equalsIgnoreCase(right.getScheme()) &&
            left.getHost() != null &&
            left.getHost().equalsIgnoreCase(right.getHost()) &&
            effectivePort(left) == effectivePort(right);
    }

    private static int effectivePort(Uri uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String origin(Uri uri) {
        return uri.getScheme() + "://" + uri.getEncodedAuthority();
    }
}
