/* Dashboard SPA */
const { esc, num, api, toast } = VS;
let CFG, ME, VOICES = [];
const state = { voiceId: null, draft: null };
try { state.voiceId = localStorage.getItem('vs_voice'); state.draft = JSON.parse(localStorage.getItem('vs_draft') || 'null'); } catch {}
const store = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} };

const I = {
  home: '<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  studio: '<path d="M4 7h16M4 12h10M4 17h7"/><circle cx="18" cy="16" r="3"/>',
  clone: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  voices: '<path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  billing: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  api: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  referral: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
};
const ico = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[k]}</svg>`;
const ROUTES = [
  ['home', 'Overview'], ['studio', 'Text to Speech'], ['clone', 'Voice Cloning'], ['voices', 'My Voices'], ['history', 'History'], '-',
  ['billing', 'Plans & Billing'], ['api', 'API Keys'], ['referral', 'Refer & Earn'], ['settings', 'Settings'],
];

// ── shell ────────────────────────────────────────────────
function drawSide(route) {
  const c = ME.credits;
  const pct = Math.min(100, (c.monthly / Math.max(1, c.monthlyTotal)) * 100);
  const items = [...ROUTES, ...(ME.role === 'admin' ? ['-', ['admin', 'Admin panel']] : [])];
  $('#side').innerHTML = `<a class="logo" href="/"><span class="logo-mark">${VS.LOGO}</span>${esc(CFG.brand.short)}</a>
    ${items.map((r) => (r === '-' ? '<div class="sep"></div>' : `<a class="nav-i ${route === r[0] ? 'on' : ''}" href="#${r[0]}">${ico(r[0])}${r[1]}</a>`)).join('')}
    <div class="meter"><div class="row between" style="font-size:13px"><b>${esc(c.planName)} plan</b><span class="dim">${VS.short(c.remaining)} left</span></div>
      <div class="bar" style="margin:10px 0 8px"><i style="width:${pct}%"></i></div>
      <div class="dim" style="font-size:12px">${num(c.monthly)} / ${num(c.monthlyTotal)} monthly${c.extra ? ` + ${num(c.extra)} extra` : ''}<br>Resets ${new Date(c.cycleEnds).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
      <div class="row" style="margin-top:12px;gap:8px"><span class="avatar" style="width:30px;height:30px;font-size:13px;border-radius:9px">${esc(ME.name[0]).toUpperCase()}</span><div style="min-width:0;font-size:13px"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ME.name)}</b><span class="dim" style="font-size:12px;display:block;overflow:hidden;text-overflow:ellipsis">${esc(ME.email)}</span></div></div></div>`;
  $('#topcred').textContent = `${num(c.remaining)} characters`;
}
async function refreshMe() { ME = (await api('/api/me')).data; }
function setCredits(c) { if (c) { ME.credits = c; drawSide(currentRoute()); } }
const currentRoute = () => (location.hash.slice(1).split('?')[0] || 'home');
const qs = () => new URLSearchParams(location.hash.split('?')[1] || '');
async function loadVoices() { VOICES = (await api('/api/voices')).data; return VOICES; }
const voiceById = (id) => VOICES.find((v) => v.id === id);

async function route() {
  const r = currentRoute();
  const view = $('#view');
  $('#side').classList.remove('open');
  const fn = VIEWS[r] || VIEWS.home;
  if (r === 'admin' && ME.role !== 'admin') return (location.hash = 'home');
  $('#title').textContent = (ROUTES.find((x) => x[0] === r) || ['', r === 'admin' ? 'Admin panel' : 'Overview'])[1];
  drawSide(r);
  view.innerHTML = '<div class="empty"><span class="spin"></span></div>';
  try { await fn(view); } catch (e) { if (e.status === 401) location.href = '/auth/login?next=/app'; else view.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}

// ── shared bits ──────────────────────────────────────────
const genCard = (g, actions = true) => `<div class="gen" data-gen="${g.id}"><div style="min-width:0">
  <div class="t">${esc(g.title)}</div><div class="s">${esc(g.voiceName)} · ${num(g.characters)} chars · ${g.speed}× · ${VS.ago(g.createdAt)}</div>
  <p>${esc(g.text)}</p><audio controls preload="none" src="${g.audio}"></audio></div>
  ${actions ? `<div style="display:flex;flex-direction:column;gap:8px"><a class="btn btn-ghost btn-sm" href="${g.download}">⬇ Download</a><button class="btn btn-ghost btn-sm" data-reuse="${g.id}">↺ Reuse</button><button class="btn btn-danger btn-sm" data-del-gen="${g.id}">Delete</button></div>` : ''}</div>`;
function bindGenActions(root, list, after) {
  root.addEventListener('click', async (e) => {
    const re = e.target.closest('[data-reuse]');
    if (re) { const g = list.find((x) => x.id === re.dataset.reuse); state.draft = { text: g.text, title: g.title, speed: g.speed }; state.voiceId = g.voiceId; store('vs_draft', state.draft); location.hash = 'studio'; }
    const d = e.target.closest('[data-del-gen]');
    if (d && confirmBox('Delete this generation?')) { await api('/api/generations/' + d.dataset.delGen, { method: 'DELETE' }); d.closest('.gen').remove(); toast('Deleted', 'ok'); after?.(); }
  });
}
const confirmBox = (m) => window.confirm(m);

// ── views ────────────────────────────────────────────────
const VIEWS = {};

VIEWS.home = async (v) => {
  const [gens] = await Promise.all([api('/api/generations').then((r) => r.data), refreshMe()]);
  drawSide('home');
  const c = ME.credits;
  v.innerHTML = `<h1 style="font-size:1.9rem">Hi ${esc(ME.name.split(' ')[0])} 👋</h1><p class="muted">Here's your studio at a glance.</p>
  ${c.plan === 'free' ? `<div class="notice info" style="margin:18px 0">You're on the Free plan — ${num(CFG.freeMonthlyChars)} characters every month. <a href="#billing" style="color:var(--brand);font-weight:600">Upgrade for up to 11M →</a></div>` : ''}
  <div class="grid g4" style="margin:20px 0">
    <div class="card stat"><span>Characters left</span><b>${VS.short(c.remaining)}</b></div>
    <div class="card stat"><span>Generations</span><b>${num(ME.stats.generations)}</b></div>
    <div class="card stat"><span>Cloned voices</span><b>${num(ME.stats.voices)}</b></div>
    <div class="card stat"><span>Used this week</span><b>${VS.short(ME.stats.charsThisWeek)}</b></div></div>
  <div class="grid g3" style="margin-bottom:28px">
    <a class="card lift" href="#studio"><div class="icon-tile">${ico('studio')}</div><h3>Text to Speech</h3><p class="muted" style="margin:0">Turn a script into a voiceover.</p></a>
    <a class="card lift" href="#clone"><div class="icon-tile">${ico('clone')}</div><h3>Clone a voice</h3><p class="muted" style="margin:0">Your own voice in ~60 seconds.</p></a>
    <a class="card lift" href="#referral"><div class="icon-tile">${ico('referral')}</div><h3>Refer & earn</h3><p class="muted" style="margin:0">${VS.short(CFG.referralBonus)} free chars per friend.</p></a></div>
  <div class="row between"><h3>Recent generations</h3><a href="#history" class="btn btn-ghost btn-sm">View all</a></div>
  <div id="recent">${gens.length ? gens.slice(0, 4).map((g) => genCard(g)).join('') : '<div class="empty">No generations yet. <a href="#studio" style="color:var(--brand)">Create your first voiceover →</a></div>'}</div>`;
  bindGenActions($('#recent', v), gens);
};

VIEWS.studio = async (v) => {
  await loadVoices();
  if (!voiceById(state.voiceId)) state.voiceId = VOICES[0]?.id || null;
  const d = state.draft || { text: '', title: '', speed: 1 };
  v.innerHTML = `<div class="studio">
    <div class="card"><div class="row between wrapr" style="margin-bottom:12px"><input id="ttl" placeholder="Untitled project" value="${esc(d.title || '')}" style="max-width:360px;font-weight:600"><div class="chips">${Object.keys(VS.PRESETS).map((k) => `<button class="chip" data-preset="${k}">${k}</button>`).join('')}</div></div>
      <textarea id="txt" style="min-height:340px" maxlength="${CFG.maxTts}" placeholder="Paste or write your script here… Use punctuation for natural pauses. Up to ${num(CFG.maxTts)} characters.">${esc(d.text || '')}</textarea>
      <div class="row between wrapr" style="margin-top:12px"><div class="row"><label class="btn btn-ghost btn-sm" style="cursor:pointer">Import .txt<input type="file" accept=".txt" hidden id="imp"></label><button class="btn btn-ghost btn-sm" id="clr">Clear</button></div>
        <div class="row"><span class="dim mono" id="cnt"></span><button class="btn btn-primary" id="go">Generate speech</button></div></div>
      <div id="out"></div></div>
    <div class="grid" style="align-content:start">
      <div class="card"><span class="label">Voice</span><div class="voice-pill" id="vp"></div>
        <div class="row" style="margin-top:12px"><button class="btn btn-ghost" style="flex:1" id="chv">Change voice</button><a class="btn btn-ghost" href="#clone" title="Clone a new voice">+ Clone</a></div></div>
      <div class="card"><span class="label">Settings</span><div class="row between"><span class="muted" style="font-size:14px">Speed</span><b id="spv"></b></div>
        <input type="range" id="sp" min="0.5" max="2" step="0.05" value="${d.speed || 1}" style="margin-top:10px">
        <div class="row between dim" style="font-size:12px"><span>0.5×</span><span>2×</span></div>
        <div class="chips" style="margin-top:10px">${[0.8, 1, 1.2, 1.5].map((x) => `<button class="chip" data-sp="${x}">${x}×</button>`).join('')}</div></div>
      <div class="card"><span class="label">Details</span>
        <div class="kv"><span>Characters</span><b id="dc">0</b></div><div class="kv"><span>Words</span><b id="dw">0</b></div>
        <div class="kv"><span>Est. duration</span><b id="dt">—</b></div><div class="kv"><span>Cost</span><b id="dk">0</b></div><div class="kv"><span>Balance after</span><b id="db"></b></div></div>
    </div></div>`;
  const txt = $('#txt'), sp = $('#sp');
  const save = () => { state.draft = { text: txt.value, title: $('#ttl').value, speed: +sp.value }; store('vs_draft', state.draft); };
  const drawVoice = () => {
    const vc = voiceById(state.voiceId);
    $('#vp').innerHTML = vc ? `<span class="avatar">${esc(vc.name[0]).toUpperCase()}</span><div style="min-width:0"><b>${esc(vc.name)}</b><div class="dim" style="font-size:13px">${VS.flag(vc.locale || vc.language)} ${VS.langName(vc.language)} · ${esc(vc.gender)}${vc.mine ? ' · your clone' : ''}</div></div>${vc.sample ? `<button class="play-btn" id="pv">▶</button>` : ''}`
      : `<div class="dim" style="font-size:14px">No voices yet. <a href="#clone" style="color:var(--brand)">Clone your first voice →</a></div>`;
    const pv = $('#pv'); let a;
    if (pv) pv.onclick = () => VS.play(pv, vc.sample);
  };
  const upd = () => {
    const t = txt.value, w = t.trim() ? t.trim().split(/\s+/).length : 0, sec = Math.round(w / 2.5 / (+sp.value));
    $('#cnt').textContent = `${num(t.length)} / ${num(CFG.maxTts)}`; $('#dc').textContent = num(t.length); $('#dw').textContent = num(w);
    $('#dt').textContent = w ? (sec >= 60 ? `~${Math.floor(sec / 60)}m ${sec % 60}s` : `~${Math.max(1, sec)}s`) : '—';
    $('#dk').textContent = num(t.length); const after = ME.credits.remaining - t.length;
    $('#db').innerHTML = after < 0 ? `<span style="color:var(--bad)">${num(after)}</span>` : num(after);
    $('#spv').textContent = (+sp.value).toFixed(2) + '×'; save();
  };
  drawVoice(); upd();
  txt.oninput = upd; sp.oninput = upd; $('#ttl').oninput = save;
  $$('[data-sp]', v).forEach((b) => (b.onclick = () => { sp.value = b.dataset.sp; upd(); }));
  $('#clr').onclick = () => { txt.value = ''; $('#ttl').value = ''; upd(); };
  $$('[data-preset]', v).forEach((b) => (b.onclick = () => { txt.value = VS.PRESETS[b.dataset.preset]; upd(); }));
  $('#imp').onchange = async (e) => { const f = e.target.files[0]; if (f) { txt.value = (await f.text()).slice(0, CFG.maxTts); if (!$('#ttl').value) $('#ttl').value = f.name.replace(/\.txt$/, ''); upd(); } };
  $('#chv').onclick = () => VS.voicePicker({ voices: VOICES, current: state.voiceId, onPick: (x) => { state.voiceId = x.id; store('vs_voice', x.id); drawVoice(); } });
  const go = async () => {
    const b = $('#go');
    if (!state.voiceId) return toast('Pick or clone a voice first.', 'bad');
    if (!txt.value.trim()) return toast('Write a script first.', 'bad');
    if (txt.value.length > ME.credits.remaining) { toast('Not enough characters — top up to continue.', 'bad'); return; }
    VS.busy(b, true, txt.value.length > 3000 ? 'Generating long audio…' : 'Generating…');
    $('#out').innerHTML = `<div class="player"><div class="row"><span class="spin"></span><span class="muted">Creating your voiceover${txt.value.length > 3000 ? ' — long scripts can take a minute' : ''}…</span></div></div>`;
    try {
      const r = await api('/api/tts', { method: 'POST', body: { text: txt.value, voiceId: state.voiceId, speed: +sp.value, title: $('#ttl').value } });
      setCredits(r.credits); upd();
      $('#out').innerHTML = `<div class="player"><div class="row between" style="margin-bottom:10px"><b>${esc(r.data.title)}</b><span class="badge ok">Ready</span></div><audio controls autoplay src="${r.data.audio}"></audio>
        <div class="row" style="margin-top:10px"><a class="btn btn-primary btn-sm" href="${r.data.download}">⬇ Download WAV</a><a class="btn btn-ghost btn-sm" href="#history">History</a><span class="dim" style="margin-left:auto;font-size:13px">${num(r.data.characters)} characters used</span></div></div>`;
      toast('Voiceover ready!', 'ok');
    } catch (e) {
      $('#out').innerHTML = `<div class="notice" style="margin-top:14px">${esc(e.message)} ${e.code === 'INSUFFICIENT_CHARACTERS' ? '<a href="#billing" style="color:var(--brand);font-weight:600">Top up →</a>' : ''}</div>`;
    }
    VS.busy(b, false);
  };
  $('#go').onclick = go;
  txt.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); };
};

// encode recorded audio to 16-bit mono WAV (engine accepts WAV/MP3)
// Decode any audio, mix to mono, resample to 24 kHz and trim to 60s → small 16-bit WAV (engine accepts WAV/MP3)
async function toWav(blob) {
  const RATE = 24000, MAX_S = 60;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const dur = Math.min(src.duration, MAX_S);
  const off = new OfflineAudioContext(1, Math.ceil(dur * RATE), RATE);
  const node = off.createBufferSource(); node.buffer = src; node.connect(off.destination); node.start(0, 0, dur);
  const buf = await off.startRendering();
  const ch = buf.getChannelData(0), len = ch.length;
  const out = new DataView(new ArrayBuffer(44 + len * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, RATE, true); out.setUint32(28, RATE * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 0x7fff, true);
  return { blob: new Blob([out], { type: 'audio/wav' }), seconds: dur };
}

VIEWS.clone = async (v) => {
  let file = null, mode = 'upload', rec, chunks = [], timer, secs = 0;
  v.innerHTML = `<div class="studio"><div class="card">
    <h2 style="font-size:1.5rem">Clone a voice</h2><p class="muted">Upload or record 10–30 seconds of clean speech. Ready in about a minute.</p>
    <form id="cf" novalidate>
      <div class="seg" style="margin:10px 0 16px"><button type="button" data-m="upload" class="on">Upload file</button><button type="button" data-m="record">Record now</button></div>
      <div class="field"><div id="src"></div><input type="hidden" name="audio"></div>
      <div id="prev"></div>
      <div class="grid g3" style="margin-top:16px">
        <div class="field"><label>Voice name</label><input name="name" maxlength="80" placeholder="e.g. Saad – Narration"></div>
        <div class="field"><label>Gender</label><select name="gender"><option>Unspecified</option><option>Male</option><option>Female</option><option>Neutral</option></select></div>
        <div class="field"><label>Language of the sample</label><select name="language">${CFG.languages.map((l) => `<option value="${l}">${VS.flag(l)} ${VS.langName(l)}</option>`).join('')}</select></div></div>
      <div class="field"><label class="row" style="align-items:flex-start;gap:10px;color:var(--text);font-weight:500"><input type="checkbox" name="consent" style="margin-top:4px"> <span>This is my own voice, or I have the speaker's explicit permission to clone it. I won't use it to impersonate or deceive anyone.</span></label></div>
      <button class="btn btn-primary btn-lg" id="cb">Clone voice</button></form><div id="cres"></div></div>
    <div class="grid" style="align-content:start"><div class="card"><span class="label">Tips for a great clone</span>
      <ul class="muted" style="padding-left:18px;margin:0;font-size:14px;line-height:1.9"><li>10–30 seconds is ideal</li><li>Quiet room, no music or echo</li><li>One speaker only</li><li>Speak naturally, in the tone you want</li><li>WAV, MP3, M4A or OGG</li></ul></div>
      <div class="card"><span class="label">Cost</span><p style="margin:0"><b class="grad-text" style="font-size:1.4rem">Free</b> <span class="muted">— cloning doesn't use characters.</span></p></div></div></div>`;
  const drawSrc = () => {
    $$('[data-m]', v).forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    $('#src').innerHTML = mode === 'upload'
      ? `<label class="drop" id="drop"><input type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg" hidden id="fi"><div style="font-size:30px">🎙️</div><b>Drop your audio here or click to browse</b><div class="dim" style="font-size:13px">WAV, MP3, M4A or OGG · long files are trimmed to 60s</div></label>`
      : `<div class="drop" style="cursor:default"><button type="button" class="rec" id="rb">●</button><div style="margin-top:12px"><b id="rs">Tap to start recording</b><div class="dim mono" id="rt">0:00</div></div>
         <p class="muted" style="font-size:13px;margin:12px auto 0;max-width:420px">Read this: “Hello! I'm recording a short sample so I can create my own AI voice. I'm speaking clearly, at a natural pace, in a quiet room.”</p></div>`;
    if (mode === 'upload') {
      const drop = $('#drop'), fi = $('#fi');
      fi.onchange = () => setFile(fi.files[0]);
      ['dragover', 'dragenter'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (ev) => { ev.preventDefault(); setFile(ev.dataTransfer.files[0]); });
    } else {
      $('#rb').onclick = async () => {
        if (rec && rec.state === 'recording') { rec.stop(); return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          chunks = []; rec = new MediaRecorder(stream); secs = 0;
          rec.ondataavailable = (e) => chunks.push(e.data);
          rec.onstop = async () => { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); $('#rb').classList.remove('on'); $('#rb').textContent = '●'; $('#rs').textContent = 'Processing…';
            const { blob, seconds } = await toWav(new Blob(chunks, { type: rec.mimeType })); setFile(new File([blob], 'recording.wav', { type: 'audio/wav' }), seconds); $('#rs').textContent = 'Recorded — tap to re-record'; };
          rec.start(); $('#rb').classList.add('on'); $('#rb').textContent = '■'; $('#rs').textContent = 'Recording… tap to stop';
          timer = setInterval(() => { secs++; $('#rt').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; if (secs >= 60) rec.stop(); }, 1000);
        } catch { toast('Microphone permission was blocked.', 'bad'); }
      };
    }
  };
  const setFile = async (f, seconds) => {
    if (!f) return;
    if (!/\.(wav|mp3|m4a|ogg|webm)$/i.test(f.name) && !/^audio\//.test(f.type)) return toast('Please use an audio file (WAV, MP3, M4A, OGG).', 'bad');
    if (f.size > 100 * 1024 * 1024) return toast('File is over 100 MB.', 'bad');
    // convert anything that is not small WAV/MP3 into a compact WAV in the browser
    if (f.size > CFG.maxUpload * 0.9 || !/\.(wav|mp3)$/i.test(f.name)) {
      try { toast('Optimising sample…'); const r = await toWav(f); f = new File([r.blob], f.name.replace(/\.\w+$/, '') + '.wav', { type: 'audio/wav' }); seconds = r.seconds; }
      catch { return toast('Could not read this audio file. Try a WAV or MP3.', 'bad'); }
    }
    file = f;
    const url = URL.createObjectURL(f);
    $('#prev').innerHTML = `<div class="player"><div class="row between" style="margin-bottom:8px"><b style="font-size:14px">${esc(f.name)}</b><span class="dim" style="font-size:13px">${(f.size / 1048576).toFixed(2)} MB${seconds ? ' · ' + seconds.toFixed(1) + 's' : ''}</span></div><audio controls src="${url}"></audio></div>`;
    const a = $('#prev audio'); a.onloadedmetadata = () => { if (a.duration < 8) toast('Sample is under 10 seconds — longer samples clone better.'); };
    const n = $('[name=name]'); if (!n.value) n.value = f.name.replace(/\.(wav|mp3)$/i, '').replace(/[_-]+/g, ' ').slice(0, 60);
  };
  $$('[data-m]', v).forEach((b) => (b.onclick = () => { mode = b.dataset.m; drawSrc(); }));
  drawSrc();
  $('#cf').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target, b = $('#cb');
    const fd = new FormData(); if (file) fd.append('audio', file, file.name);
    fd.append('name', f.name.value); fd.append('gender', f.gender.value); fd.append('language', f.language.value); fd.append('consent', f.consent.checked ? 'true' : 'false');
    VS.showFieldErrors(f, {}); VS.busy(b, true, 'Cloning voice… (~1 min)');
    try {
      const r = await api('/api/voices/clone', { method: 'POST', body: fd });
      state.voiceId = r.data.id; store('vs_voice', r.data.id);
      $('#cres').innerHTML = `<div class="notice info" style="margin-top:16px">🎉 <b>${esc(r.data.name)}</b> is ready. <a href="#studio" style="color:var(--brand);font-weight:600">Use it in Text to Speech →</a></div>`;
      toast('Voice cloned!', 'ok'); f.reset(); file = null; $('#prev').innerHTML = '';
    } catch (err) { VS.showFieldErrors(f, err.fields || {}); toast(err.message, 'bad'); }
    VS.busy(b, false);
  };
};

VIEWS.voices = async (v) => {
  await loadVoices();
  const mine = VOICES.filter((x) => x.mine), lib = VOICES.filter((x) => !x.mine);
  const card = (x) => `<div class="card" data-v="${x.id}"><div class="row"><span class="avatar">${esc(x.name[0]).toUpperCase()}</span><div style="min-width:0;flex:1"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</b><div class="dim" style="font-size:13px">${esc(x.gender)} · ${VS.flag(x.locale || x.language)} ${VS.langName(x.language)}</div></div>${x.sample ? `<button class="play-btn" data-play="${x.sample}">▶</button>` : ''}</div>
    <div class="dim" style="font-size:12px;margin:12px 0">${x.mine ? 'Cloned ' + VS.ago(x.createdAt) : 'Library voice'}${x.public && x.mine ? ' · in public library' : ''}</div>
    <div class="row wrapr" style="gap:8px"><button class="btn btn-primary btn-sm" data-use="${x.id}">Use</button>${x.mine ? `<button class="btn btn-ghost btn-sm" data-ren="${x.id}">Rename</button><button class="btn btn-danger btn-sm" data-delv="${x.id}">Delete</button>` : ''}</div></div>`;
  v.innerHTML = `<div class="row between wrapr"><div><h2 style="font-size:1.5rem;margin:0">My voices</h2><p class="muted" style="margin:4px 0 0">${mine.length} cloned · ${lib.length} library</p></div><a class="btn btn-primary" href="#clone">+ Clone new voice</a></div>
    <div class="grid g3" style="margin:20px 0 36px">${mine.length ? mine.map(card).join('') : '<div class="empty" style="grid-column:1/-1">You haven\'t cloned a voice yet. <a href="#clone" style="color:var(--brand)">Clone one in a minute →</a></div>'}</div>
    <div class="row between wrapr"><h3 style="margin:0">Voice library <span class="dim" style="font-size:14px">· ${lib.length}</span></h3><div class="row wrapr"><input id="lq" placeholder="Search…" style="width:180px"><select id="ll" style="width:auto"><option value="All">All languages</option>${[...new Set(lib.map((x) => x.language))].map((l) => `<option value="${l}">${VS.flag(l)} ${VS.langName(l)}</option>`).join('')}</select></div></div>
    <div id="libl" style="margin-top:14px"></div>`;
  const libItem = (x) => `<div class="voice-item"><span class="avatar">${esc(x.name[0]).toUpperCase()}</span><span style="min-width:0;flex:1"><b>${esc(x.name)}</b><small>${VS.flag(x.locale || x.language)} ${VS.langName(x.language)} · ${esc(x.gender)}</small></span>${x.sample ? `<button class="play-btn" data-play="${x.sample}">▶</button>` : ''}<button class="btn btn-ghost btn-sm" data-use="${x.id}">Use</button></div>`;
  const drawLib = () => { const q = ($('#lq')?.value || '').toLowerCase(), l = $('#ll')?.value || 'All'; const f = lib.filter((x) => (l === 'All' || x.language === l) && (!q || x.name.toLowerCase().includes(q))); $('#libl').innerHTML = f.length ? `<div class="voice-list" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${f.map(libItem).join('')}</div>` : '<div class="empty">No voices match.</div>'; };
  drawLib(); $('#lq').oninput = drawLib; $('#ll').onchange = drawLib;
  let a;
  v.onclick = async (e) => {
    const t = e.target;
    const pb = t.closest('[data-play]'); if (pb) VS.play(pb, pb.dataset.play);
    if (t.dataset.use) { state.voiceId = t.dataset.use; store('vs_voice', t.dataset.use); location.hash = 'studio'; }
    if (t.dataset.ren) { const n = prompt('New name', voiceById(t.dataset.ren).name); if (n && n.trim().length >= 2) { await api('/api/voices/' + t.dataset.ren, { method: 'PATCH', body: { name: n } }); toast('Renamed', 'ok'); route(); } }
    if (t.dataset.delv && confirmBox('Delete this voice? Generations made with it stay in your history.')) { await api('/api/voices/' + t.dataset.delv, { method: 'DELETE' }); toast('Voice deleted', 'ok'); route(); }
  };
};

VIEWS.history = async (v) => {
  let list = (await api('/api/generations')).data;
  v.innerHTML = `<div class="row between wrapr" style="margin-bottom:18px"><div><h2 style="font-size:1.5rem;margin:0">History</h2><p class="muted" style="margin:4px 0 0">${list.length} generations · ${num(list.reduce((s, g) => s + g.characters, 0))} characters</p></div><input id="hq" placeholder="Search title or text…" style="max-width:300px"></div><div id="hl"></div>`;
  const draw = (q = '') => { const f = list.filter((g) => !q || (g.title + g.text).toLowerCase().includes(q.toLowerCase())); $('#hl').innerHTML = f.length ? f.map((g) => genCard(g)).join('') : '<div class="empty">Nothing here yet.</div>'; };
  draw(); $('#hq').oninput = (e) => draw(e.target.value);
  bindGenActions($('#hl'), list, () => { list = list.filter((g) => $(`[data-gen="${g.id}"]`)); });
};

VIEWS.billing = async (v) => {
  await refreshMe(); drawSide('billing');
  const pays = (await api('/api/payments')).data;
  const c = ME.credits;
  const pre = qs().get('plan');
  v.innerHTML = `<div class="grid g3" style="margin-bottom:24px">
      <div class="card stat"><span>Current plan</span><b>${esc(c.planName)}</b><span>${c.plan === 'free' ? 'Free forever' : 'Renews manually · ends ' + new Date(c.cycleEnds).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
      <div class="card stat"><span>Monthly characters</span><b>${VS.short(c.monthly)} <small class="dim" style="font-size:14px">/ ${VS.short(c.monthlyTotal)}</small></b><div class="bar" style="margin-top:10px"><i style="width:${Math.min(100, (c.monthly / Math.max(1, c.monthlyTotal)) * 100)}%"></i></div></div>
      <div class="card stat"><span>Top-up balance (never expires)</span><b>${VS.short(c.extra)}</b></div></div>
    ${pays.some((p) => p.status === 'pending') ? `<div class="notice" style="margin-bottom:20px">⏳ You have a payment awaiting confirmation. Credits are added as soon as we verify it.</div>` : ''}
    <div id="checkout"></div>
    <h3 style="margin-top:10px">Choose a plan</h3><div class="plans" style="margin:16px 0 28px">${CFG.plans.map((p) => `<div class="card plan ${p.popular ? 'popular' : ''}">${p.popular ? '<span class="badge">Most popular</span>' : ''}
      <h3>${esc(p.name)} ${c.plan === p.id ? '<span class="badge soft" style="vertical-align:middle;margin-left:6px">Current</span>' : ''}</h3><div class="price" style="font-size:1.9rem;white-space:nowrap">Rs ${num(p.price)}<small> /30d</small></div><div class="dim" style="font-size:13px">${p.firstMonth < p.price ? `First month Rs ${num(p.firstMonth)}` : '&nbsp;'}</div>
      <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><button class="btn ${p.popular ? 'btn-primary' : 'btn-ghost'} btn-block" data-buy="${p.id}">${c.plan === p.id ? 'Renew' : 'Select'}</button></div>`).join('')}</div>
    <h3>Top-up packs</h3><div class="grid g3" style="margin:16px 0 28px">${CFG.packs.map((k) => `<div class="card"><b>${esc(k.name)}</b><div class="price" style="font-size:1.6rem">Rs ${num(k.price)}</div><p class="dim" style="font-size:13px">One-time · never expires</p><button class="btn btn-ghost btn-block" data-buy="${k.id}">Buy</button></div>`).join('')}</div>
    <h3>Payment history</h3><div class="table-wrap" style="margin-top:14px"><table><tr><th>Invoice</th><th>Item</th><th>Amount</th><th>Method</th><th>Txn ID</th><th>Date</th><th>Status</th></tr>
      ${pays.length ? pays.map((p) => `<tr><td class="mono">${p.invoice}</td><td>${esc(p.itemName)}</td><td>Rs ${num(p.amount)}</td><td>${esc(CFG.payment[p.method]?.title || p.method)}</td><td class="mono">${esc(p.txnId)}</td><td>${VS.ago(p.createdAt)}</td><td><span class="badge ${p.status === 'approved' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warn'}">${p.status}</span>${p.note ? `<div class="dim" style="font-size:12px">${esc(p.note)}</div>` : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="dim" style="text-align:center;padding:24px">No payments yet.</td></tr>'}</table></div>`;
  const checkout = async (itemId) => {
    const q = (await api('/api/billing/quote/' + itemId)).data;
    let method = Object.keys(CFG.payment)[0];
    const el = $('#checkout');
    const draw = () => {
      const m = CFG.payment[method];
      el.innerHTML = `<div class="card" style="margin-bottom:28px;border-color:var(--brand)"><div class="row between wrapr"><div><span class="label">Checkout</span><h3 style="margin:0">${esc(q.name)}</h3><p class="muted" style="margin:4px 0 0">${num(q.chars)} characters</p></div><div class="price">Rs ${num(q.amount)}</div></div>
        <div class="grid g2" style="margin-top:20px;gap:24px"><div><b style="font-size:14px">1. Send payment</b><div class="seg" style="margin:10px 0">${Object.entries(CFG.payment).map(([k, x]) => `<button type="button" data-pm="${k}" class="${k === method ? 'on' : ''}">${esc(x.title)}</button>`).join('')}</div>
          <div class="pay-box"><div class="kv"><span>Send to</span><b class="mono">${esc(m.account)}</b></div><div class="kv"><span>Account title</span><b>${esc(m.holder)}</b></div>${m.bank ? `<div class="kv"><span>Bank</span><b>${esc(m.bank)}</b></div>` : ''}<div class="kv"><span>Amount</span><b>Rs ${num(q.amount)}</b></div></div>
          <p class="dim" style="font-size:13px;margin-top:10px">Keep the receipt screenshot. Questions? <a data-wa="Hi, I'm paying for ${esc(q.name)} (${esc(ME.email)})" target="_blank" style="color:var(--brand)">WhatsApp us</a></p></div>
          <form id="pf" novalidate><b style="font-size:14px">2. Confirm payment</b><input type="hidden" name="itemId" value="${q.id}"><input type="hidden" name="method" value="${method}">
            <div class="field" style="margin-top:12px"><label>Transaction / reference ID</label><input name="txnId" placeholder="e.g. 0123456789"></div>
            <div class="field"><label>Sender name or number</label><input name="sender" placeholder="Account you paid from"></div>
            <div class="row"><button class="btn btn-primary">Submit payment</button><button type="button" class="btn btn-ghost" id="pc">Cancel</button></div></form></div></div>`;
      $$('[data-pm]', el).forEach((b) => (b.onclick = () => { method = b.dataset.pm; draw(); }));
      $$('[data-wa]', el).forEach((a) => (a.href = `https://wa.me/${CFG.brand.whatsapp}?text=${encodeURIComponent(a.dataset.wa)}`));
      $('#pc').onclick = () => { el.innerHTML = ''; history.replaceState(null, '', '#billing'); };
      $('#pf').onsubmit = async (e) => {
        e.preventDefault(); const b = e.target.querySelector('button');
        VS.busy(b, true, 'Submitting…');
        try { const r = await api('/api/payments', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast(`Payment ${r.data.invoice} submitted — we'll confirm shortly.`, 'ok'); history.replaceState(null, '', '#billing'); route(); }
        catch (err) { VS.showFieldErrors(e.target, err.fields || {}); toast(err.message, 'bad'); VS.busy(b, false); }
      };
    };
    draw(); el.style.scrollMarginTop = '84px'; el.scrollIntoView({ behavior: 'smooth' });
  };
  $$('[data-buy]', v).forEach((b) => (b.onclick = () => checkout(b.dataset.buy)));
  if (pre) checkout(pre);
};

VIEWS.api = async (v) => {
  const keys = (await api('/api/keys')).data;
  const allowed = ['pro', 'scale'].includes(ME.credits.plan) || ME.role === 'admin';
  v.innerHTML = `<div class="row between wrapr"><div><h2 style="font-size:1.5rem;margin:0">API keys</h2><p class="muted" style="margin:4px 0 0">Use keys from your server to call the <a href="/api-docs" style="color:var(--brand)">${esc(CFG.brand.short)} API</a>.</p></div><button class="btn btn-primary" id="nk">+ New key</button></div>
    ${allowed ? '' : `<div class="notice" style="margin:18px 0">API calls need the <b>Pro</b> or <b>Scale</b> plan. You can create keys now — they start working when you upgrade. <a href="#billing" style="color:var(--brand)">Upgrade →</a></div>`}
    <div id="newkey"></div>
    <div class="table-wrap" style="margin-top:18px"><table><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr>
    ${keys.length ? keys.map((k) => `<tr><td>${esc(k.name)}</td><td class="mono">${esc(k.preview)}</td><td>${VS.ago(k.createdAt)}</td><td>${k.lastUsed ? VS.ago(k.lastUsed) : '<span class="dim">never</span>'}</td><td style="text-align:right"><button class="btn btn-danger btn-sm" data-dk="${k.id}">Revoke</button></td></tr>`).join('') : '<tr><td colspan="5" class="dim" style="text-align:center;padding:24px">No keys yet.</td></tr>'}</table></div>
    <h3 style="margin-top:28px">Quick start</h3><pre><code>curl -X POST ${location.origin}/v1/text-to-speech \\
  -H "x-api-key: vs_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Hello world", "voice_id": "${esc(VOICES[0]?.id || 'v_your_voice_id')}"}'</code></pre>`;
  $('#nk').onclick = async () => {
    const name = prompt('Key name (e.g. "My website")', 'Default key'); if (name === null) return;
    try { const r = await api('/api/keys', { method: 'POST', body: { name } });
      await VIEWS.api(v);
      $('#newkey').innerHTML = `<div class="notice info" style="margin-top:18px"><b>Copy your key now — it won't be shown again.</b><div class="row" style="margin-top:10px"><input class="mono" readonly value="${esc(r.data.key)}" id="kv"><button class="btn btn-primary btn-sm" id="kc">Copy</button></div></div>`;
      $('#kc').onclick = () => { navigator.clipboard.writeText(r.data.key); toast('Copied', 'ok'); };
    } catch (e) { toast(e.message, 'bad'); }
  };
  $$('[data-dk]', v).forEach((b) => (b.onclick = async () => { if (confirmBox('Revoke this key? Apps using it will stop working.')) { await api('/api/keys/' + b.dataset.dk, { method: 'DELETE' }); toast('Key revoked', 'ok'); VIEWS.api(v); } }));
};

VIEWS.referral = async (v) => {
  await refreshMe();
  const link = `${location.origin}/auth/register?ref=${ME.referralCode}`;
  v.innerHTML = `<div class="card" style="max-width:760px"><span class="eyebrow">Refer & earn</span><h2 style="font-size:1.7rem">Give ${VS.short(CFG.referralBonus)}, get ${VS.short(CFG.referralBonus)}</h2>
    <p class="muted">Share your link. When a friend signs up with it, you both get <b>${num(CFG.referralBonus)}</b> bonus characters that never expire.</p>
    <div class="field"><label>Your referral link</label><div class="row"><input readonly value="${esc(link)}" class="mono"><button class="btn btn-primary" id="cp">Copy</button></div></div>
    <div class="field"><label>Your code</label><b class="mono grad-text" style="font-size:1.6rem">${ME.referralCode}</b></div>
    <div class="row wrapr"><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`I make my voiceovers with ${CFG.brand.name} — sign up with my link and we both get ${VS.short(CFG.referralBonus)} free characters: ${link}`)}">Share on WhatsApp</a>
    <a class="btn btn-ghost" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}">Share on Facebook</a></div>
    <div class="grid g2" style="margin-top:24px"><div class="card stat" style="background:var(--bg-2)"><span>Friends joined</span><b>${ME.stats.referrals}</b></div><div class="card stat" style="background:var(--bg-2)"><span>Characters earned</span><b>${VS.short(ME.stats.referrals * CFG.referralBonus)}</b></div></div></div>`;
  $('#cp').onclick = () => { navigator.clipboard.writeText(link); toast('Link copied', 'ok'); };
};

VIEWS.settings = async (v) => {
  v.innerHTML = `<div class="grid" style="max-width:720px;gap:20px">
    <form class="card" id="pf"><h3>Profile</h3><div class="field"><label>Name</label><input name="name" value="${esc(ME.name)}"></div><div class="field"><label>Email</label><input value="${esc(ME.email)}" disabled></div><button class="btn btn-primary">Save</button></form>
    <form class="card" id="pw"><h3>Change password</h3><div class="field"><label>Current password</label><input type="password" name="current" autocomplete="current-password"></div><div class="field"><label>New password</label><input type="password" name="next" autocomplete="new-password"></div><button class="btn btn-primary">Update password</button></form>
    <div class="card"><h3>Session</h3><p class="muted">Signed in as ${esc(ME.email)} · member since ${new Date(ME.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p><button class="btn btn-ghost" id="lo">Sign out</button></div>
    <form class="card" id="dl" style="border-color:rgba(248,113,113,.35)"><h3 style="color:var(--bad)">Delete account</h3><p class="muted">Permanently deletes your generations, private voices and API keys. This cannot be undone.</p><div class="field"><label>Confirm with your password</label><input type="password" name="password"></div><button class="btn btn-danger">Delete my account</button></form></div>`;
  const sub = (id, url, done) => ($(id).onsubmit = async (e) => { e.preventDefault(); const b = e.target.querySelector('button'); VS.busy(b, true); try { await api(url, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); done(e.target); } catch (err) { VS.showFieldErrors(e.target, err.fields || {}); toast(err.message, 'bad'); } VS.busy(b, false); });
  sub('#pf', '/api/me/profile', async () => { await refreshMe(); drawSide('settings'); toast('Saved', 'ok'); });
  sub('#pw', '/api/me/password', (f) => { f.reset(); toast('Password updated', 'ok'); });
  $('#dl').onsubmit = async (e) => { e.preventDefault(); if (!confirmBox('Really delete your account forever?')) return; try { await api('/api/me/delete', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); location.href = '/'; } catch (err) { toast(err.message, 'bad'); } };
  $('#lo').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; };
};

VIEWS.admin = async (v) => {
  const tab = qs().get('t') || 'payments';
  const s = (await api('/api/admin/stats')).data;
  v.innerHTML = `<div class="grid g4" style="margin-bottom:22px">
    <div class="card stat"><span>Users</span><b>${num(s.users)}</b><span>${s.paidUsers} paid</span></div>
    <div class="card stat"><span>Revenue (approved)</span><b>Rs ${VS.short(s.revenue)}</b></div>
    <div class="card stat"><span>Pending payments</span><b style="color:${s.pendingPayments ? 'var(--warn)' : 'inherit'}">${s.pendingPayments}</b></div>
    <div class="card stat"><span>Last 24h</span><b>${num(s.generations24h)}</b><span>${VS.short(s.chars24h)} chars</span></div></div>
    <div class="seg" style="margin-bottom:18px">${['payments', 'users', 'voices'].map((t) => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div><div id="at"></div>`;
  $$('[data-t]', v).forEach((b) => (b.onclick = () => (location.hash = 'admin?t=' + b.dataset.t)));
  const at = $('#at');
  if (tab === 'payments') {
    const ps = (await api('/api/admin/payments')).data;
    at.innerHTML = `<div class="table-wrap"><table><tr><th>Invoice</th><th>User</th><th>Item</th><th>Amount</th><th>Method</th><th>Txn ID / sender</th><th>Date</th><th>Status</th></tr>
      ${ps.map((p) => `<tr><td class="mono">${p.invoice}</td><td>${esc(p.userEmail)}</td><td>${esc(p.itemName)}</td><td>Rs ${num(p.amount)}</td><td>${esc(CFG.payment[p.method]?.title || p.method)}</td><td class="mono">${esc(p.txnId)}<div class="dim">${esc(p.sender)}</div></td><td>${VS.ago(p.createdAt)}</td>
        <td>${p.status === 'pending' ? `<div class="row"><button class="btn btn-primary btn-sm" data-ap="${p.id}">Approve</button><button class="btn btn-danger btn-sm" data-rj="${p.id}">Reject</button></div>` : `<span class="badge ${p.status === 'approved' ? 'ok' : 'bad'}">${p.status}</span>`}</td></tr>`).join('') || '<tr><td colspan="8" class="dim" style="text-align:center;padding:24px">No payments yet.</td></tr>'}</table></div>`;
    at.onclick = async (e) => {
      const ap = e.target.dataset.ap, rj = e.target.dataset.rj;
      if (ap && confirmBox('Approve and add credits? Check you received the money first.')) { await api(`/api/admin/payments/${ap}/approve`, { method: 'POST' }); toast('Approved — credits added', 'ok'); route(); }
      if (rj) { const note = prompt('Reason shown to the customer', 'Payment not received'); if (note !== null) { await api(`/api/admin/payments/${rj}/reject`, { method: 'POST', body: { note } }); toast('Rejected'); route(); } }
    };
  }
  if (tab === 'users') {
    const us = (await api('/api/admin/users')).data;
    at.innerHTML = `<input id="uq" placeholder="Search email or name…" style="max-width:320px;margin-bottom:14px"><div class="table-wrap"><table id="ut"></table></div>`;
    const draw = (q = '') => ($('#ut').innerHTML = `<tr><th>User</th><th>Plan</th><th>Remaining</th><th>Used</th><th>Gens</th><th>Joined</th><th></th></tr>` + us.filter((u) => !q || (u.email + u.name).toLowerCase().includes(q)).map((u) => `<tr><td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="badge soft">admin</span>' : ''}${u.disabled ? ' <span class="badge bad">disabled</span>' : ''}<div class="dim">${esc(u.email)}</div></td><td>${esc(u.credits.planName)}</td><td>${num(u.credits.remaining)}</td><td>${num(u.credits.used)}</td><td>${u.generations}</td><td>${VS.ago(u.createdAt)}</td>
      <td><select data-act="${u.id}" style="width:auto;padding:6px 10px;font-size:13px"><option value="">Actions…</option><option value="chars">Add characters</option><option value="plan">Set plan</option><option value="${u.disabled ? 'enable' : 'disable'}">${u.disabled ? 'Enable' : 'Disable'} account</option><option value="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Remove admin' : 'Make admin'}</option></select></td></tr>`).join(''));
    draw(); $('#uq').oninput = (e) => draw(e.target.value.toLowerCase());
    at.onchange = async (e) => {
      const id = e.target.dataset.act, a = e.target.value; if (!id || !a) return; let body;
      if (a === 'chars') { const n = prompt('Characters to add (negative to remove)', '100000'); if (n) body = { addChars: Number(n) }; }
      if (a === 'plan') { const p = prompt('Plan id: ' + CFG.plans.map((x) => x.id).join(', ')); if (p) body = { plan: p.trim() }; }
      if (a === 'disable' || a === 'enable') body = { disabled: a === 'disable' };
      if (a === 'admin' || a === 'user') body = { role: a };
      if (body) { await api('/api/admin/users/' + id, { method: 'POST', body }); toast('Updated', 'ok'); route(); } else e.target.value = '';
    };
  }
  if (tab === 'voices') {
    const vs = (await api('/api/admin/voices')).data;
    const missing = vs.filter((x) => x.library && !x.hasPreview).length;
    at.innerHTML = `<div class="notice info" style="margin-bottom:14px">Library voices are the engine's built-in stock voices. Voices marked <b>Public</b> appear in the playground and every user's library. Only publish your own clones if you have the speaker's written consent.</div>
      <div class="card row between wrapr" style="margin-bottom:14px"><div><b>Preview clips</b><div class="dim" style="font-size:13px">${vs.filter((x) => x.library).length - missing} of ${vs.filter((x) => x.library).length} library voices have a ▶ preview. Generating them uses about ${VS.num(missing * 120)} engine characters, one time.</div></div>
        <button class="btn btn-primary" id="genp" ${missing ? '' : 'disabled'}>${missing ? 'Generate missing previews' : 'All previews ready'}</button></div>
      <div class="row wrapr" style="margin-bottom:12px"><input id="avq" placeholder="Search voices…" style="max-width:260px"><div class="chips">${['All', 'Library', 'Clones'].map((t) => `<button class="chip" data-avt="${t}">${t}</button>`).join('')}</div></div>
      <div class="table-wrap"><table id="avt"></table></div>`;
    let tabF = 'All';
    const draw = () => {
      const q = $('#avq').value.toLowerCase();
      $$('[data-avt]', at).forEach((c) => c.classList.toggle('on', c.dataset.avt === tabF));
      const list = vs.filter((x) => (tabF === 'All' || (tabF === 'Library') === !!x.library) && (!q || x.name.toLowerCase().includes(q)));
      $('#avt').innerHTML = `<tr><th>Voice</th><th>Owner</th><th>Language</th><th>Preview</th><th>Public</th></tr>` + list.map((x) => `<tr><td><b>${esc(x.name)}</b><div class="dim">${esc(x.gender)}</div></td><td>${esc(x.owner)}</td><td>${VS.flag(x.locale || x.language)} ${VS.langName(x.language)}</td>
        <td>${x.sample ? `<button class="play-btn" data-play="${x.sample}">▶</button>` : '<span class="dim">—</span>'}${x.library && !x.hasPreview ? ' <span class="dim" style="font-size:12px">not generated</span>' : ''}</td><td><label class="row"><input type="checkbox" data-pub="${x.id}" ${x.public ? 'checked' : ''}> ${x.public ? 'Public' : 'Hidden'}</label></td></tr>`).join('');
    };
    draw();
    $('#avq').oninput = draw;
    let au;
    at.onclick = (e) => {
      const t = e.target.closest('[data-avt]'); if (t) { tabF = t.dataset.avt; draw(); }
      const p = e.target.closest('[data-play]'); if (p) VS.play(p, p.dataset.play);
    };
    at.onchange = async (e) => { const id = e.target.dataset.pub; if (id) { await api('/api/admin/voices/' + id, { method: 'POST', body: { public: e.target.checked } }); const x = vs.find((y) => y.id === id); x.public = e.target.checked; draw(); toast('Saved', 'ok'); } };
    const gb = $('#genp');
    if (gb) gb.onclick = async () => {
      if (!confirmBox(`Generate ${missing} preview clips? This uses about ${VS.num(missing * 120)} characters from your engine account.`)) return;
      gb.disabled = true; let done = 0, errs = [];
      try {
        for (let i = 0; i < 40; i++) {
          gb.innerHTML = `<span class="spin"></span> ${done} / ${missing}…`;
          const r = (await api('/api/admin/previews', { method: 'POST', body: {} })).data;
          done += r.generated; errs = r.errors;
          if (!r.remaining || (!r.generated && r.errors.length)) break;
        }
      } catch (e) { errs = [e.message]; }
      if (errs.length) toast('Some previews failed: ' + errs[0], 'bad'); else toast(`${done} previews ready`, 'ok');
      route();
    };
  }
};

// ── boot ────────────────────────────────────────────────
(async () => {
  try {
    CFG = await VS.loadConfig();
    ME = (await api('/api/me')).data;
  } catch { location.href = '/auth/login?next=' + encodeURIComponent('/app' + location.hash); return; }
  document.title = `Dashboard — ${CFG.brand.name}`;
  await loadVoices().catch(() => {});
  window.addEventListener('hashchange', route);
  route();
})();
