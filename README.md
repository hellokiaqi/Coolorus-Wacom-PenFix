# Coolorus Wacom Pen Fix

> Restores **pen dragging** in the Coolorus colour panel on Photoshop 2026 for Windows.

Coolorus 2.7.1 is a CEP extension whose colour wheel, SV square and HSV sliders are driven by
mouse events. With a Wacom pen on Windows Ink, the CEP web view delivers the pen as pointer
events and never sends the intermediate mouse events that a drag depends on — a tap still picks a
colour, but dragging does nothing.

This repository contains a small, self-contained script that bridges the pen's pointer stream to
the plugin's own createjs stage. Exactly one `<script>` line is added to the panel; no Coolorus
file is altered, and no Coolorus code or asset is redistributed.

**中文版：[README.zh-CN.md](README.zh-CN.md)** · **Technical write-up: [docs/diagnosis.md](docs/diagnosis.md)**

---

## At a glance

| Interaction | Before | After |
| --- | --- | --- |
| Pen tap (pick a colour) | works | works |
| Pen drag — hue ring, SV square, HSV sliders | no effect | works |
| Mouse drag | works | unchanged |
| Cursor while the pen is in contact | vanishes inside the panel | unchanged (Photoshop hides it) |

## Symptoms

- The pen picks a colour on a single tap, but the hue ring, the SV square and the HSV sliders
  cannot be dragged.
- After a first brief moment of success, dragging usually stops working until the panel is
  reloaded or Photoshop is restarted.
- While the pen is pressed, the system cursor disappears inside the panel and returns on lift.
- The mouse behaves perfectly throughout, and the pen works in every other application.

## Root cause

The panel runs in CEP 12.0.0 (Chromium 99.0.4844.84). Instrumenting the panel shows that the pen
is delivered **only as pointer events** (`pointerType === "pen"`); the compatibility mouse events
are missing:

- no `mousedown` when the pen touches down,
- no `mousemove` while the pen moves,
- the mouse sequence is only completed at the end of a tap, which is why a click still works.

Because every Coolorus interaction listens for mouse events, the createjs stage position freezes
at the last mouse position and no drag can be tracked. The pen's `mouseup` is also frequently
lost, which leaves the drag state stuck — that is why dragging often dies after the first attempt.

The cursor disappearing is unrelated to the plugin: Photoshop hides the system cursor while the
pen is in contact.

Measurements from one session (see [docs/evidence-log-excerpt.txt](docs/evidence-log-excerpt.txt)):

| Observation | Result |
| --- | --- |
| Pen presses that produced a native `mousedown` | 0 |
| Pen presses whose `mouseup` never arrived | 30 of 49 |
| `stage.mouseX` / `stage.mouseY` during a pen drag | frozen at the last mouse position |

## How the patch works

1. **Press tracking.** `pointerdown` opens a press and records the canvas under the pen.
2. **Missing `mousedown`.** If no real `mousedown` arrives within 60 ms, a synthetic one is
   dispatched to that canvas, so the plugin starts its own drag logic at the right position.
3. **Position feed.** While the press lasts, a 15 ms loop pushes the newest pen position into the
   createjs stage through `Stage._handleMouseMove()` — the same entry point EaselJS uses for a
   real mouse event. It performs the coordinate conversion, hit testing and dispatch of
   `stagemousemove`, so the plugin's drag code runs unmodified.
4. **Missing `mouseup`.** If the real `mouseup` never arrives, a synthetic one is dispatched on
   lift, committing the colour and clearing the drag state.
5. **Native drags suppressed.** `dragstart` is prevented and `touch-action` / `-webkit-user-drag`
   are neutralised, so the web view cannot enter a native drag that would swallow later moves.

When the normal mouse stream is present the position feed is a no-op: the stage is already at the
requested position, so the mouse path is untouched.

## Tested environment

| Component | Value |
| --- | --- |
| Operating system | Windows 11 Pro 10.0.26300 |
| Photoshop | Adobe Photoshop 2026 **27.10** (build 20260824.r.26) |
| CEP runtime | CEP **12.0.0**, Chromium **99.0.4844.84** |
| Coolorus | **2.7.1** (CEP extension) |
| Pen | **Wacom Art Pen 2** |
| Tablet | Wacom (USB `VID_056A`, `PID_03F7`) |
| Wacom driver | **6.4.15-1** |
| Input mode | Windows Ink (default; no `PSUserConfig.txt` override) |

Tested with the default Windows Ink configuration. Neither the Wacom driver settings nor
Photoshop's `UseSystemStylus` option had to be changed.

## Installation

1. Locate the extension folder, typically:

   ```
   C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\Coolorus 2.7.1
   ```

2. Copy [`src/penfix.js`](src/penfix.js) to `js\penfix.js` inside that folder.
3. Add one line to `index.html`, immediately before `</body>`, after the existing scripts:

   ```html
   <script src="js/penfix.js"></script>
   ```

4. Reload the panel: **quit and restart Photoshop**, or right-click the panel and choose
   **Reload**. Collapsing and reopening the panel does not reload the page.

Editing files under `Program Files` requires administrator rights; back up `index.html` first.

## Uninstallation

Remove the `<script>` line and delete `js\penfix.js`. Nothing else was changed.

## Verification

- Pen, mouse and tap interactions were tested on the hue ring, the SV square and all three HSV
  sliders.
- A regression test against Chromium 156 (synthetic events, no mouse stream at all) confirms that
  a pointer-only pen gesture drags correctly and that the ordinary mouse path is never
  intercepted (`presses: 0`, `driven: 0` for mouse input).

## Compatibility and limitations

- Targets the createjs build bundled with Coolorus 2.7.1. It calls `Stage._handleMouseMove()`, an
  internal EaselJS method; a different Coolorus or createjs version may need an adjustment, but
  the fallback path (`stage.mouseX` + `stagemousemove`) covers the simple case.
- If a future CEP/CEF version starts emitting compatibility mouse events for pens again, the
  position feed automatically becomes a no-op and the panel behaves as if the patch were absent.
- Windows only. macOS is not affected by this particular input path.
- Debug traces are opt-in: set `window.COOLORUS_PENFIX_DEBUG = true` before the script loads.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No change after installing | The page was not reloaded. Quit Photoshop completely, or use panel → Reload. |
| Panel is blank | The `<script>` line was added outside `<body>`, or the file is not at `js\penfix.js`. |
| Drag works once, then stops | Should not happen any more; please open an issue with the Photoshop, CEP and Wacom driver versions. |

## Licence and disclaimer

The code in this repository is released under the [MIT Licence](LICENSE).

It is an independent interoperability add-on. It contains no Coolorus source code, assets or
binaries, and it is not affiliated with or endorsed by the authors of Coolorus. “Coolorus” is a
trademark of its respective owner and is used here only to describe what the patch is compatible
with. You still need your own valid Coolorus licence to use the plugin. See [NOTICE.md](NOTICE.md).

---

If this saved you a few hours, a star is appreciated — and if you hit a different combination of
Photoshop, CEP or Wacom driver, an issue with the exact versions is genuinely useful.
