// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/func
// Function composition, defaults, and memoization helpers.

import { access } from "./traverse.js"
import { bool } from "./values.js"

// ----------------------------------------------------------------------------
//
// BASIC HELPERS
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

// Function: swallow
// Returns the last argument in `args`.
function swallow(...args) {
	return args[args.length - 1];
}

// Function: asTrue
// Returns `true`.
function asTrue() {
	return true;
}

// Function: pipe
// Applies each function in `f` to `v`, returning the final result.
function pipe(v, ...f) {
	let r = v;
	for (let i = 0; i < f.length; i++) {
		r = f[i](r);
	}
	return r;
}

// Function: idem
// Identity helper returning `value` unchanged.
function idem(value) {
	return value;
}

// Function: extractor
// Returns accessor function for `pathOrFunc`.
function extractor(pathOrFunc) {
	if (typeof pathOrFunc === "function") {
		return pathOrFunc;
	}
	if (pathOrFunc == null) {
		return (v) => v;
	}
	return (v) => access(v, pathOrFunc);
}

// Function: predicate
// Returns predicate function from `predicateOrExtractor`.
function predicate(predicateOrExtractor) {
	if (typeof predicateOrExtractor === "function") {
		return predicateOrExtractor;
	}
	if (predicateOrExtractor == null) {
		return (v) => bool(v);
	}
	const ext = extractor(predicateOrExtractor);
	return (v) => bool(ext(v));
}

// ----------------------------------------------------------------------------
//
// MEMOIZATION
//
// ----------------------------------------------------------------------------

const Memoized = new Map();

// Function: memo
// Returns a cached `functor` result scoped by one or more `guards`.
function memo(guards, functor) {
	const scope = (Array.isArray(guards) ? guards : [guards]).reduce((r, v) => {
		if (r.has(v)) {
			return r.get(v);
		} else {
			const w = new Map();
			r.set(v, w);
			return w;
		}
	}, Memoized);
	if (!scope.has(true)) {
		scope.set(true, functor());
	}
	return scope.get(true);
}

export { asTrue, def, idem, extractor, predicate, memo, pipe, swallow };

// EOF
