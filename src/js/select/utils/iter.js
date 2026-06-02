// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/iter
// Iteration helpers for list-like, map-like, and scalar values. Includes
// `iquery()` path expansion with `*` wildcard segments.

import { eq } from "./compare.js";
import { extractor, predicate } from "./func.js";
import {
	isArrayLike,
	isIterable,
	isMapLike,
	isWalkable,
} from "./values.js";

// ----------------------------------------------------------------------------
//
// GENERATORS
//
// ----------------------------------------------------------------------------

// Function: iquery
// Queries `value` with `path` and yields matching terminal values. Wildcard
// segments use a trailing `*` suffix and expand the referenced collection.
//
// Example:
// ```javascript
// const data = { user: { tags: [{ name: "alpha" }, { name: "beta" }] } }
// Array.from(iquery(data, "user.tags*.name"))
// // => ["alpha", "beta"]
// ```
function* iquery(value, path, offset = 0, sep = ".") {
	if (typeof path === "string") {
		yield* iquery(value, path.split(sep), offset, sep)
		return
	}
	if (!Array.isArray(path)) {
		return
	}
	let current = value
	for (let i = offset; i < path.length; i++) {
		const k = path[i]
		if (typeof k === "string" && k.endsWith("*")) {
			const kk = k.slice(0, -1)
			const next = current?.[kk]
			if (next === undefined || next === null) {
				return
			}
			for (const vv of ivalues(next)) {
				yield* iquery(vv, path, i + 1, sep)
			}
			return
		}
		current = current?.[k]
		if (current === undefined && i < path.length - 1) {
			return
		}
	}
	yield current
}

// Function: ivalues
// Yields values for array-like, map-like, iterable, and scalar inputs.
function* ivalues(value) {
	if (isArrayLike(value)) {
		for (let i = 0; i < value.length; i++) {
			yield value[i]
		}
	} else if (value instanceof Map) {
		for (const v of value.values()) {
			yield v
		}
	} else if (value instanceof Set) {
		for (const v of value.values()) {
			yield v
		}
	} else if (value?.constructor === Object) {
		for (const k in value) {
			yield value[k]
		}
	} else if (typeof value !== "string" && isIterable(value)) {
		for (const v of value) {
			yield v
		}
	} else {
		yield value
	}
}

// Function: iitems
// Yields `[key, value]` pairs for array-like, map-like, iterable, and scalar values.
function* iitems(value) {
	if (value == null) {
		return;
	}
	if (typeof value === "string") {
		yield [0, value];
		return;
	}
	if (isArrayLike(value)) {
		for (let i = 0; i < value.length; i++) {
			yield [i, value[i]];
		}
		return;
	}
	if (value instanceof Map) {
		for (const kv of value.entries()) {
			yield kv;
		}
		return;
	}
	if (value instanceof Set) {
		let i = 0;
		for (const v of value.values()) {
			yield [i, v];
			i += 1;
		}
		return;
	}
	if (isMapLike(value)) {
		for (const k in value) {
			if (Object.hasOwn(value, k)) {
				yield [k, value[k]];
			}
		}
		return;
	}
	if (isIterable(value)) {
		let i = 0;
		for (const v of value) {
			yield [i++, v];
		}
		return;
	}
	yield [0, value];
}

// Function: ikeys
// Yields keys for array-like, map-like, iterable, and scalar values.
function* ikeys(value) {
	for (const [k] of iitems(value)) {
		yield k;
	}
}

// Function: iindex
// Returns the first index or key whose value strictly equals `item`.
function iindex(values, item) {
	for (const [k, v] of iitems(values)) {
		if (v === item) {
			return k;
		}
	}
	return -1;
}

// Function: ifind
// Returns the first index or key whose value satisfies `predicate`.
function ifind(values, predicate) {
	for (const [k, v] of iitems(values)) {
		if (predicate(v, k, values)) {
			return k;
		}
	}
	return -1;
}

// Function: ifirst
// Returns the first value in `values`, optionally matching `predicate`.
function ifirst(values, predicate = undefined) {
	if (predicate === undefined || predicate === null) {
		for (const [, v] of iitems(values)) {
			return v;
		}
		return undefined;
	}
	for (const [k, v] of iitems(values)) {
		if (predicate(v, k, values)) {
			return v;
		}
	}
	return undefined;
}

// Function: ilast
// Returns the last value in `values`, optionally matching `predicate`.
function ilast(values, predicate = undefined) {
	let found = false;
	let result;
	if (predicate === undefined || predicate === null) {
		for (const [, v] of iitems(values)) {
			result = v;
			found = true;
		}
	} else {
		for (const [k, v] of iitems(values)) {
			if (predicate(v, k, values)) {
				result = v;
				found = true;
			}
		}
	}
	return found ? result : undefined;
}

// Function: inth
// Returns the value at `index`, supporting negative indexes.
function inth(values, indexValue) {
	if (!Number.isInteger(indexValue)) {
		return undefined;
	}
	if (indexValue >= 0) {
		let i = 0;
		for (const [, v] of iitems(values)) {
			if (i === indexValue) {
				return v;
			}
			i += 1;
		}
		return undefined;
	}
	const size = -indexValue;
	const ring = new Array(size);
	let seen = 0;
	for (const [, v] of iitems(values)) {
		ring[seen % size] = v;
		seen += 1;
	}
	return seen >= size ? ring[seen % size] : undefined;
}

// Function: icount
// Counts all values or values matching a predicate.
function icount(values, predicateOrExtractor = undefined) {
	let res = 0;
	if (predicateOrExtractor === undefined || predicateOrExtractor === null) {
		for (const _ of iitems(values)) {
			res += 1;
		}
		return res;
	}
	const pred = predicate(predicateOrExtractor);
	for (const [k, v] of iitems(values)) {
		if (pred(v, k, values)) {
			res += 1;
		}
	}
	return res;
}

// Function: ifound
// Returns the first value equal to `item`, optionally by projection.
function ifound(values, item, extractorFunc = undefined) {
	if (extractorFunc === undefined || extractorFunc === null) {
		for (const [, v] of iitems(values)) {
			if (v === item) {
				return v;
			}
		}
		return undefined;
	}
	const ext = extractor(extractorFunc);
	const searchKey = ext(item);
	for (const [, v] of iitems(values)) {
		if (ext(v) === searchKey) {
			return v;
		}
	}
	return undefined;
}

// Function: ipick
// Returns a random item from `values`.
function ipick(items) {
	let res;
	let seen = 0;
	for (const [, v] of iitems(items)) {
		seen += 1;
		if (Math.random() < 1 / seen) {
			res = v;
		}
	}
	return res;
}

// Function: ihead
// Returns the first item or first `count` items from `values`.
function ihead(value, count = undefined) {
	if (count === undefined || count === 0) {
		return ifirst(value);
	}
	const res = [];
	if (count > 0) {
		let i = 0;
		for (const [, v] of iitems(value)) {
			if (i >= count) {
				break;
			}
			res.push(v);
			i += 1;
		}
		return res;
	}
	const tail = -count;
	const pending = [];
	let start = 0;
	let size = 0;
	for (const [, v] of iitems(value)) {
		if (size < tail) {
			pending[(start + size) % tail] = v;
			size += 1;
		} else {
			res.push(pending[start]);
			pending[start] = v;
			start = (start + 1) % tail;
		}
	}
	return res;
}

// Function: ientries
// Returns collection entries as `[key, value]` pairs.
function ientries(value) {
	if (value == null) {
		return [];
	}
	switch (value?.constructor) {
		case Array: {
			const res = new Array(value.length);
			for (let i = 0; i < value.length; i++) {
				res[i] = [i, value[i]];
			}
			return res;
		}
		case Object:
			return Object.entries(value);
		case Map:
			return Array.from(value.entries());
		case Set: {
			const res = [];
			let i = 0;
			for (const v of value.values()) {
				res.push([i, v]);
				i += 1;
			}
			return res;
		}
		default:
			if (isIterable(value)) {
				const res = [];
				let i = 0;
				for (const v of value) {
					res.push([i, v]);
					i += 1;
				}
				return res;
			}
			return [[0, value]];
	}
}

// ----------------------------------------------------------------------------
//
// DIFFING
//
// ----------------------------------------------------------------------------

// Function: iremap
// Streams `[path, new, old]` updates for the given `(new,old)` values. When
// path is `null` it means the whole value, when `new` is `null` it means
// a removal, when `old` is undefined, it means an addition.
function* iremap(value, state, equals = eq) {
	const ta =
		value === null
			? null
			: (value?.constructor ??
				(value !== undefined && typeof value === "object"
					? Object
					: undefined));
	const tb =
		state === null
			? null
			: (state?.constructor ??
				(state !== undefined && typeof state === "object"
					? Object
					: undefined));
	if (ta !== tb) {
		yield [null, value, state];
		return;
	}
	switch (ta) {
		case null:
		case undefined:
			yield [null, null, state];
			break;
		case Array:
		case Object:
		case Map: {
			const keys = new Set();
			for (const [k, v] of iitems(value)) {
				const old = state instanceof Map ? state.get(k) : state?.[k];
				if (!equals(old, v)) {
					yield [k, v, old];
					keys.add(k);
				}
			}
			for (const k of ikeys(state)) {
				if (!keys.has(k)) {
					yield [k, null, state instanceof Map ? state.get(k) : state?.[k]];
				}
			}
			break;
		}
		default:
			yield [null, value, state];
			break;
	}
}

// Function: iwalk
// Generator that depth-walks `value`, yielding `[node, path, parents]` tuples.
function* iwalk(value, functor, processor, p = [], parents = []) {
	value = processor ? processor(value) : value;
	if (functor?.(value, p, parents) !== false) {
		yield [value, p, parents];
		if (isArrayLike(value)) {
			const pp = [...parents, value];
			for (let i = 0; i < value.length; i++) {
				yield* iwalk(value[i], functor, processor, [...p, i], pp);
			}
			return;
		}
		if (value instanceof Map) {
			const pp = [...parents, value];
			for (const [k, v] of value.entries()) {
				yield* iwalk(v, functor, processor, [...p, k], pp);
			}
			return;
		}
		if (value instanceof Set) {
			const pp = [...parents, value];
			for (const [k, v] of value.entries()) {
				yield* iwalk(v, functor, processor, [...p, k], pp);
			}
			return;
		}
		if (value?.constructor === Object) {
			const pp = [...parents, value];
			for (const k in value) {
				yield* iwalk(value[k], functor, processor, [...p, k], pp);
			}
			return;
		}
		if (typeof value !== "string" && isIterable(value)) {
			const pp = [...parents, value];
			let i = 0;
			for (const v of value) {
				yield* iwalk(v, functor, processor, [...p, i], pp);
				i += 1;
			}
		}
	}
}

// Function: ileaves
// Generator that depth-walks `value` and yields only leaf values.
function* ileaves(value, processor) {
	value = processor ? processor(value) : value;
	if (isWalkable(value)) {
		if (isArrayLike(value)) {
			for (let i = 0; i < value.length; i++) {
				yield* ileaves(value[i], processor);
			}
			return;
		}
		if (value instanceof Map) {
			for (const [, v] of value.entries()) {
				yield* ileaves(v, processor);
			}
			return;
		}
		if (value instanceof Set) {
			for (const [, v] of value.entries()) {
				yield* ileaves(v, processor);
			}
			return;
		}
		if (value?.constructor === Object) {
			for (const k in value) {
				yield* ileaves(value[k], processor);
			}
			return;
		}
		if (typeof value !== "string" && isIterable(value)) {
			for (const v of value) {
				yield* ileaves(v, processor);
			}
		}
		return;
	}
	yield value;
}

export {
	icount,
	ientries,
	ifind,
	ifirst,
	ifound,
	ihead,
	iindex,
	ikeys,
	iitems,
	ilast,
	ileaves,
	inth,
	ipick,
	iquery,
	iremap,
	ivalues,
	iwalk,
};

// EOF
