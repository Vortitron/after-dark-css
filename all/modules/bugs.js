/**
 * bugs.js - Bugs, on the module's own artwork.
 *
 * BUGS.AD, from the classic set. Its own description:
 *
 *   "BUGS. Creepy crawlies have infested your computer. Don't let anybody tell
 *    you otherwise, there ARE bugs in today's computers.
 *    'Bug Density' selects the number of bugs which appear on screen.
 *    'Bug Types...' selects which bugs appear on your desktop.
 *    'Clear screen first' makes the bugs appear on a black screen."
 *   Programming by Rob Blair. Art by Kim Payne and Dana Muise.
 *
 * The settings are its own, out of TYPE_1000: Bug Density = Nest / Colony /
 * Infestation / Swarm / Plague / New York, and Bug Type = Scarab / Jewel /
 * Roaches / Ants / Ladybugs / Spiders / Flys / All. The module also ships four
 * ATAN resources, which is how it turned a velocity into a sprite.
 *
 * Two ways of facing, and which one a bug uses is visible in its strip:
 *
 *   Jewel (4000), Ants (6000) and Flys (1000) ship pre-rendered headings - a
 *   quarter turn from head-up to head-left, with a short leg or wing cycle at
 *   each - so a heading picks a frame and a mirror in x and/or y reaches the
 *   other three quadrants. Nothing is rotated.
 *
 *   Scarab (2000), Roaches (3000) and Ladybugs (5000) ship one heading and a
 *   walk cycle, so those are turned on the canvas from the angle the art is
 *   drawn at. The roach also ships the same nine frames again at 3010, turned
 *   a quarter, which is the same thing done at build time.
 *
 * Spiders are on the menu but not in the resources as a whole creature: 4000
 * and 6000 each end with fifteen frames of a single jointed leg, which is what
 * a spider was assembled from, and the offsets for that are in the code rather
 * than the resource table. So spiders are left out rather than invented. The
 * 116x116 "Bugs Motel - No Vacancy" sign at 8000 is left out for the same
 * reason: nothing records what the bugs did with it.
 *
 *   <after-dark-bugs density="colony" type="all" clear-screen></after-dark-bugs>
 */
(function () {
  'use strict';

  var Q = Math.PI / 2;

  /* headings x phases frames from `first`, `stride` apart. `facing` is only
     for the single-heading strips: the screen angle the art is drawn at, with
     0 pointing right and angles growing clockwise. The scarab and the ladybug
     are drawn head-up, the roach head-left. */
  var SPECIES = [
    { name: 'jewel',    id: '4000', headings: 20, phases: 2,  first: 0, stride: 2,  speed: 26, step: 9 },
    { name: 'ants',     id: '6000', headings: 20, phases: 2,  first: 0, stride: 2,  speed: 34, step: 12 },
    { name: 'flys',     id: '1000', headings: 5,  phases: 3,  first: 0, stride: 8,  speed: 96, step: 22 },
    { name: 'scarab',   id: '2000', headings: 1,  phases: 24, first: 0, stride: 24, speed: 20, step: 10, facing: -Q },
    { name: 'roaches',  id: '3000', headings: 1,  phases: 9,  first: 0, stride: 9,  speed: 58, step: 16, facing: Math.PI },
    { name: 'ladybugs', id: '5000', headings: 1,  phases: 3,  first: 0, stride: 3,  speed: 22, step: 8,  facing: -Q }
  ];

  var DENSITY = {
    'nest': 3, 'colony': 8, 'infestation': 18,
    'swarm': 35, 'plague': 70, 'new york': 140
  };

  var TURN = 1.5;              // radians per second a bug can swing round
  var WANDER = 0.9;            // how often it picks a new direction

  function rand(a, b) { return a + Math.random() * (b - a); }

  function Bugs(art) {
    this.art = art;
    this.kinds = {};
    var self = this;
    SPECIES.forEach(function (s) {
      var seq = art.sequence(s.id);
      if (seq) { self.kinds[s.name] = { spec: s, seq: seq }; }
    });
    this.chosen = Object.keys(this.kinds);
    this.count = DENSITY.colony;
    this.clear = true;
    this.bugs = [];
  }

  Bugs.prototype.setType = function (name) {
    name = (name || 'all').toLowerCase();
    if (name === 'all' || !this.kinds[name]) {
      this.chosen = Object.keys(this.kinds);
    } else {
      this.chosen = [name];
    }
  };

  Bugs.prototype.spawn = function (w, h) {
    var kind = this.kinds[this.chosen[Math.floor(Math.random() * this.chosen.length)]];
    return {
      kind: kind,
      x: rand(0, w),
      y: rand(0, h),
      angle: rand(0, Math.PI * 2),
      want: rand(0, Math.PI * 2),
      next: rand(0, WANDER * 2),
      phase: rand(0, kind.spec.phases)
    };
  };

  Bugs.prototype.reset = function (w, h) {
    this.bugs = [];
    for (var i = 0; i < this.count && this.chosen.length; i += 1) {
      this.bugs.push(this.spawn(w, h));
    }
  };

  Bugs.prototype.step = function (dt, w, h) {
    for (var i = 0; i < this.bugs.length; i += 1) {
      var b = this.bugs[i];
      var spec = b.kind.spec;

      b.next -= dt;
      if (b.next <= 0) {
        b.want = b.angle + rand(-1.4, 1.4);
        b.next = rand(WANDER * 0.4, WANDER * 2);
      }
      var diff = ((b.want - b.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      b.angle += Math.max(-TURN * dt, Math.min(TURN * dt, diff));

      b.x += Math.cos(b.angle) * spec.speed * dt;
      b.y += Math.sin(b.angle) * spec.speed * dt;
      b.phase += spec.step * dt;

      // Off one edge, on at the other, the way they crawl over a desktop.
      var pad = b.kind.seq.width;
      if (b.x < -pad) { b.x = w + pad; } else if (b.x > w + pad) { b.x = -pad; }
      if (b.y < -pad) { b.y = h + pad; } else if (b.y > h + pad) { b.y = -pad; }
    }
  };

  Bugs.prototype.draw = function (ctx, w, h) {
    if (this.clear) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    for (var i = 0; i < this.bugs.length; i += 1) {
      var b = this.bugs[i];
      var spec = b.kind.spec;
      var phase = Math.floor(b.phase) % spec.phases;
      var dx = Math.cos(b.angle), dy = Math.sin(b.angle);

      if (spec.headings === 1) {
        b.kind.seq.drawTurned(ctx, spec.first + phase, b.x, b.y, b.angle - spec.facing);
        continue;
      }
      // The strip runs head-up to head-left; a mirror in x and y reaches the
      // rest, so the heading only has to be folded into that quarter. The
      // epsilon keeps a bug walking dead north from mirroring on rounding.
      var t = Math.atan2(Math.abs(dx), Math.abs(dy)) / Q;
      var index = spec.first + Math.round(t * (spec.headings - 1)) * spec.stride + phase;
      b.kind.seq.draw(ctx, index, b.x, b.y, { flipX: dx > 1e-6, flipY: dy > 1e-6 });
    }
  };

  /* ------------------------------------------------------------ element */

  function BugsElement() { return Reflect.construct(HTMLElement, [], BugsElement); }
  BugsElement.prototype = Object.create(HTMLElement.prototype);
  BugsElement.prototype.constructor = BugsElement;
  Object.setPrototypeOf(BugsElement, HTMLElement);

  BugsElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/bugs';
    this.style.display = this.style.display || 'block';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Bugs(art);
      var density = (AfterDark.setting(self, 'density') || 'colony').toLowerCase();
      sim.count = DENSITY[density] || parseInt(density, 10) || DENSITY.colony;
      sim.setType(AfterDark.setting(self, 'type'));
      // "Clear screen first" - on, unless it is turned off to let a page show
      // through, which is what it meant when the desktop was behind it.
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

  BugsElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-bugs', BugsElement);
  window.AfterDarkBugs = Bugs;
}());
