# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-10-23

### Added

- Initial release: `src/penfix.js`, an independent bridge that restores pen dragging in the
  Coolorus 2.7.1 CEP panel.
- Synthetic `mousedown` / `mouseup` when the CEP web view drops the compatibility mouse events.
- Position feed into the panel's createjs stage through `Stage._handleMouseMove()`.
- Optional diagnostics (`window.COOLORUS_PENFIX_DEBUG`).
- English and Chinese documentation, plus the technical diagnosis and raw log evidence.

### Verified

- Photoshop 2026 27.10, CEP 12.0.0 (Chromium 99.0.4844.84), Windows 11 10.0.26300,
  Wacom Art Pen 2, Wacom driver 6.4.15-1, Coolorus 2.7.1.
- Hue ring, SV square and all three HSV sliders drag with the pen; mouse input is untouched.
