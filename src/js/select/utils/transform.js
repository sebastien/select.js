// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/transform
// Pure collection transforms and immutable structural update helpers.

import { cmp } from "./compare.js"
import { extractor, predicate } from "./func.js"
import { index } from "./traverse.js"
import { bool, clone, isObject, array, len, list, values as vals } from "./values.js"

// Function: map
// Maps collection values while preserving array, object, map, and set shape.
function map(value, func = undefined) {
	func = typeof func !== "function" ? () => func : func
	switch (value) {
		case null:
		case undefined:
		case true:
		case false:
			return func(value, undefined)
	}
	if (Array.isArray(value)) {
		const res = new Array(value.length)
		for (let i = 0; i < value.length; i++) {
			res[i] = func(value[i], i)
		}
		return res
	}
	if (value instanceof Map) {
		const res = new Map()
		for (const [k, v] of value.entries()) {
			res.set(k, func(v, k))
		}
		return res
	}
	if (value instanceof Set) {
		const res = new Set()
		let i = 0
		for (const v of value.values()) {
			res.add(func(v, i))
			i += 1
		}
		return res
	}
	if (isObject(value)) {
		const res = {}
		for (const k in value) {
			if (Object.hasOwn(value, k)) {
				res[k] = func(value[k], k)
			}
		}
		return res
	}
	return func(value, undefined)
}

// Function: each
// Applies `func` to every collection value and returns the original value.
function each(value, func) {
	switch (value?.constructor) {
		case Array:
			for (let i = 0; i < value.length; i++) {
				func(value[i], i)
			}
			return value
		case Object:
			for (const k in value) {
				if (Object.hasOwn(value, k)) {
					func(value[k], k)
				}
			}
			return value
		case Map:
			for (const [k, v] of value.entries()) {
				func(v, k)
			}
			return value
		case Set: {
			let i = 0
			for (const v of value.values()) {
				func(v, i)
				i += 1
			}
			return value
		}
		default:
			func(value, undefined)
			return value
	}
}

// Function: reduce
// Reduces collection values with `(result, value, key)` semantics.
function reduce(value, func, initial) {
	let res = initial
	switch (value?.constructor) {
		case Array:
			for (let i = 0; i < value.length; i++) {
				res = func(res, value[i], i)
			}
			return res
		case Object:
			for (const k in value) {
				if (Object.hasOwn(value, k)) {
					res = func(res, value[k], k)
				}
			}
			return res
		case Map:
			for (const [k, v] of value.entries()) {
				res = func(res, v, k)
			}
			return res
		case Set: {
			let i = 0
			for (const v of value.values()) {
				res = func(res, v, i)
				i += 1
			}
			return res
		}
		default:
			return func(res, value, undefined)
	}
}

// Function: updated
// Returns a copy of `value` with `other` assigned at `key`.
function updated(value, key, other) {
	switch (value?.constructor) {
		case Array:
			if (value[key] === other) {
				return value
			}
			return assigned(value, [key], other)
		case Object:
			return value[key] === other ? value : { ...value, [key]: other }
		case Map:
			if (value.get(key) === other) {
				return value
			} else {
				const res = new Map(value)
				res.set(key, other)
				return res
			}
		case Set:
			if (value.has(other)) {
				return value
			} else {
				const res = new Set(value)
				res.add(other)
				return res
			}
		default:
			return { [key]: other }
	}
}

// Function: sorted
// Returns sorted copy of `values`, optionally by projection and ordering.
function sorted(values, extractorFunc, ordering = 1, comparator = cmp) {
	const arr = list(values)
	if (extractorFunc === undefined || extractorFunc === null) {
		return arr.slice().sort((a, b) => ordering * comparator(a, b))
	}
	if (comparator === cmp) {
		return arr
			.slice()
			.sort((a, b) => ordering * comparator(a, b, extractorFunc))
	}
	const ext = extractor(extractorFunc)
	return arr.slice().sort((a, b) => ordering * comparator(ext(a), ext(b)))
}

// Function: unique
// Returns unique values from `values`, optionally by projection.
function unique(values, extractorFunc) {
	const arr = list(values)
	if (extractorFunc === undefined || extractorFunc === null) {
		return Array.from(new Set(arr))
	}
	const ext = extractor(extractorFunc)
	const seen = new Set()
	const res = []
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i]
		const key = ext(v)
		if (seen.has(key)) {
			continue
		}
		seen.add(key)
		res.push(v)
	}
	return res
}

// Function: filter
// Filters `values` using resolved predicate semantics.
function filter(values, predicateOrExtractor) {
	const arr = list(values)
	const pred = predicate(predicateOrExtractor)
	const res = []
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i]
		if (pred(v, i)) {
			res.push(v)
		}
	}
	return res
}

// Function: prune
// Returns values that do not match the predicate.
function prune(values, predicateOrExtractor) {
	const arr = list(values)
	const pred =
		predicateOrExtractor === undefined || predicateOrExtractor === null
			? (v) => bool(v)
			: predicate(predicateOrExtractor)
	const res = []
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i]
		if (!pred(v, i)) {
			res.push(v)
		}
	}
	return res
}

// Function: pruned
// Returns a shallow copy of `value` without the given keys.
function pruned(value, ...removeKeys) {
	if (value == null) {
		return value
	}
	switch (value?.constructor) {
		case Object: {
			const res = { ...value }
			for (let i = 0; i < removeKeys.length; i++) {
				delete res[removeKeys[i]]
			}
			return res
		}
		case Map: {
			const res = new Map(value)
			for (let i = 0; i < removeKeys.length; i++) {
				res.delete(removeKeys[i])
			}
			return res
		}
		default:
			throw new Error(
				`pruned expects a plain Object or Map, got ${value?.constructor?.name ?? typeof value}`,
			)
	}
}

// Function: count
// Counts all values or values matching a predicate.
function count(values, predicateOrExtractor = undefined) {
	const arr = list(values)
	if (predicateOrExtractor === undefined || predicateOrExtractor === null) {
		return arr.length
	}
	const pred = predicate(predicateOrExtractor)
	let res = 0
	for (let i = 0; i < arr.length; i++) {
		if (pred(arr[i], i)) {
			res += 1
		}
	}
	return res
}

// Function: found
// Returns the first value equal to `item`, optionally by projection.
function found(values, item, extractorFunc = undefined) {
	const arr = list(values)
	if (extractorFunc === undefined || extractorFunc === null) {
		for (let i = 0; i < arr.length; i++) {
			if (arr[i] === item) {
				return arr[i]
			}
		}
		return undefined
	}
	const ext = extractor(extractorFunc)
	const searchKey = ext(item)
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i]
		if (ext(v) === searchKey) {
			return v
		}
	}
	return undefined
}

// Function: first
// Returns the first value, optionally matching a predicate.
function first(values, predicateOrExtractor = undefined) {
	const arr = list(values)
	if (predicateOrExtractor === undefined || predicateOrExtractor === null) {
		return arr[0]
	}
	const pred = predicate(predicateOrExtractor)
	for (let i = 0; i < arr.length; i++) {
		if (pred(arr[i], i)) {
			return arr[i]
		}
	}
	return undefined
}

// Function: last
// Returns the last value, optionally matching a predicate.
function last(values, predicateOrExtractor = undefined) {
	const arr = list(values)
	if (predicateOrExtractor === undefined || predicateOrExtractor === null) {
		return arr[arr.length - 1]
	}
	const pred = predicate(predicateOrExtractor)
	for (let i = arr.length - 1; i >= 0; i--) {
		if (pred(arr[i], i)) {
			return arr[i]
		}
	}
	return undefined
}

// Function: nth
// Returns the value at `index`, supporting negative indexes.
function nth(values, indexValue) {
	const arr = list(values)
	const i = indexValue < 0 ? arr.length + indexValue : indexValue
	return arr[i]
}

// Function: slice
// Returns an array slice after collection normalization.
function slice(values, start = undefined, end = undefined) {
	if (Array.isArray(values)) {
		return values.slice(start, end)
	}
	if (isObject(values)) {
		const valueKeys = Object.keys(values).slice(start, end)
		const res = {}
		for (let i = 0; i < valueKeys.length; i++) {
			const key = valueKeys[i]
			res[key] = values[key]
		}
		return res
	}
	return list(values).slice(start, end)
}

// Function: reverse
// Returns `values` in reverse order while preserving array and object shape.
function reverse(values) {
	if (Array.isArray(values)) {
		const n = values.length
		return array(n, (i) => values[n - i - 1])
	}
	if (isObject(values)) {
		const valueKeys = Object.keys(values)
		const res = {}
		for (let i = valueKeys.length - 1; i >= 0; i--) {
			const key = valueKeys[i]
			res[key] = values[key]
		}
		return res
	}
	return values
}

// Function: concat
// Returns the concatenated list-normalized values of `a` and `b`.
function concat(a, b) {
	return list(a).concat(list(b))
}

// Function: resize
// Returns `values` grown or truncated to `size`.
function resize(values, size, creator = (i) => i) {
	const n = len(values)
	if (n < size) {
		const suffix = []
		for (let i = n; i < size; i++) {
			suffix.push(creator(i))
		}
		return concat(values, suffix)
	}
	if (n > size) {
		return slice(values, 0, size)
	}
	return values
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
		return list(value)
	}
	return reduce(
		value,
		(res, item) => concat(res, flatten(item, depth - 1)),
		[],
	)
}

// Function: grow
// Returns `values` resized to at least `size`.
function grow(values, size, creator = (i) => i) {
	return size === undefined || size === null
		? values
		: resize(values, Math.max(size, len(values)), creator)
}

// Function: grouped
// Groups `values` using `extractorFunc`, optionally projecting each grouped entry.
function grouped(values, extractorFunc, processor = undefined) {
	return reduce(
		values,
		(res, value, key) => {
			const groupKey = extractorFunc(value, key, values)
			const bucket = res[groupKey] || (res[groupKey] = [])
			bucket.push(processor ? processor(value, key, values) : value)
			return res
		},
		{},
	)
}

// Function: partition
// Partitions `values` into `[matched, unmatched]` while preserving shape.
function partition(values, predicateOrExtractor) {
	const pred = predicate(predicateOrExtractor)
	if (Array.isArray(values) || values == null) {
		return reduce(
			list(values),
			(res, value, key) => {
				res[pred(value, key) ? 0 : 1].push(value)
				return res
			},
			[[], []],
		)
	}
	if (values instanceof Map) {
		return reduce(
			values,
			(res, value, key) => {
				res[pred(value, key) ? 0 : 1].set(key, value)
				return res
			},
			[new Map(), new Map()],
		)
	}
	if (values instanceof Set) {
		return reduce(
			values,
			(res, value, key) => {
				res[pred(value, key) ? 0 : 1].add(value)
				return res
			},
			[new Set(), new Set()],
		)
	}
	return reduce(
		values,
		(res, value, key) => {
			res[pred(value, key) ? 0 : 1][key] = value
			return res
		},
		[{}, {}],
	)
}

// Function: difference
// Returns list-normalized values present in `a` but not in `b`.
function difference(a, b) {
	return filter(a, (value) => index(b, value) === -1)
}

// Function: removeAt
// Returns `values` without the entry at `index`.
function removeAt(values, itemIndex) {
	return filter(values, (_, indexValue) => indexValue !== itemIndex)
}

// Function: removed
// Returns `value` without `item`, preserving Array/Object/Map/Set shape.
function removed(value, item) {
	switch (value?.constructor) {
		case Array: {
			for (let i = 0; i < value.length; i++) {
				if (value[i] === item) {
					const res = value.slice()
					res.splice(i, 1)
					return res
				}
			}
			return value
		}
		case Object: {
			if (!Object.hasOwn(value, item)) {
				return value
			}
			const res = { ...value }
			delete res[item]
			return res
		}
		case Map: {
			if (!value.has(item)) {
				return value
			}
			const res = new Map(value)
			res.delete(item)
			return res
		}
		case Set: {
			if (!value.has(item)) {
				return value
			}
			const res = new Set(value)
			res.delete(item)
			return res
		}
		default:
			return value
	}
}

// Function: isIn
// Returns true when `value` is present in `values`.
function isIn(values, value) {
	return index(values, value) !== -1
}

// Function: pick
// Returns a random item from `values`.
function pick(items) {
	const valueList = vals(items)
	return nth(valueList, Math.round(Math.random() * (len(valueList) - 1)))
}

// Function: head
// Returns the first item or first `count` items from `values`.
function head(value, count = undefined) {
	const valueList = vals(value)
	return count === undefined || count === 0
		? valueList[0]
		: valueList.slice(0, count < 0 ? valueList.length + count : count)
}

// Function: stripe
// Returns values interleaved from even then odd positions.
function stripe(values) {
	const items = list(values)
	const n = items.length
	const midpoint = Math.floor(n / 2)
	return array(
		n,
		(i) =>
			items[
				i < midpoint
					? Math.min(n - 1, i * 2)
					: Math.min(n - 1, 1 + (i - midpoint) * 2)
			],
	)
}

// Function: combinations
// Returns size-`k` combinations for `values`.
function combinations(values, k = 2) {
	const items = list(values)
	const n = items.length
	const res = []
	if (k > n) {
		return res
	}
	const indices = array(k)
	res.push(indices.map((i) => items[i]))
	while (true) {
		let found
		for (let i = k - 1; i >= 0; i--) {
			if (indices[i] !== i + n - k) {
				found = i
				break
			}
		}
		if (found === undefined) {
			return res
		}
		indices[found] += 1
		for (let i = found + 1; i < k; i++) {
			indices[i] = indices[i - 1] + 1
		}
		res.push(indices.map((i) => items[i]))
	}
}

// Function: enumerate
// Returns a frozen identity dictionary for the given string values.
function enumerate(...items) {
	return Object.freeze(
		reduce(
			items,
			(res, value) => {
				res[value] = value
				return res
			},
			{},
		),
	)
}

// Function: prepended
// Returns `collection` with `item` inserted at the beginning.
function prepended(collection, item) {
	if (Array.isArray(collection)) {
		const res = collection.slice()
		res.splice(0, 0, item)
		return res
	}
	if (isObject(collection)) {
		const res = { 0: item }
		for (const key in collection) {
			if (Object.hasOwn(collection, key)) {
				res[key] = collection[key]
			}
		}
		return res
	}
	return prepended(list(collection), item)
}

// Function: appended
// Returns `collection` with `item` inserted at the end.
function appended(collection, item) {
	if (Array.isArray(collection)) {
		const res = collection.slice()
		res.push(item)
		return res
	}
	if (isObject(collection)) {
		const res = { ...collection }
		let i = Object.keys(res).length
		while (res[i] !== undefined) {
			i += 1
		}
		res[i] = item
		return res
	}
	return appended(list(collection), item)
}

// Function: inserted
// Returns `collection` with `item` inserted at `index`.
function inserted(collection, insertionIndex, item) {
	const res = Array.isArray(collection) ? copy(collection) : list(collection)
	const indexValue =
		insertionIndex < 0 ? res.length + insertionIndex : insertionIndex
	res.splice(indexValue, 0, item)
	return res
}

// Function: clampsize
// Returns `collection` resized between `min` and `max`.
function clampsize(collection, min, max, creator = (i) => i) {
	const n = len(collection)
	if (n < min) {
		return resize(collection, min, creator)
	}
	if (n > max) {
		return resize(collection, max, creator)
	}
	return collection
}

// Function: copy
// Recursively copies supported containers up to `limit` depth.
function copy(value, limit = -1, depth = 0, processor = undefined) {
	value = processor ? processor(value) : value
	if (limit > 0 && depth >= limit) {
		return value
	}
	switch (value?.constructor) {
		case Array:
		case Object:
		case Map:
		case Set:
			return map(value, (v) => copy(v, limit, depth + 1, processor))
		default:
			return value
	}
}

// Function: merge
// Deeply merges matching container types; right-hand values replace scalars.
function merge(a, b) {
	const ta = a?.constructor
	const tb = b?.constructor
	if (ta === undefined) {
		return b
	}
	if (tb === undefined) {
		return a
	}
	if (ta !== tb) {
		return b
	}
	switch (ta) {
		case Array:
			return [...a, ...b]
		case Object: {
			const res = { ...a }
			for (const k in b) {
				if (Object.hasOwn(b, k)) {
					res[k] = merge(a[k], b[k])
				}
			}
			return res
		}
		case Map: {
			const res = new Map(a)
			for (const [k, v] of b.entries()) {
				res.set(k, merge(a.get(k), v))
			}
			return res
		}
		case Set:
			return new Set([...a, ...b])
		default:
			return b
	}
}

// Function: assigned
// Immutably assigns `value` at path `p` by cloning touched branches.
function assigned(scope, p, value, mergeValue = undefined, offset = 0) {
	const n = p?.length ?? 0
	if (n === 0) {
		return mergeValue ? mergeValue(scope, value) : value
	}
	const start = offset < 0 ? 0 : offset
	if (start >= n) {
		return scope
	}
	const root = clone(scope, p[start])
	let currentClone = root
	let currentOriginal =
		scope && (Array.isArray(scope) || isObject(scope)) ? scope : undefined
	for (let i = start; i < n - 1; i++) {
		const key = p[i]
		const originalChild = currentOriginal ? currentOriginal[key] : undefined
		const childClone = clone(originalChild, p[i + 1])
		if (Array.isArray(currentClone) && typeof key === "number") {
			while (currentClone.length <= key) currentClone.push(undefined)
		}
		currentClone[key] = childClone
		currentClone = childClone
		currentOriginal = originalChild
	}
	const leafKey = p[n - 1]
	if (Array.isArray(currentClone) && typeof leafKey === "number") {
		while (currentClone.length <= leafKey) currentClone.push(undefined)
	}
	currentClone[leafKey] = mergeValue
		? mergeValue(currentClone[leafKey], value)
		: value
	return root
}

export {
	appended,
	assigned,
	clampsize,
	combinations,
	concat,
	copy,
	count,
	difference,
	each,
	enumerate,
	filter,
	flatten,
	first,
	found,
	grouped,
	grow,
	head,
	inserted,
	isIn,
	last,
	map,
	merge,
	nth,
	partition,
	pick,
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
	unique,
	updated,
}

// EOF
