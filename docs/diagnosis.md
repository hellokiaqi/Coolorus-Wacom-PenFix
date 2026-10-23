# Diagnosis: why a Wacom pen cannot drag in the Coolorus CEP panel

This document records how the failure was isolated, what the panel actually receives from a pen,
and why the workaround in [`src/penfix.js`](../src/penfix.js) takes the shape it does.

## 1. Summary

The Coolorus panel is a CEP extension. Its interactive surfaces are `createjs` stages bound to
`<canvas>` elements, and every interaction is expressed in mouse terms: `mousedown` starts a drag,
`stagemousemove` updates it, `stagemouseup` commits it.

With a Wacom pen under Windows Ink, the CEP web view delivers the pen **only as pointer events**.
The compatibility mouse events that a drag needs are not sent while the pen moves; the mouse
sequence is completed only at the end of a tap. A tap therefore picks a colour, while a drag
never receives a position update.

## 2. Environment

| Component | Value |
| --- | --- |
| OS | Windows 11 Pro 10.0.26300 |
| Photoshop | 2026, 27.10 (build 20260824.r.26) |
| CEP | 12.0.0 |
| Chromium (from the panel's user agent) | 99.0.4844.84 (`AdobeCEP/12.0.0`) |
| Coolorus | 2.7.1 |
| Pen | Wacom Art Pen 2 |
| Wacom driver | 6.4.15-1 |
| Input mode | Windows Ink (default) |

## 3. Method

A diagnostic script was added to the panel next to the plugin's own scripts. It:

- registers capture-phase listeners on `document` for `pointerdown/move/up/cancel`,
  `mousedown/move/up`, `touchstart/move/end`, `dragstart`, `selectstart` and `contextmenu`;
- records `pointerType`, button state, coordinates and the event target for each event;
- opens a "press" record on the first event of a gesture and counts how many mouse moves and
  pointer moves arrived before the release, and whether a real `mouseup` ever came;
- samples `stage.mouseX` / `stage.mouseY` and the plugin's colour while the press is open;
- appends everything to a log file through CEP's Node integration.

No plugin code was modified during the measurement.

## 4. Observations

### 4.1 The pen produces pointer events only

A typical press, with the panel idle:

```
t+0        pointerdown   pen   @128,162   target=CANVAS#picker_canvas
t+0        — no mousedown follows —
t+16..250  pointermove   pen   @130,164 … (many)
t+250      — no mousemove reaches the canvas —
t+294      pointerup     pen   @151,181
```

Across a full session of 49 pen presses:

| Measurement | Value |
| --- | --- |
| Presses that produced a native `mousedown` | 0 |
| Presses whose `mouseup` never arrived | 30 / 49 |
| Presses where a `pointermove` was seen | 49 / 49 |

### 4.2 The stage position freezes

While the pen was being dragged, `stage.mouseX` / `stage.mouseY` stayed pinned to the coordinates of
the last *mouse* interaction (for example `168,146` for several minutes of pen use). `createjs`
therefore never dispatched `stagemousemove`, and the plugin's drag handler had nothing to follow.

This is the decisive observation: the plugin's logic was never reached, so the defect is upstream
of the plugin.

### 4.3 Taps still work

Short presses — a tap — do receive a `mouseup` within the press window (for example 76 ms after
`pointerdown`). The web view completes the mouse sequence at the end of a tap, which is enough for
"click to pick a colour" and explains the asymmetry between clicking and dragging.

### 4.4 The failure is sticky

After a press whose `mouseup` never arrived, subsequent presses stayed degraded until the page was
reloaded. Two contributing factors:

- the plugin's drag handler remains attached, because `handleMouseUp` is what removes it;
- the pointer/button state on the browser side and the panel's own state can drift apart, so the
  next gesture is not recognised as a fresh press.

### 4.5 The cursor

Photoshop hides the system cursor while the pen is in contact. Because the panel gives no drag
feedback, the result looks like "the cursor vanished and nothing happened". This is not caused by
the plugin.

## 5. Why the obvious workaround is not used here

Switching Photoshop from Windows Ink to WinTab — `PSUserConfig.txt` with `UseSystemStylus 0` —
also resolves the symptom, because the pen then produces ordinary mouse movement again.

That is a system-wide change to Photoshop's input stack, it can alter pressure and rotation
behaviour in other tools, and it was explicitly out of scope for this fix. The patch instead
repairs the panel's own input path, which keeps the change local to the extension.

## 6. Design of the fix

The patch is deliberately conservative:

1. **Never touch the mouse path.** All bridging is gated on `pointerType !== "mouse"`. A separate
   regression run with a real mouse records `presses: 0` and `driven: 0` — the code does not act
   at all.
2. **Synthesise only what is missing.** A `mousedown` is fabricated only if the real one has not
   arrived within 60 ms; a `mouseup` only if the release produced no mouse event.
3. **Feed positions through the stage's own entry point.** `Stage._handleMouseMove()` performs
   coordinate conversion, hit testing and `stagemousemove` dispatch exactly as it does for a mouse,
   so the plugin runs its normal code path rather than a parallel one.
4. **Idempotent by construction.** The feed compares the stage position with the desired one and
   skips when they already match, so a working mouse stream can never be double-processed.
5. **Self-disabling.** If a future CEP build starts emitting mouse events for pens again, the
   stage is already at the requested position and the feed becomes a no-op.

Known limitations: it depends on `_handleMouseMove`, an internal EaselJS method that exists in the
createjs build bundled with Coolorus 2.7.1; the fallback path (`stage.mouseX` + `stagemousemove`)
covers the case where only the public dispatch is available.

## 7. Reproducing the measurement

Add the patch, then enable tracing before the script loads:

```js
window.COOLORUS_PENFIX_DEBUG = true;
```

Traces go to the console and — when CEP's Node integration is enabled — to
`<temp>/coolorus-penfix.log`.

## 8. Appendix

A verbatim slice of the log, taken after the fix started driving the stage, is stored in
[`evidence-log-excerpt.txt`](evidence-log-excerpt.txt).
