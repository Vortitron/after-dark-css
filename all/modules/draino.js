/**
 * draino.js - Down the Drain, drawn the way the original module drew itself.
 *
 * DRAINO.AD ships no artwork. Its own description:
 *
 *   "DOWN THE DRAIN (tm)
 *    Original concept by Rob Vaterlaus.
 *    The 'Direction' slider sets the coriolis force for Southern Hemisphere
 *    (Clockwise), Northern Hemisphere (Counter), or on the equator (Inward).
 *    The 'Drops' check box will add drops for draining after most of the
 *    screen is black. The 'Drain' check box starts you draining with a drain
 *    in the middle of the screen."
 *
 * The settings are its own, out of TYPE_1000: Speed = Slow / Medium / Fast,
 * Direction = Clockwise / Inward / Counter, Drops, and Show Drain.
 *
 *   <after-dark-draino speed="medium" direction="clockwise" drops show-drain>
 */
(function () {
	'use strict';

	var SPEED = { slow: 0.45, medium: 1, fast: 2.2 };
	var DROP = 14;
	var DRAIN_R = 28;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Draino() {
		this.rate = SPEED.medium;
		this.spin = 1;
		this.drops = true;
		this.showDrain = true;
		this.bits = [];
		this.drips = [];
	}

	Draino.prototype.particleCount = function (w, h) {
		return Math.max(220, Math.min(900, Math.round((w * h) / 900)));
	};

	Draino.prototype.spawnBit = function (w, h, cx, cy, atEdge) {
		var ang = rand(0, Math.PI * 2);
		var maxR = Math.hypot(w, h) * 0.55;
		var r = atEdge ? rand(maxR * 0.65, maxR) : rand(DRAIN_R + 8, maxR);
		return {
			x: cx + Math.cos(ang) * r,
			y: cy + Math.sin(ang) * r,
			hue: rand(190, 215),
			size: rand(1.2, 3.4)
		};
	};

	Draino.prototype.reset = function (w, h) {
		var cx = w / 2, cy = h / 2, i, n;
		this.bits = [];
		n = this.particleCount(w, h);
		for (i = 0; i < n; i += 1) {
			this.bits.push(this.spawnBit(w, h, cx, cy, false));
		}
		this.drips = [];
	};

	Draino.prototype.step = function (dt, w, h) {
		var cx = w / 2, cy = h / 2, i, b, dx, dy, r, nx, ny, tang, pull, swirl;
		swirl = this.spin * this.rate * 1.7;
		pull = this.rate * 48;
		for (i = 0; i < this.bits.length; i += 1) {
			b = this.bits[i];
			dx = b.x - cx;
			dy = b.y - cy;
			r = Math.hypot(dx, dy) || 0.001;
			nx = dx / r;
			ny = dy / r;
			tang = this.spin ? swirl * (40 / (r + 12)) : 0;
			b.x += -nx * pull * dt + -ny * tang * r * dt;
			b.y += -ny * pull * dt + nx * tang * r * dt;
			if (r < DRAIN_R * 0.35) {
				this.bits[i] = this.spawnBit(w, h, cx, cy, true);
			}
		}
		if (this.drops) {
			if (Math.random() < dt * DROP) {
				this.drips.push({
					x: rand(0, w),
					y: -8,
					vy: rand(70, 140),
					size: rand(2, 4)
				});
			}
			for (i = this.drips.length - 1; i >= 0; i -= 1) {
				b = this.drips[i];
				b.y += b.vy * dt;
				b.vy += 90 * dt;
				dx = b.x - cx;
				dy = b.y - cy;
				r = Math.hypot(dx, dy) || 1;
				if (r < 80) {
					b.x += -dx / r * 40 * dt;
					b.y += -dy / r * 40 * dt;
				}
				if (b.y > h + 10 || r < DRAIN_R) {
					this.drips.splice(i, 1);
				}
			}
		}
	};

	Draino.prototype.drawDrain = function (ctx, cx, cy) {
		var i;
		ctx.save();
		ctx.translate(cx, cy);
		ctx.strokeStyle = '#6a6a70';
		ctx.fillStyle = '#2a2a30';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(0, 0, DRAIN_R, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(0, 0, DRAIN_R * 0.72, 0, Math.PI * 2);
		ctx.stroke();
		ctx.strokeStyle = '#8a8a90';
		for (i = 0; i < 8; i += 1) {
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(Math.cos(i * Math.PI / 4) * DRAIN_R, Math.sin(i * Math.PI / 4) * DRAIN_R);
			ctx.stroke();
		}
		ctx.fillStyle = '#111';
		ctx.beginPath();
		ctx.arc(0, 0, 5, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	};

	Draino.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		var cx = w / 2, cy = h / 2, i, b;
		if (this.showDrain) {
			this.drawDrain(ctx, cx, cy);
		}
		for (i = 0; i < this.bits.length; i += 1) {
			b = this.bits[i];
			ctx.fillStyle = 'hsla(' + b.hue + ',70%,62%,0.85)';
			ctx.fillRect(b.x, b.y, b.size, b.size);
		}
		for (i = 0; i < this.drips.length; i += 1) {
			b = this.drips[i];
			ctx.fillStyle = 'rgba(170,210,255,0.9)';
			ctx.beginPath();
			ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	function DrainoElement() {
		return Reflect.construct(HTMLElement, [], DrainoElement);
	}
	DrainoElement.prototype = Object.create(HTMLElement.prototype);
	DrainoElement.prototype.constructor = DrainoElement;
	Object.setPrototypeOf(DrainoElement, HTMLElement);

	DrainoElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Draino();
		var speed = (AfterDark.setting(self, 'speed') || 'medium').toLowerCase();
		sim.rate = SPEED[speed] || SPEED.medium;
		var dir = (AfterDark.setting(self, 'direction') || 'clockwise').toLowerCase();
		if (dir === 'inward') {
			sim.spin = 0;
		} else if (dir === 'counter' || dir.indexOf('counter') === 0) {
			sim.spin = -1;
		} else {
			sim.spin = 1;
		}
		sim.drops = AfterDark.flag(self, 'drops');
		sim.showDrain = AfterDark.flag(self, 'show-drain');

		var screen = new AfterDark.Screen(self);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function (width, height) {
			sim.reset(width, height);
		};
		sim.reset(screen.width, screen.height);
		screen.run(function (dt, ctx, width, height) {
			sim.step(dt, width, height);
			sim.draw(ctx, width, height);
		});
	};

	DrainoElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-draino', DrainoElement);
	window.AfterDarkDraino = Draino;
	Draino.SPEED = SPEED;
}());
