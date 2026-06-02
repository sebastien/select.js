// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-06-02

// Module: select/utils/iter
// Iteration helpers for list-like, map-like, and scalar values.

import { eq } from "./compare.js";
import { isArrayLike, isIterable, isMapLike, isWalkable } from "./values.js";

// ----------------------------------------------------------------------------
//
// GENERATORS
//
// ----------------------------------------------------------------------------

// Function: iitems
// Yields `[key, value]` pairs for array-like, map-like, iterable, and scalar values.
function* iitems(value) {
	if (isArrayLike(value)) {
		for (let i = 0; i < value.length; i++) {
			yield [i, value[i]];
		}
	} else if (isMapLike(value)) {
		if (value instanceof Map) {
			for (const kv of value.entries()) {
				yield kv;
			}
		} else {
			for (const k in value) {
				yield [k, value[k]];
			}
		}
	} else if (isIterable(value)) {
		let i = 0;
		for (const v of value) {
			yield [i++, v];
		}
	} else {
		yield [undefined, value];
	}
}

// Function: ikeys
// Yields keys for array-like, map-like, iterable, and scalar values.
function* ikeys(value) {
	if (isArrayLike(value)) {
		for (let i = 0; i < value.length; i++) {
			yield i;
		}
	} else if (isMapLike(value)) {
		if (value instanceof Map) {
			for (const k of value.keys()) {
				yield k;
			}
		} else {
			for (const k in value) {
				yield k;
			}
		}
	} else if (isIterable(value)) {
		let i = 0;
		for (const _ of value) {
			yield i++;
		}
	} else {
		yield undefined;
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

export { ikeys, iitems, iremap, iwalk, ileaves };

// EOF
