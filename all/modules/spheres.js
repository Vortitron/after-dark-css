/**
 * spheres.js - Spheres, drawn the way the original module drew itself.
 *
 * SPHERES.AD ships no artwork. Its own description:
 *
 *   "SPHERES (tm) makes 3D-looking colorful orbs that fill your screen.
 *    'Max Size' is the maximum size of a sphere.
 *    'Offset' controls the shape of the sphere. The larger the offset, the
 *    more egg-shaped the sphere will be.
 *    'Clear Every' sets the number of spheres drawn before clearing the
 *    screen.
 *    Based on Spheres by Bruce Burkhalter."
 *
 * Max Size, Offset and Clear Every were sliders; here they are discrete
 * values in the same ranges.
 *
 *   <after-dark-spheres max-size="50" offset="10" clear-every="100" clear-screen>
 */
(function () {
	'use strict';

	var PALETTE = [
		'#e05050', '#e09040', '#e0d040', '#50c060', '#40b0d0',
		'#5080e0', '#9050d0', '#e060a0', '#d0d0d0', '#40c0a0'
	];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	/** Spec for one orb: centre, radii, colour. Offset 0 is a circle. */
	function makeSphere(w, h, maxSize, offset) {
		var r = rand(8, maxSize);
		var squash = Math.max(0.35, 1 - offset / 140);
		return {
			x: rand(r, Math.max(r + 1, w - r)),
			y: rand(r, Math.max(r + 1, h - r)),
			rx: r,
			ry: r * squash,
			colour: pick(PALETTE)
		};
	}

	function paintSphere(ctx, s) {
		var g = ctx.createRadialGradient(
			s.x - s.rx * 0.35,
			s.y - s.ry * 0.38,
			s.rx * 0.08,
			s.x,
			s.y,
			Math.max(s.rx, s.ry)
		);
		g.addColorStop(0, '#ffffff');
		g.addColorStop(0.22, s.colour);
		g.addColorStop(1, '#101018');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2);
		ctx.fill();
	}

	function Spheres() {
		this.maxSize = 50;
		this.offset = 10;
		this.clearEvery = 100;
		this.clearScreen = true;
		this.drawn = 0;
		this.ready = false;
	}

	Spheres.prototype.reset = function () {
		this.drawn = 0;
		this.ready = false;
	};

	Spheres.prototype.draw = function (ctx, w, h) {
		if (!this.ready) {
			if (this.clearScreen) {
				ctx.fillStyle = '#000';
				ctx.fillRect(0, 0, w, h);
			} else {
				ctx.clearRect(0, 0, w, h);
			}
			this.ready = true;
			this.drawn = 0;
		}
		if (this.clearEvery > 0 && this.drawn >= this.clearEvery) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
			this.drawn = 0;
		}
		paintSphere(ctx, makeSphere(w, h, this.maxSize, this.offset));
		this.drawn += 1;
	};

	function SpheresElement() {
		return Reflect.construct(HTMLElement, [], SpheresElement);
	}
	SpheresElement.prototype = Object.create(HTMLElement.prototype);
	SpheresElement.prototype.constructor = SpheresElement;
	Object.setPrototypeOf(SpheresElement, HTMLElement);

	SpheresElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Spheres();
		sim.maxSize = Math.max(12, Math.min(120, parseInt(AfterDark.setting(self, 'max-size'), 10) || 50));
		sim.offset = Math.max(0, Math.min(100, parseInt(AfterDark.setting(self, 'offset'), 10) || 10));
		var every = AfterDark.setting(self, 'clear-every');
		if (every !== null && String(every).toLowerCase() === 'never') {
			sim.clearEvery = 0;
		} else {
			sim.clearEvery = Math.max(0, parseInt(every, 10) || 100);
		}
		sim.clearScreen = AfterDark.flag(self, 'clear-screen');

		var screen = new AfterDark.Screen(self);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function () {
			sim.reset();
		};
		sim.reset();
		screen.run(function (dt, ctx, width, height) {
			sim.draw(ctx, width, height);
		});
	};

	SpheresElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-spheres', SpheresElement);
	window.AfterDarkSpheres = Spheres;
	Spheres.makeSphere = makeSphere;
	Spheres.paintSphere = paintSphere;
}());
