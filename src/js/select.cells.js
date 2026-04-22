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

// Normalizes path to array form. Nothing becomes null, single values become
// single-element arrays.
const normpath = (path) => {
	if (path === Nothing) {
		return null;
	} else if (Array.isArray(path)) {
		return path;
	} else if (path !== undefined) {
		return [path];
	}
	return null;
};

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
		throw new Error(`${this.constructor.name}.refresh()} not implemented`);
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
		super(value);
	}

	// Internal update implementation. Applies value, updates selections,
	// notifies subscribers.
	_update(value, path, _force = false) {
		// TODO: Maybe patch?
		path = normpath(path);
		// TODO: Check existing
		const updated = path ? assign(this.value, path, value) : value;
		this.previous = this.value;
		this.value = updated;
		this.isPending = !!(updated && typeof updated.then === "function");
		this.revision++;
		if (this.selections) {
			for (const r of this.selections.iter(path)) {
				r.refresh();
			}
		}
		this.pub(value, path, this);
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
				const fullPath =
					sourcePath === undefined || sourcePath === null
						? path
						: Array.isArray(sourcePath)
							? [...path, ...sourcePath]
							: [...path, sourcePath];
				this.expanded = assign(this.expanded, fullPath, value);
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
export default Object.assign(cell, { deferred, derived, walk, expand });

// EOF
