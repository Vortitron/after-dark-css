/**
 * toxic.js - Toxic Swamp, on the module's own artwork.
 *
 * Toxic.ad, 1995, from the 10th anniversary collection. Its own description:
 *
 *   "Take a tropical underwater paradise, add a touch of toxic waste, a
 *    sprinkle of contaminated syringes, and watch the whole eco system go down
 *    the tubes. That's just what happened here. Thank your lucky stars we
 *    didn't make it scratch-n-sniff. Watch for Larry the Lawyer!
 *    Critters: just how much can you stand?
 *    Lung Capacity: how long will the lawyer suffer? YOU decide.
 *    Fish Only: gives you only fish, if it's checked."
 *   Art by Robert Cuenca. Programming by Scott Garcia.
 *
 * The settings are its own, out of TYPE_1000: Critters = Depopulated / Lonely
 * / Fruitful / Swarming / Festering, Lung Capacity = Thimble / Cup / Quart /
 * Gallon / Barrel, Fish Only, and Show Swamp Floor.
 *
 * Artwork, from tools/adweb.py. Three sequences, 214 frames, all of which
 * decode. Each sequence is a run of unrelated things one after another rather
 * than one animation, so the table below is where each creature starts and how
 * many frames it gets - read off the sheets.
 *
 * Lung Capacity is the best of it. Frames 46 to 61 of 9002 are one head going
 * from flesh, through red, to magenta, to purple, to blue: Larry the Lawyer
 * running out of air. So the setting is how long he takes to work down that
 * run, and Thimble kills him quickly.
 *
 *   <after-dark-toxic critters="fruitful" lung-capacity="quart" swamp-floor>
 */
(function () {
  'use strict';

  /* seq, first frame, how many. Everything here swims or drifts leftwards in
     the artwork, so a creature going the other way is mirrored.

     Only whole creatures are on this list. 9001 frames 33-37 are the gar's
     snout cut off at the left and 39-44 are loose bones, both of which read as
     a creature on the sheet and are not one - the tell is the same as
     everywhere else, an edge running solid where a whole thing would taper. */
  var CREATURES = [
    { name: 'eel',       seq: '9001', from: 5,  len: 13, speed: 26, fish: false },
    { name: 'minnow',    seq: '9001', from: 19, len: 8,  speed: 40, fish: true },
    { name: 'toad',      seq: '9001', from: 56, len: 10, speed: 14, fish: false },
    { name: 'piranha',   seq: '9001', from: 69, len: 4,  speed: 48, fish: true },
    { name: 'big piranha', seq: '9002', from: 0, len: 8, speed: 54, fish: true },
    { name: 'blue fish', seq: '9002', from: 25, len: 11, speed: 38, fish: true },
    { name: 'gore fish', seq: '9002', from: 36, len: 3,  speed: 30, fish: true }
  ];

  // Rooted things. The swamp floor tiles along the bottom; the rest stand on it.
  var FLOOR = { seq: '9000', from: 38, len: 2 };
  var PROPS = [
    { seq: '9000', from: 0,  len: 1 },      // the coral tree with eyes on it
    { seq: '9000', from: 11, len: 1 },
    { seq: '9000', from: 35, len: 1 },      // a tyre and a bin
    { seq: '9000', from: 36, len: 1 },      // a grating
    { seq: '9000', from: 44, len: 1 },      // weed
    { seq: '9000', from: 63, len: 4 }       // algae, which drifts
  ];
  var TROLLEY = { seq: '9000', from: 26, len: 9 };
  var SYRINGE = { seq: '9000', from: 37, len: 1 };

  var LARRY = { seq: '9002', from: 39, len: 3 };    // tangled up in the rope
  var DROWNING = { seq: '9002', from: 46, len: 16 };  // his face, going blue

  var CRITTERS = {
    'depopulated': 3, 'lonely': 6, 'fruitful': 12, 'swarming': 22, 'festering': 38
  };
  // How long Larry lasts, in seconds.
  var LUNGS = {
    'thimble': 8, 'cup': 16, 'quart': 30, 'gallon': 55, 'barrel': 95
  };

  var SWIM = 5;                // frames per second
  var DRIFT = 1.2;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function Toxic(art) {
    this.art = art;
    this.count = CRITTERS.fruitful;
    this.lungs = LUNGS.quart;
    this.fishOnly = false;
    this.showFloor = true;
    this.critters = [];
    this.props = [];
    this.larry = null;
  }

  Toxic.prototype.pool = function () {
    var only = this.fishOnly;
    return CREATURES.filter(function (c) { return !only || c.fish; });
  };

  Toxic.prototype.size = function (run) {
    var seq = this.art.sequence(run.seq);
    var w = 0, h = 0;
    for (var i = 0; i < run.len; i += 1) {
      var f = seq.frames[(run.from + i) % seq.count];
      w = Math.max(w, f.w); h = Math.max(h, f.h);
    }
    return { w: w, h: h };
  };

  Toxic.prototype.floorHeight = function () {
    return this.showFloor ? this.size(FLOOR).h : 0;
  };

  Toxic.prototype.spawn = function (w, h, anywhere) {
    var run = pick(this.pool());
    var size = this.size(run);
    var right = Math.random() < 0.5;
    var deep = h - this.floorHeight();
    return {
      run: run,
      right: right,
      vx: (right ? 1 : -1) * run.speed * rand(0.7, 1.3),
      x: anywhere ? rand(0, w) : (right ? -size.w : w + size.w),
      y: rand(size.h * 0.6, Math.max(size.h * 0.7, deep - size.h * 0.4)),
      drift: rand(-8, 8),
      frame: rand(0, run.len)
    };
  };

  Toxic.prototype.reset = function (w, h) {
    var i;
    this.critters = [];
    for (i = 0; i < this.count; i += 1) { this.critters.push(this.spawn(w, h, true)); }

    this.props = [];
    var floorY = h - this.floorHeight() * 0.5;
    var n = Math.max(3, Math.round(w / 180));
    var junk = PROPS.concat([TROLLEY, SYRINGE]);
    for (i = 0; i < n; i += 1) {
      var run = pick(junk);
      var size = this.size(run);
      this.props.push({ run: run, x: rand(0, w), y: floorY - size.h * 0.35, frame: rand(0, run.len) });
    }

    // Larry is down there somewhere, running out of air.
    this.larry = { x: rand(w * 0.2, w * 0.8), y: h - this.floorHeight() - 40, t: 0 };
  };

  Toxic.prototype.step = function (dt, w, h) {
    var i, c;
    for (i = 0; i < this.critters.length; i += 1) {
      c = this.critters[i];
      c.x += c.vx * dt;
      c.y += c.drift * dt;
      c.frame += SWIM * dt;

      var size = this.size(c.run);
      var top = size.h * 0.55;
      var floor = h - this.floorHeight() - size.h * 0.25;
      if (c.y < top || c.y > floor) {
        c.drift = -c.drift;
        c.y = Math.min(Math.max(c.y, top), floor);
      }
      if ((c.vx > 0 && c.x > w + size.w) || (c.vx < 0 && c.x < -size.w)) {
        this.critters[i] = this.spawn(w, h, false);
      }
    }
    for (i = 0; i < this.props.length; i += 1) { this.props[i].frame += DRIFT * dt; }

    if (this.larry) {
      this.larry.t += dt;
      if (this.larry.t > this.lungs * 1.25) {
        this.larry.x = rand(w * 0.2, w * 0.8);
        this.larry.y = h - this.floorHeight() - 40;
        this.larry.t = 0;
      }
    }
  };

  Toxic.prototype.drawRun = function (ctx, run, index, x, y, flip) {
    var seq = this.art.sequence(run.seq);
    if (!seq) { return; }
    var i = run.from + (Math.floor(index) % run.len);
    seq.draw(ctx, i, x, y, { flipX: !!flip });
  };

  Toxic.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    var i, x;
    if (this.showFloor) {
      var fs = this.size(FLOOR);
      for (x = 0; x < w; x += fs.w) {
        this.drawRun(ctx, FLOOR, 0, x + fs.w / 2, h - fs.h / 2, false);
      }
    }
    for (i = 0; i < this.props.length; i += 1) {
      var p = this.props[i];
      this.drawRun(ctx, p.run, p.frame, p.x, p.y, false);
    }

    if (this.larry) {
      var t = Math.min(1, this.larry.t / this.lungs);
      // He goes from flesh to blue as the air runs out.
      this.drawRun(ctx, LARRY, 0, this.larry.x, this.larry.y, false);
      this.drawRun(ctx, DROWNING, Math.floor(t * (DROWNING.len - 1)),
                   this.larry.x, this.larry.y - this.size(LARRY).h * 0.55, false);
    }

    for (i = 0; i < this.critters.length; i += 1) {
      var c = this.critters[i];
      // The art all swims leftwards, so going right is the mirrored one.
      this.drawRun(ctx, c.run, c.frame, c.x, c.y, c.right);
    }
  };

  /* ------------------------------------------------------------ element */

  function ToxicElement() { return Reflect.construct(HTMLElement, [], ToxicElement); }
  ToxicElement.prototype = Object.create(HTMLElement.prototype);
  ToxicElement.prototype.constructor = ToxicElement;
  Object.setPrototypeOf(ToxicElement, HTMLElement);

  ToxicElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/toxic';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Toxic(art);
      var c = (AfterDark.setting(self, 'critters') || 'fruitful').toLowerCase();
      sim.count = CRITTERS[c] || parseInt(c, 10) || CRITTERS.fruitful;
      var l = (AfterDark.setting(self, 'lung-capacity') || 'quart').toLowerCase();
      sim.lungs = LUNGS[l] || parseInt(l, 10) || LUNGS.quart;
      sim.fishOnly = AfterDark.flag(self, 'fish-only');
      var floor = AfterDark.setting(self, 'swamp-floor');
      sim.showFloor = floor === null ? true : AfterDark.flag(self, 'swamp-floor');

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

  ToxicElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-toxic', ToxicElement);
  window.AfterDarkToxic = Toxic;
}());
