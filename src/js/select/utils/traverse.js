// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02

// Module: select/utils/traverse
// Read-only traversal, lookup, path access, and recursive remapping helpers.

import { isObject, list } from "./values.js"

// ----------------------------------------------------------------------------
//
// PATH ACCESS
//
// ----------------------------------------------------------------------------

// Function: access
// Traverses `context` using path `p` starting at `offset`.
function access(context, p, offset = 0) {
	p = typeof p === "string" ? p.split(".") : p
	if (p?.length && context !== undefined) {
		for (
			let i = offset;
			i < p.length && context !== undefined && context !== null;
			i++
		) {
			context = context[p[i]]
		}
	}
	return context
}

// Function: path
// Normalizes `p` to a path array, returning `null` when unset.
function path(p, nothing = undefined) {
	if (p === nothing) {
		return null
	}
	if (Array.isArray(p)) {
		return p
	}
	if (p !== undefined && p !== null) {
		return [p]
	}
	return null
}

// ----------------------------------------------------------------------------
//
// COLLECTION ACCESS
//
// ----------------------------------------------------------------------------

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
		return processor(initial, value, undefined, value)
	}
	let result = initial
	let current
	let currentKey
	let seen = 0
	if (typeof value === "string") {
		for (let i = 0; i < value.length; i++) {
			current = value[i]
			currentKey = i
			const next = iterator(current, i, result, value)
			if (next === false) {
				return processor(result, current, i, value)
			}
			result = next === undefined ? result : next
			seen += 1
		}
	} else if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			current = value[i]
			currentKey = i
			const next = iterator(current, i, result, value)
			if (next === false) {
				return processor(result, current, i, value)
			}
			result = next === undefined ? result : next
			seen += 1
		}
	} else if (value instanceof Map) {
		for (const [k, v] of value.entries()) {
			current = v
			currentKey = k
			const next = iterator(v, k, result, value)
			if (next === false) {
				return processor(result, v, k, value)
			}
			result = next === undefined ? result : next
			seen += 1
		}
	} else if (value instanceof Set) {
		let i = 0
		for (const v of value.values()) {
			current = v
			currentKey = i
			const next = iterator(v, i, result, value)
			if (next === false) {
				return processor(result, v, i, value)
			}
			result = next === undefined ? result : next
			seen += 1
			i += 1
		}
	} else if (isObject(value)) {
		for (const k in value) {
			if (!Object.hasOwn(value, k)) {
				continue
			}
			current = value[k]
			currentKey = k
			const next = iterator(current, k, result, value)
			if (next === false) {
				return processor(result, current, k, value)
			}
			result = next === undefined ? result : next
			seen += 1
		}
	} else if (typeof value?.[Symbol.iterator] === "function") {
		let i = 0
		for (const v of value) {
			current = v
			currentKey = i
			const next = iterator(v, i, result, value)
			if (next === false) {
				return processor(result, v, i, value)
			}
			result = next === undefined ? result : next
			seen += 1
			i += 1
		}
	} else {
		return processor(
			iterator(value, undefined, initial, value),
			value,
			undefined,
			value,
		)
	}
	return seen === 0 ? empty : processor(result, current, currentKey, value)
}

// Function: get
// Returns the value at `key`; arrays may be used as nested paths.
function get(parent, key = undefined) {
	if (key === undefined) {
		return parent
	}
	if (Array.isArray(key)) {
		let value = parent
		for (let i = 0; i < key.length; i++) {
			value = get(value, key[i])
			if (value === undefined) {
				return undefined
			}
		}
		return value
	}
	switch (parent?.constructor) {
		case Array:
		case Object:
			return parent[key]
		case Map:
			return parent.get(key)
		case Set:
			return parent.has(key) ? key : undefined
		default:
			return undefined
	}
}

// Function: has
// Returns true when `parent` has `key`; arrays may be used as nested paths.
function has(parent, key) {
	if (Array.isArray(key)) {
		let value = parent
		for (let i = 0; i < key.length; i++) {
			if (!has(value, key[i])) {
				return false
			}
			value = get(value, key[i])
		}
		return true
	}
	switch (parent?.constructor) {
		case Array:
			return typeof key === "number" && key >= 0 && key < parent.length
		case Object:
			return Object.hasOwn(parent, key)
		case Map:
		case Set:
			return parent.has(key)
		default:
			return false
	}
}

// Function: index
// Returns the first index or key whose value strictly equals `item`.
function index(values, item) {
	if (Array.isArray(values)) {
		return values.indexOf(item)
	}
	if (typeof values === "string") {
		return values.indexOf(item)
	}
	if (values instanceof Map) {
		for (const [k, v] of values.entries()) {
			if (v === item) {
				return k
			}
		}
		return -1
	}
	if (values instanceof Set) {
		let i = 0
		for (const v of values.values()) {
			if (v === item) {
				return i
			}
			i += 1
		}
		return -1
	}
	if (isObject(values)) {
		for (const k in values) {
			if (Object.hasOwn(values, k) && values[k] === item) {
				return k
			}
		}
	}
	return list(values).indexOf(item)
}

// Function: entries
// Returns collection entries as `[key, value]` pairs.
function entries(value) {
	if (value == null) {
		return []
	}
	switch (value?.constructor) {
		case Array: {
			const res = new Array(value.length)
			for (let i = 0; i < value.length; i++) {
				res[i] = [i, value[i]]
			}
			return res
		}
		case Object:
			return Object.entries(value)
		case Map:
			return Array.from(value.entries())
		case Set: {
			const res = []
			let i = 0
			for (const v of value.values()) {
				res.push([i++, v])
			}
			return res
		}
		default:
			if (typeof value?.[Symbol.iterator] === "function") {
				const res = []
				let i = 0
				for (const v of value) {
					res.push([i++, v])
				}
				return res
			}
			return [[0, value]]
	}
}

// ----------------------------------------------------------------------------
//
// TRAVERSAL
//
// ----------------------------------------------------------------------------

// Function: remap
// Maps `value` with `mapper`; supports deep traversal with path-aware options.
function remap(
	value,
	mapper,
	{ deep = false, match = undefined, descend = undefined, path = [] } = {},
) {
	const shouldMap = match ? !!match(value, path) : true
	const mapped = shouldMap ? mapper(value, path[path.length - 1], path) : value
	if (!deep) {
		return mapped
	}
	if (descend && descend(mapped, path) === false) {
		return mapped
	}
	if (Array.isArray(mapped)) {
		const n = mapped.length
		const res = new Array(n)
		for (let i = 0; i < n; i++) {
			res[i] = remap(mapped[i], mapper, {
				deep,
				match,
				descend,
				path: [...path, i],
			})
		}
		return res
	}
	if (mapped instanceof Map) {
		const res = new Map()
		for (const [k, v] of mapped.entries()) {
			res.set(
				k,
				remap(v, mapper, {
					deep,
					match,
					descend,
					path: [...path, k],
				}),
			)
		}
		return res
	}
	if (mapped instanceof Set) {
		const res = new Set()
		let i = 0
		for (const v of mapped.values()) {
			res.add(
				remap(v, mapper, {
					deep,
					match,
					descend,
					path: [...path, i],
				}),
			)
			i += 1
		}
		return res
	}
	if (isObject(mapped)) {
		const res = {}
		for (const k in mapped) {
			if (!Object.hasOwn(mapped, k)) {
				continue
			}
			res[k] = remap(mapped[k], mapper, {
				deep,
				match,
				descend,
				path: [...path, k],
			})
		}
		return res
	}
	return mapped
}

export { access, entries, get, has, index, iter, path, remap }

// EOF
