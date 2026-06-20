// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/logger
// Scoped console logging helpers.

// ----------------------------------------------------------------------------
//
// API
//
// ----------------------------------------------------------------------------

function isPlainObject(value) {
	if (!value || typeof value !== "object") {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function summarizeNode(value) {
	const name = `${value?.nodeName || value?.tagName || value?.localName || "node"}`
		.toLowerCase();
	const id = typeof value?.getAttribute === "function"
		? value.getAttribute("id")
		: value?.id;
	return id ? `<${name}#${id}>` : `<${name}>`;
}

function sanitizeLogValue(value, depth = 0, seen = new WeakSet()) {
	if (
		value === null ||
		value === undefined ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (typeof value === "function") {
		return `[Function ${value.name || "anonymous"}]`;
	}
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}
	if (typeof value === "object") {
		if (seen.has(value)) {
			return "[Circular]";
		}
		seen.add(value);
		if (value?.nodeType || value?.ownerDocument || value?.tagName) {
			return summarizeNode(value);
		}
		if (depth >= 2) {
			return `[${value?.constructor?.name || "Object"}]`;
		}
		if (Array.isArray(value)) {
			return value
				.slice(0, 8)
				.map((_) => sanitizeLogValue(_, depth + 1, seen));
		}
		if (isPlainObject(value)) {
			const res = {};
			const entries = Object.entries(value);
			for (let i = 0; i < entries.length && i < 12; i++) {
				const [key, item] = entries[i];
				res[key] = sanitizeLogValue(item, depth + 1, seen);
			}
			if (entries.length > 12) {
				res.__truncated__ = `${entries.length - 12} more keys`;
			}
			return res;
		}
	}
	return value;
}

function logWith(method, scope, args) {
	console[method](
		`[${scope}]`,
		...args.map((_) => sanitizeLogValue(_)),
	);
}

// Function: logger
// Returns scoped logging methods (`log`, `warn`, `error`) prefixed with `scope`.
function logger(scope) {
	return {
		log: (...args) => logWith("log", scope, args),
		warn: (...args) => logWith("warn", scope, args),
		error: (...args) => logWith("error", scope, args),
	};
}

export { logger };

// EOF
