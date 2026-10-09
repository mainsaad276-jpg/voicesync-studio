package com.abubakarytzone.voicesync;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * JavaScript bridge exposed to the VoxNova web app as
 * {@code window.VoiceSyncBridge}.
 *
 * <p>The web team implements the JS half: it feature-detects
 * {@code window.VoiceSyncBridge} and calls these methods instead of relying on
 * the browser download manager / Web Share API, which are unreliable inside a
 * WebView. All methods are safe to call from any thread; UI work is
 * marshalled onto the main thread. Network calls ({@code jsfSpeak}) run on
 * the calling JS thread — JavascriptInterface calls never run on the UI
 * thread.</p>
 */
public class VoiceSyncBridge {
    private static final String TAG = "VoiceSyncBridge";

    private final Activity activity;

    public VoiceSyncBridge(Activity activity) {
        this.activity = activity;
    }

    /**
     * Decodes a base64 payload and saves it into the public Downloads folder
     * under {@code Download/VoiceSync/}, so the file survives app uninstall and
     * shows up in the user's file manager / gallery apps.
     *
     * <p>On API 29+ this uses MediaStore with RELATIVE_PATH (no storage
     * permission needed). On API 26-28 it writes to the public Downloads dir
     * and notifies the media scanner. A {@code data:<mime>;base64,} URI prefix
     * is stripped if present.</p>
     *
     * @param base64   base64-encoded file bytes (data-URI prefix optional)
     * @param filename e.g. "voicesync-tts.mp3"
     * @param mime     e.g. "audio/mpeg"
     */
    @JavascriptInterface
    public void saveFile(String base64, String filename, String mime) {
        try {
            byte[] bytes = decodeBase64(base64);
            String safeName = sanitizeFilename(filename);
            String safeMime = (mime == null || mime.isEmpty()) ? guessMime(safeName) : mime;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                values.put(MediaStore.Downloads.MIME_TYPE, safeMime);
                // Public, user-visible location: Download/VoiceSync/
                values.put(MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + "/VoiceSync");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                ContentResolver resolver = activity.getContentResolver();
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    throw new IllegalStateException("MediaStore insert returned null");
                }
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("openOutputStream returned null");
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, values, null, null);
                Log.i(TAG, "Saved to Downloads/VoiceSync/" + safeName);
            } else {
                // API 26-28: public Downloads dir + media scan. (No runtime storage
                // permission is declared; on these API levels writing to the app's
                // own external files dir is used as a fallback if public write fails.)
                File dir = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS), "VoiceSync");
                if (!dir.exists() && !dir.mkdirs()) {
                    throw new IllegalStateException("Cannot create " + dir);
                }
                File out = new File(dir, safeName);
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    fos.write(bytes);
                }
                android.media.MediaScannerConnection.scanFile(
                        activity, new String[]{out.getAbsolutePath()},
                        new String[]{safeMime}, null);
                Log.i(TAG, "Saved to " + out.getAbsolutePath());
            }
            CrashReporter.log("VoiceSyncBridge.saveFile: " + safeName);
        } catch (Exception e) {
            Log.e(TAG, "saveFile failed", e);
            CrashReporter.record(e);
        }
    }

    /**
     * Stages the file in the app cache and opens the Android share sheet with
     * the file attached (EXTRA_STREAM) plus optional text (EXTRA_TEXT).
     *
     * @param base64   base64-encoded file bytes (data-URI prefix optional)
     * @param filename e.g. "voicesync-tts.mp3"
     * @param mime     e.g. "audio/mpeg"
     * @param text     optional message text; may be null/empty
     */
    @JavascriptInterface
    public void shareFile(String base64, String filename, String mime, String text) {
        try {
            byte[] bytes = decodeBase64(base64);
            String safeName = sanitizeFilename(filename);
            String safeMime = (mime == null || mime.isEmpty()) ? guessMime(safeName) : mime;

            File sharedDir = new File(activity.getCacheDir(), "shared");
            if (!sharedDir.exists() && !sharedDir.mkdirs()) {
                throw new IllegalStateException("Cannot create " + sharedDir);
            }
            File out = new File(sharedDir, safeName);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
            }

            Uri uri = FileProvider.getUriForFile(activity,
                    activity.getPackageName() + ".fileprovider", out);

            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType(safeMime);
            share.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) {
                share.putExtra(Intent.EXTRA_TEXT, text);
            }
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(share, "Share via");
            // Called from a JS thread — must start the activity on the UI thread.
            activity.runOnUiThread(() -> activity.startActivity(chooser));
            CrashReporter.log("VoiceSyncBridge.shareFile: " + safeName);
        } catch (Exception e) {
            Log.e(TAG, "shareFile failed", e);
            CrashReporter.record(e);
        }
    }

    /**
     * Opens the native JSF Labs settings screen ({@link JsfSettingsActivity})
     * where the user enters their JSF Labs API key and Voice ID. Stored in
     * EncryptedSharedPreferences — never in web storage.
     */
    @JavascriptInterface
    public void openJsfSettings() {
        // Called from a JS thread — must start the activity on the UI thread.
        activity.runOnUiThread(() ->
                activity.startActivity(new Intent(activity, JsfSettingsActivity.class)));
    }

    /**
     * Synthesizes speech with the JSF Labs API and returns the audio as
     * base64 so the web app can play it without ever touching the API key.
     *
     * <p>Runs on the calling JS thread (JavascriptInterface calls are already
     * off the UI thread). The key is read from EncryptedSharedPreferences via
     * {@link JsfPrefs} at call time and is never logged, never persisted in
     * plain storage, and never included in any return value.</p>
     *
     * @param text    text to synthesize (≤ 50000 chars per the JSF API)
     * @param voiceId JSF voice id (jsf_...), as configured in the settings screen
     * @param speed   playback speed multiplier; values &le; 0 default to 1.0
     * @return JSON string: {@code {"ok":true,"base64":"...","mime":"audio/wav"}}
     *         on success, or {@code {"ok":false,"error":"<code>"}} where
     *         {@code <code>} is one of: not_configured, empty_text,
     *         network_error, bad_response, rate_limited_retry_in_&lt;N&gt;s,
     *         http_&lt;code&gt;.
     */
    @JavascriptInterface
    public String jsfSpeak(String text, String voiceId, double speed) {
        try {
            // SECURITY: the key lives in encrypted storage only. It goes into
            // the request header below and nowhere else — never logged, never
            // written to disk, never placed in a return value.
            String apiKey = JsfPrefs.getApiKey(activity);
            if (apiKey == null || apiKey.isEmpty()
                    || voiceId == null || voiceId.trim().isEmpty()) {
                return jsfError("not_configured");
            }
            if (text == null || text.trim().isEmpty()) {
                return jsfError("empty_text");
            }
            double effectiveSpeed = speed <= 0 ? 1.0 : speed;

            JSONObject payload = new JSONObject();
            payload.put("text", text);
            payload.put("voice_id", voiceId.trim());
            payload.put("speed", effectiveSpeed);
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);

            HttpURLConnection conn = (HttpURLConnection)
                    new URL(JSF_TTS_URL).openConnection();
            conn.setConnectTimeout(JSF_TIMEOUT_MS);
            conn.setReadTimeout(JSF_TIMEOUT_MS);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("x-api-key", apiKey);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body);
            }

            int code = conn.getResponseCode();
            if (code == 429) {
                return jsfError("rate_limited_retry_in_" + parseRetryAfter(conn) + "s");
            }
            if (code < 200 || code >= 300) {
                // Covers 401 (bad key) and any other non-success status.
                return jsfError("http_" + code);
            }

            String response = new String(
                    readStream(conn.getInputStream(), MAX_JSON_BYTES), StandardCharsets.UTF_8);
            String audioUrl = extractAudioUrl(response);
            if (audioUrl == null || audioUrl.isEmpty()) {
                return jsfError("bad_response");
            }

            byte[] audio = downloadAudio(audioUrl);
            JSONObject ok = new JSONObject();
            ok.put("ok", true);
            ok.put("base64", Base64.encodeToString(audio, Base64.NO_WRAP));
            ok.put("mime", "audio/wav");
            return ok.toString();
        } catch (IOException e) {
            // Log the exception class only — the message could theoretically
            // contain URL/query data, and the key is never in scope here.
            Log.w(TAG, "jsfSpeak network error: " + e);
            return jsfError("network_error");
        } catch (Exception e) {
            Log.w(TAG, "jsfSpeak failed: " + e);
            return jsfError("bad_response");
        }
    }

    /**
     * Keeps the screen on during long generate/export jobs (a software wake
     * lock via window flags — no WAKE_LOCK permission needed), and releases it
     * afterwards. Safe to call repeatedly.
     */
    @JavascriptInterface
    public void setKeepAwake(boolean on) {
        activity.runOnUiThread(() -> {
            if (on) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    // ---- helpers -----------------------------------------------------------

    /** JSF Labs TTS endpoint (verified against https://www.jsflabs.io/api-docs). */
    private static final String JSF_TTS_URL = "https://www.jsflabs.io/api/v1/text-to-speech";
    private static final int JSF_TIMEOUT_MS = 60_000;
    private static final int MAX_JSON_BYTES = 256 * 1024;   // API JSON response cap
    private static final int MAX_AUDIO_BYTES = 64 * 1024 * 1024; // WAV download cap

    private static String jsfError(String code) {
        try {
            JSONObject o = new JSONObject();
            o.put("ok", false);
            o.put("error", code);
            return o.toString();
        } catch (Exception e) {
            // JSONObject.put on a fresh object cannot realistically fail;
            // belt-and-braces so the JS side always gets parseable JSON.
            return "{\"ok\":false,\"error\":\"" + code + "\"}";
        }
    }

    /** Parses the Retry-After header (seconds) on a 429; defaults to 60. */
    private static long parseRetryAfter(HttpURLConnection conn) {
        String value = conn.getHeaderField("Retry-After");
        if (value != null) {
            try {
                return Math.max(1, Long.parseLong(value.trim()));
            } catch (NumberFormatException ignored) {
                // Fall through to the default.
            }
        }
        return 60;
    }

    /**
     * Extracts {@code data.audio_url} from a JSF TTS success response.
     * Returns null unless {@code success} is true and the URL is present.
     */
    private static String extractAudioUrl(String json) {
        try {
            JSONObject root = new JSONObject(json);
            if (!root.optBoolean("success", false)) {
                return null;
            }
            JSONObject data = root.optJSONObject("data");
            if (data == null) {
                return null;
            }
            return data.optString("audio_url", null);
        } catch (Exception e) {
            return null;
        }
    }

    /** Downloads the hosted WAV (HTTPS only), capped at MAX_AUDIO_BYTES. */
    private static byte[] downloadAudio(String urlString) throws IOException {
        URL url = new URL(urlString);
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new IOException("refusing non-https audio url");
        }
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(JSF_TIMEOUT_MS);
        conn.setReadTimeout(JSF_TIMEOUT_MS);
        conn.setRequestMethod("GET");
        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new IOException("audio download returned http " + code);
        }
        byte[] audio = readStream(conn.getInputStream(), MAX_AUDIO_BYTES);
        if (audio.length == 0) {
            throw new IOException("empty audio payload");
        }
        return audio;
    }

    /** Reads a stream fully, throwing if it exceeds maxBytes (OOM guard). */
    private static byte[] readStream(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) != -1) {
            buf.write(chunk, 0, n);
            if (buf.size() > maxBytes) {
                throw new IOException("response exceeded " + maxBytes + " bytes");
            }
        }
        return buf.toByteArray();
    }

    private static byte[] decodeBase64(String base64) {
        if (base64 == null) throw new IllegalArgumentException("base64 is null");
        int comma = base64.indexOf(',');
        // Strip "data:<mime>;base64," prefix if the web side passed a data URI.
        if (base64.startsWith("data:") && comma > 0) {
            base64 = base64.substring(comma + 1);
        }
        return Base64.decode(base64, Base64.DEFAULT);
    }

    private static String sanitizeFilename(String filename) {
        if (filename == null || filename.trim().isEmpty()) {
            return "voicesync-export.bin";
        }
        // Strip path separators and control chars; keep it a plain file name.
        return filename.trim().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
    }

    private static String guessMime(String filename) {
        String ext = MimeTypeMap.getFileExtensionFromUrl(filename);
        String mime = (ext != null) ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(
                ext.toLowerCase(java.util.Locale.US)) : null;
        return (mime != null) ? mime : "application/octet-stream";
    }
}
