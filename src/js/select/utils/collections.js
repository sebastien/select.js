// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-06-02

// Module: select/utils/collections
// List, selection, and ordering helpers.

import { cmp, extractor, predicate } from "./compare.js";
import { bool, isObject } from "./values.js";

// Function: len
// Returns collection length/size semantics for `v`.
function len(v) {
	if (v === undefined || v === null) {
		return 0;
	} else if (Array.isArray(v)) {
		return v.length;
	} else if (typeof v === "string") {
		return v.length;
	} else if (v instanceof Map || v instanceof Set) {
		return v.size;
	} else if (isObject(v)) {
		return Object.keys(v).length;
	}
	return 1;
}

// Function: array
// Returns an array of `count` entries created by `creator` or their index.
function array(count, creator = undefined) {
	const n = Math.max(0, count || 0);
	const res = new Array(n);
	for (let i = 0; i < n; i++) {
		res[i] = creator ? creator(i) : i;
	}
	return res;
}

// Function: list
// Normalizes `value` into an array-like list.
function list(value) {
	if (value == null) return [];
	if (typeof value === "string") return [value];
	switch (value?.constructor) {
		case Array:
			return value;
		case Object:
			return Object.values(value);
		case Map:
			return Array.from(value.values());
		case Set:
			return Array.from(value);
		default:
			if (typeof value?.[Symbol.iterator] === "function") {
				return Array.from(value);
			}
			return [value];
	}
}

function dict(value) {
	if (value == null) return {};
	switch (value?.constructor) {
		case Array: {
			const res = {};
			for (let i = 0; i < value.length; i++) {
				res[i] = value[i];
			}
			return res;
		}
		case Object:
			return value;
		case Map: {
			const res = {};
			for (const [k, v] of value.entries()) {
				res[k] = v;
			}
			return res;
		}
		case Set: {
			const res = {};
			let i = 0;
			for (const v of value.values()) {
				res[i++] = v;
			}
			return res;
		}
		default:
			if (typeof value?.[Symbol.iterator] === "function") {
				const res = {};
				let i = 0;
				for (const v of value) {
					res[i++] = v;
				}
				return res;
			} else {
				return { 0: value };
			}
	}
}

// Function: iter
// Iterates `value` and optionally finalizes the accumulator with `processor`.
function iter(
	value,
	iterator = (_v, _k, r) => r,
	processor = (r) => r,
	initial = undefined,
	empty = undefined,
) {
	if (value === undefined || value === null) {
		return processor(initial, value, undefined, value);
	}
	let result = initial;
	let current;
	let currentKey;
	let seen = 0;
	if (typeof value === "string") {
		for (let i = 0; i < value.length; i++) {
			current = value[i];
			currentKey = i;
			const next = iterator(current, i, result, value);
			if (next === false) {
				return processor(result, current, i, value);
			}
			result = next === undefined ? result : next;
			seen += 1;
		}
	} else if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			current = value[i];
			currentKey = i;
			const next = iterator(current, i, result, value);
			if (next === false) {
				return processor(result, current, i, value);
			}
			result = next === undefined ? result : next;
			seen += 1;
		}
	} else if (value instanceof Map) {
		for (const [k, v] of value.entries()) {
			current = v;
			currentKey = k;
			const next = iterator(v, k, result, value);
			if (next === false) {
				return processor(result, v, k, value);
			}
			result = next === undefined ? result : next;
			seen += 1;
		}
	} else if (value instanceof Set) {
		let i = 0;
		for (const v of value.values()) {
			current = v;
			currentKey = i;
			const next = iterator(v, i, result, value);
			if (next === false) {
				return processor(result, v, i, value);
			}
			result = next === undefined ? result : next;
			seen += 1;
			i += 1;
		}
	} else if (isObject(value)) {
		for (const k in value) {
			if (!Object.hasOwn(value, k)) {
				continue;
			}
			current = value[k];
			currentKey = k;
			const next = iterator(current, k, result, value);
			if (next === false) {
				return processor(result, current, k, value);
			}
			result = next === undefined ? result : next;
			seen += 1;
		}
	} else if (typeof value?.[Symbol.iterator] === "function") {
		let i = 0;
		for (const v of value) {
			current = v;
			currentKey = i;
			const next = iterator(v, i, result, value);
			if (next === false) {
				return processor(result, v, i, value);
			}
			result = next === undefined ? result : next;
			seen += 1;
			i += 1;
		}
	} else {
		return processor(
			iterator(value, undefined, initial, value),
			value,
			undefined,
			value,
		);
	}
	return seen === 0 ? empty : processor(result, current, currentKey, value);
}

// Function: get
// Returns the value at `key`; arrays may be used as nested paths.
function get(parent, key = undefined) {
	if (key === undefined) {
		return parent;
	}
	if (Array.isArray(key)) {
		let value = parent;
		for (let i = 0; i < key.length; i++) {
			value = get(value, key[i]);
			if (value === undefined) {
				return undefined;
			}
		}
		return value;
	}
	switch (parent?.constructor) {
		case Array:
		case Object:
			return parent[key];
		case Map:
			return parent.get(key);
		case Set:
			return parent.has(key) ? key : undefined;
		default:
			return undefined;
	}
}

// Function: has
// Returns true when `parent` has `key`; arrays may be used as nested paths.
function has(parent, key) {
	if (Array.isArray(key)) {
		let value = parent;
		for (let i = 0; i < key.length; i++) {
			if (!has(value, key[i])) {
				return false;
			}
			value = get(value, key[i]);
		}
		return true;
	}
	switch (parent?.constructor) {
		case Array:
			return typeof key === "number" && key >= 0 && key < parent.length;
		case Object:
			return Object.hasOwn(parent, key);
		case Map:
		case Set:
			return parent.has(key);
		default:
			return false;
	}
}

// Function: keys
// Returns collection keys, indexes, or set values as an array.
function keys(value) {
	if (value == null) {
		return [];
	}
	switch (value?.constructor) {
		case Array: {
			const res = new Array(value.length);
			for (let i = 0; i < value.length; i++) {
				res[i] = i;
			}
			return res;
		}
		case Object:
			return Object.keys(value);
		case Map:
			return Array.from(value.keys());
		case Set:
			return Array.from(value.values());
		default:
			return [];
	}
}

// Function: values
// Returns collection values as an array.
function values(value) {
	return list(value);
}

// Function: map
// Maps collection values while preserving array, object, map, and set shape.
function map(value, func = undefined) {
	func = typeof func !== "function" ? () => func : func;
	switch (value) {
		case null:
		case undefined:
		case true:
		case false:
			return func(value, undefined);
	}
	if (Array.isArray(value)) {
		const res = new Array(value.length);
		for (let i = 0; i < value.length; i++) {
			res[i] = func(value[i], i);
		}
		return res;
	}
	if (value instanceof Map) {
		const res = new Map();
		for (const [k, v] of value.entries()) {
			res.set(k, func(v, k));
		}
		return res;
	}
	if (value instanceof Set) {
		const res = new Set();
		let i = 0;
		for (const v of value.values()) {
			res.add(func(v, i));
			i += 1;
		}
		return res;
	}
	if (isObject(value)) {
		const res = {};
		for (const k in value) {
			if (Object.hasOwn(value, k)) {
				res[k] = func(value[k], k);
			}
		}
		return res;
	}
	return func(value, undefined);
}

// Function: each
// Applies `func` to every collection value and returns the original value.
function each(value, func) {
	switch (value?.constructor) {
		case Array:
			for (let i = 0; i < value.length; i++) {
				func(value[i], i);
			}
			return value;
		case Object:
			for (const k in value) {
				if (Object.hasOwn(value, k)) {
					func(value[k], k);
				}
			}
			return value;
		case Map:
			for (const [k, v] of value.entries()) {
				func(v, k);
			}
			return value;
		case Set: {
			let i = 0;
			for (const v of value.values()) {
				func(v, i);
				i += 1;
			}
			return value;
		}
		default:
			func(value, undefined);
			return value;
	}
}

// Function: reduce
// Reduces collection values with `(result, value, key)` semantics.
function reduce(value, func, initial) {
	let res = initial;
	switch (value?.constructor) {
		case Array:
			for (let i = 0; i < value.length; i++) {
				res = func(res, value[i], i);
			}
			return res;
		case Object:
			for (const k in value) {
				if (Object.hasOwn(value, k)) {
					res = func(res, value[k], k);
				}
			}
			return res;
		case Map:
			for (const [k, v] of value.entries()) {
				res = func(res, v, k);
			}
			return res;
		case Set: {
			let i = 0;
			for (const v of value.values()) {
				res = func(res, v, i);
				i += 1;
			}
			return res;
		}
		default:
			return func(res, value, undefined);
	}
}

function set(value, key, other) {
	switch (value?.constructor) {
		case Array:
			if (value[key] === other) {
				return value;
			} else {
				const res = [...value];
				if (typeof key === "number") {
					while (res.length <= key) {
						res.push(undefined);
					}
				}
				res[key] = other;
				return res;
			}
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

// Function: index
// Returns the first index or key whose value strictly equals `item`.
function index(values, item) {
	if (Array.isArray(values)) {
		return values.indexOf(item);
	}
	if (typeof values === "string") {
		return values.indexOf(item);
	}
	if (values instanceof Map) {
		for (const [k, v] of values.entries()) {
			if (v === item) {
				return k;
			}
		}
		return -1;
	}
	if (values instanceof Set) {
		let i = 0;
		for (const v of values.values()) {
			if (v === item) {
				return i;
			}
			i += 1;
		}
		return -1;
	}
	if (isObject(values)) {
		for (const k in values) {
			if (Object.hasOwn(values, k) && values[k] === item) {
				return k;
			}
		}
	}
	return list(values).indexOf(item);
}

// Function: sorted
// Returns sorted copy of `values`, optionally by projection and ordering.
function sorted(values, extractorFunc, ordering = 1, comparator = cmp) {
	const arr = list(values);
	if (extractorFunc === undefined || extractorFunc === null) {
		return arr.slice().sort((a, b) => ordering * comparator(a, b));
	}
	if (comparator === cmp) {
		return arr
			.slice()
			.sort((a, b) => ordering * comparator(a, b, extractorFunc));
	}
	const ext = extractor(extractorFunc);
	return arr.slice().sort((a, b) => ordering * comparator(ext(a), ext(b)));
}

// Function: unique
// Returns unique values from `values`, optionally by projection.
function unique(values, extractorFunc) {
	const arr = list(values);
	if (extractorFunc === undefined || extractorFunc === null) {
		return Array.from(new Set(arr));
	}
	const ext = extractor(extractorFunc);
	const seen = new Set();
	const res = [];
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i];
		const key = ext(v);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		res.push(v);
	}
	return res;
}

// Function: filter
// Filters `values` using resolved predicate semantics.
function filter(values, predicateOrExtractor) {
	const arr = list(values);
	const pred = predicate(predicateOrExtractor);
	const res = [];
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i];
		if (pred(v, i)) {
			res.push(v);
		}
	}
	return res;
}

// Function: prune
// Returns values that do not match the predicate.
function prune(values, predicateOrExtractor) {
	const arr = list(values);
	const pred =
		predicateOrExtractor === undefined || predicateOrExtractor === null
			? (v) => bool(v)
			: predicate(predicateOrExtractor);
	const res = [];
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i];
		if (!pred(v, i)) {
			res.push(v);
		}
	}
	return res;
}

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

// Function: count
// Counts all values or values matching a predicate.
function count(values, predicateOrExtractor = undefined) {
	const arr = list(values);
	if (predicateOrExtractor === undefined || predicateOrExtractor === null) {
		return arr.length;
	}
	const pred = predicate(predicateOrExtractor);
	let res = 0;
	for (let i = 0; i < arr.length; i++) {
		if (pred(arr[i], i)) {
			res += 1;
		}
	}
	return res;
}

// Function: found
// Returns the first value equal to `item`, optionally by projection.
function found(values, item, extractorFunc = undefined) {
	const arr = list(values);
	if (extractorFunc === undefined || extractorFunc === null) {
		for (let i = 0; i < arr.length; i++) {
			if (arr[i] === item) {
				return arr[i];
			}
		}
		return undefined;
	}
	const ext = extractor(extractorFunc);
	const searchKey = ext(item);
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i];
		if (ext(v) === searchKey) {
			return v;
		}
	}
	return undefined;
}

// Function: first
// Returns the first value, optionally matching a predicate.
function first(values, predicateOrExtractor = undefined) {
	const arr = list(values);
	if (predicateOrExtractor === undefined || predicateOrExtractor === null) {
		return arr[0];
	}
	const pred = predicate(predicateOrExtractor);
	for (let i = 0; i < arr.length; i++) {
		if (pred(arr[i], i)) {
			return arr[i];
		}
	}
	return undefined;
}

// Function: last
// Returns the last value, optionally matching a predicate.
function last(values, predicateOrExtractor = undefined) {
	const arr = list(values);
	if (predicateOrExtractor === undefined || predicateOrExtractor === null) {
		return arr[arr.length - 1];
	}
	const pred = predicate(predicateOrExtractor);
	for (let i = arr.length - 1; i >= 0; i--) {
		if (pred(arr[i], i)) {
			return arr[i];
		}
	}
	return undefined;
}

// Function: nth
// Returns the value at `index`, supporting negative indexes.
function nth(values, index) {
	const arr = list(values);
	const i = index < 0 ? arr.length + index : index;
	return arr[i];
}

// Function: slice
// Returns an array slice after collection normalization.
function slice(values, start = undefined, end = undefined) {
	if (Array.isArray(values)) {
		return values.slice(start, end);
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
// Returns `values` in reverse order while preserving array and object shape.
function reverse(values) {
	if (Array.isArray(values)) {
		const n = values.length;
		return array(n, (i) => values[n - i - 1]);
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
// Returns the concatenated list-normalized values of `a` and `b`.
function concat(a, b) {
	return list(a).concat(list(b));
}

// Function: resize
// Returns `values` grown or truncated to `size`.
function resize(values, size, creator = (i) => i) {
	const n = len(values);
	if (n < size) {
		const suffix = [];
		for (let i = n; i < size; i++) {
			suffix.push(creator(i));
		}
		return concat(values, suffix);
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
function grouped(values, extractorFunc, processor = undefined) {
	return reduce(
		values,
		(res, value, key) => {
			const group = extractorFunc(value, key, values);
			(res[group] = res[group] || []).push(
				processor ? processor(value, key, values) : value,
			);
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
				res[pred(value, key) ? 0 : 1].push(value);
				return res;
			},
			[[], []],
		);
	}
	if (values instanceof Map) {
		return reduce(
			values,
			(res, value, key) => {
				res[pred(value, key) ? 0 : 1].set(key, value);
				return res;
			},
			[new Map(), new Map()],
		);
	}
	if (values instanceof Set) {
		return reduce(
			values,
			(res, value, key) => {
				res[pred(value, key) ? 0 : 1].add(value);
				return res;
			},
			[new Set(), new Set()],
		);
	}
	return reduce(
		values,
		(res, value, key) => {
			res[pred(value, key) ? 0 : 1][key] = value;
			return res;
		},
		[{}, {}],
	);
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

// Function: stripe
// Returns values interleaved from even then odd positions.
function stripe(values) {
	const items = list(values);
	const n = items.length;
	const midpoint = Math.floor(n / 2);
	return array(
		n,
		(i) =>
			items[
				i < midpoint
					? Math.min(n - 1, i * 2)
					: Math.min(n - 1, 1 + (i - midpoint) * 2)
			],
	);
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

// Function: prepend
// Returns `collection` with `item` inserted at the beginning.
function prepend(collection, item) {
	if (Array.isArray(collection)) {
		const res = collection.slice();
		res.splice(0, 0, item);
		return res;
	}
	if (isObject(collection)) {
		const res = { 0: item };
		for (const key in collection) {
			if (Object.hasOwn(collection, key)) {
				res[key] = collection[key];
			}
		}
		return res;
	}
	return prepend(list(collection), item);
}

// Function: append
// Returns `collection` with `item` inserted at the end.
function append(collection, item, isMutable = false) {
	if (Array.isArray(collection)) {
		const res = isMutable ? collection : collection.slice();
		res.push(item);
		return res;
	}
	if (isObject(collection)) {
		const res = isMutable ? collection : { ...collection };
		let i = Object.keys(res).length;
		while (res[i] !== undefined) {
			i += 1;
		}
		res[i] = item;
		return res;
	}
	return append(list(collection), item, isMutable);
}

// Function: difference
// Returns list-normalized values present in `a` but not in `b`.
function difference(a, b) {
	return filter(a, (value) => index(b, value) === -1);
}

// Function: removeAt
// Returns `values` without the entry at `index`.
function removeAt(values, itemIndex) {
	return filter(values, (_, index) => index !== itemIndex);
}

// Function: isIn
// Returns true when `value` is present in `values`.
function isIn(values, value) {
	return index(values, value) !== -1;
}

// Function: pick
// Returns a random item from `values`.
function pick(items) {
	const valueList = values(items);
	return nth(valueList, Math.round(Math.random() * (len(valueList) - 1)));
}

// Function: head
// Returns the first item or first `count` items from `values`.
function head(value, count = undefined) {
	const valueList = values(value);
	return count === undefined || count === 0
		? valueList[0]
		: valueList.slice(0, count < 0 ? valueList.length + count : count);
}

// Function: insert
// Returns `collection` with `item` inserted at `index`.
function insert(collection, insertionIndex, item) {
	const res = Array.isArray(collection) ? copy(collection) : list(collection);
	const index =
		insertionIndex < 0 ? res.length + insertionIndex : insertionIndex;
	res.splice(index, 0, item);
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

export {
	append,
	array,
	clampsize,
	combinations,
	concat,
	copy,
	count,
	difference,
	dict,
	each,
	enumerate,
	filter,
	flatten,
	first,
	found,
	get,
	grouped,
	grow,
	head,
	has,
	index,
	insert,
	isIn,
	iter,
	keys,
	last,
	len,
	list,
	map,
	merge,
	nth,
	partition,
	pick,
	prepend,
	prune,
	pruned,
	reduce,
	removeAt,
	insert,
	resize,
	reverse,
	set,
	slice,
	sorted,
	stripe,
	unique,
	values,
};

// EOF
