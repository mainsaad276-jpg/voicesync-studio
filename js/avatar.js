/* VoxNova — js/avatar.js (Kamran: Avatar & Animation Developer)
 *
 * ORIGINAL character art (designed for this project, no copied assets):
 * "Presenter" — a friendly news-presenter style head-and-shoulders character.
 *
 * Contract (SPEC.md):
 *   Avatar.mount(el)            — builds the SVG character inside el
 *   Avatar.setViseme('A'..'X')  — swap mouth shape immediately (60fps-safe)
 *   Avatar.speak(cues, audioEl) — drive mouth from cue timeline during playback
 *   Avatar.stop()               — stop speech animation, mouth back to rest
 *   Avatar.getCanvas()          — live canvas rendering the character (video export)
 *   Avatar.setMood('happy'|'neutral')
 *
 * The viseme -> SVG-path map is factored as the pure object VISEME_PATHS so it
 * can be unit-tested in node without a DOM.
 */
(function () {
'use strict';

/* ------------------------------------------------------------------ */
/* 1. Pure viseme -> mouth-path map (9 entries, pairwise distinct).     */
/*    Mouth-local coords: mouth centered at (0,0), x in [-31, 31].      */
/* ------------------------------------------------------------------ */
var VISEME_PATHS = {
  // A — wide open "ah" (jaw dropped)
  A: 'M -27 -8 Q 0 -13 27 -8 Q 25 20 0 27 Q -25 20 -27 -8 Z',
  // B — pressed lips "m / b / p"
  B: 'M -23 -1 Q 0 2 23 -1 L 23 5 Q 0 8 -23 5 Z',
  // C — wide grin "ee / s" (teeth bared)
  C: 'M -31 -7 Q 0 -11 31 -7 L 31 3 Q 0 11 -31 3 Z',
  // D — medium open "eh"
  D: 'M -22 -5 Q 0 -9 22 -5 Q 20 13 0 17 Q -20 13 -22 -5 Z',
  // E — round "oh"
  E: 'M -13 -4 A 13 14 0 1 0 13 -4 A 13 14 0 1 0 -13 -4 Z',
  // F — upper teeth on lower lip "f / v"
  F: 'M -26 -10 L 26 -10 L 21 4 Q 0 10 -21 4 Z',
  // G — open with tongue visible "th / l"
  G: 'M -19 -6 Q 0 -10 19 -6 Q 17 8 0 11 Q -17 8 -19 -6 Z ' +
     'M -9 3 Q 0 0 9 3 L 7 20 Q 0 23 -7 20 Z',
  // H — tight small "oo" (more puckered than E)
  H: 'M -9 -3 A 9 10 0 1 0 9 -3 A 9 10 0 1 0 -9 -3 Z',
  // X — rest: gentle closed smile
  X: 'M -24 1 Q 0 7 24 1 Q 0 11 -24 1 Z'
};

// Rest-mouth smile used when mood is 'happy'.
var HAPPY_REST = 'M -27 -1 Q 0 11 27 -1 Q 0 15 -27 -1 Z';

// Fill / stroke per viseme (presentation only; not part of the asserted map).
var VISEME_STYLE = {
  A: { fill: '#7c2d2d', stroke: '#4a1f1f' },
  B: { fill: '#8a4a4a', stroke: '#4a1f1f' },
  C: { fill: '#ffffff', stroke: '#4a1f1f' },
  D: { fill: '#7c2d2d', stroke: '#4a1f1f' },
  E: { fill: '#7c2d2d', stroke: '#4a1f1f' },
  F: { fill: '#ffffff', stroke: '#4a1f1f' },
  G: { fill: '#a15c4a', stroke: '#4a1f1f' },
  H: { fill: '#7c2d2d', stroke: '#4a1f1f' },
  X: { fill: '#6e3a3a', stroke: '#4a1f1f' }
};

var VISEMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];

function isValidViseme(v) {
  return VISEMES.indexOf(v) !== -1;
}

/* ------------------------------------------------------------------ */
/* 2. Internal state                                                    */
/* ------------------------------------------------------------------ */
var SVGNS = 'http://www.w3.org/2000/svg';

var state = {
  mounted: false,
  el: null,
  svg: null,
  headG: null,      // bobbing group
  mouth: null,      // <path> for the mouth
  eyesOpen: [],     // open-eye <g> elements
  eyesClosed: [],   // closed-eye <path> elements
  brows: [],        // eyebrow <path> elements
  viseme: 'X',
  mood: 'neutral',
  blink: false,
  blinkTimer: null,
  speaking: false,
  cues: [],
  cueIdx: 0,
  t0: 0,            // performance.now() base for cue timeline
  audio: null,
  bobPhase: 0,
  raf: 0,
  canvas: null,     // live canvas for getCanvas()
  onAudioEnd: null
};

function hasRAF() {
  return typeof requestAnimationFrame !== 'undefined';
}

function mouthD() {
  if (state.viseme === 'X' && state.mood === 'happy') return HAPPY_REST;
  return VISEME_PATHS[state.viseme];
}

function mouthStyle() {
  return VISEME_STYLE[state.viseme] || VISEME_STYLE.X;
}

/* ------------------------------------------------------------------ */
/* 3. SVG construction (original character art)                         */
/* ------------------------------------------------------------------ */
function svgEl(tag, attrs, parent) {
  var n = document.createElementNS(SVGNS, tag);
  for (var k in attrs) {
    if (Object.prototype.hasOwnProperty.call(attrs, k)) {
      n.setAttribute(k, attrs[k]);
    }
  }
  if (parent) parent.appendChild(n);
  return n;
}

function buildSVG() {
  var svg = svgEl('svg', {
    viewBox: '0 0 320 360',
    width: '100%',
    height: '100%',
    role: 'img',
    'aria-label': 'VoiceSync presenter character'
  });

  // Backdrop
  svgEl('circle', { cx: 160, cy: 180, r: 148, fill: '#e9f5f2' }, svg);
  svgEl('circle', { cx: 160, cy: 180, r: 148, fill: 'none', stroke: '#cfe8e2', 'stroke-width': 3 }, svg);

  // Neck + shirt + blazer (shoulders)
  svgEl('rect', { x: 146, y: 216, width: 28, height: 48, rx: 8, fill: '#d99a72' }, svg);
  svgEl('path', { d: 'M 138 262 L 182 262 L 190 360 L 130 360 Z', fill: '#f5f2ea' }, svg);
  svgEl('path', { d: 'M 52 360 C 56 300 92 274 128 264 L 150 258 L 150 360 Z', fill: '#14706b' }, svg);
  svgEl('path', { d: 'M 268 360 C 264 300 228 274 192 264 L 170 258 L 170 360 Z', fill: '#14706b' }, svg);
  svgEl('path', { d: 'M 150 258 L 170 258 L 160 292 Z', fill: '#e4ded2' }, svg); // shirt V

  // ---- Head group (bobs during speech) ----
  var head = svgEl('g', { id: 'vs-head' }, svg);
  state.headG = head;

  // Ears
  svgEl('circle', { cx: 88, cy: 168, r: 13, fill: '#eab98d' }, head);
  svgEl('circle', { cx: 232, cy: 168, r: 13, fill: '#eab98d' }, head);

  // Face
  svgEl('ellipse', { cx: 160, cy: 160, rx: 72, ry: 82, fill: '#eab98d' }, head);

  // Hair — original swept-fringe cap
  svgEl('path', {
    d: 'M 84 168 C 80 88 110 58 160 58 C 210 58 240 88 236 168 L 222 168 ' +
       'C 224 140 218 118 206 108 C 196 128 188 104 160 102 ' +
       'C 132 104 124 128 114 108 C 102 118 96 140 98 168 Z',
    fill: '#3a2a22'
  }, head);

  // Eyebrows
  state.brows = [
    svgEl('path', { d: 'M 112 132 Q 132 124 152 131', fill: 'none', stroke: '#3a2a22', 'stroke-width': 6, 'stroke-linecap': 'round' }, head),
    svgEl('path', { d: 'M 168 131 Q 188 124 208 132', fill: 'none', stroke: '#3a2a22', 'stroke-width': 6, 'stroke-linecap': 'round' }, head)
  ];

  // Eyes (open + closed variants for blinking)
  var eyeX = [132, 188];
  state.eyesOpen = [];
  state.eyesClosed = [];
  for (var i = 0; i < 2; i++) {
    var g = svgEl('g', {}, head);
    svgEl('ellipse', { cx: eyeX[i], cy: 160, rx: 14, ry: 16, fill: '#ffffff' }, g);
    svgEl('circle', { cx: eyeX[i], cy: 162, r: 6.5, fill: '#2b211c' }, g);
    svgEl('circle', { cx: eyeX[i] - 2, cy: 159, r: 2, fill: '#ffffff' }, g);
    state.eyesOpen.push(g);
    var closed = svgEl('path', {
      d: 'M ' + (eyeX[i] - 14) + ' 160 Q ' + eyeX[i] + ' 167 ' + (eyeX[i] + 14) + ' 160',
      fill: 'none', stroke: '#2b211c', 'stroke-width': 5, 'stroke-linecap': 'round',
      display: 'none'
    }, head);
    state.eyesClosed.push(closed);
  }

  // Nose
  svgEl('path', { d: 'M 160 178 Q 157 196 165 199', fill: 'none', stroke: '#b97f56', 'stroke-width': 5, 'stroke-linecap': 'round' }, head);

  // Cheeks
  svgEl('circle', { cx: 114, cy: 204, r: 10, fill: '#e88a7a', opacity: 0.45 }, head);
  svgEl('circle', { cx: 206, cy: 204, r: 10, fill: '#e88a7a', opacity: 0.45 }, head);

  // Mouth (driven by visemes)
  var mg = svgEl('g', { transform: 'translate(160 224)' }, head);
  var st = mouthStyle();
  state.mouth = svgEl('path', {
    d: mouthD(),
    fill: st.fill,
    stroke: st.stroke,
    'stroke-width': 3,
    'stroke-linejoin': 'round'
  }, mg);

  return svg;
}

/* ------------------------------------------------------------------ */
/* 4. Blink + master animation loop                                     */
/* ------------------------------------------------------------------ */
function setBlink(on) {
  state.blink = on;
  for (var i = 0; i < state.eyesOpen.length; i++) {
    state.eyesOpen[i].setAttribute('display', on ? 'none' : 'inline');
    state.eyesClosed[i].setAttribute('display', on ? 'inline' : 'none');
  }
}

function scheduleBlink() {
  if (state.blinkTimer) clearTimeout(state.blinkTimer);
  // Blink every 3–5 seconds (SPEC.md), lid shut ~150ms.
  state.blinkTimer = setTimeout(function () {
    if (!state.mounted) return;
    setBlink(true);
    setTimeout(function () {
      if (!state.mounted) return;
      setBlink(false);
      scheduleBlink();
    }, 150);
  }, 3000 + Math.random() * 2000);
}

function advanceCues(t) {
  var cues = state.cues;
  while (state.cueIdx + 1 < cues.length && cues[state.cueIdx + 1].start <= t) {
    state.cueIdx++;
  }
  var c = cues[state.cueIdx];
  var v = (c && t >= c.start && t < c.end && isValidViseme(c.viseme)) ? c.viseme : 'X';
  if (v !== state.viseme) Avatar.setViseme(v);
}

function frame(now) {
  if (!state.mounted) return;
  state.raf = 0; // this tick consumed; re-armed below only while speaking
  if (state.speaking) {
    var t = (now - state.t0) / 1000;
    if (state.audio && state.audio.ended) {
      Avatar.stop();
      return;
    }
    if (cueStreamEnded(t)) {
      Avatar.stop();
      return;
    }
    state.bobPhase += 0.12;
    advanceCues(t);
  }
  paintFrame();
  if (state.speaking && hasRAF()) state.raf = requestAnimationFrame(frame);
}

/* M35: the rAF loop runs ONLY while speaking. startLoop/cancelLoop manage the
 * handle; speak() starts it (double-start safe), stop() cancels it, and the
 * loop self-terminates when the audio utterance ends or the cue stream runs
 * out — so idle tabs never pay 60fps full-canvas repaints. */
function paintFrame() {
  var bobY = state.speaking ? Math.sin(state.bobPhase) * 4 : 0;
  var bobR = state.speaking ? Math.sin(state.bobPhase * 0.7) * 1.6 : 0;
  if (state.headG) {
    state.headG.setAttribute(
      'transform',
      'translate(0 ' + bobY.toFixed(2) + ') rotate(' + bobR.toFixed(2) + ' 160 160)'
    );
  }
  if (state.canvas) {
    drawAvatarCanvas(state.canvas.getContext('2d'), state.canvas.width, state.canvas.height);
  }
}

function startLoop() {
  if (!hasRAF() || state.raf || !state.mounted) return; // guard against double-start
  state.raf = requestAnimationFrame(frame);
}

function cancelLoop() {
  if (hasRAF() && state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
}

function cueStreamEnded(t) {
  var cues = state.cues;
  if (!cues || !cues.length) return false;
  return t > cues[cues.length - 1].end;
}

/* ------------------------------------------------------------------ */
/* 5. Canvas renderer — mirrors the SVG art for video export            */
/* ------------------------------------------------------------------ */
function drawAvatarCanvas(ctx, W, H) {
  var s = W / 320; // uniform scale from the 320x360 design space
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.scale(s, s);
  ctx.translate(0, (H / s - 360) / 2); // vertically center if canvas isn't 320x360 ratio

  var bobY = state.speaking ? Math.sin(state.bobPhase) * 4 : 0;
  var bobR = state.speaking ? Math.sin(state.bobPhase * 0.7) * 1.6 : 0;

  // Backdrop
  ctx.fillStyle = '#e9f5f2';
  ctx.beginPath(); ctx.arc(160, 180, 148, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#cfe8e2'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(160, 180, 148, 0, Math.PI * 2); ctx.stroke();

  // Neck / shirt / blazer
  ctx.fillStyle = '#d99a72';
  roundRect(ctx, 146, 216, 28, 48, 8); ctx.fill();
  ctx.fillStyle = '#f5f2ea';
  ctx.beginPath();
  ctx.moveTo(138, 262); ctx.lineTo(182, 262); ctx.lineTo(190, 360); ctx.lineTo(130, 360); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#14706b';
  ctx.beginPath();
  ctx.moveTo(52, 360); ctx.bezierCurveTo(56, 300, 92, 274, 128, 264);
  ctx.lineTo(150, 258); ctx.lineTo(150, 360); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(268, 360); ctx.bezierCurveTo(264, 300, 228, 274, 192, 264);
  ctx.lineTo(170, 258); ctx.lineTo(170, 360); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e4ded2';
  ctx.beginPath(); ctx.moveTo(150, 258); ctx.lineTo(170, 258); ctx.lineTo(160, 292); ctx.closePath(); ctx.fill();

  // Head (with bob)
  ctx.save();
  ctx.translate(160, 160 + bobY);
  ctx.rotate(bobR * Math.PI / 180);
  ctx.translate(-160, -160);

  ctx.fillStyle = '#eab98d';
  ctx.beginPath(); ctx.arc(88, 168, 13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(232, 168, 13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(160, 160, 72, 82, 0, 0, Math.PI * 2); ctx.fill();

  // Hair
  ctx.fillStyle = '#3a2a22';
  ctx.beginPath();
  ctx.moveTo(84, 168);
  ctx.bezierCurveTo(80, 88, 110, 58, 160, 58);
  ctx.bezierCurveTo(210, 58, 240, 88, 236, 168);
  ctx.lineTo(222, 168);
  ctx.bezierCurveTo(224, 140, 218, 118, 206, 108);
  ctx.bezierCurveTo(196, 128, 188, 104, 160, 102);
  ctx.bezierCurveTo(132, 104, 124, 128, 114, 108);
  ctx.bezierCurveTo(102, 118, 96, 140, 98, 168);
  ctx.closePath(); ctx.fill();

  // Brows (raised in happy mood)
  var browLift = state.mood === 'happy' ? -4 : 0;
  ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(112, 132 + browLift);
  ctx.quadraticCurveTo(132, 124 + browLift, 152, 131 + browLift); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(168, 131 + browLift);
  ctx.quadraticCurveTo(188, 124 + browLift, 208, 132 + browLift); ctx.stroke();

  // Eyes
  var eyeX = [132, 188];
  for (var i = 0; i < 2; i++) {
    if (state.blink) {
      ctx.strokeStyle = '#2b211c'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(eyeX[i] - 14, 160);
      ctx.quadraticCurveTo(eyeX[i], 167, eyeX[i] + 14, 160); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(eyeX[i], 160, 14, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2b211c';
      ctx.beginPath(); ctx.arc(eyeX[i], 162, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(eyeX[i] - 2, 159, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Nose
  ctx.strokeStyle = '#b97f56'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(160, 178); ctx.quadraticCurveTo(157, 196, 165, 199); ctx.stroke();

  // Cheeks
  ctx.fillStyle = 'rgba(232, 138, 122, 0.45)';
  ctx.beginPath(); ctx.arc(114, 204, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(206, 204, 10, 0, Math.PI * 2); ctx.fill();

  // Mouth — same path data as the SVG via Path2D
  var d = mouthD();
  var st = mouthStyle();
  var mp = new Path2D(d);
  ctx.save();
  ctx.translate(160, 224);
  ctx.fillStyle = st.fill;
  ctx.fill(mp);
  ctx.strokeStyle = st.stroke; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.stroke(mp);
  ctx.restore();

  ctx.restore(); // head
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* 6. Public contract                                                   */
/* ------------------------------------------------------------------ */
var Avatar = {
  VISEME_PATHS: VISEME_PATHS,

  mount: function (el) {
    if (!el) throw new Error('Avatar.mount: element required');
    // Re-mount cleanly.
    if (state.blinkTimer) clearTimeout(state.blinkTimer);
    cancelLoop();
    state.mounted = false;
    state.eyesOpen = [];
    state.eyesClosed = [];
    state.brows = [];
    state.mouth = null;
    state.headG = null;

    while (el.firstChild) el.removeChild(el.firstChild);
    state.svg = buildSVG();
    el.appendChild(state.svg);
    state.el = el;
    state.mounted = true;
    state.viseme = 'X';
    state.speaking = false;
    state.bobPhase = 0;

    scheduleBlink();
    paintFrame(); // single static paint; the rAF loop starts on speak() (M35)
    return state.svg;
  },

  setViseme: function (v) {
    if (!isValidViseme(v)) v = 'X';
    state.viseme = v;
    if (state.mouth) {
      var st = mouthStyle();
      state.mouth.setAttribute('d', mouthD());
      state.mouth.setAttribute('fill', st.fill);
      state.mouth.setAttribute('stroke', st.stroke);
    }
  },

  speak: function (cues, audioEl) {
    Avatar.stop();
    state.cues = (cues || []).slice().sort(function (a, b) { return a.start - b.start; });
    state.cueIdx = 0;
    state.audio = audioEl || null;
    state.speaking = true;
    var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var startOffset = (audioEl && typeof audioEl.currentTime === 'number') ? audioEl.currentTime : 0;
    state.t0 = now - startOffset * 1000;

    if (audioEl && audioEl.addEventListener) {
      state.onAudioEnd = function () { Avatar.stop(); };
      audioEl.addEventListener('ended', state.onAudioEnd);
      audioEl.addEventListener('pause', state.onAudioEnd);
    }
    if (state.cues.length) {
      // Set the first mouth shape immediately so there is no lag on play.
      var first = state.cues[0];
      Avatar.setViseme(isValidViseme(first.viseme) ? first.viseme : 'X');
    }
    startLoop(); // M35: run the rAF loop only while speaking (double-start safe)
  },

  stop: function () {
    if (state.audio && state.onAudioEnd && state.audio.removeEventListener) {
      state.audio.removeEventListener('ended', state.onAudioEnd);
      state.audio.removeEventListener('pause', state.onAudioEnd);
    }
    cancelLoop(); // M35: stop the rAF loop
    state.audio = null;
    state.onAudioEnd = null;
    state.speaking = false;
    state.cues = [];
    state.cueIdx = 0;
    state.bobPhase = 0;
    Avatar.setViseme('X');
    paintFrame(); // one final rest-state paint so SVG/canvas settle (headG reset too)
  },

  getCanvas: function () {
    if (!state.canvas) {
      var c = document.createElement('canvas');
      c.width = 480;
      c.height = 480;
      c.setAttribute('aria-label', 'VoiceSync presenter character (canvas)');
      state.canvas = c;
      // Paint the first frame right away so the canvas is never blank.
      drawAvatarCanvas(c.getContext('2d'), c.width, c.height);
    }
    return state.canvas;
  },

  setMood: function (mood) {
    state.mood = (mood === 'happy') ? 'happy' : 'neutral';
    var lift = state.mood === 'happy' ? -4 : 0;
    for (var i = 0; i < state.brows.length; i++) {
      var b = state.brows[i];
      var base = b.getAttribute('d');
      // Brows were built with fixed geometry; apply lift via transform.
      b.setAttribute('transform', 'translate(0 ' + lift + ')');
      void base;
    }
    // Refresh the rest mouth so happy <-> neutral switches the smile.
    if (state.viseme === 'X') Avatar.setViseme('X');
  }
};

// Node test hook (harmless in browsers: `module` is undefined there).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Avatar: Avatar, VISEME_PATHS: VISEME_PATHS };
}

if (typeof window !== 'undefined') {
  window.Avatar = Avatar;
}

})();
