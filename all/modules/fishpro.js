/**
 * fishpro.js - Fish Pro, on the module's own artwork.
 *
 * FISHPRO.AD, 10th anniversary collection. Its own description:
 *
 *   "FISH PRO. Impress friends with your own multi-million dollar tropical fish
 *    aquarium, courtesy of Berkeley Systems. Click the Select Fish... button to
 *    see the different species. Select them all or choose your favorites.
 *    'Fish' selects the number of fish on the screen. 'Show Sea Floor' whether
 *    or not the sea floor is displayed. Just for fun, hit the Caps Lock key and
 *    watch the fish scatter!"
 *   Programming by Jeff Thomas and Bruce Burkhalter. Art by Dana Muise.
 *
 * The settings are the module's own, out of TYPE_1000: Fish = Solo / Study
 * Group / Class / School / University, and Show Sea Floor = None / Static /
 * Animated. The species names are its STRINGLIST 666.
 *
 * Artwork, from tools/adweb.py:
 *   3010-3080, 3110  nine species
 *   5000  three rocks      5010  a 577x45 sea floor to tile
 *   5020  five corals      6000-6030  four anemones, six frames each
 *   7000  a bubble stream, six frames
 *
 * Most species are drawn in two pieces. Frame 0 is the body, and a later run
 * of small frames is the head - or for the Butterfly Fish, whose body faces
 * the other way, the tail - which butts onto the body's left edge. Nothing
 * records the offset, but nothing has to: at the true join the two silhouettes
 * agree exactly, so for each candidate piece there is one vertical offset at
 * which every row of its right edge matches the body's left edge, and the
 * composite is seamless. The offsets in `part` below were found that way, and
 * the piece has several frames because the head works its mouth and the tail
 * swishes. The Yellow Tang and the Red Clown are the exception: they are whole
 * in one frame, and their strips are a real rotation - broadside, round
 * through edge-on, out the other side - so those two turn by walking the
 * pivot, flipping at the edge-on end and walking back. The rest turn by
 * mirroring. Their remaining frames are turn-view bodies and turn-view tails
 * that would have to be re-paired to be usable, which is a guess too far.
 *
 *   <after-dark-fishpro fish="school" sea-floor="animated"></after-dark-fishpro>
 */
(function () {
  'use strict';

  /* id, name from STRINGLIST 666, the body frames, the piece that goes on the
     body's left as [frame, vertical offset], the pivot out to edge-on for the
     two that have one, and which way the art faces (-1 left, +1 right, 0 for
     the jellyfish, which has no left or right and is never mirrored). */
  var SPECIES = [
    { id: '3010', name: 'Yellow Tang',    body: [0, 4],  pivot: [5, 6, 7],                   faces: -1 },
    { id: '3020', name: 'Red Clown',      body: [12, 18], pivot: [11, 10, 9, 8, 7, 6, 5, 4], faces: -1 },
    { id: '3030', name: 'Blue Tanger',    body: [0, 0],  part: [[6, 2], [7, 2], [8, 2]],     faces: -1 },
    { id: '3040', name: 'Trigger Fish',   body: [0, 2],  part: [[3, 23], [4, 23]],           faces: -1 },
    { id: '3050', name: 'Pink Squirrel',  body: [0, 5],                                      faces: -1 },
    { id: '3070', name: 'Butterfly Fish', body: [0, 3],
      part: [[4, 37], [5, 36], [6, 35], [7, 37], [9, 38]],                                   faces: 1 },
    { id: '3080', name: 'Emperor',        body: [0, 0],  part: [[1, 9], [2, 9], [3, 9]],     faces: -1 },
    { id: '3060', name: 'Jellyfish',      body: [0, 4],                                      faces: 0 },
    { id: '3110', name: 'Sardines',       body: [0, 4],                                      faces: -1 }
  ];

  var COUNTS = {
    'solo': 1, 'study group': 3, 'class': 7, 'school': 14, 'university': 25
  };

  var FLOOR = '5010', ROCKS = '5000', CORAL = '5020', BUBBLES = '7000';
  var ANEMONES = ['6000', '6010', '6020', '6030'];

  var SWIM = 3.5;              // broadside cycle, frames per second
  var PIVOT = 14;              // how fast it goes through the turn
  var ANEMONE = 3;             // anemone open/close, frames per second
  var BUBBLE = 6;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function FishPro(art) {
    this.art = art;
    this.species = [];
    var i;
    for (i = 0; i < SPECIES.length; i += 1) {
      var spec = SPECIES[i];
      var seq = art.sequence(spec.id);
      if (!seq) { continue; }
      spec.pivot = spec.pivot || [];
      // How big the fish is once its piece is on, which is what the edge and
      // depth tests want rather than the sequence's nominal size.
      var w = seq.width, h = seq.height;
      if (spec.part) {
        var pw = 0, ph = 0;
        spec.part.forEach(function (p) {
          var f = seq.frames[p[0]];
          pw = Math.max(pw, f.w);
          ph = Math.max(ph, p[1] + f.h);
        });
        w = seq.frames[spec.body[0]].w + pw;
        h = Math.max(h, ph);
      }
      this.species.push({ spec: spec, seq: seq, width: w, height: h });
    }
    this.floor = art.sequence(FLOOR);
    this.rocks = art.sequence(ROCKS);
    this.coral = art.sequence(CORAL);
    this.bubbles = art.sequence(BUBBLES);
    this.anemones = [];
    for (i = 0; i < ANEMONES.length; i += 1) {
      var a = art.sequence(ANEMONES[i]);
      if (a) { this.anemones.push(a); }
    }

    this.chosen = null;        // null means every species, as "Select Fish..."
    this.count = COUNTS.school;
    this.seaFloor = 'animated';
    this.fish = [];
    this.props = [];
    this.streams = [];
  }

  FishPro.prototype.pool = function () {
    var chosen = this.chosen;
    if (!chosen) { return this.species; }
    var out = this.species.filter(function (s) {
      return chosen.indexOf(s.spec.name.toLowerCase()) >= 0;
    });
    return out.length ? out : this.species;
  };

  FishPro.prototype.floorHeight = function () {
    return this.seaFloor === 'none' || !this.floor ? 0 : this.floor.height;
  };

  /* Depth is the one thing the artwork asks for that the resources don't
     record: the species are drawn in perspective and turn through the viewer's
     plane, so they are set back in the tank at a size to match. */
  FishPro.prototype.spawn = function (w, h, anywhere) {
    var s = pick(this.pool());
    var depth = Math.random();
    var scale = 0.55 + depth * 0.45;
    var right = Math.random() < 0.5;
    var deep = h - this.floorHeight();
    var high = s.height * scale * 0.6;
    return {
      s: s,
      depth: depth,
      scale: scale,
      right: right,
      speed: (18 + depth * 34) * (right ? 1 : -1),
      x: anywhere ? rand(0, w) : (right ? -s.width : w + s.width),
      y: rand(high, Math.max(high + 1, deep - high * 0.4)),
      drift: rand(-7, 7),
      cycle: rand(0, 8),
      turn: 0,                  // 0 while cruising, else how far along the pivot
      turning: 0                // +1 out, -1 back
    };
  };

  FishPro.prototype.reset = function (w, h) {
    var i;
    this.fish = [];
    for (i = 0; i < this.count; i += 1) { this.fish.push(this.spawn(w, h, true)); }
    this.sort();

    // Scenery is rooted, so it is placed once and only redrawn.
    this.props = [];
    this.streams = [];
    if (this.seaFloor === 'none') { return; }

    var floorY = h - this.floorHeight() * 0.55;
    var n = Math.max(2, Math.round(w / 210));
    for (i = 0; i < n; i += 1) {
      var kind = Math.random();
      var seq, frame;
      if (kind < 0.35 && this.rocks) { seq = this.rocks; frame = Math.floor(rand(0, seq.count)); }
      else if (this.coral) { seq = this.coral; frame = Math.floor(rand(0, this.coral.count)); }
      else { continue; }
      this.props.push({
        seq: seq, frame: frame, still: true,
        x: rand(0, w), y: floorY - seq.height * 0.2
      });
    }
    for (i = 0; i < this.anemones.length; i += 1) {
      this.props.push({
        seq: this.anemones[i], frame: rand(0, 6), still: false,
        x: rand(0, w), y: floorY - this.anemones[i].height * 0.15
      });
    }
    if (this.bubbles && this.seaFloor === 'animated') {
      for (i = 0; i < 2; i += 1) {
        this.streams.push({ x: rand(0, w), y: h, frame: rand(0, 6), rise: rand(0, 1) });
      }
    }
  };

  /* Back of the tank first, so the near fish pass in front. */
  FishPro.prototype.sort = function () {
    this.fish.sort(function (a, b) { return a.depth - b.depth; });
  };

  /** The Caps Lock key, which the module's own description tells you to press. */
  FishPro.prototype.scatter = function () {
    for (var i = 0; i < this.fish.length; i += 1) {
      var f = this.fish[i];
      f.speed *= 3.4;
      f.drift = rand(-40, 40);
    }
  };

  FishPro.prototype.step = function (dt, w, h) {
    var i, f, spec;
    for (i = 0; i < this.fish.length; i += 1) {
      f = this.fish[i];
      spec = f.s.spec;

      if (f.turning) {
        f.turn += PIVOT * dt * f.turning;
        if (f.turn >= spec.pivot.length) {
          // Edge-on: this is where the mirror happens and the pivot runs back.
          f.turn = spec.pivot.length - 0.001;
          f.turning = -1;
          f.right = !f.right;
          f.speed = -f.speed;
        } else if (f.turn <= 0) {
          f.turn = 0;
          f.turning = 0;
        }
      } else {
        f.x += f.speed * dt;
        f.y += f.drift * dt;
        f.cycle += SWIM * dt;
        if (Math.abs(f.speed) > 90) { f.speed *= Math.pow(0.4, dt); }   // after a scatter
      }

      var high = f.s.height * f.scale * 0.55;
      var deep = h - this.floorHeight() - high * 0.3;
      if (f.y < high || f.y > deep) { f.drift = -f.drift; f.y = Math.min(Math.max(f.y, high), deep); }

      // Turn round before swimming off, if the species has the art for it.
      var pad = f.s.width * f.scale;
      var out = f.speed > 0 ? f.x > w - pad * 0.4 : f.x < pad * 0.4;
      if (out && !f.turning) {
        if (spec.pivot.length) { f.turning = 1; }
        else { f.speed = -f.speed; f.right = !f.right; }
      }
      if (f.x < -pad * 2 || f.x > w + pad * 2) { this.fish[i] = this.spawn(w, h, false); }
    }

    for (i = 0; i < this.props.length; i += 1) {
      if (!this.props[i].still && this.seaFloor === 'animated') {
        this.props[i].frame += ANEMONE * dt;
      }
    }
    for (i = 0; i < this.streams.length; i += 1) {
      this.streams[i].frame += BUBBLE * dt;
    }
  };

  /* An anemone opens and closes rather than looping, so its six frames are
     played there and back. */
  function pingpong(frame, count) {
    var span = (count - 1) * 2 || 1;
    var t = Math.floor(frame) % span;
    return t < count ? t : span - t;
  }

  /* The whole fish, body plus its piece if it has one, centred on the fish and
     mirrored as a unit so the piece stays on the leading end. */
  FishPro.prototype.drawFish = function (ctx, f) {
    var spec = f.s.spec, seq = f.s.seq;
    var body, part = null;

    if (f.turning) {
      body = seq.frames[spec.pivot[Math.min(spec.pivot.length - 1, Math.floor(f.turn))]];
    } else {
      var lo = spec.body[0], hi = spec.body[1];
      body = seq.frames[lo + (hi > lo ? Math.floor(f.cycle) % (hi - lo + 1) : 0)];
      if (spec.part) { part = spec.part[Math.floor(f.cycle) % spec.part.length]; }
    }

    var pf = part ? seq.frames[part[0]] : null;
    var dy = part ? part[1] : 0;
    var tw = body.w + (pf ? pf.w : 0);
    var th = Math.max(body.h, pf ? dy + pf.h : 0);
    // faces 0 is a creature with no left or right, so it is never mirrored.
    var flip = spec.faces !== 0 && (f.right ? spec.faces < 0 : spec.faces > 0);

    ctx.save();
    ctx.translate(Math.round(f.x), Math.round(f.y));
    if (flip) { ctx.scale(-1, 1); }
    ctx.scale(f.scale, f.scale);
    if (pf) {
      ctx.drawImage(seq.image, pf.x, pf.y, pf.w, pf.h,
                    Math.round(-tw / 2), Math.round(-th / 2 + dy), pf.w, pf.h);
    }
    ctx.drawImage(seq.image, body.x, body.y, body.w, body.h,
                  Math.round(-tw / 2 + (pf ? pf.w : 0)), Math.round(-th / 2), body.w, body.h);
    ctx.restore();
  };

  FishPro.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    var i, x, p;
    if (this.seaFloor !== 'none' && this.floor) {
      for (x = 0; x < w; x += this.floor.width) {
        this.floor.draw(ctx, 0, x + this.floor.width / 2, h - this.floor.height / 2);
      }
    }
    for (i = 0; i < this.props.length; i += 1) {
      p = this.props[i];
      p.seq.draw(ctx, p.still ? p.frame : pingpong(p.frame, p.seq.count), p.x, p.y);
    }
    for (i = 0; i < this.fish.length; i += 1) { this.drawFish(ctx, this.fish[i]); }
    for (i = 0; i < this.streams.length; i += 1) {
      p = this.streams[i];
      this.bubbles.draw(ctx, Math.floor(p.frame), p.x,
                        h - this.floorHeight() * 0.4 - this.bubbles.height / 2);
    }
  };

  /* ------------------------------------------------------------ element */

  function FishProElement() { return Reflect.construct(HTMLElement, [], FishProElement); }
  FishProElement.prototype = Object.create(HTMLElement.prototype);
  FishProElement.prototype.constructor = FishProElement;
  Object.setPrototypeOf(FishProElement, HTMLElement);

  FishProElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/fishpro';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new FishPro(art);
      var fish = (AfterDark.setting(self, 'fish') || 'school').toLowerCase();
      sim.count = COUNTS[fish] || parseInt(fish, 10) || COUNTS.school;
      var floor = AfterDark.setting(self, 'sea-floor');
      if (floor !== null) { sim.seaFloor = floor.toLowerCase(); }
      var only = AfterDark.setting(self, 'select-fish');
      if (only) {
        sim.chosen = only.toLowerCase().split(',').map(function (s) { return s.trim(); });
      }

      var screen = new AfterDark.Screen(self);
      self._screen = screen;
      self.sim = sim;
      screen.onresize = function (w, h) { sim.reset(w, h); };
      sim.reset(screen.width, screen.height);

      // "Just for fun, hit the Caps Lock key and watch the fish scatter!"
      self._onKey = function (e) {
        if (e.key === 'CapsLock' ||
            (e.getModifierState && e.getModifierState('CapsLock'))) {
          sim.scatter();
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

  FishProElement.prototype.disconnectedCallback = function () {
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-fishpro', FishProElement);
  window.AfterDarkFishPro = FishPro;
}());
