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
// App-only: Capacitor runtime so native plugins are reachable without a bundler.
const capJs = path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js');
if (fs.existsSync(capJs)) {
  fs.copyFileSync(capJs, path.join(out, 'js/capacitor.js'));
  const idx = path.join(out, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  const tag = '<script src="js/native.js"></script>';
  if (!html.includes(tag)) throw new Error('native.js tag missing from index.html');
  html = html.replace(tag, '<script src="js/capacitor.js"></script>\n  ' + tag);
  fs.writeFileSync(idx, html);
} else {
  throw new Error('Run npm install first: @capacitor/core not found');
}
console.log('www/ ready:', fs.readdirSync(out).join(', '));
