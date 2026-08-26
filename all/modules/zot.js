/**
 * zot.js - Zot!, drawn the way the original module drew itself.
 *
 * ZOT.AD ships no artwork. Its own description:
 *
 *   "ZOT! (tm)
 *    Realistic lightning designed by Jim Stewart.
 *    During the period when this module was being developed, the skies were
 *    filled with thunder and lightning each night."
 *
 * The settings are its own, out of TYPE_1000: Forkiness = Few / Forky /
 * Max Forky!, Kinkiness = No Kinks / Kinky / Deviant, and How Often =
 * Rarely / Sometimes / Often / Stormy!.
 *
 * Bolts are midpoint-displacement polylines with optional forks, which is
 * the usual way to draw lightning when there is no sprite for it.
 *
 *   <after-dark-zot forkiness="forky" kinkiness="kinky" how-often="often">
 */
(function () {
	'use strict';

	var FORKS = { few: 1, forky: 3, 'max forky!': 6 };
	var KINKS = { 'no kinks': 0.08, kinky: 0.28, deviant: 0.55 };
	var OFTEN = {
		rarely: 6.5,
		sometimes: 3.4,
		often: 1.5,
		'stormy!': 0.45
	};

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	/** Midpoint displacement on a segment, `depth` times. `kink` is 0..1. */
	function displace(points, kink, depth) {
		var out = points;
		var d, i, next, a, b, mx, my, dx, dy, len, nx, ny, offset;
		for (d = 0; d < depth; d += 1) {
			next = [out[0]];
			for (i = 0; i < out.length - 1; i += 1) {
				a = out[i];
				b = out[i + 1];
				mx = (a.x + b.x) / 2;
				my = (a.y + b.y) / 2;
				dx = b.x - a.x;
				dy = b.y - a.y;
				len = Math.hypot(dx, dy) || 1;
				nx = -dy / len;
				ny = dx / len;
				offset = (Math.random() * 2 - 1) * len * kink;
				next.push({ x: mx + nx * offset, y: my + ny * offset });
				next.push(b);
			}
			out = next;
			kink *= 0.62;
		}
		return out;
	}

	/**
	 * A bolt from the top of the box toward the bottom, plus forks.
	 * Returns an array of polylines (arrays of {x,y}).
	 */
	function strike(w, h, forkiness, kinkiness) {
		var x0 = rand(w * 0.08, w * 0.92);
		var y0 = rand(-8, h * 0.08);
		var x1 = x0 + rand(-w * 0.28, w * 0.28);
		x1 = Math.max(8, Math.min(w - 8, x1));
		var y1 = rand(h * 0.55, h * 1.05);
		var depth = kinkiness < 0.12 ? 3 : (kinkiness < 0.4 ? 5 : 6);
		var main = displace([{ x: x0, y: y0 }, { x: x1, y: y1 }], kinkiness, depth);
		var bolts = [main];
		var nForks = forkiness;
		var i, at, origin, dest, branch;
		for (i = 0; i < nForks; i += 1) {
			if (main.length < 4) {
				break;
			}
			at = 2 + Math.floor(Math.random() * (main.length - 3));
			origin = main[at];
			dest = {
				x: origin.x + rand(-w * 0.22, w * 0.22),
				y: origin.y + rand(h * 0.12, h * 0.4)
			};
			branch = displace([origin, dest], kinkiness * 0.9, Math.max(2, depth - 2));
			bolts.push(branch);
		}
		return bolts;
	}

	function Zot() {
		this.forkiness = FORKS.forky;
		this.kinkiness = KINKS.kinky;
		this.gap = OFTEN.often;
		this.wait = 0.05;
		this.bolts = [];
		this.age = 0;
		this.flash = 0;
		this.hold = 0.45;
	}

	Zot.prototype.fire = function (w, h) {
		this.bolts = strike(w, h, this.forkiness, this.kinkiness);
		this.age = 0;
		this.flash = 0.55;
		this.wait = this.gap * rand(0.45, 1.35);
	};

	Zot.prototype.step = function (dt, w, h) {
		this.age += dt;
		this.flash = Math.max(0, this.flash - dt * 2.8);
		if (this.age > this.hold) {
			this.bolts = [];
		}
		this.wait -= dt;
		if (this.wait <= 0) {
			this.fire(w, h);
		}
	};

	Zot.prototype.stroke = function (ctx, points, width, colour) {
		if (points.length < 2) {
			return;
		}
		ctx.strokeStyle = colour;
		ctx.lineWidth = width;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(points[0].x, points[0].y);
		for (var i = 1; i < points.length; i += 1) {
			ctx.lineTo(points[i].x, points[i].y);
		}
		ctx.stroke();
	};

	Zot.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (this.flash > 0.02) {
			ctx.fillStyle = 'rgba(200, 220, 255,' + (this.flash * 0.35) + ')';
			ctx.fillRect(0, 0, w, h);
		}
		for (var i = 0; i < this.bolts.length; i += 1) {
			var pts = this.bolts[i];
			this.stroke(ctx, pts, 7, 'rgba(120, 160, 255, 0.18)');
			this.stroke(ctx, pts, 3.2, 'rgba(190, 220, 255, 0.55)');
			this.stroke(ctx, pts, 1.2, '#ffffff');
		}
	};

	function ZotElement() {
		return Reflect.construct(HTMLElement, [], ZotElement);
	}
	ZotElement.prototype = Object.create(HTMLElement.prototype);
	ZotElement.prototype.constructor = ZotElement;
	Object.setPrototypeOf(ZotElement, HTMLElement);

	ZotElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Zot();
		var forks = (AfterDark.setting(this, 'forkiness') || 'forky').toLowerCase();
		var kinks = (AfterDark.setting(this, 'kinkiness') || 'kinky').toLowerCase();
		var often = (AfterDark.setting(this, 'how-often') || 'often').toLowerCase();
		sim.forkiness = FORKS[forks] !== undefined ? FORKS[forks] : FORKS.forky;
		sim.kinkiness = KINKS[kinks] !== undefined ? KINKS[kinks] : KINKS.kinky;
		sim.gap = OFTEN[often] !== undefined ? OFTEN[often] : OFTEN.often;

		var screen = new AfterDark.Screen(this);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function () {};
		screen.run(function (dt, ctx, width, height) {
			sim.step(dt, width, height);
			sim.draw(ctx, width, height);
		});
	};

	ZotElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-zot', ZotElement);
	window.AfterDarkZot = Zot;
	Zot.strike = strike;
	Zot.displace = displace;
	Zot.FORKS = FORKS;
	Zot.KINKS = KINKS;
	Zot.OFTEN = OFTEN;
}());
