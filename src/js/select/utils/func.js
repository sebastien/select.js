// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-14

// Module: select/utils/func
// Function composition, defaults, and memoization helpers.

import { access, bool, isAnnotable, isObject, isThenable } from "./values.js";

// ----------------------------------------------------------------------------
//
// BASIC HELPERS
//
// ----------------------------------------------------------------------------
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

function sym(key) {
	return Symbol.for(`:${key}`);
}

// Function: ary
// Returns a wrapper limiting `f` to `n` call-time arguments and appending `rest`.
function ary(n, f, ...rest) {
	switch (n) {
		case 1:
			return (a) => f(a, ...rest);
		case 2:
			return (a, b) => f(a, b, ...rest);
		case 3:
			return (a, b, c) => f(a, b, c, ...rest);
		case 4:
			return (a, b, c, d) => f(a, b, c, d, ...rest);
		case 5:
			return (a, b, c, d, e) => f(a, b, c, d, e, ...rest);
		case 6:
			return (a, b, c, d, e, g) => f(a, b, c, d, e, g, ...rest);
		default:
			return (...args) => {
				args.length = Math.max(0, n || 0);
				return f(...args, ...rest);
			};
	}
}

// Function: meta
// Assigns metadata entries from `annotations` onto `value`, or reads them back.
function meta(value, annotations = undefined) {
	if (annotations === undefined) {
		if (!isAnnotable(value)) {
			return {};
		}
		const res = {};
		const symbols = Object.getOwnPropertySymbols(value);
		for (let i = 0; i < symbols.length; i++) {
			const key = Symbol.keyFor(symbols[i]);
			if (key?.startsWith(":")) {
				res[key.slice(1)] = value[symbols[i]];
			}
		}
		return res;
	}
	if (!isAnnotable(value) || !isObject(annotations)) {
		return value;
	}
	for (const key in annotations) {
		if (Object.hasOwn(annotations, key)) {
			value[sym(key)] = annotations[key];
		}
	}
	return value;
}

// Function: named
// Annotates the single `[name]:value` entry with `name` metadata and returns `value`.
function named(values) {
	if (!isObject(values)) {
		return undefined;
	}
	for (const key in values) {
		if (Object.hasOwn(values, key)) {
			return meta(values[key], { name: key });
		}
	}
}

function collect(value, asObject = false) {
	switch (value?.constructor) {
		case undefined:
		case Boolean:
		case String:
		case Number:
		case Symbol:
			return value;
		case Array: {
			if (!asObject) {
				for (let i = 0; i < value.length; i++) {
					if (isThenable(value[i])) {
						return Promise.all(value);
					}
				}
				return value;
			}
			for (let i = 0; i < value.length; i++) {
				if (isThenable(value[i][1])) {
					const pending = new Array(value.length);
					for (let j = 0; j < value.length; j++) {
						pending[j] = Promise.resolve(value[j][1]).then((resolved) => [
							value[j][0],
							resolved,
						]);
					}
					return Promise.all(pending).then((resolved) =>
						collect(resolved, true),
					);
				}
			}
			const res = {};
			for (let i = 0; i < value.length; i++) {
				res[value[i][0]] = value[i][1];
			}
			return res;
		}
		default: {
			return value;
		}
	}
}

function pipestep(stage, value, args = undefined) {
	if (isThenable(value)) {
		return value.then((resolved) => pipestep(stage, resolved, args));
	} else if (typeof stage === "function") {
		return args ? stage(...args) : stage(value);
	} else if (Array.isArray(stage)) {
		const res = new Array(stage.length);
		for (let i = 0; i < stage.length; i++) {
			res[i] = pipestep(stage[i], value);
		}
		return collect(res);
	} else if (isObject(stage)) {
		const entries = [];
		for (const k in stage) {
			if (Object.hasOwn(stage, k)) {
				entries.push([k, pipestep(stage[k], value)]);
			}
		}
		return collect(entries, true);
	} else {
		return stage;
	}
}

// Function: pipe
// Applies each function in `f` to `v`, returning the final result.
// Equivalent to `pipeline(...f)(v)`.
function pipe(v, ...f) {
	return pipeline(...f)(v);
}

// Function: pipeline
// Returns a function applying `f` as a pipeline.
// The first stage receives all arguments and later stages receive the prior result.
// A single promise-like input is resolved before the first stage.
function pipeline(...f) {
	return (...args) => {
		if (!f.length) {
			return args[0];
		}
		let r = pipestep(f[0], args[0], args);
		for (let i = 1; i < f.length; i++) {
			r = pipestep(f[i], r);
		}
		return r;
	};
}

// Function: idem
// Identity helper returning `value` unchanged.
function idem(value) {
	return value;
}

// ----------------------------------------------------------------------------
//
// ACCESS HELPERS
//
// ----------------------------------------------------------------------------

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

export {
	ary,
	asTrue,
	extractor,
	idem,
	memo,
	meta,
	named,
	pipe,
	pipeline,
	predicate,
	swallow,
};

// EOF
