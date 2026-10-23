/*!
 * Coolorus Wacom Pen Fix
 * ----------------------
 * Restores pen (stylus) dragging in the Coolorus CEP panel on Photoshop 2026
 * for Windows, where the CEP web view stops delivering mouse events to the
 * panel while the pen is in contact.
 *
 * This file is an independent add-on. It does not contain, modify or patch any
 * Coolorus source code: it only listens to standard DOM pointer events and
 * forwards them to the plugin's public/bundled createjs stage.
 *
 * Project : https://github.com/hellokiaqi/Coolorus-Wacom-PenFix
 * Version : 1.0.0
 * License : MIT (this file only). See LICENSE and NOTICE.md.
 */
(function () {
  'use strict';

  if (window.CoolorusPenFix && window.CoolorusPenFix.installed) return;

  var VERSION = '1.0.0';

  /* ------------------------------------------------------------------ *
   * Optional diagnostics.
   *   Set window.COOLORUS_PENFIX_DEBUG = true before this script loads to
   *   get a console trace (and, when CEP's Node integration is available,
   *   a log file under the OS temp directory).
   * ------------------------------------------------------------------ */
  var DEBUG = !!window.COOLORUS_PENFIX_DEBUG;
  var logFile = null;
  var fs = null;

  if (DEBUG) {
    try {
      fs = require('fs');
      var os = require('os');
      var path = require('path');
      logFile = path.join(os.tmpdir(), 'coolorus-penfix.log');
    } catch (e) {
      fs = null;   // Node integration disabled: console logging only
    }
  }

  function log(message) {
    if (!DEBUG) return;
    try { console.log('[penfix] ' + message); } catch (e) { }
    if (!fs || !logFile) return;
    try {
      fs.appendFileSync(logFile, new Date().toISOString() + '  ' + message + '\n');
    } catch (e) { }
  }

  /* ------------------------------------------------------------------ *
   * 0. Keep the web view from starting a native drag.
   *    A native drag swallows every later mouse move and changes the
   *    cursor, which is one of the ways a pen gesture can go silent.
   * ------------------------------------------------------------------ */
  var style = document.createElement('style');
  style.appendChild(document.createTextNode(
    'canvas, #picker, #panels, body { touch-action: none !important; }' +
    'canvas, #picker, #panels { -webkit-user-drag: none !important; }'
  ));
  (document.head || document.documentElement).appendChild(style);

  document.addEventListener('dragstart', function (e) {
    try { e.preventDefault(); e.stopPropagation(); } catch (err) { }
    log('blocked dragstart on ' + describe(e.target));
  }, true);

  function describe(el) {
    if (!el) return 'null';
    var s = el.tagName || '?';
    if (el.id) s += '#' + el.id;
    return s;
  }

  /* ------------------------------------------------------------------ *
   * 1. Resolve the createjs stage that owns a canvas.
   *    Every interactive Coolorus surface is a createjs Stage bound to a
   *    <canvas>. Walking the plugin's object graph is enough to find it
   *    and avoids hard-coding property names beyond the documented ones.
   * ------------------------------------------------------------------ */
  function findStageForCanvas(canvas) {
    if (!canvas) return null;
    if (canvas.__penfixStage) return canvas.__penfixStage;

    var found = null;
    var seen = [];

    function walk(obj, depth) {
      if (found || depth > 4 || !obj || typeof obj !== 'object' || obj.nodeType) return;
      if (seen.indexOf(obj) !== -1) return;
      seen.push(obj);

      try {
        if (obj.canvas === canvas && typeof obj._handleMouseMove === 'function') { found = obj; return; }
        if (obj.view && obj.view.stage && obj.view.stage.canvas === canvas) { found = obj.view.stage; return; }
      } catch (e) { }

      var keys;
      try { keys = Object.keys(obj); } catch (e) { return; }
      for (var i = 0; i < keys.length && i < 150; i++) {
        var value;
        try { value = obj[keys[i]]; } catch (e) { continue; }
        if (value && typeof value === 'object') walk(value, depth + 1);
        if (found) return;
      }
    }

    try { walk(window.coolorus, 0); } catch (e) { }
    if (found) { try { canvas.__penfixStage = found; } catch (e) { } }
    return found;
  }

  function localPoint(canvas, clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (clientY - rect.top) * (canvas.height / Math.max(1, rect.height))
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. Feed a position to the stage.
   *    Stage._handleMouseMove() is the same entry point EaselJS uses for a
   *    real mouse event: it converts coordinates, performs hit testing and
   *    dispatches "stagemousemove", which is what the plugin's drag code
   *    listens to. If the stage is already at that position (normal mouse
   *    input), nothing happens.
   * ------------------------------------------------------------------ */
  var stats = { presses: 0, syntheticDown: 0, syntheticUp: 0, driven: 0 };

  function driveStage(stage, canvas, clientX, clientY) {
    if (!stage || !canvas) return false;

    var point = localPoint(canvas, clientX, clientY);
    if (Math.abs(stage.mouseX - point.x) < 0.75 &&
        Math.abs(stage.mouseY - point.y) < 0.75) return false;

    try {
      if (typeof stage._handleMouseMove === 'function') {
        stage._handleMouseMove({
          pageX: clientX + (window.scrollX || 0),
          pageY: clientY + (window.scrollY || 0),
          clientX: clientX,
          clientY: clientY,
          button: 0,
          buttons: 1,
          shiftKey: false,
          ctrlKey: false,
          altKey: false
        });
      } else {
        stage.mouseX = point.x;
        stage.mouseY = point.y;
        stage.mouseInBounds = true;
        stage.dispatchEvent('stagemousemove');
      }
      stats.driven++;
      return true;
    } catch (e) {
      log('driveStage failed: ' + e);
      return false;
    }
  }

  function synthMouse(type, canvas, clientX, clientY, buttons) {
    if (!canvas) return false;
    try {
      canvas.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: clientX,
        clientY: clientY,
        screenX: (window.screenX || 0) + clientX,
        screenY: (window.screenY || 0) + clientY,
        button: 0,
        buttons: buttons
      }));
      return true;
    } catch (e) {
      log('synthMouse(' + type + ') failed: ' + e);
      return false;
    }
  }

  function canvasAt(clientX, clientY) {
    var el = document.elementFromPoint(clientX, clientY);
    while (el && el.tagName !== 'CANVAS') el = el.parentElement;
    return el || null;
  }

  /* ------------------------------------------------------------------ *
   * 3. Press lifecycle.
   *    A pen press is opened on pointerdown. Two things are repaired:
   *      - a missing mousedown (the plugin never starts its drag),
   *      - a missing mouseup  (the drag state sticks until reload).
   * ------------------------------------------------------------------ */
  var press = null;
  var latest = { x: 0, y: 0 };
  var loopHandle = 0;

  var SYNTH_DOWN_DELAY = 60;     // ms to wait for a real mousedown
  var SYNTH_UP_DELAY = 160;      // ms to wait for a real mouseup
  var LOOP_INTERVAL = 15;        // ms between position updates

  function beginPress(type, clientX, clientY) {
    var canvas = canvasAt(clientX, clientY);

    press = {
      type: type,
      canvas: canvas,
      stage: canvas ? findStageForCanvas(canvas) : null,
      x: clientX,
      y: clientY,
      startedAt: Date.now(),
      nativeDown: false,
      nativeUp: false,
      syntheticDown: false,
      downTimer: 0,
      upTimer: 0
    };
    latest.x = clientX;
    latest.y = clientY;
    stats.presses++;

    log('press ' + type + ' at ' + Math.round(clientX) + ',' + Math.round(clientY) +
        ' canvas=' + describe(canvas) + ' stage=' + (press.stage ? 'yes' : 'no'));

    if (!press.stage && canvas) {
      var pendingCanvas = canvas;
      setTimeout(function () {
        if (press && press.canvas === pendingCanvas && !press.stage) {
          press.stage = findStageForCanvas(pendingCanvas);
        }
      }, 120);
    }

    press.downTimer = setTimeout(function () {
      if (!press || press.nativeDown || press.syntheticDown || !press.canvas) return;
      if (synthMouse('mousedown', press.canvas, press.x, press.y, 1)) {
        press.syntheticDown = true;
        stats.syntheticDown++;
        log('synthetic mousedown');
        if (press.stage) driveStage(press.stage, press.canvas, press.x, press.y);
      }
    }, SYNTH_DOWN_DELAY);

    startLoop();
    return press;
  }

  function endPress(reason, clientX, clientY) {
    if (!press) return;
    var closing = press;
    press = null;

    clearTimeout(closing.downTimer);
    clearTimeout(closing.upTimer);

    log('press end (' + reason + ') ms=' + (Date.now() - closing.startedAt) +
        ' nativeDown=' + closing.nativeDown +
        ' syntheticDown=' + closing.syntheticDown +
        ' nativeUp=' + closing.nativeUp);

    if (!closing.nativeUp &&
        synthMouse('mouseup', closing.canvas,
                   clientX != null ? clientX : closing.x,
                   clientY != null ? clientY : closing.y, 0)) {
      stats.syntheticUp++;
      log('synthetic mouseup');
    }
  }

  /* Keep the stage at the newest pen position for as long as the press lasts. */
  function startLoop() {
    if (loopHandle) return;
    loopHandle = setInterval(function () {
      if (!press) { clearInterval(loopHandle); loopHandle = 0; return; }
      if (!press.stage || !press.canvas) return;
      driveStage(press.stage, press.canvas, latest.x, latest.y);
    }, LOOP_INTERVAL);
  }

  /* ------------------------------------------------------------------ *
   * 4. Native mouse stream: observed only, never overridden.
   * ------------------------------------------------------------------ */
  document.addEventListener('mousedown', function (e) {
    if (!e.isTrusted || !press) return;
    press.nativeDown = true;
    clearTimeout(press.downTimer);
  }, true);

  document.addEventListener('mousemove', function (e) {
    if (!e.isTrusted || !press) return;
    latest.x = e.clientX;
    latest.y = e.clientY;
  }, true);

  document.addEventListener('mouseup', function (e) {
    if (!e.isTrusted || !press) return;
    press.nativeUp = true;
    endPress('native mouseup', e.clientX, e.clientY);
  }, true);

  /* ------------------------------------------------------------------ *
   * 5. Pen (and touch) pointer stream.
   * ------------------------------------------------------------------ */
  document.addEventListener('pointerdown', function (e) {
    if (!e.pointerType || e.pointerType === 'mouse') return;
    if (press) endPress('new pointerdown', e.clientX, e.clientY);
    beginPress(e.pointerType, e.clientX, e.clientY);
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (!e.pointerType || e.pointerType === 'mouse' || !press) return;
    latest.x = e.clientX;
    latest.y = e.clientY;
  }, true);

  ['pointerup', 'pointercancel'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!e.pointerType || e.pointerType === 'mouse' || !press) return;

      if (press.nativeDown) {
        clearTimeout(press.upTimer);
        press.upTimer = setTimeout(function () {
          if (press && !press.nativeUp) endPress(type + ' (no mouseup)', e.clientX, e.clientY);
        }, SYNTH_UP_DELAY);
      } else {
        endPress(type, e.clientX, e.clientY);
      }
    }, true);
  });

  /* Older CEF builds may deliver a stylus as touch. */
  document.addEventListener('touchstart', function (e) {
    if (press || !e.touches || e.touches.length !== 1) return;
    beginPress('touch', e.touches[0].clientX, e.touches[0].clientY);
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!press || !e.touches || !e.touches.length) return;
    if (e.cancelable) { try { e.preventDefault(); } catch (err) { } }
    latest.x = e.touches[0].clientX;
    latest.y = e.touches[0].clientY;
  }, { capture: true, passive: false });

  document.addEventListener('touchend', function () {
    setTimeout(function () { if (press) endPress('touchend'); }, 120);
  }, { capture: true, passive: true });

  window.CoolorusPenFix = {
    installed: true,
    version: VERSION,
    stats: stats,
    driveStage: driveStage,
    findStageForCanvas: findStageForCanvas,
    getPress: function () { return press; }
  };

  log('ready (v' + VERSION + ')');
})();
