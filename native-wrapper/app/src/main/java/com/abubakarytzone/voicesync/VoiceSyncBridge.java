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

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * JavaScript bridge exposed to the VoiceSync Studio web app as
 * {@code window.VoiceSyncBridge}.
 *
 * <p>The web team implements the JS half: it feature-detects
 * {@code window.VoiceSyncBridge} and calls these methods instead of relying on
 * the browser download manager / Web Share API, which are unreliable inside a
 * WebView. All three methods are safe to call from any thread; UI work is
 * marshalled onto the main thread.</p>
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
