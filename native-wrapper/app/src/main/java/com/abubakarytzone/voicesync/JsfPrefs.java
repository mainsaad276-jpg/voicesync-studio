package com.abubakarytzone.voicesync;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

/**
 * Single home for the JSF Labs credentials (API key + Voice ID).
 *
 * <p>Values live in EncryptedSharedPreferences backed by a MasterKey with
 * AES256_GCM. The API key is read from encrypted storage only at call time —
 * it is never logged, never written to plain storage, and never returned to
 * the web layer (callers get booleans/JSON results, never the key).</p>
 */
public final class JsfPrefs {
    private static final String PREFS_FILE = "jsf_labs_prefs";
    private static final String KEY_API_KEY = "jsf_api_key";
    private static final String KEY_VOICE_ID = "jsf_voice_id";

    private JsfPrefs() {
        // No instances.
    }

    private static SharedPreferences open(Context context) throws Exception {
        MasterKey masterKey = new MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(
                context,
                PREFS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    /**
     * Returns the stored API key, or null when unset or when secure storage
     * is unavailable. The caller must never log or forward this value.
     */
    public static String getApiKey(Context context) {
        return get(context, KEY_API_KEY);
    }

    /** Returns the stored Voice ID, or null when unset/unreadable. */
    public static String getVoiceId(Context context) {
        return get(context, KEY_VOICE_ID);
    }

    private static String get(Context context, String key) {
        try {
            return open(context).getString(key, null);
        } catch (Exception e) {
            // Keystore unavailable (e.g. first run on a locked device):
            // callers treat this the same as "not configured".
            return null;
        }
    }

    /** Persists the API key and Voice ID. Throws if secure storage fails. */
    public static void save(Context context, String apiKey, String voiceId) throws Exception {
        open(context).edit()
                .putString(KEY_API_KEY, apiKey)
                .putString(KEY_VOICE_ID, voiceId)
                .apply();
    }

    /** Removes both stored values. Throws if secure storage fails. */
    public static void clear(Context context) throws Exception {
        open(context).edit()
                .remove(KEY_API_KEY)
                .remove(KEY_VOICE_ID)
                .apply();
    }
}
