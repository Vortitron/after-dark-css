/**
 * gravity.js - Gravity, drawn the way the original module drew itself.
 *
 * GRAVITY.AD ships no artwork: it is one of the 45 modules that paint in
 * code. Its own description:
 *
 *   "GRAVITY (tm) demonstrates Newtonian gravity with bouncing balls.
 *    Choose 1-7 balls with the Number Balls slider.
 *    Use the Size slider to set the size of the balls."
 *   Original idea by Bryce Fowler.
 *
 * The settings are its own, out of TYPE_1000: Number Balls is 1-7, Size is
 * 10-30 pixels, plus Clear Screen and Colors checkboxes. Sound is omitted
 * because there is no sound here.
 *
 *   <after-dark-gravity balls="4" size="medium" colors clear-screen>
 */
(function () {
	'use strict';

	var MIN_BALLS = 1;
	var MAX_BALLS = 7;
	var SIZES = { small: 10, medium: 18, large: 28 };
	var PALETTE = [
		'#e23b3b', '#3bd14a', '#3b7ae2', '#f2d24b',
		'#3be2d4', '#e23bd1', '#f2f2f2'
	];
	var GREY = ['#d8d8d8', '#b0b0b0', '#888888', '#e8e8e8', '#c8c8c8', '#a0a0a0', '#f4f4f4'];
	var G = 4200;
	var SOFT = 24;
	var RESTITUTION = 0.92;
	var DAMP = 0.9992;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function massOf(radius) {
		return radius * radius;
	}

	/** Acceleration on a from b, Newtonian with a softening length. */
	function pull(a, b) {
		var dx = b.x - a.x;
		var dy = b.y - a.y;
		var dist2 = dx * dx + dy * dy;
		var min = (a.radius + b.radius) * (a.radius + b.radius);
		if (dist2 < min) {
			dist2 = min;
		}
		var dist = Math.sqrt(dist2 + SOFT * SOFT);
		var accel = G * b.mass / (dist * dist * dist);
		return { x: dx * accel, y: dy * accel };
	}

	function Gravity() {
		this.count = 4;
		this.radius = SIZES.medium;
		this.colors = true;
		this.clearScreen = true;
		this.balls = [];
	}

	Gravity.prototype.spawn = function (w, h, index) {
		var radius = this.radius * rand(0.72, 1.18);
		var palette = this.colors ? PALETTE : GREY;
		return {
			x: rand(radius + 4, Math.max(radius + 5, w - radius - 4)),
			y: rand(radius + 4, Math.max(radius + 5, h - radius - 4)),
			vx: rand(-50, 50),
			vy: rand(-50, 50),
			radius: radius,
			mass: massOf(radius),
			colour: palette[index % palette.length]
		};
	};

	Gravity.prototype.reset = function (w, h) {
		this.balls = [];
		var n = Math.max(MIN_BALLS, Math.min(MAX_BALLS, this.count));
		for (var i = 0; i < n; i += 1) {
			this.balls.push(this.spawn(w, h, i));
		}
	};

	Gravity.prototype.walls = function (ball, w, h) {
		if (ball.x < ball.radius) {
			ball.x = ball.radius;
			ball.vx = Math.abs(ball.vx) * RESTITUTION;
		} else if (ball.x > w - ball.radius) {
			ball.x = w - ball.radius;
			ball.vx = -Math.abs(ball.vx) * RESTITUTION;
		}
		if (ball.y < ball.radius) {
			ball.y = ball.radius;
			ball.vy = Math.abs(ball.vy) * RESTITUTION;
		} else if (ball.y > h - ball.radius) {
			ball.y = h - ball.radius;
			ball.vy = -Math.abs(ball.vy) * RESTITUTION;
		}
	};

	Gravity.prototype.step = function (dt, w, h) {
		var i, j, a, b, force, ax, ay, dx, dy, dist, overlap, nx, ny;
		for (i = 0; i < this.balls.length; i += 1) {
			a = this.balls[i];
			ax = 0;
			ay = 0;
			for (j = 0; j < this.balls.length; j += 1) {
				if (i === j) {
					continue;
				}
				force = pull(a, this.balls[j]);
				ax += force.x;
				ay += force.y;
			}
			a.vx = (a.vx + ax * dt) * DAMP;
			a.vy = (a.vy + ay * dt) * DAMP;
		}
		for (i = 0; i < this.balls.length; i += 1) {
			a = this.balls[i];
			a.x += a.vx * dt;
			a.y += a.vy * dt;
			this.walls(a, w, h);
		}
		/* Overlap: push apart so they do not sink into each other. */
		for (i = 0; i < this.balls.length; i += 1) {
			a = this.balls[i];
			for (j = i + 1; j < this.balls.length; j += 1) {
				b = this.balls[j];
				dx = b.x - a.x;
				dy = b.y - a.y;
				dist = Math.hypot(dx, dy) || 0.001;
				overlap = a.radius + b.radius - dist;
				if (overlap > 0) {
					nx = dx / dist;
					ny = dy / dist;
					a.x -= nx * overlap * 0.5;
					a.y -= ny * overlap * 0.5;
					b.x += nx * overlap * 0.5;
					b.y += ny * overlap * 0.5;
				}
			}
		}
	};

	Gravity.prototype.drawBall = function (ctx, ball) {
		var r = ball.radius;
		var g = ctx.createRadialGradient(
			ball.x - r * 0.35, ball.y - r * 0.38, r * 0.08,
			ball.x, ball.y, r);
		g.addColorStop(0, '#ffffff');
		g.addColorStop(0.22, ball.colour);
		g.addColorStop(1, '#111111');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
		ctx.fill();
	};

	Gravity.prototype.draw = function (ctx, w, h) {
		if (this.clearScreen) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
		}
		for (var i = 0; i < this.balls.length; i += 1) {
			this.drawBall(ctx, this.balls[i]);
		}
	};

	function GravityElement() {
		return Reflect.construct(HTMLElement, [], GravityElement);
	}
	GravityElement.prototype = Object.create(HTMLElement.prototype);
	GravityElement.prototype.constructor = GravityElement;
	Object.setPrototypeOf(GravityElement, HTMLElement);

	GravityElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Gravity();
		var balls = AfterDark.setting(self, 'balls');
		var size = (AfterDark.setting(self, 'size') || 'medium').toLowerCase();
		sim.count = Math.max(MIN_BALLS, Math.min(MAX_BALLS, parseInt(balls, 10) || 4));
		sim.radius = SIZES[size] || parseInt(size, 10) || SIZES.medium;
		sim.radius = Math.max(8, Math.min(40, sim.radius));
		sim.colors = AfterDark.flag(self, 'colors');
		sim.clearScreen = AfterDark.flag(self, 'clear-screen');

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

	GravityElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-gravity', GravityElement);
	window.AfterDarkGravity = Gravity;
	Gravity.pull = pull;
	Gravity.SIZES = SIZES;
	Gravity.MIN_BALLS = MIN_BALLS;
	Gravity.MAX_BALLS = MAX_BALLS;
}());
