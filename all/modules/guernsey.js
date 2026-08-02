/**
 * guernsey.js - Guernsey Madness, on the module's own artwork.
 *
 * GUERNSEY.AD, from After Dark 4.0. Its own description:
 *
 *   "Guernsey Madness. It is a warm August evening and the sun starts to dip
 *    below a flat horizon. A warm wind travels across the plains and stirs a
 *    gentle rhythm from the prairie grass. You step out from behind the grange
 *    hall with a large mug of cider in hand. Leaning against the porch railing
 *    you take a sip and watch the colors of the herd in the twilight.
 *    'Flavor' determines the color of the cows. 'Tutti-Frutti' shows a random
 *    display of them."
 *
 * The settings are its own, out of TYPE_1000: Flavor = Vanilla / Chocolate /
 * Strawberry / Blueberry / Grape / Banana / Lemon-Lime / Rainbow Splash /
 * Bubble Gum / Cinnamon / Mint / Tutti-Frutti, and Music, which does nothing
 * here because there is no sound.
 *
 * This one looked broken for a long time. Its sprites decode to grey blobs,
 * which reads like a palette that failed to load - but both the sequence CTAB
 * and the module's own PAL are greyscale ramps, deliberately, and a capture of
 * the real module under tools/adrun.sh shows the same blobs in yellow. The
 * artwork is a tinting mask, and Flavor is the tint. So nothing was wrong with
 * the decode: a Guernsey Madness cow really is an impressionistic smear, and
 * the module's whole trick is what colour it is.
 *
 * Tinting is done once per sheet at load: draw the sheet, multiply the flavour
 * over it, then put the original alpha back with destination-in. Sequences
 * then draw from the tinted copy. Where there is no real canvas to do that
 * with - a test harness, say - they are left grey rather than skipped.
 *
 * Artwork, from tools/adweb.py. Nine cows, each a run of frames that grows
 * from nothing to the full animal, so a cow fades up, stands about and fades
 * back down. 24009 decodes to a single pixel and is left out.
 *
 *   <after-dark-guernsey flavor="tutti-frutti">
 */
(function () {
  'use strict';

  var HERD = ['24000', '24001', '24002', '24003', '24004',
              '24005', '24006', '24007', '24008'];

  /* The module's own flavours. The two that are not a single colour are the
     two whose names say so: Tutti-Frutti picks one per cow at random, which is
     what the description says it does, and Rainbow Splash runs through them in
     order so the herd comes out as a spectrum. */
  var FLAVORS = {
    'vanilla': '#f6efd2',
    'chocolate': '#7b4a26',
    'strawberry': '#f2879f',
    'blueberry': '#5a74c8',
    'grape': '#8f5ec0',
    'banana': '#f2d24b',
    'lemon-lime': '#b6d94c',
    'bubble gum': '#ff86c8',
    'cinnamon': '#c8642e',
    'mint': '#9fe0bd',
    'rainbow splash': null,
    'tutti-frutti': null
  };
  var MIXED = { 'rainbow splash': 'cycle', 'tutti-frutti': 'random' };
  var SOLID = Object.keys(FLAVORS).filter(function (k) { return FLAVORS[k]; });

  var GROW = 7;                // frames per second going up, and coming down
  var STAND = [4, 12];         // seconds a cow stands about once it is up

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /** A greyscale sheet in one colour, with its alpha intact. */
  function tint(image, colour) {
    var off = document.createElement('canvas');
    // A stub canvas is no use here; leave the artwork grey rather than ruin it.
    if (!off || typeof off.getContext !== 'function' ||
        typeof off.toDataURL !== 'function') { return null; }
    off.width = image.width;
    off.height = image.height;
    var c = off.getContext('2d');
    if (!c) { return null; }
    c.drawImage(image, 0, 0);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = colour;
    c.fillRect(0, 0, off.width, off.height);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(image, 0, 0);
    return off;
  }

  function Guernsey(art) {
    this.art = art;
    this.flavor = 'tutti-frutti';
    this.cows = [];
    this.count = 7;
    this.tinted = {};          // colour -> {seq id -> image}
  }

  /** The sequence, in the colour asked for, tinting it the first time. */
  Guernsey.prototype.shade = function (id, colour) {
    var seq = this.art.sequence(id);
    if (!seq || !colour) { return seq; }
    if (!this.tinted[colour]) { this.tinted[colour] = {}; }
    if (this.tinted[colour][id] === undefined) {
      this.tinted[colour][id] = tint(seq.image, colour);
    }
    var image = this.tinted[colour][id];
    if (!image) { return seq; }
    // Same frames, different sheet.
    var copy = Object.create(seq);
    copy.image = image;
    return copy;
  };

  Guernsey.prototype.colourFor = function () {
    var named = FLAVORS[this.flavor];
    if (named) { return named; }
    if (MIXED[this.flavor] === 'cycle') {
      this.next = ((this.next || 0) + 1) % SOLID.length;
      return FLAVORS[SOLID[this.next]];
    }
    return FLAVORS[pick(SOLID)];
  };

  Guernsey.prototype.spawn = function (w, h) {
    var id = pick(HERD);
    var seq = this.art.sequence(id);
    if (!seq) { return null; }
    return {
      id: id,
      colour: this.colourFor(),
      x: rand(seq.width * 0.5, Math.max(seq.width * 0.5 + 1, w - seq.width * 0.5)),
      y: rand(seq.height * 0.5, Math.max(seq.height * 0.5 + 1, h - seq.height * 0.5)),
      frame: 0,
      state: 'up',
      hold: rand(STAND[0], STAND[1])
    };
  };

  Guernsey.prototype.reset = function (w, h) {
    this.cows = [];
    for (var i = 0; i < this.count; i += 1) {
      var cow = this.spawn(w, h);
      if (!cow) { continue; }
      // Stagger them, or the whole herd breathes in time.
      cow.frame = rand(0, this.art.sequence(cow.id).count);
      cow.hold = rand(0, STAND[1]);
      this.cows.push(cow);
    }
  };

  Guernsey.prototype.step = function (dt, w, h) {
    for (var i = 0; i < this.cows.length; i += 1) {
      var cow = this.cows[i];
      var seq = this.art.sequence(cow.id);
      if (cow.state === 'up') {
        cow.frame += GROW * dt;
        if (cow.frame >= seq.count - 1) { cow.frame = seq.count - 1; cow.state = 'stand'; }
      } else if (cow.state === 'stand') {
        cow.hold -= dt;
        if (cow.hold <= 0) { cow.state = 'down'; }
      } else {
        cow.frame -= GROW * dt;
        if (cow.frame <= 0) {
          var fresh = this.spawn(w, h);
          if (fresh) { this.cows[i] = fresh; }
        }
      }
    }
  };

  Guernsey.prototype.draw = function (ctx, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < this.cows.length; i += 1) {
      var cow = this.cows[i];
      var seq = this.shade(cow.id, cow.colour);
      if (seq) { seq.draw(ctx, Math.max(0, Math.floor(cow.frame)), cow.x, cow.y); }
    }
  };

  /* ------------------------------------------------------------ element */

  function GuernseyElement() { return Reflect.construct(HTMLElement, [], GuernseyElement); }
  GuernseyElement.prototype = Object.create(HTMLElement.prototype);
  GuernseyElement.prototype.constructor = GuernseyElement;
  Object.setPrototypeOf(GuernseyElement, HTMLElement);

  GuernseyElement.prototype.connectedCallback = function () {
    if (this._screen) { return; }
    var self = this;
    var base = this.getAttribute('art') || 'art/guernsey';
    this.style.display = this.style.display || 'block';
    this.style.background = '#000';

    window.AfterDark.load(base).then(function (art) {
      var sim = new Guernsey(art);
      var f = (AfterDark.setting(self, 'flavor') || 'tutti-frutti').toLowerCase();
      if (FLAVORS[f] !== undefined) { sim.flavor = f; }
      var herd = AfterDark.setting(self, 'herd');
      if (herd) { sim.count = parseInt(herd, 10) || sim.count; }

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

  GuernseyElement.prototype.disconnectedCallback = function () {
    if (this._screen) { this._screen.stop(); this._screen = null; }
  };

  customElements.define('after-dark-guernsey', GuernseyElement);
  window.AfterDarkGuernsey = Guernsey;
}());
