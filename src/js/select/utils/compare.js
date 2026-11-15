// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/compare
// Equality, length, and comparison helpers.

import { extractor } from "./func.js";

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
	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a === null ||
		b === null
	) {
		return false;
	}
	if (limit !== undefined && limit <= 0) {
		return false;
	}
	if (a.constructor !== b.constructor) {
		return false;
	}
	const nextLimit = limit === undefined ? undefined : limit - 1;
	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false;
		}
		const n = a.length;
		if (n !== b.length) {
			return false;
		}
		for (let i = 0; i < n; i++) {
			if (!eq(a[i], b[i], nextLimit)) {
				return false;
			}
		}
		return true;
	}
	if (Object.getPrototypeOf(a) === Object.prototype) {
		if (Object.getPrototypeOf(b) !== Object.prototype) {
			return false;
		}
		let n = 0;
		for (const k in a) {
			if (!Object.hasOwn(a, k)) {
				continue;
			}
			n += 1;
			const bv = b[k];
			if (
				(bv === undefined && !Object.hasOwn(b, k)) ||
				!eq(a[k], bv, nextLimit)
			) {
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
	if (a instanceof Map) {
		if (!(b instanceof Map) || a.size !== b.size) {
			return false;
		}
		// Sizes match, so every key of `a` being in `b` means equal key sets.
		for (const [k, v] of a) {
			if (!b.has(k) || !eq(v, b.get(k), nextLimit)) {
				return false;
			}
		}
		return true;
	}
	if (a instanceof Set) {
		if (!(b instanceof Set) || a.size !== b.size) {
			return false;
		}
		for (const v of a) {
			if (!b.has(v)) {
				return false;
			}
		}
		return true;
	}
	if (a instanceof Date) {
		return b instanceof Date && Object.is(a.getTime(), b.getTime());
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
		const ext = extractor(extractorFunc);
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
