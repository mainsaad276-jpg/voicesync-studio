package com.abubakarytzone.voicesync;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyCallback;
import android.telephony.TelephonyManager;
import android.util.Log;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * Single-activity wrapper that loads the live VoiceSync Studio web app
 * (https://mainsaad276-jpg.github.io/voicesync-studio/) in a WebView and
 * bridges the native capabilities the web side needs: microphone, file
 * picking, user-visible file saving, sharing, and audio-focus hygiene.
 */
public class MainActivity extends AppCompatActivity {
    private static final String TAG = "VoiceSyncMain";
    private static final String SITE_URL = "https://mainsaad276-jpg.github.io/voicesync-studio/";
    private static final String SITE_HOST = "mainsaad276-jpg.github.io";

    private WebView webView;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private TelephonyManager telephonyManager;
    private Object callListener; // TelephonyCallback (31+) or PhoneStateListener (<31)

    private PermissionRequest pendingPermissionRequest;
    private ValueCallback<Uri[]> fileChooserCallback;

    private long lastBackPressMs = 0;

    // Lazily requested ONLY when the user taps a mic feature in the web app.
    // The web side shows its own disclosure modal first, then calls
    // getUserMedia(), which lands in onPermissionRequest() below.
    private final ActivityResultLauncher<String> micPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                PermissionRequest req = pendingPermissionRequest;
                pendingPermissionRequest = null;
                if (req == null) return;
                if (granted) {
                    req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    req.deny();
                }
            });

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                ValueCallback<Uri[]> cb = fileChooserCallback;
                fileChooserCallback = null;
                if (cb == null) return;
                Uri[] uris = WebChromeClient.FileChooserParams.parseResult(
                        result.getResultCode(), result.getData());
                cb.onReceiveValue(uris);
            });

    private final AudioManager.OnAudioFocusChangeListener focusListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS
                || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            // Incoming call, voice assistant, etc. — stop TTS/lipsync playback
            // rather than talking over it. (CAN_DUCK/GAIN leave state to the web app.)
            stopAllAudio();
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Swap the splash theme for the real app theme before super.onCreate().
        setTheme(R.style.Theme_VoiceSync);
        super.onCreate(savedInstanceState);

        CrashReporter.init(this);

        // Edge-to-edge: draw behind status/nav bars; the web app owns its own
        // padding and the theme makes the bars transparent.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        webView = new WebView(this);
        setContentView(webView);
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true); // localStorage: projects/presets persist
        s.setMediaPlaybackRequiresUserGesture(false); // generated audio must autoplay
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(false); // no file:// access needed by the app

        // Long-press policy: suppress the WebView context menu everywhere EXCEPT
        // inside editable text fields, where the user still needs selection
        // handles and the edit menu (paste etc.).
        // Choice: return true (consume) for non-editable content, false (let
        // WebView handle) for EDIT_TEXT_TYPE hits such as the script textarea.
        webView.setOnLongClickListener((View v) -> {
            WebView.HitTestResult hit = webView.getHitTestResult();
            return hit.getType() != WebView.HitTestResult.EDIT_TEXT_TYPE;
        });

        // Local-asset fallback loader. HONEST NOTE: the page itself loads from
        // the live HTTPS URL above, which is already a secure context — so
        // crypto.subtle (used by lipsync.js) works with no extra help. This
        // loader only serves https://appassets.androidplatform.net/assets/*
        // from the app's bundled assets/ dir, in a secure context, if the web
        // team ever ships a local-asset fallback. It does not proxy or replace
        // the live page load.
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view,
                                                              WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (SITE_HOST.equals(url.getHost())) {
                    return false; // in-app navigation stays in the WebView
                }
                // External links (docs, socials) open in the user's browser,
                // not trapped inside the app.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (Exception e) {
                    Log.w(TAG, "No handler for external URL: " + url, e);
                }
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // A renderer crash must not take down the whole app: reload the
                // page. Non-crash kills are left to the system (return false).
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !detail.didCrash()) {
                    return false;
                }
                Log.w(TAG, "Renderer crashed; reloading " + SITE_URL);
                CrashReporter.log("WebView renderer crashed; reloaded");
                view.post(() -> view.loadUrl(SITE_URL));
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                // Only the microphone is ever granted. Camera, location, MIDI,
                // protected media IDs, etc. are denied outright.
                boolean wantsMic = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        wantsMic = true;
                    }
                }
                if (!wantsMic) {
                    request.deny();
                    return;
                }
                runOnUiThread(() -> {
                    if (isFinishing()) {
                        request.deny();
                        return;
                    }
                    if (ContextCompat.checkSelfPermission(MainActivity.this,
                            Manifest.permission.RECORD_AUDIO)
                            == PackageManager.PERMISSION_GRANTED) {
                        // Session-scoped grant: evaluated fresh per request, no
                        // app-side caching of the decision. (The OS-level
                        // permission itself persists per system rules.)
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingPermissionRequest = request;
                        micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO);
                    }
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (request == pendingPermissionRequest) {
                    pendingPermissionRequest = null;
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                // musicFile / cloneFile / fileLoad inputs in the web app.
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accept = fileChooserParams.getAcceptTypes();
                String type = (accept.length > 0 && accept[0] != null && !accept[0].isEmpty())
                        ? accept[0] : "*/*";
                intent.setType(type);
                if (accept.length > 1) {
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, accept);
                }
                try {
                    fileChooserLauncher.launch(
                            Intent.createChooser(intent, getString(R.string.file_chooser_title)));
                } catch (Exception e) {
                    Log.w(TAG, "No file picker available", e);
                    fileChooserCallback = null;
                    filePathCallback.onReceiveValue(null);
                }
                return true;
            }
        });

        // Native bridge for save/share/keep-awake. The web team feature-detects
        // window.VoiceSyncBridge and calls it instead of the browser download
        // manager / Web Share API, which are unreliable in a WebView.
        webView.addJavascriptInterface(new VoiceSyncBridge(this), "VoiceSyncBridge");

        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        registerCallStateListener();

        if (savedInstanceState == null) {
            webView.loadUrl(SITE_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        // Take audio focus while visible so TTS/lipsync isn't ducked by
        // background apps; released in onPause().
        AudioFocusRequest req = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                .setOnAudioFocusChangeListener(focusListener)
                .build();
        audioFocusRequest = req;
        audioManager.requestAudioFocus(req);
    }

    @Override
    protected void onPause() {
        stopAllAudio();
        if (audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
            audioFocusRequest = null;
        }
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        unregisterCallStateListener();
        if (webView != null) {
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackPressMs < 2000) {
            super.onBackPressed();
            return;
        }
        lastBackPressMs = now;
        Toast.makeText(this, R.string.exit_double_tap, Toast.LENGTH_SHORT).show();
    }

    /** Ask the web app to stop every sound source it owns. */
    private void stopAllAudio() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.VoiceSyncApp && window.VoiceSyncApp.stopAll()", null);
        }
    }

    /**
     * Stop playback when a phone call starts ringing or is answered.
     *
     * <p>HONEST NOTE: no READ_PHONE_STATE permission is declared (deliberate,
     * to keep the permission footprint minimal), so on modern Android this
     * callback may not fire with precise state. It is a best-effort second
     * layer — the PRIMARY call-interruption path is audio-focus loss, because
     * the dialer takes transient audio focus when a call rings.</p>
     */
    @SuppressWarnings("deprecation")
    private void registerCallStateListener() {
        telephonyManager = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
        if (telephonyManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                CallStateCallback cb = new CallStateCallback();
                telephonyManager.registerTelephonyCallback(getMainExecutor(), cb);
                callListener = cb;
            } else {
                PhoneStateListener listener = new PhoneStateListener() {
                    @Override
                    public void onCallStateChanged(int state, String phoneNumber) {
                        if (state == TelephonyManager.CALL_STATE_RINGING
                                || state == TelephonyManager.CALL_STATE_OFFHOOK) {
                            stopAllAudio();
                        }
                    }
                };
                telephonyManager.listen(listener, PhoneStateListener.LISTEN_CALL_STATE);
                callListener = listener;
            }
        } catch (SecurityException e) {
            Log.i(TAG, "Call-state listener unavailable without READ_PHONE_STATE; "
                    + "audio-focus path remains active.");
        }
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private class CallStateCallback extends TelephonyCallback
            implements TelephonyCallback.CallStateListener {
        @Override
        public void onCallStateChanged(int state) {
            if (state == TelephonyManager.CALL_STATE_RINGING
                    || state == TelephonyManager.CALL_STATE_OFFHOOK) {
                stopAllAudio();
            }
        }
    }

    private void unregisterCallStateListener() {
        if (telephonyManager == null || callListener == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                telephonyManager.unregisterTelephonyCallback(
                        (TelephonyCallback) callListener);
            } else {
                //noinspection deprecation
                telephonyManager.listen((PhoneStateListener) callListener,
                        PhoneStateListener.LISTEN_NONE);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to unregister call listener", e);
        }
        callListener = null;
    }
}
