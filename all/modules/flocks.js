/**
 * flocks.js - Flocks, on the module's own artwork.
 *
 * FLOCKS.AD says what it is in its own description resource:
 *
 *   "This module attempts to simulate the flocking of birds, or the schooling
 *    of fish, or other 'group movement' behaviors. It's based on an algorithm
 *    developed by Craig Reynolds and outlined in his paper 'Flocks, Herds, and
 *    Schools: A Distributed Behavioral Model', SIGGRAPH 1987."
 *   Concept and original Mac version by Dave Johnson.
 *
 * So the three Reynolds rules - separation, alignment, cohesion - are the
 * behaviour, and they are implemented here rather than approximated.
 *
 * The module also ships a small table describing each flock. Its seven FLK
 * resources are 16 bytes each and start
 *
 *     u16 headings   u16 frames   u32 base resource id
 *
 * which is exactly how the 119 DIBs are laid out: base + 400 + n, headings
 * blocks of frames apiece. Birds are 6 headings of 8 wingbeats from id 5400,
 * polliwogs 4 of 8 from 1400, and so on down to Dots, which is a single pixel
 * blob at 25400. There is also an FCTL resource per flock holding eight tuning
 * numbers; those are not mapped here, so the weights below are chosen by eye.
 *
 * Which sprite in a heading block faces which way is not recorded anywhere, so
 * the mapping from angle to block is an assumption. At 16 pixels a flock still
 * reads as a flock if it is rotated.
 *
 *   <after-dark-flocks kind="birds" size="40"></after-dark-flocks>
 */
(function () {
  'use strict';

  // name, base id, headings, frames per heading - straight off the FLK records
  var KINDS = [
    { name: 'birds',     base: 5000,  headings: 6, frames: 8 },
    { name: 'polliwogs', base: 1000,  headings: 4, frames: 8 },
    { name: 'gnats',     base: 9000,  headings: 2, frames: 1 },
    { name: 'paparazzi', base: 13000, headings: 1, frames: 8 },
    { name: 'atoms',     base: 17000, headings: 8, frames: 1 },
    { name: 'copters',   base: 21000, headings: 3, frames: 4 },
    { name: 'dots',      base: 25000, headings: 1, frames: 1 }
  ];

  var SIZES = { small: 18, medium: 40, large: 80 };

  // Sprites run from a 4px dot to a 32px gull, so the distances a member cares
  // about are set from its own size rather than fixed.
  var NEIGHBOUR = 2.8;       // how far it looks for the rest of the flock
  var CROWDING = 1.1;        // closer than this and it pulls away
  var SPEED = 78;            // pixels per second, everyone flies at the same rate
  var TURN = 2.6;            // radians per second it can swing its heading
  var FLAP = 11;             // frames per second

  var W_SEPARATE = 1.7, W_ALIGN = 0.8, W_COHERE = 0.5, W_HOME = 0.35;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Flocks(art) {
    this.art = art;
    this.kinds = {};
    var self = this;
    KINDS.forEach(function (k) {
      var cells = [];
      for (var i = 0; i < k.headings * k.frames; i += 1) {
        var bm = art.bitmap(String(k.base + 400 + i));
        if (bm) { cells.push(bm); }
      }
      if (cells.length === k.headings * k.frames) {
        self.kinds[k.name] = {
          spec: k,
          cells: cells,
          near: cells[0].width * NEIGHBOUR,
          crowd: cells[0].width * CROWDING
        };
      }
    });
    this.kind = this.kinds.birds || this.kinds[Object.keys(this.kinds)[0]];
    this.size = SIZES.medium;
    this.flock = [];
  }

  Flocks.prototype.setKind = function (name) {
    if (this.kinds[name]) { this.kind = this.kinds[name]; }
  };

  Flocks.prototype.reset = function (w, h) {
    this.flock = [];
    for (var i = 0; i < this.size; i += 1) {
      var a = rand(0, Math.PI * 2);
      this.flock.push({
        x: rand(0, w), y: rand(0, h),
        angle: a,
        frame: rand(0, this.kind.spec.frames)
      });
    }
  };

  Flocks.prototype.step = function (dt, w, h) {
    var flock = this.flock;
    var near = this.kind.near, crowd = this.kind.crowd;
    var i, j;

    for (i = 0; i < flock.length; i += 1) {
      var b = flock[i];
      var sx = 0, sy = 0;          // separation
      var ax = 0, ay = 0;          // alignment
      var cx = 0, cy = 0;          // cohesion
      var seen = 0;

      for (j = 0; j < flock.length; j += 1) {
        if (j === i) { continue; }
        var o = flock[j];
        var dx = o.x - b.x, dy = o.y - b.y;
        var d = Math.hypot(dx, dy);
        if (d > near || d === 0) { continue; }
        seen += 1;
        cx += o.x; cy += o.y;
        ax += Math.cos(o.angle); ay += Math.sin(o.angle);
        if (d < crowd) {
          sx -= dx / d * (crowd - d) / crowd;
          sy -= dy / d * (crowd - d) / crowd;
        }
      }

      var wx = Math.cos(b.angle), wy = Math.sin(b.angle);
      if (seen) {
        wx += sx * W_SEPARATE + (ax / seen) * W_ALIGN;
        wy += sy * W_SEPARATE + (ay / seen) * W_ALIGN;
        var hx = cx / seen - b.x, hy = cy / seen - b.y;
        var hd = Math.hypot(hx, hy) || 1;
        wx += hx / hd * W_COHERE;
        wy += hy / hd * W_COHERE;
      }

      // Nothing bounces off the edges; a flock that wanders too far out is
      // eased back towards the middle instead.
      var mx = w / 2 - b.x, my = h / 2 - b.y;
      var md = Math.hypot(mx, my) || 1;
      if (md > Math.min(w, h) * 0.45) {
        wx += mx / md * W_HOME;
        wy += my / md * W_HOME;
      }

      // Turn towards the wanted heading rather than snapping to it.
      var want = Math.atan2(wy, wx);
      var diff = ((want - b.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      b.angle += Math.max(-TURN * dt, Math.min(TURN * dt, diff));

      b.x += Math.cos(b.angle) * SPEED * dt;
      b.y += Math.sin(b.angle) * SPEED * dt;
      b.frame += FLAP * dt;

      var pad = 30;
      if (b.x < -pad) { b.x = w + pad; } else if (b.x > w + pad) { b.x = -pad; }
      if (b.y < -pad) { b.y = h + pad; } else if (b.y > h + pad) { b.y = -pad; }
    }
  };

  Flocks.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    var spec = this.kind.spec, cells = this.kind.cells;
    for (var i = 0; i < this.flock.length; i += 1) {
      var b = this.flock[i];
      var turn = Math.floor((b.angle / (Math.PI * 2) % 1 + 1) % 1 * spec.headings);
      var frame = Math.floor(b.frame) % spec.frames;
      cells[turn * spec.frames + frame].draw(ctx, b.x, b.y);
    }
  };

  /* ------------------------------------------------------------ element */

  function FlocksElement() { return Reflect.construct(HTMLElement, [], FlocksElement); }
  FlocksElement.prototype = Object.create(HTMLElement.prototype);
  FlocksElement.prototype.constructor = FlocksElement;
  Object.setPrototypeOf(FlocksElement, HTMLElement);

  FlocksElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/flocks';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Flocks(art);
      sim.setKind((AfterDark.setting(self, 'kind') || 'birds').toLowerCase());
      var size = (AfterDark.setting(self, 'size') || 'medium').toLowerCase();
      sim.size = SIZES[size] || parseInt(size, 10) || SIZES.medium;

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

  FlocksElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-flocks', FlocksElement);
  window.AfterDarkFlocks = Flocks;
}());
