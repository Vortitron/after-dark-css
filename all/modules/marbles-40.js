/**
 * marbles-40.js - Marbles as it was rebuilt for After Dark 4.0.
 *
 * Not the one most people remember. The 4.0 module is a different screensaver
 * that happens to share the name: big rendered marbles drifting and bouncing,
 * no pins and no pile. The 1992 original is modules/marbles.js.
 *
 * MARBLES.AD is built from an Aggate class (the marble: Launch, CheckCollision,
 * TimeToCollide, TimeToEdges) and a PegSprite class (the things it bounces off,
 * with SetPegType and PlayPeg). So: agates travel in straight lines at constant
 * speed, reflect off the pegs and the screen edges, and roll as they go. The
 * pegs are fixed and play their animation when they get hit.
 *
 * Artwork, from tools/adweb.py:
 *   8000-8009  ten agates, 32x32, 24 frames of rotation each
 *   8010-8017  the peg types, 47-64px, animated
 *
 * The module's own control panel offers "A Few / A Pouch Full / A Jar Full /
 * A Box Full" marbles and eight peg patterns; those map to the count and
 * pattern attributes here.
 *
 *   <after-dark-marbles-40 count="a jar full" pattern="3"></after-dark-marbles-40>
 */
(function () {
  'use strict';

  var AGATE_FIRST = 8000, AGATE_LAST = 8009;
  var PEG_IDS = [8010, 8011, 8012, 8013, 8017];
  var SPEED = 130;                     // pixels per second
  var PEG_FPS = 18;                    // pegs animate once per hit
  var COUNTS = {
    'a few': 4, 'a pouch full': 9, 'a jar full': 16, 'a box full': 28
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* Peg placement. The originals ship eight fixed "Custom" patterns; the seed
     here stands in for those, so the same pattern number always lays out the
     same way for a given screen size. */
  function seeded(seed) {
    var s = (seed * 2654435761) % 2147483647 || 12345;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function layout(w, h, pattern, sizes) {
    var next = seeded(pattern);
    var pegs = [];
    var margin = 40;
    var tries = 0;
    var wanted = Math.max(6, Math.round((w * h) / 42000));
    while (pegs.length < wanted && tries < wanted * 200) {
      tries += 1;
      var kind = Math.floor(next() * sizes.length);
      var r = sizes[kind] / 2;
      var x = margin + r + next() * Math.max(1, w - 2 * (margin + r));
      var y = margin + r + next() * Math.max(1, h - 2 * (margin + r));
      var clear = true;
      for (var i = 0; i < pegs.length; i += 1) {
        var dx = pegs[i].x - x, dy = pegs[i].y - y;
        if (Math.hypot(dx, dy) < pegs[i].r + r + 26) { clear = false; break; }
      }
      if (clear) { pegs.push({ x: x, y: y, r: r, kind: kind, frame: 0, playing: false }); }
    }
    return pegs;
  }

  function Marbles(art, screen) {
    this.art = art;
    this.screen = screen;
    this.agateIds = art.ids(AGATE_FIRST, AGATE_LAST);
    this.pegIds = PEG_IDS.filter(function (id) { return art.sequence(id); });
    this.count = COUNTS['a jar full'];
    this.pattern = 1 + Math.floor(Math.random() * 8);
    this.pegs = [];
    this.marbles = [];
  }

  Marbles.prototype.reset = function (w, h) {
    var art = this.art;

    // A run uses two peg types, the way the original mixes them on screen.
    var kinds = [];
    var pool = this.pegIds.slice();
    while (kinds.length < Math.min(2, pool.length)) {
      var id = pick(pool);
      pool.splice(pool.indexOf(id), 1);
      kinds.push(art.sequence(id));
    }
    this.pegKinds = kinds;
    this.pegs = layout(w, h, this.pattern, kinds.map(function (s) { return s.width; }));

    this.marbles = [];
    for (var i = 0; i < this.count; i += 1) {
      var seq = art.sequence(pick(this.agateIds));
      var angle = rand(0, Math.PI * 2);
      this.marbles.push({
        seq: seq,
        r: seq.width / 2,
        x: rand(seq.width, Math.max(seq.width + 1, w - seq.width)),
        y: rand(seq.height, Math.max(seq.height + 1, h - seq.height)),
        vx: Math.cos(angle) * SPEED,
        vy: Math.sin(angle) * SPEED,
        spin: rand(0, seq.count)
      });
    }
  };

  /* Reflect a velocity about the normal of the surface it just met. */
  function bounce(m, nx, ny) {
    var dot = m.vx * nx + m.vy * ny;
    m.vx -= 2 * dot * nx;
    m.vy -= 2 * dot * ny;
  }

  Marbles.prototype.step = function (dt, w, h) {
    var pegs = this.pegs, marbles = this.marbles;
    var i, j;

    for (i = 0; i < marbles.length; i += 1) {
      var m = marbles[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      if (m.x - m.r < 0 && m.vx < 0) { m.x = m.r; bounce(m, 1, 0); }
      if (m.x + m.r > w && m.vx > 0) { m.x = w - m.r; bounce(m, -1, 0); }
      if (m.y - m.r < 0 && m.vy < 0) { m.y = m.r; bounce(m, 0, 1); }
      if (m.y + m.r > h && m.vy > 0) { m.y = h - m.r; bounce(m, 0, -1); }

      for (j = 0; j < pegs.length; j += 1) {
        var p = pegs[j];
        var dx = m.x - p.x, dy = m.y - p.y;
        var d = Math.hypot(dx, dy);
        var hit = p.r * 0.78 + m.r;        // pegs are drawn larger than they collide
        if (d > 0 && d < hit) {
          var nx = dx / d, ny = dy / d;
          m.x = p.x + nx * hit;
          m.y = p.y + ny * hit;
          if (m.vx * nx + m.vy * ny < 0) { bounce(m, nx, ny); }
          p.playing = true;
        }
      }

      // The 24 frames are one full rotation, so roll by distance covered.
      m.spin += (Math.hypot(m.vx, m.vy) * dt) / (2 * Math.PI * m.r) * m.seq.count;
    }

    // Agates bouncing off each other, equal mass, no energy lost.
    for (i = 0; i < marbles.length; i += 1) {
      for (j = i + 1; j < marbles.length; j += 1) {
        var a = marbles[i], b = marbles[j];
        var ddx = b.x - a.x, ddy = b.y - a.y;
        var dist = Math.hypot(ddx, ddy);
        var min = a.r + b.r;
        if (dist > 0 && dist < min) {
          var ux = ddx / dist, uy = ddy / dist;
          var overlap = (min - dist) / 2;
          a.x -= ux * overlap; a.y -= uy * overlap;
          b.x += ux * overlap; b.y += uy * overlap;
          var va = a.vx * ux + a.vy * uy;
          var vb = b.vx * ux + b.vy * uy;
          if (va - vb > 0) {
            a.vx += (vb - va) * ux; a.vy += (vb - va) * uy;
            b.vx += (va - vb) * ux; b.vy += (va - vb) * uy;
          }
        }
      }
    }

    // Aggate::Normalize - collisions redirect a marble but never slow it down.
    for (i = 0; i < marbles.length; i += 1) {
      var v = marbles[i];
      var s = Math.hypot(v.vx, v.vy);
      if (s > 0) { v.vx = v.vx / s * SPEED; v.vy = v.vy / s * SPEED; }
    }

    for (j = 0; j < pegs.length; j += 1) {
      var peg = pegs[j];
      if (peg.playing) {
        peg.frame += PEG_FPS * dt;
        if (peg.frame >= this.pegKinds[peg.kind].count) { peg.frame = 0; peg.playing = false; }
      }
    }
  };

  Marbles.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    var i;
    for (i = 0; i < this.pegs.length; i += 1) {
      var p = this.pegs[i];
      this.pegKinds[p.kind].draw(ctx, Math.floor(p.frame), p.x, p.y);
    }
    for (i = 0; i < this.marbles.length; i += 1) {
      var m = this.marbles[i];
      m.seq.draw(ctx, Math.floor(m.spin), m.x, m.y);
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
    var base = this.getAttribute('art') || 'art/marbles';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Marbles(art, null);
      var wanted = (AfterDark.setting(self, 'count') || 'a jar full').toLowerCase();
      sim.count = COUNTS[wanted] || parseInt(wanted, 10) || COUNTS['a jar full'];
      var pattern = parseInt(AfterDark.setting(self, 'pattern'), 10);
      if (pattern > 0) { sim.pattern = pattern; }

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

  customElements.define('after-dark-marbles-40', MarblesElement);
  window.AfterDarkMarbles40 = Marbles;
}());
