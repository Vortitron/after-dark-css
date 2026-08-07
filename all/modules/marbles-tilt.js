/**
 * marbles-tilt.js - Marbles with accelerometer gravity.
 *
 * Same 1992 MARBLES2 artwork and pins as modules/marbles.js, but the marbles
 * fall toward true down: gravity follows the device when the saver is
 * immersive (full screen / its own tab). In the little Display Properties
 * preview it stays screen-down, so the monitor is not pulled sideways.
 *
 * The bungee cow is the manual control, for screens with nothing to tilt: an
 * honest plumb bob, hanging from a peg at the top on a rigid rope that always
 * points the way the marbles fall. Drag her round the peg, or use the arrow
 * keys. The moment a real sensor reports she comes down - she would only be a
 * puppet of it, twitching along with its noise.
 *
 * Unlike the 1992 original the pile does not snap onto a lattice, so it can be
 * poured about; it fills for a minute or two, and when there is no room left
 * the walls give way, the whole lot pours off the downhill edge, and then the
 * pins go up as fireworks - rather than the screen blinking clean. Turning the
 * phone over turns the field with it - same pins, same marbles, same places -
 * since the screen has not changed, it has only been rotated.
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
  var SOLVER_PASSES = 3;               // a deep pile needs more than a couple

  /* What keeps the bottom of a deep pile still. Below REST_SPEED a knock is
     not a bounce, it is a stop; contacts grip instead of sliding; and a
     fraction of overlap is left alone rather than being shoved at forever,
     which is the shiver you see when a few hundred marbles are stacked up. */
  var REST_SPEED = 26;                 // pixels a second
  var REST_SLIDE = 0.55;               // grip between two marbles at rest
  var REST_DAMP = 0.86;                // and how fast the last twitch dies
  var SLOP = 0.4;                      // overlap not worth correcting, px
  var STILL_SPEED = 14;                // got nowhere this frame, px a second
  var SLEEP_DAMP = 0.5;                // so let its held-back speed go
  var G_EARTH = 9.80665;

  /* How full it gets before the floor drops out, as a share of the screen the
     marbles cover - the pile is a proper drift by then rather than a scattering
     of a couple of hundred. */
  var FULL_SHARE = 0.18;
  var MIN_TOTAL = 60, MAX_TOTAL = 900;
  var FILL_TIME = 100;                 // seconds to fill, whatever the screen
  var DRAIN_MAX = 9;                   // seconds before the last few are swept
  var DRAIN_SHAKE = 130;               // and how hard the stragglers are shaken

  /* And then the pins go up. They light one after another, in a wave across
     the screen, and what is left of them falls the way everything else does -
     so the fireworks lean with the phone too. */
  var SPARKS_PER_PIN = 13;
  var FUSE_SPREAD = 1.1;               // seconds for the wave to cross
  var SPARK_LIFE = 0.8, SPARK_LIFE_2 = 1.8;
  var SPARK_SPEED = 70, SPARK_SPEED_2 = 290;
  var SPARK_DRAG = 0.985;
  var SPARK_WEIGHT = 0.35;             // sparks fall lighter than marbles
  var BURST_COLOURS = ['#fff6c8', '#ffd23f', '#ff8c2b', '#ff4e3a',
                       '#8ad4ff', '#b78aff', '#7dff9b'];

  var ROPE_LEN = 78;                   // how far the cow hangs below her peg
  var PEG_Y = 18;                      // and how far the peg is from the top
  var COW_W = 36;                      // she is 42 x 77, so 36 x 66 on screen
  var COW_H = Math.round(COW_W * 77 / 42);
  var KEY_STEP = 7;                    // degrees of swing per key press
  var ROPE_FLOOR = 0.06;               // how near level the rope may be pulled
  var ROPE_MIN_DEG = Math.asin(ROPE_FLOOR) * 180 / Math.PI;
  var PEG_X = 0.75;                    // her peg, across the screen
  var COW_WAIT = 1200;                 // ms to wait for a sensor before her
  var HINT_HOLD = 6000;                // ms the "drag the cow" line stays up

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** What comes back off a wall from an approach speed of `into`. */
  function bounceOff(into) {
    if (into <= 0) { return 0; }
    return into > REST_SPEED ? into * WALL_BOUNCE : 0;
  }

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

  /**
   * Did a w by h screen just become h by w? Not to the pixel, it never is -
   * the browser's furniture is a different size in portrait - but close
   * enough that this was a phone being turned over and not a window resize.
   */
  function swapped(w, h, nw, nh) {
    if (!w || !h || Math.abs(w - h) < 24) { return false; }
    return Math.abs(nw - h) < h * 0.2 && Math.abs(nh - w) < w * 0.2 &&
      Math.abs(nw - w) > w * 0.05;
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
    this.draining = 0;
    this.blowing = false;
    this.bursting = 0;
    this.sparks = [];
  }

  MarblesTilt.prototype.setPinSize = function (name) {
    var bm = this.pinArt.bitmap(PIN_SIZES[name] || PIN_SIZES.medium);
    this.pin = bm;
    this.pinR = bm ? bm.width * PIN_HIT : 0;
    this._pinIndex = null;
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

  /** How many pins a box this size is worth, at the chosen density. */
  MarblesTilt.prototype.wanted = function (w, h) {
    if (!this.density || !this.pin) { return 0; }
    return Math.round((w * h) / this.density);
  };

  /* The pins are scattered rather than laid out, but never close enough to
     seal a gap a marble could not fall through. Pins already down are left
     where they are, so this both fills an empty screen and tops one up. */
  MarblesTilt.prototype.topUp = function (w, h) {
    var wanted = this.wanted(w, h);
    if (!wanted) { return; }
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
    this._pinIndex = null;
  };

  MarblesTilt.prototype.scatter = function (w, h) {
    this.pins = [];
    this._pinIndex = null;
    this.topUp(w, h);
  };

  MarblesTilt.prototype.reset = function (w, h) {
    this.marbles = [];
    this.sparks = [];
    this.scatter(w, h);
    this.spawn = 0;
    this.draining = 0;
    this.blowing = false;
    this.bursting = 0;
  };

  /** How many marbles this screen holds before the floor drops out. */
  MarblesTilt.prototype.cap = function (w, h) {
    var fits = (w * h * FULL_SHARE) / (CELL * CELL);
    return Math.round(clamp(fits, MIN_TOTAL, MAX_TOTAL));
  };

  /**
   * A quarter turn of the screen, `q` times. The phone did not move the pins
   * or the pile - the page turned underneath them - so turn them back: what
   * was at (x, y) on a w by h screen is at (y, w - x) on the h by w one. The
   * two shapes are never quite each other's transpose, since the browser's
   * furniture is a different size in portrait, so the field is stretched onto
   * whatever the new screen actually is rather than losing its edges.
   */
  MarblesTilt.prototype.turn = function (q, w, h, nw, nh) {
    q = ((Math.round(q) % 4) + 4) % 4;
    var all = this.pins.concat(this.marbles, this.sparks);
    var i, k, p, x, vx;
    for (k = 0; k < q; k += 1) {
      for (i = 0; i < all.length; i += 1) {
        p = all[i];
        x = p.x;
        p.x = p.y;
        p.y = w - x;
        if (p.vx !== undefined) {
          vx = p.vx;
          p.vx = p.vy;
          p.vy = -vx;
        }
      }
      x = w; w = h; h = x;
    }
    var sx = nw / w, sy = nh / h;
    for (i = 0; i < all.length; i += 1) {
      all[i].x *= sx;
      all[i].y *= sy;
    }
    for (i = 0; i < this.marbles.length; i += 1) {
      this.clampMarble(this.marbles[i], nw, nh);
    }
    this._pinIndex = null;
  };

  /**
   * The screen changed shape without turning - a window being dragged about.
   * Keep every marble and every pin that is still on it, drop the pins that
   * are not, and top the field back up to what the new shape is worth.
   */
  MarblesTilt.prototype.refit = function (w, h) {
    var i;
    if (this.pin) {
      var padX = this.pin.width, padY = this.pin.height;
      var kept = [];
      for (i = 0; i < this.pins.length; i += 1) {
        var p = this.pins[i];
        if (p.x >= padX && p.x <= w - padX && p.y >= padY && p.y <= h - padY) {
          kept.push(p);
        }
      }
      this.pins = kept;
    }
    var wanted = this.wanted(w, h);
    if (this.pins.length > wanted) { this.pins.length = wanted; }
    this.topUp(w, h);
    this._pinIndex = null;

    for (i = 0; i < this.marbles.length; i += 1) {
      this.clampMarble(this.marbles[i], w, h);
    }
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

  /**
   * The pins never move, so they go into their own grid once and stay there.
   * Cells are at least a hit wide, so the nine around a marble are all it can
   * possibly be touching. Anything that moves the pins clears `_pinIndex`.
   */
  MarblesTilt.prototype.indexPins = function (w, h) {
    var size = Math.max(CELL * 2, Math.ceil((this.pinR + R) * 2));
    var cols = Math.max(1, Math.ceil(w / size));
    var rows = Math.max(1, Math.ceil(h / size));
    var buckets = new Array(cols * rows);
    for (var i = 0; i < this.pins.length; i += 1) {
      var p = this.pins[i];
      var c = clamp(Math.floor(p.y / size), 0, rows - 1) * cols +
        clamp(Math.floor(p.x / size), 0, cols - 1);
      if (!buckets[c]) { buckets[c] = []; }
      buckets[c].push(p);
    }
    this._pinIndex = { size: size, cols: cols, rows: rows, buckets: buckets };
  };

  /** Bounce a marble off any pin it has run into. */
  MarblesTilt.prototype.hitPins = function (m) {
    var idx = this._pinIndex;
    if (!idx) { return; }
    var hit = this.pinR + m.r;
    var cx = clamp(Math.floor(m.x / idx.size), 0, idx.cols - 1);
    var cy = clamp(Math.floor(m.y / idx.size), 0, idx.rows - 1);
    for (var gy = cy - 1; gy <= cy + 1; gy += 1) {
      if (gy < 0 || gy >= idx.rows) { continue; }
      for (var gx = cx - 1; gx <= cx + 1; gx += 1) {
        if (gx < 0 || gx >= idx.cols) { continue; }
        var bucket = idx.buckets[gy * idx.cols + gx];
        if (!bucket) { continue; }
        for (var k = 0; k < bucket.length; k += 1) {
          var p = bucket[k];
          var dx = m.x - p.x, dy = m.y - p.y;
          var d = Math.hypot(dx, dy);
          if (d > 0 && d < hit) {
            var nx = dx / d, ny = dy / d;
            m.x = p.x + nx * hit;
            m.y = p.y + ny * hit;
            var into = m.vx * nx + m.vy * ny;
            if (into < -REST_SPEED) {
              // A real knock: bounce, with a nudge sideways so a marble that
              // lands dead on a pin's head picks a side to fall off.
              m.vx = (m.vx - 2 * into * nx) * BOUNCE + rand(-10, 10);
              m.vy = (m.vy - 2 * into * ny) * BOUNCE;
              if (m.sensitive) { m.oh = OH; }
            } else if (into < 0) {
              // Only leaning on it. Take out the lean and leave the rest: a
              // marble resting on a pin used to be kicked every single frame,
              // which is most of the fidgeting at the bottom of a full screen.
              m.vx -= into * nx;
              m.vy -= into * ny;
            }
          }
        }
      }
    }
  };

  MarblesTilt.prototype.clampMarble = function (m, w, h) {
    m.x = clamp(m.x, m.r, w - m.r);
    m.y = clamp(m.y, m.r, h - m.r);
  };

  MarblesTilt.prototype.step = function (dt, w, h) {
    var i, m;
    dt = Math.min(dt * (this.speed / SPEEDS.medium), 0.05);

    if (!this._pinIndex || this._pinW !== w || this._pinH !== h) {
      this.indexPins(w, h);
      this._pinW = w;
      this._pinH = h;
    }

    if (this.draining > 0) {
      this.drain(dt, w, h);
    } else if (this.blowing) {
      this.burst(dt, w, h);
    } else {
      var full = this.cap(w, h);
      this.spawn -= dt;
      if (this.spawn <= 0) {
        // A big screen holds more, so it is fed faster: the pile takes about
        // as long to build either way, rather than the phone racing ahead.
        this.spawn = rand(0.85, 1.35) * clamp(FILL_TIME / full, 0.09, 0.36);
        this.release(w, h);
      }
      // Full. Rather than blinking the screen clean, the walls give way and
      // the whole pile pours off whichever edge is downhill.
      if (this.marbles.length >= full) { this.draining = DRAIN_MAX; }
    }

    var open = this.draining > 0;
    var ax = this.gx * GRAVITY;
    var ay = this.gy * GRAVITY;

    for (i = 0; i < this.marbles.length; i += 1) {
      m = this.marbles[i];
      m.sx = m.x;                      // where it was, to see if it got anywhere
      m.sy = m.y;
      m.vx += ax * dt;
      m.vy += ay * dt;
      m.vx *= DAMP;
      m.vy *= DAMP;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.oh > 0) { m.oh -= dt; }

      if (open) {
        // No walls while it empties - but shake anything that has come to rest
        // on a pin, so the last few do not sit there holding it up.
        if (Math.hypot(m.vx, m.vy) < 30) {
          m.vx += rand(-DRAIN_SHAKE, DRAIN_SHAKE) * dt;
          m.vy += rand(-DRAIN_SHAKE, DRAIN_SHAKE) * dt;
        }
      } else {
        // A marble on the floor of a full screen is not bouncing, it is being
        // leant on. Under REST_SPEED the wall takes all of it.
        if (m.x < m.r) {
          m.x = m.r;
          m.vx = bounceOff(-m.vx);
          m.vy *= WALL_SLIDE;
        } else if (m.x > w - m.r) {
          m.x = w - m.r;
          m.vx = -bounceOff(m.vx);
          m.vy *= WALL_SLIDE;
        }
        if (m.y < m.r) {
          m.y = m.r;
          m.vy = bounceOff(-m.vy);
          m.vx *= WALL_SLIDE;
        } else if (m.y > h - m.r) {
          m.y = h - m.r;
          m.vy = -bounceOff(m.vy);
          m.vx *= WALL_SLIDE;
        }
        if (Math.abs(m.vx) + Math.abs(m.vy) < REST_SPEED) {
          m.vx *= REST_DAMP;
          m.vy *= REST_DAMP;
        }
      }

      this.hitPins(m);
    }

    this.solve(w, h);

    // Solver soft-pushes can sneak past the floor - clamp hard so a tilt does
    // not leak marbles off the edge of the visible canvas.
    if (!open) {
      var still = STILL_SPEED * dt;
      for (i = 0; i < this.marbles.length; i += 1) {
        m = this.marbles[i];
        this.clampMarble(m, w, h);
        // Buried marbles keep being given speed by gravity and keep having it
        // taken away by whatever they are resting on. Left alone they strain
        // against each other for ever; if a marble got nowhere this frame, let
        // it give up. Anything that does move keeps every bit of its speed, so
        // a tilt still sends the whole pile sliding.
        if (Math.abs(m.x - m.sx) < still && Math.abs(m.y - m.sy) < still) {
          m.vx *= SLEEP_DAMP;
          m.vy *= SLEEP_DAMP;
        }
      }
    }
  };

  /**
   * Push apart everything that overlaps. A screenful is several hundred
   * marbles and every pair is far too many, so they go into a grid one marble
   * across and each only looks at the nine cells around it. The buckets are
   * kept as linked lists in two flat arrays, reused frame to frame.
   */
  MarblesTilt.prototype.solve = function (w, h) {
    var list = this.marbles, n = list.length;
    if (n < 2) { return; }
    var cols = Math.max(1, Math.ceil(w / CELL));
    var rows = Math.max(1, Math.ceil(h / CELL));
    var cells = cols * rows;
    var i, c, pass;

    if (!this._head || this._head.length < cells) { this._head = new Int32Array(cells); }
    if (!this._next || this._next.length < n) { this._next = new Int32Array(n * 2); }
    var head = this._head, next = this._next;

    /* The order marbles are worked in is the order they were spawned in, and
       it is left that way on purpose: sorting them by depth each frame, so
       that corrections travel up the stack, shuffles a settled pile about
       more than it helps. */
    for (pass = 0; pass < SOLVER_PASSES; pass += 1) {
      head.fill(-1, 0, cells);
      for (i = 0; i < n; i += 1) {
        c = clamp(Math.floor(list[i].y / CELL), 0, rows - 1) * cols +
          clamp(Math.floor(list[i].x / CELL), 0, cols - 1);
        next[i] = head[c];
        head[c] = i;
      }

      for (i = 0; i < n; i += 1) {
        var m = list[i];
        var cx = clamp(Math.floor(m.x / CELL), 0, cols - 1);
        var cy = clamp(Math.floor(m.y / CELL), 0, rows - 1);
        for (var by = cy - 1; by <= cy + 1; by += 1) {
          if (by < 0 || by >= rows) { continue; }
          for (var bx = cx - 1; bx <= cx + 1; bx += 1) {
            if (bx < 0 || bx >= cols) { continue; }
            var j = head[by * cols + bx];
            while (j >= 0) {
              // Each pair turns up in both marbles' neighbourhoods; take it once.
              if (j > i) { this.resolve(m, list[j]); }
              j = next[j];
            }
          }
        }
      }
    }
  };

  /**
   * The emptying. Gravity still applies and still follows the phone, so the
   * pile pours out of whichever edge you tilt towards; marbles that are well
   * clear of the screen are forgotten. When the last one has gone - or when
   * DRAIN_MAX is up and something is still wedged - the pins go up.
   */
  MarblesTilt.prototype.drain = function (dt, w, h) {
    this.draining -= dt;
    var gone = CELL * 3;
    var kept = [];
    for (var i = 0; i < this.marbles.length; i += 1) {
      var m = this.marbles[i];
      if (m.x > -gone && m.x < w + gone && m.y > -gone && m.y < h + gone) {
        kept.push(m);
      }
    }
    this.marbles = kept;
    if (!kept.length || this.draining <= 0) { this.blowUp(w, h); }
  };

  /** Lay a fuse to every pin, running out from somewhere on the screen. */
  MarblesTilt.prototype.blowUp = function (w, h) {
    var ox = rand(0, w), oy = rand(0, h);
    var span = Math.hypot(w, h) || 1;
    for (var i = 0; i < this.pins.length; i += 1) {
      var p = this.pins[i];
      p.fuse = (Math.hypot(p.x - ox, p.y - oy) / span) * FUSE_SPREAD + rand(0, 0.2);
    }
    this.marbles = [];
    this.sparks = [];
    this.draining = 0;
    this.bursting = 0;
    this.blowing = true;
    this._burstPins = this.pins.length;
  };

  /**
   * One pin, gone in a shower of its own colour. A screen set to Lots of pins
   * would otherwise put up a wall of sparks, so a crowded field gets a smaller
   * shower each and a sparse one gets a better show: about the same finale
   * either way.
   */
  MarblesTilt.prototype.pop = function (p, pins) {
    var colour = BURST_COLOURS[Math.floor(rand(0, BURST_COLOURS.length))];
    var many = Math.round(clamp(SPARKS_PER_PIN * 70 / (pins || 1), 6, 20));
    many += Math.floor(rand(0, 4));
    for (var i = 0; i < many; i += 1) {
      var a = rand(0, Math.PI * 2);
      var speed = rand(SPARK_SPEED, SPARK_SPEED_2);
      this.sparks.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        age: 0, life: rand(SPARK_LIFE, SPARK_LIFE_2),
        colour: colour, size: rand(0, 1) < 0.25 ? 3 : 2
      });
    }
    // the flash where the pin was
    this.sparks.push({ x: p.x, y: p.y, vx: 0, vy: 0, age: 0, life: 0.13,
                       colour: '#ffffff', size: 8 });
  };

  /**
   * The fireworks. Pins go off as their fuses run out, and what they throw
   * falls the way the marbles did - so tilting the phone leans the whole
   * display over. When the last spark has gone out the pins are scattered
   * afresh and it starts filling again.
   */
  MarblesTilt.prototype.burst = function (dt, w, h) {
    var i, s;
    this.bursting += dt;

    if (this.pins.length) {
      var unlit = [];
      var crowd = this._burstPins || this.pins.length;
      for (i = 0; i < this.pins.length; i += 1) {
        var p = this.pins[i];
        if (this.bursting >= p.fuse) { this.pop(p, crowd); } else { unlit.push(p); }
      }
      if (unlit.length !== this.pins.length) {
        this.pins = unlit;
        this._pinIndex = null;
      }
    }

    var ax = this.gx * GRAVITY * SPARK_WEIGHT;
    var ay = this.gy * GRAVITY * SPARK_WEIGHT;
    var live = [];
    for (i = 0; i < this.sparks.length; i += 1) {
      s = this.sparks[i];
      s.age += dt;
      if (s.age >= s.life) { continue; }
      s.vx = (s.vx + ax * dt) * SPARK_DRAG;
      s.vy = (s.vy + ay * dt) * SPARK_DRAG;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < -40 || s.x > w + 40 || s.y < -40 || s.y > h + 40) { continue; }
      live.push(s);
    }
    this.sparks = live;

    if (!this.pins.length && !this.sparks.length) { this.reset(w, h); }
  };

  MarblesTilt.prototype.resolve = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.hypot(dx, dy);
    var min = a.r + b.r;
    if (dist >= min) { return; }
    var nx, ny;
    if (dist < 0.001) {
      // Landed dead on top of one another: there is no direction to push
      // along, so pick one, or the two of them stay welded together forever.
      var ang = rand(0, Math.PI * 2);
      nx = Math.cos(ang);
      ny = Math.sin(ang);
      dist = 0.001;
    } else {
      nx = dx / dist;
      ny = dy / dist;
    }
    // Leaving SLOP of overlap alone is what settles a pile: chasing the last
    // fraction of a pixel just hands the marble back and forth for ever.
    var push = Math.max(0, min - dist - SLOP) * 0.45;
    if (push > 0) {
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
    }

    var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    var vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      // Two marbles leaning on each other do not bounce; they stop.
      var bounce = -vn > REST_SPEED ? MARBLE_BOUNCE : 0;
      var jimp = -(1 + bounce) * vn / 2;
      var ix = jimp * nx, iy = jimp * ny;
      a.vx -= ix; a.vy -= iy;
      b.vx += ix; b.vy += iy;
      if (a.sensitive && Math.hypot(ix, iy) > 10) { a.oh = OH; }
      if (b.sensitive && Math.hypot(ix, iy) > 10) { b.oh = OH; }
    }

    var tx = -ny, ty = nx;
    var vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty;
    // Barely moving across each other: grip, rather than creep about.
    var slide = Math.abs(vt) > REST_SPEED ? MARBLE_SLIDE : REST_SLIDE;
    var slip = vt * (1 - slide) / 2;
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

    // Chunky squares rather than dots: the rest of the screen is 1992.
    for (i = 0; i < this.sparks.length; i += 1) {
      var s = this.sparks[i];
      var left = 1 - s.age / s.life;
      ctx.globalAlpha = left > 0.4 ? 1 : left / 0.4;
      ctx.fillStyle = s.colour;
      var size = Math.max(1, Math.round(s.size * (0.4 + left * 0.6)));
      ctx.fillRect(Math.round(s.x - size / 2), Math.round(s.y - size / 2), size, size);
    }
    if (this.sparks.length) { ctx.globalAlpha = 1; }
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
      self._armAt = Date.now() + COW_WAIT;

      /**
       * Turning the phone over resizes us. The screen did not lose anything -
       * it is the same screen, turned - so turn the field with it and nothing
       * has to be thrown away or made up. A resize that is not a turn (a
       * window being dragged about) has to fit the field to the new shape.
       */
      screen.onresize = function (w, h) {
        var was = self._angle;
        var now = screenAngle();
        var q = Math.round((((now - was) % 360) + 360) % 360 / 90) % 4;
        if (!q && swapped(self._w, self._h, w, h)) { q = 1; }
        self._angle = now;
        if (q) { sim.turn(q, self._w, self._h, w, h); } else { sim.refit(w, h); }
        self._w = w;
        self._h = h;
        self._syncControls(sim);
        self._dirX = null;             // her peg moved with the box
        self._swingCow(sim);
      };
      self._angle = screenAngle();
      self._w = screen.width;
      self._h = screen.height;
      sim.reset(screen.width, screen.height);
      self._syncControls(sim);

      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
        self._tickCow(sim);            // the rope always shows where down is
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  MarblesTiltElement.prototype._syncControls = function (sim) {
    this._immersive = isImmersive(this);
    if (this._immersive) {
      this._bindMotion(sim);
      this._bindKeys(sim);
      this._tickCow(sim);
    } else {
      this._unbindMotion();
      this._hideCow();
      this._unbindKeys();
      this._manual = false;
      sim.setGravity(0, 1);
      sim.usingSensor = false;
    }
  };

  /**
   * The cow is what you steer with when the device will not do it for you.
   * A phone has an accelerometer, so the moment one reports she goes away -
   * she would only be a puppet of the sensor, twitching along with its noise.
   * Waiting COW_WAIT before putting her up stops her flashing on at load.
   */
  MarblesTiltElement.prototype._tickCow = function (sim) {
    if (!this._immersive || this._cowDragging) { return; }
    if (sim.usingSensor) {
      if (this._cow) { this._hideCow(); }
      return;
    }
    if (!this._cow) {
      if (Date.now() < this._armAt) { return; }
      this._showCow(sim);
    }
    this._swingCow(sim);
  };

  /* ------------------------------------------------------------- sensors */

  MarblesTiltElement.prototype._bindMotion = function (sim) {
    if (this._onMotion) { return; }
    var self = this;
    var motionLive = false;

    function applyMotion(e) {
      if (!self._immersive || self._manual) { return; }
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
      if (motionLive || !self._immersive || self._manual) { return; }
      if (e.beta == null && e.gamma == null) { return; }
      // A browser with no sensor at all will sometimes still fire this, full
      // of zeroes. Dead flat is not worth taking the cow down for.
      if (Math.abs(e.beta || 0) + Math.abs(e.gamma || 0) < 0.5) { return; }
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

  /** The peg she hangs from: along the top edge, over to the right. */
  MarblesTiltElement.prototype._anchor = function () {
    var r = this.getBoundingClientRect();
    return { x: r.width * PEG_X, y: PEG_Y };
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
      'position:absolute;left:' + (PEG_X * 100) + '%;top:' + PEG_Y + 'px;' +
      'width:10px;height:10px;' +
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
      'position:absolute;left:' + (PEG_X * 100) + '%;' +
      'top:' + (PEG_Y + ROPE_LEN + COW_H + 14) + 'px;' +
      'transform:translateX(-50%);white-space:nowrap;' +
      'z-index:2;color:#e8e0c8;text-align:center;' +
      'font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif;' +
      'text-shadow:0 1px 0 #000;pointer-events:none;opacity:0.9;' +
      'transition:opacity 1.2s linear';
    this.appendChild(hint);
    this._cowHint = hint;
    // It has said its piece by then, and a screen saver should be left alone.
    this._hintTimer = setTimeout(function () {
      if (self._cowHint) { self._cowHint.style.opacity = '0'; }
    }, HINT_HOLD);

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
    if (this._hintTimer) { clearTimeout(this._hintTimer); this._hintTimer = null; }
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
   * Arrows swing the cow and gravity follows her. They must not read as "a key
   * was pressed, put the screen saver away": the front page stops the saver on
   * any key, so keep the arrows here and hand every other key on. With no cow
   * up there is nothing to steer, and every key goes back to stopping it.
   */
  MarblesTiltElement.prototype._bindKeys = function (sim) {
    if (this._onKey) { return; }
    var self = this;
    function onKey(e) {
      var k = e.key;
      var arrow = k === 'ArrowUp' || k === 'ArrowDown' ||
        k === 'ArrowLeft' || k === 'ArrowRight';
      if (!arrow || !self._cow || !self._immersive) {
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
