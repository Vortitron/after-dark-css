#!/usr/bin/env node
/**
 * Unit tests for the savers that can run without a browser canvas.
 *
 *   node tools/test-savers.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.resolve(__dirname, '..');

function stubDom() {
	function HTMLElement() {}
	global.HTMLElement = HTMLElement;
	global.Reflect = Reflect;
	global.customElements = { define: function () {} };
	global.window = global;
	global.document = {
		createElement: function () {
			return {
				getContext: function () { return null; },
				width: 0,
				height: 0
			};
		}
	};
	global.AfterDark = {
		setting: function () { return null; },
		flag: function () { return false; },
		Screen: function () {},
		load: function () { return Promise.reject(new Error('no art in tests')); }
	};
}

function loadModule(name) {
	var src = fs.readFileSync(path.join(root, 'all/modules', name + '.js'), 'utf8');
	eval(src);
}

function testGravity() {
	loadModule('gravity');
	var Gravity = global.AfterDarkGravity;
	assert.strictEqual(Gravity.MIN_BALLS, 1);
	assert.strictEqual(Gravity.MAX_BALLS, 7);
	assert.strictEqual(Gravity.SIZES.medium, 18);

	var a = { x: 0, y: 0, radius: 10, mass: 100 };
	var b = { x: 40, y: 0, radius: 10, mass: 100 };
	var force = Gravity.pull(a, b);
	assert.ok(force.x > 0, 'A is pulled toward B (positive x)');
	assert.ok(Math.abs(force.y) < 1e-9, 'no vertical pull when they share y');

	var sim = new Gravity();
	sim.count = 3;
	sim.reset(320, 240);
	assert.strictEqual(sim.balls.length, 3);
	var before = sim.balls.map(function (ball) {
		return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
	});
	sim.step(0.016, 320, 240);
	var moved = sim.balls.some(function (ball, i) {
		return ball.x !== before[i].x || ball.y !== before[i].y ||
			ball.vx !== before[i].vx || ball.vy !== before[i].vy;
	});
	assert.ok(moved, 'a step changes position or velocity');
}

function testSnake() {
	loadModule('snake');
	var Snake = global.AfterDarkSnake;
	var maze = Snake.generateMaze(8, 6);
	assert.strictEqual(maze.cols, 8);
	assert.strictEqual(maze.rows, 6);
	assert.strictEqual(maze.grid.length, 6);
	assert.strictEqual(maze.grid[0].length, 8);

	var path = Snake.solveMaze(maze);
	assert.ok(path.length >= 2, 'there is a path');
	assert.strictEqual(path[0].x, 0);
	assert.strictEqual(path[0].y, 0);
	assert.strictEqual(path[path.length - 1].x, 7);
	assert.strictEqual(path[path.length - 1].y, 5);

	var sim = new Snake();
	sim.complexity = { cols: 10, rows: 8 };
	sim.rebuild(400, 300);
	assert.ok(sim.maze);
	assert.ok(sim.path.length >= 2);
	var along = sim.along;
	sim.step(1, 400, 300);
	assert.ok(sim.along > along, 'the snake advances');
}

function testZot() {
	loadModule('zot');
	var Zot = global.AfterDarkZot;
	var straight = Zot.displace([{ x: 0, y: 0 }, { x: 0, y: 100 }], 0, 3);
	assert.ok(straight.length >= 2);
	assert.strictEqual(straight[0].x, 0);
	assert.strictEqual(straight[straight.length - 1].y, 100);

	var bolts = Zot.strike(320, 240, 3, 0.3);
	assert.ok(bolts.length >= 1, 'at least the main bolt');
	assert.ok(bolts[0].length >= 2, 'the main bolt has points');
	assert.ok(bolts.length >= 2, 'forky strike grows side bolts');

	var sim = new Zot();
	sim.gap = 10;
	sim.wait = 0;
	sim.step(0.016, 320, 240);
	assert.ok(sim.bolts.length >= 1, 'a due strike fires');
	assert.ok(sim.flash > 0, 'the screen flashes');
}

function stubSeq() {
	return {
		width: 40,
		height: 40,
		count: 1,
		frames: [{ x: 0, y: 0, w: 40, h: 40 }],
		draw: function () {}
	};
}

function stubArt() {
	var seq = stubSeq();
	return {
		sequence: function () { return seq; },
		bitmap: function () { return null; }
	};
}

function testTables() {
	loadModule('bogglins');
	var Bogglins = global.AfterDarkBogglins;
	assert.ok(Bogglins.EXPLOSIVITY.volatile > Bogglins.EXPLOSIVITY.unstable);
	assert.ok(Bogglins.TWANG.sharp.height > Bogglins.TWANG.mild.height);

	loadModule('om');
	var Om = global.AfterDarkOm;
	assert.strictEqual(Om.ENTITIES.some, 6);
	assert.strictEqual(Om.DEFROST.never, 0);
	assert.strictEqual(Om.KARMA.complete, 1);
	assert.ok(Om.ENERGY['5000 kwh'] > Om.ENERGY['1000 kwh']);
}

function testFishWorld() {
	loadModule('fish-world');
	var FishWorld = global.AfterDarkFishWorld;
	assert.strictEqual(FishWorld.SPECIES.length, 9);
	var names = FishWorld.SPECIES.map(function (s) { return s.name; });
	assert.ok(names.indexOf('Blue Bird Wrasse') >= 0);
	assert.ok(names.indexOf('Sea Horse') >= 0);
	var n = FishWorld.schoolSize(800, 600);
	assert.ok(n >= FishWorld.SCHOOL_MIN && n <= FishWorld.SCHOOL_MAX);
}

function testRainforest() {
	loadModule('rainforest');
	var Rainforest = global.AfterDarkRainforest;
	assert.ok(Rainforest.COUNTS.hordes > Rainforest.COUNTS.few);
	assert.strictEqual(Rainforest.CREATURES.length, 6);
	var sim = new Rainforest(stubArt());
	sim.setType('dragonfly');
	assert.deepStrictEqual(sim.chosen, ['dragonfly']);
	sim.setType("lehman");
	assert.deepStrictEqual(sim.chosen, ['lehman']);
	sim.setType("lehman\'s");
	assert.deepStrictEqual(sim.chosen, ['lehman']);
	sim.setType('all');
	assert.strictEqual(sim.chosen.length, 6);
	sim.reset(320, 240);
	assert.strictEqual(sim.critters.length, sim.count);
}

function testDraino() {
	loadModule('draino');
	var Draino = global.AfterDarkDraino;
	assert.ok(Draino.SPEED.fast > Draino.SPEED.slow);
	var sim = new Draino();
	sim.reset(320, 240);
	assert.ok(sim.bits.length > 50);
	var first = sim.bits[0];
	var before = { x: first.x, y: first.y };
	sim.step(0.05, 320, 240);
	assert.ok(first.x !== before.x || first.y !== before.y, 'water moves');
}

function testShapes() {
	loadModule('shapes');
	var Shapes = global.AfterDarkShapes;
	var grey = Shapes.colour(false);
	assert.ok(/^rgb\(/.test(grey));
	assert.ok(Shapes.KINDS.indexOf('ellipse') >= 0);
}

function testSpheres() {
	loadModule('spheres');
	var Spheres = global.AfterDarkSpheres;
	var round = Spheres.makeSphere(320, 240, 40, 0);
	assert.ok(round.rx >= 8 && round.rx <= 40);
	assert.strictEqual(round.ry, round.rx);
	var egg = Spheres.makeSphere(320, 240, 40, 60);
	assert.ok(egg.ry < egg.rx);
}

stubDom();
testGravity();
testSnake();
testZot();
testTables();
testFishWorld();
testRainforest();
testDraino();
testShapes();
testSpheres();
console.log('ok — gravity, snake, zot, bogglins, om, fish-world, rainforest, draino, shapes, spheres');
