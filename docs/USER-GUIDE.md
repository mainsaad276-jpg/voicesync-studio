# VoiceSync Studio — User Guide (English)

Everything below is written against the real UI in `index.html`. Anything that
needs the still-in-progress JavaScript is marked **(team working on it)**.

## The screen at a glance

Top bar: **VoiceSync Studio** logo with the tagline **Free Voiceover + Lip-Sync**,
and a language-toggle button on the right showing **اردو** (switches the whole
UI to Urdu).

The page has three cards, top to bottom:

1. **Script Editor**
2. **Preview**
3. **Export**

Footer: *100% free — no API keys, no sign-up.*

---

## Step 1 — Open the app

Run it locally (`python3 -m http.server 8000` inside the repo, then open
`http://localhost:8000`) or open the GitHub Pages link once deployed. The
status line under the preview reads: **"Ready — type your text and press Play."**

## Step 2 — Type or paste your script

In the **Script Editor** card, click the **Your text** box
(placeholder: *"Type or paste your script here..."*) and type or paste your
script — Urdu, Hindi, English, or Arabic. A live counter shows the number of
**chars** you've typed. Long scripts are split into chunks automatically
**(team working on it)**.

## Step 3 — Choose the Language

In the **Language** dropdown pick your script's language:

- اردو (Urdu)
- हिन्दी (Hindi)
- English (US) *(default)*
- English (UK)
- العربية (Arabic)

## Step 4 — Choose the Voice

Open the **Voice** dropdown. Voices load automatically and show as
*"Loading voices…"* until the list arrives. Pick a neural voice in your
language (male/female options where available) **(team working on it — the
voice list needs the JS engine)**.

## Step 5 — Press Play

In the **Preview** card, press **▶ Play**. The app generates the voiceover and
the character in the preview area starts talking with its mouth moving in sync
with the audio **(team working on it — the talking character and audio need
the JS engine)**. Watch the **timeline** bar fill as it plays; the status line
reports what the app is doing (generating, speaking, ready).

Press **■ Stop** at any time to stop playback.

## Step 6 — Download the Audio

In the **Export** card, press **💾 Download Audio**. The finished voiceover is
saved to your device as a WAV file (MP3 where supported)
**(team working on it — the export engine needs the JS engine)**.

## Step 7 — Download the Video

Press **🎥 Download Video** to record the talking character as a WebM video
file with the audio included. Works in Chrome/Edge; other browsers show a
clear message if video recording isn't supported
**(team working on it — the export engine needs the JS engine)**.

## Step 8 — Save / Load your Project

- **💾 Save Project** — downloads your script, language, voice and settings as
  a JSON file (also kept in the browser).
- **📁 Load Project** — picks up a saved project file and restores everything.

**(team working on it — needs the JS engine)**

## Step 9 — Switch the UI to Urdu

Press the **اردو** button in the top bar. Every label, button and message
switches to Urdu; press it again to switch back to English
**(team working on it — translations need `js/i18n.js`)**.

## Troubleshooting

| Problem | What to do |
|---|---|
| Voice list says "Loading voices…" forever | The JS engine isn't built yet (team working on it); later, check your internet connection. |
| Play does nothing | Same — playback needs the JS engine modules, currently in progress. |
| Video export fails | Video export needs Chrome/Edge. If your browser lacks `MediaRecorder`, the app shows a clear message instead of breaking. |
| Page looks broken on a phone | The layout targets 360px-wide screens — if something overflows, report it (Nadia's QA list). |
