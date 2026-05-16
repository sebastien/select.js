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

import {
	access,
	logger,
	Nothing,
	path as pathify,
	reassign,
	remap,
	Something,
} from "./utils.js";

const log = logger("select.cells");

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
	static resolveValue(value) {
		if (value instanceof Reactive) {
			if (value.isPending) {
				return undefined;
			}
			const next = value.value;
			return next && typeof next.then === "function" ? undefined : next;
		}
		return value;
	}

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
		return remap(value, (v) => Reactive.resolveValue(v), {
			deep: true,
			descend: (v) => !(v?.isReactive === true),
		});
	}

	constructor(value = Nothing) {
		this.isReactive = true;
		this.value = value === Nothing ? undefined : value;
		this.previous = undefined;
		this.isPending = false;
		this.revision = value === Nothing ? -1 : 0;
		this.subs = [];
		this.selections = undefined;
		this._selectionCache = new Map();
		this._normalizer = undefined;
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

	// Subscribes `handler` to value changes. Handler receives (value, path, origin).
	sub(handler, trigger = false) {
		this.subs.push(handler);
		if (trigger) {
			handler(this.value, Nothing, this);
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
	refresh() {
		// TODO: We could get a revision number from the parent and
		// detect if it's dirty.
		const value = access(this.parent.value, this.path);
		this.previous = this.value;
		this.value = value;
		this.isPending = !!(value && typeof value.then === "function");
		this.revision++;
		if (this.selections) {
			const seen = new Set();
			for (const selection of this.selections.iter([])) {
				if (selection !== this && !seen.has(selection)) {
					seen.add(selection);
					selection.refresh();
				}
			}
		}
		this.pub(value, this.path, this.parent);
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
		const updated =
			this.revision === -1
				? [value]
				: Array.isArray(this.value)
					? [...this.value, value]
					: [this.value, value];
		this.set(updated);
		return this;
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

	_refreshSelections(path) {
		if (!this.selections) {
			return;
		}
		const seen = new Set();
		const refresh = (selection) => {
			if (!seen.has(selection)) {
				seen.add(selection);
				selection.refresh();
			}
		};
		// Refresh exact path + descendants first.
		for (const selection of this.selections.iter(path)) {
			refresh(selection);
		}
		// Then refresh ancestors (including root selection).
		if (path?.length) {
			for (let i = path.length - 1; i >= 0; i--) {
				const ancestorPath = i === 0 ? [] : path.slice(0, i);
				const ancestors = this.selections.get(ancestorPath);
				if (ancestors) {
					for (const selection of ancestors) {
						refresh(selection);
					}
				}
			}
		}
	}

	// Internal update implementation. Applies value, updates selections,
	// notifies subscribers.
	_update(value, path, _force = false) {
		// TODO: Maybe patch?
		path = pathify(path, Nothing);
		value = this.normalizeValue(value, path);
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
		this._refreshSelections(path);
		this.pub(value, path, this);
		if (pending && typeof pending.then === "function") {
			pending.then(
				(resolved) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.previous = this.value;
					this.value = path ? reassign(this.value, path, resolved) : resolved;
					this.isPending = false;
					this.revision++;
					this._refreshSelections(path);
					this.pub(resolved, path, this);
				},
				(error) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.isPending = false;
					log.error("Cell._update: cell promise rejected, details", {
						error,
						path,
					});
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

	merge(value, path = Nothing) {
		path = pathify(path, Nothing);
		const current = path ? access(this.value, path) : this.value;
		if (current === undefined) {
			this._update(value, path);
		} else if (Array.isArray(current) && Array.isArray(value)) {
			this._update([...current, ...value], path);
		} else if (
			Object.getPrototypeOf(current) === Object.prototype &&
			Object.getPrototypeOf(value) === Object.prototype
		) {
			this._update({ ...current, ...value }, path);
		} else {
			this._update(value, path);
		}
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
		const isPromise = !!(value && typeof value.then === "function");
		if (isPromise) {
			this.isPending = true;
			if (publish) {
				this.revision++;
				this.pub(value, Nothing, this);
			}
			value.then(
				(resolved) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.previous = this.value;
					this.value = resolved;
					this.isPending = false;
					this.revision++;
					this.pub(resolved, Nothing, this);
				},
				(error) => {
					if (token !== this._promiseToken) {
						return;
					}
					this.isPending = false;
					log.error("Derivation._apply: derived promise rejected, details", {
						error,
					});
				},
			);
			return;
		}
		this.previous = this.value;
		this.value = value;
		this.isPending = false;
		if (publish) {
			this.revision++;
			this.pub(value, Nothing, this);
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
					sourcePath === undefined || sourcePath === null || sourcePath === Nothing
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

	// Updates derivation inputs and recomputes only when they changed.
	// Accepts reactive and non-reactive values.
	update(...inputs) {
		let changed = false;

		if (Array.isArray(this.template)) {
			const current = Array.isArray(this.expanded)
				? this.expanded
				: Reactive.Expand(this.template);
			const next = current.slice();
			const n = inputs.length < next.length ? inputs.length : next.length;
			for (let i = 0; i < n; i++) {
				const input = inputs[i];
				const value = Reactive.resolveValue(input);
				if (!Object.is(next[i], value)) {
					next[i] = value;
					changed = true;
				}
			}
			if (changed) {
				this.expanded = next;
				this._apply(this._compute());
			}
			return this.value;
		}

		if (inputs.length > 0) {
			const input = inputs.length === 1 ? inputs[0] : inputs;
			const value = Reactive.resolveValue(input);
			if (!Object.is(this.expanded, value)) {
				this.expanded = value;
				changed = true;
			}
		}

		if (changed) {
			this._apply(this._compute());
		}
		return this.value;
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

function selected(parent, path) {
	return new Selected(parent, path);
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

	for (const [cell, path] of Reactive.Walk(inputs)) {
		const reactor = (_value, sourcePath, origin) => {
			const fullPath =
				sourcePath === undefined || sourcePath === null || sourcePath === Nothing
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
	}

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

export {
	Cell,
	cell,
	selected,
	Deferred,
	Derivation,
	deferred,
	derived,
	effect,
	expand,
	Reactive,
	Selected,
	walk,
};
export default Object.assign(cell, {
	derived,
	deferred,
	selected,
	effect,
	// TODO: We may want to deprecate these
	select: selected,
	defer: deferred,
	derive: derived,
	walk,
	expand,
});

// EOF
