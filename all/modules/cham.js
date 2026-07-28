/**
 * cham.js - Chameleon, on the module's own artwork.
 *
 * CHAM.AD, 1995, from the 10th anniversary collection. Its own description:
 *
 *   "Chameleon. National Geographic never had it so good! We've baked every
 *    bizarre and disgusting behavior from the animal kingdom into these
 *    charming little creatures. Don't worry, the vomit washes off your desktop
 *    just fine.
 *    Quantity: Just how many chameleons can you stand?
 *    Zest: Crank it up, make 'em frisky!
 *    Vommeter: Controls the frequency of vomiting, of course!
 *    CapsLock: Hit it, and smite a chameleon."
 *   Art by Laurence Arcadias. Programming by Jeff "Trurl" Thomas.
 *
 * The settings are its own, out of TYPE_1000: Quantity = Few / Some / More /
 * Some More / Lots, Zest = Laconic / Perky / Frisky / Hyper, and Vomiter =
 * None / Upset Tummy / Nauseous / Sick / Poisoned / Vomitorium. The same
 * resource carries a list of what the animations are - Sniff Other, Kiss,
 * Burp, Puke, Point At Screen - which is how we know these creatures are meant
 * to stop and do things rather than only walk.
 *
 * Artwork, from tools/adweb.py. Six sequences, 280 frames, all of which
 * decode:
 *   1000, 1001  the chameleon walking and carrying on, drawn facing right
 *   1002        more of the same, most of it drawn facing left
 *   1003        the smite, and loose tongues
 *   1004        heads, then the puke, then what it leaves
 *   1005        worms, fire and a scorch mark
 *
 * Which way a frame faces is not recorded, but the creature wears a yellow
 * crest on its head, so the side of the body the yellow sits on says which way
 * it is pointing. That is how the runs below were picked: each is a stretch of
 * frames that keeps one facing, so it can be mirrored as a unit.
 *
 * Behaviour is from a capture of the real module under tools/adrun.sh, which
 * for this one paints correctly: they wander slowly, face the way they are
 * going, and stop now and then to do something.
 *
 *   <after-dark-cham quantity="some" zest="perky" vomiter="sick">
 */
(function () {
  'use strict';

  // seq, first frame, how many, and which way it faces (1 right, -1 left)
  var WALK = { seq: '1000', from: 0, len: 6, faces: 1 };

  // Stretches that keep one facing, so each can be mirrored as a unit.
  var BEHAVIOURS = [
    { seq: '1000', from: 7,  len: 6,  faces: 1 },
    { seq: '1001', from: 25, len: 5,  faces: 1 },
    { seq: '1001', from: 0,  len: 6,  faces: 1 },
    { seq: '1002', from: 5,  len: 15, faces: -1 },
    { seq: '1002', from: 34, len: 8,  faces: 1 }
  ];

  var PUKE = { seq: '1004', from: 39, len: 8, faces: 1 };   // the head, mid-heave
  var MESS = { seq: '1004', from: 46, len: 7 };             // and the puddle
  var SMITE = { seq: '1003', from: 3,  len: 9 };            // CapsLock

  var QUANTITY = { 'few': 3, 'some': 6, 'more': 10, 'some more': 16, 'lots': 24 };
  var ZEST = { 'laconic': 10, 'perky': 18, 'frisky': 28, 'hyper': 44 };
  // The chance that the next thing one of them stops to do is be sick.
  var VOMITER = {
    'none': 0, 'upset tummy': 0.08, 'nauseous': 0.2, 'sick': 0.35,
    'poisoned': 0.6, 'vomitorium': 0.9
  };

  var STEP = 7;                // walk cycle, frames per second
  var ACT = 8;                 // a behaviour, frames per second
  var TURN = 2.2;              // radians per second it can swing round
  var PAUSE = [3, 11];         // seconds between behaviours

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function Cham(art) {
    this.art = art;
    this.count = QUANTITY.some;
    this.zest = ZEST.perky;
    this.vomiter = VOMITER.sick;
    this.lizards = [];
    this.puddles = [];
  }

  Cham.prototype.run = function (spec) {
    var seq = this.art.sequence(spec.seq);
    return seq ? { seq: seq, spec: spec } : null;
  };

  Cham.prototype.spawn = function (w, h) {
    var a = rand(0, Math.PI * 2);
    return {
      x: rand(0.08 * w, 0.92 * w),
      y: rand(0.1 * h, 0.9 * h),
      angle: a,
      want: a,
      frame: rand(0, WALK.len),
      doing: null,               // a behaviour, while it is stopped
      next: rand(PAUSE[0], PAUSE[1])
    };
  };

  Cham.prototype.reset = function (w, h) {
    this.lizards = [];
    this.puddles = [];
    for (var i = 0; i < this.count; i += 1) { this.lizards.push(this.spawn(w, h)); }
  };

  /** CapsLock, which the module's own description says smites one. */
  Cham.prototype.smite = function () {
    var live = this.lizards.filter(function (l) { return !l.smitten; });
    if (!live.length) { return; }
    var l = pick(live);
    l.smitten = 0;
    l.doing = null;
  };

  Cham.prototype.step = function (dt, w, h) {
    var i, l;
    for (i = this.lizards.length - 1; i >= 0; i -= 1) {
      l = this.lizards[i];

      if (l.smitten !== undefined) {
        l.smitten += ACT * dt;
        if (l.smitten >= SMITE.len) { this.lizards[i] = this.spawn(w, h); }
        continue;
      }

      if (l.doing) {
        l.frame += ACT * dt;
        if (l.frame >= l.doing.len) {
          if (l.doing === PUKE) { this.drop(l); }
          l.doing = null;
          l.frame = 0;
          l.next = rand(PAUSE[0], PAUSE[1]);
        }
        continue;
      }

      // Wander: pick a new heading now and then and ease round to it.
      l.next -= dt;
      if (l.next <= 0) {
        l.doing = Math.random() < this.vomiter ? PUKE : pick(BEHAVIOURS);
        l.frame = 0;
        continue;
      }
      if (Math.random() < dt * 0.5) { l.want = l.angle + rand(-1.6, 1.6); }
      var diff = ((l.want - l.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      l.angle += Math.max(-TURN * dt, Math.min(TURN * dt, diff));

      l.x += Math.cos(l.angle) * this.zest * dt;
      l.y += Math.sin(l.angle) * this.zest * dt;
      l.frame += STEP * dt;

      // Turn back at the edges rather than wrapping - they are on a desktop,
      // not a torus, and the capture never shows one leave.
      var pad = 40;
      if (l.x < pad || l.x > w - pad) {
        l.angle = Math.PI - l.angle;
        l.want = l.angle;
        l.x = Math.min(Math.max(l.x, pad), w - pad);
      }
      if (l.y < pad || l.y > h - pad) {
        l.angle = -l.angle;
        l.want = l.angle;
        l.y = Math.min(Math.max(l.y, pad), h - pad);
      }
    }
  };

  Cham.prototype.drop = function (l) {
    this.puddles.push({ x: l.x, y: l.y + 14, frame: Math.floor(rand(0, MESS.len)) });
    if (this.puddles.length > 24) { this.puddles.shift(); }
  };

  /* A run is drawn facing the way the creature is going, which means mirroring
     it when the art faces the other way. */
  Cham.prototype.drawRun = function (ctx, run, index, x, y, going) {
    var seq = this.art.sequence(run.seq);
    if (!seq) { return; }
    var i = run.from + (Math.floor(index) % run.len);
    var flip = run.faces !== undefined && ((going > 0) !== (run.faces > 0));
    seq.draw(ctx, i, x, y, { flipX: flip });
  };

  Cham.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    var i;
    for (i = 0; i < this.puddles.length; i += 1) {
      var p = this.puddles[i];
      this.drawRun(ctx, MESS, p.frame, p.x, p.y, 1);
    }
    for (i = 0; i < this.lizards.length; i += 1) {
      var l = this.lizards[i];
      var going = Math.cos(l.angle) >= 0 ? 1 : -1;
      if (l.smitten !== undefined) {
        this.drawRun(ctx, SMITE, l.smitten, l.x, l.y, 1);
      } else if (l.doing) {
        this.drawRun(ctx, l.doing, l.frame, l.x, l.y, going);
      } else {
        this.drawRun(ctx, WALK, l.frame, l.x, l.y, going);
      }
    }
  };

  /* ------------------------------------------------------------ element */

  function ChamElement() { return Reflect.construct(HTMLElement, [], ChamElement); }
  ChamElement.prototype = Object.create(HTMLElement.prototype);
  ChamElement.prototype.constructor = ChamElement;
  Object.setPrototypeOf(ChamElement, HTMLElement);

  ChamElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/cham';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Cham(art);
      var q = (AfterDark.setting(self, 'quantity') || 'some').toLowerCase();
      sim.count = QUANTITY[q] || parseInt(q, 10) || QUANTITY.some;
      var z = (AfterDark.setting(self, 'zest') || 'perky').toLowerCase();
      sim.zest = ZEST[z] || parseInt(z, 10) || ZEST.perky;
      var v = (AfterDark.setting(self, 'vomiter') || 'sick').toLowerCase();
      sim.vomiter = VOMITER[v] !== undefined ? VOMITER[v] : VOMITER.sick;

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);

      self._onKey = function (e) {
        if (e.key === 'CapsLock' ||
            (e.getModifierState && e.getModifierState('CapsLock'))) {
          sim.smite();
        }
      };
      window.addEventListener('keydown', self._onKey);

      screen.run(function (dt, ctx, w, h) {
        sim.step(dt, w, h);
        sim.draw(ctx, w, h);
      });
    }).catch(function (err) {
      self.textContent = err.message;
    });
  };

  ChamElement.prototype.disconnectedCallback = function () {
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-cham', ChamElement);
  window.AfterDarkCham = Cham;
}());
