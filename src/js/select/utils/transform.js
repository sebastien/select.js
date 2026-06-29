// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-12

// Module: select/utils/transform
// Pure collection transforms and immutable structural update helpers.

import { cmp } from "./compare.js";
import { extractor, idem, predicate } from "./func.js";
import { iitems, ivalues } from "./iter.js";
import { index } from "./traverse.js";
import {
	array,
	bool,
	clone,
	empty,
	isIterable,
	isObject,
	len,
	list,
} from "./values.js";

// Function: iter
// Iterates `value` with `(item, key, result, value)` semantics and returns the
// accumulated result processed by `done`. Strings are treated as scalar values.
function iter(
	value,
	step,
	done = idem,
	initial = undefined,
	emptyValue = undefined,
) {
	let res = initial;
	let current;
	let key;
	let count = 0;
	if (value === undefined || value === null) {
		return emptyValue === undefined
			? done(res, undefined, undefined, value)
			: emptyValue;
	}
	if (typeof value === "string") {
		const rr = step(value, undefined, res, value);
		res = rr === undefined ? res : rr;
		return done(res, value, undefined, value);
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			current = value[i];
			key = i;
			count += 1;
			const rr = step(current, key, res, value);
			if (rr === false) {
				return done(res, current, key, value);
			}
			res = rr === undefined ? res : rr;
		}
	} else if (value instanceof Map) {
		for (const [k, v] of value.entries()) {
			current = v;
			key = k;
			count += 1;
			const rr = step(current, key, res, value);
			if (rr === false) {
				return done(res, current, key, value);
			}
			res = rr === undefined ? res : rr;
		}
	} else if (value instanceof Set) {
		let i = 0;
		for (const v of value.values()) {
			current = v;
			key = i;
			count += 1;
			const rr = step(current, key, res, value);
			if (rr === false) {
				return done(res, current, key, value);
			}
			res = rr === undefined ? res : rr;
			i += 1;
		}
	} else if (isObject(value)) {
		for (const k in value) {
			if (!Object.hasOwn(value, k)) {
				continue;
			}
			current = value[k];
			key = k;
			count += 1;
			const rr = step(current, key, res, value);
			if (rr === false) {
				return done(res, current, key, value);
			}
			res = rr === undefined ? res : rr;
		}
	} else if (isIterable(value)) {
		let i = 0;
		for (const v of value) {
			current = v;
			key = i;
			count += 1;
			const rr = step(current, key, res, value);
			if (rr === false) {
				return done(res, current, key, value);
			}
			res = rr === undefined ? res : rr;
			i += 1;
		}
	} else {
		const rr = step(value, undefined, res, value);
		res = rr === undefined ? res : rr;
		return done(res, value, undefined, value);
	}
	return count === 0
		? emptyValue === undefined
			? done(res, undefined, undefined, value)
			: emptyValue
		: done(res, current, key, value);
}

// Function: append
// Appends `value` to `collection`, optionally preserving `key` when supported.
function append(collection, value, key = undefined) {
	if (Array.isArray(collection)) {
		collection.push(value);
		return collection;
	}
	if (collection instanceof Set) {
		collection.add(value);
		return collection;
	}
	if (collection instanceof Map) {
		if (key !== undefined && !collection.has(key)) {
			collection.set(key, value);
			return collection;
		}
		let next = len(collection);
		if (next < 0) {
			next = 0;
		}
		while (collection.has(next)) {
			next += 1;
		}
		collection.set(next, value);
		return collection;
	}
	if (isObject(collection)) {
		if (key !== undefined && !Object.hasOwn(collection, key)) {
			collection[key] = value;
			return collection;
		}
		let next = len(collection);
		if (next < 0) {
			next = 0;
		}
		while (Object.hasOwn(collection, next)) {
			next += 1;
		}
		collection[next] = value;
		return collection;
	}
	return key === undefined ? [value] : { [key]: value };
}

// Function: hasKey
// Returns true when `value` contains `key` according to collection semantics.
function hasKey(value, key) {
	switch (value?.constructor) {
		case Object:
			return Object.hasOwn(value, key);
		case Map:
			return value.has(key);
		case Set:
			return value.has(key);
		case Array:
			return index(value, key) !== -1;
		default:
			return value === key;
	}
}

// Function: map
// Maps collection values while preserving array, object, map, and set shape.
function map(value, func = undefined) {
	if (value === null || value === undefined) {
		return value;
	}
	func = typeof func !== "function" ? () => func : func;
	if (
		value === null ||
		value === undefined ||
		value === true ||
		value === false ||
		typeof value === "string" ||
		(!Array.isArray(value) &&
			!(value instanceof Map) &&
			!(value instanceof Set) &&
			!isObject(value) &&
			!isIterable(value))
	) {
		return func(value, undefined, value);
	}
	const res =
		Array.isArray(value) ||
		value instanceof Map ||
		value instanceof Set ||
		isObject(value)
			? empty(value)
			: [];
	iter(value, (v, k) => append(res, func(v, k, value), k));
	return res;
}

// Function: reduce
// Reduces collection values with `(result, value, key)` semantics.
function reduce(value, func, initial) {
	return iter(
		value,
		(v, k, res, source) => func(res, v, k, source),
		idem,
		initial,
		initial,
	);
}

// Function: updated
// Returns a copy of `value` with `other` assigned at `key`.
function updated(value, key, other) {
	switch (value?.constructor) {
		case Array:
			if (value[key] === other) {
				return value;
			}
			return assigned(value, [key], other);
		case Object:
			return value[key] === other ? value : { ...value, [key]: other };
		case Map:
			if (value.get(key) === other) {
				return value;
			} else {
				const res = new Map(value);
				res.set(key, other);
				return res;
			}
		case Set:
			if (value.has(other)) {
				return value;
			} else {
				const res = new Set(value);
				res.add(other);
				return res;
			}
		default:
			return { [key]: other };
	}
}

// Function: swapped
// Returns a copy of `value` with entries at `keya` and `keyb` swapped.
function swapped(value, keya, keyb) {
	if (keya === keyb) {
		return value;
	}
	switch (value?.constructor) {
		case Array: {
			const res = value.slice();
			const va = res[keya];
			res[keya] = res[keyb];
			res[keyb] = va;
			return res;
		}
		case Object: {
			const hasA = Object.hasOwn(value, keya);
			const hasB = Object.hasOwn(value, keyb);
			if (!hasA && !hasB) {
				return value;
			}
			const res = { ...value };
			const va = value[keya];
			const vb = value[keyb];
			if (hasB) {
				res[keya] = vb;
			} else {
				delete res[keya];
			}
			if (hasA) {
				res[keyb] = va;
			} else {
				delete res[keyb];
			}
			return res;
		}
		case Map: {
			const hasA = value.has(keya);
			const hasB = value.has(keyb);
			if (!hasA && !hasB) {
				return value;
			}
			const res = new Map(value);
			const va = value.get(keya);
			const vb = value.get(keyb);
			if (hasB) {
				res.set(keya, vb);
			} else {
				res.delete(keya);
			}
			if (hasA) {
				res.set(keyb, va);
			} else {
				res.delete(keyb);
			}
			return res;
		}
		default:
			return value;
	}
}

const swap = swapped;

// Function: sorted
// Returns sorted copy of `values`, optionally by projection and ordering.
function sorted(values, extractorFunc, ordering = 1, comparator = cmp) {
	const source =
		values instanceof Map
			? Array.from(values.entries())
			: isObject(values)
				? Object.entries(values)
				: list(values);
	const res = source.slice();
	if (extractorFunc === undefined || extractorFunc === null) {
		res.sort((a, b) => ordering * comparator(a, b));
	} else if (comparator === cmp) {
		res.sort(
			(a, b) =>
				ordering *
				comparator(
					Array.isArray(a) && a.length === 2 ? a[1] : a,
					Array.isArray(b) && b.length === 2 ? b[1] : b,
					extractorFunc,
				),
		);
	} else {
		const ext = extractor(extractorFunc);
		res.sort(
			(a, b) =>
				ordering *
				comparator(
					ext(Array.isArray(a) && a.length === 2 ? a[1] : a),
					ext(Array.isArray(b) && b.length === 2 ? b[1] : b),
				),
		);
	}
	if (values instanceof Map) {
		return new Map(res);
	}
	if (isObject(values)) {
		const mapped = {};
		for (let i = 0; i < res.length; i++) {
			mapped[res[i][0]] = res[i][1];
		}
		return mapped;
	}
	if (values instanceof Set) {
		return new Set(res);
	}
	return res;
}

// Function: unique
// Returns unique values from `values`, optionally by projection, while preserving shape.
function unique(values, extractorFunc) {
	const ext =
		extractorFunc === undefined || extractorFunc === null
			? undefined
			: extractor(extractorFunc);
	const seen = new Set();
	const res =
		Array.isArray(values) ||
		values instanceof Map ||
		values instanceof Set ||
		isObject(values)
			? empty(values)
			: [];
	iter(values, (v, k) => {
		const kk = ext ? ext(v, k, values) : v;
		if (seen.has(kk)) {
			return;
		}
		seen.add(kk);
		append(res, v, k);
	});
	return res;
}

// Function: filter
// Filters `values` using resolved predicate semantics while preserving shape.
function filter(values, predicateOrExtractor) {
	if (values === null || values === undefined) {
		return values;
	}
	const pred = predicate(predicateOrExtractor);
	if (
		values === null ||
		values === undefined ||
		typeof values === "string" ||
		(!Array.isArray(values) &&
			!(values instanceof Map) &&
			!(values instanceof Set) &&
			!isObject(values) &&
			!isIterable(values))
	) {
		return pred(values, undefined, values) ? values : undefined;
	}
	const res =
		Array.isArray(values) ||
		values instanceof Map ||
		values instanceof Set ||
		isObject(values)
			? empty(values)
			: [];
	iter(values, (v, k) => (pred(v, k, values) ? append(res, v, k) : undefined));
	return res;
}

// Function: mapfilter
// Maps `values`, pruning entries where `processor` returns `undefined`.
function mapfilter(values, processor) {
	if (
		values === null ||
		values === undefined ||
		typeof values === "string" ||
		(!Array.isArray(values) &&
			!(values instanceof Map) &&
			!(values instanceof Set) &&
			!isObject(values) &&
			!isIterable(values))
	) {
		return processor(values, undefined, values);
	}
	const res =
		Array.isArray(values) ||
		values instanceof Map ||
		values instanceof Set ||
		isObject(values)
			? empty(values)
			: [];
	iter(values, (v, k) => {
		const mapped = processor(v, k, values);
		return mapped === undefined ? undefined : append(res, mapped, k);
	});
	return res;
}

// Function: flatmap
// Maps `values` with `func` and flattens mapped results one level deep.
function flatmap(values, func) {
	const res = [];
	iter(values, (v, k) => {
		for (const item of ivalues(func(v, k, values))) {
			append(res, item);
		}
	});
	return res;
}

// TODO: Deprecated/remove prune
// Function: prune
// Returns values that do not match the predicate while preserving shape.
function prune(values, predicateOrExtractor) {
	const pred =
		predicateOrExtractor === undefined || predicateOrExtractor === null
			? (v) => bool(v)
			: predicate(predicateOrExtractor);
	if (
		values === null ||
		values === undefined ||
		typeof values === "string" ||
		(!Array.isArray(values) &&
			!(values instanceof Map) &&
			!(values instanceof Set) &&
			!isObject(values) &&
			!isIterable(values))
	) {
		return pred(values, undefined, values) ? undefined : values;
	}
	const res =
		Array.isArray(values) ||
		values instanceof Map ||
		values instanceof Set ||
		isObject(values)
			? empty(values)
			: [];
	iter(values, (v, k) => (!pred(v, k, values) ? append(res, v, k) : undefined));
	return res;
}

// TODO: Deprecated/remove prune
// Function: pruned
// Returns a shallow copy of `value` without the given keys.
function pruned(value, ...removeKeys) {
	if (value == null) {
		return value;
	}
	switch (value?.constructor) {
		case Object: {
			const res = { ...value };
			for (let i = 0; i < removeKeys.length; i++) {
				delete res[removeKeys[i]];
			}
			return res;
		}
		case Map: {
			const res = new Map(value);
			for (let i = 0; i < removeKeys.length; i++) {
				res.delete(removeKeys[i]);
			}
			return res;
		}
		default:
			throw new Error(
				`pruned expects a plain Object or Map, got ${value?.constructor?.name ?? typeof value}`,
			);
	}
}

// Function: slice
// Returns a positional slice while preserving supported container shapes.
function slice(values, start = undefined, end = undefined) {
	if (Array.isArray(values)) {
		return values.slice(start, end);
	}
	if (values instanceof Map) {
		const entries = Array.from(values.entries()).slice(start, end);
		return new Map(entries);
	}
	if (values instanceof Set) {
		const entries = Array.from(values.values()).slice(start, end);
		return new Set(entries);
	}
	if (isObject(values)) {
		const valueKeys = Object.keys(values).slice(start, end);
		const res = {};
		for (let i = 0; i < valueKeys.length; i++) {
			const key = valueKeys[i];
			res[key] = values[key];
		}
		return res;
	}
	return list(values).slice(start, end);
}

// Function: reverse
// Returns `values` in reverse order while preserving supported container shapes.
function reverse(values) {
	if (Array.isArray(values)) {
		const n = values.length;
		return array(n, (i) => values[n - i - 1]);
	}
	if (values instanceof Map) {
		return new Map(Array.from(values.entries()).reverse());
	}
	if (values instanceof Set) {
		return new Set(Array.from(values.values()).reverse());
	}
	if (isObject(values)) {
		const valueKeys = Object.keys(values);
		const res = {};
		for (let i = valueKeys.length - 1; i >= 0; i--) {
			const key = valueKeys[i];
			res[key] = values[key];
		}
		return res;
	}
	return values;
}

// Function: concat
// Returns `a` with values from `b` appended, preserving `a` shape when possible.
function concat(a, b) {
	if (Array.isArray(a)) {
		const res = a.slice();
		for (const v of ivalues(b)) {
			append(res, v);
		}
		return res;
	}
	if (a instanceof Set) {
		const res = new Set(a);
		for (const v of ivalues(b)) {
			append(res, v);
		}
		return res;
	}
	if (a instanceof Map) {
		const res = new Map(a);
		if (b instanceof Map || isObject(b)) {
			for (const [k, v] of iitems(b)) {
				append(res, v, k);
			}
		} else {
			for (const v of ivalues(b)) {
				append(res, v);
			}
		}
		return res;
	}
	if (isObject(a)) {
		const res = { ...a };
		if (b instanceof Map || isObject(b)) {
			for (const [k, v] of iitems(b)) {
				append(res, v, k);
			}
		} else {
			for (const v of ivalues(b)) {
				append(res, v);
			}
		}
		return res;
	}
	return list(a).concat(list(b));
}

// Function: resize
// Returns `values` grown or truncated to `size`.
function resize(values, size, creator = (i) => i) {
	const n = len(values);
	if (n < size) {
		let res = copy(values);
		for (let i = n; i < size; i++) {
			res = appended(res, creator(i));
		}
		return res;
	}
	if (n > size) {
		return slice(values, 0, size);
	}
	return values;
}

// Function: flatten
// Flattens nested collection values up to `depth`.
function flatten(value, depth = -1) {
	if (
		depth === 0 ||
		(!Array.isArray(value) &&
			!isObject(value) &&
			!(value instanceof Map) &&
			!(value instanceof Set))
	) {
		return list(value);
	}
	return reduce(
		value,
		(res, item) => concat(res, flatten(item, depth - 1)),
		[],
	);
}

// Function: grow
// Returns `values` resized to at least `size`.
function grow(values, size, creator = (i) => i) {
	return size === undefined || size === null
		? values
		: resize(values, Math.max(size, len(values)), creator);
}

// Function: grouped
// Groups `values` using `extractorFunc`, optionally projecting each grouped entry.
function grouped(values, extract, processor = undefined) {
	const ext = extractor(extract);
	return reduce(
		values,
		(res, value, key) => {
			const groupKey = ext(value, key, values);
			const bucket = res[groupKey] || (res[groupKey] = []);
			append(bucket, processor ? processor(value, key, values) : value);
			return res;
		},
		{},
	);
}

// Function: partition
// Partitions `values` into `[matched, unmatched]` while preserving shape.
function partition(values, predicateOrExtractor) {
	const pred = predicate(predicateOrExtractor);
	if (Array.isArray(values) || values == null) {
		return reduce(
			list(values),
			(res, value, key) => {
				append(res[pred(value, key) ? 0 : 1], value);
				return res;
			},
			[[], []],
		);
	}
	if (values instanceof Map) {
		return reduce(
			values,
			(res, value, key) => {
				append(res[pred(value, key) ? 0 : 1], value, key);
				return res;
			},
			[new Map(), new Map()],
		);
	}
	if (values instanceof Set) {
		return reduce(
			values,
			(res, value, key) => {
				append(res[pred(value, key) ? 0 : 1], value, key);
				return res;
			},
			[new Set(), new Set()],
		);
	}
	return reduce(
		values,
		(res, value, key) => {
			append(res[pred(value, key) ? 0 : 1], value, key);
			return res;
		},
		[{}, {}],
	);
}

// Function: difference
// Returns values from `a` that are not present in `b`, preserving shape.
function difference(a, b) {
	switch (a?.constructor) {
		case Object:
		case Map:
			return filter(a, (_, key) => !hasKey(b, key));
		default:
			return filter(a, (value) => !hasKey(b, value));
	}
}

// Function: removeAt
// Returns `values` without the entry at `index` or `key`.
function removeAt(values, itemIndex) {
	if (typeof itemIndex !== "number") {
		return removed(values, itemIndex);
	}
	switch (values?.constructor) {
		case Array: {
			if (itemIndex < 0 || itemIndex >= values.length) {
				return values;
			}
			const res = values.slice();
			res.splice(itemIndex, 1);
			return res;
		}
		case Object:
		case Map:
		case Set: {
			const res = empty(values);
			let i = 0;
			iter(values, (v, k) => {
				if (i !== itemIndex) {
					append(res, v, k);
				}
				i += 1;
			});
			return res;
		}
		default:
			return values;
	}
}

// Function: removed
// Returns `value` without `item`, preserving Array/Object/Map/Set shape.
function removed(value, item) {
	switch (value?.constructor) {
		case Array: {
			for (let i = 0; i < value.length; i++) {
				if (value[i] === item) {
					const res = value.slice();
					res.splice(i, 1);
					return res;
				}
			}
			return value;
		}
		case Object: {
			if (!Object.hasOwn(value, item)) {
				return value;
			}
			const res = { ...value };
			delete res[item];
			return res;
		}
		case Map: {
			if (!value.has(item)) {
				return value;
			}
			const res = new Map(value);
			res.delete(item);
			return res;
		}
		case Set: {
			if (!value.has(item)) {
				return value;
			}
			const res = new Set(value);
			res.delete(item);
			return res;
		}
		default:
			return value;
	}
}

// Function: stripe
// Returns values interleaved from even then odd positions while preserving shape.
function stripe(values) {
	const source =
		values instanceof Map
			? Array.from(values.entries())
			: isObject(values)
				? Object.entries(values)
				: list(values);
	const n = source.length;
	const midpoint = Math.floor(n / 2);
	const order = array(n, (i) =>
		i < midpoint
			? Math.min(n - 1, i * 2)
			: Math.min(n - 1, 1 + (i - midpoint) * 2),
	);
	if (values instanceof Map) {
		const res = new Map();
		for (let i = 0; i < order.length; i++) {
			const entry = source[order[i]];
			res.set(entry[0], entry[1]);
		}
		return res;
	}
	if (isObject(values)) {
		const res = {};
		for (let i = 0; i < order.length; i++) {
			const entry = source[order[i]];
			res[entry[0]] = entry[1];
		}
		return res;
	}
	if (values instanceof Set) {
		const res = new Set();
		for (let i = 0; i < order.length; i++) {
			res.add(source[order[i]]);
		}
		return res;
	}
	return order.map((i) => source[i]);
}

// Function: combinations
// Returns size-`k` combinations for `values`.
function combinations(values, k = 2) {
	const items = list(values);
	const n = items.length;
	const res = [];
	if (k > n) {
		return res;
	}
	const indices = array(k);
	res.push(indices.map((i) => items[i]));
	while (true) {
		let found;
		for (let i = k - 1; i >= 0; i--) {
			if (indices[i] !== i + n - k) {
				found = i;
				break;
			}
		}
		if (found === undefined) {
			return res;
		}
		indices[found] += 1;
		for (let i = found + 1; i < k; i++) {
			indices[i] = indices[i - 1] + 1;
		}
		res.push(indices.map((i) => items[i]));
	}
}

// Function: enumerate
// Returns a frozen identity dictionary for the given string values.
function enumerate(...items) {
	return Object.freeze(
		reduce(
			items,
			(res, value) => {
				res[value] = value;
				return res;
			},
			{},
		),
	);
}

// Function: prepended
// Returns `collection` with `item` inserted at the beginning.
function prepended(collection, item) {
	return inserted(collection, 0, item);
}

// Function: appended
// Returns `collection` with `item` inserted at the end.
function appended(collection, item) {
	return inserted(collection, len(collection), item);
}

// Function: inserted
// Returns `collection` with `item` inserted at `index`.
function inserted(collection, insertionIndex, item) {
	const size = len(collection);
	const indexValue =
		insertionIndex < 0
			? Math.max(0, size + insertionIndex)
			: Math.min(insertionIndex, size);
	if (Array.isArray(collection)) {
		const res = collection.slice();
		res.splice(indexValue, 0, item);
		return res;
	}
	if (collection instanceof Set) {
		const res = Array.from(collection.values());
		res.splice(indexValue, 0, item);
		return new Set(res);
	}
	if (collection instanceof Map) {
		let key = indexValue;
		if (key < 0) {
			key = 0;
		}
		while (collection.has(key)) {
			key += 1;
		}
		const res = new Map();
		let i = 0;
		let insertedItem = false;
		for (const [k, v] of collection.entries()) {
			if (!insertedItem && i === indexValue) {
				res.set(key, item);
				insertedItem = true;
			}
			res.set(k, v);
			i += 1;
		}
		if (!insertedItem) {
			res.set(key, item);
		}
		return res;
	}
	if (isObject(collection)) {
		let key = indexValue;
		if (key < 0) {
			key = 0;
		}
		while (Object.hasOwn(collection, key)) {
			key += 1;
		}
		const res = {};
		let i = 0;
		let insertedItem = false;
		for (const k in collection) {
			if (!Object.hasOwn(collection, k)) {
				continue;
			}
			if (!insertedItem && i === indexValue) {
				res[key] = item;
				insertedItem = true;
			}
			res[k] = collection[k];
			i += 1;
		}
		if (!insertedItem) {
			res[key] = item;
		}
		return res;
	}
	const res = list(collection);
	res.splice(indexValue, 0, item);
	return res;
}

// Function: clampsize
// Returns `collection` resized between `min` and `max`.
function clampsize(collection, min, max, creator = (i) => i) {
	const n = len(collection);
	if (n < min) {
		return resize(collection, min, creator);
	}
	if (n > max) {
		return resize(collection, max, creator);
	}
	return collection;
}

// Function: copy
// Recursively copies supported containers up to `limit` depth.
function copy(value, limit = -1, depth = 0, processor = undefined) {
	value = processor ? processor(value) : value;
	if (limit > 0 && depth >= limit) {
		return value;
	}
	switch (value?.constructor) {
		case Array:
		case Object:
		case Map:
		case Set:
			return map(value, (v) => copy(v, limit, depth + 1, processor));
		default:
			return value;
	}
}

// Function: merge
// Deeply merges matching container types; right-hand values replace scalars.
function merge(a, b) {
	const ta = a?.constructor;
	const tb = b?.constructor;
	if (ta === undefined) {
		return b;
	}
	if (tb === undefined) {
		return a;
	}
	if (ta !== tb) {
		return b;
	}
	switch (ta) {
		case Array:
			return [...a, ...b];
		case Object: {
			const res = { ...a };
			for (const k in b) {
				if (Object.hasOwn(b, k)) {
					res[k] = merge(a[k], b[k]);
				}
			}
			return res;
		}
		case Map: {
			const res = new Map(a);
			for (const [k, v] of b.entries()) {
				res.set(k, merge(a.get(k), v));
			}
			return res;
		}
		case Set:
			return new Set([...a, ...b]);
		default:
			return b;
	}
}

// Function: assigned
// Immutably assigns `value` at path `p` by cloning touched branches.
function assigned(scope, p, value, mergeValue = undefined, offset = 0) {
	const n = p?.length ?? 0;
	if (n === 0) {
		return mergeValue ? mergeValue(scope, value) : value;
	}
	const start = offset < 0 ? 0 : offset;
	if (start >= n) {
		return scope;
	}
	const root = clone(scope, p[start]);
	let currentClone = root;
	let currentOriginal =
		scope && (Array.isArray(scope) || isObject(scope)) ? scope : undefined;
	for (let i = start; i < n - 1; i++) {
		const key = p[i];
		const originalChild = currentOriginal ? currentOriginal[key] : undefined;
		const childClone = clone(originalChild, p[i + 1]);
		if (Array.isArray(currentClone) && typeof key === "number") {
			while (currentClone.length <= key) currentClone.push(undefined);
		}
		currentClone[key] = childClone;
		currentClone = childClone;
		currentOriginal = originalChild;
	}
	const leafKey = p[n - 1];
	if (Array.isArray(currentClone) && typeof leafKey === "number") {
		while (currentClone.length <= leafKey) currentClone.push(undefined);
	}
	currentClone[leafKey] = mergeValue
		? mergeValue(currentClone[leafKey], value)
		: value;
	return root;
}

export {
	append,
	appended,
	assigned,
	clampsize,
	combinations,
	concat,
	copy,
	difference,
	enumerate,
	filter,
	flatmap,
	flatten,
	grouped,
	grow,
	hasKey,
	inserted,
	iter,
	map,
	mapfilter,
	merge,
	partition,
	prepended,
	prune,
	pruned,
	reduce,
	removeAt,
	removed,
	resize,
	reverse,
	slice,
	sorted,
	stripe,
	swap,
	swapped,
	unique,
	updated,
};

// EOF
