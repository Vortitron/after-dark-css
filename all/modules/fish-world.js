/**
 * fish-world.js - Fish World, on the module's own artwork.
 *
 * FISH.AD, After Dark 4.0. Its own description:
 *
 *   "Fish World:  Have you changed their water lately?"
 *   Species names from STRINGLIST 666: Blue Bird Wrasse, Boxfish, Sea Horse,
 *   Filefish, Mandarin, Pajama Cardinal, Picasso, Pufferfish, Tamarin.
 *
 * The settings are its own, out of TYPE_1000: Select Fish... and Show
 * Background. There is no count slider, so the tank fills to a school that
 * scales with the screen.
 *
 * Artwork, from tools/adweb.py, using the longest stable broadside run of
 * each species and mirroring for the other way. Shrinking edge-on turns and
 * the tiny accessory frames are skipped, as in Fish Pro. 16000 is scenery,
 * 16001 a bubble stream, 16500-16502 coral. Show Background plants the coral
 * on a dark tank; the PE BITMAPs 1000-1008 are species picker icons, not a
 * floor to tile.
 *
 *   <after-dark-fish-world art="art/fish" show-background></after-dark-fish-world>
 */
(function () {
	'use strict';

	/* name from STRINGLIST 666, sequence, first frame and length of the
	   swim cycle, and how fast it goes. Art faces left. */
	var SPECIES = [
		{ name: 'Blue Bird Wrasse', id: '16010', from: 0, len: 13, speed: 38 },
		{ name: 'Boxfish',          id: '16026', from: 5, len: 7,  speed: 22 },
		{ name: 'Sea Horse',        id: '16002', from: 0, len: 10, speed: 12 },
		{ name: 'Filefish',         id: '16024', from: 0, len: 19, speed: 28 },
		{ name: 'Mandarin',         id: '16018', from: 0, len: 9,  speed: 26 },
		{ name: 'Pajama Cardinal',  id: '16022', from: 0, len: 9,  speed: 30 },
		{ name: 'Picasso',          id: '16003', from: 0, len: 6,  speed: 32 },
		{ name: 'Pufferfish',       id: '16013', from: 0, len: 11, speed: 20 },
		{ name: 'Tamarin',          id: '16009', from: 0, len: 19, speed: 34 }
	];

	var CORAL = [
		{ id: '16500', frames: [0, 1, 2, 3] },
		{ id: '16501', frames: [0, 1, 2, 3] },
		{ id: '16502', frames: [0, 2, 3] }
	];
	var BUBBLES = '16001';
	var SWIM = 4;
	var BUBBLE = 8;
	var SCHOOL_AREA = 42000;
	var SCHOOL_MIN = 6;
	var SCHOOL_MAX = 22;
	var WATER = '#001428';

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function schoolSize(w, h) {
		return Math.max(SCHOOL_MIN, Math.min(SCHOOL_MAX, Math.round((w * h) / SCHOOL_AREA)));
	}

	function FishWorld(art) {
		this.art = art;
		this.species = [];
		var i;
		for (i = 0; i < SPECIES.length; i += 1) {
			var spec = SPECIES[i];
			var seq = art.sequence(spec.id);
			if (!seq) {
				continue;
			}
			this.species.push({ spec: spec, seq: seq });
		}
		this.coral = [];
		for (i = 0; i < CORAL.length; i += 1) {
			var cseq = art.sequence(CORAL[i].id);
			if (cseq) {
				this.coral.push({ seq: cseq, frames: CORAL[i].frames });
			}
		}
		this.bubbles = art.sequence(BUBBLES);
		this.chosen = null;
		this.showBackground = true;
		this.fish = [];
		this.props = [];
		this.streams = [];
	}

	FishWorld.prototype.pool = function () {
		var chosen = this.chosen;
		if (!chosen) {
			return this.species;
		}
		var out = this.species.filter(function (s) {
			return chosen.indexOf(s.spec.name.toLowerCase()) >= 0;
		});
		return out.length ? out : this.species;
	};

	FishWorld.prototype.spawn = function (w, h, anywhere) {
		var s = pick(this.pool());
		var spec = s.spec;
		var right = Math.random() < 0.5;
		var speed = spec.speed * rand(0.75, 1.25);
		var fw = s.seq.frames[spec.from].w;
		var fh = s.seq.frames[spec.from].h;
		return {
			s: s,
			right: right,
			vx: right ? speed : -speed,
			x: anywhere ? rand(0, w) : (right ? -fw : w + fw),
			y: rand(fh * 0.6, Math.max(fh * 0.7, h - fh * 0.45)),
			drift: spec.name === 'Sea Horse' ? rand(-18, 18) : rand(-8, 8),
			cycle: rand(0, spec.len)
		};
	};

	FishWorld.prototype.reset = function (w, h) {
		var i, n;
		this.fish = [];
		n = schoolSize(w, h);
		for (i = 0; i < n && this.species.length; i += 1) {
			this.fish.push(this.spawn(w, h, true));
		}
		this.props = [];
		this.streams = [];
		if (!this.showBackground) {
			return;
		}
		var floor = h * 0.82;
		n = Math.max(3, Math.round(w / 280));
		for (i = 0; i < n && this.coral.length; i += 1) {
			var c = pick(this.coral);
			var frame = pick(c.frames);
			var f = c.seq.frames[frame];
			this.props.push({
				seq: c.seq,
				frame: frame,
				x: rand(f.w * 0.3, w - f.w * 0.3),
				y: floor - f.h * 0.15
			});
		}
		if (this.bubbles) {
			for (i = 0; i < 3; i += 1) {
				this.streams.push({
					x: rand(0, w),
					y: rand(h * 0.4, h),
					frame: rand(3, 12),
					rise: rand(18, 36)
				});
			}
		}
	};

	FishWorld.prototype.step = function (dt, w, h) {
		var i, f, spec, pad, fh;
		for (i = 0; i < this.fish.length; i += 1) {
			f = this.fish[i];
			spec = f.s.spec;
			f.x += f.vx * dt;
			f.y += f.drift * dt;
			f.cycle += SWIM * dt;
			fh = f.s.seq.frames[spec.from].h;
			if (f.y < fh * 0.5 || f.y > h - fh * 0.35) {
				f.drift = -f.drift;
				f.y = Math.min(Math.max(f.y, fh * 0.5), h - fh * 0.35);
			}
			pad = f.s.seq.frames[spec.from].w;
			if ((f.vx > 0 && f.x > w + pad) || (f.vx < 0 && f.x < -pad)) {
				this.fish[i] = this.spawn(w, h, false);
			}
		}
		for (i = 0; i < this.streams.length; i += 1) {
			this.streams[i].frame += BUBBLE * dt;
			this.streams[i].y -= this.streams[i].rise * dt;
			if (this.streams[i].y < -20) {
				this.streams[i].y = h;
				this.streams[i].x = rand(0, w);
			}
		}
	};

	FishWorld.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = this.showBackground ? WATER : '#000';
		ctx.fillRect(0, 0, w, h);
		var i, p, f, spec, idx;
		for (i = 0; i < this.props.length; i += 1) {
			p = this.props[i];
			p.seq.draw(ctx, p.frame, p.x, p.y);
		}
		for (i = 0; i < this.fish.length; i += 1) {
			f = this.fish[i];
			spec = f.s.spec;
			idx = spec.from + (Math.floor(f.cycle) % spec.len);
			f.s.seq.draw(ctx, idx, f.x, f.y, { flipX: f.right });
		}
		if (this.bubbles && this.showBackground) {
			for (i = 0; i < this.streams.length; i += 1) {
				p = this.streams[i];
				this.bubbles.draw(ctx, 3 + (Math.floor(p.frame) % 9), p.x, p.y);
			}
		}
	};

	function FishWorldElement() {
		return Reflect.construct(HTMLElement, [], FishWorldElement);
	}
	FishWorldElement.prototype = Object.create(HTMLElement.prototype);
	FishWorldElement.prototype.constructor = FishWorldElement;
	Object.setPrototypeOf(FishWorldElement, HTMLElement);

	FishWorldElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/fish';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		window.AfterDark.load(base).then(function (art) {
			var sim = new FishWorld(art);
			if (AfterDark.setting(self, 'show-background') !== null) {
				sim.showBackground = AfterDark.flag(self, 'show-background');
			}
			var only = AfterDark.setting(self, 'select-fish');
			if (only && only.toLowerCase() !== 'all') {
				sim.chosen = only.toLowerCase().split(',').map(function (s) {
					return s.trim();
				});
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

	FishWorldElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-fish-world', FishWorldElement);
	window.AfterDarkFishWorld = FishWorld;
	FishWorld.SPECIES = SPECIES;
	FishWorld.schoolSize = schoolSize;
	FishWorld.SCHOOL_MIN = SCHOOL_MIN;
	FishWorld.SCHOOL_MAX = SCHOOL_MAX;
}());
