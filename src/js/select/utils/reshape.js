// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-30

// Module: select/utils/reshape
// Template-driven reshaping helpers based on slots, structural matching, and
// path expansion. The module exposes a small slot registry, a matcher that
// walks templates against values, a mapper that records slot paths, and a
// reshaper that assigns matched values into an output structure.

// ----------------------------------------------------------------------------
//
// SLOT REGISTRY
//
// ----------------------------------------------------------------------------

import { assign } from "./update.js";

// Shared registry backing the default `slot` proxy.
const SLOTS = new Map();

// Function: slots
// Creates a proxy-backed slot registry. Property access returns stable symbols
// for string keys and preserves symbol keys as-is.
function slots(slots = new Map()) {
	return new Proxy(slots, {
		get(target, name) {
			if (typeof name === "symbol") {
				if (!target.has(name)) {
					target.set(name, name);
				}
				return target.get(name);
			}
			if (!target.has(name)) {
				target.set(name, Symbol.for(name));
			}
			return target.get(name);
		},
	});
}

// A proxy that can be used to lazily create and reference slots.
const slot = slots(SLOTS);

// ----------------------------------------------------------------------------
//
// MATCHING AND MAPPING
//
// ----------------------------------------------------------------------------

// Function: imatchslots
// Walks `template` against `value` and yields `match` / `mismatch` atoms.
// Symbol keys act as captures and are stored in the yielded `scope`.
function* imatchslots(template, value, path = [], scope = {}) {
	switch (template?.constructor) {
		case Object:
			// Parse string keys first.
			for (const key in template) {
				yield* imatchslots(template[key], value?.[key], [...path, key], scope);
			}
			for (const key of Object.getOwnPropertySymbols(template)) {
				// Symbol keys capture the currently matched key.
				switch (value?.constructor) {
					case Object:
						for (const k in value) {
							const nextScope = Object.create(scope);
							nextScope[key] = k;
							yield {
								type: "match",
								template: key,
								value: k,
								key: k,
								path: [...path],
								scope: nextScope,
							};
							yield* imatchslots(
								template[key],
								value[k],
								[...path, k],
								nextScope,
							);
						}
						break;
					case Array:
						for (let i = 0; i < value.length; i++) {
							const nextScope = Object.create(scope);
							nextScope[key] = i;
							yield {
								type: "match",
								template: key,
								value: i,
								key: i,
								path: [...path],
								scope: nextScope,
							};
							yield* imatchslots(
								template[key],
								value[i],
								[...path, i],
								nextScope,
							);
						}
						break;
					case undefined:
						// Nullish values are accepted.
						break;
					default:
				}
			}
			break;
		case Array:
			for (let i = 0; i < template.length; i++) {
				yield* imatchslots(template[i], value?.[i], [...path, i], scope);
			}
			break;
		case Symbol:
			// Symbols declared in the same object share the same scope chain.
			scope[template] = value;
			yield { type: "match", path, template, value, scope };
			break;
		default:
			if (template !== undefined && template !== value) {
				yield { type: "mismatch", path, template, value, scope };
			}
	}
}

// Function: mapslots
// Collects every symbol path found in `template` and returns a `Map` from slot
// symbol to an array of matching paths.
function mapslots(template, path = [], mapping = new Map()) {
	switch (template?.constructor) {
		case Object:
			for (const k in template) {
				mapslots(template[k], [...path, k], mapping);
			}
			for (const k of Object.getOwnPropertySymbols(template)) {
				mapslots(template[k], [...path, k], mapping);
			}
			break;
		case Array:
			for (let i = 0; i < template.length; i++) {
				mapslots(template[i], [...path, i], mapping);
			}
			break;
		case Symbol:
			if (!mapping.has(template)) {
				mapping.set(template, []);
			}
			mapping.get(template).push(path);
			break;
	}
	return mapping;
}

// Function: expandslots
// Replaces slot symbols in `value` using the current `scope` and preserves the
// original collection shape.
function expandslots(value, scope) {
	switch (value?.constructor) {
		case Object: {
			const result = {};
			for (const k in value) {
				result[k] = expandslots(value[k], scope);
			}
			for (const k of Object.getOwnPropertySymbols(value)) {
				result[k] = expandslots(value[k], scope);
			}
			return result;
		}
		case Array:
			return value.map((v) => expandslots(v, scope));
		case Symbol:
			return scope[value];
		default:
			return value;
	}
}

// ----------------------------------------------------------------------------
//
// RESHAPING
//
// ----------------------------------------------------------------------------

// Function: reshaper
// Creates a reshape function for `input` / `output` templates. The returned
// function matches `data` against the input template and assigns values into the
// output structure using mapped slot paths.
function reshaper(input, output) {
	const symbols = mapslots(output);
	return function reshape(data) {
		for (const atom of imatchslots(input ?? output, data)) {
			if (Object.hasOwn(atom, "key") || !symbols.has(atom.template)) {
				continue;
			}
			for (const path of expandslots(symbols.get(atom.template), atom.scope)) {
				output = assign(output, path, atom.value);
			}
		}
		return output;
	};
}

// Function: reshape
// Convenience wrapper around `reshaper(input, output)`.
function reshape(input, output, value) {
	return reshaper(input, output)(value);
}

function shaped(input, output, f) {
	return Object.assign(
		function (v, ...args) {
			if (input) {
				for (const atom of imatchslots(input, v)) {
					if (atom.type === "mismatch") {
						throw new Error(
							`Value does not match input template at path ${atom.path.join(".")}`,
						);
					}
				}
			}
			const res = f(v, ...args);
			if (output) {
				for (const atom of imatchslots(output, res)) {
					if (atom.type === "mismatch") {
						throw new Error(
							`Result does not match output template at path ${atom.path.join(".")}`,
						);
					}
				}
			}
			return res;
		},
		{ function: f, input, output },
	);
}

export {
	reshaper,
	reshape,
	shaped,
	slots,
	slot,
	imatchslots,
	mapslots,
	expandslots,
};
export default {
	slot,
	match: imatchslots,
	map: mapslots,
	expand: expandslots,
	reshaper,
	reshape,
	shaped,
};

// EOF
