/**
 * marbles-tilt.js - Marbles with accelerometer gravity.
 *
 * Same 1992 MARBLES2 artwork and pins as modules/marbles.js, but gravity
 * follows the device: on a phone the marbles fall toward true down when you
 * rotate or tilt, and the pile at the bottom is a free-body stack that
 * sloshes instead of snapping onto the original lattice.
 *
 *   <after-dark-marbles-tilt art="art/marbles2" pins="many"
 *     pin-size="medium" speed="medium"></after-dark-marbles-tilt>
 *
 * Motion comes from DeviceMotion accelerationIncludingGravity (true down in
 * every attitude, including upside-down). Screen-angle compensation is only
 * applied when the *layout* is landscape — never from window.orientation alone,
 * which still flips under an orientation lock and was sending portrait sessions
 * into a sideways gravity frame.
 *
 * iOS needs a user gesture before motion events will fire; the element shows a
 * tap prompt when permission is required. Desktop falls back to screen-down
 * gravity, with the pointer offering a light tilt for trying the slosh.
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

  var GRAVITY = 520;                   // px/s² at full tilt
  var BOUNCE = 0.48;
  var WALL_BOUNCE = 0.12;
  var WALL_SLIDE = 0.985;              // keep tangential speed on walls
  var MARBLE_BOUNCE = 0.08;
  var MARBLE_SLIDE = 0.97;             // soft pile — little tangential glue
  var DAMP = 0.9994;
  var PIN_HIT = 0.42;
  var MAX_TOTAL = 220;
  var SOLVER_PASSES = 2;
  var G_EARTH = 9.80665;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /**
   * Layout rotation only — how the page is actually drawn, not how the phone
   * is held. window.orientation / screen.orientation.angle can track the
   * physical device even when auto-rotate is locked; using those on a portrait
   * layout was the "landscape gravity on a portrait screen" bug.
   */
  function layoutAngle() {
    if (typeof window === 'undefined') { return 0; }
    if (window.innerWidth <= window.innerHeight) { return 0; }
    var a = 90;
    if (typeof screen !== 'undefined' && screen.orientation &&
        typeof screen.orientation.angle === 'number') {
      var s = screen.orientation.angle;
      if (s === 90 || s === 270) { a = s; }
    } else if (typeof window.orientation === 'number') {
      if (window.orientation === 90 || window.orientation === -90 ||
          window.orientation === 270) {
        a = window.orientation === -90 ? 270 : window.orientation;
      }
    }
    return a;
  }

  /**
   * Map accelerationIncludingGravity into CSS screen space (x right, y down).
   *
   * Chrome on Android reports the support force (points "up" when at rest), so
   * earth is the opposite: screen = (-ax, ay). iOS historically reports the
   * other way: screen = (ax, -ay). No one-shot calibration — that was locking
   * the wrong polarity from an early sample and then pulling marbles to the
   * *top* of the screen once the phone was upright.
   */
  function gravityFromAcceleration(ax, ay, angle) {
    var gx, gy;
    if (isAppleTouch() || gravFlip()) {
      gx = (ax || 0) / G_EARTH;
      gy = -(ay || 0) / G_EARTH;
    } else {
      // Android / desktop Chrome — ag points "up" at rest.
      gx = -(ax || 0) / G_EARTH;
      gy = (ay || 0) / G_EARTH;
    }
    if (!angle) { return { x: gx, y: gy }; }
    var rad = -(angle * Math.PI / 180);
    var c = Math.cos(rad), s = Math.sin(rad);
    return { x: gx * c - gy * s, y: gx * s + gy * c };
  }

  function isAppleTouch() {
    if (typeof navigator === 'undefined') { return false; }
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) { return true; }
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  /** Escape hatch: ?flip=1 on the page URL inverts the accel mapping. */
  function gravFlip() {
    var s = (typeof location !== 'undefined' && location.search) || '';
    return /(?:\?|&)flip(?:=|&|$)/.test(s) && !/(?:\?|&)flip=(?:0|no|off|false)/.test(s);
  }

  /**
   * Fallback from deviceorientation when motion is unavailable.
   * Keep it simple: sin(gamma)/sin(beta), no upside-down hacks that invert
   * normal holds. Motion is preferred on Android.
   */
  function gravityFromOrientation(beta, gamma, angle) {
    var dx = Math.sin((gamma || 0) * Math.PI / 180);
    var dy = Math.sin((beta || 0) * Math.PI / 180);
    var mag = Math.hypot(dx, dy);
    if (mag < 0.12) { return { x: 0, y: 0.35 }; }
    dx /= mag;
    dy /= mag;
    if (!angle) { return { x: dx, y: dy }; }
    var rad = -(angle * Math.PI / 180);
    var c = Math.cos(rad), s = Math.sin(rad);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
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

  /** Strength follows how hard the device is tilted (not always unit). */
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

  /** Drop a marble from the edge opposite gravity ("the sky"). */
  MarblesTilt.prototype.release = function (w, h) {
    var gx = this.gx, gy = this.gy;
    var lateral = rand(-0.42, 0.42) * Math.min(w, h);
    var reach = Math.max(w, h) * 0.55;
    var x = w / 2 - gx * reach + (-gy) * lateral;
    var y = h / 2 - gy * reach + gx * lateral;
    // Keep a little off-screen on the sky side; only clamp the lateral axis.
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

    if (this.marbles.length >= MAX_TOTAL) { this.reset(w, h); }
  };

  MarblesTilt.prototype.resolve = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.hypot(dx, dy) || 0.0001;
    var min = a.r + b.r;
    if (dist >= min) { return; }
    var nx = dx / dist, ny = dy / dist;
    var overlap = min - dist;
    // Soft separation so the pile can shear rather than lock into a lattice.
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

    // Tangential slip — this is what makes the pile pour instead of sticking.
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
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);

      self._bindMotion(sim);
      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  MarblesTiltElement.prototype._bindMotion = function (sim) {
    var self = this;
    var SENSOR_WAIT = 1400;
    // Once DeviceMotion has delivered a real sample, ignore orientation —
    // the two APIs were fighting and orientation was winning with a bad frame.
    var motionLive = false;

    function applyMotion(e) {
      if (self._cowDragging || self._cowTouched) { return; }
      var ag = e.accelerationIncludingGravity;
      if (!ag || (ag.x == null && ag.y == null)) { return; }
      var ax = ag.x || 0, ay = ag.y || 0, az = ag.z || 0;
      if (Math.sqrt(ax * ax + ay * ay + az * az) < 2) { return; }
      var g = gravityFromAcceleration(ax, ay, layoutAngle());
      sim.setGravity(g.x, g.y);
      sim.usingSensor = true;
      motionLive = true;
      self._hidePrompt();
      self._hideCow();
    }

    function applyOrientation(e) {
      if (motionLive || self._cowDragging || self._cowTouched) { return; }
      if (e.beta == null && e.gamma == null) { return; }
      var g = gravityFromOrientation(e.beta, e.gamma, layoutAngle());
      sim.setGravity(g.x, g.y);
      sim.usingSensor = true;
      self._hidePrompt();
      self._hideCow();
    }

    this._onMotion = applyMotion;
    this._onOrientation = applyOrientation;
    window.addEventListener('devicemotion', applyMotion);
    window.addEventListener('deviceorientation', applyOrientation);

    this._offerMotionPermission(sim);
    this._sensorTimer = setTimeout(function () {
      if (!sim.usingSensor) { self._showCow(sim); }
    }, SENSOR_WAIT);
  };

  /**
   * Bungee cow as a drag-tilt joystick when the device has no accelerometer
   * (desktop), or motion never arrives. Drag her around the screen — gravity
   * points from the centre toward the cow.
   */
  MarblesTiltElement.prototype._cowSrc = function () {
    var art = this.getAttribute('art') || '';
    var raw = this.getAttribute('cow') ||
      (art.indexOf('all/') === 0 ? 'img/bungee-cow.png' : '../img/bungee-cow.png');
    return window.AfterDark && AfterDark.bust ? AfterDark.bust(raw) : raw;
  };

  MarblesTiltElement.prototype._showCow = function (sim) {
    if (this._cow) { return; }
    var self = this;
    var cow = document.createElement('img');
    cow.src = this._cowSrc();
    cow.alt = 'Drag the cow to tilt';
    cow.title = 'Drag the cow to tilt gravity';
    cow.draggable = false;
    cow.setAttribute('role', 'slider');
    cow.setAttribute('aria-label', 'Tilt control — drag the cow');
    cow.style.cssText =
      'position:absolute;width:42px;height:auto;image-rendering:pixelated;' +
      'left:50%;top:72%;transform:translate(-50%,-50%);z-index:3;' +
      'cursor:grab;touch-action:none;user-select:none;-webkit-user-drag:none;' +
      'filter:drop-shadow(0 2px 0 #0008)';
    this.appendChild(cow);
    this._cow = cow;
    this._cowTouched = false;

    var hint = document.createElement('div');
    hint.textContent = 'Drag the cow to tilt';
    hint.style.cssText =
      'position:absolute;left:50%;bottom:4%;transform:translateX(-50%);' +
      'z-index:2;color:#e8e0c8;font:600 12px/1.2 ui-sans-serif,system-ui,sans-serif;' +
      'text-shadow:0 1px 0 #000;pointer-events:none;white-space:nowrap';
    this.appendChild(hint);
    this._cowHint = hint;

    function setFromPointer(clientX, clientY) {
      var r = self.getBoundingClientRect();
      if (!r.width || !r.height) { return; }
      var px = clientX - r.left;
      var py = clientY - r.top;
      cow.style.left = px + 'px';
      cow.style.top = py + 'px';
      cow.style.transform = 'translate(-50%,-50%)';
      // Vector from centre → cow = gravity (screen y grows downward).
      var gx = (px / r.width - 0.5) * 2;
      var gy = (py / r.height - 0.5) * 2;
      // Keep a little pull even near the centre so marbles do not float.
      if (Math.hypot(gx, gy) < 0.12) { gx = 0; gy = 0.35; }
      sim.setGravity(gx, gy);
    }

    function onDown(e) {
      e.preventDefault();
      cow.style.cursor = 'grabbing';
      self._cowDragging = true;
      self._cowTouched = true;
      hint.style.opacity = '0';
      var pt = e.touches ? e.touches[0] : e;
      setFromPointer(pt.clientX, pt.clientY);
    }
    function onMove(e) {
      if (!self._cowDragging) { return; }
      e.preventDefault();
      var pt = e.touches ? e.touches[0] : e;
      setFromPointer(pt.clientX, pt.clientY);
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

    // Park her a little below centre so default gravity is "down".
    var r = this.getBoundingClientRect();
    if (r.width) {
      setFromPointer(r.left + r.width * 0.5, r.top + r.height * 0.72);
    }
  };

  MarblesTiltElement.prototype._hideCow = function () {
    if (this._cowDragging) { return; }
    this._cowTouched = false;
    if (this._cowOnMove) {
      window.removeEventListener('pointermove', this._cowOnMove);
      this._cowOnMove = null;
    }
    if (this._cowOnUp) {
      window.removeEventListener('pointerup', this._cowOnUp);
      window.removeEventListener('pointercancel', this._cowOnUp);
      this._cowOnUp = null;
    }
    if (this._cow && this._cow.parentNode) {
      this._cow.parentNode.removeChild(this._cow);
    }
    this._cow = null;
    if (this._cowHint && this._cowHint.parentNode) {
      this._cowHint.parentNode.removeChild(this._cowHint);
    }
    this._cowHint = null;
  };

  MarblesTiltElement.prototype._offerMotionPermission = function (sim) {
    var self = this;
    var needsOrient = typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
    var needsMotion = typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';

    // Android Chrome does not need a gesture; only iOS does.
    if (!needsOrient && !needsMotion) { return; }

    var prompt = document.createElement('button');
    prompt.type = 'button';
    prompt.textContent = 'Tap to enable tilt';
    prompt.setAttribute('aria-label', 'Enable accelerometer so marbles follow gravity');
    prompt.style.cssText =
      'position:absolute;left:50%;bottom:12%;transform:translateX(-50%);' +
      'z-index:2;padding:0.7em 1.2em;font:600 14px/1.2 ui-sans-serif,system-ui,sans-serif;' +
      'color:#111;background:#e8e0c8;border:0;border-radius:4px;cursor:pointer;' +
      'box-shadow:0 2px 0 #0006';
    this.appendChild(prompt);
    this._prompt = prompt;

    prompt.addEventListener('click', function () {
      var tasks = [];
      if (needsMotion) {
        tasks.push(DeviceMotionEvent.requestPermission());
      }
      if (needsOrient) {
        tasks.push(DeviceOrientationEvent.requestPermission());
      }
      Promise.all(tasks).then(function (states) {
        var ok = states.some(function (s) { return s === 'granted'; });
        if (ok) {
          self._hidePrompt();
        } else {
          prompt.textContent = 'Motion permission denied';
          self._showCow(sim);
        }
      }).catch(function () {
        prompt.textContent = 'Motion unavailable';
        self._showCow(sim);
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
    if (this._sensorTimer) {
      clearTimeout(this._sensorTimer);
      this._sensorTimer = 0;
    }
    if (this._onMotion) {
      window.removeEventListener('devicemotion', this._onMotion);
      this._onMotion = null;
    }
    if (this._onOrientation) {
      window.removeEventListener('deviceorientation', this._onOrientation);
      this._onOrientation = null;
    }
    this._hideCow();
    this._hidePrompt();
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-marbles-tilt', MarblesTiltElement);
  window.AfterDarkMarblesTilt = MarblesTilt;
  window.AfterDarkMarblesTilt.gravityFromAcceleration = gravityFromAcceleration;
  window.AfterDarkMarblesTilt.gravityFromOrientation = gravityFromOrientation;
  window.AfterDarkMarblesTilt.layoutAngle = layoutAngle;

  (function selftest() {
    // Android upright: ag ≈ (0, +9.8, 0) → screen down.
    var upright = gravityFromAcceleration(0, 9.8, 0);
    console.assert(Math.abs(upright.x) < 0.05 && upright.y > 0.95, 'android upright');
    var inverted = gravityFromAcceleration(0, -9.8, 0);
    console.assert(inverted.y < -0.95, 'android upside-down → −y');
    var tipRight = gravityFromAcceleration(-9.8, 0, 0);
    console.assert(tipRight.x > 0.95, 'android tip-right → +x');
  }());
}());
