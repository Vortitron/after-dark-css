/**
 * bogglins.js - Bogglins, using the original 256-colour artwork.
 *
 * BOGGLINS.AD, from the classic set. Its own description:
 *
 *   "A Bogglin is sort of a cross between Santa Claus and a pickle. He has
 *    apparently just eaten several hundred pounds of something that doesn't
 *    agree with him.
 *    This example of Manga (Japanese-style cartooning) was written by Andy
 *    Karn, based on animated art submitted by Dann Auld to the 1992 After
 *    Dark Contest."
 *   Windows version by Paul Sasse. Original Mac version by Dann Auld and
 *   Andy Karn.
 *
 * The settings are its own, out of TYPE_1000: Explosivity = Unstable /
 * Volatile / Dangerous / Evacuate!, and Twanginess = Mild / Rich / Zesty /
 * Sharp.
 *
 * Artwork, from tools/adclassic.py, the 256-colour band 2111-2120. Ten frames:
 *   2111-2114  squash to stretch, one bounce
 *   2115-2118  he detonates, then the smoke thins
 *   2119       a small lump left behind
 *   2120       flattened into a puddle
 *
 * The blob sits low in a 153x156 bitmap, so drawing is from the feet rather
 * than the frame centre, otherwise the hop would float.
 *
 *   <after-dark-bogglins explosivity="volatile" twanginess="zesty">
 */
(function () {
	'use strict';

	var BOUNCE = ['2111', '2112', '2113', '2114'];
	var BOOM = ['2115', '2116', '2117', '2118'];
	var LUMP = '2119';
	var PUDDLE = '2120';

	/* How often a hop ends in a bang, and how high / how fast the hop is. */
	var EXPLOSIVITY = {
		unstable: 0.06,
		volatile: 0.14,
		dangerous: 0.32,
		'evacuate!': 0.58
	};
	var TWANG = {
		mild: { hops: 1.35, height: 42, fps: 7 },
		rich: { hops: 1.9, height: 64, fps: 9 },
		zesty: { hops: 2.6, height: 92, fps: 12 },
		sharp: { hops: 3.6, height: 118, fps: 16 }
	};

	/* Feet of the idle frames, in bitmap space. Explosions share the same x. */
	var FEET_X = 78;
	var FEET_Y = 147;
	var BOOM_FPS = 11;
	var REFORM = 0.55;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Bogglins(art) {
		console.assert(art, 'Bogglins needs decoded artwork');
		this.art = art;
		this.bounce = BOUNCE.map(function (id) { return art.bitmap(id); })
			.filter(Boolean);
		this.boom = BOOM.map(function (id) { return art.bitmap(id); })
			.filter(Boolean);
		this.lump = art.bitmap(LUMP);
		this.puddle = art.bitmap(PUDDLE);
		console.assert(this.bounce.length === 4, 'bogglin bounce cycle');
		this.chance = EXPLOSIVITY.volatile;
		this.twang = TWANG.zesty;
		this.crew = [];
	}

	Bogglins.prototype.spawn = function (w, h, anywhere) {
		var pad = 50;
		return {
			x: anywhere ? rand(pad, Math.max(pad + 1, w - pad)) : rand(-40, w + 40),
			floor: rand(h * 0.42, h - 8),
			vx: rand(-55, 55),
			phase: rand(0, 1),
			state: 'hop',
			frame: 0,
			wait: 0
		};
	};

	Bogglins.prototype.reset = function (w, h) {
		var n = Math.max(2, Math.min(5, Math.round(w / 280)));
		this.crew = [];
		for (var i = 0; i < n; i += 1) {
			this.crew.push(this.spawn(w, h, true));
		}
	};

	Bogglins.prototype.drawAt = function (ctx, bitmap, x, y) {
		if (!bitmap) {
			return;
		}
		ctx.drawImage(bitmap.image,
			Math.round(x - FEET_X), Math.round(y - FEET_Y));
	};

	Bogglins.prototype.step = function (dt, w, h) {
		var hops = this.twang.hops;
		var i, b, hop;
		for (i = 0; i < this.crew.length; i += 1) {
			b = this.crew[i];
			if (b.state === 'hop') {
				b.phase += dt * hops;
				if (b.phase >= 1) {
					b.phase -= 1;
					if (Math.random() < this.chance && this.boom.length) {
						b.state = 'boom';
						b.frame = 0;
						b.vx = 0;
					} else {
						b.vx = rand(-70, 70) * (this.twang.height / 80);
					}
				}
				hop = Math.sin(b.phase * Math.PI);
				b.y = b.floor - hop * this.twang.height;
				b.frame = Math.min(this.bounce.length - 1, Math.floor(hop * this.bounce.length));
				b.x += b.vx * dt;
				if (b.x < 40) {
					b.x = 40;
					b.vx = Math.abs(b.vx);
				} else if (b.x > w - 40) {
					b.x = w - 40;
					b.vx = -Math.abs(b.vx);
				}
			} else if (b.state === 'boom') {
				b.y = b.floor;
				b.frame += dt * BOOM_FPS;
				if (b.frame >= this.boom.length) {
					b.state = 'puddle';
					b.wait = REFORM;
				}
			} else if (b.state === 'puddle') {
				b.y = b.floor;
				b.wait -= dt;
				if (b.wait <= 0) {
					b.state = 'lump';
					b.wait = REFORM;
				}
			} else if (b.state === 'lump') {
				b.y = b.floor;
				b.wait -= dt;
				if (b.wait <= 0) {
					b.state = 'hop';
					b.phase = 0;
					b.vx = rand(-55, 55);
					b.floor = rand(h * 0.42, h - 8);
				}
			}
		}
	};

	Bogglins.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		for (var i = 0; i < this.crew.length; i += 1) {
			var b = this.crew[i];
			if (b.state === 'hop') {
				this.drawAt(ctx, this.bounce[b.frame], b.x, b.y);
			} else if (b.state === 'boom') {
				this.drawAt(ctx, this.boom[Math.min(this.boom.length - 1, Math.floor(b.frame))], b.x, b.y);
			} else if (b.state === 'puddle') {
				this.drawAt(ctx, this.puddle, b.x, b.y);
			} else {
				this.drawAt(ctx, this.lump, b.x, b.y);
			}
		}
	};

	function BogglinsElement() {
		return Reflect.construct(HTMLElement, [], BogglinsElement);
	}
	BogglinsElement.prototype = Object.create(HTMLElement.prototype);
	BogglinsElement.prototype.constructor = BogglinsElement;
	Object.setPrototypeOf(BogglinsElement, HTMLElement);

	BogglinsElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/bogglins';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		window.AfterDark.load(base).then(function (art) {
			var sim = new Bogglins(art);
			var bang = (AfterDark.setting(self, 'explosivity') || 'volatile').toLowerCase();
			var twang = (AfterDark.setting(self, 'twanginess') || 'zesty').toLowerCase();
			sim.chance = EXPLOSIVITY[bang] || EXPLOSIVITY.volatile;
			sim.twang = TWANG[twang] || TWANG.zesty;

			var screen = new AfterDark.Screen(self);
			self._screen = screen;
			self.sim = sim;
			screen.onresize = function (width, height) {
				sim.reset(width, height);
			};
			sim.reset(screen.width, screen.height);
			screen.run(function (dt, ctx, width, height) {
				sim.step(dt, width, height);
				sim.draw(ctx, width, height);
			});
		}).catch(function (error) {
			console.error('Could not start Bogglins:', error);
			self.textContent = error.message;
		});
	};

	BogglinsElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-bogglins', BogglinsElement);
	window.AfterDarkBogglins = Bogglins;
	Bogglins.EXPLOSIVITY = EXPLOSIVITY;
	Bogglins.TWANG = TWANG;
}());
