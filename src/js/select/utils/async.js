// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-07-30

// Module: select/utils/async
// Deferred, throttled, and batched execution helpers that coalesce repeated
// work behind a timeout. Use these helpers to debounce or rate-limit expensive
// UI updates, or to aggregate values for a later turn, without pulling in a
// larger scheduler abstraction.

// ----------------------------------------------------------------------------
//
// TYPES
//
// ----------------------------------------------------------------------------

// Type: DeferredCallback
// Callback executed by a <Deferred> instance when the scheduled delay expires.

// Type: BatchedCallback
// Callback executed by a <Batched> instance with the aggregated values.

// ----------------------------------------------------------------------------
//
// DEFERRED
//
// ----------------------------------------------------------------------------

// Class: Deferred
// Mutable deferred task that can be rescheduled, cancelled, or run immediately.
// Each `push` resets the timer so only the last schedule after a quiet period
// runs (debounce).
// - callback: DeferredCallback - callback invoked when the task runs
// - delay: number - default delay in milliseconds
// - timeout: ReturnType<typeof setTimeout> - active timer handle when scheduled
class Deferred {
	constructor(callback, delay = 0, start = false) {
		this.callback = callback;
		this._run = this.run.bind(this);
		this.delay = delay;
		if (start) {
			this.push(delay);
		}
	}

	// Method: push
	// Schedules the callback with `delay`, or runs immediately when `delay` is
	// `true`.
	push(delay = this.delay) {
		if (delay === true) {
			this.cancel();
			this._run();
		} else {
			this.delay = delay || 0;
			this.cancel();
			this.timeout = setTimeout(this._run, this.delay);
		}
	}

	// Method: cancel
	// Cancels the currently scheduled timeout if one exists.
	cancel() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
	}

	// Method: run
	// Cancels any pending timeout and invokes `callback` immediately.
	run() {
		this.cancel();
		if (typeof this.callback === "function") {
			this.callback();
		}
	}
}

// Function: defer
// Creates a <Deferred> for `callback`, using `delay` as the default schedule
// and optionally starting it immediately when `start` is `true`.
function defer(callback, delay = 0, start = true) {
	return new Deferred(callback, delay, start);
}

// Function: deferred
// Wraps `callback` in a reusable scheduling function that reschedules the same
// <Deferred> instance on every invocation.
function deferred(callback, delay = 100) {
	const f = new Deferred(callback, delay, false);
	return (t = delay) => {
		f.push(t);
		return f;
	};
}

// ----------------------------------------------------------------------------
//
// THROTTLED
//
// ----------------------------------------------------------------------------

// Class: Throttled
// Rate-limited task that runs at most once per `delay`. Leading calls run
// immediately when the window is open; further calls within the window schedule
// a single trailing run and drop any additional unexecuted calls.
// - callback: DeferredCallback - callback invoked when the task runs
// - delay: number - minimum interval in milliseconds between runs
// - timeout: ReturnType<typeof setTimeout> - active trailing timer when scheduled
// - _last: number - timestamp of the last run, or `0` when never run
class Throttled {
	constructor(callback, delay = 0, start = false) {
		this.callback = callback;
		this._run = this.run.bind(this);
		this.delay = delay;
		this._last = 0;
		if (start) {
			this.push(delay);
		}
	}

	// Method: push
	// Runs immediately when outside the throttle window, otherwise schedules at
	// most one trailing run. Pass `true` to run immediately.
	push(delay = this.delay) {
		if (delay === true) {
			this.cancel();
			this._run();
			return;
		}
		this.delay = delay || 0;
		const now = Date.now();
		const remaining = this._last ? this._last + this.delay - now : 0;
		if (remaining <= 0) {
			this.cancel();
			this._run();
		} else if (!this.timeout) {
			this.timeout = setTimeout(this._run, remaining);
		}
	}

	// Method: cancel
	// Cancels the currently scheduled trailing timeout if one exists.
	cancel() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
	}

	// Method: run
	// Cancels any pending timeout and invokes `callback` immediately.
	run() {
		this.cancel();
		this._last = Date.now();
		if (typeof this.callback === "function") {
			this.callback();
		}
	}
}

// Function: throttle
// Creates a <Throttled> for `callback`, using `delay` as the minimum interval
// and optionally starting it immediately when `start` is `true`.
function throttle(callback, delay = 0, start = true) {
	return new Throttled(callback, delay, start);
}

// Function: throttled
// Wraps `callback` in a reusable scheduling function that rate-limits the same
// <Throttled> instance on every invocation.
function throttled(callback, delay = 100) {
	const f = new Throttled(callback, delay, false);
	return (t = delay) => {
		f.push(t);
		return f;
	};
}

// ----------------------------------------------------------------------------
//
// BATCHED
//
// ----------------------------------------------------------------------------

// Class: Batched
// Rate-limited task like <Throttled>, but aggregates pushed values and delivers
// them together when the callback runs instead of dropping prior calls.
// - callback: BatchedCallback - callback invoked with the aggregated values
// - delay: number - minimum interval in milliseconds between runs
// - timeout: ReturnType<typeof setTimeout> - active trailing timer when scheduled
// - items: Array - values collected since the last run
// - _last: number - timestamp of the last run, or `0` when never run
class Batched {
	constructor(callback, delay = 0) {
		this.callback = callback;
		this._run = this.run.bind(this);
		this.delay = delay;
		this._last = 0;
		this.items = [];
	}

	// Method: push
	// Appends `value` to the batch and runs or schedules a flush using the same
	// rate limit as <Throttled>. Pass `true` as `delay` to flush immediately.
	push(value, delay = this.delay) {
		this.items.push(value);
		if (delay === true) {
			this._flush();
			return;
		}
		this.delay = delay || 0;
		const now = Date.now();
		const remaining = this._last ? this._last + this.delay - now : 0;
		if (remaining <= 0) {
			this._flush();
		} else if (!this.timeout) {
			this.timeout = setTimeout(this._run, remaining);
		}
	}

	// Method: cancel
	// Cancels any pending flush and discards aggregated values.
	cancel() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
		this.items = [];
	}

	// Method: run
	// Flushes aggregated values immediately, invoking `callback` with the batch.
	run() {
		this._flush();
	}

	_flush() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
		this._last = Date.now();
		const batch = this.items;
		this.items = [];
		if (typeof this.callback === "function") {
			this.callback(batch);
		}
	}
}

// Function: batch
// Creates a <Batched> for `callback`, using `delay` as the minimum interval.
function batch(callback, delay = 0) {
	return new Batched(callback, delay);
}

// Function: batched
// Wraps `callback` in a reusable function that aggregates values on the same
// <Batched> instance and flushes them at most once per `delay`.
function batched(callback, delay = 100) {
	const f = new Batched(callback, delay);
	return (value, t = delay) => {
		f.push(value, t);
		return f;
	};
}

export {
	Batched,
	batch,
	batched,
	Deferred,
	defer,
	deferred,
	Throttled,
	throttle,
	throttled,
};

// EOF
