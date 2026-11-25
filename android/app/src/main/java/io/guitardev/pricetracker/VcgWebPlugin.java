package io.guitardev.pricetracker;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hosts VCG WebTrader in a second, normally hidden WebView (same idea as the desktop app's hidden window).
 * The user logs in there once; the JS side (bridge.js) injects small listeners and receives prices via __vcgNative.post().
 */
@CapacitorPlugin(name = "VcgWeb")
public class VcgWebPlugin extends Plugin {
    // Desktop Chrome UA: VCG serves the same WebTrader (and sockets) as on the desktop.
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    private static final String RELAY_JS = "(() => { if (window.__vcgRelay || !window.__vcgNative) return; window.__vcgRelay = true;"
            + " window.addEventListener('message', (e) => { if (e.source === window && e.data && typeof e.data.__vcg === 'string') {"
            + " try { window.__vcgNative.post(JSON.stringify({ type: e.data.__vcg, data: e.data.d, slot: e.data.slot })); } catch (_) {} } }); })()";

    private WebView web;

    @Override
    public void load() {
        // Back button: close the WebTrader overlay first, otherwise let the app UI decide (close popups / minimise).
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (!handleBack()) notifyListeners("back", new JSObject());
            }
        });
    }

    @PluginMethod
    public void minimize(PluginCall call) {
        getActivity().runOnUiThread(() -> { getActivity().moveTaskToBack(true); call.resolve(); });
    }
    private LinearLayout overlay;
    private volatile String currentUrl = "";

    private class NativeBridge {
        @JavascriptInterface
        public void post(String json) {
            JSObject o = new JSObject();
            o.put("data", json);
            notifyListeners("message", o);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void create() {
        if (web != null) return;
        web = new WebView(getContext());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUserAgentString(UA);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.addJavascriptInterface(new NativeBridge(), "__vcgNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) { currentUrl = url; }

            @Override
            public void onPageFinished(WebView view, String url) {
                currentUrl = url;
                view.evaluateJavascript(RELAY_JS, null);
                JSObject o = new JSObject();
                o.put("url", url);
                notifyListeners("page", o);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                JSObject o = new JSObject();
                o.put("code", err.getErrorCode());
                o.put("description", String.valueOf(err.getDescription()));
                notifyListeners("pageError", o);
            }
        });

        // full-screen overlay: a top bar + the WebTrader page. INVISIBLE keeps the page (and its sockets) running.
        overlay = new LinearLayout(getContext());
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setBackgroundColor(Color.parseColor("#0f1115"));
        LinearLayout bar = new LinearLayout(getContext());
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(24, 12, 12, 12);
        TextView title = new TextView(getContext());
        title.setText("VCG WebTrader — login แล้วกด \"กลับไปที่แอป\"");
        title.setTextColor(Color.parseColor("#d6d9e0"));
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button back = new Button(getContext());
        back.setText("กลับไปที่แอป");
        back.setOnClickListener(v -> hideOverlay());
        bar.addView(back);
        overlay.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        overlay.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        overlay.setVisibility(View.INVISIBLE);
        // keep the login page clear of the status bar, gesture bar and on-screen keyboard
        ViewCompat.setOnApplyWindowInsetsListener(overlay, (v, insets) -> {
            Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(b.left, b.top, b.right, b.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewGroup root = getActivity().findViewById(android.R.id.content);
        root.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void hideOverlay() {
        if (overlay == null) return;
        overlay.setVisibility(View.INVISIBLE);
        notifyListeners("hidden", new JSObject());
    }

    @PluginMethod
    public void start(PluginCall call) {
        String url = call.getString("url");
        getActivity().runOnUiThread(() -> {
            create();
            if (url != null && (web.getUrl() == null || web.getUrl().isEmpty())) web.loadUrl(url);
            call.resolve();
        });
    }

    @PluginMethod
    public void navigate(PluginCall call) {
        String url = call.getString("url");
        getActivity().runOnUiThread(() -> { create(); web.loadUrl(url); call.resolve(); });
    }

    @PluginMethod
    public void eval(PluginCall call) {
        String js = call.getString("js", "");
        getActivity().runOnUiThread(() -> {
            if (web == null) { call.reject("not started"); return; }
            web.evaluateJavascript(js, value -> {
                JSObject o = new JSObject();
                o.put("value", value == null ? "null" : value);
                call.resolve(o);
            });
        });
    }

    @PluginMethod
    public void getUrl(PluginCall call) {
        JSObject o = new JSObject();
        o.put("url", currentUrl == null ? "" : currentUrl);
        call.resolve(o);
    }

    @PluginMethod
    public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> { create(); overlay.setVisibility(View.VISIBLE); overlay.bringToFront(); ViewCompat.requestApplyInsets(overlay); call.resolve(); });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> { hideOverlay(); call.resolve(); });
    }

    @PluginMethod
    public void reload(PluginCall call) {
        getActivity().runOnUiThread(() -> { if (web != null) web.reload(); call.resolve(); });
    }

    @PluginMethod
    public void clearData(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
            WebStorage.getInstance().deleteAllData();
            if (web != null) web.clearCache(true);
            call.resolve();
        });
    }

    /** Android back button: close the WebTrader overlay first. */
    public boolean handleBack() {
        if (overlay != null && overlay.getVisibility() == View.VISIBLE) { hideOverlay(); return true; }
        return false;
    }
}
