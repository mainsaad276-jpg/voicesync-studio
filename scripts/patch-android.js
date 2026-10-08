// Applies VoiceSync settings to the CI-generated android/ project:
// extra permissions, stable signing key, version from the CI run number.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const manifest = path.join(root, 'android/app/src/main/AndroidManifest.xml');
const gradle = path.join(root, 'android/app/build.gradle');

let m = fs.readFileSync(manifest, 'utf8');
const perms = [
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS'
];
for (const p of perms) {
  if (!m.includes(p)) {
    m = m.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
  }
}
// Saving to Documents on Android 9 and older needs storage permission;
// Android 10 needs legacy storage mode. Newer phones need neither.
if (!m.includes('WRITE_EXTERNAL_STORAGE')) {
  m = m.replace('</manifest>', '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />\n</manifest>');
}
if (!m.includes('requestLegacyExternalStorage')) {
  m = m.replace('<application', '<application\n        android:requestLegacyExternalStorage="true"');
}
fs.writeFileSync(manifest, m);

let g = fs.readFileSync(gradle, 'utf8');
const build = process.env.GITHUB_RUN_NUMBER || '1';
g = g.replace(/versionCode \d+/, `versionCode ${build}`)
     .replace(/versionName "[^"]*"/, `versionName "1.0.${build}"`);
if (!g.includes('voicesync-debug.keystore')) {
  g = g.replace(/android\s*\{/, `android {
    signingConfigs {
        debug {
            storeFile file("../../android-config/voicesync-debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }`);
}
fs.writeFileSync(gradle, g);
console.log('android/ patched: permissions, signing, version 1.0.' + build);
