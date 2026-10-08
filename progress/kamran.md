# Kamran — Avatar & Animation Developer — progress notes

## Status: DONE — `js/avatar.js` implemented, contract-complete, verified

## Design (original art, no copied assets)
"Presenter" — a friendly news-presenter style head-and-shoulders character, built as inline SVG (320×360 viewBox):
- Warm tan face (ellipse), dark-brown swept-fringe hair cap, ears, expressive eyes (white + pupil + highlight), thick eyebrows, simple nose curve, soft blush cheeks
- Teal blazer panels over a cream shirt with collar V, neck, soft mint backdrop circle
- Mouth is a single `<path>` inside a `translate(160 224)` group; its `d` is swapped per viseme

## The 9 viseme mouths (pure `VISEME_PATHS` object, pairwise distinct)
| Viseme | Shape |
|---|---|
| A | wide open "ah" (jaw dropped) |
| B | pressed lips "m/b/p" |
| C | wide teeth grin "ee/s" (white fill) |
| D | medium open "eh" |
| E | round "oh" (circle arcs) |
| F | upper teeth on lower lip "f/v" (white fill) |
| G | open + tongue protrusion "th/l" (two subpaths) |
| H | tight puckered "oo" (smaller circle than E) |
| X | rest — gentle closed smile |

## Contract implementation
- `mount(el)` — clears el, builds the SVG, starts blink timer + master rAF loop; re-mount safe
- `setViseme(v)` — instant `d`/fill/stroke swap (60fps-safe, no layout); invalid input → 'X'
- `speak(cues, audioEl)` — sorts cues, drives mouth from an index-pointer timeline each frame; auto-stops on audio `ended`/`pause`
- `stop()` — mouth back to X, bob reset, listeners removed
- `getCanvas()` — returns a live 480×480 canvas, painted every animation frame with a canvas2D mirror of the character (mouth drawn from the SAME path data via `new Path2D(d)`, so SVG and export can never drift apart)
- `setMood('happy'|'neutral')` — happy raises brows and widens the rest smile
- Blink every 3–5s (lid shut 150ms); gentle head bob + slight tilt while speaking

## Verification output (mandatory)
```
node --check: PASS
contract methods: mount,setViseme,speak,stop,getCanvas,setMood — all present
viseme keys: A,B,C,D,E,F,G,H,X
setViseme("A"/"Z"/null): no throw, invalid input falls back to X
speak(cues, null) + stop(): no throw
ALL ASSERTIONS PASSED
```
Test script: `/tmp/kamran-viseme-test.js` — asserts: exactly 9 keys A–X; every value a non-empty path string; all 9 pairwise distinct; all 6 contract methods exist; setViseme/speak/stop safe without a DOM.

## Limits / honest notes
- Visual "9 visibly distinct" check needs human eyes in a real browser — the path data is asserted distinct in node, but I could not screenshot-render from the VM. app.js integration + Nadia's QA should eyeball it.
- `node --check` passes; full browser smoke test (mount → speak with real audio → getCanvas → MediaRecorder) is pending Daniyal's integration and Nadia's checklist.
- File is a plain `<script>` global (`window.Avatar`); also exposes `module.exports` only when `module` exists (node test hook, inert in browsers).
