/**
 * rebound.js - Rebound, using the original ball artwork.
 *
 * REBOUND.AD stores two balls at each of three sizes. The even resource IDs
 * are the coloured plastic set and the odd IDs are the metal set:
 *   1000/1001  4x4, 1002/1003  16x16, 1004/1005  32x32.
 *
 * Its control panel calls the choices Plastic / Metal / Both, Wobbly,
 * Clear Screen First, and Not Many / More / Lots More / Bunches / Oodles.
 */
(function () {
	'use strict';

	var BALL_IDS = {
		plastic: [1000, 1002, 1004],
		metal: [1001, 1003, 1005]
	};
	var BALL_COUNTS = {
		'not many': 20,
		more: 40,
		'lots more': 60,
		bunches: 80,
		oodles: 100
	};
	var MIN_SPEED = 45;
	var MAX_SPEED = 135;
	var WOBBLE = 0.22;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function availableIds(art, type) {
		var names = type === 'both'
			? BALL_IDS.plastic.concat(BALL_IDS.metal)
			: (BALL_IDS[type] || BALL_IDS.plastic);
		return names.filter(function (id) {
			return art.bitmap('qict-' + id);
		});
	}

	function Rebound(art) {
		this.art = art;
		this.type = 'both';
		this.count = BALL_COUNTS.more;
		this.wobbly = true;
		this.clearScreen = true;
		this.balls = [];
	}

	Rebound.prototype.spawn = function (w, h) {
		var ids = availableIds(this.art, this.type);
		var id = pick(ids);
		var bitmap = this.art.bitmap('qict-' + id);
		if (!bitmap) {
			return null;
		}
		var radius = bitmap.width / 2;
		var angle = rand(0, Math.PI * 2);
		var speed = rand(MIN_SPEED, MAX_SPEED) * (24 / Math.max(12, bitmap.width));
		return {
			bitmap: bitmap,
			radius: radius,
			x: rand(radius, Math.max(radius + 1, w - radius)),
			y: rand(radius, Math.max(radius + 1, h - radius)),
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed
		};
	};

	Rebound.prototype.reset = function (w, h) {
		this.balls = [];
		for (var i = 0; i < this.count; i += 1) {
			var ball = this.spawn(w, h);
			if (ball) {
				this.balls.push(ball);
			}
		}
	};

	Rebound.prototype.bounce = function (ball, w, h) {
		var hit = false;
		if (ball.x < ball.radius || ball.x > w - ball.radius) {
			ball.x = Math.max(ball.radius, Math.min(w - ball.radius, ball.x));
			ball.vx = -ball.vx;
			hit = true;
		}
		if (ball.y < ball.radius || ball.y > h - ball.radius) {
			ball.y = Math.max(ball.radius, Math.min(h - ball.radius, ball.y));
			ball.vy = -ball.vy;
			hit = true;
		}
		if (hit && this.wobbly) {
			var turn = rand(-WOBBLE, WOBBLE);
			var cosine = Math.cos(turn);
			var sine = Math.sin(turn);
			var vx = ball.vx * cosine - ball.vy * sine;
			ball.vy = ball.vx * sine + ball.vy * cosine;
			ball.vx = vx;
		}
	};

	Rebound.prototype.step = function (dt, w, h) {
		for (var i = 0; i < this.balls.length; i += 1) {
			var ball = this.balls[i];
			ball.x += ball.vx * dt;
			ball.y += ball.vy * dt;
			this.bounce(ball, w, h);
		}
	};

	Rebound.prototype.draw = function (ctx, w, h) {
		if (this.clearScreen) {
			ctx.fillStyle = '#000';
			ctx.fillRect(0, 0, w, h);
		}
		for (var i = 0; i < this.balls.length; i += 1) {
			var ball = this.balls[i];
			ball.bitmap.draw(ctx, ball.x, ball.y);
		}
	};

	function ReboundElement() {
		return Reflect.construct(HTMLElement, [], ReboundElement);
	}
	ReboundElement.prototype = Object.create(HTMLElement.prototype);
	ReboundElement.prototype.constructor = ReboundElement;
	Object.setPrototypeOf(ReboundElement, HTMLElement);

	ReboundElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/rebound';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		window.AfterDark.load(base).then(function (art) {
			var sim = new Rebound(art);
			var type = (AfterDark.setting(self, 'ball-type') || 'both').toLowerCase();
			var balls = (AfterDark.setting(self, 'balls') || 'more').toLowerCase();
			if (type === 'plastic' || type === 'metal' || type === 'both') {
				sim.type = type;
			}
			sim.count = BALL_COUNTS[balls] || parseInt(balls, 10) || BALL_COUNTS.more;
			sim.count = Math.max(1, Math.min(BALL_COUNTS.oodles, sim.count));
			sim.wobbly = AfterDark.flag(self, 'wobbly');
			sim.clearScreen = AfterDark.flag(self, 'clear-screen');

			var screen = new AfterDark.Screen(self);
			self._screen = screen;
			self.sim = sim;
			screen.onresize = function (w, h) {
				sim.reset(w, h);
			};
			sim.reset(screen.width, screen.height);
			screen.run(function (dt, ctx, w, h) {
				sim.step(dt, w, h);
				sim.draw(ctx, w, h);
			});
		}).catch(function (error) {
			console.error('Could not start Rebound:', error);
			self.textContent = error.message;
		});
	};

	ReboundElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-rebound', ReboundElement);
	window.AfterDarkRebound = Rebound;
}());
