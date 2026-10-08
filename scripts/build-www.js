// Copies the static site into www/ for the Capacitor Android build.
// The website itself needs no build step; this only feeds the app wrapper.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const include = ['index.html', 'css', 'js', 'assets', 'docs/VoiceSync-Studio-Terms-and-User-Guide.pdf'];

fs.rmSync(out, { recursive: true, force: true });
for (const rel of include) {
  const src = path.join(root, rel);
  if (!fs.existsSync(src)) { console.warn('skip (missing):', rel); continue; }
  const dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}
console.log('www/ ready:', fs.readdirSync(out).join(', '));
