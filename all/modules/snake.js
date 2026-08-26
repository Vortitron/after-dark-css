/**
 * snake.js - Snake, drawn the way the original module drew itself.
 *
 * SNAKE.AD ships no artwork. Its own description:
 *
 *   "SNAKE (tm) creates a random maze and then tries to solve it. See if you
 *    can solve the maze before the snake!
 *    Solution speed -- controls how fast the snake solves the maze.
 *    Maze complexity -- controls complexity of the maze."
 *   By Alex Ze.
 *
 * The settings are its own, out of TYPE_1000. Solution speed and maze
 * complexity were sliders 1-9; here they are Slow / Medium / Fast and
 * Simple / Medium / Twisty. Pause when done is 0 sec / 1 sec / 3 sec /
 * 5 sec / 10 sec / 15 sec / 30 sec / 1 min.
 *
 *   <after-dark-snake speed="medium" maze-complexity="medium"
 *     pause-when-done="5 sec">
 */
(function () {
	'use strict';

	var SPEED = { slow: 8, medium: 18, fast: 36 };
	var COMPLEXITY = {
		simple: { cols: 12, rows: 8 },
		medium: { cols: 20, rows: 13 },
		twisty: { cols: 32, rows: 20 }
	};
	var PAUSE = {
		'0 sec': 0,
		'1 sec': 1,
		'3 sec': 3,
		'5 sec': 5,
		'10 sec': 10,
		'15 sec': 15,
		'30 sec': 30,
		'1 min': 60
	};

	var N = 1, E = 2, S = 4, W = 8;
	var OPP = {};
	OPP[N] = S;
	OPP[E] = W;
	OPP[S] = N;
	OPP[W] = E;
	var DX = {};
	DX[N] = 0;
	DX[E] = 1;
	DX[S] = 0;
	DX[W] = -1;
	var DY = {};
	DY[N] = -1;
	DY[E] = 0;
	DY[S] = 1;
	DY[W] = 0;
	var DIRS = [N, E, S, W];

	function shuffle(list) {
		var i, j, t;
		for (i = list.length - 1; i > 0; i -= 1) {
			j = Math.floor(Math.random() * (i + 1));
			t = list[i];
			list[i] = list[j];
			list[j] = t;
		}
		return list;
	}

	function cellKey(x, y) {
		return x + ',' + y;
	}

	/** Perfect maze, recursive backtracker. Each cell starts with all walls. */
	function generateMaze(cols, rows) {
		console.assert(cols >= 2 && rows >= 2, 'maze needs room to turn');
		var grid = [];
		var x, y, stack, cx, cy, dirs, d, nx, ny, carved;
		for (y = 0; y < rows; y += 1) {
			grid[y] = [];
			for (x = 0; x < cols; x += 1) {
				grid[y][x] = N | E | S | W;
			}
		}
		stack = [{ x: 0, y: 0 }];
		var seen = {};
		seen[cellKey(0, 0)] = true;
		while (stack.length) {
			cx = stack[stack.length - 1].x;
			cy = stack[stack.length - 1].y;
			dirs = shuffle(DIRS.slice());
			carved = false;
			for (d = 0; d < dirs.length; d += 1) {
				nx = cx + DX[dirs[d]];
				ny = cy + DY[dirs[d]];
				if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
					continue;
				}
				if (seen[cellKey(nx, ny)]) {
					continue;
				}
				grid[cy][cx] &= ~dirs[d];
				grid[ny][nx] &= ~OPP[dirs[d]];
				seen[cellKey(nx, ny)] = true;
				stack.push({ x: nx, y: ny });
				carved = true;
				break;
			}
			if (!carved) {
				stack.pop();
			}
		}
		return { cols: cols, rows: rows, grid: grid };
	}

	/** Shortest path from (0,0) to the far corner, walking open walls. */
	function solveMaze(maze) {
		var start = { x: 0, y: 0 };
		var goalX = maze.cols - 1;
		var goalY = maze.rows - 1;
		var q = [start];
		var prev = {};
		var seen = {};
		seen[cellKey(0, 0)] = true;
		var i, cur, d, nx, ny, key, path, p;
		while (q.length) {
			cur = q.shift();
			if (cur.x === goalX && cur.y === goalY) {
				path = [];
				p = cur;
				while (p) {
					path.push(p);
					p = prev[cellKey(p.x, p.y)];
				}
				path.reverse();
				return path;
			}
			for (i = 0; i < DIRS.length; i += 1) {
				d = DIRS[i];
				if (maze.grid[cur.y][cur.x] & d) {
					continue;
				}
				nx = cur.x + DX[d];
				ny = cur.y + DY[d];
				key = cellKey(nx, ny);
				if (seen[key]) {
					continue;
				}
				seen[key] = true;
				prev[key] = cur;
				q.push({ x: nx, y: ny });
			}
		}
		return [{ x: 0, y: 0 }];
	}

	function Snake() {
		this.speed = SPEED.medium;
		this.complexity = COMPLEXITY.medium;
		this.pause = PAUSE['5 sec'];
		this.maze = null;
		this.path = [];
		this.along = 0;
		this.wait = 0;
		this.done = false;
	}

	Snake.prototype.rebuild = function (w, h) {
		var spec = this.complexity;
		var cols = spec.cols;
		var rows = spec.rows;
		/* Keep cells roughly square and on-screen. */
		var cell = Math.max(8, Math.floor(Math.min((w - 16) / cols, (h - 16) / rows)));
		this.cell = cell;
		this.originX = Math.floor((w - cols * cell) / 2);
		this.originY = Math.floor((h - rows * cell) / 2);
		this.maze = generateMaze(cols, rows);
		this.path = solveMaze(this.maze);
		console.assert(this.path.length >= 2, 'maze should have a path');
		this.along = 1;
		this.done = false;
		this.wait = 0;
	};

	Snake.prototype.step = function (dt, w, h) {
		if (!this.maze) {
			this.rebuild(w, h);
			return;
		}
		if (this.done) {
			this.wait -= dt;
			if (this.wait <= 0) {
				this.rebuild(w, h);
			}
			return;
		}
		this.along += dt * this.speed;
		if (this.along >= this.path.length) {
			this.along = this.path.length;
			this.done = true;
			this.wait = this.pause;
		}
	};

	Snake.prototype.draw = function (ctx, w, h) {
		var maze = this.maze;
		var cell = this.cell;
		var ox = this.originX;
		var oy = this.originY;
		var x, y, walls, px, py, i, p, shown;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, w, h);
		if (!maze) {
			return;
		}
		ctx.strokeStyle = '#6ecb6e';
		ctx.lineWidth = 2;
		ctx.beginPath();
		for (y = 0; y < maze.rows; y += 1) {
			for (x = 0; x < maze.cols; x += 1) {
				walls = maze.grid[y][x];
				px = ox + x * cell;
				py = oy + y * cell;
				if (walls & N) {
					ctx.moveTo(px, py);
					ctx.lineTo(px + cell, py);
				}
				if (walls & W) {
					ctx.moveTo(px, py);
					ctx.lineTo(px, py + cell);
				}
				if (y === maze.rows - 1 && (walls & S)) {
					ctx.moveTo(px, py + cell);
					ctx.lineTo(px + cell, py + cell);
				}
				if (x === maze.cols - 1 && (walls & E)) {
					ctx.moveTo(px + cell, py);
					ctx.lineTo(px + cell, py + cell);
				}
			}
		}
		ctx.stroke();

		shown = Math.min(this.path.length, Math.max(1, Math.floor(this.along)));
		ctx.fillStyle = '#d2ff4a';
		for (i = 0; i < shown; i += 1) {
			p = this.path[i];
			ctx.fillRect(ox + p.x * cell + 3, oy + p.y * cell + 3, cell - 6, cell - 6);
		}
		p = this.path[shown - 1];
		ctx.fillStyle = '#fff47a';
		ctx.beginPath();
		ctx.arc(ox + p.x * cell + cell / 2, oy + p.y * cell + cell / 2,
			Math.max(3, cell / 3), 0, Math.PI * 2);
		ctx.fill();
	};

	function SnakeElement() {
		return Reflect.construct(HTMLElement, [], SnakeElement);
	}
	SnakeElement.prototype = Object.create(HTMLElement.prototype);
	SnakeElement.prototype.constructor = SnakeElement;
	Object.setPrototypeOf(SnakeElement, HTMLElement);

	SnakeElement.prototype.connectedCallback = function () {
		if (this._screen) {
			return;
		}
		this.style.display = this.style.display || 'block';
		this.style.background = '#000';

		var sim = new Snake();
		var speed = (AfterDark.setting(this, 'speed') || 'medium').toLowerCase();
		var maze = (AfterDark.setting(this, 'maze-complexity') || 'medium').toLowerCase();
		var pause = (AfterDark.setting(this, 'pause-when-done') || '5 sec').toLowerCase();
		sim.speed = SPEED[speed] || parseInt(speed, 10) || SPEED.medium;
		sim.complexity = COMPLEXITY[maze] || COMPLEXITY.medium;
		sim.pause = PAUSE[pause] !== undefined ? PAUSE[pause] : PAUSE['5 sec'];

		var screen = new AfterDark.Screen(this);
		this._screen = screen;
		this.sim = sim;
		screen.onresize = function (width, height) {
			sim.rebuild(width, height);
		};
		sim.rebuild(screen.width, screen.height);
		screen.run(function (dt, ctx, width, height) {
			sim.step(dt, width, height);
			sim.draw(ctx, width, height);
		});
	};

	SnakeElement.prototype.disconnectedCallback = function () {
		if (this._screen) {
			this._screen.stop();
			this._screen = null;
		}
	};

	customElements.define('after-dark-snake', SnakeElement);
	window.AfterDarkSnake = Snake;
	Snake.generateMaze = generateMaze;
	Snake.solveMaze = solveMaze;
	Snake.SPEED = SPEED;
	Snake.COMPLEXITY = COMPLEXITY;
	Snake.PAUSE = PAUSE;
}());
