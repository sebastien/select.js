const Nothing = Object.freeze(new Object());
const Something = Object.freeze(new Object());
export const access = (context, path, offset = 0) => {
	if (path && path.length && context !== undefined) {
		const n = path.length;
		// Note that it's a feature here to allow an offset greater than the path
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

export const assign = (scope, path, value, merge = undefined, offset = 0) => {
	const n = path.length;
	if (n === 0) {
		return merge ? merge(scope, value) : value;
	}
	// We make sure the root is an object if we need it
	let root =
		n > offset && !(scope && scope instanceof Object)
			? typeof path[offset] === "number"
				? new Array(path[offset])
				: {}
			: scope;
	// Now this to make sure that path exists
	let s = root;
	let sp = null;
	// We iterate on the path except the last item
	for (let i = offset; i < n - 1; i++) {
		const k = path[i];
		// We must ensure the current scope is an object or
		// an array. If not, we replace the previous entry
		// with the corresponding structure;
		if (!(s && s instanceof Object)) {
			s = typeof k === "number" ? new Array(k) : {};
			if (i === 0) {
				root = s;
			} else {
				sp[path[i - 1]] = s;
			}
		}
		// If it's an array and the key is a number, we expand it so that
		// we can set the key;
		if (typeof k === "number" && s instanceof Array) {
			while (s.length <= k) {
				s.push(undefined);
			}
		}
		// We save the current scope as the previous scope
		sp = s;
		s = s[k];
	}
	const k = path[n - 1];
	s[k] = merge ? merge(s[k], value) : value;
	return root;
};

const normpath = (path) =>
	(path =
		path === Nothing
			? null
			: path instanceof Array
			? path
			: path !== undefined
			? [path]
			: null);

// ----------------------------------------------------------------------------
//
// REACTIVE BASE
//
// ----------------------------------------------------------------------------

class Selections {
	constructor() {
		// NOTE: The drawback is that we're creating multiple nested maps,
		// when we could potentially only have keys. We could try an
		// alternate implementation.
		this.selections = new Map();
	}

	// --
	// Iterates through all the added/registered entries under the given
	// path (inclusively)
	*iter(path) {
		if (path instanceof Map) {
			// We do depth first
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

	scope(path, create = false) {
		path =
			path instanceof Array
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

	get(path) {
		const scope = this.scope(path);
		return scope ? scope.get(Something) : undefined;
	}

	add(path, value) {
		const scope = this.scope(path, true);
		if (scope.has(Something)) {
			scope.get(Something).push(value);
		} else {
			scope.set(Something, [value]);
		}
		return this;
	}

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

class Reactive {
	// --
	// Walks a structure with reactive elements, and yields `[reactive,path]`
	// tuples for the reactive cell and its path within the structure.
	static *Walk(value, path = []) {
		if (
			value === null ||
			value === undefined ||
			typeof value !== "object"
		) {
			// pass
		} else if (value instanceof Reactive) {
			yield [value, path];
		} else if (value instanceof Array) {
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

	// --
	// Expands the given structure, recursively finding reactive values
	// and expanding them to their value.
	static Expand(value) {
		if (
			value === undefined ||
			value === null ||
			typeof value !== "object"
		) {
			return value;
		} else if (value instanceof Reactive) {
			return value.value;
		} else if (value instanceof Array) {
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
		this.revision = value === Nothing ? -1 : 0;
		this.subs = [];
		this.selections = undefined;
	}

	// TODO: A selection should be a path
	select(path) {
		path = path instanceof Array ? path : [path];
		this.selections = this.selections ?? new Selections();
		const sel = new Selected(this.value, path);
		sel.parent = this;
		sel.path = path;
		this.selections.add(path, sel);
		return sel;
	}

	// ========================================================================
	// PUB/SUB
	// ========================================================================

	sub(handler) {
		this.subs.push(handler);
		return this;
	}

	unsub(handler) {
		const i = this.subs.indexOf(handler);
		if (i >= 0) {
			this.subs.splice(i, 1);
		}
		return this;
	}

	// TODO: Revisit pub and how it works. It should probably
	// trigger the selections when it's a set, but not when
	// propagating up.
	pub(value, path, origin) {
		for (const handler of this.subs) {
			handler(value, path, origin);
		}
		return this;
	}

	refresh() {
		throw new Error(`${this.constructor.name}.refresh()} not implemented`);
	}
	// ========================================================================
	// GENERIC VALUE/COLLECTION API
	// ========================================================================

	get length() {
		if (
			this.revision === -1 ||
			this.value === null ||
			this.value === undefined
		) {
			return 0;
		} else if (this.value instanceof Array) {
			return this.value.length;
		} else if (Object.getPrototypeOf(this.value) === Object.prototype) {
			return Object.keys(this.value).length;
		} else {
			return 1;
		}
	}

	map(functor) {
		if (this.revision === -1) {
			return null;
		} else if (this.value === undefined) {
			return null;
		} else if (this.value instanceof Array) {
			return this.value.map(functor);
		} else if (Object.getPrototypeOf(this.value) === Object.prototype) {
			const res = [];
			for (const k of this.value) {
				res[k] = functor(this.value[k]);
			}
			return res;
		} else {
			return [functor(this.value)];
		}
	}
	get(key = Nothing) {
		if (key === Nothing) {
			return this.value;
		}
	}
}
// ----------------------------------------------------------------------------
//
// SELECTED (READ/WRITE)
//
// ----------------------------------------------------------------------------

export class Selected extends Reactive {
	constructor(parent, path) {
		super(access(parent, path));
		this.parent = parent;
		this.path = path;
	}

	refresh() {
		// TODO: We could get a revision number from the parent and
		// detect if it's dirty.
		const value = access(this.parent.value, this.path);
		this.value = value;
		this.revision++;
		this.pub(value, this.path, this.parent);
	}

	set(value, path = Nothing, force = false) {
		// Delegates to the parent
		path = normpath(path);
		return this.parent.set(
			value,
			path ? [...this.path, path] : this.path,
			force
		);
	}
}

// ----------------------------------------------------------------------------
//
// CELL (READ/WRITE)
//
// ----------------------------------------------------------------------------

export class Cell extends Reactive {
	constructor(value = Nothing) {
		super(value);
	}

	// TODO: Maybe patch?
	_update(value, path, force = false) {
		path = normpath(path);
		// TODO: Check existing
		// const existing = access(value, path);
		const updated = path ? assign(this.value, path, value) : value;
		this.value = updated;
		this.revision++;
		// We refresh the selections based on the change
		if (this.selections) {
			for (const r of this.selections.iter(path)) {
				console.log(" Refreshing selected", r.path);
				r.refresh();
			}
		}
		// We notify the subscribers of the change
		this.pub(value, path, this);
	}

	// ========================================================================
	// GENERIC VALUE/COLLECTION API
	// ========================================================================

	set(value, path = Nothing, force = false) {
		// TODO: Should detect a change
		this._update(value, path, force);
	}

	push(value) {
		if (this.revision === -1) {
			this.value = [value];
		} else if (this.value instanceof Array) {
			this.value.push(value);
		} else {
			this.value = [this.value, value];
		}
		this.revision++;
		// TODO: Publish
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// DERIVATION
//
// ----------------------------------------------------------------------------

class Derivation extends Reactive {
	constructor(template, processor = undefined, initial = true) {
		super();
		this.template = template;
		this.processor = processor;
		this.reactors = [];
		this.expanded = Reactive.Expand(template);
		this.value = initial
			? this.processor
				? this.expanded instanceof Array
					? this.processor(...this.expanded)
					: this.processor(this.expanded)
				: this.expanded
			: undefined;
		this.revision = initial ? 0 : -1;
		this.bind();
	}

	bind() {
		for (const [cell, path] of Reactive.Walk(this.template)) {
			const reactor = (value) => {
				// NOTE: We way want to debounce the updates
				this.expanded = assign(this.expanded, path, value);
				this.value = this.processor
					? this.expanded instanceof Array
						? this.processor(...this.expanded)
						: this.processor(this.expanded)
					: this.expanded;
				this.revision++;
				this.pub();
			};
			cell.sub(reactor);
			this.reactors.push(reactor);
		}
		return this;
	}
	unbind() {
		let i = 0;
		for (const [cell] of Reactive.Walk(this.template)) {
			cell.unsub(this.reactors[i]);
			i++;
		}
		while (this.reactors) {
			this.reactors.pop();
		}
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// API
//
// ----------------------------------------------------------------------------

export const walk = Reactive.Walk;
export const expand = Reactive.Expand;
export function cell(value) {
	return new Cell(value);
}
export function derived(template, processor, initial) {
	return new Derivation(template, processor, initial);
}
export default cell;

// EOF
