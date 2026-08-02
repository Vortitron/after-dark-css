/**
 * phlegm.js - Phlegm Boy, on the module's own artwork.
 *
 * PHLEGM_B.AD, 1995, from the 10th anniversary collection. Its own description:
 *
 *   "Phlegm Boy is a rude little guy that just loves to cause trouble. He
 *    can't help but spit, hock and flick things all over your screen. Don't
 *    hate him tho', that's just the way he is.
 *    'Homo sum: humani nihil a me alienum puto.'
 *    Behavior: would you like a loogie with that, ma'am?
 *    Mess: this module should come with a squeegie, doncha think?"
 *   Art by Robert Cuenca. Programming by Scott Garcia.
 *
 * The settings are its own, out of TYPE_1000: Behavior = Pesky / Unruly /
 * Ill-Mannered / Horrid / Atrocious / Kill It!!!, Mess = Unkempt / Besmirched
 * / Disquieting / Nauseous / Disgusting / Art Form / Are You Crazy?!, and
 * Clear Screen First.
 *
 * Artwork, from tools/adweb.py. Three sequences, 225 frames, all of which
 * decode:
 *   9000  him standing about, and then melting into a puddle
 *   9001  a bigger him, his head on its own, and goo running down
 *   9002  what he throws, plus a smaller him, plus a pig he has slimed
 *
 * The runs below are read off the sheets. 9000 tells the whole story on its
 * own: frames 0-9 he stands and gestures, and from 31 he sags, spreads and
 * ends as a flat splat. So a visit is stand, throw, melt, and what is left
 * stays on the screen until the Mess setting says there is too much of it.
 *
 * Two of 9001's runs are left alone. Frames 51-58 are the drips with bands
 * through them, which is how this artwork draws something being stretched
 * rather than a decode fault, but there is nothing here to stretch.
 *
 *   <after-dark-phlegm behavior="ill-mannered" mess="nauseous">
 */
(function () {
  'use strict';

  var STAND = { seq: '9000', from: 0,  len: 10 };   // he stands and gestures
  var MELT = { seq: '9000', from: 31, len: 11 };    // and then he does not
  var PUDDLE = { seq: '9000', from: 39, len: 3 };   // what is left of him
  var LOOGIE = { seq: '9002', from: 0,  len: 8 };   // in flight
  var BURST = { seq: '9002', from: 17, len: 2 };    // landing
  var SPLAT = { seq: '9001', from: 23, len: 15 };   // and lying there
  var PIG = { seq: '9002', from: 104, len: 2 };     // he has slimed a pig

  // How busy he is: how long between visits, and how many he throws per visit.
  var BEHAVIOR = {
    'pesky': [5.0, 1], 'unruly': [3.6, 1], 'ill-mannered': [2.6, 2],
    'horrid': [1.8, 2], 'atrocious': [1.1, 3], 'kill it!!!': [0.6, 4]
  };
  // How much of it stays on the screen.
  var MESS = {
    'unkempt': 6, 'besmirched': 12, 'disquieting': 20, 'nauseous': 32,
    'disgusting': 50, 'art form': 80, 'are you crazy?!': 140
  };

  var ACT = 9;                 // frames per second, him
  var FLY = 14;                // frames per second, a loogie
  var GRAVITY = 260;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function Phlegm(art) {
    this.art = art;
    this.gap = BEHAVIOR['ill-mannered'][0];
    this.throws = BEHAVIOR['ill-mannered'][1];
    this.mess = MESS.nauseous;
    this.clear = true;
    this.him = null;
    this.flying = [];
    this.stuck = [];
    this.wait = 0;
  }

  Phlegm.prototype.size = function (run) {
    var seq = this.art.sequence(run.seq);
    var w = 0, h = 0;
    for (var i = 0; i < run.len; i += 1) {
      var f = seq.frames[(run.from + i) % seq.count];
      w = Math.max(w, f.w); h = Math.max(h, f.h);
    }
    return { w: w, h: h };
  };

  Phlegm.prototype.reset = function (w, h) {
    this.him = null;
    this.flying = [];
    this.stuck = [];
    this.wait = rand(0.2, this.gap);
  };

  Phlegm.prototype.arrive = function (w, h) {
    var s = this.size(STAND);
    this.him = {
      x: rand(s.w, Math.max(s.w + 1, w - s.w)),
      // He keeps to the upper part, because what he throws falls, and if he
      // stands at the bottom the mess all lands in one band.
      y: rand(s.h * 0.7, Math.max(s.h * 0.7 + 1, h * 0.62)),
      frame: 0,
      state: 'stand',
      left: this.throws,
      pig: Math.random() < 0.06        // now and then he brings the pig
    };
  };

  Phlegm.prototype.hock = function (w, h) {
    var him = this.him;
    var s = this.size(LOOGIE);
    var toX = rand(0, w);
    var toY = rand(him.y, h - s.h);
    var t = rand(0.5, 1.1);
    this.flying.push({
      x: him.x, y: him.y,
      toY: toY,
      vx: (toX - him.x) / t,
      vy: (toY - him.y) / t - 0.5 * GRAVITY * t,
      frame: rand(0, LOOGIE.len)
    });
  };

  Phlegm.prototype.drop = function (run, x, y) {
    var f = this.size(run);
    this.stuck.push({ run: run, frame: Math.floor(rand(0, run.len)), x: x, y: y });
    while (this.stuck.length > this.mess) { this.stuck.shift(); }
  };

  Phlegm.prototype.step = function (dt, w, h) {
    var i, g;

    for (i = this.flying.length - 1; i >= 0; i -= 1) {
      g = this.flying[i];
      g.vy += GRAVITY * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.frame += FLY * dt;
      // It lands where it was thrown, not wherever the bottom of the screen
      // happens to be, or every splat ends up in a line along the floor.
      if (g.y >= g.toY || g.y > h - 8 || g.x < -20 || g.x > w + 20) {
        this.drop(BURST, Math.min(Math.max(g.x, 12), w - 12), Math.min(g.y, h - 10));
        this.drop(SPLAT, Math.min(Math.max(g.x, 20), w - 20), Math.min(g.y + 4, h - 8));
        this.flying.splice(i, 1);
      }
    }

    if (!this.him) {
      this.wait -= dt;
      if (this.wait <= 0) { this.arrive(w, h); }
      return;
    }

    var him = this.him;
    him.frame += ACT * dt;

    if (him.state === 'stand') {
      // Somewhere in the standing about, he throws.
      if (him.left > 0 && him.frame >= STAND.len * (this.throws - him.left + 1) / (this.throws + 1)) {
        this.hock(w, h);
        him.left -= 1;
      }
      if (him.frame >= STAND.len) { him.state = 'melt'; him.frame = 0; }
    } else if (him.frame >= MELT.len) {
      this.drop(PUDDLE, him.x, him.y + this.size(STAND).h * 0.3);
      if (him.pig) { this.drop(PIG, him.x + rand(-40, 40), him.y + this.size(STAND).h * 0.25); }
      this.him = null;
      this.wait = rand(this.gap * 0.6, this.gap * 1.4);
    }
  };

  Phlegm.prototype.drawRun = function (ctx, run, index, x, y) {
    var seq = this.art.sequence(run.seq);
    if (!seq) { return; }
    seq.draw(ctx, run.from + (Math.floor(index) % run.len), x, y);
  };

  Phlegm.prototype.draw = function (ctx, w, h) {
    if (this.clear) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    var i;
    for (i = 0; i < this.stuck.length; i += 1) {
      var s = this.stuck[i];
      this.drawRun(ctx, s.run, s.frame, s.x, s.y);
    }
    for (i = 0; i < this.flying.length; i += 1) {
      var g = this.flying[i];
      this.drawRun(ctx, LOOGIE, g.frame, g.x, g.y);
    }
    if (this.him) {
      this.drawRun(ctx, this.him.state === 'stand' ? STAND : MELT,
                   this.him.frame, this.him.x, this.him.y);
    }
  };

  /* ------------------------------------------------------------ element */

  function PhlegmElement() { return Reflect.construct(HTMLElement, [], PhlegmElement); }
  PhlegmElement.prototype = Object.create(HTMLElement.prototype);
  PhlegmElement.prototype.constructor = PhlegmElement;
  Object.setPrototypeOf(PhlegmElement, HTMLElement);

  PhlegmElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/phlegm_b';
    this.style.display = this.style.display || 'block';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Phlegm(art);
      var b = (AfterDark.setting(self, 'behavior') || 'ill-mannered').toLowerCase();
      if (BEHAVIOR[b]) { sim.gap = BEHAVIOR[b][0]; sim.throws = BEHAVIOR[b][1]; }
      var m = (AfterDark.setting(self, 'mess') || 'nauseous').toLowerCase();
      sim.mess = MESS[m] || parseInt(m, 10) || MESS.nauseous;
      sim.clear = AfterDark.setting(self, 'clear-screen') !== 'no';
      if (sim.clear) { self.style.background = '#000'; }

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

  PhlegmElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-phlegm', PhlegmElement);
  window.AfterDarkPhlegm = Phlegm;
}());
