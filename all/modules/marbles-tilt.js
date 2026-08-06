/**
 * marbles-tilt.js - Marbles with accelerometer gravity.
 *
 * Same 1992 MARBLES2 artwork and pins as modules/marbles.js, but gravity
 * follows the device when the saver is immersive (fullscreen / its own tab).
 * In the little Display Properties preview it stays screen-down so the
 * monitor is not pulled sideways by the phone's tilt.
 *
 * Manual controls (always available when immersive):
 *   - bungee cow on a short rope in the corner — drag to tilt
 *   - arrow keys nudge gravity the same way
 *
 *   <after-dark-marbles-tilt art="art/marbles2" pins="many"
 *     pin-size="medium" speed="medium"></after-dark-marbles-tilt>
 */
(function () {
  'use strict';

  var CELL = 16;
  var R = CELL / 2;
  var SMILEY = 8, SHOCKED = 9;
  var OH = 0.4;

  var PIN_SIZES = { 'x-small': '100', medium: '101', big: '102' };
  var PIN_DENSITY = { none: 0, few: 26000, many: 11000, lots: 5200 };
  var SPEEDS = { slow: 40, medium: 65, fast: 100 };

  var GRAVITY = 520;
  var BOUNCE = 0.48;
  var WALL_BOUNCE = 0.12;
  var WALL_SLIDE = 0.985;
  var MARBLE_BOUNCE = 0.08;
  var MARBLE_SLIDE = 0.97;
  var DAMP = 0.9994;
  var PIN_HIT = 0.42;
  var MAX_TOTAL = 220;
  var SOLVER_PASSES = 2;
  var G_EARTH = 9.80665;
  var ROPE_LEN = 78;
  var KEY_STEP = 0.08;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** True when this saver fills most of the window (not the 4:3 preview). */
  function isImmersive(el) {
    if (typeof window === 'undefined') { return true; }
    var r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.55 &&
      r.height >= window.innerHeight * 0.55;
  }

  /**
   * Map accelerationIncludingGravity → CSS screen gravity (y down).
   * `invert` flips both axes — used when a device reports the other polarity,
   * and when auto-rotate would otherwise leave portrait pulling "up".
   *
   * No screen.orientation.angle compensation: that fought auto-rotate. The
   * accelerometer is read in device space and we only trust it while
   * immersive; layout changes reset via resize.
   */
  function gravityFromAcceleration(ax, ay, invert) {
    // Support-force convention (common on Android): earth ≈ −ag, screen y-down
    // means (gx, gy) = (−ax, ay). Invert covers the other polarity / bad holds.
    var gx = -(ax || 0) / G_EARTH;
    var gy = (ay || 0) / G_EARTH;
    if (invert) { gx = -gx; gy = -gy; }
    return { x: gx, y: gy };
  }

  function gravityFromOrientation(beta, gamma, invert) {
    var dx = Math.sin((gamma || 0) * Math.PI / 180);
    var dy = Math.sin((beta || 0) * Math.PI / 180);
    var mag = Math.hypot(dx, dy);
    if (mag < 0.12) { return { x: 0, y: 0.35 }; }
    dx /= mag;
    dy /= mag;
    if (invert) { dx = -dx; dy = -dy; }
    return { x: dx, y: dy };
  }

  function MarblesTilt(art) {
    this.strip = art.bitmap('marbles');
    this.pinArt = art;
    this.setPinSize('medium');
    this.pins = [];
    this.density = PIN_DENSITY.many;
    this.speed = SPEEDS.medium;
    this.marbles = [];
    this.gx = 0;
    this.gy = 1;
    this.spawn = 0;
    this.usingSensor = false;
  }

  MarblesTilt.prototype.setPinSize = function (name) {
    var bm = this.pinArt.bitmap(PIN_SIZES[name] || PIN_SIZES.medium);
    this.pin = bm;
    this.pinR = bm ? bm.width * PIN_HIT : 0;
  };

  MarblesTilt.prototype.setGravity = function (gx, gy) {
    var mag = Math.hypot(gx, gy);
    if (mag < 0.04) {
      this.gx = 0;
      this.gy = 0.25;
      return;
    }
    var strength = Math.min(1.15, mag);
    this.gx = (gx / mag) * strength;
    this.gy = (gy / mag) * strength;
  };

  MarblesTilt.prototype.scatter = function (w, h) {
    this.pins = [];
    if (!this.density || !this.pin) { return; }
    var wanted = Math.round((w * h) / this.density);
    var gap = this.pin.width + CELL;
    var tries = 0;
    while (this.pins.length < wanted && tries < wanted * 60) {
      tries += 1;
      var x = rand(this.pin.width, w - this.pin.width);
      var y = rand(h * 0.18, h * 0.88);
      var clear = true;
      for (var i = 0; i < this.pins.length; i += 1) {
        if (Math.hypot(this.pins[i].x - x, this.pins[i].y - y) < gap) {
          clear = false;
          break;
        }
      }
      if (clear) { this.pins.push({ x: x, y: y }); }
    }
  };

  MarblesTilt.prototype.reset = function (w, h) {
    this.marbles = [];
    this.scatter(w, h);
    this.spawn = 0;
  };

  MarblesTilt.prototype.release = function (w, h) {
    var gx = this.gx, gy = this.gy;
    var lateral = rand(-0.42, 0.42) * Math.min(w, h);
    var reach = Math.max(w, h) * 0.55;
    var x = w / 2 - gx * reach + (-gy) * lateral;
    var y = h / 2 - gy * reach + gx * lateral;
    if (Math.abs(gx) >= Math.abs(gy)) {
      y = clamp(y, R, h - R);
    } else {
      x = clamp(x, R, w - R);
    }
    var type = Math.floor(rand(0, SMILEY + 1));
    this.marbles.push({
      type: type,
      sensitive: type === SMILEY,
      oh: 0,
      x: x,
      y: y,
      vx: rand(-22, 22),
      vy: rand(-22, 22),
      r: R
    });
  };

  MarblesTilt.prototype.clampMarble = function (m, w, h) {
    m.x = clamp(m.x, m.r, w - m.r);
    m.y = clamp(m.y, m.r, h - m.r);
  };

  MarblesTilt.prototype.step = function (dt, w, h) {
    var i, j, m;
    dt = Math.min(dt * (this.speed / SPEEDS.medium), 0.05);

    this.spawn -= dt;
    if (this.spawn <= 0 && this.marbles.length < MAX_TOTAL) {
      this.spawn = rand(0.14, 0.36);
      this.release(w, h);
    }

    var ax = this.gx * GRAVITY;
    var ay = this.gy * GRAVITY;

    for (i = 0; i < this.marbles.length; i += 1) {
      m = this.marbles[i];
      m.vx += ax * dt;
      m.vy += ay * dt;
      m.vx *= DAMP;
      m.vy *= DAMP;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.oh > 0) { m.oh -= dt; }

      if (m.x < m.r) {
        m.x = m.r;
        m.vx = Math.abs(m.vx) * WALL_BOUNCE;
        m.vy *= WALL_SLIDE;
      } else if (m.x > w - m.r) {
        m.x = w - m.r;
        m.vx = -Math.abs(m.vx) * WALL_BOUNCE;
        m.vy *= WALL_SLIDE;
      }
      if (m.y < m.r) {
        m.y = m.r;
        m.vy = Math.abs(m.vy) * WALL_BOUNCE;
        m.vx *= WALL_SLIDE;
      } else if (m.y > h - m.r) {
        m.y = h - m.r;
        m.vy = -Math.abs(m.vy) * WALL_BOUNCE;
        m.vx *= WALL_SLIDE;
      }

      for (j = 0; j < this.pins.length; j += 1) {
        var p = this.pins[j];
        var dx = m.x - p.x, dy = m.y - p.y;
        var d = Math.hypot(dx, dy);
        var hit = this.pinR + m.r;
        if (d > 0 && d < hit) {
          var nx = dx / d, ny = dy / d;
          m.x = p.x + nx * hit;
          m.y = p.y + ny * hit;
          var into = m.vx * nx + m.vy * ny;
          if (into < 0) {
            m.vx = (m.vx - 2 * into * nx) * BOUNCE + rand(-10, 10);
            m.vy = (m.vy - 2 * into * ny) * BOUNCE;
          }
          if (m.sensitive) { m.oh = OH; }
        }
      }
    }

    for (var pass = 0; pass < SOLVER_PASSES; pass += 1) {
      for (i = 0; i < this.marbles.length; i += 1) {
        for (j = i + 1; j < this.marbles.length; j += 1) {
          this.resolve(this.marbles[i], this.marbles[j]);
        }
      }
    }

    // Solver soft-pushes can sneak past the floor — clamp hard so landscape
    // does not leak marbles off the bottom of the visible canvas.
    for (i = 0; i < this.marbles.length; i += 1) {
      this.clampMarble(this.marbles[i], w, h);
    }

    if (this.marbles.length >= MAX_TOTAL) { this.reset(w, h); }
  };

  MarblesTilt.prototype.resolve = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.hypot(dx, dy) || 0.0001;
    var min = a.r + b.r;
    if (dist >= min) { return; }
    var nx = dx / dist, ny = dy / dist;
    var overlap = min - dist;
    var push = overlap * 0.45;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;

    var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    var vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      var jimp = -(1 + MARBLE_BOUNCE) * vn / 2;
      var ix = jimp * nx, iy = jimp * ny;
      a.vx -= ix; a.vy -= iy;
      b.vx += ix; b.vy += iy;
      if (a.sensitive && Math.hypot(ix, iy) > 10) { a.oh = OH; }
      if (b.sensitive && Math.hypot(ix, iy) > 10) { b.oh = OH; }
    }

    var tx = -ny, ty = nx;
    var vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
    var slip = vt * (1 - MARBLE_SLIDE) / 2;
    a.vx += tx * slip; a.vy += ty * slip;
    b.vx -= tx * slip; b.vy -= ty * slip;
  };

  MarblesTilt.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    var i, m;
    for (i = 0; i < this.marbles.length; i += 1) {
      m = this.marbles[i];
      this.strip.drawCell(ctx, m.oh > 0 ? SHOCKED : m.type, CELL, m.x, m.y);
    }
    for (i = 0; i < this.pins.length; i += 1) {
      this.pin.draw(ctx, this.pins[i].x, this.pins[i].y);
    }
  };

  /* ------------------------------------------------------------ element */

  function MarblesTiltElement() {
    return Reflect.construct(HTMLElement, [], MarblesTiltElement);
  }
  MarblesTiltElement.prototype = Object.create(HTMLElement.prototype);
  MarblesTiltElement.prototype.constructor = MarblesTiltElement;
  Object.setPrototypeOf(MarblesTiltElement, HTMLElement);

  MarblesTiltElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/marbles2';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';
    this.style.position = this.style.position || 'relative';
    this.tabIndex = 0; // so arrow keys can target us

    window.AfterDark.load(base).then(function (art) {
      var sim = new MarblesTilt(art);
      sim.setPinSize((AfterDark.setting(self, 'pin-size') || 'medium').toLowerCase());

      var pins = (AfterDark.setting(self, 'pins') || 'many').toLowerCase();
      sim.density = PIN_DENSITY[pins] !== undefined ? PIN_DENSITY[pins] : PIN_DENSITY.many;

      var speed = (AfterDark.setting(self, 'speed') || 'medium').toLowerCase();
      sim.speed = SPEEDS[speed] || Number(speed) || SPEEDS.medium;

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      self._invert = /(?:\?|&)flip(?:=|&|$)/.test(location.search || '');
      self._upFrames = 0;

      screen.onresize = function (w, h) {
        sim.reset(w, h);
        self._placeCowRest();
        self._syncControls(sim);
      };
      sim.reset(screen.width, screen.height);

      self._syncControls(sim);

      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
        self._drawRope();
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  MarblesTiltElement.prototype._syncControls = function (sim) {
    if (isImmersive(this)) {
      this._bindMotion(sim);
      this._showCow(sim);
      this._bindKeys(sim);
    } else {
      this._unbindMotion();
      this._hideCow();
      this._unbindKeys();
      sim.setGravity(0, 1);
      sim.usingSensor = false;
    }
  };

  MarblesTiltElement.prototype._bindMotion = function (sim) {
    if (this._onMotion) { return; }
    var self = this;
    var motionLive = false;

    function applyMotion(e) {
      if (!isImmersive(self) || self._manual) { return; }
      var ag = e.accelerationIncludingGravity;
      if (!ag || (ag.x == null && ag.y == null)) { return; }
      var ax = ag.x || 0, ay = ag.y || 0, az = ag.z || 0;
      if (Math.sqrt(ax * ax + ay * ay + az * az) < 2) { return; }
      var g = gravityFromAcceleration(ax, ay, self._invert);
      // If portrait layout keeps reporting "up" for a beat, flip polarity once.
      if (self.offsetHeight >= self.offsetWidth && g.y < -0.55 &&
          Math.abs(g.y) > Math.abs(g.x)) {
        self._upFrames += 1;
        if (self._upFrames > 18) {
          self._invert = !self._invert;
          self._upFrames = 0;
          g = gravityFromAcceleration(ax, ay, self._invert);
        }
      } else {
        self._upFrames = 0;
      }
      sim.setGravity(g.x, g.y);
      sim.usingSensor = true;
      motionLive = true;
      self._hidePrompt();
    }

    function applyOrientation(e) {
      if (motionLive || !isImmersive(self) || self._manual) { return; }
      if (e.beta == null && e.gamma == null) { return; }
      var g = gravityFromOrientation(e.beta, e.gamma, self._invert);
      sim.setGravity(g.x, g.y);
      sim.usingSensor = true;
      self._hidePrompt();
    }

    this._onMotion = applyMotion;
    this._onOrientation = applyOrientation;
    this._motionLive = function () { return motionLive; };
    window.addEventListener('devicemotion', applyMotion);
    window.addEventListener('deviceorientation', applyOrientation);
    this._offerMotionPermission(sim);
  };

  MarblesTiltElement.prototype._unbindMotion = function () {
    if (this._onMotion) {
      window.removeEventListener('devicemotion', this._onMotion);
      this._onMotion = null;
    }
    if (this._onOrientation) {
      window.removeEventListener('deviceorientation', this._onOrientation);
      this._onOrientation = null;
    }
    this._hidePrompt();
  };

  MarblesTiltElement.prototype._cowSrc = function () {
    var art = this.getAttribute('art') || '';
    var raw = this.getAttribute('cow') ||
      (art.indexOf('all/') === 0 ? 'img/bungee-cow.png' : '../img/bungee-cow.png');
    return window.AfterDark && AfterDark.bust ? AfterDark.bust(raw) : raw;
  };

  MarblesTiltElement.prototype._anchor = function () {
    var r = this.getBoundingClientRect();
    return { x: r.width - 18, y: r.height - 18 };
  };

  MarblesTiltElement.prototype._placeCowRest = function () {
    if (!this._cow) { return; }
    var a = this._anchor();
    // Rest a short rope-length up-left of the peg.
    var x = a.x - ROPE_LEN * 0.55;
    var y = a.y - ROPE_LEN * 0.55;
    this._cow.style.left = x + 'px';
    this._cow.style.top = y + 'px';
    this._cowX = x;
    this._cowY = y;
    this._drawRope();
  };

  MarblesTiltElement.prototype._gravityFromCow = function (sim) {
    var a = this._anchor();
    var x = this._cowX, y = this._cowY;
    // Peg is down-right; pulling the cow away from the peg tilts that way.
    var gx = (x - a.x) / ROPE_LEN;
    var gy = (y - a.y) / ROPE_LEN;
    // Rest pose is up-left of the peg → default pull toward bottom-right-ish;
    // bias so "hanging at rest" still reads as mostly screen-down.
    gy += 0.85;
    if (Math.hypot(gx, gy) < 0.12) { gx = 0; gy = 0.35; }
    sim.setGravity(gx, gy);
  };

  MarblesTiltElement.prototype._drawRope = function () {
    if (!this._rope || !this._cow) { return; }
    var a = this._anchor();
    var x1 = a.x, y1 = a.y;
    var x2 = this._cowX, y2 = this._cowY;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy) || 1;
    var ang = Math.atan2(dy, dx) * 180 / Math.PI;
    this._rope.style.width = len + 'px';
    this._rope.style.left = x1 + 'px';
    this._rope.style.top = y1 + 'px';
    this._rope.style.transform = 'rotate(' + ang + 'deg)';
  };

  MarblesTiltElement.prototype._showCow = function (sim) {
    if (this._cow) { return; }
    var self = this;

    var peg = document.createElement('div');
    peg.setAttribute('aria-hidden', 'true');
    peg.style.cssText =
      'position:absolute;right:10px;bottom:10px;width:10px;height:10px;' +
      'border-radius:50%;background:#c4a574;border:2px solid #6a4a2a;z-index:3;' +
      'box-shadow:0 1px 0 #0008';
    this.appendChild(peg);
    this._peg = peg;

    var rope = document.createElement('div');
    rope.setAttribute('aria-hidden', 'true');
    rope.style.cssText =
      'position:absolute;left:0;top:0;height:2px;width:40px;' +
      'background:#b08968;transform-origin:0 50%;z-index:2;pointer-events:none;' +
      'box-shadow:0 1px 0 #0006';
    this.appendChild(rope);
    this._rope = rope;

    var cow = document.createElement('img');
    cow.src = this._cowSrc();
    cow.alt = 'Tilt cow — drag or use arrow keys';
    cow.title = 'Drag the cow (or use arrow keys) to tilt';
    cow.draggable = false;
    cow.setAttribute('role', 'slider');
    cow.setAttribute('aria-label', 'Tilt control — drag the cow or press arrow keys');
    cow.style.cssText =
      'position:absolute;width:36px;height:auto;image-rendering:pixelated;' +
      'transform:translate(-50%,-50%);z-index:4;' +
      'cursor:grab;touch-action:none;user-select:none;-webkit-user-drag:none;' +
      'filter:drop-shadow(0 2px 0 #0008)';
    this.appendChild(cow);
    this._cow = cow;

    var hint = document.createElement('div');
    hint.textContent = 'Drag cow · arrows tilt';
    hint.style.cssText =
      'position:absolute;right:8px;bottom:52px;z-index:2;color:#e8e0c8;' +
      'font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif;' +
      'text-shadow:0 1px 0 #000;pointer-events:none;text-align:right;' +
      'opacity:0.9';
    this.appendChild(hint);
    this._cowHint = hint;

    function setCow(px, py, fromUser) {
      var a = self._anchor();
      var dx = px - a.x, dy = py - a.y;
      var d = Math.hypot(dx, dy);
      if (d > ROPE_LEN && d > 0) {
        dx = dx / d * ROPE_LEN;
        dy = dy / d * ROPE_LEN;
        px = a.x + dx;
        py = a.y + dy;
      }
      self._cowX = px;
      self._cowY = py;
      cow.style.left = px + 'px';
      cow.style.top = py + 'px';
      self._drawRope();
      if (fromUser) {
        self._manual = true;
        self._gravityFromCow(sim);
        hint.style.opacity = '0.35';
      }
    }

    function onDown(e) {
      e.preventDefault();
      e.stopPropagation();
      cow.style.cursor = 'grabbing';
      self._cowDragging = true;
      self.focus();
      var pt = e.touches ? e.touches[0] : e;
      var r = self.getBoundingClientRect();
      setCow(pt.clientX - r.left, pt.clientY - r.top, true);
    }
    function onMove(e) {
      if (!self._cowDragging) { return; }
      e.preventDefault();
      var pt = e.touches ? e.touches[0] : e;
      var r = self.getBoundingClientRect();
      setCow(pt.clientX - r.left, pt.clientY - r.top, true);
    }
    function onUp() {
      self._cowDragging = false;
      cow.style.cursor = 'grab';
    }

    cow.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    this._cowOnMove = onMove;
    this._cowOnUp = onUp;
    this._setCow = setCow;

    this._placeCowRest();
    this._gravityFromCow(sim);
  };

  MarblesTiltElement.prototype._hideCow = function () {
    if (this._cowDragging) { return; }
    if (this._cowOnMove) {
      window.removeEventListener('pointermove', this._cowOnMove);
      this._cowOnMove = null;
    }
    if (this._cowOnUp) {
      window.removeEventListener('pointerup', this._cowOnUp);
      window.removeEventListener('pointercancel', this._cowOnUp);
      this._cowOnUp = null;
    }
    ['_cow', '_rope', '_peg', '_cowHint'].forEach(function (k) {
      var n = this[k];
      if (n && n.parentNode) { n.parentNode.removeChild(n); }
      this[k] = null;
    }, this);
    this._setCow = null;
  };

  MarblesTiltElement.prototype._bindKeys = function (sim) {
    if (this._onKey) { return; }
    var self = this;
    function onKey(e) {
      if (!isImmersive(self)) { return; }
      var k = e.key;
      if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' &&
          k !== 'ArrowRight') { return; }
      e.preventDefault();
      self._manual = true;
      var gx = sim.gx, gy = sim.gy;
      if (k === 'ArrowLeft') { gx -= KEY_STEP; }
      if (k === 'ArrowRight') { gx += KEY_STEP; }
      if (k === 'ArrowUp') { gy -= KEY_STEP; }
      if (k === 'ArrowDown') { gy += KEY_STEP; }
      sim.setGravity(gx, gy);
      // Move the cow on its rope to match, so the control stays honest.
      if (self._setCow) {
        var a = self._anchor();
        var tx = a.x + clamp(sim.gx, -1, 1) * ROPE_LEN;
        var ty = a.y + clamp(sim.gy - 0.85, -1, 1) * ROPE_LEN;
        self._setCow(tx, ty, false);
        self._cowX = parseFloat(self._cow.style.left);
        self._cowY = parseFloat(self._cow.style.top);
        self._drawRope();
      }
      if (self._cowHint) { self._cowHint.style.opacity = '0.35'; }
    }
    this._onKey = onKey;
    window.addEventListener('keydown', onKey);
  };

  MarblesTiltElement.prototype._unbindKeys = function () {
    if (this._onKey) {
      window.removeEventListener('keydown', this._onKey);
      this._onKey = null;
    }
  };

  MarblesTiltElement.prototype._offerMotionPermission = function (sim) {
    var self = this;
    var needsOrient = typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
    var needsMotion = typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';
    if (!needsOrient && !needsMotion) { return; }
    if (this._prompt) { return; }

    var prompt = document.createElement('button');
    prompt.type = 'button';
    prompt.textContent = 'Tap to enable tilt';
    prompt.setAttribute('aria-label', 'Enable accelerometer so marbles follow gravity');
    prompt.style.cssText =
      'position:absolute;left:50%;bottom:12%;transform:translateX(-50%);' +
      'z-index:5;padding:0.7em 1.2em;font:600 14px/1.2 ui-sans-serif,system-ui,sans-serif;' +
      'color:#111;background:#e8e0c8;border:0;border-radius:4px;cursor:pointer;' +
      'box-shadow:0 2px 0 #0006';
    this.appendChild(prompt);
    this._prompt = prompt;

    prompt.addEventListener('click', function () {
      var tasks = [];
      if (needsMotion) { tasks.push(DeviceMotionEvent.requestPermission()); }
      if (needsOrient) { tasks.push(DeviceOrientationEvent.requestPermission()); }
      Promise.all(tasks).then(function (states) {
        if (states.some(function (s) { return s === 'granted'; })) {
          self._hidePrompt();
        } else {
          prompt.textContent = 'Motion permission denied';
        }
      }).catch(function () {
        prompt.textContent = 'Motion unavailable';
      });
    });
  };

  MarblesTiltElement.prototype._hidePrompt = function () {
    if (this._prompt && this._prompt.parentNode) {
      this._prompt.parentNode.removeChild(this._prompt);
      this._prompt = null;
    }
  };

  MarblesTiltElement.prototype.disconnectedCallback = function () {
    this._unbindMotion();
    this._unbindKeys();
    this._hideCow();
    this._hidePrompt();
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-marbles-tilt', MarblesTiltElement);
  window.AfterDarkMarblesTilt = MarblesTilt;
  window.AfterDarkMarblesTilt.gravityFromAcceleration = gravityFromAcceleration;
  window.AfterDarkMarblesTilt.gravityFromOrientation = gravityFromOrientation;
  window.AfterDarkMarblesTilt.isImmersive = isImmersive;

  (function selftest() {
    var upright = gravityFromAcceleration(0, 9.8, false);
    console.assert(Math.abs(upright.x) < 0.05 && upright.y > 0.95, 'android upright');
    var flipped = gravityFromAcceleration(0, 9.8, true);
    console.assert(flipped.y < -0.95, 'invert flips upright');
  }());
}());
