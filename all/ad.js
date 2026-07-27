/**
 * ad.js - plays artwork ripped straight out of the original After Dark modules.
 *
 * The modules store their art two different ways and there is a tool for each.
 * tools/adweb.py unpacks the RLE animation in a 4.0 module into numbered PNG
 * strips; tools/adclassic.py unpacks the plain DIBs in a 3.x one into named
 * PNGs. Both write art/<module>/index.json, and this reads either:
 *
 *   AfterDark.load('art/marbles').then(function (art) {
 *     art.sequence(8000).draw(ctx, frameIndex, x, y);     // 4.0, animated
 *   });
 *
 *   AfterDark.load('art/marbles2').then(function (art) {
 *     art.bitmap('marbles').drawCell(ctx, 3, 16, x, y);   // 3.x, a still strip
 *   });
 *
 * Everything a particular screensaver actually *does* lives under modules/.
 */
(function (global) {
  'use strict';

  function Sequence(id, meta, image) {
    this.id = id;
    this.image = image;
    this.frames = meta.frames;
    this.count = meta.count;
    this.width = meta.w;
    this.height = meta.h;
  }

  /* Frames carry their own tight bounding box, so centre each one on the
     sequence's nominal size rather than assuming they all match. */
  Sequence.prototype.draw = function (ctx, index, cx, cy) {
    var f = this.frames[((index % this.count) + this.count) % this.count];
    ctx.drawImage(this.image, f.x, f.y, f.w, f.h,
                  Math.round(cx - f.w / 2), Math.round(cy - f.h / 2), f.w, f.h);
  };

  /* A 3.x module's artwork is a single unanimated DIB. Some are one picture,
     some are a horizontal strip of equal cells - the ten marbles live in one
     160x16 bitmap - so drawing takes an optional cell width. */
  function Bitmap(name, meta, image) {
    this.name = name;
    this.image = image;
    this.width = meta.w;
    this.height = meta.h;
  }

  /* Several modules draw their creatures facing one way only and mirror them
     for the other, so drawing takes an optional flip. */
  Bitmap.prototype.draw = function (ctx, cx, cy, flip) {
    var x = Math.round(cx - this.width / 2);
    var y = Math.round(cy - this.height / 2);
    if (!flip) {
      ctx.drawImage(this.image, x, y);
      return;
    }
    ctx.save();
    ctx.translate(Math.round(cx), 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.image, Math.round(-this.width / 2), y);
    ctx.restore();
  };

  Bitmap.prototype.cells = function (cellW) {
    return Math.max(1, Math.floor(this.width / cellW));
  };

  Bitmap.prototype.drawCell = function (ctx, index, cellW, cx, cy) {
    var n = this.cells(cellW);
    var i = ((index % n) + n) % n;
    ctx.drawImage(this.image, i * cellW, 0, cellW, this.height,
                  Math.round(cx - cellW / 2), Math.round(cy - this.height / 2),
                  cellW, this.height);
  };

  function Art(base, manifest, images) {
    this.base = base;
    this.module = manifest.module;
    this.format = manifest.format || 'rle';
    this.sequences = {};
    this.bitmaps = {};
    var name;
    for (name in manifest.sequences || {}) {
      this.sequences[name] = new Sequence(name, manifest.sequences[name], images[name]);
    }
    for (name in manifest.bitmaps || {}) {
      this.bitmaps[name] = new Bitmap(name, manifest.bitmaps[name], images[name]);
    }
  }

  Art.prototype.sequence = function (id) {
    return this.sequences[String(id)] || null;
  };

  Art.prototype.bitmap = function (name) {
    return this.bitmaps[String(name)] || null;
  };

  /** Sequence ids in a range, e.g. ids(8000, 8009) for the ten marble types. */
  Art.prototype.ids = function (from, to) {
    var out = [];
    for (var id in this.sequences) {
      var n = Number(id);
      if (n >= from && n <= to) { out.push(n); }
    }
    return out.sort(function (a, b) { return a - b; });
  };

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('could not load ' + src)); };
      im.src = src;
    });
  }

  function load(base) {
    base = base.replace(/\/$/, '');
    return fetch(base + '/index.json').then(function (r) {
      if (!r.ok) { throw new Error('no manifest at ' + base); }
      return r.json();
    }).then(function (manifest) {
      var parts = manifest.sequences || manifest.bitmaps || {};
      var ids = Object.keys(parts);
      return Promise.all(ids.map(function (id) {
        return loadImage(base + '/' + (parts[id].file || id + '.png'));
      })).then(function (loaded) {
        var images = {};
        ids.forEach(function (id, i) { images[id] = loaded[i]; });
        return new Art(base, manifest, images);
      });
    });
  }

  /**
   * Canvas that fills its host element, keeps up with device pixel ratio and
   * calls back once per frame with the elapsed seconds.
   */
  function Screen(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    host.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.width = 0;
    this.height = 0;
    this._raf = 0;
    this.resize();

    var self = this;
    this._onResize = function () { self.resize(); };
    global.addEventListener('resize', this._onResize);
  }

  Screen.prototype.resize = function () {
    var dpr = global.devicePixelRatio || 1;
    var r = this.host.getBoundingClientRect();
    this.width = Math.max(1, Math.round(r.width));
    this.height = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    if (this.onresize) { this.onresize(this.width, this.height); }
  };

  Screen.prototype.run = function (step) {
    var self = this;
    var last = 0;
    function tick(now) {
      var dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      step(dt, self.ctx, self.width, self.height);
      self._raf = global.requestAnimationFrame(tick);
    }
    this._raf = global.requestAnimationFrame(tick);
  };

  Screen.prototype.stop = function () {
    if (this._raf) { global.cancelAnimationFrame(this._raf); this._raf = 0; }
    global.removeEventListener('resize', this._onResize);
  };

  global.AfterDark = { load: load, Screen: Screen, Sequence: Sequence, Bitmap: Bitmap };
}(window));
