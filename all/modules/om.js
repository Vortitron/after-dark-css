/**
 * om.js - Om Appliances, using the original 256-colour artwork.
 *
 * OM.AD, from the classic set. Its own description:
 *
 *   "Do the appliances in your home exist when unplugged from the space-time
 *    grid? Are Platinum and Toast just thin, washable enamel coatings keeping
 *    us from seeing the Essential Transcendent Beingness of the so-called
 *    'universe'?"
 *   Submitted to the 1992 After Dark Contest by Gregory M. Becker. Mac
 *   rewrite by Andy Karn, art by Igor Gasowski and Tomoya Ikeda. Windows
 *   version by Paul Sasse.
 *
 * The settings are its own, out of TYPE_1000: Life Energy = 1000-5000 kWH,
 * Defrost = Never / Rarely / Occasionally / Often / Very Often / Almost
 * Always / Constantly, and Washer Karma = None / A Little / Some / Average /
 * Lots / Complete. Entities was a slider whose labels did not survive the
 * resource table, so it is reconstructed as Few / Some / More / Lots.
 *
 * Artwork, from tools/adclassic.py, the 256-colour band:
 *   2101-2104  a front-loader, laundry tumbling
 *   2105       fridge, doors shut
 *   2106-2107  fridge, freezer open onto two different shelves
 *
 * They drift the way the toasters do, wrapping the screen, because nothing in
 * the resources records a floor for them to sit on.
 *
 *   <after-dark-om entities="some" life-energy="3000 kwh" defrost="often"
 *     washer-karma="average">
 */
(function () {
	'use strict';

	var WASHER = ['2101', '2102', '2103', '2104'];
	var FRIDGE = ['2105', '2106', '2107'];

	var ENTITIES = { few: 3, some: 6, more: 10, lots: 16 };
	var ENERGY = {
		'1000 kwh': 22,
		'2000 kwh': 34,
		'3000 kwh': 48,
		'4000 kwh': 64,
		'5000 kwh': 82
	};
	/* Chance a fridge is showing an open-freezer frame. */
	var DEFROST = {
		never: 0,
		rarely: 0.08,
		occasionally: 0.18,
		often: 0.34,
		'very often': 0.52,
		'almost always': 0.78,
		constantly: 1
	};
	/* Share of the crowd that is a washer rather than a fridge. */
	var KARMA = {
		none: 0,
		'a little': 0.2,
		some: 0.4,
		average: 0.55,
		lots: 0.8,
		complete: 1
	};

	var TUMBLE = 6;
	var HEADING = { x: -1, y: 0.28 };

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function Om(art) {
		console.assert(art, 'Om Appliances needs decoded artwork');
		this.art = art;
		this.washer = WASHER.map(function (id) { return art.bitmap(id); })
			.filter(Boolean);
		this.fridge = FRIDGE.map(function (id) { return art.bitmap(id); })
			.filter(Boolean);
		console.assert(this.washer.length === 4, 'washer tumble cycle');
		console.assert(this.fridge.length >= 1, 'at least a closed fridge');
		this.count = ENTITIES.some;
		this.speed = ENERGY['3000 kwh'];
		this.defrost = DEFROST.often;
		this.karma = KARMA.average;
		this.things = [];
	}

	Om.prototype.kind = function () {
		if (!this.washer.length) {
			return 'fridge';
		}
		if (!this.fridge.length) {
			return 'washer';
		}
		return Math.random() < this.karma ? 'washer' : 'fridge';
	};

	Om.prototype.spawn = function (w, h, anywhere) {
		var kind = this.kind();
		var frames = kind === 'washer' ? this.washer : this.fridge;
		var bitmap = frames[0];
		var halfW = bitmap.width / 2;
		var halfH = bitmap.height / 2;
		return {
			kind: kind,
			frames: frames,
			frame: rand(0, frames.length),
			open: Math.random() < this.defrost,
			x: anywhere ? rand(-halfW, w + halfW) : w + halfW + rand(0, 80),
			y: rand(halfH, Math.max(halfH + 1, h - halfH)),
			speed: this.speed * rand(0.75, 1.25)
		};
	};

	Om.prototype.reset = function (w, h) {
		this.things = [];
		for (var i = 0; i < this.count; i += 1) {
			this.things.push(this.spawn(w, h, true));
		}
	};

	Om.prototype.step = function (dt, w, h) {
		var hx = HEADING.x, hy = HEADING.y;
		var mag = Math.hypot(hx, hy) || 1;
		hx /= mag;
		hy /= mag;
		for (var i = 0; i < this.things.length; i += 1) {
			var t = this.things[i];
			t.x += hx * t.speed * dt;
			t.y += hy * t.speed * dt;
			if (t.kind === 'washer') {
				t.frame = (t.frame + dt * TUMBLE) % t.frames.length;
			} else if (Math.random() < dt * 0.35) {
				t.open = Math.random() < this.defrost;
			}
			var bm = t.frames[0];
			if (t.x < -bm.width) {
				t.x = w + bm.width;
				t.y = rand(bm.height / 2, Math.max(bm.height / 2 + 1, h - bm.height / 2));
			}
			if (t.y > h + bm.height) {
				t.y = -bm.height;
			} else if (t.y < -bm.height) {
				t.y = h + bm.height;
			}
		}
	};

	Om.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		for (var i = 0; i < this.things.length; i += 1) {
			var t = this.things[i];
			var frame;
			if (t.kind === 'washer') {
				frame = t.frames[Math.floor(t.frame) % t.frames.length];
			} else if (t.open && t.frames.length > 1) {
				frame = t.frames[1 + (i % Math.max(1, t.frames.length - 1))];
			} else {
				frame = t.frames[0];
			}
			if (frame) {
				frame.draw(ctx, t.x, t.y);
			}
		}
	};

	function OmElement() {
		return Reflect.construct(HTMLElement, [], OmElement);
	}
	OmElement.prototype = Object.create(HTMLElement.prototype);
	OmElement.prototype.constructor = OmElement;
	Object.setPrototypeOf(OmElement, HTMLElement);

	OmElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/om';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		window.AfterDark.load(base).then(function (art) {
			var sim = new Om(art);
			var entities = (AfterDark.setting(self, 'entities') || 'some').toLowerCase();
			var energy = (AfterDark.setting(self, 'life-energy') || '3000 kwh').toLowerCase();
			var defrost = (AfterDark.setting(self, 'defrost') || 'often').toLowerCase();
			var karma = (AfterDark.setting(self, 'washer-karma') || 'average').toLowerCase();
			sim.count = ENTITIES[entities] || parseInt(entities, 10) || ENTITIES.some;
			sim.speed = ENERGY[energy] || ENERGY['3000 kwh'];
			sim.defrost = DEFROST[defrost] !== undefined ? DEFROST[defrost] : DEFROST.often;
			sim.karma = KARMA[karma] !== undefined ? KARMA[karma] : KARMA.average;

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
			console.error('Could not start Om Appliances:', error);
			self.textContent = error.message;
		});
	};

	OmElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-om', OmElement);
	window.AfterDarkOm = Om;
	Om.ENTITIES = ENTITIES;
	Om.ENERGY = ENERGY;
	Om.DEFROST = DEFROST;
	Om.KARMA = KARMA;
}());
