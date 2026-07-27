/**
 * <marble-jar> — a data-driven "Marbles" screensaver, in the spirit of the
 * 1990s After Dark module of the same name.
 *
 * Instead of animating on a timer, marbles drop when something *pings* the jar.
 * Each ping drops one marble carrying an "initial" (a short monogram) and an
 * optional colour; marbles fall under gravity and settle into a growing pile.
 * You tell the jar the *total* number of marbles you expect, and it sizes each
 * marble so a full set fills the screen.
 *
 * No dependencies. Drop this file on a page and add <marble-jar total="120">.
 *
 * ── Ping it four ways ──────────────────────────────────────────────────────
 *   1. JS API:        jar.drop({ initial: 'AB', color: '#e23b4d' })
 *   2. DOM event:     jar.dispatchEvent(new CustomEvent('marble:drop',
 *                        { detail: { initial: 'AB' } }))
 *   3. Cross-frame:   otherWindow.postMessage(
 *                        { type: 'marble-jar:drop', initial: 'AB' }, '*')
 *   4. Helper:        MarbleJar.drop({ initial: 'AB' })   // → first jar on page
 *
 * ── Attributes / properties ────────────────────────────────────────────────
 *   total        expected final count; drives marble size (default 100)
 *   gravity      fall acceleration, px/s^2 in CSS pixels (default 2600)
 *   restitution  bounciness 0..1 (default 0.18)
 *   background   canvas background colour (default '#0a0a0f')
 *   palette      comma-separated colours used when a drop omits `color`
 *
 * ── Events emitted ─────────────────────────────────────────────────────────
 *   marble:landed  detail: { marble, count, total }  — a marble came to rest
 *   marble:full    detail: { count, total }          — count reached total
 */
(function () {
  'use strict';

  var DEFAULT_PALETTE = [
    '#e23b4d', '#f2a03d', '#ffd23f', '#3fb96b',
    '#37b6c4', '#3f7fe2', '#8a63d2', '#e267c1'
  ];

  // Deterministic colour from a label so the same initial keeps its colour.
  function hashPick(str, list) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return list[h % list.length];
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function shade(hex, amt) {
    // amt in [-1,1]; positive lightens, negative darkens.
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16),
        g = parseInt(c.slice(2, 4), 16),
        b = parseInt(c.slice(4, 6), 16);
    var t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round(r + (t - r) * p);
    g = Math.round(g + (t - g) * p);
    b = Math.round(b + (t - b) * p);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function readableInk(hex) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16),
        g = parseInt(c.slice(2, 4), 16),
        b = parseInt(c.slice(4, 6), 16);
    // Perceived luminance.
    var l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return l > 0.6 ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.92)';
  }

  class MarbleJar extends HTMLElement {
    static get observedAttributes() {
      return ['total', 'gravity', 'restitution', 'background', 'palette'];
    }

    constructor() {
      super();
      this._marbles = [];
      this._total = 100;
      this._gravity = 2600;
      this._restitution = 0.18;
      this._friction = 0.86;     // tangential velocity kept after a contact
      this._background = '#0a0a0f';
      this._palette = DEFAULT_PALETTE.slice();
      this._w = 0; this._h = 0; this._dpr = 1;
      this._acc = 0; this._last = 0;
      this._raf = 0;
      this._full = false;
      this._onDropEvent = this._onDropEvent.bind(this);
      this._onMessage = this._onMessage.bind(this);
      this._frame = this._frame.bind(this);

      var root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' +
        ':host{display:block;position:relative;width:100%;height:100%;' +
        'overflow:hidden;contain:strict}' +
        'canvas{display:block;width:100%;height:100%}' +
        '</style><canvas></canvas>';
      this._canvas = root.querySelector('canvas');
      this._ctx = this._canvas.getContext('2d');
    }

    connectedCallback() {
      // Reflect attributes present at connect time.
      MarbleJar.observedAttributes.forEach(function (a) {
        if (this.hasAttribute(a)) this.attributeChangedCallback(a, null, this.getAttribute(a));
      }, this);

      this.addEventListener('marble:drop', this._onDropEvent);
      window.addEventListener('message', this._onMessage);

      this._ro = new ResizeObserver(this._resize.bind(this));
      this._ro.observe(this);
      this._resize();

      this._last = performance.now();
      this._raf = requestAnimationFrame(this._frame);

      if (!MarbleJar._jars) MarbleJar._jars = [];
      MarbleJar._jars.push(this);
    }

    disconnectedCallback() {
      this.removeEventListener('marble:drop', this._onDropEvent);
      window.removeEventListener('message', this._onMessage);
      if (this._ro) this._ro.disconnect();
      cancelAnimationFrame(this._raf);
      if (MarbleJar._jars) {
        var i = MarbleJar._jars.indexOf(this);
        if (i > -1) MarbleJar._jars.splice(i, 1);
      }
    }

    attributeChangedCallback(name, _old, val) {
      switch (name) {
        case 'total':       this.total = parseInt(val, 10); break;
        case 'gravity':     this._gravity = parseFloat(val) || this._gravity; break;
        case 'restitution': this._restitution = clamp(parseFloat(val) || 0, 0, 1); break;
        case 'background':  this._background = val || this._background; break;
        case 'palette':
          if (val) this._palette = val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          break;
      }
    }

    // ── Public API ──────────────────────────────────────────────────────────
    get total() { return this._total; }
    set total(n) {
      n = parseInt(n, 10);
      this._total = (isFinite(n) && n > 0) ? n : this._total;
      this._full = this._marbles.length >= this._total;
    }
    get count() { return this._marbles.length; }

    /** Drop one marble. This is "the ping". */
    drop(opts) {
      opts = opts || {};
      if (typeof opts.total === 'number') this.total = opts.total;

      var r = this._targetRadius();
      var initial = (opts.initial == null ? '' : String(opts.initial)).slice(0, 3);
      var color = opts.color || (initial ? hashPick(initial, this._palette)
                                         : this._palette[this._marbles.length % this._palette.length]);
      // Start above the top edge, roughly centred, with a little spread + spin.
      var x = (typeof opts.x === 'number')
        ? clamp(opts.x, r, Math.max(r, this._w - r))
        : this._w / 2 + (Math.random() - 0.5) * Math.min(this._w * 0.5, 12 * r);
      x = clamp(x, r, Math.max(r, this._w - r));

      var m = {
        x: x, y: -r - Math.random() * r,
        vx: (Math.random() - 0.5) * 120,
        vy: 0,
        r: r, color: color, initial: initial,
        ink: readableInk(color),
        rest: 0, // frames spent nearly-still, used for a subtle "landed" event
        landed: false
      };
      this._marbles.push(m);
      if (!this._full && this._marbles.length >= this._total) {
        this._full = true;
        this.dispatchEvent(new CustomEvent('marble:full', {
          detail: { count: this._marbles.length, total: this._total }
        }));
      }
      return m;
    }

    /** Empty the jar. */
    reset() {
      this._marbles.length = 0;
      this._full = false;
    }

    // ── Internals ────────────────────────────────────────────────────────────
    _onDropEvent(e) { this.drop(e.detail || {}); }

    _onMessage(e) {
      var d = e.data;
      if (!d || d.type !== 'marble-jar:drop') return;
      // Optional targeting by element id: { target: 'myJar' }.
      if (d.target && d.target !== this.id) return;
      this.drop(d);
    }

    _targetRadius() {
      // Choose r so `total` marbles at packing fraction φ fill the area.
      // N·πr² = φ·W·H  ⇒  r = sqrt(φ·W·H / (N·π))
      var phi = 0.82;
      var area = Math.max(1, this._w * this._h);
      var r = Math.sqrt((phi * area) / (Math.max(1, this._total) * Math.PI));
      return clamp(r, 6, Math.min(this._w, this._h) / 4 || 6);
    }

    _resize() {
      var rect = this.getBoundingClientRect();
      this._w = Math.max(1, rect.width);
      this._h = Math.max(1, rect.height);
      this._dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._canvas.width = Math.round(this._w * this._dpr);
      this._canvas.height = Math.round(this._h * this._dpr);
      this._ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      // Keep settled marbles inside the new bounds.
      for (var i = 0; i < this._marbles.length; i++) {
        var m = this._marbles[i];
        m.x = clamp(m.x, m.r, Math.max(m.r, this._w - m.r));
        if (m.y > this._h - m.r) m.y = this._h - m.r;
      }
    }

    _frame(now) {
      this._raf = requestAnimationFrame(this._frame);
      var dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.05) dt = 0.05;          // guard against tab-switch jumps
      this._acc += dt;
      var step = 1 / 120;                // fixed timestep for stable stacking
      var iters = 0;
      while (this._acc >= step && iters < 8) { this._physics(step); this._acc -= step; iters++; }
      this._render();
    }

    _physics(dt) {
      var ms = this._marbles, n = ms.length, i, m;
      if (!n) return;
      var W = this._w, H = this._h, g = this._gravity, rest = this._restitution, fr = this._friction;

      // Integrate + walls.
      for (i = 0; i < n; i++) {
        m = ms[i];
        m.vy += g * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;

        if (m.x < m.r) { m.x = m.r; m.vx = -m.vx * rest; }
        else if (m.x > W - m.r) { m.x = W - m.r; m.vx = -m.vx * rest; }
        if (m.y > H - m.r) { m.y = H - m.r; m.vy = -m.vy * rest; m.vx *= fr; }
      }

      // Broad phase: uniform spatial-hash grid so this stays ~O(n).
      var cell = 0;
      for (i = 0; i < n; i++) if (ms[i].r * 2 > cell) cell = ms[i].r * 2;
      cell = Math.max(cell, 1);
      var cols = Math.max(1, Math.ceil(W / cell));
      var grid = this._grid || (this._grid = {});
      for (var k in grid) grid[k].length = 0;
      for (i = 0; i < n; i++) {
        m = ms[i];
        m._cx = Math.floor(m.x / cell);
        m._cy = Math.floor(m.y / cell);
        var key = m._cx + cols * m._cy;
        (grid[key] || (grid[key] = [])).push(i);
      }

      // Narrow phase, a few relaxation passes for firmer piles.
      for (var pass = 0; pass < 3; pass++) {
        for (i = 0; i < n; i++) {
          m = ms[i];
          for (var gx = -1; gx <= 1; gx++) {
            for (var gy = -1; gy <= 1; gy++) {
              var cellArr = grid[(m._cx + gx) + cols * (m._cy + gy)];
              if (!cellArr) continue;
              for (var c = 0; c < cellArr.length; c++) {
                var j = cellArr[c];
                if (j <= i) continue;
                this._resolve(m, ms[j], rest);
              }
            }
          }
        }
      }

      // Sleep detection for the landed event (cheap, non-authoritative).
      for (i = 0; i < n; i++) {
        m = ms[i];
        if (Math.abs(m.vx) < 4 && Math.abs(m.vy) < 6) {
          if (!m.landed && ++m.rest > 6) {
            m.landed = true;
            this.dispatchEvent(new CustomEvent('marble:landed', {
              detail: { marble: m, count: n, total: this._total }
            }));
          }
        } else { m.rest = 0; m.landed = false; }
      }
    }

    _resolve(a, b, rest) {
      var dx = b.x - a.x, dy = b.y - a.y;
      var dist = Math.hypot(dx, dy) || 0.0001;
      var min = a.r + b.r;
      if (dist >= min) return;
      var nx = dx / dist, ny = dy / dist;
      var overlap = min - dist;

      // Positional correction, split evenly.
      var push = overlap / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;

      // Impulse along the normal (equal mass).
      var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      var vn = rvx * nx + rvy * ny;
      if (vn > 0) return;                 // already separating
      var jimp = -(1 + rest) * vn / 2;
      var ix = jimp * nx, iy = jimp * ny;
      a.vx -= ix; a.vy -= iy;
      b.vx += ix; b.vy += iy;
    }

    _render() {
      var ctx = this._ctx, ms = this._marbles;
      ctx.fillStyle = this._background;
      ctx.fillRect(0, 0, this._w, this._h);

      for (var i = 0; i < ms.length; i++) {
        var m = ms[i], r = m.r;
        var grd = ctx.createRadialGradient(
          m.x - r * 0.35, m.y - r * 0.38, r * 0.1, m.x, m.y, r);
        grd.addColorStop(0, shade(m.color, 0.55));
        grd.addColorStop(0.45, m.color);
        grd.addColorStop(1, shade(m.color, -0.45));
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Glassy specular highlight.
        ctx.beginPath();
        ctx.ellipse(m.x - r * 0.32, m.y - r * 0.36, r * 0.28, r * 0.18,
          -0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();

        // Monogram.
        if (m.initial && r > 9) {
          ctx.fillStyle = m.ink;
          ctx.font = '600 ' + Math.round(r * (m.initial.length > 2 ? 0.7 : 0.95)) +
            'px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(m.initial, m.x, m.y + r * 0.04);
        }
      }
    }
  }

  // Static helper: ping the first jar on the page.
  MarbleJar.drop = function (opts) {
    var jar = (MarbleJar._jars && MarbleJar._jars[0]) || document.querySelector('marble-jar');
    if (jar) return jar.drop(opts);
  };

  if (!customElements.get('marble-jar')) {
    customElements.define('marble-jar', MarbleJar);
  }
  window.MarbleJar = MarbleJar;
})();
