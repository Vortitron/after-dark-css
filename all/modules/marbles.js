/**
 * marbles.js - Marbles, the 1992 original, on the module's own artwork.
 *
 * MARBLES2.AD describes itself, in its own resource string:
 *
 *   "MARBLES simulates colorful spheres bouncing through an obstacle course of
 *    pins and magically stacking at the bottom. As with people, some marbles
 *    are more sensitive than others."
 *    Windows version by Mike Overlin. Concept and Mac version by Kevin McLeod.
 *    Artwork by Igor Gasowski. (c) 1992 Berkeley Systems Inc.
 *
 * "Magically" is doing real work there: a marble that lands does not roll or
 * settle physically, it snaps onto the 16-pixel lattice the pile is built on.
 * The sensitive ones are the two faces at the end of the strip - the smiley
 * turns into the open-mouthed one when it takes a knock, which is what the
 * module's OH_SOUND is for.
 *
 * Artwork, from tools/adclassic.py:
 *   marbles   160x16, ten 16x16 marbles side by side (mask MMARBLE applied)
 *   100/101/102  the pin, at the module's X-Small, Medium and Big settings
 *
 * The original control panel offers Pin Size, # Pins (None/Few/Many/Lots),
 * Speed, and Redraw Every; all four are attributes here.
 *
 *   <after-dark-marbles pins="many" pin-size="big" speed="50"></after-dark-marbles>
 */
(function () {
  'use strict';

  var CELL = 16;                       // the marbles are 16x16
  var SMILEY = 8, SHOCKED = 9;         // last two cells of the strip
  var OH = 0.4;                        // seconds a sensitive marble stays shocked

  var PIN_SIZES = { 'x-small': '100', medium: '101', big: '102' };
  var PIN_DENSITY = { none: 0, few: 26000, many: 11000, lots: 5200 };
  var SPEEDS = { slow: 40, medium: 65, fast: 100 };

  var GRAVITY = 340;                   // pixels per second per second
  var BOUNCE = 0.62;                   // pins give a little
  var PIN_HIT = 0.42;                  // the bitmap is wider than the pin reads

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Marbles(art) {
    this.strip = art.bitmap('marbles');
    this.pinArt = art;
    this.setPinSize('medium');
    this.pins = [];
    this.density = PIN_DENSITY.many;
    this.speed = SPEEDS.medium;
    this.falling = [];
    this.pile = [];
    this.top = [];
    this.cols = 0;
    this.x0 = 0;
    this.spawn = 0;
  }

  Marbles.prototype.setPinSize = function (name) {
    var bm = this.pinArt.bitmap(PIN_SIZES[name] || PIN_SIZES.medium);
    this.pin = bm;
    this.pinR = bm ? bm.width * PIN_HIT : 0;
  };

  /* The pins are scattered rather than laid out, but never close enough to
     seal a gap a marble could not fall through. */
  Marbles.prototype.scatter = function (w, h) {
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

  Marbles.prototype.reset = function (w, h) {
    this.cols = Math.max(1, Math.floor(w / CELL));
    this.x0 = Math.floor((w - this.cols * CELL) / 2);
    this.top = [];
    for (var c = 0; c < this.cols; c += 1) { this.top.push(h); }
    this.pile = [];
    this.falling = [];
    this.scatter(w, h);
  };

  Marbles.prototype.colAt = function (x) {
    return Math.min(this.cols - 1,
                    Math.max(0, Math.floor((x - this.x0) / CELL)));
  };

  Marbles.prototype.release = function (w) {
    var type = Math.floor(rand(0, SMILEY + 1));    // the shocked face is a state
    this.falling.push({
      type: type,
      sensitive: type === SMILEY,
      oh: 0,
      x: rand(CELL, w - CELL),
      y: -CELL,
      vx: rand(-18, 18),
      vy: 20
    });
  };

  Marbles.prototype.step = function (dt, w, h) {
    var i, j;

    // The Speed slider runs the whole simulation faster rather than making the
    // marbles heavier, so scale time and leave the trajectories alone.
    dt = Math.min(dt * (this.speed / SPEEDS.medium), 0.06);

    this.spawn -= dt;
    if (this.spawn <= 0 && this.falling.length < 24) {
      this.spawn = rand(0.12, 0.34);
      this.release(w);
    }

    for (i = this.falling.length - 1; i >= 0; i -= 1) {
      var m = this.falling[i];
      m.vy += GRAVITY * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.oh > 0) { m.oh -= dt; }

      if (m.x < CELL / 2) { m.x = CELL / 2; m.vx = Math.abs(m.vx); }
      if (m.x > w - CELL / 2) { m.x = w - CELL / 2; m.vx = -Math.abs(m.vx); }

      for (j = 0; j < this.pins.length; j += 1) {
        var p = this.pins[j];
        var dx = m.x - p.x, dy = m.y - p.y;
        var d = Math.hypot(dx, dy);
        var hit = this.pinR + CELL / 2;
        if (d > 0 && d < hit) {
          var nx = dx / d, ny = dy / d;
          m.x = p.x + nx * hit;
          m.y = p.y + ny * hit;
          var into = m.vx * nx + m.vy * ny;
          if (into < 0) {
            m.vx = (m.vx - 2 * into * nx) * BOUNCE + rand(-12, 12);
            m.vy = (m.vy - 2 * into * ny) * BOUNCE;
          }
          if (m.sensitive) { m.oh = OH; }
        }
      }

      if (m.vy > 0 && this.land(m, h)) { this.falling.splice(i, 1); }
    }

    // Once the pile reaches the top there is nowhere left to stack.
    var highest = h;
    for (i = 0; i < this.cols; i += 1) {
      if (this.top[i] < highest) { highest = this.top[i]; }
    }
    if (highest <= CELL * 2) { this.reset(w, h); }
  };

  /**
   * Snap a marble onto the lattice if it has caught up with the pile. A marble
   * landing on a shoulder more than one marble higher than its neighbour drops
   * into the neighbour instead, which is what keeps the surface sloped rather
   * than growing spikes.
   */
  Marbles.prototype.land = function (m, h) {
    var col = this.colAt(m.x);
    if (m.y + CELL / 2 < this.top[col]) { return false; }

    var best = col;
    var side = Math.random() < 0.5 ? -1 : 1;
    var order = [col + side, col - side];
    for (var k = 0; k < order.length; k += 1) {
      var c = order[k];
      if (c >= 0 && c < this.cols && this.top[c] >= this.top[best] + CELL) {
        best = c;
      }
    }

    this.top[best] -= CELL;
    this.pile.push({
      type: m.sensitive && m.oh > 0 ? SHOCKED : m.type,
      x: this.x0 + best * CELL + CELL / 2,
      y: this.top[best] + CELL / 2
    });
    return true;
  };

  Marbles.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    var i;
    for (i = 0; i < this.pile.length; i += 1) {
      var s = this.pile[i];
      this.strip.drawCell(ctx, s.type, CELL, s.x, s.y);
    }
    // The pins sit in front, so the pile buries into them rather than over them.
    for (i = 0; i < this.pins.length; i += 1) {
      this.pin.draw(ctx, this.pins[i].x, this.pins[i].y);
    }
    for (i = 0; i < this.falling.length; i += 1) {
      var m = this.falling[i];
      this.strip.drawCell(ctx, m.oh > 0 ? SHOCKED : m.type, CELL, m.x, m.y);
    }
  };

  /* ------------------------------------------------------------ element */

  function MarblesElement() { return Reflect.construct(HTMLElement, [], MarblesElement); }
  MarblesElement.prototype = Object.create(HTMLElement.prototype);
  MarblesElement.prototype.constructor = MarblesElement;
  Object.setPrototypeOf(MarblesElement, HTMLElement);

  MarblesElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/marbles2';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Marbles(art);
      sim.setPinSize((self.getAttribute('pin-size') || 'medium').toLowerCase());

      var pins = (self.getAttribute('pins') || 'many').toLowerCase();
      sim.density = PIN_DENSITY[pins] !== undefined ? PIN_DENSITY[pins] : PIN_DENSITY.many;

      var speed = (self.getAttribute('speed') || 'medium').toLowerCase();
      sim.speed = SPEEDS[speed] || Number(speed) || SPEEDS.medium;

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);
      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  MarblesElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-marbles', MarblesElement);
  window.AfterDarkMarbles = Marbles;
}());
