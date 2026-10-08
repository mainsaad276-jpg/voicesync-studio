# Play Store release signing (one-time setup)

The APK on the `android-latest` release is a **test build** (debug key). It is
fine for sharing with friends. Google Play needs a **release-signed AAB**.
GitHub builds it automatically once these 4 secrets exist. The key never goes
into the repo.

## 1. Create your release key (on your PC, once)

You need Java's `keytool` (it comes with Android Studio, or install "Temurin JDK 17").
Open PowerShell and run:

```
keytool -genkeypair -v -keystore voicesync-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias voicesync
```

Choose a strong password and answer the name questions.

**Back up `voicesync-release.jks` and the password in two safe places**
(e.g. Google Drive + USB). If you lose them you can never update the app on Play.

## 2. Turn the key into text

```
[Convert]::ToBase64String([IO.File]::ReadAllBytes("voicesync-release.jks")) | Set-Clipboard
```

The long text is now copied.

## 3. Add 4 secrets on GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | paste the long text from step 2 |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `voicesync` |
| `ANDROID_KEY_PASSWORD` | the key password (same as above if you pressed Enter) |

## 4. Build

Repo → **Actions → Build Android APK → Run workflow** (or push any change to `main`).
The `android-latest` release then also contains **VoiceSync-Studio-PlayStore.aab**,
signed with your key and not debuggable. Upload that file in Google Play Console.

## Play Console checklist

- App id: `pk.voicesync.studio` (cannot change after first upload).
- Privacy policy URL: `https://mainsaad276-jpg.github.io/voicesync-studio/docs/privacy.html`
- Data safety form: no data collected by the developer; text is sent to third-party
  speech services when the user generates a voice (see the privacy policy).
- Microphone: used only for "Record My Voice" and "Voice to Text".
- Google Play App Signing: accept it; your key above becomes the "upload key".
