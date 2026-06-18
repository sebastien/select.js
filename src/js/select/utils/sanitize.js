// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/sanitize
// Recursive sanitizer for data, keys, and text values.

import { isObject } from "./values.js";

// ----------------------------------------------------------------------------
//
// SANITIZER
//
// ----------------------------------------------------------------------------

// Type: Sanitizer
// Sanitizes arrays and plain objects while allowing hooks for keys, text, and scalar values.
// - dropUndefined: boolean - Omits undefined values when true.
// - compactArrays: boolean - Removes dropped array entries when true.
// - keepNonPlainObjects: boolean - Preserves non-plain objects when true.
// - sanitizeTextHook: function | undefined - Rewrites string values.
// - sanitizeKeyHook: function | undefined - Rewrites object keys.
// - sanitizeScalarHook: function | undefined - Rewrites scalar values.
// - onDrop: function | undefined - Receives notifications for dropped values.
class Sanitizer {
	constructor(options = {}) {
		this.dropUndefined = options.dropUndefined !== false;
		this.compactArrays = options.compactArrays !== false;
		this.keepNonPlainObjects = options.keepNonPlainObjects !== false;
		this.sanitizeTextHook =
			typeof options.sanitizeText === "function"
				? options.sanitizeText
				: undefined;
		this.sanitizeKeyHook =
			typeof options.sanitizeKey === "function"
				? options.sanitizeKey
				: undefined;
		this.sanitizeScalarHook =
			typeof options.sanitizeScalar === "function"
				? options.sanitizeScalar
				: undefined;
		this.onDrop =
			typeof options.onDrop === "function" ? options.onDrop : undefined;
	}

	// Function: notify
	// Invokes drop callback with `reason` and optional `details`.
	notify(reason, details = undefined) {
		if (this.onDrop) this.onDrop(reason, details);
	}

	// Function: sanitize
	// Sanitizes any input `value` according to sanitizer options.
	sanitize(value) {
		return this.sanitizeAny(value, undefined, undefined);
	}

	// Function: sanitizeAny
	// Sanitizes `value` according to its runtime type.
	sanitizeAny(value, key, parent) {
		if (value === undefined && this.dropUndefined) {
			this.notify("undefined", { key, parent, value });
			return undefined;
		}
		if (Array.isArray(value)) return this.sanitizeArray(value);
		if (isObject(value)) return this.sanitizeObject(value);
		if (
			value !== null &&
			typeof value === "object" &&
			!this.keepNonPlainObjects
		) {
			this.notify("unsupported-object", { key, parent, value });
			return undefined;
		}
		if (typeof value === "string") return this.sanitizeText(value, key, parent);
		return this.sanitizeScalar(value, key, parent);
	}

	// Function: sanitizeText
	// Sanitizes text `value` using the configured text hook when available.
	sanitizeText(value, key, parent) {
		return this.sanitizeTextHook
			? this.sanitizeTextHook(value, { key, parent, sanitizer: this })
			: value;
	}

	// Function: sanitizeKey
	// Sanitizes object `key` using the configured key hook when available.
	sanitizeKey(key, value, parent) {
		if (!this.sanitizeKeyHook) return key;
		return this.sanitizeKeyHook(key, {
			value,
			parent,
			sanitizer: this,
		});
	}

	// Function: sanitizeScalar
	// Sanitizes scalar `value` using the configured scalar hook when available.
	sanitizeScalar(value, key, parent) {
		return this.sanitizeScalarHook
			? this.sanitizeScalarHook(value, { key, parent, sanitizer: this })
			: value;
	}

	// Function: sanitizeArray
	// Sanitizes array entries and optionally compacts dropped values.
	sanitizeArray(value) {
		const res = [];
		for (let i = 0; i < value.length; i++) {
			const item = this.sanitizeAny(value[i], i, value);
			if (item === undefined && this.dropUndefined) {
				if (!this.compactArrays) res.push(undefined);
				continue;
			}
			res.push(item);
		}
		return res;
	}

	// Function: sanitizeObject
	// Sanitizes object keys and values, skipping dropped entries.
	sanitizeObject(value) {
		const res = {};
		for (const k in value) {
			if (!Object.hasOwn(value, k)) continue;
			const safeKey = this.sanitizeKey(k, value[k], value);
			if (safeKey === undefined || safeKey === null || safeKey === "") {
				this.notify("key", { key: k, value: value[k], parent: value });
				continue;
			}
			const item = this.sanitizeAny(value[k], safeKey, value);
			if (item === undefined && this.dropUndefined) continue;
			res[safeKey] = item;
		}
		return res;
	}
}

// ----------------------------------------------------------------------------
//
// CACHED API
//
// ----------------------------------------------------------------------------

const DEFAULT_SANITIZER = new Sanitizer();
const SANITIZER_BY_OPTIONS = new WeakMap();

// Function: sanitizer
// Returns a cached sanitizer instance for `options`.
function sanitizer(options = undefined) {
	if (!options) return DEFAULT_SANITIZER;
	if (options instanceof Sanitizer) return options;
	let cached = SANITIZER_BY_OPTIONS.get(options);
	if (!cached) {
		cached = new Sanitizer(options);
		SANITIZER_BY_OPTIONS.set(options, cached);
	}
	return cached;
}

// Function: sanitize
// Sanitizes `value` using the resolved sanitizer for `options`.
function sanitize(value, options = undefined) {
	return sanitizer(options).sanitize(value);
}
sanitize.value = (value, options = undefined) => sanitize(value, options);

export { Sanitizer, sanitize, sanitizer };

// EOF
