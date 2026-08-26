/**
 * shapes.js - Shapes, drawn the way the original module drew itself.
 *
 * SHAPES.AD ships no artwork. Its own description:
 *
 *   "SHAPES (tm) fills the screen with a rapid succession of geometric
 *    shapes.
 *    Original design and concept by Jack Eastman.
 *    If 'Clear Screen First' is checked, the screen is blanked before the
 *    shapes start appearing.
 *    Use the 'Color' check box to select color or black & white shapes."
 *
 *   <after-dark-shapes color clear-screen>
 */
(function () {
	'use strict';

	var PER_FRAME = 3;
	var KINDS = ['rect', 'ellipse', 'triangle', 'diamond', 'line'];

	function rand(a, b) {
		return a + Math.random() * (b - a);
	}

	function pick(list) {
		return list[Math.floor(Math.random() * list.length)];
	}

	function colour(useColour) {
		if (!useColour) {
			var g = Math.floor(rand(40, 230));
			return 'rgb(' + g + ',' + g + ',' + g + ')';
		}
		return 'hsl(' + Math.floor(rand(0, 360)) + ',70%,' + Math.floor(rand(40, 70)) + '%)';
	}

	function Shapes() {
		this.color = true;
		this.clearScreen = true;
		this.cleared = false;
	}

	Shapes.prototype.reset = function () {
		this.cleared = false;
	};

	Shapes.prototype.paint = function (ctx, w, h) {
		var kind = pick(KINDS);
		var x = rand(0, w);
		var y = rand(0, h);
		var s = rand(12, Math.min(w, h) * 0.45);
		ctx.fillStyle = colour(this.color);
		ctx.strokeStyle = ctx.fillStyle;
		ctx.lineWidth = rand(1, 4);
		if (kind === 'rect') {
			ctx.fillRect(x - s / 2, y - s / 2, s, s * rand(0.4, 1.4));
		} else if (kind === 'ellipse') {
			ctx.beginPath();
			ctx.ellipse(x, y, s / 2, s * rand(0.2, 0.7), rand(0, Math.PI), 0, Math.PI * 2);
			ctx.fill();
		} else if (kind === 'triangle') {
			ctx.beginPath();
			ctx.moveTo(x, y - s / 2);
			ctx.lineTo(x + s / 2, y + s / 2);
			ctx.lineTo(x - s / 2, y + s / 2);
			ctx.closePath();
			ctx.fill();
		} else if (kind === 'diamond') {
			ctx.beginPath();
			ctx.moveTo(x, y - s / 2);
			ctx.lineTo(x + s / 2, y);
			ctx.lineTo(x, y + s / 2);
			ctx.lineTo(x - s / 2, y);
			ctx.closePath();
			ctx.fill();
		} else {
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x + rand(-s, s), y + rand(-s, s));
			ctx.stroke();
		}
	};

	Shapes.prototype.step = function () {};

	Shapes.prototype.draw = function (ctx, w, h) {
		var i;
		if (!this.cleared) {
			if (this.clearScreen) {
				ctx.fillStyle = '#000';
				ctx.fillRect(0, 0, w, h);
			} else {
				ctx.clearRect(0, 0, w, h);
			}
			this.cleared = true;
		}
		for (i = 0; i < PER_FRAME; i += 1) {
			this.paint(ctx, w, h);
		}
	};

	function ShapesElement() {
		return Reflect.construct(HTMLElement, [], ShapesElement);
	}
	ShapesElement.prototype = Object.create(HTMLElement.prototype);
	ShapesElement.prototype.constructor = ShapesElement;
	Object.setPrototypeOf(ShapesElement, HTMLElement);

	ShapesElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		var self = this;
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Shapes();
		sim.color = AfterDark.flag(self, 'color');
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

	ShapesElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-shapes', ShapesElement);
	window.AfterDarkShapes = Shapes;
	Shapes.colour = colour;
	Shapes.KINDS = KINDS;
}());
