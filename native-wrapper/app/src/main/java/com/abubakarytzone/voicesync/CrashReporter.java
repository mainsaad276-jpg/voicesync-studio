package com.abubakarytzone.voicesync;

import android.content.Context;
import android.util.Log;

import com.google.firebase.FirebaseApp;
import com.google.firebase.crashlytics.FirebaseCrashlytics;

/**
 * Thin wrapper around Firebase Crashlytics.
 *
 * <p>HONEST STATUS: the firebase-crashlytics SDK is on the classpath, but this
 * build has NO google-services.json (boss-side asset: the Play Console /
 * Firebase project is not set up yet) and the google-services Gradle plugin is
 * deliberately not applied. Without project credentials FirebaseApp cannot
 * auto-initialize, so {@link #init(Context)} probes explicitly and every method
 * below becomes a silent no-op when reporting is unavailable. The app works
 * identically either way — no crash, no network call, no-op breadcrumbs.</p>
 *
 * <p>To enable for real: add the Firebase Android app, drop google-services.json
 * into app/, apply the google-services plugin, and this class will light up
 * with zero code changes.</p>
 */
public final class CrashReporter {
    private static final String TAG = "CrashReporter";
    private static volatile boolean enabled = false;

    private CrashReporter() {}

    /** Probe for a configured FirebaseApp; stays disabled if none exists. */
    public static void init(Context context) {
        try {
            FirebaseApp app = FirebaseApp.initializeApp(context);
            if (app == null) {
                // getInstance() throws when no default app exists; try it so we
                // know for sure before claiming to be enabled.
                app = FirebaseApp.getInstance();
            }
            FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(true);
            enabled = true;
            Log.i(TAG, "Crashlytics enabled");
        } catch (Throwable t) {
            // Expected path until google-services.json exists.
            enabled = false;
            Log.i(TAG, "Crashlytics unavailable (no google-services.json); continuing without crash reporting.");
        }
    }

    public static boolean isEnabled() {
        return enabled;
    }

    /** Breadcrumb log — no-op unless Crashlytics initialized. */
    public static void log(String message) {
        if (!enabled) return;
        try {
            FirebaseCrashlytics.getInstance().log(message);
        } catch (Throwable ignored) {
            // Reporting must never break the app.
        }
    }

    /** Non-fatal report — no-op unless Crashlytics initialized. */
    public static void record(Throwable throwable) {
        if (!enabled || throwable == null) return;
        try {
            FirebaseCrashlytics.getInstance().recordException(throwable);
        } catch (Throwable ignored) {
            // Reporting must never break the app.
        }
    }
}
