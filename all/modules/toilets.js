/**
 * toilets.js - Flying Toilets, composed from the original TOILETS.AD frames.
 *
 * The module stores one sequence whose frames are separate scene parts:
 *   0-2 occupants, 3 toilet, 4-7 flapping wings, 8-16 paper rolls,
 *   17-19 plungers, and 20 the occasional flying pig.
 *
 * The original control panel calls its options Crowd, Paper, Occupant and
 * Rude Sounds. There are no sound resources in this module, so this browser
 * version implements the three visual choices.
 */
(function () {
	'use strict';

	var SEQUENCE_ID = 9000;
	var CROWD_COUNTS = {
		few: 4,
		more: 8,
		'lots more': 12,
		'not pretty': 18,
		'phew!': 24
	};
	var OCCUPANTS = {
		nobody: null,
		"dumpin' dan": 0,
		bessie: 1,
		aaron: 2
	};
	var PAPER_FRAMES = {
		white: [8, 9, 10],
		'cow print': [11, 12, 13],
		pastel: [14, 15, 16]
	};
	var PAPER_NAMES = Object.keys(PAPER_FRAMES);
	var HEADING = { x: -0.88, y: 0.48 };
	var MIN_SPEED = 58;
	var MAX_SPEED = 96;
	var WING_FPS = 10;

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function Toilets(art) {
		this.art = art;
		this.sequence = art.sequence(SEQUENCE_ID);
		this.count = CROWD_COUNTS.more;
		this.paper = 'random';
		this.occupant = 'random';
		this.objects = [];
	}

	Toilets.prototype.occupantFrame = function () {
		if (this.occupant === 'random') {
			return pick([null, 0, 1, 2]);
		}
		return Object.prototype.hasOwnProperty.call(OCCUPANTS, this.occupant)
			? OCCUPANTS[this.occupant]
			: null;
	};

	Toilets.prototype.paperFrame = function () {
		var name = this.paper === 'random' ? pick(PAPER_NAMES) : this.paper;
		var frames = PAPER_FRAMES[name] || PAPER_FRAMES.white;
		return pick(frames);
	};

	Toilets.prototype.launch = function (w, h, scattered) {
		var scale = rand(0.72, 1.15);
		var speed = rand(MIN_SPEED, MAX_SPEED) * scale;
		var object = {
			scale: scale,
			speed: speed,
			wing: rand(0, 4),
			occupant: this.occupantFrame(),
			paper: this.paperFrame(),
			extra: Math.random() < 0.12 ? pick([17, 18, 19, 20]) : null
		};
		if (scattered) {
			object.x = rand(-40, w + 40);
			object.y = rand(-40, h + 40);
		} else if (Math.random() < h / Math.max(1, w + h)) {
			object.x = w + 100;
			object.y = rand(-80, h * 0.72);
		} else {
			object.x = rand(0, w + 100);
			object.y = -110;
		}
		return object;
	};

	Toilets.prototype.reset = function (w, h) {
		this.objects = [];
		for (var i = 0; i < this.count; i += 1) {
			this.objects.push(this.launch(w, h, true));
		}
		this.objects.sort(function (a, b) {
			return a.scale - b.scale;
		});
	};

	Toilets.prototype.step = function (dt, w, h) {
		for (var i = 0; i < this.objects.length; i += 1) {
			var object = this.objects[i];
			object.x += HEADING.x * object.speed * dt;
			object.y += HEADING.y * object.speed * dt;
			object.wing += WING_FPS * dt;
			if (object.x < -130 || object.y > h + 130) {
				this.objects[i] = this.launch(w, h, false);
			}
		}
	};

	Toilets.prototype.drawObject = function (ctx, object) {
		var sequence = this.sequence;
		var scale = object.scale;
		var trailX = object.x - HEADING.x * 68 * scale;
		var trailY = object.y - HEADING.y * 68 * scale;

		sequence.draw(ctx, object.paper, trailX, trailY, { scale: scale });
		if (object.extra !== null) {
			sequence.draw(ctx, object.extra,
				trailX - HEADING.x * 54 * scale,
				trailY - HEADING.y * 54 * scale,
				{ scale: scale });
		}
		sequence.draw(ctx, 4 + Math.floor(object.wing) % 4,
			object.x, object.y, { scale: scale });
		sequence.draw(ctx, 3, object.x, object.y, { scale: scale });
		if (object.occupant !== null) {
			sequence.draw(ctx, object.occupant, object.x, object.y - 13 * scale,
				{ scale: scale });
		}
	};

	Toilets.prototype.draw = function (ctx, w, h) {
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		for (var i = 0; i < this.objects.length; i += 1) {
			this.drawObject(ctx, this.objects[i]);
		}
	};

	function ToiletsElement() {
		return Reflect.construct(HTMLElement, [], ToiletsElement);
	}
	ToiletsElement.prototype = Object.create(HTMLElement.prototype);
	ToiletsElement.prototype.constructor = ToiletsElement;
	Object.setPrototypeOf(ToiletsElement, HTMLElement);

	ToiletsElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		var base = this.getAttribute('art') || 'art/toilets';
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		window.AfterDark.load(base).then(function (art) {
			var sim = new Toilets(art);
			if (!sim.sequence) {
				throw new Error('Flying Toilets artwork is missing sequence ' + SEQUENCE_ID);
			}
			var crowd = (AfterDark.setting(self, 'crowd') || 'more').toLowerCase();
			var paper = (AfterDark.setting(self, 'paper') || 'random').toLowerCase();
			var occupant = (AfterDark.setting(self, 'occupant') || 'random').toLowerCase();
			sim.count = CROWD_COUNTS[crowd] || parseInt(crowd, 10) || CROWD_COUNTS.more;
			sim.count = Math.max(1, Math.min(CROWD_COUNTS['phew!'], sim.count));
			if (paper === 'random' || PAPER_FRAMES[paper]) {
				sim.paper = paper;
			}
			if (occupant === 'random' ||
				Object.prototype.hasOwnProperty.call(OCCUPANTS, occupant)) {
				sim.occupant = occupant;
			}

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
			console.error('Could not start Flying Toilets:', error);
			self.textContent = error.message;
		});
	};

	ToiletsElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-toilets', ToiletsElement);
	window.AfterDarkToilets = Toilets;
}());
