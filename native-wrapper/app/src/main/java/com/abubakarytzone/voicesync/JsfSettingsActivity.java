package com.abubakarytzone.voicesync;

import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.text.method.PasswordTransformationMethod;
import android.util.TypedValue;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Native settings screen for the JSF Labs TTS integration.
 *
 * <p>Two fields — "JSF Labs API key" (password input) and "Voice ID" (plain
 * text) — plus Save and Clear buttons. Values are stored via
 * {@link JsfPrefs} in EncryptedSharedPreferences (AES256_GCM). The API key is
 * never logged and never echoed back: the key field is always blank on entry
 * (its hint only says whether a key is already stored), and the status line
 * confirms save/clear without repeating either value.</p>
 *
 * <p>Opened from the web app through
 * {@code VoiceSyncBridge.openJsfSettings()}; declared exported=false in the
 * manifest.</p>
 */
public class JsfSettingsActivity extends AppCompatActivity {

    private EditText apiKeyInput;
    private EditText voiceIdInput;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.Theme_VoiceSync);
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("JSF Labs Settings");
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTextColor(Color.BLACK);
        root.addView(title, lp());

        TextView keyLabel = new TextView(this);
        keyLabel.setText("JSF Labs API key");
        root.addView(keyLabel, lpTop(dp(16)));

        apiKeyInput = new EditText(this);
        apiKeyInput.setInputType(InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        apiKeyInput.setTransformationMethod(PasswordTransformationMethod.getInstance());
        root.addView(apiKeyInput, lp());

        TextView voiceLabel = new TextView(this);
        voiceLabel.setText("Voice ID");
        root.addView(voiceLabel, lpTop(dp(12)));

        voiceIdInput = new EditText(this);
        voiceIdInput.setInputType(InputType.TYPE_CLASS_TEXT);
        root.addView(voiceIdInput, lp());

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setWeightSum(2f);
        root.addView(buttons, lpTop(dp(20)));

        Button saveBtn = new Button(this);
        saveBtn.setText("Save");
        buttons.addView(saveBtn, weighted());

        Button clearBtn = new Button(this);
        clearBtn.setText("Clear");
        buttons.addView(clearBtn, weighted());

        statusText = new TextView(this);
        statusText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        root.addView(statusText, lpTop(dp(16)));

        // Prefill only the Voice ID (safe to display). The key field stays
        // blank: if a key is stored we say so in the hint, nothing more.
        String savedVoice = JsfPrefs.getVoiceId(this);
        if (savedVoice != null && !savedVoice.isEmpty()) {
            voiceIdInput.setText(savedVoice);
        }
        String savedKey = JsfPrefs.getApiKey(this);
        apiKeyInput.setHint((savedKey != null && !savedKey.isEmpty())
                ? "API key is saved — enter a new one to replace it"
                : "Paste your JSF Labs API key");

        saveBtn.setOnClickListener(v -> onSave());
        clearBtn.setOnClickListener(v -> onClear());

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);
    }

    private void onSave() {
        String key = apiKeyInput.getText().toString().trim();
        String voiceId = voiceIdInput.getText().toString().trim();
        if (key.isEmpty() || voiceId.isEmpty()) {
            setStatus("Please enter both the API key and the Voice ID.", false);
            return;
        }
        try {
            JsfPrefs.save(this, key, voiceId);
            apiKeyInput.setText("");
            apiKeyInput.setHint("API key is saved — enter a new one to replace it");
            setStatus("Saved.", true);
        } catch (Exception e) {
            setStatus("Save failed: secure storage is unavailable.", false);
        }
    }

    private void onClear() {
        try {
            JsfPrefs.clear(this);
        } catch (Exception e) {
            setStatus("Clear failed: secure storage is unavailable.", false);
            return;
        }
        apiKeyInput.setText("");
        voiceIdInput.setText("");
        apiKeyInput.setHint("Paste your JSF Labs API key");
        setStatus("Cleared.", true);
    }

    /** Status line only — never includes the key or voice ID values. */
    private void setStatus(String message, boolean ok) {
        statusText.setText(message);
        statusText.setTextColor(ok ? Color.parseColor("#1B7A3D") : Color.parseColor("#B00020"));
    }

    private int dp(int value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    private static LinearLayout.LayoutParams lp() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private static LinearLayout.LayoutParams lpTop(int pxMargin) {
        LinearLayout.LayoutParams params = lp();
        params.topMargin = pxMargin;
        return params;
    }

    private static LinearLayout.LayoutParams weighted() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        return params;
    }
}
