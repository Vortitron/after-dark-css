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
 * iOS needs a user gesture before DeviceOrientationEvent will fire; the
 * element shows a tap prompt when permission is required. Desktop falls
 * back to screen-down gravity, with the pointer offering a light tilt for
 * trying the slosh without a phone.
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

  var GRAVITY = 340;
  var BOUNCE = 0.55;
  var WALL_BOUNCE = 0.35;
  var MARBLE_BOUNCE = 0.28;
  var FRICTION = 0.88;
  var DAMP = 0.999;
  var PIN_HIT = 0.42;
  var MAX_TOTAL = 220;
  var SOLVER_PASSES = 3;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /**
   * Map deviceorientation beta/gamma (degrees) into a unit gravity vector in
   * screen coordinates. screenAngle is screen.orientation.angle (0 / 90 /
   * 180 / 270): the browser has already rotated the layout, so gravity must
   * be rotated the other way to keep pointing at Earth.
   */
  function gravityFromOrientation(beta, gamma, screenAngle) {
    // Device frame (W3C): upright portrait → (0, 1) toward the bottom edge.
    var dx = Math.sin((gamma || 0) * Math.PI / 180);
    var dy = Math.sin((beta || 0) * Math.PI / 180);
    var mag = Math.hypot(dx, dy);
    if (mag < 0.12) {
      // Nearly flat: keep a weak pull so marbles settle rather than float.
      return { x: 0, y: 0.35, flat: true };
    }
    dx /= mag;
    dy /= mag;
    // Events are device-relative; the canvas is screen-relative after the
    // browser rotates the layout, so undo screen.orientation.angle.
    var rad = -((screenAngle || 0) * Math.PI / 180);
    var c = Math.cos(rad), s = Math.sin(rad);
    return { x: dx * c - dy * s, y: dx * s + dy * c, flat: false };
  }

  function screenAngle() {
    if (typeof screen !== 'undefined' && screen.orientation &&
        typeof screen.orientation.angle === 'number') {
      return screen.orientation.angle;
    }
    if (typeof window !== 'undefined' && typeof window.orientation === 'number') {
      return window.orientation;
    }
    return 0;
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
    if (mag < 1e-6) { this.gx = 0; this.gy = 1; return; }
    this.gx = gx / mag;
    this.gy = gy / mag;
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
    var x = w / 2 - gx * (Math.max(w, h) * 0.55) + (-gy) * lateral;
    var y = h / 2 - gy * (Math.max(w, h) * 0.55) + gx * lateral;
    x = clamp(x, R, w - R);
    y = clamp(y, -CELL * 2, h + CELL * 2);
    var type = Math.floor(rand(0, SMILEY + 1));
    this.marbles.push({
      type: type,
      sensitive: type === SMILEY,
      oh: 0,
      x: x,
      y: y,
      vx: rand(-18, 18),
      vy: rand(-18, 18),
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

      // Walls — all four, since any edge can be "the floor".
      if (m.x < m.r) {
        m.x = m.r; m.vx = Math.abs(m.vx) * WALL_BOUNCE; m.vy *= FRICTION;
      } else if (m.x > w - m.r) {
        m.x = w - m.r; m.vx = -Math.abs(m.vx) * WALL_BOUNCE; m.vy *= FRICTION;
      }
      if (m.y < m.r) {
        m.y = m.r; m.vy = Math.abs(m.vy) * WALL_BOUNCE; m.vx *= FRICTION;
      } else if (m.y > h - m.r) {
        m.y = h - m.r; m.vy = -Math.abs(m.vy) * WALL_BOUNCE; m.vx *= FRICTION;
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

    // Too full to see the pins — clear and start again, like the original.
    if (this.marbles.length >= MAX_TOTAL) { this.reset(w, h); }
  };

  MarblesTilt.prototype.resolve = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.hypot(dx, dy) || 0.0001;
    var min = a.r + b.r;
    if (dist >= min) { return; }
    var nx = dx / dist, ny = dy / dist;
    var overlap = min - dist;
    var push = overlap / 2;
    a.x -= nx * push; a.y -= ny * push;
    b.x += nx * push; b.y += ny * push;

    var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    var vn = rvx * nx + rvy * ny;
    if (vn > 0) { return; }
    var jimp = -(1 + MARBLE_BOUNCE) * vn / 2;
    var ix = jimp * nx, iy = jimp * ny;
    a.vx -= ix; a.vy -= iy;
    b.vx += ix; b.vy += iy;
    if (a.sensitive && Math.hypot(ix, iy) > 8) { a.oh = OH; }
    if (b.sensitive && Math.hypot(ix, iy) > 8) { b.oh = OH; }
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
    function applyOrientation(e) {
      if (e.beta == null && e.gamma == null) { return; }
      var g = gravityFromOrientation(e.beta, e.gamma, screenAngle());
      sim.setGravity(g.x, g.y);
      sim.usingSensor = true;
      self._hidePrompt();
    }

    function onPointer(e) {
      if (sim.usingSensor) { return; }
      var r = self.getBoundingClientRect();
      if (!r.width || !r.height) { return; }
      // Pointer offset from centre → light tilt, for desktop try-outs.
      var nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      var ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
      sim.setGravity(nx * 0.85, 1 + ny * 0.55);
    }

    this._onOrientation = applyOrientation;
    this._onPointer = onPointer;
    window.addEventListener('deviceorientation', applyOrientation);
    this.addEventListener('pointermove', onPointer);

    this._offerMotionPermission(sim);
  };

  MarblesTiltElement.prototype._offerMotionPermission = function (sim) {
    var self = this;
    var needsGesture = typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';

    if (!needsGesture && typeof window.DeviceOrientationEvent === 'undefined') {
      return;
    }

    if (!needsGesture) {
      // Android / desktop with the event: wait briefly; if nothing arrives,
      // leave pointer-tilt as the fallback.
      return;
    }

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
      DeviceOrientationEvent.requestPermission().then(function (state) {
        if (state === 'granted') {
          sim.usingSensor = true;
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
    if (this._onOrientation) {
      window.removeEventListener('deviceorientation', this._onOrientation);
      this._onOrientation = null;
    }
    if (this._onPointer) {
      this.removeEventListener('pointermove', this._onPointer);
      this._onPointer = null;
    }
    this._hidePrompt();
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-marbles-tilt', MarblesTiltElement);
  window.AfterDarkMarblesTilt = MarblesTilt;
  window.AfterDarkMarblesTilt.gravityFromOrientation = gravityFromOrientation;

  // Lightweight checks for the orientation → gravity mapping.
  (function selftest() {
    var upright = gravityFromOrientation(90, 0, 0);
    console.assert(Math.abs(upright.x) < 0.05 && upright.y > 0.95, 'upright → +y');
    var tipRight = gravityFromOrientation(90, 45, 0);
    console.assert(tipRight.x > 0.3 && tipRight.y > 0.3, 'tip right → +x/+y');
    // Landscape hold: sensors say −x in device frame, layout is rotated 90°.
    var landscape = gravityFromOrientation(0, -90, 90);
    console.assert(Math.abs(landscape.x) < 0.05 && landscape.y > 0.95,
      'landscape hold → +y on screen');
  }());
}());
