// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/values
// Value-shape helpers, collection normalization, sentinel singletons, and
// shallow cloning.

// ----------------------------------------------------------------------------
//
// TYPE CHECKS
//
// ----------------------------------------------------------------------------

// Function: def
// Returns the first argument that is not `undefined`.
function def(...rest) {
	for (const v of rest) {
		if (v !== undefined) {
			return v;
		}
	}
}

// Function: isObject
// Returns true when `value` is a plain object.
function isObject(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function isAnnotable(value) {
	return !!(
		value !== null &&
		value !== undefined &&
		(typeof value === "object" || typeof value === "function")
	);
}

function isThenable(value) {
	return !!(
		value !== null &&
		value !== undefined &&
		(typeof value === "object" || typeof value === "function") &&
		typeof value.then === "function"
	);
}
// Function: len
// Returns collection length/size semantics for `value`.
function len(value) {
	if (value === undefined || value === null) {
		return 0;
	}
	if (Array.isArray(value)) {
		return value.length;
	}
	if (typeof value === "string") {
		return value.length;
	}
	if (value instanceof Map || value instanceof Set) {
		return value.size;
	}
	if (isObject(value)) {
		return Object.keys(value).length;
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

// Function: str
// Coerces `value` into a string representation.
function str(value) {
	if (value == null) return "";
	switch (value?.constructor) {
		case String:
			return value;
		case Array:
			return value.join("");
		case Set:
			return Array.from(value).join("");
		case Map:
			return Array.from(value.values()).join("");
		case Object:
			return JSON.stringify(value);
		default:
			return String(value);
	}
}

// Function: set
// Coerces `value` into a native Set using list-normalized values.
function set(value) {
	return new Set(list(value));
}

// Function: dict
// Normalizes `value` into a plain object.
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
			}
			return { 0: value };
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

// Function: isNullish
// Returns true when `value` is `null` or `undefined`.
function isNullish(value) {
	return value === null || value === undefined;
}

// Function: isMapLike
// Returns true when `value` exposes object-style or map-style keyed access.
function isMapLike(value) {
	switch (value?.constructor) {
		case Map:
		case Object:
			return true;
		default:
			return false;
	}
}

// Function: isArrayLike
// Returns true when `value` behaves like an index-addressable list.
function isArrayLike(value) {
	if (Array.isArray(value)) {
		return true;
	}
	if (typeof NodeList !== "undefined" && value instanceof NodeList) {
		return true;
	}
	switch (value?.constructor) {
		case Array:
			return true;
		default:
			return false;
	}
}

// Function: isIterable
// Returns true when `value` implements `Symbol.iterator`.
function isIterable(value) {
	return value != null && typeof value[Symbol.iterator] === "function";
}

// Function: isWalkable
// Returns true when `value` should be descended into by `iwalk`.
function isWalkable(value) {
	if (isArrayLike(value)) {
		return true;
	}
	if (isMapLike(value)) {
		return true;
	}
	return typeof value !== "string" && isIterable(value);
}

// Function: isReactive
// Returns true when `value` follows Select.js reactive value marker semantics.
function isReactive(value) {
	return value?.isReactive === true;
}

// Function: atom
// Returns true when `value` is a scalar value.
function atom(value) {
	switch (value?.constructor) {
		case undefined:
		case Boolean:
		case Number:
		case String:
		case Date:
			return true;
		default:
			return false;
	}
}

// Function: composite
// Returns true when `value` is a supported collection container.
function composite(value) {
	switch (value?.constructor) {
		case Array:
		case Object:
		case Map:
		case Set:
			return true;
		default:
			return false;
	}
}

// Function: isEmpty
// Returns true when `value` is an empty array, object, string, number, or missing value.
function isEmpty(value) {
	switch (value?.constructor) {
		case Array:
			for (let i = 0; i < value.length; i++) {
				const v = value[i];
				if (v !== null && v !== undefined) {
					return false;
				}
			}
			return true;
		case Object:
			for (const k in value) {
				const v = value[k];
				if (v !== null && v !== undefined) {
					return false;
				}
			}
			return true;
		case String:
			return value.trim() === "";
		case Number:
			return Number.isNaN(value);
		case undefined:
			return true;
		default:
			return false;
	}
}

// ----------------------------------------------------------------------------
//
// SENTINELS
//
// ----------------------------------------------------------------------------

const Nothing = Object.freeze(new Object());
const Something = Object.freeze(new Object());

// ----------------------------------------------------------------------------
//
// VALUE OPERATIONS
//
// ----------------------------------------------------------------------------

// Function: access
// Traverses `context` using path `p` starting at `offset`.
function access(context, p, offset = 0) {
	p = typeof p === "string" ? p.split(".") : p;
	if (p?.length && context !== undefined) {
		for (
			let i = offset;
			i < p.length && context !== undefined && context !== null;
			i++
		) {
			context = context[p[i]];
		}
	}
	return context;
}

// Function: bool
// Coerces `value` to semantic truthiness used by utility helpers.
function bool(value) {
	if (value == null) return false;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") return value.length > 0;
	return true;
}

// Function: empty
// Returns an empty container of the same value type.
function empty(value) {
	switch (value?.constructor) {
		case Array:
			return [];
		case Object:
			return {};
		case Map:
			return new Map();
		case Set:
			return new Set();
		default:
			return value;
	}
}

// Function: freeze
// Freezes object values in place and returns `value` unchanged for scalars.
function freeze(value) {
	return value instanceof Object && Object.freeze(value) ? value : value;
}

// Function: expand
// Resolves nested reactive values recursively.
function expand(value) {
	if (isReactive(value)) {
		value = value.value;
	}
	if (Array.isArray(value)) {
		const n = value.length;
		const res = new Array(n);
		for (let i = 0; i < n; i++) {
			res[i] = expand(value[i]);
		}
		return res;
	}
	if (value instanceof Map) {
		const res = new Map();
		for (const [k, v] of value.entries()) {
			res.set(k, expand(v));
		}
		return res;
	}
	if (value instanceof Set) {
		const res = new Set();
		for (const v of value.values()) {
			res.add(expand(v));
		}
		return res;
	}
	if (isObject(value)) {
		const res = {};
		for (const k in value) {
			if (Object.hasOwn(value, k)) {
				res[k] = expand(value[k]);
			}
		}
		return res;
	}
	return value;
}

// ----------------------------------------------------------------------------
//
// KINDS AND STORAGE
//
// ----------------------------------------------------------------------------

// Function: type
// Returns the Select.js value kind constant for `value`.
const type = Object.assign(
	(value) =>
		value === undefined || value === null
			? type.Null
			: Array.isArray(value)
				? type.List
				: Object.getPrototypeOf(value) === Object.prototype
					? type.Dict
					: typeof value === "number"
						? type.Number
						: typeof value === "string"
							? type.String
							: typeof value === "boolean"
								? type.Boolean
								: type.Object,
	{ Null: 1, Number: 2, Boolean: 3, String: 4, Object: 5, List: 10, Dict: 11 },
);

// Function: singleton
// Returns a shared instance of `type` using `storage`.
function singleton(type, storage = undefined) {
	storage = storage ?? singleton.all;
	if (storage.has(type)) {
		return storage.get(type);
	}
	const value = new type();
	storage.set(type, value);
	return value;
}

singleton.all = new Map();

// Function: flyweight
// Returns a recycled instance of `type` or creates a new one.
function flyweight(type, storage = undefined) {
	storage = storage ?? flyweight.all;
	const values = storage.get(type);
	if (values?.length) {
		return values.pop();
	}
	return new type();
}

flyweight.all = new Map();

// Function: recycle
// Resets and stores `value` for later `flyweight` reuse.
function recycle(value, storage = undefined) {
	if (!value) {
		return false;
	}
	storage = storage ?? flyweight.all;
	const type = value.constructor;
	if (!type) {
		return false;
	}
	if (typeof value.reset === "function") {
		value.reset();
	}
	const values = storage.get(type);
	if (values) {
		values.push(value);
	} else {
		storage.set(type, [value]);
	}
	return true;
}

// Function: clone
// Creates a shallow clone for `value`, inferring container type from `key` when needed.
function clone(value, key = undefined) {
	if (Array.isArray(value)) return value.slice();
	if (isObject(value)) return { ...value };
	return typeof key === "number" ? [] : {};
}

export {
	Nothing,
	Something,
	access,
	array,
	atom,
	bool,
	clone,
	composite,
	def,
	dict,
	empty,
	expand,
	flyweight,
	freeze,
	isArrayLike,
	isEmpty,
	isIterable,
	isMapLike,
	isNullish,
	isObject,
	isReactive,
	isWalkable,
	isThenable,
	isAnnotable,
	keys,
	len,
	list,
	recycle,
	set,
	singleton,
	str,
	type,
	values,
};

// EOF
