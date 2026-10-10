/* Shared site script: header, footer, config, helpers, pricing, playground, voice picker */
const VS = (window.VS = {});
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
VS.$ = $; VS.$$ = $$;
VS.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
VS.num = (n) => Number(n || 0).toLocaleString('en-US');
VS.short = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? +(n / 1e3).toFixed(1) + 'K' : String(n));
VS.ago = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
VS.flag = (l) => {
  l = String(l || '');
  const region = l.includes('-') ? l.split('-')[1] : ({ en: 'US', ur: 'PK', ar: 'SA', hi: 'IN', es: 'ES', fr: 'FR', de: 'DE', pt: 'BR', it: 'IT', ru: 'RU', tr: 'TR', zh: 'CN', ja: 'JP', ko: 'KR', bn: 'BD', pa: 'PK', fa: 'IR', id: 'ID', ms: 'MY', nl: 'NL', he: 'IL' })[l];
  return region ? String.fromCodePoint(...[...region.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '🌐';
};
VS.langName = (l) => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(l); } catch { return l; } };

VS.api = async (url, opts = {}) => {
  const o = { credentials: 'same-origin', ...opts };
  if (o.body && !(o.body instanceof FormData)) { o.headers = { 'Content-Type': 'application/json', ...(o.headers || {}) }; o.body = JSON.stringify(o.body); }
  let r, j;
  try { r = await fetch(url, o); j = await r.json(); } catch { throw Object.assign(new Error('Network error — check your connection.'), { code: 'NETWORK' }); }
  if (!j.success) throw Object.assign(new Error(j.error?.message || 'Request failed'), { code: j.error?.code, fields: j.error?.fields, status: r.status });
  return j;
};
VS.toast = (msg, kind = '') => {
  let z = $('.toast-zone'); if (!z) { z = document.createElement('div'); z.className = 'toast-zone'; document.body.appendChild(z); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; z.appendChild(t);
  setTimeout(() => t.remove(), 4500);
};
VS.showFieldErrors = (form, fields = {}) => {
  $$('.field', form).forEach((f) => { f.classList.remove('invalid'); const e = $('.err', f); if (e) e.textContent = ''; });
  Object.entries(fields).forEach(([k, v]) => {
    const inp = form.querySelector(`[name="${k}"]`); const f = inp?.closest('.field');
    if (f) { f.classList.add('invalid'); let e = $('.err', f); if (!e) { e = document.createElement('div'); e.className = 'err'; f.appendChild(e); } e.textContent = v; }
  });
};
VS.busy = (btn, on, label) => { if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${label || 'Working…'}`; } else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; } };

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="#04122a" stroke-width="2.6" stroke-linecap="round"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/></svg>`;
VS.LOGO = LOGO;

// One shared demo player: ▶ / spinner / ■, with readable errors
VS.player = { audio: null, btn: null };
VS.play = async (btn, url) => {
  const P = VS.player;
  const reset = (b) => { if (b) { b.innerHTML = '▶'; b.disabled = false; } };
  if (P.btn === btn && P.audio && !P.audio.paused) { P.audio.pause(); reset(btn); P.btn = null; return; }
  P.audio?.pause(); reset(P.btn);
  P.btn = btn; btn.innerHTML = '<span class="spin" style="width:12px;height:12px"></span>'; btn.disabled = true;
  const a = new Audio(url); P.audio = a;
  a.onplaying = () => { btn.disabled = false; btn.innerHTML = '■'; };
  a.onended = () => { reset(btn); P.btn = null; };
  a.onerror = async () => {
    reset(btn); P.btn = null;
    let msg = 'Preview not available right now.';
    try { const j = await fetch(url).then((r) => r.json()); if (j?.error?.message) msg = j.error.message; } catch {}
    VS.toast(msg, 'bad');
  };
  a.play().catch(() => {});
};

VS.config = null;
VS.loadConfig = async () => { if (!VS.config) VS.config = (await VS.api('/api/config')).data; return VS.config; };
VS.me = undefined;
VS.loadMe = async () => { if (VS.me === undefined) { try { VS.me = (await VS.api('/api/session')).data; } catch { VS.me = null; } } return VS.me; };

// ── header / footer ─────────────────────────────────────
function header(cfg, me) {
  const p = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const link = (href, label) => `<a href="${href}" class="${p === href ? 'active' : ''}">${label}</a>`;
  const right = me
    ? `<a class="btn btn-ghost btn-sm" href="/app">Dashboard</a>`
    : `<a class="btn btn-sm" href="/auth/login">Sign in</a><a class="btn btn-primary btn-sm" href="/auth/register">Get started free</a>`;
  const sale = cfg.flashSale ? `<div class="salebar">🔥 <b>${VS.esc(cfg.flashSale.label)}</b> — first month discount on every plan <span class="mono" data-countdown></span></div>` : '';
  return `${sale}<nav class="nav"><div class="wrap">
    <a class="logo" href="/"><span class="logo-mark">${LOGO}</span>${VS.esc(cfg.brand.short)}<span class="grad-text">.</span></a>
    <div class="nav-links">${link('/', 'Home')}${link('/pricing', 'Pricing')}${link('/how-it-works', 'How it works')}${link('/voices', 'Voices')}${link('/contact', 'Contact')}
      <div class="nav-drop"><button>Resources ▾</button><div class="menu">
        <a href="/api-docs">API documentation</a><a href="/help">Help center</a><a href="/faqs">FAQs</a><a href="/changelog">Changelog</a><a href="/about">About us</a>
      </div></div></div>
    <div class="nav-right">${right}</div>
    <button class="burger" aria-label="Menu" onclick="document.querySelector('.mobile-menu').classList.toggle('open')">☰</button>
  </div><div class="mobile-menu">
    <a href="/">Home</a><a href="/pricing">Pricing</a><a href="/how-it-works">How it works</a><a href="/voices">Voices</a><a href="/contact">Contact</a><a href="/api-docs">API docs</a><a href="/help">Help center</a>
    ${me ? '<a href="/app">Dashboard</a>' : '<a href="/auth/login">Sign in</a><a class="btn btn-primary" href="/auth/register">Get started free</a>'}
  </div></nav>`;
}
function footer(cfg) {
  const b = cfg.brand;
  return `<footer><div class="wrap"><div class="foot">
    <div><a class="logo" href="/"><span class="logo-mark">${LOGO}</span>${VS.esc(b.short)}</a>
      <p class="muted" style="margin-top:16px;max-width:300px">${VS.esc(b.tagline)}. AI text-to-speech and voice cloning in 20+ languages, made in Pakistan.</p>
      <p class="dim" style="font-size:13px">${VS.esc(b.company)}<br>${VS.esc(b.address)}</p></div>
    <div><h4>Product</h4><a href="/">Overview</a><a href="/pricing">Pricing</a><a href="/voices">Voice library</a><a href="/changelog">Changelog</a></div>
    <div><h4>Company</h4><a href="/about">About</a><a href="/how-it-works">How it works</a><a href="/contact">Contact</a><a href="https://wa.me/${b.whatsapp}" target="_blank" rel="noopener">WhatsApp</a></div>
    <div><h4>Legal</h4><a href="/privacy">Privacy policy</a><a href="/terms">Terms & conditions</a><a href="/refund">Refund policy</a><a href="/faqs">FAQs</a></div>
    <div><h4>Account</h4><a href="/auth/login">Login</a><a href="/auth/register">Register</a><a href="/help">Help center</a><a href="/api-docs">API docs</a></div>
  </div><div class="foot-bottom"><span>© ${new Date().getFullYear()} ${VS.esc(b.name)}. All rights reserved.</span><span>Payments: ${b.paymentMethods.join(' · ')} · Built in Pakistan 🇵🇰</span></div></div></footer>`;
}

// flash-sale countdown that rolls over every N hours
function countdown(cfg) {
  if (!cfg.flashSale) return;
  const span = cfg.flashSale.hours * 3600e3;
  const tick = () => {
    const left = span - (Date.now() % span);
    const h = Math.floor(left / 3600e3), m = Math.floor((left % 3600e3) / 60e3), s = Math.floor((left % 60e3) / 1000);
    const txt = `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    $$('[data-countdown]').forEach((el) => (el.textContent = txt));
  };
  tick(); setInterval(tick, 1000);
}

function fillBrand(cfg) {
  const b = cfg.brand;
  const map = { name: b.name, short: b.short, email: b.email, whatsapp: b.whatsappDisplay, company: b.company, founder: b.founder, founderTitle: b.founderTitle, address: b.address, hours: b.hours, free: VS.num(cfg.freeMonthlyChars), freeShort: VS.short(cfg.freeMonthlyChars) };
  $$('[data-b]').forEach((el) => { if (map[el.dataset.b] !== undefined) el.textContent = map[el.dataset.b]; });
  $$('[data-wa]').forEach((el) => (el.href = `https://wa.me/${b.whatsapp}?text=${encodeURIComponent(el.dataset.wa || 'Hi ' + b.short + '!')}`));
  $$('[data-mail]').forEach((el) => (el.href = `mailto:${b.email}`));
  document.title = document.title.replace(/\{brand\}/g, b.name);
}

function reveal() {
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { threshold: .12 });
  $$('.reveal').forEach((el) => io.observe(el));
}

// ── pricing ─────────────────────────────────────────────
VS.renderPricing = (el, cfg) => {
  let cur = 'PKR';
  const money = (pkr) => (cur === 'PKR' ? 'Rs ' + VS.num(pkr) : '$' + (pkr / cfg.usdRate).toFixed(2));
  const draw = () => {
    el.innerHTML = `<div class="row" style="justify-content:center;margin-bottom:36px"><div class="toggle"><button data-c="PKR" class="${cur === 'PKR' ? 'on' : ''}">PKR</button><button data-c="USD" class="${cur === 'USD' ? 'on' : ''}">USD</button></div></div>
    <div class="plans">${cfg.plans.map((p) => `<div class="card plan ${p.popular ? 'popular' : ''}">
      ${p.popular ? '<span class="badge">Most popular</span>' : ''}
      <h3>${VS.esc(p.name)}</h3><p class="muted" style="font-size:14px;min-height:44px">${VS.esc(p.blurb)}</p>
      <div><span class="price">${money(p.firstMonth || p.price)}</span> <small class="dim">/ first month</small></div>
      ${p.firstMonth && p.firstMonth < p.price ? `<div class="dim" style="font-size:13px">then ${money(p.price)}/mo · <span class="strike">${money(p.price)}</span> <span class="badge soft" style="padding:3px 7px">save ${money(p.price - p.firstMonth)}</span></div>` : `<div class="dim" style="font-size:13px">per month</div>`}
      <ul>${p.features.map((f) => `<li>${VS.esc(f)}</li>`).join('')}</ul>
      <a class="btn ${p.popular ? 'btn-primary' : 'btn-ghost'} btn-block" href="/app#billing?plan=${p.id}">Choose ${VS.esc(p.name)}</a>
    </div>`).join('')}</div>
    <div class="card" style="margin-top:20px;display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:space-between">
      <div><h3 style="margin:0">Free forever</h3><p class="muted" style="margin:4px 0 0">${VS.num(cfg.freeMonthlyChars)} characters every month, voice cloning included. No card needed.</p></div>
      <a class="btn btn-ghost" href="/auth/register">Start free</a></div>
    <div class="card" style="margin-top:16px;display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:space-between">
      <div><h3 style="margin:0">Custom & enterprise</h3><p class="muted" style="margin:4px 0 0">Need 20M+ characters, invoicing or a private deployment? Let's talk.</p></div>
      <a class="btn btn-ghost" data-wa="Hi, I'd like a custom ${VS.esc(cfg.brand.short)} plan" target="_blank" rel="noopener">WhatsApp sales</a></div>`;
    $$('[data-c]', el).forEach((b) => (b.onclick = () => { cur = b.dataset.c; draw(); }));
    fillBrand(cfg);
  };
  draw();
};

// ── voice picker modal (used by playground + studio) ────
VS.voicePicker = ({ voices, current, onPick, title = 'Choose a voice' }) => {
  let filter = { tab: 'All', g: 'All', l: 'All', q: '' };
  const mine = voices.filter((v) => v.mine).length, lib = voices.filter((v) => v.library).length;
  const tabs = [['All', voices.length], ['Library', lib], ...(mine ? [['My clones', mine]] : []), ...(voices.length - lib - mine ? [['Community', voices.length - lib - mine]] : [])];
  const langs = ['All', ...new Set(voices.map((v) => v.language))];
  const back = document.createElement('div'); back.className = 'modal-back open';
  back.innerHTML = `<div class="modal" role="dialog" aria-label="${title}"><div class="modal-head"><div><span class="label" style="margin:0 0 6px">Voice library</span><h3 style="margin:0">${title}</h3><small class="dim">${voices.length} voices · ${langs.length - 1} languages</small></div><button class="x" aria-label="Close">×</button></div>
    <div class="modal-body"><div class="chips" data-tabs style="margin-bottom:12px"></div>
      <div class="row wrapr" style="margin-bottom:14px"><input placeholder="Search voices…" data-q style="flex:1;min-width:160px">
      <div class="chips">${['All', 'Male', 'Female'].map((g) => `<button class="chip" data-g="${g}">${g}</button>`).join('')}</div>
      <select data-l style="width:auto">${langs.map((l) => `<option value="${l}">${l === 'All' ? 'All languages' : VS.flag(l) + ' ' + VS.langName(l)}</option>`).join('')}</select></div>
      <div data-list></div></div></div>`;
  document.body.appendChild(back);
  let audio;
  const close = () => { VS.player.audio?.pause(); back.remove(); };
  back.onclick = (e) => { if (e.target === back) close(); };
  $('.x', back).onclick = close;
  const item = (v) => `<div class="voice-item ${current === v.id ? 'on' : ''}" data-id="${v.id}" role="button" tabindex="0">
      <span class="avatar">${VS.esc((v.name[0] || '?').toUpperCase())}</span><span style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${VS.esc(v.name)}</b><small>${VS.flag(v.locale || v.language)} ${VS.langName(v.language)} · ${VS.esc(v.gender)}${v.mine ? ' · <span style="color:var(--brand)">Your clone</span>' : ''}</small></span>
      ${v.sample ? `<button class="play-btn" data-play="${v.sample}" aria-label="Preview">▶</button>` : ''}</div>`;
  const draw = () => {
    $('[data-tabs]', back).innerHTML = tabs.map(([t, n]) => `<button class="chip ${filter.tab === t ? 'on' : ''}" data-tab="${t}">${t} <span class="dim">${n}</span></button>`).join('');
    $$('[data-g]', back).forEach((c) => c.classList.toggle('on', c.dataset.g === filter.g));
    const list = voices.filter((v) => (filter.tab === 'All' || (filter.tab === 'Library' && v.library) || (filter.tab === 'My clones' && v.mine) || (filter.tab === 'Community' && !v.library && !v.mine))
      && (filter.g === 'All' || v.gender === filter.g) && (filter.l === 'All' || v.language === filter.l) && (!filter.q || v.name.toLowerCase().includes(filter.q)));
    const groups = {};
    list.forEach((v) => { const k = v.mine ? 'My clones' : !v.library ? 'Community' : VS.langName(v.language); (groups[k] = groups[k] || []).push(v); });
    $('[data-list]', back).innerHTML = list.length ? Object.entries(groups).map(([k, vs]) => `<div class="label" style="margin:16px 0 10px">${VS.esc(k)} <span class="dim">· ${vs.length}</span></div><div class="voice-list">${vs.map(item).join('')}</div>`).join('') : '<div class="empty">No voices match.</div>';
  };
  $('[data-q]', back).oninput = (e) => { filter.q = e.target.value.toLowerCase(); draw(); };
  $('[data-l]', back).onchange = (e) => { filter.l = e.target.value; draw(); };
  back.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) { filter.tab = tb.dataset.tab; draw(); return; }
    const g = e.target.closest('[data-g]'); if (g) { filter.g = g.dataset.g; draw(); return; }
    const pl = e.target.closest('[data-play]');
    if (pl) { e.stopPropagation(); VS.play(pl, pl.dataset.play); return; }
    const it = e.target.closest('.voice-item'); if (it) { onPick(voices.find((v) => v.id === it.dataset.id)); close(); }
  });
  draw();
  setTimeout(() => $('[data-q]', back).focus(), 50);
};

VS.PRESETS = {
  Narration: 'In the quiet valleys of the north, where rivers carve their way through ancient stone, a story begins — one of patience, of seasons, and of the people who learned to listen to the land.',
  News: 'Good evening. Tonight\'s top stories: record rainfall across the region, new investment in solar energy, and the city prepares for its biggest tech summit yet. Here are the details.',
  Story: 'Once upon a time, in a small village by the sea, there lived a girl who could hear the whispers of the wind. Every night, she climbed the hill to listen to its secrets.',
  Ad: 'Tired of boring voiceovers? Create studio-quality audio in seconds — no microphone, no studio, no waiting. Try it free today!',
  Conversation: 'Hey! Did you get a chance to look at the draft I sent? I think the intro is strong, but the ending could use a bit more punch. What do you think?',
};

// ── homepage playground ─────────────────────────────────
VS.playground = async (root, cfg) => {
  const voices = (await VS.api('/api/public-voices')).data;
  let voice = voices[0] || null;
  root.innerHTML = `<div class="pg">
    <div class="card"><span class="label">Script</span>
      <textarea data-text maxlength="${cfg.playgroundLimit}" placeholder="Type anything and hear it in a natural voice…"></textarea>
      <div class="row between wrapr" style="margin-top:12px"><div class="chips">${Object.keys(VS.PRESETS).map((k) => `<button class="chip" data-preset="${k}">${k}</button>`).join('')}</div>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">Import .txt<input type="file" accept=".txt" hidden data-file></label></div>
      <div class="row between" style="margin-top:16px"><span class="dim mono" data-count>0/${cfg.playgroundLimit}</span><button class="btn btn-primary" data-go>Generate speech ↵</button></div>
      <div data-out></div></div>
    <div class="grid" style="align-content:start">
      <div class="card"><span class="label">Voice</span>
        <div class="voice-pill" data-voice></div>
        <button class="btn btn-ghost btn-block" style="margin-top:12px" data-change ${voices.length ? '' : 'disabled'}>Change voice</button></div>
      <div class="card"><span class="label">Details</span>
        <div class="kv"><span>Characters</span><b data-d-c>0</b></div><div class="kv"><span>Remaining</span><b data-d-r>${cfg.playgroundLimit}</b></div>
        <div class="kv"><span>Words</span><b data-d-w>0</b></div><div class="kv"><span>Est. duration</span><b data-d-t>—</b></div><div class="kv"><span>Model</span><b>Studio HD</b></div></div>
    </div></div>`;
  const ta = $('[data-text]', root);
  const drawVoice = () => ($('[data-voice]', root).innerHTML = voice ? `<span class="avatar">${VS.esc(voice.name[0]).toUpperCase()}</span><div><b>${VS.esc(voice.name)}</b><div class="dim" style="font-size:13px">${VS.flag(voice.locale || voice.language)} ${VS.langName(voice.language)} · ${VS.esc(voice.gender)}</div></div>` : '<span class="dim">Library voices are being added — create a free account to clone your own.</span>');
  const update = () => {
    const t = ta.value, w = t.trim() ? t.trim().split(/\s+/).length : 0;
    $('[data-count]', root).textContent = `${t.length}/${cfg.playgroundLimit}`;
    $('[data-d-c]', root).textContent = t.length; $('[data-d-r]', root).textContent = cfg.playgroundLimit - t.length; $('[data-d-w]', root).textContent = w;
    $('[data-d-t]', root).textContent = w ? `~${Math.max(1, Math.round(w / 2.5))}s` : '—';
  };
  drawVoice(); update();
  ta.oninput = update;
  $$('[data-preset]', root).forEach((b) => (b.onclick = () => { ta.value = VS.PRESETS[b.dataset.preset].slice(0, cfg.playgroundLimit); update(); }));
  $('[data-file]', root).onchange = async (e) => { const f = e.target.files[0]; if (f) { ta.value = (await f.text()).slice(0, cfg.playgroundLimit); update(); } };
  $('[data-change]', root).onclick = () => VS.voicePicker({ voices, current: voice?.id, onPick: (v) => { voice = v; drawVoice(); } });
  const go = async () => {
    const btn = $('[data-go]', root);
    if (!voice) return VS.toast('No library voice yet — sign up to clone your own.', 'bad');
    if (!ta.value.trim()) return VS.toast('Write something first.', 'bad');
    VS.busy(btn, true, 'Generating…');
    try {
      const r = await VS.api('/api/playground', { method: 'POST', body: { text: ta.value, voiceId: voice.id } });
      $('[data-out]', root).innerHTML = `<div class="player"><audio controls autoplay src="${r.data.audio}"></audio><div class="row between" style="margin-top:10px"><small class="dim">${r.remainingToday} free generations left today</small><a class="btn btn-ghost btn-sm" href="/auth/register">Download → free account</a></div></div>`;
    } catch (e) { VS.toast(e.message, 'bad'); if (e.code === 'PLAYGROUND_LIMIT') $('[data-out]', root).innerHTML = `<div class="notice info" style="margin-top:14px">${VS.esc(e.message)} <a href="/auth/register" style="color:var(--brand);font-weight:600">Create account →</a></div>`; }
    VS.busy(btn, false);
  };
  $('[data-go]', root).onclick = go;
  ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); };
};

// ── boot ────────────────────────────────────────────────
VS.boot = async () => {
  const cfg = await VS.loadConfig();
  const me = await VS.loadMe();
  const h = $('#site-header'); if (h) h.outerHTML = header(cfg, me);
  const f = $('#site-footer'); if (f) f.outerHTML = footer(cfg);
  fillBrand(cfg); countdown(cfg); reveal();
  $$('[data-pricing]').forEach((el) => VS.renderPricing(el, cfg));
  $$('[data-playground]').forEach((el) => VS.playground(el, cfg));
  document.dispatchEvent(new CustomEvent('vs:ready', { detail: { cfg, me } }));
};
if (!window.VS_NO_BOOT) document.addEventListener('DOMContentLoaded', VS.boot);
