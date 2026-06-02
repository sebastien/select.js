// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/update
// In-place structural updates for supported collection containers.

import { isObject } from "./values.js"

function _replaceObject(target, source) {
	for (const key in target) {
		if (Object.hasOwn(target, key)) {
			delete target[key]
		}
	}
	for (const key in source) {
		if (Object.hasOwn(source, key)) {
			target[key] = source[key]
		}
	}
	return target
}

// Function: append
// Mutably appends `item` to `collection` and returns `collection`.
function append(collection, item) {
	if (Array.isArray(collection)) {
		collection.push(item)
		return collection
	}
	if (isObject(collection)) {
		let i = Object.keys(collection).length
		while (collection[i] !== undefined) {
			i += 1
		}
		collection[i] = item
		return collection
	}
	throw new Error("append expects an Array or plain Object")
}

// Function: prepend
// Mutably inserts `item` at the beginning of `collection`.
function prepend(collection, item) {
	if (Array.isArray(collection)) {
		collection.splice(0, 0, item)
		return collection
	}
	if (isObject(collection)) {
		const res = { 0: item }
		for (const key in collection) {
			if (Object.hasOwn(collection, key)) {
				res[key] = collection[key]
			}
		}
		return _replaceObject(collection, res)
	}
	throw new Error("prepend expects an Array or plain Object")
}

// Function: insert
// Mutably inserts `item` at `insertionIndex` in `collection`.
function insert(collection, insertionIndex, item) {
	if (Array.isArray(collection)) {
		const indexValue =
			insertionIndex < 0 ? collection.length + insertionIndex : insertionIndex
		collection.splice(indexValue, 0, item)
		return collection
	}
	if (isObject(collection)) {
		const items = Object.values(collection)
		const indexValue =
			insertionIndex < 0 ? items.length + insertionIndex : insertionIndex
		items.splice(indexValue, 0, item)
		const res = {}
		for (let i = 0; i < items.length; i++) {
			res[i] = items[i]
		}
		return _replaceObject(collection, res)
	}
	throw new Error("insert expects an Array or plain Object")
}

// Function: update
// Mutably assigns `other` at `key` in `value`.
function update(value, key, other) {
	switch (value?.constructor) {
		case Array:
		case Object:
			if (Array.isArray(value) && typeof key === "number") {
				while (value.length <= key) {
					value.push(undefined)
				}
			}
			value[key] = other
			return value
		case Map:
			value.set(key, other)
			return value
		case Set:
			value.add(other)
			return value
		default:
			throw new Error("update expects an Array, Object, Map, or Set")
	}
}

// Function: remove
// Mutably removes `item` from `collection` and returns `collection`.
function remove(collection, item) {
	switch (collection?.constructor) {
		case Array: {
			for (let i = 0; i < collection.length; i++) {
				if (collection[i] === item) {
					collection.splice(i, 1)
					return collection
				}
			}
			return collection
		}
		case Object:
			if (Object.hasOwn(collection, item)) {
				delete collection[item]
			}
			return collection
		case Map:
			collection.delete(item)
			return collection
		case Set:
			collection.delete(item)
			return collection
		default:
			throw new Error("remove expects an Array, Object, Map, or Set")
	}
}

// Function: assign
// Mutably assigns `value` at path `p` in `scope` and returns the root container.
function assign(scope, p, value, merge = undefined, offset = 0) {
	const n = p?.length ?? 0
	if (n === 0) {
		return merge ? merge(scope, value) : value
	}
	let root =
		n > offset && !(scope && scope instanceof Object)
			? typeof p[offset] === "number"
				? new Array(p[offset])
				: {}
			: scope
	let s = root
	let sp = null
	for (let i = offset; i < n - 1; i++) {
		const k = p[i]
		if (!(s && s instanceof Object)) {
			s = typeof k === "number" ? new Array(k) : {}
			if (i === 0) {
				root = s
			} else {
				sp[p[i - 1]] = s
			}
		}
		if (typeof k === "number" && Array.isArray(s)) {
			while (s.length <= k) {
				s.push(undefined)
			}
		}
		sp = s
		s = s[k]
	}
	const k = p[n - 1]
	s[k] = merge ? merge(s[k], value) : value
	return root
}

export { append, assign, insert, prepend, remove, update }

// EOF
