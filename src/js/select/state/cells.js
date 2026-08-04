// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-18

// Module: select.cells
// Reactive state management with cells and derivations. Provides observable
// data containers that notify subscribers on changes, enabling reactive UI
// updates.
//
// A `Cell` holds a value and notifies subscribers when it changes. A `Derived`
// cell automatically updates when its source cells change. `Selected` provides
// focused access to nested properties within cells.
//
// Example:
// ```javascript
// import { cell, derived } from "./select.cells.js"
//
// const count = cell(0)
// const doubled = derived(count, c => c * 2)
//
// doubled.sub((value) => console.log("Doubled:", value))
// count.set(5)  // Logs: "Doubled: 10"
// ```

// ----------------------------------------------------------------------------
//
// SECTION: Sentinel Values
//
// ----------------------------------------------------------------------------

import {
	Batched as AsyncBatched,
	Deferred as AsyncDeferred,
	Throttled as AsyncThrottled,
	batch as asyncBatch,
	defer as asyncDefer,
	throttle as asyncThrottle,
} from "../utils/async.js";
import {
	access,
	assigned,
	eq,
	logger,
	Nothing,
	path as pathify,
	Something,
} from "../utils/index.js";

const log = logger("select.cells");
let refreshStamp = 0;
let batchDepth = 0;
let isFlushingPubs = false;
const pendingPubs = [];
const scheduleBridges = new WeakMap();

function flushPendingPubs() {
	if (isFlushingPubs || pendingPubs.length === 0) {
		return;
	}
	isFlushingPubs = true;
	try {
		const pubs = pendingPubs.splice(0, pendingPubs.length);
		for (let i = 0; i < pubs.length; i++) {
			const { target, value, path, origin, previous } = pubs[i];
			for (const handler of target.subs) {
				handler(value, path, origin, previous);
			}
		}
	} finally {
		isFlushingPubs = false;
	}
}

function batch(functor) {
	batchDepth += 1;
	try {
		return typeof functor === "function" ? functor() : undefined;
	} finally {
		batchDepth -= 1;
		if (batchDepth === 0) {
			flushPendingPubs();
		}
	}
}

function isReactiveValue(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		value.isReactive === true
	);
}

function isReactiveSource(value) {
	return (
		isReactiveValue(value) &&
		typeof value.sub === "function" &&
		typeof value.unsub === "function"
	);
}

function isPlainObject(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

// True when reconcile should descend (plain object or array), not replace.
function isReconcileWrappable(value) {
	return Array.isArray(value) || isPlainObject(value);
}

function reconcilePath(basePath, key) {
	if (!basePath.length) {
		return [key];
	}
	const next = basePath.slice();
	next.push(key);
	return next;
}

function reconcileSet(cell, basePath, value) {
	const p = basePath.length
		? Array.isArray(basePath)
			? basePath.slice()
			: basePath
		: Nothing;
	// Bypass cell.schedule so diff applies in this turn.
	if (typeof cell._update === "function") {
		cell._update(value, p);
	} else {
		cell.set(value, p, true);
	}
}

// Removes object keys by rewriting the parent object (set(undefined) leaves
// the key present, which breaks structural equality with JSON clones).
function reconcileDeleteKeys(cell, basePath, keys) {
	if (!keys.length) {
		return;
	}
	const parent = basePath.length ? access(cell.value, basePath) : cell.value;
	if (!isPlainObject(parent)) {
		for (let i = 0; i < keys.length; i++) {
			reconcileSet(cell, reconcilePath(basePath, keys[i]), undefined);
		}
		return;
	}
	const next = { ...parent };
	for (let i = 0; i < keys.length; i++) {
		delete next[keys[i]];
	}
	reconcileSet(cell, basePath, next);
}

// Diffs `target` onto `cell` at `basePath`, writing only changed leaves/nodes
// through `cell.set`. Assumes callers wrap with `batch()` when desired.
function applyReconcile(cell, basePath, target, previous) {
	if (Object.is(target, previous)) {
		return;
	}
	const targetWrap = isReconcileWrappable(target);
	const previousWrap = isReconcileWrappable(previous);
	if (
		!targetWrap ||
		!previousWrap ||
		Array.isArray(target) !== Array.isArray(previous)
	) {
		reconcileSet(cell, basePath, target);
		return;
	}
	if (Array.isArray(target)) {
		const prevLen = previous.length;
		const nextLen = target.length;
		if (nextLen === prevLen) {
			for (let i = 0; i < nextLen; i++) {
				basePath.push(i);
				applyReconcile(cell, basePath, target[i], previous[i]);
				basePath.pop();
			}
			return;
		}
		// Append-only growth. Pure single-append (length +1, full prefix eq):
		// keep previous element refs and one set of […previous, tail]. One prefix
		// walk (eq) then identity compose — UI Object.is-short-circuits instead
		// of re-diffing. Prefix mutations fall through to per-index reconcile.
		if (nextLen > prevLen) {
			if (nextLen === prevLen + 1) {
				let prefixEq = true;
				for (let i = 0; i < prevLen; i++) {
					if (!eq(target[i], previous[i])) {
						prefixEq = false;
						break;
					}
				}
				if (prefixEq) {
					const next = new Array(nextLen);
					for (let i = 0; i < prevLen; i++) {
						next[i] = previous[i];
					}
					next[prevLen] = target[prevLen];
					reconcileSet(cell, basePath, next);
					return;
				}
			}
			for (let i = 0; i < prevLen; i++) {
				basePath.push(i);
				applyReconcile(cell, basePath, target[i], previous[i]);
				basePath.pop();
			}
			for (let i = prevLen; i < nextLen; i++) {
				basePath.push(i);
				reconcileSet(cell, basePath, target[i]);
				basePath.pop();
			}
			return;
		}
		// Shrink: identity-preserving single remove (incl. tail). Find removeAt
		// by prefix scan; sanity-check only the first shifted element (not full
		// O(n) array eq — that dominated 1000-log splices). Compose kept previous
		// refs so UI Object.is-short-circuits. Combined remove+mutate in one
		// reconcile falls back when the shifted-element check fails.
		// Never index-prefix-reconcile a middle remove (pairs wrong rows).
		if (nextLen === prevLen - 1) {
			let removeAt = nextLen;
			for (let i = 0; i < nextLen; i++) {
				if (!eq(target[i], previous[i])) {
					removeAt = i;
					break;
				}
			}
			if (removeAt >= nextLen || eq(target[removeAt], previous[removeAt + 1])) {
				const next = new Array(nextLen);
				for (let i = 0; i < removeAt; i++) {
					next[i] = previous[i];
				}
				for (let i = removeAt; i < nextLen; i++) {
					next[i] = previous[i + 1];
				}
				reconcileSet(cell, basePath, next);
				return;
			}
		} else if (nextLen < prevLen && prevLen <= 64) {
			// Tail-only multi-pop on modest lists: prefix matches → keep refs.
			let tailOnly = true;
			for (let i = 0; i < nextLen; i++) {
				if (!eq(target[i], previous[i])) {
					tailOnly = false;
					break;
				}
			}
			if (tailOnly) {
				const next = new Array(nextLen);
				for (let i = 0; i < nextLen; i++) {
					next[i] = previous[i];
				}
				reconcileSet(cell, basePath, next);
				return;
			}
		}
		// Ambiguous shrink: one replace (UI list engine handles shift/eq).
		reconcileSet(cell, basePath, target);
		return;
	}
	for (const key in target) {
		if (!Object.hasOwn(target, key)) {
			continue;
		}
		basePath.push(key);
		applyReconcile(cell, basePath, target[key], previous[key]);
		basePath.pop();
	}
	const removed = [];
	for (const key in previous) {
		if (!Object.hasOwn(previous, key) || Object.hasOwn(target, key)) {
			continue;
		}
		removed.push(key);
	}
	if (removed.length) {
		reconcileDeleteKeys(cell, basePath, removed);
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Path Utilities
//
// ----------------------------------------------------------------------------

function normalizeSelectionPath(path) {
	return path === undefined || path === null
		? []
		: Array.isArray(path)
			? path
			: [path];
}

function selectionPathKey(path) {
	if (!path || path.length === 0) {
		return "";
	}
	let key = "";
	for (let i = 0; i < path.length; i++) {
		if (i) {
			key += "/";
		}
		key += `${typeof path[i]}:${path[i]}`;
	}
	return key;
}

function hasPathPrefix(path, prefix) {
	if (!prefix || prefix.length === 0) {
		return true;
	}
	if (!path || path.length < prefix.length) {
		return false;
	}
	for (let i = 0; i < prefix.length; i++) {
		if (!Object.is(path[i], prefix[i])) {
			return false;
		}
	}
	return true;
}

function walkReactiveSources(value, visitor, path = []) {
	if (value === null || value === undefined || typeof value !== "object") {
		return;
	}
	if (isReactiveSource(value)) {
		visitor(value, path);
		return;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			path.push(i);
			walkReactiveSources(value[i], visitor, path);
			path.pop();
		}
	} else if (Object.getPrototypeOf(value) === Object.prototype) {
		for (const k in value) {
			path.push(k);
			walkReactiveSources(value[k], visitor, path);
			path.pop();
		}
	}
}

function expandReactiveValue(value) {
	if (isReactiveValue(value)) {
		return Reactive.Unwrap(value);
	}
	if (value === null || value === undefined || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		const n = value.length;
		const res = new Array(n);
		for (let i = 0; i < n; i++) {
			res[i] = expandReactiveValue(value[i]);
		}
		return res;
	}
	if (Object.getPrototypeOf(value) === Object.prototype) {
		const res = {};
		for (const k in value) {
			res[k] = expandReactiveValue(value[k]);
		}
		return res;
	}
	return value;
}

function refreshSelections(owner, path, previous = undefined) {
	if (!owner.selections) {
		return;
	}
	path = path === Nothing ? [] : path;
	const stamp = ++refreshStamp;
	const refresh = (selection) => {
		if (selection._refreshStamp !== stamp) {
			selection._refreshStamp = stamp;
			selection.refresh(path, previous);
		}
	};
	owner.selections.each(path, refresh);
	if (path?.length) {
		for (let i = path.length - 1; i >= 0; i--) {
			const ancestors = owner.selections.get(path, i);
			if (ancestors) {
				for (let j = 0; j < ancestors.length; j++) {
					refresh(ancestors[j]);
				}
			}
		}
	}
}

function parseReactiveOptions(initial, strategy, pending) {
	let shouldInitialize = true;
	let updateStrategy = "join";
	let pendingStrategy = "keep";
	if (initial && typeof initial === "object" && !Array.isArray(initial)) {
		if (initial.initial !== undefined) {
			shouldInitialize = !!initial.initial;
		}
		if (typeof initial.strategy === "string") {
			updateStrategy = initial.strategy;
		}
		if (typeof initial.pending === "string") {
			pendingStrategy = initial.pending;
		}
	} else if (typeof initial === "string") {
		updateStrategy = initial;
	} else if (initial !== undefined) {
		shouldInitialize = !!initial;
	}
	if (typeof strategy === "string") {
		updateStrategy = strategy;
	}
	if (typeof pending === "string") {
		pendingStrategy = pending;
	}
	return {
		shouldInitialize,
		updateStrategy,
		pendingStrategy: pendingStrategy === "clear" ? "clear" : "keep",
	};
}

// ----------------------------------------------------------------------------
//
// SECTION: Schedule Bridge
//
// ----------------------------------------------------------------------------

// Bridges utils/async schedulers onto cell writes. One scheduler instance can
// be shared across cells; defer/throttle keep last-write-per-cell, batched
// keeps every op and flushes them together inside `batch()`.

function isAsyncScheduler(value) {
	return (
		value instanceof AsyncDeferred ||
		value instanceof AsyncThrottled ||
		value instanceof AsyncBatched
	);
}

function createAsyncScheduler(kind, delay = 0) {
	switch (kind) {
		case "defer":
		case "deferred":
			return asyncDefer(undefined, delay, false);
		case "throttle":
		case "throttled":
			return asyncThrottle(undefined, delay, false);
		case "batch":
		case "batched":
			return asyncBatch(undefined, delay);
		default:
			throw new TypeError(
				`cell.schedule: unknown kind "${kind}" (use defer, throttle, or batch)`,
			);
	}
}

// Resolves a schedule spec to an async scheduler instance, or `null`.
// Accepts `null`/`false`, `["defer"|"throttle"|"batch", delay?]`, or a
// Deferred/Throttled/Batched instance from utils/async.
function normalizeSchedule(spec) {
	if (spec === undefined || spec === null || spec === false) {
		return null;
	}
	if (Array.isArray(spec)) {
		return createAsyncScheduler(spec[0], spec[1] || 0);
	}
	if (typeof spec === "string") {
		return createAsyncScheduler(spec, 0);
	}
	if (isAsyncScheduler(spec)) {
		return spec;
	}
	throw new TypeError(
		"cell.schedule: expected null, [kind, delay], or Deferred/Throttled/Batched",
	);
}

function ensureScheduleBridge(scheduler) {
	let bridge = scheduleBridges.get(scheduler);
	if (bridge) {
		return bridge;
	}
	const pending = new Map();
	const cells = new Set();
	const isBatched = scheduler instanceof AsyncBatched;
	bridge = { scheduler, pending, cells, isBatched };
	if (isBatched) {
		scheduler.callback = (ops) => {
			batch(() => {
				for (let i = 0; i < ops.length; i++) {
					const op = ops[i];
					if (!op?.cell || op.cell._schedule !== scheduler) {
						continue;
					}
					op.cell._update(op.value, op.path, op.force);
				}
			});
		};
	} else {
		scheduler.callback = () => {
			const ops = [];
			for (const [target, op] of pending) {
				ops.push([target, op]);
			}
			pending.clear();
			batch(() => {
				for (let i = 0; i < ops.length; i++) {
					const [target, op] = ops[i];
					if (target._schedule !== scheduler) {
						continue;
					}
					target._update(op.value, op.path, op.force);
				}
			});
		};
	}
	scheduleBridges.set(scheduler, bridge);
	return bridge;
}

function dropCellSchedulePending(cell) {
	const scheduler = cell._schedule;
	if (!scheduler) {
		return;
	}
	const bridge = scheduleBridges.get(scheduler);
	if (!bridge) {
		return;
	}
	bridge.pending.delete(cell);
	if (bridge.isBatched && Array.isArray(scheduler.items)) {
		const next = [];
		for (let i = 0; i < scheduler.items.length; i++) {
			if (scheduler.items[i]?.cell !== cell) {
				next.push(scheduler.items[i]);
			}
		}
		scheduler.items = next;
	}
}

function detachCellSchedule(cell) {
	const scheduler = cell._schedule;
	if (!scheduler) {
		return;
	}
	const bridge = scheduleBridges.get(scheduler);
	if (bridge) {
		bridge.pending.delete(cell);
		bridge.cells.delete(cell);
		if (bridge.isBatched && Array.isArray(scheduler.items)) {
			const next = [];
			for (let i = 0; i < scheduler.items.length; i++) {
				if (scheduler.items[i]?.cell !== cell) {
					next.push(scheduler.items[i]);
				}
			}
			scheduler.items = next;
		}
		const idle =
			bridge.cells.size === 0 &&
			bridge.pending.size === 0 &&
			(!bridge.isBatched || !scheduler.items.length);
		if (idle) {
			scheduler.cancel();
		}
	}
	cell._schedule = undefined;
}

function enqueueCellSchedule(cell, op) {
	const scheduler = cell._schedule;
	if (!scheduler) {
		cell._update(op.value, op.path, op.force);
		return;
	}
	const bridge = ensureScheduleBridge(scheduler);
	bridge.cells.add(cell);
	if (bridge.isBatched) {
		scheduler.push({
			cell,
			value: op.value,
			path: op.path,
			force: op.force,
		});
	} else {
		bridge.pending.set(cell, op);
		scheduler.push();
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Selections Registry
//
// ----------------------------------------------------------------------------

// Class: Selections
// Internal registry for tracking reactive selections at specific paths.
// Used by cells to notify nested property observers.
class Selections {
	constructor() {
		// NOTE: The drawback is that we're creating multiple nested maps,
		// when we could potentially only have keys. We could try an
		// alternate implementation.
		this.selections = new Map();
	}

	// Calls `visitor` for all registered entries under `path`.
	each(path, visitor) {
		const scope = path instanceof Map ? path : this.scope(path);
		if (scope) {
			this._eachScope(scope, visitor);
		}
	}

	_eachScope(scope, visitor) {
		for (const [k, v] of scope.entries()) {
			if (k !== Something) {
				this._eachScope(v, visitor);
			}
		}
		const l = scope.get(Something);
		if (l) {
			for (let i = 0; i < l.length; i++) {
				visitor(l[i]);
			}
		}
	}

	// Yields all registered entries under `path` (depth-first iteration).
	*iter(path) {
		if (path instanceof Map) {
			for (const [k, v] of path.entries()) {
				if (k !== Something) {
					for (const _ of this.iter(v)) {
						yield _;
					}
				}
			}
			const l = path.get(Something);
			if (l) {
				for (const _ of l) {
					yield _;
				}
			}
		} else {
			const scope = this.scope(path);
			if (scope) {
				for (const _ of this.iter(scope)) {
					yield _;
				}
			}
		}
	}

	// Returns the scope map at `path`. Creates if `create` is true.
	scope(path, create = false, length = undefined) {
		path = Array.isArray(path)
			? path
			: path !== undefined && path !== null
				? [path]
				: [];
		const n = length === undefined ? path.length : length;
		let scope = this.selections;
		for (let i = 0; i < n; i++) {
			const key = path[i];
			if (scope.has(key)) {
				scope = scope.get(key);
			} else if (create) {
				const s = new Map();
				scope.set(key, s);
				scope = s;
			} else {
				return undefined;
			}
		}
		return scope;
	}

	// Returns selection array at `path`.
	get(path, length = undefined) {
		const scope = this.scope(path, false, length);
		return scope ? scope.get(Something) : undefined;
	}

	// Adds `value` to selections at `path`.
	add(path, value) {
		const scope = this.scope(path, true);
		if (scope.has(Something)) {
			scope.get(Something).push(value);
		} else {
			scope.set(Something, [value]);
		}
		return this;
	}

	// Removes `value` from selections at `path`.
	remove(path, value) {
		path = Array.isArray(path)
			? path
			: path !== undefined && path !== null
				? [path]
				: [];
		let scope = this.selections;
		const stack = [];
		for (let i = 0; i < path.length; i++) {
			const key = path[i];
			if (!scope.has(key)) {
				return false;
			}
			stack.push([scope, key]);
			scope = scope.get(key);
		}
		const l = scope.get(Something);
		if (!l) {
			return false;
		}
		const i = l.indexOf(value);
		if (i === -1) {
			return false;
		}
		l.splice(i, 1);
		if (l.length === 0) {
			scope.delete(Something);
			for (let i = stack.length - 1; i >= 0 && scope.size === 0; i--) {
				const [parent, key] = stack[i];
				parent.delete(key);
				scope = parent;
			}
		}
		return true;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Reactive Base
//
// ----------------------------------------------------------------------------

// Class: Reactive
// Base class for reactive values. Manages subscriptions, selections (nested
// property observers), and provides generic collection API.
//
// Attributes:
// - `isReactive`: boolean - always true
// - `value`: any - current value
// - `previous`: any - previous value before last update
// - `isPending`: boolean - true when current value is waiting on async work
// - `revision`: number - monotonically increasing change counter (-1 if empty)
// - `subs`: Array<function> - subscriber callbacks
// - `selections`: Selections? - registry for nested property selections
class Reactive {
	static Id = 1;

	static Unwrap(value) {
		let next = value;
		while (isReactiveValue(next)) {
			next = next.value;
		}
		return next && typeof next.then === "function" ? undefined : next;
	}

	// Generator that yields `[reactive, path]` tuples for all reactive values
	// nested within `value` at `path`.
	static *Walk(value, path = []) {
		if (value === null || value === undefined || typeof value !== "object") {
			// pass
		} else if (isReactiveSource(value)) {
			yield [value, path];
		} else if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				for (const _ of Reactive.Walk(value[i], [...path, i])) {
					yield _;
				}
			}
		} else if (Object.getPrototypeOf(value) === Object.prototype) {
			for (const k in value) {
				for (const _ of Reactive.Walk(value[k], [...path, k])) {
					yield _;
				}
			}
		}
	}

	// Recursively expands `value` by replacing reactive cells with their values.
	static Expand(value) {
		return expandReactiveValue(value);
	}

	constructor(value = Nothing) {
		this.isReactive = true;
		this.id = Reactive.Id++;
		this.value = value === Nothing ? undefined : value;
		this.previous = undefined;
		this.isPending = false;
		this.revision = value === Nothing ? -1 : 0;
		this.subs = [];
		this.selections = undefined;
		this._selectionCache = new Map();
		this._normalizer = undefined;
		this._pendingPath = undefined;
	}

	get label() {
		return `${this.constructor.name}#${this.id}`;
	}

	// Sets a root-value normalizer for this reactive and returns self.
	normalize(fn) {
		this._normalizer = typeof fn === "function" ? fn : undefined;
		return this;
	}

	normalizeValue(value, path = Nothing) {
		return !path && this._normalizer ? this._normalizer(value) : value;
	}

	// Creates a `Selected` view at `path` within this cell's value.
	// If `defaultValue` is provided and current path is undefined, initializes it.
	select(path, defaultValue = Nothing) {
		const nextPath = normalizeSelectionPath(path);
		if (
			defaultValue !== Nothing &&
			access(this.value, nextPath) === undefined
		) {
			this.set(defaultValue, nextPath);
		}
		const pathKey = selectionPathKey(nextPath);
		let selected = this._selectionCache.get(pathKey);
		if (!selected) {
			selected = new Selected(this, nextPath, pathKey);
			this._selectionCache.set(pathKey, selected);
		}
		return selected.acquire();
	}

	// Releases a selected value acquired from this reactive.
	release(pathOrSelected) {
		if (pathOrSelected instanceof Selected) {
			if (pathOrSelected.parent === this) {
				pathOrSelected.release();
			}
			return this;
		}
		const nextPath = normalizeSelectionPath(pathOrSelected);
		const pathKey = selectionPathKey(nextPath);
		const selected = this._selectionCache.get(pathKey);
		if (selected) {
			selected.release();
		}
		return this;
	}

	// Subscribes `handler` to value changes. Handler receives (value, path, origin, previous).
	sub(handler, trigger = false) {
		this.subs.push(handler);
		if (trigger) {
			handler(this.value, Nothing, this, undefined);
		}
		return this;
	}

	// Unsubscribes `handler` from changes.
	unsub(handler) {
		const i = this.subs.indexOf(handler);
		if (i >= 0) {
			this.subs.splice(i, 1);
		}
		return this;
	}

	// Registers `handler` and returns an idempotent unsubscriber callback.
	effect(handler) {
		this.sub(handler);
		let active = true;
		return () => {
			if (!active) {
				return false;
			}
			active = false;
			this.unsub(handler);
			return true;
		};
	}

	// Notifies all subscribers of change. Called with (value, path, origin, previous).
	pub(value, path, origin, previous = undefined) {
		// TODO: Revisit pub and how it works. It should probably
		// trigger the selections when it's a set, but not when
		// propagating up.
		if (batchDepth > 0) {
			pendingPubs.push({ target: this, value, path, origin, previous });
			return this;
		}
		for (const handler of this.subs) {
			handler(value, path, origin, previous);
		}
		return this;
	}

	// Must be implemented by subclasses to refresh derived values.
	refresh() {
		throw new Error(`${this.constructor.name}.refresh() not implemented`);
	}

	// Returns length of value if array/object, 0 if empty, 1 for scalar.
	get length() {
		if (
			this.revision === -1 ||
			this.value === null ||
			this.value === undefined
		) {
			return 0;
		} else if (Array.isArray(this.value)) {
			return this.value.length;
		} else if (Object.getPrototypeOf(this.value) === Object.prototype) {
			return Object.keys(this.value).length;
		} else {
			return 1;
		}
	}

	// Maps over value if array/object, returns null if empty, wraps scalar.
	map(functor) {
		if (this.revision === -1) {
			return null;
		} else if (this.value === undefined) {
			return null;
		} else if (Array.isArray(this.value)) {
			return this.value.map(functor);
		} else if (Object.getPrototypeOf(this.value) === Object.prototype) {
			const res = [];
			for (const k in this.value) {
				res[k] = functor(this.value[k]);
			}
			return res;
		} else {
			return [functor(this.value)];
		}
	}

	// Gets value at `key` ( Nothing returns the cell's value itself).
	get(key = Nothing) {
		if (key === Nothing) {
			return this.value;
		}
		return access(this.value, pathify(key, Nothing));
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Selected (Property View)
//
// ----------------------------------------------------------------------------

// Class: Selected
// A reactive view into a nested property of a parent cell. Updates when the
// parent cell changes. Supports setting values which propagate to parent.
//
// Attributes:
// - `parent`: Cell - the parent cell this selection belongs to
// - `path`: Array<string|number> - path to selected property within parent
class Selected extends Reactive {
	constructor(parent, path, pathKey = undefined) {
		super();
		this.parent = undefined;
		this.path = undefined;
		this._pathKey = undefined;
		this._refs = 0;
		this.select(parent, path, pathKey);
	}

	acquire() {
		this._refs += 1;
		return this;
	}

	release() {
		if (this._refs > 0) {
			this._refs -= 1;
		}
		if (this._refs === 0) {
			this.dispose();
		}
		return this;
	}

	reselect(path) {
		if (!(this.parent instanceof Reactive)) {
			return this;
		}
		const nextPath = normalizeSelectionPath(path);
		const nextPathKey = selectionPathKey(nextPath);
		this.select(this.parent, nextPath, nextPathKey);
		this.refresh();
		return this;
	}

	select(parent, path = Nothing, pathKey = undefined) {
		// Overload: select(path, defaultValue?) from a Selected value.
		if (!(parent instanceof Reactive) && pathKey === undefined) {
			const nestedPath = parent;
			const defaultValue = path;
			const nextPath = normalizeSelectionPath(nestedPath);
			if (
				defaultValue !== Nothing &&
				access(this.value, nextPath) === undefined
			) {
				this.set(defaultValue, nextPath);
			}
			return Reactive.prototype.select.call(this, nextPath);
		}
		const nextPath = normalizeSelectionPath(path);
		const nextPathKey = pathKey ?? selectionPathKey(nextPath);

		if (this.parent === parent && this._pathKey === nextPathKey) {
			return this;
		}

		if (this.parent?.selections && this.path) {
			this.parent.selections.remove(this.path, this);
		}
		if (this.parent?._selectionCache?.get(this._pathKey) === this) {
			this.parent._selectionCache.delete(this._pathKey);
		}

		this.parent = parent;
		this.path = nextPath;
		this._pathKey = nextPathKey;

		if (parent instanceof Reactive) {
			parent.selections = parent.selections ?? new Selections();
			parent.selections.add(nextPath, this);
			parent._selectionCache?.set(nextPathKey, this);
			this.value = access(parent.value, nextPath);
		} else {
			this.value = parent ? access(parent, nextPath) : undefined;
		}
		this.isPending = !!(this.value && typeof this.value.then === "function");
		return this;
	}

	// Disposes this selection and removes it from parent registry.
	dispose() {
		if (this.parent?._selectionCache?.get(this._pathKey) === this) {
			this.parent._selectionCache.delete(this._pathKey);
		}
		this.parent?.selections?.remove(this.path, this);
		// Keep `parent`/`path` intact so async handlers that still hold this
		// selection can safely read/write after a render releases it.
		this._refs = 0;
		this.subs.length = 0;
		return this;
	}

	// Refreshes value from parent and notifies subscribers.
	refresh(changedPath = this.path, previous = undefined) {
		// TODO: We could get a revision number from the parent and
		// detect if it's dirty.
		const nextChangedPath = changedPath === Nothing ? [] : (changedPath ?? []);
		const value = access(this.parent.value, this.path);
		const current = this.value;
		this.previous = current;
		this.value = value;
		const pendingPath = this.parent?._pendingPath;
		this.isPending = !!(
			this.parent?.isPending &&
			(pendingPath === Nothing ||
				hasPathPrefix(this.path, pendingPath) ||
				hasPathPrefix(pendingPath, this.path))
		);
		this.revision++;
		let publishedPath = Nothing;
		let publishedValue = value;
		let publishedPrevious = current;
		if (hasPathPrefix(nextChangedPath, this.path)) {
			publishedPath = nextChangedPath.slice(this.path.length);
			if (publishedPath.length === 0) {
				publishedPath = Nothing;
			}
			publishedValue = publishedPath ? access(value, publishedPath) : value;
			publishedPrevious = previous;
		} else if (hasPathPrefix(this.path, nextChangedPath)) {
			const offset = this.path.slice(nextChangedPath.length);
			publishedPrevious = offset.length ? access(previous, offset) : previous;
		}
		if (this.selections) {
			refreshSelections(this, publishedPath, publishedPrevious);
		}
		this.pub(publishedValue, publishedPath, this.parent, publishedPrevious);
	}

	// Sets value at this selection's path. Delegates to parent cell.
	set(value, path = Nothing, force = false) {
		path = pathify(path, Nothing);
		return this.parent.set(
			value,
			path ? [...this.path, ...path] : this.path,
			force,
		);
	}

	// Clears the selected value by setting it to `undefined`.
	clear(path = Nothing, force = false) {
		path = pathify(path, Nothing);
		return this.parent.clear(path ? [...this.path, ...path] : this.path, force);
	}

	// Merges `value` into current selected value at optional `path`.
	merge(value, path = Nothing) {
		path = pathify(path, Nothing);
		const current = path ? access(this.value, path) : this.value;
		if (current === undefined) {
			this.set(value, path);
		} else if (Array.isArray(current) && Array.isArray(value)) {
			this.set([...current, ...value], path);
		} else if (
			Object.getPrototypeOf(current) === Object.prototype &&
			Object.getPrototypeOf(value) === Object.prototype
		) {
			this.set({ ...current, ...value }, path);
		} else {
			this.set(value, path);
		}
		return this;
	}

	// Appends value to selected array. Converts non-array to array first.
	push(value) {
		let updated;
		const cur = this.value;
		if (!Array.isArray(cur)) {
			updated = cur === undefined || cur === null ? [value] : [cur, value];
		} else {
			const len = cur.length;
			updated = new Array(len + 1);
			for (let i = 0; i < len; i++) updated[i] = cur[i];
			updated[len] = value;
		}
		this.set(updated);
		return this;
	}

	// Diffs plain `value` onto this selection (delegates to parent paths).
	reconcile(value, options = undefined) {
		return reconcile(this, value, options);
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Cell
//
// ----------------------------------------------------------------------------

// Class: Cell
// A reactive container for a single value. Notifies subscribers on change.
// Supports nested property updates via `set(value, path)`.
//
// Attributes:
// - `pending`: string - pending value mode (`"keep"` or `"clear"`)
//
// Example:
// ```javascript
// const c = cell({ count: 0 })
// c.sub((v) => console.log("Changed:", v))
// c.set(1, "count")  // Updates nested property
// ```

class Cell extends Reactive {
	constructor(value = Nothing, options = "keep") {
		super();
		this._promiseToken = 0;
		this._pendingPrevious = undefined;
		this._schedule = undefined;
		let pending = "keep";
		let scheduleSpec;
		if (typeof options === "string") {
			pending = options;
		} else if (options && typeof options === "object") {
			if (typeof options.pending === "string") {
				pending = options.pending;
			}
			if (options.schedule !== undefined) {
				scheduleSpec = options.schedule;
			}
		}
		this.pending = pending === "clear" ? "clear" : "keep";
		// Initial value applies immediately (schedule does not delay construction).
		if (value !== Nothing) {
			this._update(value, Nothing, true);
		}
		if (scheduleSpec !== undefined) {
			this.schedule(scheduleSpec);
		}
	}

	_refreshSelections(path, previous = undefined) {
		refreshSelections(this, path, previous);
	}

	// Method: schedule
	// Attaches a write scheduler (`["defer"|"throttle"|"batch", delay]`, a
	// shared utils/async instance, or `null` for immediate updates). Swapping
	// cancels this cell's pending scheduled writes.
	schedule(spec = null) {
		detachCellSchedule(this);
		const next = normalizeSchedule(spec);
		if (!next) {
			return this;
		}
		const bridge = ensureScheduleBridge(next);
		bridge.cells.add(this);
		this._schedule = next;
		return this;
	}

	// Method: flush
	// Forces the attached scheduler to run now (applies all pending ops on a
	// shared scheduler).
	flush() {
		if (this._schedule) {
			this._schedule.run();
		}
		return this;
	}

	// Method: dispose
	// Cancels this cell's pending scheduled writes and detaches its schedule.
	dispose() {
		detachCellSchedule(this);
		return this;
	}

	_scheduleUpdate(value, path, force = false) {
		if (force || !this._schedule) {
			if (force) {
				dropCellSchedulePending(this);
			}
			this._update(value, path, force);
			return this;
		}
		enqueueCellSchedule(this, { value, path, force: false });
		return this;
	}

	// Internal update implementation. Applies value, updates selections,
	// notifies subscribers.
	_update(value, path, _force = false) {
		// TODO: Maybe patch?
		path = pathify(path, Nothing);
		value = this.normalizeValue(value, path);
		const current = path ? access(this.value, path) : this.value;
		if (!_force) {
			if (path) {
				if (Object.is(current, value)) {
					return;
				}
			} else if (Object.is(current, value)) {
				return;
			}
		}
		// TODO: Check existing
		let updated;
		if (!path) {
			updated = value;
		} else if (path.length === 1) {
			// fast path for common 1-level key set (e.g. state.set(v, "count"))
			const key = path[0];
			const base = this.value;
			if (Array.isArray(base)) {
				updated = base.slice();
				if (typeof key === "number" && updated.length <= key) {
					while (updated.length <= key) updated.push(undefined);
				}
				updated[key] = value;
			} else if (isPlainObject(base)) {
				updated = { ...base };
				updated[key] = value;
			} else {
				updated = typeof key === "number" ? [] : {};
				updated[key] = value;
			}
		} else {
			updated = assigned(this.value, path, value);
		}
		const pending =
			path && value && typeof value.then === "function" ? value : updated;
		const isPromise = !!(pending && typeof pending.then === "function");
		const token = ++this._promiseToken;
		this.previous = this.value;
		this._pendingPath = undefined;
		if (isPromise) {
			this.isPending = true;
			this._pendingPath = path;
			this._pendingPrevious = this.value;
			if (this.pending === "clear") {
				this.value = path ? assigned(this.value, path, undefined) : undefined;
			}
		} else {
			this.value = updated;
			this.isPending = false;
			this._pendingPrevious = undefined;
		}
		this.revision++;
		this._refreshSelections(path, current);
		this.pub(
			isPromise ? (this.pending === "clear" ? undefined : this.value) : value,
			path,
			this,
			current,
		);
		if (isPromise) {
			pending.then(
				(resolved) => {
					if (token !== this._promiseToken) {
						return;
					}
					const previous =
						this.pending === "clear"
							? path
								? access(this._pendingPrevious, path)
								: this._pendingPrevious
							: path
								? access(this.value, path)
								: this.value;
					this.previous = this.value;
					this.value = path ? assigned(this.value, path, resolved) : resolved;
					this._pendingPath = undefined;
					this._pendingPrevious = undefined;
					this.isPending = false;
					this.revision++;
					this._refreshSelections(path, previous);
					this.pub(resolved, path, this, previous);
				},
				(error) => {
					if (token !== this._promiseToken) {
						return;
					}
					this._pendingPath = undefined;
					this._pendingPrevious = undefined;
					this.isPending = false;
					log.error("Cell._update: cell promise rejected, details", {
						cell: this.label,
						error:
							error instanceof Error
								? {
										name: error.name,
										message: error.message,
										stack: error.stack,
										cause: error.cause,
									}
								: {
										name: typeof error,
										message: String(error),
									},
						path,
						incomingValue: value,
						currentValue: this.value,
						previousValue: this.previous,
					});
				},
			);
		}
	}

	// Sets value (at optional `path`). Creates nested structure as needed.
	// When a schedule is attached, writes are coalesced unless `force` is true.
	set(value, path = Nothing, force = false) {
		return this._scheduleUpdate(value, path, force);
	}

	// Clears value (at optional `path`) by setting it to `undefined`.
	clear(path = Nothing, force = false) {
		return this._scheduleUpdate(undefined, path, force);
	}

	merge(value, path = Nothing) {
		path = pathify(path, Nothing);
		const current = path ? access(this.value, path) : this.value;
		if (current === undefined) {
			return this._scheduleUpdate(value, path);
		} else if (Array.isArray(current) && Array.isArray(value)) {
			return this._scheduleUpdate([...current, ...value], path);
		} else if (
			Object.getPrototypeOf(current) === Object.prototype &&
			Object.getPrototypeOf(value) === Object.prototype
		) {
			return this._scheduleUpdate({ ...current, ...value }, path);
		}
		return this._scheduleUpdate(value, path);
	}

	// Appends value to array. Converts non-array to array first.
	push(value) {
		let updated;
		const cur = this.value;
		if (!Array.isArray(cur)) {
			updated = cur === undefined || cur === null ? [value] : [cur, value];
		} else {
			const len = cur.length;
			updated = new Array(len + 1);
			for (let i = 0; i < len; i++) updated[i] = cur[i];
			updated[len] = value;
		}
		return this._scheduleUpdate(updated, Nothing);
	}

	// Diffs plain `value` onto this cell, writing only changed paths via `set`.
	// Subscribers flush once (batched). Same-length arrays reconcile by index;
	// length or type changes replace that node. See `reconcile()`.
	//
	// Example:
	// ```javascript
	// const state = cell({ logs: [{ type: "info" }] })
	// state.reconcile({ logs: [{ type: "warn" }] })  // sets path logs.0.type
	// ```
	reconcile(value, options = undefined) {
		return reconcile(this, value, options);
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Derivation
//
// ----------------------------------------------------------------------------

function hasPendingReactiveSources(sources) {
	for (let i = 0; i < sources.length; i++) {
		if (sources[i]?.isPending) {
			return true;
		}
	}
	return false;
}

function templateHasPendingReactiveSources(template) {
	let hasPending = false;
	walkReactiveSources(template, (cell) => {
		if (cell?.isPending) {
			hasPending = true;
		}
	});
	return hasPending;
}

function bindReactiveSources(owner, template) {
	if (owner.isBound) {
		return owner;
	}
	owner.isBound = true;
	walkReactiveSources(template, (cell) => {
		const reactor = (value) => {
			const isPromise = !!(value && typeof value.then === "function");
			if (owner.updateStrategy === "immediate") {
				owner._recompute();
				return;
			}
			if (isPromise) {
				owner.isPending = true;
				return;
			}
			if (owner.updateStrategy === "join" && owner._hasPendingSources()) {
				owner.isPending = true;
				return;
			}
			owner._recompute();
		};
		cell.sub(reactor);
		if (cell?.isReactive && typeof cell.acquire === "function") {
			cell.acquire();
			owner.acquired.push(cell);
		}
		owner.sources.push(cell);
		owner.reactors.push(reactor);
	});
	return owner;
}

function unbindReactiveSources(owner) {
	if (!owner.isBound) {
		return owner;
	}
	for (let i = 0; i < owner.sources.length; i++) {
		owner.sources[i].unsub(owner.reactors[i]);
	}
	owner.reactors.length = 0;
	owner.sources.length = 0;
	while (owner.acquired.length) {
		owner.acquired.pop().release();
	}
	owner.isBound = false;
	return owner;
}

// Class: Derivation
// A reactive value computed from a template of source cells. Automatically
// updates and notifies when any source cell changes.
//
// Attributes:
// - `isDerivation`: boolean - always true
// - `template`: any - template with nested reactive cells
// - `processor`: function? - transforms expanded template values
// - `reactors`: Array<function> - internal subscription handlers
// - `expanded`: any - current expanded (non-reactive) template values
// - `pending`: string - pending value mode (`"keep"` or `"clear"`)
class Derivation extends Reactive {
	constructor(
		template,
		processor = undefined,
		initial = true,
		updateStrategy = "join",
		pending = "keep",
	) {
		super();
		this.isDerivation = true;
		this.template = template;
		this.processor = processor;
		this.updateStrategy = Derivation.UpdateStrategy(updateStrategy);
		this.pending = pending === "clear" ? "clear" : "keep";
		this.reactors = [];
		this.sources = [];
		this.acquired = [];
		this._updater = undefined;
		this.isBound = false;
		this.expanded = Reactive.Expand(template);
		this._promiseToken = 0;
		this._pendingPath = undefined;
		this._pendingPrevious = undefined;
		this.revision = initial ? 0 : -1;
		if (initial) {
			if (
				this.updateStrategy === "immediate" ||
				!this._templateHasPendingSources()
			) {
				this._apply(this._compute(), false);
			} else {
				this.value = undefined;
				this.isPending = true;
			}
		} else {
			this.value = undefined;
		}
		this.bind();
	}

	static UpdateStrategy(value) {
		switch (value) {
			case "incremental":
			case "immediate":
			case "join":
				return value;
			default:
				return "join";
		}
	}

	_compute() {
		return this.processor ? this.processor(this.expanded) : this.expanded;
	}

	_recompute() {
		if (this.updateStrategy === "join" && this._hasPendingSources()) {
			this.isPending = true;
			return false;
		}
		const expanded = Reactive.Expand(this.template);
		if (eq(expanded, this.expanded)) {
			return false;
		}
		if (this.updateStrategy === "join" && this._hasPendingSources()) {
			this.isPending = true;
			return false;
		}
		this.expanded = expanded;
		this._apply(this._compute());
		return true;
	}

	_hasPendingSources() {
		return hasPendingReactiveSources(this.sources);
	}

	_templateHasPendingSources() {
		return templateHasPendingReactiveSources(this.template);
	}

	_apply(value, publish = true) {
		const token = ++this._promiseToken;
		this.previous = this.value;
		const isPromise = !!(value && typeof value.then === "function");
		if (isPromise) {
			this.isPending = true;
			this._pendingPath = Nothing;
			this._pendingPrevious = this.value;
			if (this.pending === "clear") {
				this.value = undefined;
			}
			if (publish) {
				this.revision++;
				this.pub(
					this.pending === "clear" ? undefined : this.value,
					Nothing,
					this,
					this.previous,
				);
			}
			value.then(
				(resolved) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.previous =
						this.pending === "clear" ? this._pendingPrevious : this.value;
					this.value = resolved;
					this._pendingPath = undefined;
					this._pendingPrevious = undefined;
					this.isPending = false;
					this.revision++;
					this.pub(resolved, Nothing, this, this.previous);
				},
				(error) => {
					if (token !== this._promiseToken) {
						return;
					}
					this._pendingPath = undefined;
					this._pendingPrevious = undefined;
					this.isPending = false;
					log.error("Derivation._apply: derived promise rejected, details", {
						cell: this.label,
						error:
							error instanceof Error
								? {
										name: error.name,
										message: error.message,
										stack: error.stack,
										cause: error.cause,
									}
								: {
										name: typeof error,
										message: String(error),
									},
						currentValue: this.value,
						previousValue: this.previous,
						sourceValues: this.expanded,
						derivedInput: this.expanded,
					});
				},
			);
			return;
		}
		this.previous = this.value;
		this.value = value;
		this._pendingPath = undefined;
		this._pendingPrevious = undefined;
		this.isPending = false;
		if (publish) {
			this.revision++;
			this.pub(value, Nothing, this, this.previous);
		}
	}

	// Subscribes to all reactive cells in template.
	bind() {
		return bindReactiveSources(this, this.template);
	}

	// Unsubscribes from all source cells.
	unbind() {
		return unbindReactiveSources(this);
	}

	// Unsubscribes and clears references.
	dispose() {
		this.unbind();
		this._promiseToken++;
		this.subs.length = 0;
		this.template = undefined;
		return this;
	}

	// Refreshes derived value and publishes updates.
	refresh() {
		this._recompute();
		return this;
	}

	// Registers a write-through updater used by `set()` and `merge()`.
	updater(fn) {
		this._updater = typeof fn === "function" ? fn : undefined;
		return this;
	}

	_forwardWrite(value, path = Nothing, force = false, op = "set") {
		const updater = this._updater;
		if (!updater) {
			log.error(`Derivation.${op}: derived values are read-only`, {
				cell: this.label,
				value,
				path,
				force,
				currentValue: this.value,
				previousValue: this.previous,
			});
			return false;
		}
		batch(() => {
			updater(value, this.value, path, force, this);
			this.update();
		});
		return true;
	}

	// Derived values can forward writes to source cells through `updater()`.
	set(value, path = Nothing, force = false) {
		this._forwardWrite(value, path, force, "set");
		return this;
	}

	// Derived values are read-only unless an updater redirects the merge.
	merge(value, path = Nothing) {
		path = pathify(path, Nothing);
		const current = path ? access(this.value, path) : this.value;
		const next =
			current === undefined
				? value
				: Array.isArray(current) && Array.isArray(value)
					? [...current, ...value]
					: Object.getPrototypeOf(current) === Object.prototype &&
							Object.getPrototypeOf(value) === Object.prototype
						? { ...current, ...value }
						: value;
		this._forwardWrite(next, path, false, "merge");
		return this;
	}

	// Updates derivation inputs and recomputes only when they changed.
	// Accepts reactive and non-reactive values.
	update(...inputs) {
		if (inputs.length > 0) {
			const nextTemplate = inputs.length === 1 ? inputs[0] : inputs;
			if (!eq(nextTemplate, this.template)) {
				this.template = nextTemplate;
				this.expanded = Reactive.Expand(nextTemplate);
				this.unbind();
				this.bind();
				if (this.updateStrategy === "immediate" || !this._hasPendingSources()) {
					this._apply(this._compute());
				} else {
					this.isPending = true;
				}
			}
		} else if (!this._recompute()) {
			if (this.updateStrategy === "join" && this._hasPendingSources()) {
				this.isPending = true;
			}
		}
		return this.value;
	}
}

// Class: Switched
// A reactive value that follows a dynamic target reactive selected by inputs.
//
// Attributes:
// - `inputs`: any - input template used to resolve the current target
// - `resolver`: function? - turns expanded inputs into a target reactive/value
// - `pending`: string - pending value mode (`"keep"` or `"clear"`)
class Switched extends Reactive {
	constructor(
		inputs,
		resolver = undefined,
		initial = true,
		updateStrategy = "join",
		pending = "keep",
	) {
		super();
		this.inputs = inputs;
		this.resolver = resolver;
		this.updateStrategy = Derivation.UpdateStrategy(updateStrategy);
		this.pending = pending === "clear" ? "clear" : "keep";
		this.reactors = [];
		this.sources = [];
		this.acquired = [];
		this.expanded = Reactive.Expand(inputs);
		this.isBound = false;
		this.target = undefined;
		this.targetReactor = undefined;
		this.fallback = new Cell();
		this._promiseToken = 0;
		this._pendingPath = undefined;
		this._pendingPrevious = undefined;
		this.revision = initial ? 0 : -1;
		if (initial) {
			if (
				this.updateStrategy === "immediate" ||
				!this._inputsHavePendingSources()
			) {
				this._switch(this._compute(), false);
			} else {
				this.value = undefined;
				this.isPending = true;
			}
		} else {
			this.value = undefined;
		}
		this.bind();
	}

	_compute() {
		return this.resolver ? this.resolver(this.expanded) : this.expanded;
	}

	_hasPendingSources() {
		return hasPendingReactiveSources(this.sources);
	}

	_inputsHavePendingSources() {
		return templateHasPendingReactiveSources(this.inputs);
	}

	_publish(value, path = Nothing, origin = this, previous = undefined) {
		const nextPath = this.target instanceof Selected ? Nothing : path;
		this.previous = this.value;
		this.value = this.target?.value;
		this._pendingPath = this.target?._pendingPath;
		this._pendingPrevious = this.target?._pendingPrevious;
		this.isPending = !!this.target?.isPending;
		this.revision++;
		refreshSelections(this, nextPath, previous);
		this.pub(value, nextPath, origin, previous);
	}

	_detachTarget() {
		if (!this.target || !this.targetReactor) {
			this.target = undefined;
			this.targetReactor = undefined;
			return;
		}
		this.target.unsub(this.targetReactor);
		if (
			this.target !== this.fallback &&
			typeof this.target.release === "function"
		) {
			this.target.release();
		}
		this.target = undefined;
		this.targetReactor = undefined;
	}

	_attachTarget(target, publish = true, previous = undefined) {
		const active = isReactiveSource(target) ? target : this.fallback;
		if (active === this.fallback) {
			this.fallback.set(target, Nothing, true);
		}
		this.target = active;
		const reactor = (value, path, origin, previous) => {
			this._publish(value, path, origin || active, previous);
		};
		this.targetReactor = reactor;
		active.sub(reactor);
		this.previous =
			previous !== undefined
				? previous
				: this.isPending && this.pending === "clear"
					? this._pendingPrevious
					: this.value;
		this.value = active.value;
		this._pendingPath = active._pendingPath;
		this._pendingPrevious = active._pendingPrevious;
		this.isPending = !!active.isPending;
		if (publish) {
			this.revision++;
			refreshSelections(this, Nothing);
			this.pub(this.value, Nothing, active, this.previous);
		}
	}

	_switch(next, publish = true, previous = undefined) {
		const token = ++this._promiseToken;
		if (next && typeof next.then === "function") {
			this.previous = this.value;
			this.isPending = true;
			this._pendingPath = Nothing;
			this._pendingPrevious = this.value;
			if (this.pending === "clear") {
				this.value = undefined;
			}
			if (publish) {
				this.revision++;
				this.pub(
					this.pending === "clear" ? undefined : this.value,
					Nothing,
					this,
					this.previous,
				);
			}
			next.then(
				(resolved) => {
					if (token !== this._promiseToken) {
						return;
					}
					this._switch(resolved, publish, this._pendingPrevious);
				},
				(error) => {
					if (token !== this._promiseToken) {
						return;
					}
					this._pendingPath = undefined;
					this._pendingPrevious = undefined;
					this.isPending = false;
					log.error("Switched._switch: switched promise rejected, details", {
						cell: this.label,
						error:
							error instanceof Error
								? {
										name: error.name,
										message: error.message,
										stack: error.stack,
										cause: error.cause,
									}
								: {
										name: typeof error,
										message: String(error),
									},
						currentValue: this.value,
						previousValue: this.previous,
						resolvedInputs: this.expanded,
					});
				},
			);
			return;
		}
		this._detachTarget();
		this.isPending = false;
		this._attachTarget(next, publish, previous);
	}

	_recompute(force = false) {
		if (this.updateStrategy === "join" && this._hasPendingSources()) {
			this.isPending = true;
			return false;
		}
		const expanded = Reactive.Expand(this.inputs);
		if (!force && eq(expanded, this.expanded)) {
			return false;
		}
		if (this.updateStrategy === "join" && this._hasPendingSources()) {
			this.isPending = true;
			return false;
		}
		this.expanded = expanded;
		this._switch(this._compute());
		return true;
	}

	bind() {
		return bindReactiveSources(this, this.inputs);
	}

	unbind() {
		return unbindReactiveSources(this);
	}

	dispose() {
		this.unbind();
		this._promiseToken++;
		this._detachTarget();
		this.fallback.subs.length = 0;
		this.subs.length = 0;
		this.inputs = undefined;
		this.resolver = undefined;
		return this;
	}

	refresh() {
		this._recompute(true);
		return this;
	}

	update(...inputs) {
		if (inputs.length > 0) {
			const nextInputs = inputs.length === 1 ? inputs[0] : inputs;
			if (!eq(nextInputs, this.inputs)) {
				this.inputs = nextInputs;
				this.expanded = Reactive.Expand(nextInputs);
				this.unbind();
				this.bind();
				if (this.updateStrategy === "immediate" || !this._hasPendingSources()) {
					this._switch(this._compute());
				} else {
					this.isPending = true;
				}
			}
		} else if (!this._recompute()) {
			if (this.updateStrategy === "join" && this._hasPendingSources()) {
				this.isPending = true;
				return this.value;
			}
			this._switch(this._compute());
		}
		return this.value;
	}

	set(value, path = Nothing, force = false) {
		if (!this.target || typeof this.target.set !== "function") {
			log.error("Switched.set: switched values are not writable", {
				cell: this.label,
				value,
				path,
				force,
				currentValue: this.value,
				previousValue: this.previous,
			});
			return this;
		}
		this.target.set(value, path, force);
		return this;
	}

	merge(value, path = Nothing) {
		if (!this.target || typeof this.target.merge !== "function") {
			log.error("Switched.merge: switched values are not writable", {
				cell: this.label,
				value,
				path,
				currentValue: this.value,
				previousValue: this.previous,
			});
			return this;
		}
		this.target.merge(value, path);
		return this;
	}

	push(value) {
		if (!this.target || typeof this.target.push !== "function") {
			log.error("Switched.push: switched values are not writable", {
				cell: this.label,
				value,
				currentValue: this.value,
				previousValue: this.previous,
			});
			return this;
		}
		this.target.push(value);
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Factory Functions
//
// ----------------------------------------------------------------------------

// Function: cell
// Factory that creates a new Cell with optional initial value.
//
// Parameters:
// - `value`: any - initial cell value
// - `pending`: string|object? - pending mode or `{ pending }` options object
//
// Returns: Cell
//
// Example:
// ```javascript
// const c = cell(42)
// c.sub(v => console.log(v))
// c.set(100)  // Logs: 100
// ```

function cell(value, options = "keep") {
	return new Cell(value, options);
}

// Function: cells
// Factory that creates either a single Cell or a map of Cells.
//
// Parameters:
// - `value`: any - initial cell value, or a plain object of values
//
// Returns: Cell|Object
//
// Example:
// ```javascript
// const { name, age } = cells({ name: "Ada", age: 37 })
// name.set("Adele")
// ```
function cells(value) {
	if (!isPlainObject(value)) {
		return cell(value);
	}
	const res = {};
	for (const key in value) {
		res[key] = cell(value[key]);
	}
	return res;
}

// Function: cellStore
// Creates a root `Cell` intended as application/tree state for store-mode UI.
// Prefer `cell.store(...)` (same function), matching `cell.derived` / `cell.batch`.
// Plain objects are shallow-copied so the caller can keep the input bag.
// Use `reconcile(next)` for full-tree patches and `select(path)` for views.
//
// cell.store.map(shape) is an alias of `cells(shape)` (one cell per key).
// Not the KV helper `store()` from `utils/storage.js`.
//
// Example:
// ```javascript
// import cell from "./cells.js"
// const state = cell.store({ logs: [], filter: "all" })
// Inspector.new().set({ value: state }).mount("#app")
// state.reconcile(nextTree)
// state.set("warn", "filter")
// ```
function cellStore(initial = undefined) {
	if (isPlainObject(initial)) {
		return cell({ ...initial });
	}
	return cell(initial);
}
cellStore.map = cells;
cellStore.reconcile = reconcile;

// Function: deferred
// Factory that creates a Cell with a defer schedule (debounced writes).
// Equivalent to `cell(value, { schedule: ["defer", delay] })`.
//
// Parameters:
// - `value`: any - initial cell value
// - `delay`: number - debounce delay in milliseconds
//
// Returns: Cell
function deferred(value, delay = 0) {
	return cell(value, { schedule: ["defer", delay] });
}

// Function: derived
// Factory that creates a new Derivation from template cells.
//
// Parameters:
// - `template`: any - source shape (cell, list of cells, or map of cells)
// - `processor`: function? - transforms unwrapped expanded shape passed as one argument
// - `initial`: boolean? - compute initial value immediately (default true)
// - `strategy`: string? - async update strategy (`"join"`, `"immediate"`, `"incremental"`)
// - `pending`: string? - pending value mode (`"keep"` or `"clear"`)
//
// Returns: Derivation
//
// Example:
// ```javascript
// const a = cell(1)
// const b = cell(2)
// const sum = derived([a, b], ([x, y]) => x + y)
// sum.sub(v => console.log("Sum:", v))
// a.set(5)  // Logs: "Sum: 7"
// ```

function derived(template, processor, initial, strategy, pending) {
	const { shouldInitialize, updateStrategy, pendingStrategy } =
		parseReactiveOptions(initial, strategy, pending);
	return new Derivation(
		template,
		processor,
		shouldInitialize,
		updateStrategy,
		pendingStrategy,
	);
}

function switched(inputs, resolver, initial, strategy, pending) {
	const { shouldInitialize, updateStrategy, pendingStrategy } =
		parseReactiveOptions(initial, strategy, pending);
	return new Switched(
		inputs,
		resolver,
		shouldInitialize,
		updateStrategy,
		pendingStrategy,
	);
}

function selected(parent, path) {
	return new Selected(parent, path);
}

function unwrap(value) {
	return Reactive.Unwrap(value);
}

// Function: reconcile
// Diff-merges plain `value` into a `Cell` or `Selected`, writing only changed
// paths through `set`. Notifications are batched.
//
// Parameters:
// - `target`: Cell|Selected - reactive to patch
// - `value`: any - desired plain tree (typically from structuredClone + edit)
// - `options`: object? - reserved for future keyed-array options (`key`)
//
// Returns: target
//
// Example:
// ```javascript
// const state = cell({ user: { name: "Ada", age: 36 } })
// state.reconcile({ user: { name: "Ada", age: 37 } })
// // equivalent path write: state.set(37, "user.age")
// ```
function reconcile(target, value, options = undefined) {
	if (!target?.isReactive || typeof target.set !== "function") {
		throw new TypeError(
			"reconcile: target must be a Cell or Selected (reactive with set)",
		);
	}
	// options reserved (key/merge) for Phase 1.x keyed array moves
	void options;
	return batch(() => {
		if (target instanceof Selected) {
			const parent = target.parent;
			if (!parent?.isReactive || typeof parent.set !== "function") {
				throw new TypeError(
					"reconcile: Selected target requires a reactive parent",
				);
			}
			const basePath = target.path ? target.path.slice() : [];
			applyReconcile(parent, basePath, value, target.value);
			return target;
		}
		applyReconcile(target, [], value, target.value);
		return target;
	});
}

// Function: effect
// Subscribes `effector` to all reactive values found in `inputs`.
// Runs once immediately with expanded values, then on each source update.
// Returns an idempotent disposer that unsubscribes all sources and runs the
// latest cleanup returned by `effector`.
function effect(inputs, effector) {
	let active = true;
	let cleanup;
	const sources = [];
	const reactors = [];
	const acquired = [];

	const run = (path = undefined, origin = undefined) => {
		if (!active || typeof effector !== "function") {
			return;
		}
		if (typeof cleanup === "function") {
			cleanup();
			cleanup = undefined;
		}
		cleanup = effector(Reactive.Expand(inputs), path, origin);
	};

	walkReactiveSources(inputs, (cell, sourceRootPath) => {
		const path = sourceRootPath.length
			? sourceRootPath.slice()
			: sourceRootPath;
		const reactor = (_value, sourcePath, origin) => {
			const fullPath =
				sourcePath === undefined ||
				sourcePath === null ||
				sourcePath === Nothing
					? path
					: Array.isArray(sourcePath)
						? [...path, ...sourcePath]
						: [...path, sourcePath];
			run(fullPath, origin || cell);
		};
		cell.sub(reactor);
		if (cell?.isReactive && typeof cell.acquire === "function") {
			cell.acquire();
			acquired.push(cell);
		}
		sources.push(cell);
		reactors.push(reactor);
	});

	run();

	return () => {
		if (!active) {
			return false;
		}
		active = false;
		if (typeof cleanup === "function") {
			cleanup();
			cleanup = undefined;
		}
		for (let i = 0; i < sources.length; i++) {
			sources[i].unsub(reactors[i]);
		}
		for (let i = 0; i < acquired.length; i++) {
			acquired[i].release();
		}
		sources.length = 0;
		reactors.length = 0;
		acquired.length = 0;
		return true;
	};
}

// ----------------------------------------------------------------------------
//
// SECTION: Exports
//
// ----------------------------------------------------------------------------

const walk = Reactive.Walk;
const expand = Reactive.Expand;

Object.assign(cell, {
	map: cells,
	derived,
	switched,
	batch,
	deferred,
	selected,
	unwrap,
	effect,
	walk,
	expand,
	reconcile,
	store: cellStore,
});

export {
	batch,
	Cell,
	cell,
	cellStore,
	cells,
	Derivation,
	deferred,
	derived,
	effect,
	expand,
	Reactive,
	reconcile,
	Selected,
	Switched,
	selected,
	switched,
	unwrap,
	walk,
};

export default cell;

// EOF
