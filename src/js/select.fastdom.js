// Project: ui.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: utils/fastdom
// Batches DOM reads and writes to reduce layout thrashing. This module is a
// FastDOM scheduling pattern that exposes a shared instance for queueing
// measurement and mutation work.
//
// See: <https://raw.githubusercontent.com/wilsonpage/fastdom/refs/heads/master/fastdom.js>

const win = typeof globalThis !== "undefined" && globalThis.window;

// Constant: raf
// Normalized animation-frame scheduler, with a timeout fallback outside the DOM.
const raf = win
	? win.requestAnimationFrame ||
		win.webkitRequestAnimationFrame ||
		win.mozRequestAnimationFrame ||
		win.msRequestAnimationFrame ||
		((cb) => setTimeout(() => cb(0), 16))
	: (cb) => cb(0);

// ----------------------------------------------------------------------------
//
// FASTDOM
//
// ----------------------------------------------------------------------------

// Class: FastDOM
// Scheduler that batches `measure` and `mutate` work into animation frames.
// - reads - queued read tasks
// - writes - queued write tasks
// - isRunning - indicates whether a queue is currently flushing
// - raf - frame scheduler used to trigger flushes
// - catch - optional error handler for flush failures
class FastDOM {
	constructor() {
		this.reads = [];
		this.writes = [];
		this.isRunning = false;
		this.raf = win ? raf.bind(win) : raf;
		this.catch = null;
		this.scheduled = false;
	}

	// Method: runFastDOMTasks
	// Flushes the queued `tasks` and leaves `isRunning` consistent even when a
	// task throws.
	runFastDOMTasks(tasks) {
		this.isRunning = true;
		try {
			let task;
			while (true) {
				task = tasks.shift();
				if (task === undefined) break;
				task();
			}
		} finally {
			this.isRunning = false;
		}
	}

	// Method: measure
	// Queues `fn` in the read phase, binding it to `ctx` when provided.
	measure(fn, ctx) {
		const task = !ctx ? fn : fn.bind(ctx);
		this.reads.push(task);
		scheduleFlush(this);
		return task;
	}

	// Method: mutate
	// Queues `fn` in the write phase, binding it to `ctx` when provided.
	mutate(fn, ctx) {
		const task = !ctx ? fn : fn.bind(ctx);
		this.writes.push(task);
		scheduleFlush(this);
		return task;
	}

	// Method: clear
	// Removes `task` from either queue and returns whether it was found.
	clear(task) {
		return remove(this.reads, task) || remove(this.writes, task);
	}

	// Method: extend
	// Creates a child scheduler that inherits this instance and mixes in `props`.
	extend(props) {
		if (typeof props !== "object") throw new Error("expected object");

		const child = Object.create(this);
		mixin(child, props);

		if (child.initialize) child.initialize(props);

		return child;
	}
}

// ----------------------------------------------------------------------------
//
// INTERNAL OPERATIONS
//
// ----------------------------------------------------------------------------

// Function: scheduleFlush
// Schedules a flush for `fastdom` when no frame is currently pending.
function scheduleFlush(fastdom) {
	if (!fastdom.scheduled) {
		fastdom.scheduled = true;
		fastdom.raf(() => flush(fastdom));
	}
}

// Function: flush
// Runs queued read tasks before write tasks for `fastdom`, rescheduling when
// pending work remains after an error.
function flush(fastdom) {
	const writes = fastdom.writes;
	const reads = fastdom.reads;
	let error;

	try {
		fastdom.runFastDOMTasks(reads);
		fastdom.runFastDOMTasks(writes);
	} catch (e) {
		error = e;
	}

	fastdom.scheduled = false;

	if (reads.length || writes.length) scheduleFlush(fastdom);

	if (error) {
		if (fastdom.catch) fastdom.catch(error);
		else throw error;
	}
}

// Function: remove
// Removes `item` from `array` and returns whether the array changed.
function remove(array, item) {
	const index = array.indexOf(item);
	return index !== -1 && array.splice(index, 1).length > 0;
}

// Function: mixin
// Copies own enumerable properties from `source` into `target`.
function mixin(target, source) {
	for (const key in source) {
		if (Object.hasOwn(source, key)) target[key] = source[key];
	}
}

const fastdom = new FastDOM();

export { raf, fastdom, FastDOM };
export default fastdom;

// EOF
