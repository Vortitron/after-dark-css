/**
 * marbles-tilt.js - Marbles with accelerometer gravity.
 *
 * Same 1992 MARBLES2 artwork and pins as modules/marbles.js, but the marbles
 * fall toward true down: gravity follows the device when the saver is
 * immersive (full screen / its own tab). In the little Display Properties
 * preview it stays screen-down, so the monitor is not pulled sideways.
 *
 * The bungee cow is the manual control, and it is an honest plumb bob: she
 * hangs from a peg at the top of the screen on a rigid rope, and the rope
 * always points the way the marbles fall. Drag her round the peg, or use the
 * arrow keys, to tilt. When the accelerometer is driving, she swings to match
 * it rather than being dragged.
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

  var ROPE_LEN = 78;                   // how far the cow hangs below her peg
  var PEG_Y = 18;                      // and how far the peg is from the top
  var COW_W = 36;                      // she is 42 x 77, so 36 x 66 on screen
  var COW_H = Math.round(COW_W * 77 / 42);
  var KEY_STEP = 7;                    // degrees of swing per key press
  var ROPE_FLOOR = 0.06;               // how near level the rope may be pulled
  var ROPE_MIN_DEG = Math.asin(ROPE_FLOOR) * 180 / Math.PI;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /**
   * True when this saver has the run of the display rather than sitting in
   * the 4:3 preview or somebody's 640x480 embed: its own tab, or a frame that
   * fills the screen, which is what the front page's Full screen button makes.
   */
  function isImmersive(el) {
    if (typeof window === 'undefined') { return true; }
    var r = el.getBoundingClientRect();
    if (r.width < 320 || r.height < 240) { return false; }
    if (r.width < window.innerWidth * 0.8 || r.height < window.innerHeight * 0.8) {
      return false;
    }
    if (window.self === window.top) { return true; }
    var sw = (window.screen && window.screen.availWidth) || window.innerWidth;
    var sh = (window.screen && window.screen.availHeight) || window.innerHeight;
    return window.innerWidth >= sw * 0.7 && window.innerHeight >= sh * 0.55;
  }

  /** Degrees the page is turned clockwise from the device's natural pose. */
  function screenAngle() {
    if (typeof window === 'undefined') { return 0; }
    var so = window.screen && window.screen.orientation;
    if (so && typeof so.angle === 'number') { return so.angle; }
    if (typeof window.orientation === 'number') { return window.orientation; }
    return 0;
  }

  /**
   * Device axes -> screen axes (x right, y down).
   *
   * The sensors report in the device's *natural* frame, which stops matching
   * the page the moment auto-rotate turns the layout. At `angle` degrees the
   * page's right is (cos, -sin) and the page's up is (sin, cos) in device
   * axes, so rotating by the screen angle is what keeps down pointing down.
   *
   * accelerationIncludingGravity is a support force - it points *up* - so
   * screen-down is +(A . pageUp) and screen-right is -(A . pageRight).
   * `invert` flips both axes for a device that reports the other polarity;
   * ?flip on the URL turns it on.
   */
  function gravityFromAcceleration(ax, ay, angle, invert) {
    var t = (angle || 0) * Math.PI / 180;
    var c = Math.cos(t), s = Math.sin(t);
    ax = ax || 0;
    ay = ay || 0;
    var gx = -(ax * c - ay * s) / G_EARTH;
    var gy = (ax * s + ay * c) / G_EARTH;
    if (invert) { gx = -gx; gy = -gy; }
    return { x: gx, y: gy };
  }

  /**
   * The same, from deviceorientation, for the browsers that will give beta
   * and gamma but no usable acceleration. In the natural frame the tilt reads
   * (sin gamma) to the right and (sin beta) down; then it turns like above.
   */
  function gravityFromOrientation(beta, gamma, angle, invert) {
    var t = (angle || 0) * Math.PI / 180;
    var c = Math.cos(t), s = Math.sin(t);
    var u = Math.sin((gamma || 0) * Math.PI / 180);
    var v = Math.sin((beta || 0) * Math.PI / 180);
    var gx = u * c + v * s;
    var gy = -u * s + v * c;
    var mag = Math.hypot(gx, gy);
    if (mag < 0.12) { return { x: 0, y: 0.35 }; }   // flat on the table
    gx /= mag;
    gy /= mag;
    if (invert) { gx = -gx; gy = -gy; }
    return { x: gx, y: gy };
  }

  /**
   * A rope cannot push. The cow swings from level, through hanging down, to
   * level the other way, and what she is pulled to is limited to that half -
   * which is also what keeps her on screen, since her peg is near the top.
   * The sensor is not limited this way: turn the phone over and she goes up
   * out of sight, which is where a real cow on a rope would be.
   */
  function ropeLimit(gx, gy) {
    var mag = Math.hypot(gx, gy);
    if (mag < 1e-4) { return { x: 0, y: 1 }; }
    gx /= mag;
    gy /= mag;
    if (gy < ROPE_FLOOR) {
      gy = ROPE_FLOOR;
      gx = (gx < 0 ? -1 : 1) * Math.sqrt(1 - gy * gy);
    }
    return { x: gx, y: gy };
  }

  /** How far the middle of a w by h box is from its edge, along a unit dir. */
  function halfExtent(dx, dy, w, h) {
    var tx = Math.abs(dx) > 1e-4 ? (w / 2) / Math.abs(dx) : Infinity;
    var ty = Math.abs(dy) > 1e-4 ? (h / 2) / Math.abs(dy) : Infinity;
    return Math.min(tx, ty);
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

  /* Gravity is kept as a direction and a strength, never as raw sensor units:
     a phone held flat should not stop the saver dead. */
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

  /** Which way is down, as a unit vector. */
  MarblesTilt.prototype.down = function () {
    var mag = Math.hypot(this.gx, this.gy);
    if (mag < 1e-4) { return { x: 0, y: 1 }; }
    return { x: this.gx / mag, y: this.gy / mag };
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
      var y = rand(this.pin.height, h - this.pin.height);
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

  /* Marbles come in over the uphill wall, spread along it, whichever wall
     that happens to be - so tilting the phone changes where they arrive. */
  MarblesTilt.prototype.release = function (w, h) {
    var g = this.down();
    var px = -g.y, py = g.x;                     // across the fall
    var up = Math.max(0, halfExtent(g.x, g.y, w, h) - R - 1);
    var across = Math.max(0, halfExtent(px, py, w, h) - R - 1);
    var side = rand(-0.85, 0.85) * across;
    var drift = rand(-18, 18);
    var type = Math.floor(rand(0, SMILEY + 1));
    var m = {
      type: type,
      sensitive: type === SMILEY,
      oh: 0,
      x: w / 2 - g.x * up + px * side,
      y: h / 2 - g.y * up + py * side,
      vx: g.x * 20 + px * drift,
      vy: g.y * 20 + py * drift,
      r: R
    };
    this.clampMarble(m, w, h);
    this.marbles.push(m);
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

    // Solver soft-pushes can sneak past the floor - clamp hard so a tilt does
    // not leak marbles off the edge of the visible canvas.
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
    // The pins sit in front, so the pile buries into them rather than over.
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
    // The cow is positioned against this box - but only take it over if the
    // page has not placed the element itself, or an inset:0 host collapses.
    if (getComputedStyle(this).position === 'static') {
      this.style.position = 'relative';
    }
    this.tabIndex = 0;                 // so the arrow keys have somewhere to go

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

      screen.onresize = function (w, h) {
        sim.reset(w, h);
        self._syncControls(sim);
        self._dirX = null;             // her peg moved with the middle of it
        self._swingCow(sim);
      };
      sim.reset(screen.width, screen.height);
      self._syncControls(sim);

      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
        self._swingCow(sim);           // the rope always shows where down is
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
      this._manual = false;
      sim.setGravity(0, 1);
      sim.usingSensor = false;
    }
  };

  /* ------------------------------------------------------------- sensors */

  MarblesTiltElement.prototype._bindMotion = function (sim) {
    if (this._onMotion) { return; }
    var self = this;
    var motionLive = false;

    function applyMotion(e) {
      if (!isImmersive(self) || self._manual) { return; }
      var ag = e.accelerationIncludingGravity;
      if (!ag || (ag.x == null && ag.y == null)) { return; }
      var ax = ag.x || 0, ay = ag.y || 0, az = ag.z || 0;
      if (Math.sqrt(ax * ax + ay * ay + az * az) < 2) { return; }  // no gravity in it
      var g = gravityFromAcceleration(ax, ay, screenAngle(), self._invert);
      sim.setGravity(g.x, g.y);
      sim.usingSensor = true;
      motionLive = true;
      self._hidePrompt();
    }

    function applyOrientation(e) {
      if (motionLive || !isImmersive(self) || self._manual) { return; }
      if (e.beta == null && e.gamma == null) { return; }
      var g = gravityFromOrientation(e.beta, e.gamma, screenAngle(), self._invert);
      sim.setGravity(g.x, g.y);
      sim.usingSensor = true;
      self._hidePrompt();
    }

    this._onMotion = applyMotion;
    this._onOrientation = applyOrientation;
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

  /* ----------------------------------------------------------- the cow */

  MarblesTiltElement.prototype._cowSrc = function () {
    var art = this.getAttribute('art') || '';
    var raw = this.getAttribute('cow') ||
      (art.indexOf('all/') === 0 ? 'img/bungee-cow.png' : '../img/bungee-cow.png');
    return window.AfterDark && AfterDark.bust ? AfterDark.bust(raw) : raw;
  };

  /** The peg she hangs from: middle of the top edge. */
  MarblesTiltElement.prototype._anchor = function () {
    var r = this.getBoundingClientRect();
    return { x: r.width / 2, y: PEG_Y };
  };

  /**
   * Hang the cow along `dir` from the peg. The rope is rigid, so she is always
   * exactly ROPE_LEN away and only the angle carries any information - which
   * is the whole point: the rope's direction *is* gravity's direction. She is
   * tied on by her hooves, at the top of her picture, and turns with the rope.
   */
  MarblesTiltElement.prototype._hangCow = function (dx, dy) {
    if (!this._cow) { return; }
    var mag = Math.hypot(dx, dy);
    if (mag < 1e-4) { dx = 0; dy = 1; mag = 1; }
    dx /= mag;
    dy /= mag;
    var a = this._anchor();
    var deg = Math.atan2(dy, dx) * 180 / Math.PI;

    this._rope.style.left = a.x + 'px';
    this._rope.style.top = a.y + 'px';
    this._rope.style.width = ROPE_LEN + 'px';
    this._rope.style.transform = 'rotate(' + deg + 'deg)';

    // Her hooves land on the end of the rope; hanging down is 90 degrees.
    this._cow.style.left = (a.x + dx * ROPE_LEN) + 'px';
    this._cow.style.top = (a.y + dy * ROPE_LEN) + 'px';
    this._cow.style.transform = 'translate(-50%,0) rotate(' + (deg - 90) + 'deg)';
  };

  /** Follow the simulation, so she reads as a plumb bob under sensor too. */
  MarblesTiltElement.prototype._swingCow = function (sim) {
    if (!this._cow) { return; }
    var g = sim.down();
    if (this._dirX === g.x && this._dirY === g.y) { return; }
    this._dirX = g.x;
    this._dirY = g.y;
    this._hangCow(g.x, g.y);
  };

  /** Point gravity at (px, py) in element coordinates - a drag on the rope. */
  MarblesTiltElement.prototype._pullCow = function (sim, px, py) {
    var a = this._anchor();
    var dx = px - a.x, dy = py - a.y;
    if (Math.hypot(dx, dy) < 4) { return; }        // right on the peg: no news
    var g = ropeLimit(dx, dy);
    this._manual = true;
    sim.setGravity(g.x, g.y);
    this._swingCow(sim);
    this._dimHint();
  };

  MarblesTiltElement.prototype._dimHint = function () {
    if (this._cowHint) { this._cowHint.style.opacity = '0.35'; }
  };

  MarblesTiltElement.prototype._showCow = function (sim) {
    if (this._cow) { return; }
    var self = this;

    var peg = document.createElement('div');
    peg.setAttribute('aria-hidden', 'true');
    peg.style.cssText =
      'position:absolute;left:50%;top:' + PEG_Y + 'px;width:10px;height:10px;' +
      'margin:-5px 0 0 -5px;border-radius:50%;background:#c4a574;' +
      'border:2px solid #6a4a2a;box-sizing:border-box;z-index:3;' +
      'box-shadow:0 1px 0 #0008';
    this.appendChild(peg);
    this._peg = peg;

    var rope = document.createElement('div');
    rope.setAttribute('aria-hidden', 'true');
    rope.style.cssText =
      'position:absolute;left:0;top:0;height:2px;width:0;margin-top:-1px;' +
      'background:#b08968;transform-origin:0 50%;z-index:2;pointer-events:none;' +
      'box-shadow:0 1px 0 #0006';
    this.appendChild(rope);
    this._rope = rope;

    var cow = document.createElement('img');
    cow.src = this._cowSrc();
    cow.alt = 'Tilt cow - drag her round the peg, or use the arrow keys';
    cow.title = 'Drag the cow (or use the arrow keys) to tilt';
    cow.draggable = false;
    cow.setAttribute('role', 'slider');
    cow.setAttribute('aria-label', 'Tilt control - drag the cow or press the arrow keys');
    cow.style.cssText =
      'position:absolute;width:' + COW_W + 'px;height:auto;' +
      'image-rendering:pixelated;transform-origin:50% 0;z-index:4;' +
      'cursor:grab;touch-action:none;user-select:none;-webkit-user-drag:none;' +
      'filter:drop-shadow(0 2px 0 #0008)';
    this.appendChild(cow);
    this._cow = cow;

    var hint = document.createElement('div');
    hint.textContent = 'Drag the cow, or tilt with the arrow keys';
    hint.style.cssText =
      'position:absolute;left:0;right:0;top:' + (PEG_Y + ROPE_LEN + COW_H + 14) + 'px;' +
      'z-index:2;color:#e8e0c8;text-align:center;' +
      'font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif;' +
      'text-shadow:0 1px 0 #000;pointer-events:none;opacity:0.9';
    this.appendChild(hint);
    this._cowHint = hint;

    function at(e) {
      var pt = e.touches ? e.touches[0] : e;
      var r = self.getBoundingClientRect();
      return { x: pt.clientX - r.left, y: pt.clientY - r.top };
    }
    function onDown(e) {
      e.preventDefault();
      e.stopPropagation();
      cow.style.cursor = 'grabbing';
      self._cowDragging = true;
      if (cow.setPointerCapture && e.pointerId != null) {
        try { cow.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      }
      self.focus();
      var p = at(e);
      self._pullCow(sim, p.x, p.y);
    }
    function onMove(e) {
      if (!self._cowDragging) { return; }
      e.preventDefault();
      var p = at(e);
      self._pullCow(sim, p.x, p.y);
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

    this._dirX = null;
    this._swingCow(sim);
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
    this._dirX = null;
    this._dirY = null;
  };

  /* -------------------------------------------------------------- keys */

  /**
   * Arrows nudge gravity and the cow swings to follow. They must not read as
   * "a key was pressed, put the screen saver away": the front page stops the
   * saver on any key, so keep the arrows here and hand every other key on.
   */
  MarblesTiltElement.prototype._bindKeys = function (sim) {
    if (this._onKey) { return; }
    var self = this;
    function onKey(e) {
      var k = e.key;
      var arrow = k === 'ArrowUp' || k === 'ArrowDown' ||
        k === 'ArrowLeft' || k === 'ArrowRight';
      if (!arrow || !isImmersive(self)) {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) { self._tellHostToStop(); }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      self._manual = true;
      // Swing her by a fixed angle: 90 degrees is hanging straight down, and
      // left and right are the two ends of the swing.
      var g = sim.down();
      var deg = Math.atan2(g.y, g.x) * 180 / Math.PI;
      if (deg < 0) { deg += 360; }
      if (k === 'ArrowLeft') { deg += KEY_STEP; }
      if (k === 'ArrowRight') { deg -= KEY_STEP; }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        // Up leans her further over, down brings her back - and down settles
        // on straight down rather than stepping past it.
        var lean = deg - 90;
        var side = lean > 0 ? 1 : (lean < 0 ? -1 : 0);
        var far = Math.abs(lean) + (k === 'ArrowUp' ? KEY_STEP : -KEY_STEP);
        deg = 90 + side * Math.max(0, far);
      }
      deg = clamp(deg, ROPE_MIN_DEG, 180 - ROPE_MIN_DEG);
      var rad = deg * Math.PI / 180;
      sim.setGravity(Math.cos(rad), Math.sin(rad));
      self._swingCow(sim);
      self._dimHint();
    }
    this._onKey = onKey;
    window.addEventListener('keydown', onKey);

    // A click anywhere but the cow still means "that's enough, thanks".
    function onTap(e) {
      if (self._cow && e.target === self._cow) { return; }
      self._tellHostToStop();
    }
    this._onTap = onTap;
    this.addEventListener('pointerdown', onTap);
  };

  MarblesTiltElement.prototype._unbindKeys = function () {
    if (this._onKey) {
      window.removeEventListener('keydown', this._onKey);
      this._onKey = null;
    }
    if (this._onTap) {
      this.removeEventListener('pointerdown', this._onTap);
      this._onTap = null;
    }
  };

  /* The front page runs the saver in a frame with nothing over it, so that the
     cow can be dragged; that costs it the click and key it used to stop on,
     and this gives them back. Nothing else listens, so it is a no-op alone. */
  MarblesTiltElement.prototype._tellHostToStop = function () {
    if (window.self === window.top || !window.parent) { return; }
    try { window.parent.postMessage('after-dark:stop', '*'); } catch (e) { /* fine */ }
  };

  /* ------------------------------------------------------- iOS permission */

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

    prompt.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    prompt.addEventListener('click', function (e) {
      e.stopPropagation();
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
    this._cowDragging = false;
    this._hideCow();
    this._hidePrompt();
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-marbles-tilt', MarblesTiltElement);
  window.AfterDarkMarblesTilt = MarblesTilt;
  window.AfterDarkMarblesTilt.gravityFromAcceleration = gravityFromAcceleration;
  window.AfterDarkMarblesTilt.gravityFromOrientation = gravityFromOrientation;
  window.AfterDarkMarblesTilt.isImmersive = isImmersive;
  window.AfterDarkMarblesTilt.screenAngle = screenAngle;
  window.AfterDarkMarblesTilt.ropeLimit = ropeLimit;

  /* Held upright, down is down - in portrait and in either landscape. */
  (function selftest() {
    function near(a, b) { return Math.abs(a - b) < 0.05; }
    var up = gravityFromAcceleration(0, 9.80665, 0, false);
    console.assert(near(up.x, 0) && near(up.y, 1), 'portrait upright falls down');
    var left = gravityFromAcceleration(9.80665, 0, 90, false);
    console.assert(near(left.x, 0) && near(left.y, 1), 'landscape 90 falls down');
    var right = gravityFromAcceleration(-9.80665, 0, 270, false);
    console.assert(near(right.x, 0) && near(right.y, 1), 'landscape 270 falls down');
    var flipped = gravityFromAcceleration(0, 9.80665, 0, true);
    console.assert(near(flipped.y, -1), 'invert flips upright');
    var tipped = gravityFromOrientation(90, 0, 0, false);
    console.assert(near(tipped.x, 0) && near(tipped.y, 1), 'beta 90 falls down');
    var landscape = gravityFromOrientation(0, -90, 90, false);
    console.assert(near(landscape.x, 0) && near(landscape.y, 1), 'gamma -90 at 90');
  }());
}());
