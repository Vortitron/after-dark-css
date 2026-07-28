/**
 * bungee.js - Bungee Roulette, on the module's own artwork.
 *
 * BUNGEE.AD, 1995, from the 10th anniversary collection. Its own description:
 *
 *   "Bungee Roulette. Falling is such sweet sorrow! Dedicated to those brave
 *    souls who risk their lives every day for cheap thrills. Bungee was a
 *    runner up in the 1992 After Dark Display Contest and Grand Prize winner
 *    in the 1992 Weird Software Contest.
 *    Jumper: Pick your road pizza.
 *    Jumps: Just how many must die before the screen FINALLY clears!?
 *    Equipment: Play God! Determine the quality of the rope."
 *   Art by Robert Cuenca. Programming by Scott Garcia.
 *
 * The settings are its own, out of TYPE_1000: Jumper = Daredevil / Half
 * Daredevil / Cow / Fish / Half Fish / Random, Jumps = One / Few / Many /
 * Droves / Whole Bunches / Hundreds, Equipment = Safe / Reliable / Used /
 * So - So / Purfikt, and Clear Screen First.
 *
 * Artwork, from tools/adweb.py. Two sequences, 171 frames, all of which
 * decode:
 *   9000  the jumpers and what is left of them
 *   9001  the impact, and the mess
 *
 * Each jumper is a run of frames of the same creature at different lengths,
 * because it hangs upside down by the ankles and the rope stretches it: sort
 * that run by height and you have the tension ramp, which is what `stretch`
 * below is. Then the joke, which the artwork makes plain and the module's
 * hint strings confirm - "Rhea, this cow is for you", "Anyone want a milk
 * shake?" - is what each one turns into. The cow leaves burgers, hot dogs and
 * steaks; the fish leaves sushi, a severed head and a pile of bones; the
 * daredevil leaves the concertina and the blood.
 *
 * What is not in the resources is the staging. There is no bridge, no gantry
 * and no rope anywhere in the 171 frames, so the drop, the recoil and the
 * rope itself are drawn here rather than lifted. Everything with pixels in it
 * is the original's.
 *
 *   <after-dark-bungee jumper="random" jumps="many" equipment="so - so">
 */
(function () {
  'use strict';

  var JUMP = '9000', SPLAT = '9001';

  /* `stretch` is the creature's frames ordered slack to taut. `remains` is
     what it leaves behind. */
  var JUMPERS = [
    { name: 'daredevil', stretch: [102, 99, 100, 101],
      remains: [], stuck: [17, 18, 19, 20] },   // limbs out of a puddle, from 9001
    { name: 'cow',       stretch: [5, 4, 3, 0, 1, 2],
      remains: [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50] },
    { name: 'fish',      stretch: [54, 51, 52, 53, 55, 56, 57, 58],
      remains: [74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86],
      parts: [68, 69, 70, 71, 72, 73, 91, 92, 93, 94, 95, 96, 97, 98] }
  ];

  // The impact, in order, out of 9001; then the mess it leaves.
  var IMPACT = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16];
  var MESS = [21, 22, 23, 24, 25, 26, 27, 28, 32, 33, 34, 35];
  var BONES = [43, 44, 46];

  var JUMPS = {
    'one': 1, 'few': 3, 'many': 6, 'droves': 12, 'whole bunches': 20, 'hundreds': 40
  };
  // Play God: how likely the rope is to let go. Purfikt is the joke.
  var ROPE = {
    'safe': 0.08, 'reliable': 0.22, 'used': 0.42, 'so - so': 0.62,
    'so-so': 0.62, 'purfikt': 0.9
  };

  var GRAVITY = 900;          // px/s^2
  var SPRING = 5.2;           // how hard the rope pulls back once it is taut
  var DAMP = 0.55;            // energy left after each bounce
  var HAUL = 220;             // px/s the survivors are pulled back up
  var CRUSH = 22;             // impact frames per second

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function Bungee(art) {
    this.jump = art.sequence(JUMP);
    this.splat = art.sequence(SPLAT);
    this.kinds = {};
    var self = this;
    JUMPERS.forEach(function (j) { self.kinds[j.name] = j; });
    this.choice = 'random';
    this.jumps = JUMPS.many;
    this.rope = ROPE['so - so'];
    this.clear = true;
    this.mess = [];           // what has already hit the ground, and stays
    this.jumper = null;
    this.done = 0;
  }

  Bungee.prototype.setJumper = function (name) {
    name = (name || 'random').toLowerCase().replace(/^half\s+/, '');
    this.choice = this.kinds[name] ? name : 'random';
  };

  Bungee.prototype.reset = function (w, h) {
    this.mess = [];
    this.done = 0;
    this.jumper = null;
    this.next(w, h);
  };

  Bungee.prototype.next = function (w, h) {
    var kind = this.choice === 'random' ? pick(JUMPERS) : this.kinds[this.choice];
    var seq = this.jump;
    var tall = seq.frames[kind.stretch[kind.stretch.length - 1]].h;
    // Where the rope runs out, which is what decides whether the ground is
    // reached at all.
    var slack = rand(h * 0.42, h * 0.66);
    this.jumper = {
      kind: kind,
      x: rand(w * 0.15, w * 0.85),
      y: -tall,
      vy: 0,
      slack: slack,
      snapped: Math.random() < this.rope,
      roped: true,
      tension: 0,
      state: 'falling',
      frame: 0,
      bounces: 0
    };
  };

  /* The mess never moves once it is down, so it is placed as it lands, sitting
     on the bottom rather than hanging off it. */
  Bungee.prototype.land = function (j, w, h) {
    var self = this;
    function drop(seq, frame, x, lift) {
      var f = seq.frames[frame];
      self.mess.push({ seq: seq, frame: frame, x: x, y: h - f.h / 2 - lift });
    }
    drop(this.splat, pick(MESS), j.x, rand(2, 10));
    var extras = j.kind.remains.concat(j.kind.parts || []);
    var n = 1 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n && extras.length; i += 1) {
      drop(this.jump, pick(extras), j.x + rand(-42, 42), rand(2, 16));
    }
    if (j.kind.stuck) { drop(this.splat, pick(j.kind.stuck), j.x + rand(-16, 16), rand(0, 6)); }
    drop(this.splat, pick(BONES), j.x + rand(-34, 34), rand(2, 14));
  };

  Bungee.prototype.step = function (dt, w, h) {
    var j = this.jumper;
    if (!j) { return; }
    var seq = this.jump;
    var tall = seq.frames[j.kind.stretch[j.kind.stretch.length - 1]].h;
    var floor = h - 6;

    if (j.state === 'falling' || j.state === 'rebound') {
      j.vy += GRAVITY * dt;
      // Past the slack the rope starts pulling, and stretches the jumper. Bad
      // equipment lets go once it is nearly taut, which is the whole game.
      var over = j.y - j.slack;
      if (over > 0 && j.roped) {
        j.tension = Math.min(1, over / (h * 0.22));
        if (j.snapped && j.tension > 0.7) { j.roped = false; }
        else { j.vy -= over * SPRING * dt * 10; }
      } else {
        j.tension = Math.max(0, j.tension - dt * 3);
      }
      j.y += j.vy * dt;

      if (!j.roped && j.y + tall >= floor) {
        j.state = 'impact';
        j.frame = 0;
      } else if (j.roped && j.vy < 0 && over <= 0) {
        j.bounces += 1;
        j.vy *= DAMP;
        if (j.bounces >= 3) { j.state = 'haul'; }
      }
    } else if (j.state === 'impact') {
      j.frame += CRUSH * dt;
      if (j.frame >= IMPACT.length) {
        this.land(j, w, h);
        this.done += 1;
        if (this.done >= this.jumps) { this.mess = []; this.done = 0; }
        this.next(w, h);
      }
    } else if (j.state === 'haul') {
      j.y -= HAUL * dt;
      j.tension = Math.max(0, j.tension - dt * 2);
      if (j.y + tall < 0) { this.next(w, h); }
    }
  };

  Bungee.prototype.draw = function (ctx, w, h) {
    if (this.clear) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    var i;
    for (i = 0; i < this.mess.length; i += 1) {
      var m = this.mess[i];
      m.seq.draw(ctx, m.frame, m.x, m.y);
    }

    var j = this.jumper;
    if (!j) { return; }

    if (j.state === 'impact') {
      var fi = IMPACT[Math.min(IMPACT.length - 1, Math.floor(j.frame))];
      var f = this.splat.frames[fi];
      this.splat.draw(ctx, fi, j.x, h - f.h / 2 - 4);
      return;
    }

    // The ramp is an approach as much as a stretch - the jumper comes at you
    // as it drops and only comes apart once the rope has hold - so the first
    // half of it follows the fall and the rope takes it the rest of the way.
    var seq = this.jump;
    var fall = Math.max(0, Math.min(1, j.y / Math.max(1, j.slack)));
    var t = Math.max(fall * 0.5, j.tension);
    var idx = j.kind.stretch[Math.round(t * (j.kind.stretch.length - 1))];
    if (j.roped) {
      ctx.strokeStyle = '#c8c8c8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(j.x) + 0.5, 0);
      ctx.lineTo(Math.round(j.x) + 0.5, Math.round(j.y));
      ctx.stroke();
    }
    seq.draw(ctx, idx, j.x, j.y + seq.frames[idx].h / 2);
  };

  /* ------------------------------------------------------------ element */

  function BungeeElement() { return Reflect.construct(HTMLElement, [], BungeeElement); }
  BungeeElement.prototype = Object.create(HTMLElement.prototype);
  BungeeElement.prototype.constructor = BungeeElement;
  Object.setPrototypeOf(BungeeElement, HTMLElement);

  BungeeElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/bungee';
    this.style.display = this.style.display || 'block';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Bungee(art);
      sim.setJumper(self.getAttribute('jumper'));
      var jumps = (self.getAttribute('jumps') || 'many').toLowerCase();
      sim.jumps = JUMPS[jumps] || parseInt(jumps, 10) || JUMPS.many;
      var kit = (self.getAttribute('equipment') || 'so - so').toLowerCase();
      sim.rope = ROPE[kit] !== undefined ? ROPE[kit] : ROPE['so - so'];
      sim.clear = self.getAttribute('clear-screen') !== 'no';
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

  BungeeElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-bungee', BungeeElement);
  window.AfterDarkBungee = Bungee;
}());
