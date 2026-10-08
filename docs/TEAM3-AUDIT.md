# TEAM 3 — EXPERT AUDIT REPORT: VoiceSync Studio @ cc9f635
**Date:** 2026-10-08 · **Method:** 10 senior engineers, code-only audit, `node --check` clean, QA 1400/1400 green · **Zero invented findings — every item has file:line proof**

Pipeline: Team 3 audits → Team 1 fixes → Team 2 tests → Team 3 re-audits.

---

## 🔴 CRITICAL (fix before anything else)

### C1. "Download MP3" delivers WAV bytes named `.mp3` (Chatterbox + Dialogue)
- **Evidence:** `js/tts.js:987` feeds `_encodeWavBytes` output into `_finishMp3Result` → `new Blob([bytes], {type:'audio/mpeg'})` (`tts.js:1007`); `exportMp3` (`app.js:1901-1904`) downloads `r.blob` as `voicesync-voice.mp3`. Dialogue: `blob = await window.Exporter.encodeWAV(buf)` (`app.js:1211`) → same `.mp3` download + "MP3 downloaded" message (`app.js:52`).
- **Repro:** Generate with Chatterbox → Download MP3 → hex shows `RIFF`.
- **Fix:** own result builder for Chatterbox (`audio/wav`); `exportMp3` picks extension from `r.blob.type`, never assumes MP3.

### C2. Share button shares mislabeled files
- **Evidence:** `shareAudio` (`app.js:2040-2051`) always names the file `voicesync-voice.wav`/`audio/wav`: Edge path shares real MP3 bytes as "WAV"; mic path shares `webm/opus` (`app.js:1834-1855`) as "WAV". WhatsApp receives an unplayable file.
- **Fix:** derive filename+MIME from `blob.type`; route mic recordings through `encodeWAV`.

### C3. Mouth desyncs linearly at speed≠1 on 3 of 5 playback paths — baked into exported video
- **Evidence:** `scaleCues()` applied at `app.js:398` (pitched) and `:1360` (Web Speech) but NOT at `:1321` (`startAudioPlayback` — the default Edge/Chatterbox/mic/dialogue path), `:1424` (`startGooglePlayback`, `playbackRate=speed` at `:1429`), `:2011` (exportVideo `onAudio`). Root cause: `Avatar.speak` samples `timeSrc.currentTime` once (`avatar.js:437`) then advances on wall-clock (`avatar.js:250`) — the "no scaling needed" comment at `app.js:1315-1317` is wrong.
- **Repro:** Edge voice, speed 2×, Play → mouth ~50% behind by clip end. Export at 2× → lips permanently out of sync in the file.
- **Fix:** wrap the three call sites in `scaleCues(cues, state.speed||1)`, or make `frame()` read `state.audio.currentTime` per frame.

### C4. `loadVoices()` has no concurrency guard — rapid clicks generate with the WRONG voice
- **Evidence:** `app.js:620` async, `await` at `:637`, writes `state.voiceId` at `:662`; callers fire-and-forget (`:762`, `:781`). Click card B then card A fast → responses resolve out of order → `ttsLang`/`voiceId` mismatch → Urdu text synthesized with an English voice, no warning.
- **Fix:** request token (`state.voicesReq`, discard stale responses); `onGenerate` awaits in-flight load; re-render cards (not just box) on the filtered-out path.

### C5. Stale 90s watchdog from a previous run can kill a subsequent run
- **Evidence:** `js/tts.js:720-741` — timer in closure, never cleared by `cancel()` or new `synthesize()`; `cancel()` can't abort in-flight Chatterbox (`client.predict` no signal, audio `fetch` at `:913` no `AbortSignal`, not in `_activeControllers`); `_cancelled` is one global flag reset per run; `_activeWS` one slot. Run A's late timer fires during run B → closes B's socket → fresh Generate mysteriously fails.
- **Fix:** per-run token; module-slot timer cleared on new run/cancel/settle; `AbortController` on Chatterbox fetch registered in `_activeControllers`.

### C6. Dialogue-mode throw soft-locks the UI until reload
- **Evidence:** `app.js:1552` `await synthesizeDialogue(segs)` has no try/catch; `setBusy(false)` at `:1553` never runs on throw. Throw sites: `new Float32Array(total)` at `:1194` (50k chars ≈ 343 MB — fatal on mobile), `new AC()` at `:1200`.
- **Fix:** try/catch + `setBusy(false)` in `finally`; cap dialogue text length.

### C7. Roman Urdu toggle DESTROYS pure-English text (irreversible)
- **Evidence:** `app.js:1516-1518` overwrites `box.value` with transliterated text; map contains 25+ ordinary English words (`the→تھے`, `do→دو`, `are→ارے`, `me→میں`, `main→میں`…). "How are you? Do the math." → "How ارے you? دو تھے math." — original lost.
- **Fix:** never mutate `box.value`; transliterate a copy; gate on Roman-Urdu coverage threshold.

### C8. Preview-during-Generate race → overlapping audio + result clobber
- **Evidence:** `previewVoice` calls `stopAll()` → `TTS.cancel()` sets global `_cancelled=true` (`tts.js:280`), but its own `synthesize()` resets it to `false` (`tts.js:683`) — both chains run concurrently; preview then clobbers `state.lastResult = {engine}` (`app.js:555`).
- **Fix:** per-call cancellation token instead of module-global boolean; preview aborts if a generate token is newer.

### C9. QA tests a copy of `_escapeXml`, not the real function
- **Evidence:** `qa/qa-1000.js` §10 "replicate _escapeXml logic from tts.js" — the real function (`tts.js:294`) isn't exported and is never called by the suite. SSML injection is the highest-risk untested path.
- **Fix:** export `_escapeXml` from tts.js; test adversarial inputs against the real function.

### C10. `resumePlayback` drops rejections and destroys pause state
- **Evidence:** `app.js:1699-1712` — five floating `.play()`/`.resume()` promises, none `.catch`ed; `state.pausedKind = null` runs BEFORE the attempt → rejected resume leaves UI saying "playing" while silent, no re-resume possible.
- **Fix:** capture promises, `.catch()` → restore `pausedKind`, show `playFailed`; clear only on success.

### C11. Exports don't bake pitch/speed — "distinct" character voices collapse in the file
- **Evidence:** pitch via `src.detune` at playback only (`app.js:377`); `exportMp3` downloads raw `r.blob`. The 27 characters differ only by playback-time pitch offsets → downloaded file has identical base voices; speed slider also ignored.
- **Fix:** offline-render (OfflineAudioContext + detune/playbackRate) at export, or honest warning.

---

## 🟡 MAJOR

**Playback / audio**
- **M1.** Dead `onAudio` export hook: `recordVideo` never calls `opts.onAudio` (`app.js:2007-2013` vs `exporter.js` never reads it) → exported videos have **static lips**, Shorts captions frozen on block 1, and the round-3 speed fix is dead code (audio 1× vs captions at `dur/speed`). One-line fix in `exporter.js`.
- **M2.** Pause→Resume freezes avatar mouth (`<audio>` path): `pause` event → `Avatar.stop` (`avatar.js:441-442`); resume never re-arms `speak`. Fix: re-arm with `scaleCues` in resume.
- **M3.** Web Speech pause desyncs lip-sync: virtual-clock interval keeps ticking during `speechSynthesis.pause()` (`app.js:1353-1355` vs `:1688-1689`). Fix: clear interval on pause, shift `t0` on resume.
- **M4.** Video export leaks one AudioContext per export (`exporter.js:150`, never `close()`d) → ~6 exports kills later audio. Fix: close in `onstop`/`fail()`.
- **M5.** Music keeps playing during pause (`pausePlayback` never touches `state.musicEl`, `app.js:1663-1697`).
- **M6.** Preview silent on iOS Safari: `new AC()` created off-gesture after `await`, never `resume()`d (`app.js:569-581`). Fix: `await ctx.resume()` + "tap again" fallback.
- **M7.** Shorts captions desync at speed≠1: blocks built on wall-time (`dur/speed`, `app.js:1958`) but lookup reads media-time `el.currentTime` (`:1973`). Fix: divide by speed at lookup.
- **M8.** Google cue stream can end early (duration-estimate fallback) → mouth freezes mid-utterance (`app.js:1411-1413`, `tts.js:568`). Fix: pad synthetic cues ×1.5.
- **M9.** Google path ignores pitch slider silently (`app.js:1434` speed only; preview documents it at `:598-600`, main path doesn't). Fix: honest notice when `pitch && engine==='google'`.

**TTS chain**
- **M10.** `cancel()` can't abort in-flight Chatterbox (no signal on predict/fetch) — burns free GPU quota up to 120s after Stop.
- **M11.** Only the LAST engine error is kept (`tts.js:696-712`) — root cause swallowed. Fix: collect `errors[]`.
- **M12.** Dialogue Stop → misleading "needs downloadable audio" error (`app.js:1186`); Stop during generate → fake "failed: cancelled" (`app.js:1569`). Fix: treat `cancelled` as clean stop.
- **M13.** 90s timeout unscaled → long texts guaranteed to fail (125 Edge chunks ≈ 4-8 min ≫ 90s; all progress discarded). Fix: scale per chunk count + progress callback.
- **M14.** Chatterbox >1 chunk effectively impossible (90s global beats 120s per-chunk). Fix: exempt Chatterbox or warn >250 chars.
- **M15.** `previewVoice` destroys the generated result (`state.lastResult = {engine}` stub, `app.js:555`) → Play/"no audio" after preview; exports fail too. Fix: don't touch `lastResult`.
- **M16.** Chatterbox not in automatic fallback order (`tts.js:691-695`) — never tried when edge/google/webspeech fail.

**State / UX logic**
- **M17.** Voice/pill changed mid-generation switches the in-flight voice (`onGenerate` reads `state.voiceId` after awaits, `:1561`). Fix: capture before first await or disable controls in `setBusy`.
- **M18.** Preset restore sets invisible `voiceId`, never persists, never syncs pills/cards/selChar (`app.js:1030-1052`). Fix: validate, persist, re-render all.
- **M19.** `voicesync-ttsLang` written (`:761,768`) but never read — language lost on reload. Fix: restore in `initTtsControls`.
- **M20.** Emoji-only/punctuation-only text → "successful" silence (`app.js:1514`). Fix: require a letter/digit (`/\p{L}|\p{N}/u`).
- **M21.** No input cap: 50k chars → 125 sequential Edge requests / 250 parallel Google `<audio>` preloads (`tts.js:541-571`). Fix: soft cap ~5k chars + confirm gate.
- **M22.** Mixed-script text gets one language for the whole string (`_guessLang` whole-text, `tts.js:319-335`). Fix: per-chunk routing or mixed-script warning.
- **M23.** Paste REPLACES text instead of appending (`app.js:257-262`). Fix: append or confirm.
- **M24.** Dialogue empty-speaker input → raw browser-API error (`createBuffer` sampleRate 0, `app.js:1194`). Fix: i18n'd "each speaker needs text" message.

**Security**
- **M25.** CDN scripts with no SRI (`index.html:488` gradio; `lipsync.js:23` WASM). Fix: integrity + crossorigin; pin+verify WASM hash.
- **M26.** `new Function('u','return import(u)')` CSP-evasion (`lipsync.js:148-150`). Fix: native `import()`.
- **M27.** Unbounded mic recording → self-DoS (`app.js:1768-1808`, `recordT0` never enforced). Fix: auto-stop ~10 min.

**i18n / accessibility**
- **M28.** 17 hardcoded-English aria-labels (incl. `aria-label="Preview voice"`, `index.html:202`); `I18N.apply` has no aria mechanism. Fix: `data-i18n-aria` support.
- **M29.** Character cards hardcoded English in Urdu mode (`app.js:904,927-928`; 27 `style` strings English-only). Fix: lang/gender maps + `style_ur`.
- **M30.** "English" UI mode is ~1/3 Roman Urdu (27+ en-dict values). Fix: decide what English means; write true English strings.
- **M31.** Engine-guide `<h4>`s bypass i18n (`index.html:413,417`). Fix: `guide_ur_h`/`guide_eu_h` keys.
- **M32.** Card preview `<span role="button">` nested in `<button>`, keyboard-unreachable (`app.js:911-920`). Fix: real `<button>`.
- **M33.** Touch targets ~31-33px < 44px guideline (`.btn-small`, `style.css:183`). Fix: `padding:10px 16px`.
- **M34.** Topbar can overflow at 360px Urdu (no `flex-wrap`, `style.css:44-52`).

**Performance**
- **M35.** Avatar rAF loop runs 60fps forever incl. full-canvas repaint; `Avatar.stop()` doesn't cancel (`avatar.js:243-264,451`). Fix: stop when idle.
- **M36.** One chunk failure discards entire synthesis; fallback re-does everything. Fix: per-chunk retry ×2.
- **M37.** Rhubarb ~37MB WASM downloads at boot whether used or not (`app.js` boot → `probeLipSync`). Fix: lazy-load on first Generate.
- **M38.** 27 cards × 2 listeners rebuilt per keystroke; 8 pills same (`app.js:891-992`). Fix: debounce + event delegation.

**Code quality**
- **M39.** 3 unsynced string sources (`FALLBACK` 72 keys vs `en` 171 vs `ur` 198); 27 keys missing from `en`; `I18N.apply` doesn't use FALLBACK. Fix: QA asserts `FALLBACK ⊆ en ⊆ ur` + all `data-i18n(-ph)` keys in both.
- **M40.** Duplicated logic drifting: `resampleLinear` ×2 (`app.js:1165`/`tts.js:920`), WAV encoding ×2, fallback-note ×2, voiceId parsed in 4 idioms, speed/pitch at 7 sites. Fix: `parseVoiceId()`, `applySpeedPitch()`, shared WAV via Exporter.
- **M41.** SPEC.md misleading: §3 engines omit chatterbox/dialogue/mic; §3.6 lists 19 of 74 DOM ids; `data-i18n-placeholder` vs actual `data-i18n-ph`; §1 omits ~12 shipped features; §6 "cloning out of scope" vs shipped. Fix: SPEC v1.1.
- **M42.** `run-qa.sh` syntax-gate misses `avatar.js`, `lipsync.js` (SPEC §5 requires all). Fix: loop `js/*.js`.
- **M43.** 1400-count inflated by ~12 tautological assertions (`|| true`, etc.). Fix: real assertions.
- **M44.** 17 dead i18n keys, 6 dead CSS selectors, dead `state.lastVoiceLabel` write, 6 undeclared state fields. Fix: delete/declare.

---

## 🟢 MINOR (selected; full lists in expert reports)
- Google "MP3 downloaded" overclaims (opens tab, Chrome ignores cross-origin `download` attr) — `app.js:1912-1915`.
- Filenames not timestamped (collide/overwrite on mobile) — `app.js:1888,1904,2016,2116`.
- SRT/captions read live textbox, not generated text — snapshot `state.lastResult.text`.
- Music file: no type/size validation (`app.js:298-311`).
- Preset numerics unclamped (`app.js:1041-1052`); `_escapeXml` misses quotes (`tts.js:294`).
- Preview sample hardcoded ur/hi/ru/ar+en — ja/de get English sample (`app.js:538-540`).
- `speed_sub` says 1.8×, slider max 2.0; bidi isolation on pills/counters; `#avatarMount` needs `role="img"`.
- Dead `state.micUrl`; `ctx.resume()` floating promise (`app.js:371`); `prefers-reduced-motion` ignored.
- `pagehide` → `stopAll` missing (audio survives back-navigation); `_chunkText` can split surrogate pairs (`tts.js:436`).
- Dialogue swallows real errors (`dialogueNeedAudio`); offline Chatterbox says "server busy" when it's the user's connection.
- No 9:16 framing preview before Shorts export.

## ✅ Verified clean (explicitly checked)
No XSS (8 `innerHTML` hits all safe; adversarial trace clean); no secrets in tree or 29-commit history (`ghp_`/`github_pat` zero hits); SSML voice-name never user-controlled; Google URLs encoded; localStorage reads defensive; pause `previewing` flag holds; dialogue cue offsets sample-exact; Rhubarb fails honestly to heuristic; `playToken` invalidation sound; CRITICAL-08 `okCount` gate intact.

---

## Recommended Team 1 fix order
1. **C3** (lip-sync at speed — most visible, one-pattern fix) + **C1/C2** (export honesty)
2. **C4+C5+C8** (concurrency/cancellation — same root: no per-run identity)
3. **C6+C7** (UI lock + data destruction)
4. **C10+C11** (resume + export fidelity)
5. **C9** (export `_escapeXml`, unblock honest QA)
6. Majors M1–M44 grouped by file: `exporter.js` (M1, M4) → `tts.js` (M10–M16) → `app.js` playback (M2–M9) → `app.js` state (M17–M24) → security (M25–M27) → i18n (M28–M34) → perf (M35–M38) → quality (M39–M44)

**QA additions Team 3 requests:** real `_escapeXml` tests · `FALLBACK ⊆ en ⊆ ur` + all `data-i18n(-ph)` keys · pause/resume state-machine unit tests · engine-fallback parity (preview vs onGenerate) · preset/project localStorage round-trips.
