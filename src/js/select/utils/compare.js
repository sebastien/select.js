// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/compare
// Equality, length, and comparison helpers.

import { extractor } from "./func.js"
import { isObject } from "./values.js"

// ----------------------------------------------------------------------------
//
// EQUALITY
//
// ----------------------------------------------------------------------------

// Function: eq
// Performs deep structural equality on arrays, plain objects, maps, and sets.
function eq(a, b, limit = undefined) {
	if (Object.is(a, b)) {
		return true;
	}
	if (limit !== undefined && limit <= 0) {
		return false;
	}
	const ta = a?.constructor;
	const tb = b?.constructor;
	if (ta !== tb) {
		return false;
	}
	const nextLimit = limit === undefined ? undefined : limit - 1;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!eq(a[i], b[i], nextLimit)) {
				return false;
			}
		}
		return true;
	}
	if (isObject(a) && isObject(b)) {
		let n = 0;
		for (const k in a) {
			if (!Object.hasOwn(a, k)) {
				continue;
			}
			n += 1;
			if (!Object.hasOwn(b, k) || !eq(a[k], b[k], nextLimit)) {
				return false;
			}
		}
		for (const k in b) {
			if (Object.hasOwn(b, k)) {
				n -= 1;
			}
		}
		return n === 0;
	}
	if (a instanceof Map && b instanceof Map) {
		if (a.size !== b.size) {
			return false;
		}
		const seen = new Set();
		for (const [k, v] of a.entries()) {
			seen.add(k);
			if (!eq(v, b.get(k), nextLimit)) {
				return false;
			}
		}
		for (const k of b.keys()) {
			if (!seen.has(k)) {
				return false;
			}
		}
		return true;
	}
	if (a instanceof Set && b instanceof Set) {
		if (a.size !== b.size) {
			return false;
		}
		for (const v of a) {
			if (!b.has(v)) {
				return false;
			}
		}
		return true;
	}
	if (ta === undefined) {
		return a === b;
	}
	return false;
}

// ----------------------------------------------------------------------------
//
// COMPARATORS
//
// ----------------------------------------------------------------------------

// Function: cmp
// Compares `a` and `b`, optionally after extractor projection.
function cmp(a, b, extractorFunc) {
	if (extractorFunc !== undefined && extractorFunc !== null) {
		const ext = extractor(extractorFunc)
		a = ext(a);
		b = ext(b);
	}
	if (a === b) {
		return 0;
	}
	const ta = typeof a;
	const tb = typeof b;
	if (ta === tb) {
		switch (ta) {
			case "string":
				return a.localeCompare(b);
			case "object":
				if (a === null || b === null) {
					return a === b ? 0 : a === null ? -1 : 1;
				}
				if (Array.isArray(a) && Array.isArray(b)) {
					const an = a.length;
					const bn = b.length;
					if (an < bn) return -1;
					if (an > bn) return 1;
					for (let i = 0; i < an; i++) {
						const res = cmp(a[i], b[i]);
						if (res !== 0) {
							return res;
						}
					}
					return 0;
				}
				return -1;
			default:
				return a > b ? 1 : -1;
		}
	}
	return a > b ? 1 : -1;
}

export { cmp, eq };

// EOF
