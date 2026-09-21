package de.agentenwerk.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Locale;

/** Android client for a single-owner Agentenwerk server. No API keys or JS bridge. */
public class MainActivity extends Activity {
    private LinearLayout root;
    private WebView web;
    private String serverOrigin;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        getWindow().setStatusBarColor(Color.rgb(246, 245, 241));
        getWindow().setNavigationBarColor(Color.rgb(246, 245, 241));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        serverOrigin = getPreferences(MODE_PRIVATE).getString("server", "");
        if (serverOrigin.isEmpty()) setup(); else openWorkspace();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void base() {
        if (web != null) { web.stopLoading(); web.destroy(); web = null; }
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(246, 245, 241));
        root.setFitsSystemWindows(true);
        setContentView(root);
    }
    private TextView text(String value, int size) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size);
        view.setTextColor(Color.rgb(41, 60, 48)); view.setPadding(dp(8), dp(10), dp(8), dp(10)); return view;
    }
    private void setup() {
        base(); root.setPadding(dp(22), dp(30), dp(22), dp(22));
        root.addView(text("✳  Agentenwerk", 31));
        root.addView(text("Dein KI-Team. Überall dabei.", 20));
        root.addView(text("Verbinde die App mit deinem Agentenwerk-Server. Dort laufen deine Agenten und Routinen – auch wenn du die App schließt.", 15));
        root.addView(text("Server-Adresse", 13));
        EditText address = new EditText(this); address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setHint("https://dein-server.example"); address.setText(serverOrigin); root.addView(address);
        Button connect = new Button(this); connect.setText("Arbeitsraum öffnen →"); root.addView(connect);
        TextView help = text("Der Zugangscode wird auf der nächsten Seite abgefragt. Dein OpenAI-API-Schlüssel bleibt ausschließlich auf deinem Server.\n\nDie Einrichtung ist in der mitgelieferten START-HIER.md erklärt.", 13); root.addView(help);
        if (BuildConfig.DEBUG) root.addView(text("Lokale Vorschau: per USB mit adb reverse tcp:8787 tcp:8787 verbinden und http://127.0.0.1:8787 eingeben. Im Emulator: http://10.0.2.2:8787.", 12));
        connect.setOnClickListener(v -> {
            try {
                Uri uri = Uri.parse(address.getText().toString().trim());
                String host = uri.getHost();
                boolean loopback = "localhost".equals(host) || "127.0.0.1".equals(host) || "10.0.2.2".equals(host);
                boolean scheme = "https".equals(uri.getScheme()) || (BuildConfig.DEBUG && loopback && "http".equals(uri.getScheme()));
                if (!scheme || host == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) throw new IllegalArgumentException();
                String next = uri.getScheme().toLowerCase(Locale.ROOT) + "://" + uri.getAuthority().toLowerCase(Locale.ROOT);
                if (!next.equals(serverOrigin)) CookieManager.getInstance().removeAllCookies(null);
                serverOrigin = next; getPreferences(MODE_PRIVATE).edit().putString("server", serverOrigin).apply(); openWorkspace();
            } catch (Exception e) { address.setError("Bitte eine HTTPS-Serveradresse ohne Unterpfad eingeben."); }
        });
    }
    private boolean sameOrigin(Uri uri) {
        Uri base = Uri.parse(serverOrigin);
        int port = uri.getPort() == -1 ? ("https".equals(uri.getScheme()) ? 443 : 80) : uri.getPort();
        int basePort = base.getPort() == -1 ? ("https".equals(base.getScheme()) ? 443 : 80) : base.getPort();
        return base.getScheme().equals(uri.getScheme()) && base.getHost().equalsIgnoreCase(uri.getHost() == null ? "" : uri.getHost()) && port == basePort;
    }
    @SuppressWarnings("SetJavaScriptEnabled") private void openWorkspace() {
        base();
        LinearLayout bar = new LinearLayout(this); bar.setPadding(dp(12), 0, dp(8), 0);
        TextView title = text("✳ Agentenwerk", 15); bar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button settings = new Button(this); settings.setText("Server"); settings.setTextSize(11); bar.addView(settings);
        settings.setOnClickListener(v -> setup()); root.addView(bar);
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        web.setBackgroundColor(Color.rgb(246, 245, 241));
        WebSettings prefs = web.getSettings(); prefs.setJavaScriptEnabled(true); prefs.setDomStorageEnabled(true);
        prefs.setAllowFileAccess(false); prefs.setAllowContentAccess(false);
        prefs.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        prefs.setJavaScriptCanOpenWindowsAutomatically(false); prefs.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, android.webkit.JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Bestätigen", (d, w) -> result.confirm()).setNegativeButton("Abbrechen", (d, w) -> result.cancel()).setOnCancelListener(d -> result.cancel()).show(); return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl(); if (sameOrigin(uri)) return false;
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                new AlertDialog.Builder(MainActivity.this).setTitle("Server nicht erreichbar").setMessage("Prüfe die Adresse und ob dein Agentenwerk-Server läuft.").setPositiveButton("Erneut versuchen", (d,w) -> { if (web != null) web.loadUrl(serverOrigin + "/"); }).setNegativeButton("Server ändern", (d,w) -> setup()).show();
            }
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); }
        });
        web.loadUrl(serverOrigin + "/");
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
