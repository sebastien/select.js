// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-30

// Module: select/utils/shape
// Shape-driven validation and template reshaping. A shape is a plain JavaScript
// structure used like a TypeScript type:
//
// - `{}` structures; keys suffixed with `?` are optional
// - `[V]` is a homogeneous array `V[]`; longer arrays are fixed tuples
// - `new Set([A, B])` is the union `A | B`
// - Type constructors (`String`, `Date`, …) represent types
// - Values are singletons; `undefined` is any; `Symbol` is a slot
//
// The module also exposes slot registries, structural matching/capture, path
// expansion, and reshapers that map captured slots into an output structure.

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
// TYPE AND SHAPE HELPERS
//
// ----------------------------------------------------------------------------

// Function: isTypeMatch
// Returns true when `value` conforms to the type constructor `type`.
function isTypeMatch(type, value) {
	switch (type) {
		case String:
			return typeof value === "string";
		case Number:
			return typeof value === "number";
		case Boolean:
			return typeof value === "boolean";
		case BigInt:
			return typeof value === "bigint";
		case Symbol:
			return typeof value === "symbol";
		case Function:
			return typeof value === "function";
		case Array:
			return Array.isArray(value);
		case Object:
			return (
				value !== null &&
				typeof value === "object" &&
				value.constructor === Object
			);
		default:
			return typeof type === "function" && value instanceof type;
	}
}

// Function: fieldKey
// Returns `[name, optional]` for a shape object key, where keys ending in `?`
// denote optional fields.
function fieldKey(key) {
	if (typeof key === "string" && key.endsWith("?")) {
		return [key.slice(0, -1), true];
	}
	return [key, false];
}

// Function: shapeKeys
// Collects declared field names from a plain object shape (optional suffix
// stripped).
function shapeKeys(shape) {
	const keys = new Set();
	for (const key in shape) {
		keys.add(fieldKey(key)[0]);
	}
	return keys;
}

// ----------------------------------------------------------------------------
//
// VALIDATION
//
// ----------------------------------------------------------------------------

// Function: ivalidate
// Walks `value` against `shape` and yields `{error, path, expected, value}`
// atoms for each problem. When `strict` is true, unexpected object keys fail.
function* ivalidate(value, shape, strict = false, path = []) {
	if (shape === undefined) {
		return;
	}
	switch (shape?.constructor) {
		case Symbol:
			return;
		case Set: {
			for (const option of shape) {
				if (validate(value, option, strict)) {
					return;
				}
			}
			yield { error: "mismatch", path, expected: shape, value };
			return;
		}
		case Array: {
			if (!Array.isArray(value)) {
				yield { error: "mismatch", path, expected: shape, value };
				return;
			}
			if (shape.length === 0) {
				if (value.length !== 0) {
					yield { error: "mismatch", path, expected: shape, value };
				}
				return;
			}
			if (shape.length === 1) {
				const item = shape[0];
				for (let i = 0; i < value.length; i++) {
					yield* ivalidate(value[i], item, strict, [...path, i]);
				}
				return;
			}
			if (value.length !== shape.length) {
				yield { error: "mismatch", path, expected: shape, value };
				return;
			}
			for (let i = 0; i < shape.length; i++) {
				yield* ivalidate(value[i], shape[i], strict, [...path, i]);
			}
			return;
		}
		case Object: {
			if (value === null || typeof value !== "object" || Array.isArray(value)) {
				yield { error: "mismatch", path, expected: shape, value };
				return;
			}
			for (const key in shape) {
				const [name, optional] = fieldKey(key);
				const present = Object.hasOwn(value, name);
				if (!present || value[name] === undefined) {
					if (!optional) {
						yield {
							error: "missing",
							path: [...path, name],
							expected: shape[key],
							value: value[name],
						};
					}
					continue;
				}
				yield* ivalidate(value[name], shape[key], strict, [...path, name]);
			}
			if (strict) {
				const allowed = shapeKeys(shape);
				for (const key in value) {
					if (!allowed.has(key)) {
						yield {
							error: "unexpected",
							path: [...path, key],
							expected: undefined,
							value: value[key],
						};
					}
				}
			}
			return;
		}
		default:
			if (typeof shape === "function") {
				if (!isTypeMatch(shape, value)) {
					yield { error: "mismatch", path, expected: shape, value };
				}
				return;
			}
			if (!Object.is(shape, value)) {
				yield { error: "mismatch", path, expected: shape, value };
			}
	}
}

// Function: validate
// Returns `true` when `value` conforms to `shape`. When `strict` is true,
// unexpected object keys fail.
function validate(value, shape, strict = false) {
	for (const _ of ivalidate(value, shape, strict)) {
		return false;
	}
	return true;
}

// ----------------------------------------------------------------------------
//
// MATCHING AND MAPPING
//
// ----------------------------------------------------------------------------

// Function: imatchslots
// Walks `template` against `value` and yields `match` / `mismatch` atoms.
// Symbol keys act as captures and are stored in the yielded `scope`. Shape
// rules (types, unions, optional fields, homogeneous arrays) apply.
function* imatchslots(template, value, path = [], scope = {}) {
	if (template === undefined) {
		return;
	}
	switch (template?.constructor) {
		case Object:
			for (const key in template) {
				const [name, optional] = fieldKey(key);
				if (
					optional &&
					(value == null ||
						!Object.hasOwn(value, name) ||
						value[name] === undefined)
				) {
					continue;
				}
				yield* imatchslots(
					template[key],
					value?.[name],
					[...path, name],
					scope,
				);
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
			if (!Array.isArray(value)) {
				yield { type: "mismatch", path, template, value, scope };
				break;
			}
			if (template.length === 1) {
				const item = template[0];
				for (let i = 0; i < value.length; i++) {
					yield* imatchslots(item, value[i], [...path, i], scope);
				}
			} else {
				for (let i = 0; i < template.length; i++) {
					yield* imatchslots(template[i], value?.[i], [...path, i], scope);
				}
			}
			break;
		case Set: {
			for (const option of template) {
				if (validate(value, option)) {
					yield* imatchslots(option, value, path, scope);
					return;
				}
			}
			yield { type: "mismatch", path, template, value, scope };
			break;
		}
		case Symbol:
			// Symbols declared in the same object share the same scope chain.
			scope[template] = value;
			yield { type: "match", path, template, value, scope };
			break;
		default:
			if (typeof template === "function") {
				if (!isTypeMatch(template, value)) {
					yield { type: "mismatch", path, template, value, scope };
				}
			} else if (!Object.is(template, value)) {
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

// Function: shaped
// Wraps `f` so that `input` / `output` shapes are checked around each call.
function shaped(input, output, f) {
	return Object.assign(
		(v, ...args) => {
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
	expandslots,
	imatchslots,
	isTypeMatch,
	ivalidate,
	mapslots,
	reshape,
	reshaper,
	shaped,
	slot,
	slots,
	validate,
};
export default {
	slot,
	match: imatchslots,
	map: mapslots,
	expand: expandslots,
	reshaper,
	reshape,
	shaped,
	ivalidate,
	validate,
};

// EOF
