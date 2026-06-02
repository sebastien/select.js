// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-06-02

// Module: select/utils/traverse
// Recursive traversal, path access, and structural reassignment helpers.

import { clone, isObject } from "./values.js";

// ----------------------------------------------------------------------------
//
// PATH ACCESS
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

// Function: path
// Normalizes `p` to a path array, returning `null` when unset.
function path(p, nothing = undefined) {
	if (p === nothing) {
		return null;
	}
	if (Array.isArray(p)) {
		return p;
	}
	if (p !== undefined && p !== null) {
		return [p];
	}
	return null;
}

// ----------------------------------------------------------------------------
//
// ASSIGNMENT
//
// ----------------------------------------------------------------------------

// Function: assign
// Mutably assigns `value` at path `p` in `scope` and returns the root container.
function assign(scope, p, value, merge = undefined, offset = 0) {
	const n = p?.length ?? 0;
	if (n === 0) {
		return merge ? merge(scope, value) : value;
	}
	let root =
		n > offset && !(scope && scope instanceof Object)
			? typeof p[offset] === "number"
				? new Array(p[offset])
				: {}
			: scope;
	let s = root;
	let sp = null;
	for (let i = offset; i < n - 1; i++) {
		const k = p[i];
		if (!(s && s instanceof Object)) {
			s = typeof k === "number" ? new Array(k) : {};
			if (i === 0) {
				root = s;
			} else {
				sp[p[i - 1]] = s;
			}
		}
		if (typeof k === "number" && Array.isArray(s)) {
			while (s.length <= k) {
				s.push(undefined);
			}
		}
		sp = s;
		s = s[k];
	}
	const k = p[n - 1];
	s[k] = merge ? merge(s[k], value) : value;
	return root;
}

// Function: reassign
// Immutably assigns `value` at path `p` by cloning touched branches.
function reassign(scope, p, value, merge = undefined, offset = 0) {
	const n = p?.length ?? 0;
	if (n === 0) {
		return merge ? merge(scope, value) : value;
	}
	const start = offset < 0 ? 0 : offset;
	if (start >= n) {
		return scope;
	}
	const root = clone(scope);
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
	currentClone[leafKey] = merge ? merge(currentClone[leafKey], value) : value;
	return root;
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
	const shouldMap = match ? !!match(value, path) : true;
	const mapped = shouldMap ? mapper(value, path[path.length - 1], path) : value;
	if (!deep) {
		return mapped;
	}
	if (descend && descend(mapped, path) === false) {
		return mapped;
	}
	if (Array.isArray(mapped)) {
		const n = mapped.length;
		const res = new Array(n);
		for (let i = 0; i < n; i++) {
			res[i] = remap(mapped[i], mapper, {
				deep,
				match,
				descend,
				path: [...path, i],
			});
		}
		return res;
	}
	if (mapped instanceof Map) {
		const res = new Map();
		for (const [k, v] of mapped.entries()) {
			res.set(
				k,
				remap(v, mapper, {
					deep,
					match,
					descend,
					path: [...path, k],
				}),
			);
		}
		return res;
	}
	if (mapped instanceof Set) {
		const res = new Set();
		let i = 0;
		for (const v of mapped.values()) {
			res.add(
				remap(v, mapper, {
					deep,
					match,
					descend,
					path: [...path, i],
				}),
			);
			i += 1;
		}
		return res;
	}
	if (isObject(mapped)) {
		const res = {};
		for (const k in mapped) {
			if (!Object.hasOwn(mapped, k)) {
				continue;
			}
			res[k] = remap(mapped[k], mapper, {
				deep,
				match,
				descend,
				path: [...path, k],
			});
		}
		return res;
	}
	return mapped;
}

export { access, assign, path, reassign, remap };

// EOF
