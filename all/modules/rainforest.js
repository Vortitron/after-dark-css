/**
 * rainforest.js - Rainforest, on the module's own artwork.
 *
 * RAIN.AD, After Dark 4.0. Its own description:
 *
 *   "Rainforest:  Deep in the jungle..."
 *   Creatures from STRINGLIST 666: Dragonfly, Peruvian, Lehman's, Beetle,
 *   Butterfly, Turtle.
 *
 * The settings are its own, out of TYPE_1000: Creatures, Number = Few / Some /
 * Many / Hordes, Background = Desktop / Black / Leaves / Wet Blue / Moss /
 * Lichen / Rock / Mottled / Soft Green / Random, and Foliage.
 *
 * Artwork, from tools/adweb.py. Each creature sequence mixes a coloured walk
 * or flap with grey shadow frames and tiny accessories; only the longest
 * coloured run of similar size is used, mirrored on vx. 1000-1008 are plants.
 * Background is a fill (the PE BITMAPs 1000-1005 are 16-colour picker icons,
 * not the Leaves/Moss tiles).
 *
 *   <after-dark-rainforest art="art/rain" number="some" background="leaves" foliage>
 */
(function () {
	'use strict';

	var CREATURES = [
		{ name: 'dragonfly', id: '6600', from: 16, len: 7, speed: 88, step: 18 },
		{ name: 'peruvian',  id: '5500', from: 26, len: 10, speed: 30, step: 10 },
		{ name: "lehman",    id: '5400', from: 26, len: 10, speed: 28, step: 10 },
		{ name: 'beetle',    id: '6000', from: 38, len: 8, speed: 24, step: 9 },
		{ name: 'butterfly', id: '6400', from: 16, len: 3, speed: 62, step: 14 },
		{ name: 'turtle',    id: '6700', from: 16, len: 9, speed: 14, step: 6 }
	];

	var COUNTS = { few: 4, some: 10, many: 22, hordes: 48 };
	var FOLIAGE = ['1000', '1001', '1002', '1003', '1004', '1005', '1006', '1007', '1008'];
	var GROUND = {
		leaves: '#2c4a22',
		'wet blue': '#16384a',
		moss: '#3a5a28',
		lichen: '#4a5c36',
		rock: '#4a4540',
		mottled: '#355538',
		'soft green': '#2a4a28'
	};
	var WANDER = 1.4;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function Rainforest(art) {
		this.art = art;
		this.kinds = {};
		var i, spec, seq;
		for (i = 0; i < CREATURES.length; i += 1) {
			spec = CREATURES[i];
			seq = art.sequence(spec.id);
			if (seq) {
				this.kinds[spec.name] = { spec: spec, seq: seq };
			}
		}
		this.plants = [];
		for (i = 0; i < FOLIAGE.length; i += 1) {
			seq = art.sequence(FOLIAGE[i]);
			if (seq) {
				this.plants.push(seq);
			}
		}
		this.chosen = Object.keys(this.kinds);
		this.count = COUNTS.some;
		this.background = 'leaves';
		this.foliage = true;
		this.critters = [];
		this.leaves = [];
	}

	Rainforest.prototype.setType = function (name) {
		var raw = (name || 'all').toLowerCase().trim();
		var key = raw.replace(/['’]s$/, '');
		if (key === 'lehmans') {
			key = 'lehman';
		}
		if (raw === 'all' || raw === '' || !this.kinds[key]) {
			this.chosen = Object.keys(this.kinds);
			return;
		}
		this.chosen = [key];
	};

	Rainforest.prototype.fillColour = function () {
		var bg = this.background;
		if (bg === 'random') {
			bg = pick(Object.keys(GROUND));
		}
		return GROUND[bg] || null;
	};

	Rainforest.prototype.spawn = function (w, h) {
		var kind = this.kinds[pick(this.chosen)];
		var angle = rand(0, Math.PI * 2);
		var speed = kind.spec.speed * rand(0.8, 1.2);
		return {
			kind: kind,
			x: rand(0, w),
			y: rand(0, h),
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			next: rand(0.4, WANDER * 2),
			cycle: rand(0, kind.spec.len)
		};
	};

	Rainforest.prototype.reset = function (w, h) {
		var i, n, seq, frame;
		this.critters = [];
		for (i = 0; i < this.count && this.chosen.length; i += 1) {
			this.critters.push(this.spawn(w, h));
		}
		this.leaves = [];
		if (!this.foliage || !this.plants.length) {
			return;
		}
		n = Math.max(4, Math.round((w * h) / 90000));
		for (i = 0; i < n; i += 1) {
			seq = pick(this.plants);
			frame = 0;
			this.leaves.push({
				seq: seq,
				frame: frame,
				x: rand(0, w),
				y: rand(seq.height * 0.3, h - seq.height * 0.2)
			});
		}
	};

	Rainforest.prototype.step = function (dt, w, h) {
		var i, c, spec, pad, speed, angle;
		for (i = 0; i < this.critters.length; i += 1) {
			c = this.critters[i];
			spec = c.kind.spec;
			c.next -= dt;
			if (c.next <= 0) {
				angle = Math.atan2(c.vy, c.vx) + rand(-1.1, 1.1);
				speed = spec.speed * rand(0.8, 1.2);
				c.vx = Math.cos(angle) * speed;
				c.vy = Math.sin(angle) * speed;
				c.next = rand(WANDER * 0.4, WANDER * 2);
			}
			c.x += c.vx * dt;
			c.y += c.vy * dt;
			c.cycle += spec.step * dt;
			pad = c.kind.seq.width;
			if (c.x < -pad) {
				c.x = w + pad;
			} else if (c.x > w + pad) {
				c.x = -pad;
			}
			if (c.y < -pad) {
				c.y = h + pad;
			} else if (c.y > h + pad) {
				c.y = -pad;
			}
		}
	};

	Rainforest.prototype.drawBackground = function (ctx, w, h) {
		if (this.background === 'desktop') {
			ctx.clearRect(0, 0, w, h);
			return;
		}
		ctx.fillStyle = this.fillColour() || '#000';
		ctx.fillRect(0, 0, w, h);
	};

	Rainforest.prototype.draw = function (ctx, w, h) {
		this.drawBackground(ctx, w, h);
		var i, p, c, spec, idx;
		for (i = 0; i < this.leaves.length; i += 1) {
			p = this.leaves[i];
			p.seq.draw(ctx, p.frame, p.x, p.y);
		}
		for (i = 0; i < this.critters.length; i += 1) {
			c = this.critters[i];
			spec = c.kind.spec;
			idx = spec.from + (Math.floor(c.cycle) % spec.len);
			c.kind.seq.draw(ctx, idx, c.x, c.y, { flipX: c.vx > 0 });
		}
	};

	function RainforestElement() {
		return Reflect.construct(HTMLElement, [], RainforestElement);
	}
	RainforestElement.prototype = Object.create(HTMLElement.prototype);
	RainforestElement.prototype.constructor = RainforestElement;
	Object.setPrototypeOf(RainforestElement, HTMLElement);

	RainforestElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/rain';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		window.AfterDark.load(base).then(function (art) {
			var sim = new Rainforest(art);
			var number = (AfterDark.setting(self, 'number') || 'some').toLowerCase();
			sim.count = COUNTS[number] || parseInt(number, 10) || COUNTS.some;
			sim.setType(AfterDark.setting(self, 'type') || 'all');
			var bg = AfterDark.setting(self, 'background');
			if (bg !== null && bg !== '') {
				sim.background = bg.toLowerCase();
			}
			if (AfterDark.setting(self, 'foliage') !== null) {
				sim.foliage = AfterDark.flag(self, 'foliage');
			}
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
		}).catch(function (err) {
			self.textContent = err.message;
		});
	};

	RainforestElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-rainforest', RainforestElement);
	window.AfterDarkRainforest = Rainforest;
	Rainforest.CREATURES = CREATURES;
	Rainforest.COUNTS = COUNTS;
}());
