// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

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
// const doubled = derived([count], c => c * 2)
//
// doubled.sub((value) => console.log("Doubled:", value))
// count.set(5)  // Logs: "Doubled: 10"
// ```

// ----------------------------------------------------------------------------
//
// SECTION: Sentinel Values
//
// ----------------------------------------------------------------------------

// Sentinel value representing "no value" state for cells.
const Nothing = Object.freeze(new Object());

// Sentinel value representing "any value" for selection matching.
const Something = Object.freeze(new Object());

const logSelectCells = (level, scope, message, details = {}) => {
	console[level](`[select.cells] ${scope}: ${message}, details`, details);
};

const isPlainObject = (value) =>
	value !== null &&
	value !== undefined &&
	typeof value === "object" &&
	Object.getPrototypeOf(value) === Object.prototype;

const eq = (a, b) => {
	if (Object.is(a, b)) {
		return true;
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!eq(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		let n = 0;
		for (const k in a) {
			if (!Object.hasOwn(a, k)) {
				continue;
			}
			n += 1;
			if (!Object.hasOwn(b, k) || !eq(a[k], b[k])) {
				return false;
			}
		}
		for (const k in b) {
			if (Object.hasOwn(b, k)) {
				n -= 1;
			}
		}
		return n === 0;
	}
	return false;
};

// ----------------------------------------------------------------------------
//
// SECTION: Path Utilities
//
// ----------------------------------------------------------------------------

// Function: access
// Safely retrieves a nested value from `context` following `path`.
//
// Parameters:
// - `context`: object - root object to traverse
// - `path`: Array<string|number> - property path as array of keys
// - `offset`: number? - starting index in path (default 0)
//
// Returns: any - value at path, or undefined if path invalid

const access = (context, path, offset = 0) => {
	if (path?.length && context !== undefined) {
		const n = path.length;
		for (
			let i = offset;
			i < n && context !== undefined && context !== null;
			i++
		) {
			// TODO: We may want to deal with number vs key
			context = context[path[i]];
		}
	}
	return context;
};

// Function: assign
// Sets a value at a nested path, creating intermediate objects/arrays as needed.
//
// Parameters:
// - `scope`: object - root object to modify
// - `path`: Array<string|number> - property path
// - `value`: any - value to set
// - `merge`: function? - optional merge function: (old, new) => merged
// - `offset`: number? - starting index in path (default 0)
//
// Returns: object - modified root object

const assign = (scope, path, value, merge = undefined, offset = 0) => {
	const n = path.length;
	if (n === 0) {
		return merge ? merge(scope, value) : value;
	}
	let root =
		n > offset && !(scope && scope instanceof Object)
			? typeof path[offset] === "number"
				? new Array(path[offset])
				: {}
			: scope;
	let s = root;
	let sp = null;
	for (let i = offset; i < n - 1; i++) {
		const k = path[i];
		if (!(s && s instanceof Object)) {
			s = typeof k === "number" ? new Array(k) : {};
			if (i === 0) {
				root = s;
			} else {
				sp[path[i - 1]] = s;
			}
		}
		if (typeof k === "number" && Array.isArray(s)) {
			while (s.length <= k) {
				s.push(undefined);
			}
		}
		sp = s;
		s = s[k];
	}
	const k = path[n - 1];
	s[k] = merge ? merge(s[k], value) : value;
	return root;
};

const clone = (value, key) => {
	return Array.isArray(value)
		? value.slice()
		: value && Object.getPrototypeOf(value) === Object.prototype
			? { ...value }
			: typeof key === "number"
				? []
				: {};
};

const reassign = (scope, path, value, merge = undefined, offset = 0) => {
	const n = path.length;
	if (n === 0) {
		return merge ? merge(scope, value) : value;
	}
	const start = offset < 0 ? 0 : offset;
	if (start >= n) {
		return scope;
	}

	const root = clone(scope);

	let currentClone = root;
	let currentOriginal =
		scope &&
		(Array.isArray(scope) || Object.getPrototypeOf(scope) === Object.prototype)
			? scope
			: undefined;

	for (let i = start; i < n - 1; i++) {
		const key = path[i];
		const originalChild = currentOriginal ? currentOriginal[key] : undefined;
		const childClone = clone(originalChild);
		// We pad any missing intermediate array items if key is a number
		if (Array.isArray(currentClone) && typeof key === "number") {
			while (currentClone.length <= key) {
				currentClone.push(undefined);
			}
		}
		currentClone[key] = childClone;
		currentClone = childClone;
		currentOriginal = originalChild;
	}

	const leafKey = path[n - 1];
	if (Array.isArray(currentClone) && typeof leafKey === "number") {
		while (currentClone.length <= leafKey) {
			currentClone.push(undefined);
		}
	}
	currentClone[leafKey] = merge ? merge(currentClone[leafKey], value) : value;
	return root;
};

// Normalizes path to array form. Nothing becomes null, single values become
// single-element arrays.
const normpath = (path) => {
	if (path === Nothing) {
		return null;
	} else if (Array.isArray(path)) {
		return path;
	} else if (path !== undefined && path !== null) {
		return [path];
	}
	return null;
};

const parsePrimitive = (value) => {
	if (value === "null") return null;
	if (value === "true") return true;
	if (value === "false") return false;
	const num = Number(value);
	if (!Number.isNaN(num) && value.trim() !== "") return num;
	return value;
};

const formatPrimitive = (value) => {
	if (value === null) return "null";
	if (value === true) return "true";
	if (value === false) return "false";
	return `${value}`;
};

const UNSAFE_LOCATION_KEY = /^(?:__proto__|prototype|constructor)$/;

const warnIssue = (warn, scope, message, details = {}) => {
	if (typeof warn === "function") {
		warn(scope, new Error(message), details);
	}
};

const sanitizeLocationText = (value, warn, scope, details = {}) => {
	const text = `${value ?? ""}`;
	let sanitized = "";
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (
			(code >= 0x00 && code <= 0x1f) ||
			code === 0x7f ||
			code === 0x2028 ||
			code === 0x2029
		) {
			continue;
		}
		sanitized += text[i];
	}
	if (sanitized !== text) {
		warnIssue(warn, scope, "control characters pruned", {
			value: text,
			sanitized,
			...details,
		});
	}
	return sanitized;
};

const sanitizeLocationKey = (key, warn, scope, details = {}) => {
	const sanitized = sanitizeLocationText(key, warn, scope, details);
	if (!sanitized || UNSAFE_LOCATION_KEY.test(sanitized) || sanitized.endsWith("[]")) {
		warnIssue(warn, scope, "unsafe key pruned", {
			key,
			sanitized,
			...details,
		});
		return undefined;
	}
	return sanitized;
};

const sanitizeLocationItem = (value, warn, scope, details = {}) => {
	if (value === undefined) {
		return undefined;
	}
	if (value === null || value === true || value === false) {
		return value;
	}
	if (typeof value === "string") {
		return sanitizeLocationText(value, warn, scope, details);
	}
	if (typeof value === "number") {
		if (Number.isFinite(value)) {
			return value;
		}
		warnIssue(warn, scope, "non-finite number pruned", { value, ...details });
		return undefined;
	}
	warnIssue(warn, scope, "unsupported location value pruned", {
		type: typeof value,
		value,
		...details,
	});
	return undefined;
};

const sanitizeLocationArray = (value, warn, scope, details = {}) => {
	const res = [];
	for (let i = 0; i < value.length; i++) {
		const item = sanitizeLocationItem(value[i], warn, scope, {
			...details,
			index: i,
		});
		if (item !== undefined) {
			res.push(item);
		}
	}
	return res;
};

const sanitizeLocationRecord = (value, warn, scope) => {
	if (!isPlainObject(value)) {
		if (value !== undefined && value !== null) {
			warnIssue(warn, scope, "unsupported location container pruned", {
				type: typeof value,
				value,
			});
		}
		return {};
	}
	const res = {};
	for (const key in value) {
		if (!Object.hasOwn(value, key)) {
			continue;
		}
		const safeKey = sanitizeLocationKey(key, warn, scope, { key });
		if (safeKey === undefined) {
			continue;
		}
		const item = value[key];
		if (Array.isArray(item)) {
			const safeArray = sanitizeLocationArray(item, warn, scope, { key: safeKey });
			if (safeArray.length) {
				res[safeKey] = safeArray;
			}
		} else {
			const safeValue = sanitizeLocationItem(item, warn, scope, { key: safeKey });
			if (safeValue !== undefined) {
				res[safeKey] = safeValue;
			}
		}
	}
	return res;
};

const sanitizeQueryText = (value, warn, scope) => {
	const text = sanitizeLocationText(value, warn, scope);
	const normalized = text.replace(/^\?/, "");
	const i = normalized.indexOf("#");
	if (i >= 0) {
		const pruned = normalized.slice(0, i);
		warnIssue(warn, scope, "query hash fragment pruned", {
			value: normalized,
			sanitized: pruned,
		});
		return pruned;
	}
	return normalized;
};

const sanitizeHashText = (value, warn, scope) =>
	sanitizeLocationText(`${value || ""}`.replace(/^#/, ""), warn, scope);

const sanitizePathText = (value, warn, scope) => {
	const text = sanitizeLocationText(value, warn, scope);
	const normalized = text ? (text.startsWith("/") ? text : `/${text}`) : "/";
	return normalized;
};

const formatPath = (value, warn) => {
	const text = sanitizePathText(value, warn, "browser.path");
	const segments = text.split("/");
	for (let i = 0; i < segments.length; i++) {
		segments[i] = encodeURIComponent(segments[i]);
	}
	return segments.join("/") || "/";
};

const parsePath = (value, warn) => {
	const text = sanitizePathText(value, warn, "browser.path");
	const segments = text.split("/");
	for (let i = 0; i < segments.length; i++) {
		try {
			segments[i] = decodeURIComponent(segments[i]);
		} catch (error) {
			warnIssue(warn, "browser.path", "path segment decode failed", {
				error,
				segment: segments[i],
				index: i,
			});
		}
	}
	const path = segments.join("/");
	return path || "/";
};

const sanitizeValue = (value) => {
	if (value === undefined) {
		return undefined;
	}
	if (Array.isArray(value)) {
		const res = [];
		for (let i = 0; i < value.length; i++) {
			const item = sanitizeValue(value[i]);
			if (item !== undefined) {
				res.push(item);
			}
		}
		return res;
	}
	if (isPlainObject(value)) {
		const res = {};
		for (const k in value) {
			if (!Object.hasOwn(value, k)) {
				continue;
			}
			const item = sanitizeValue(value[k]);
			if (item !== undefined) {
				res[k] = item;
			}
		}
		return res;
	}
	return value;
};

const mergePatch = (scope, path, value) => {
	if (!path || path.length === 0) {
		return value;
	}
	if (path.length === 1 && isPlainObject(scope) && isPlainObject(value)) {
		const merged = { ...scope, ...value };
		return sanitizeValue(merged);
	}
	return sanitizeValue(reassign(scope, path, value));
};

const QuerySerializer = {
	parse(value) {
		const result = {};
		const search = `${value || ""}`.replace(/^[?#]/, "");
		const entries = new URLSearchParams(search);
		for (const [k, v] of entries.entries()) {
			if (k.endsWith("[]")) {
				const baseKey = k.slice(0, -2);
				const existing = result[baseKey];
				if (Array.isArray(existing)) {
					existing.push(parsePrimitive(v));
				} else if (existing !== undefined) {
					result[baseKey] = [existing, parsePrimitive(v)];
				} else {
					result[baseKey] = [parsePrimitive(v)];
				}
			} else {
				result[k] = parsePrimitive(v);
			}
		}
		return result;
	},
	format(value) {
		const search = new URLSearchParams();
		const params = sanitizeValue(value) || {};
		for (const k in params) {
			if (!Object.hasOwn(params, k)) {
				continue;
			}
			const v = params[k];
			if (Array.isArray(v)) {
				for (let i = 0; i < v.length; i++) {
					search.append(`${k}[]`, formatPrimitive(v[i]));
				}
			} else if (v !== undefined) {
				search.set(k, formatPrimitive(v));
			}
		}
		return search.toString();
	},
};

const JSONSerializer = {
	parse(value) {
		return JSON.parse(value);
	},
	format(value) {
		return JSON.stringify(sanitizeValue(value));
	},
};

const getBrowserWindow = () =>
	typeof globalThis !== "undefined" && globalThis.window
		? globalThis.window
		: undefined;

const getHistoryMode = (options, dflt = "replace") => {
	if (options && typeof options === "object" && !Array.isArray(options)) {
		return options.mode === "push" ? "push" : dflt;
	}
	return dflt;
};

const isForced = (options) =>
	options === true ||
	!!(options && typeof options === "object" && !Array.isArray(options) && options.force);

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
	scope(path, create = false) {
		path = Array.isArray(path)
			? path
			: path !== undefined && path !== null
				? [path]
				: [];
		let scope = this.selections;
		for (const key of path) {
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
	get(path) {
		const scope = this.scope(path);
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
		const scope = this.scope(path);
		if (!scope) {
			return false;
		}
		const l = scope ? scope.get(Something) : undefined;
		if (!l) {
			return false;
		}
		const i = l.indexOf(value);
		if (i === -1) {
			return false;
		}
		l.splice(i, 1);
		// TODO: We should clean up the node
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
// - `isPending`: boolean - true when current value is a pending promise
// - `revision`: number - monotonically increasing change counter (-1 if empty)
// - `subs`: Array<function> - subscriber callbacks
// - `selections`: Selections? - registry for nested property selections
class Reactive {
	// Generator that yields `[reactive, path]` tuples for all reactive values
	// nested within `value` at `path`.
	static *Walk(value, path = []) {
		if (value === null || value === undefined || typeof value !== "object") {
			// pass
		} else if (value instanceof Reactive) {
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
		if (value === undefined || value === null || typeof value !== "object") {
			return value;
		} else if (value instanceof Reactive) {
			return value.value;
		} else if (Array.isArray(value)) {
			return value.map((_) => Reactive.Expand(_));
		} else if (Object.getPrototypeOf(value) === Object.prototype) {
			const res = {};
			for (const k in value) {
				res[k] = Reactive.Expand(value[k]);
			}
			return res;
		} else {
			return value;
		}
	}

	constructor(value = Nothing) {
		this.isReactive = true;
		this.value = value === Nothing ? undefined : value;
		this.previous = undefined;
		this.isPending = false;
		this.revision = value === Nothing ? -1 : 0;
		this.subs = [];
		this.selections = undefined;
	}

	// Creates a `Selected` view at `path` within this cell's value.
	select(path) {
		// TODO: A selection should be a path
		path = Array.isArray(path) ? path : [path];
		this.selections = this.selections ?? new Selections();
		const sel = new Selected(this.value, path);
		sel.parent = this;
		sel.path = path;
		this.selections.add(path, sel);
		return sel;
	}

	// Subscribes `handler` to value changes. Handler receives (value, path, origin).
	sub(handler) {
		this.subs.push(handler);
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

	// Notifies all subscribers of change. Called with (value, path, origin).
	pub(value, path, origin) {
		// TODO: Revisit pub and how it works. It should probably
		// trigger the selections when it's a set, but not when
		// propagating up.
		for (const handler of this.subs) {
			handler(value, path, origin);
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
		return access(this.value, normpath(key));
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
	constructor(parent, path) {
		super(access(parent, path));
		this.parent = parent;
		this.path = path;
	}

	// Disposes this selection and removes it from parent registry.
	dispose() {
		this.parent?.selections?.remove(this.path, this);
		this.parent = undefined;
		this.path = undefined;
		this.subs.length = 0;
		return this;
	}

	// Refreshes value from parent and notifies subscribers.
	refresh() {
		// TODO: We could get a revision number from the parent and
		// detect if it's dirty.
		const value = access(this.parent.value, this.path);
		this.previous = this.value;
		this.value = value;
		this.isPending = !!(value && typeof value.then === "function");
		this.revision++;
		this.pub(value, this.path, this.parent);
	}

	// Sets value at this selection's path. Delegates to parent cell.
	set(value, path = Nothing, force = false) {
		path = normpath(path);
		return this.parent.set(
			value,
			path ? [...this.path, ...path] : this.path,
			force,
		);
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
// Example:
// ```javascript
// const c = cell({ count: 0 })
// c.sub((v) => console.log("Changed:", v))
// c.set(1, "count")  // Updates nested property
// ```

class Cell extends Reactive {
	constructor(value = Nothing) {
		super();
		this._promiseToken = 0;
		if (value !== Nothing) {
			this._update(value, Nothing, true);
		}
	}

	// Internal update implementation. Applies value, updates selections,
	// notifies subscribers.
	_update(value, path, _force = false) {
		// TODO: Maybe patch?
		path = normpath(path);
		if (!_force) {
			if (path) {
				const current = access(this.value, path);
				if (Object.is(current, value)) {
					return;
				}
			} else if (Object.is(this.value, value)) {
				return;
			}
		}
		// TODO: Check existing
		const updated = path ? reassign(this.value, path, value) : value;
		const pending =
			path && value && typeof value.then === "function" ? value : updated;
		const token = ++this._promiseToken;
		this.previous = this.value;
		this.value = updated;
		this.isPending = !!(pending && typeof pending.then === "function");
		this.revision++;
		if (this.selections) {
			for (const r of this.selections.iter(path)) {
				r.refresh();
			}
		}
		this.pub(value, path, this);
		if (pending && typeof pending.then === "function") {
			pending.then(
				(resolved) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.previous = this.value;
					this.value = path
						? reassign(this.value, path, resolved)
						: resolved;
					this.isPending = false;
					this.revision++;
					if (this.selections) {
						for (const r of this.selections.iter(path)) {
							r.refresh();
						}
					}
					this.pub(resolved, path, this);
				},
				(error) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.isPending = false;
					logSelectCells(
						"error",
						"Cell._update",
						"cell promise rejected",
						{ error, path },
					);
				},
			);
		}
	}

	// Sets value (at optional `path`). Creates nested structure as needed.
	set(value, path = Nothing, force = false) {
		// TODO: Should detect a change
		this._update(value, path, force);
		return this;
	}

	// Appends value to array. Converts non-array to array first.
	push(value) {
		const updated =
			this.revision === -1
				? [value]
				: Array.isArray(this.value)
					? [...this.value, value]
					: [this.value, value];
		this._update(updated, Nothing);
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Deferred
//
// ----------------------------------------------------------------------------

// Class: Deferred
// A cell that debounces updates. `set()` triggers after `delay` ms of
// inactivity. Useful for search inputs, sliders, etc.
//
// Attributes:
// - `delay`: number - milliseconds to debounce
class Deferred extends Cell {
	constructor(value = Nothing, delay = 0) {
		super(value);
		this.delay = delay;
		this._timer = null;
	}

	// Sets value after debounce delay. Cancels pending update if called again.
	set(value, path = Nothing, force = false) {
		if (this._timer) {
			clearTimeout(this._timer);
		}
		this._timer = setTimeout(() => {
			this._timer = null;
			this._update(value, path, force);
		}, this.delay);
		return this;
	}

	// Clears pending update timer.
	dispose() {
		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = null;
		}
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Derivation
//
// ----------------------------------------------------------------------------

// Class: Derivation
// A reactive value computed from a template of source cells. Automatically
// updates and notifies when any source cell changes.
//
// Attributes:
// - `template`: any - template with nested reactive cells
// - `processor`: function? - transforms expanded template values
// - `reactors`: Array<function> - internal subscription handlers
// - `expanded`: any - current expanded (non-reactive) template values
class Derivation extends Reactive {
	constructor(template, processor = undefined, initial = true) {
		super();
		this.template = template;
		this.processor = processor;
		this.reactors = [];
		this.sources = [];
		this.isBound = false;
		this.expanded = Reactive.Expand(template);
		this._promiseToken = 0;
		this.revision = initial ? 0 : -1;
		if (initial) {
			this._apply(this._compute(), false);
		} else {
			this.value = undefined;
		}
		this.bind();
	}

	_compute() {
		return this.processor
			? Array.isArray(this.expanded)
				? this.processor(...this.expanded)
				: this.processor(this.expanded)
			: this.expanded;
	}

	_apply(value, publish = true) {
		const token = ++this._promiseToken;
		this.previous = this.value;
		this.value = value;
		this.isPending = !!(value && typeof value.then === "function");
		if (publish) {
			this.revision++;
			this.pub();
		}
		if (value && typeof value.then === "function") {
			value.then(
				(resolved) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.previous = this.value;
					this.value = resolved;
					this.isPending = false;
					this.revision++;
					this.pub();
				},
				(error) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.isPending = false;
					logSelectCells(
						"error",
						"Derivation._apply",
						"derived promise rejected",
						{ error },
					);
				},
			);
		}
	}

	// Subscribes to all reactive cells in template.
	bind() {
		if (this.isBound) {
			return this;
		}
		this.isBound = true;
		for (const [cell, path] of Reactive.Walk(this.template)) {
			const reactor = (value, sourcePath) => {
				// NOTE: We way want to debounce the updates
				if (value && typeof value.then === "function") {
					return;
				}
				const fullPath =
					sourcePath === undefined || sourcePath === null
						? path
						: Array.isArray(sourcePath)
							? [...path, ...sourcePath]
							: [...path, sourcePath];
				this.expanded = reassign(this.expanded, fullPath, value);
				this._apply(this._compute());
			};
			cell.sub(reactor);
			this.sources.push(cell);
			this.reactors.push(reactor);
		}
		return this;
	}

	// Unsubscribes from all source cells.
	unbind() {
		if (!this.isBound) {
			return this;
		}
		for (let i = 0; i < this.sources.length; i++) {
			this.sources[i].unsub(this.reactors[i]);
		}
		while (this.reactors.length) {
			this.reactors.pop();
		}
		while (this.sources.length) {
			this.sources.pop();
		}
		this.isBound = false;
		return this;
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
		this._apply(this._compute());
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Browser Cells
//
// ----------------------------------------------------------------------------

class BrowserValueCell extends Cell {
	constructor(value, options = {}) {
		super(value);
		this.mode = options.mode === "push" ? "push" : "replace";
		this.merge = options.merge || false;
		this.normalize = options.normalize;
		this.writer = options.writer;
	}

	set(value, path = Nothing, options = false) {
		const resolvedPath = normpath(path);
		const force = isForced(options);
		let next = this.merge
			? mergePatch(this.value, resolvedPath, value)
			: resolvedPath
				? sanitizeValue(reassign(this.value, resolvedPath, value))
				: value;
		if (this.normalize) {
			next = this.normalize(next);
		}
		if (!force && eq(this.value, next)) {
			return this;
		}
		this._update(resolvedPath ? access(next, resolvedPath) : next, resolvedPath, force);
		if (this.writer) {
			this.writer(this.value, {
				mode: getHistoryMode(options, this.mode),
				path: resolvedPath,
			});
		}
		return this;
	}

	sync(value) {
		if (this.normalize) {
			value = this.normalize(value);
		}
		this._update(value, Nothing, false);
		return this;
	}
}

class LocalStorageCell extends Cell {
	constructor(key, value, options = {}) {
		super(value);
		this.key = key;
		this.merge = options.merge || false;
		this.writer = options.writer;
	}

	set(value, path = Nothing, options = false) {
		const resolvedPath = normpath(path);
		const force = isForced(options);
		const next = this.merge
			? mergePatch(this.value, resolvedPath, value)
			: resolvedPath
				? sanitizeValue(reassign(this.value, resolvedPath, value))
				: value;
		if (!force && eq(this.value, next)) {
			return this;
		}
		this._update(resolvedPath ? access(next, resolvedPath) : next, resolvedPath, force);
		if (this.writer) {
			this.writer(this.value, { path: resolvedPath });
		}
		return this;
	}

	sync(value) {
		this._update(value, Nothing, false);
		return this;
	}
}

// Function: browser
// Creates browser-backed reactive cells for path, query, hash and local storage.
//
// Parameters:
// - `options`: object? - serializers and write policy
//
// Returns: object - `{ path, query, hash, local }`
function browser(options = {}) {
	const win = getBrowserWindow();
	const hasWindow = !!win?.location;
	const hasHistory =
		!!(hasWindow && win.history && typeof win.history.replaceState === "function");
	const hasStorage = !!(hasWindow && win.localStorage);
	const warn =
		typeof options.warn === "function"
			? options.warn
			: (scope, error, details = {}) =>
					logSelectCells(
						"warn",
						scope,
						error?.message || "browser warning",
						{ error, ...details },
					);
	const urlMode = options.mode === "push" ? "push" : "replace";
	const querySerializer =
		options.query &&
		typeof options.query.parse === "function" &&
		typeof options.query.format === "function"
			? options.query
			: QuerySerializer;
	const hashSerializer =
		options.hash &&
		typeof options.hash.parse === "function" &&
		typeof options.hash.format === "function"
			? options.hash
			: QuerySerializer;
	const localSerializer =
		options.local &&
		typeof options.local.parse === "function" &&
		typeof options.local.format === "function"
			? options.local
			: JSONSerializer;

	const safeParse = (scope, serializer, text, fallback) => {
		try {
			return serializer.parse(text);
		} catch (error) {
			warn(scope, error, { text });
			return fallback;
		}
	};

	const parseLocationRecord = (scope, serializer, text, fallback) =>
		sanitizeLocationRecord(safeParse(scope, serializer, text, fallback), warn, scope);

	const formatLocationRecord = (scope, serializer, value) =>
		serializer.format(sanitizeLocationRecord(value, warn, scope));

	const formatURL = (pathValue, queryValue, hashValue) => {
		const path = formatPath(pathValue, warn);
		const search = sanitizeQueryText(
			formatLocationRecord("browser.query", querySerializer, queryValue),
			warn,
			"browser.query",
		);
		const hash = sanitizeHashText(
			formatLocationRecord("browser.hash", hashSerializer, hashValue),
			warn,
			"browser.hash",
		);
		return `${path}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
	};

	const readPath = () =>
		hasWindow
			? parsePath(win.location.pathname, warn)
			: sanitizePathText(options.path || "/", warn, "browser.path");
	const readQuery = (fallback = {}) =>
		hasWindow
			? parseLocationRecord(
					"browser.query",
					querySerializer,
					sanitizeQueryText(win.location.search, warn, "browser.query"),
					fallback,
				)
			: fallback;
	const readHash = (fallback = {}) =>
		hasWindow
			? parseLocationRecord(
					"browser.hash",
					hashSerializer,
					sanitizeHashText(win.location.hash, warn, "browser.hash"),
					fallback,
				)
			: fallback;

	const writeURL = (mode = urlMode) => {
		if (!hasHistory) {
			return;
		}
		const url = formatURL(path.value, query.value, hash.value);
		if (mode === "push" && typeof win.history.pushState === "function") {
			win.history.pushState(null, "", url);
		} else {
			win.history.replaceState(null, "", url);
		}
	};

	const path = new BrowserValueCell(readPath(), {
		mode: urlMode,
		normalize: (value) => parsePath(value, warn),
		writer: (_value, settings) => writeURL(settings.mode),
	});
	const query = new BrowserValueCell(readQuery({}), {
		mode: urlMode,
		merge: true,
		normalize: (value) =>
			sanitizeLocationRecord(value, warn, "browser.query"),
		writer: (_value, settings) => writeURL(settings.mode),
	});
	const hash = new BrowserValueCell(readHash({}), {
		mode: urlMode,
		merge: true,
		normalize: (value) =>
			sanitizeLocationRecord(value, warn, "browser.hash"),
		writer: (_value, settings) => writeURL(settings.mode),
	});

	const syncFromLocation = () => {
		const nextPath = readPath();
		const nextQuery = readQuery(query.value || {});
		const nextHash = readHash(hash.value || {});
		if (!eq(path.value, nextPath)) {
			path.sync(nextPath);
		}
		if (!eq(query.value, nextQuery)) {
			query.sync(nextQuery);
		}
		if (!eq(hash.value, nextHash)) {
			hash.sync(nextHash);
		}
	};

	if (hasWindow && typeof win.addEventListener === "function") {
		win.addEventListener("popstate", syncFromLocation);
		win.addEventListener("hashchange", () => {
			const nextHash = readHash(hash.value || {});
			if (!eq(hash.value, nextHash)) {
				hash.sync(nextHash);
			}
		});
	}

	const locals = new Map();
	const writeLocal = (key, value, serializer) => {
		if (!hasStorage) {
			return;
		}
		if (value === undefined) {
			win.localStorage.removeItem(key);
			return;
		}
		const formatted = serializer.format(value);
		if (formatted === undefined) {
			win.localStorage.removeItem(key);
		} else {
			win.localStorage.setItem(key, formatted);
		}
	};

	if (hasWindow && typeof win.addEventListener === "function") {
		win.addEventListener("storage", (event) => {
			if (!event.key || !locals.has(event.key)) {
				return;
			}
			const entry = locals.get(event.key);
			const fallback = entry.defaultValue;
			const next =
				event.newValue === null
					? fallback
					: safeParse(
							`browser.local:${event.key}`,
							entry.serializer,
							event.newValue,
							entry.cell.value ?? fallback,
						);
			if (!eq(entry.cell.value, next)) {
				entry.cell.sync(next);
			}
		});
	}

	const local = (key, dflt, opts = {}) => {
		if (locals.has(key)) {
			return locals.get(key).cell;
		}
		const serializer =
			opts &&
			typeof opts.parse === "function" &&
			typeof opts.format === "function"
				? opts
				: localSerializer;
		const initial = hasStorage
			? (() => {
					const raw = win.localStorage.getItem(key);
					return raw === null
						? dflt
						: safeParse(`browser.local:${key}`, serializer, raw, dflt);
				})()
			: dflt;
		const cell = new LocalStorageCell(key, initial, {
			merge: true,
			writer: (value) => writeLocal(key, value, serializer),
		});
		locals.set(key, {
			cell,
			defaultValue: dflt,
			serializer,
		});
		if (hasStorage && win.localStorage.getItem(key) === null && dflt !== undefined) {
			writeLocal(key, initial, serializer);
		}
		return cell;
	};

	return { path, query, hash, local };
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
//
// Returns: Cell
//
// Example:
// ```javascript
// const c = cell(42)
// c.sub(v => console.log(v))
// c.set(100)  // Logs: 100
// ```

function cell(value) {
	return new Cell(value);
}

// Function: deferred
// Factory that creates a new Deferred (debounced) cell.
//
// Parameters:
// - `value`: any - initial cell value
// - `delay`: number - debounce delay in milliseconds
//
// Returns: Deferred

function deferred(value, delay) {
	return new Deferred(value, delay);
}

// Function: derived
// Factory that creates a new Derivation from template cells.
//
// Parameters:
// - `template`: any - template containing reactive cells (can be nested)
// - `processor`: function? - transforms expanded values: (values...) => result
// - `initial`: boolean? - compute initial value immediately (default true)
//
// Returns: Derivation
//
// Example:
// ```javascript
// const a = cell(1)
// const b = cell(2)
// const sum = derived([a, b], (x, y) => x + y)
// sum.sub(v => console.log("Sum:", v))
// a.set(5)  // Logs: "Sum: 7"
// ```

function derived(template, processor, initial) {
	return new Derivation(template, processor, initial);
}

// ----------------------------------------------------------------------------
//
// SECTION: Exports
//
// ----------------------------------------------------------------------------

const walk = Reactive.Walk;
const expand = Reactive.Expand;

export {
	access,
	assign,
	browser,
	Cell,
	cell,
	Deferred,
	Derivation,
	deferred,
	derived,
	expand,
	Reactive,
	Selected,
	walk,
};
export default Object.assign(cell, { browser, deferred, derived, walk, expand });

// EOF
