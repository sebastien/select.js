// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-15

// Module: select/ui/formatters
// Formatter registry API for pipe-based UI expressions.

// ----------------------------------------------------------------------------
//
// REGISTRY
//
// ----------------------------------------------------------------------------

const FORMATS = Object.create(null)

// Function: format
// Registers or resolves formatter entries.
// - When `name` is an object, merges all entries into `FORMATS`.
// - When `name` is a string and `value` is provided, registers one formatter.
// - When `name` is a string and no `value` is provided, resolves one formatter.
function format(name, ...value) {
	if (name && typeof name === "object" && !Array.isArray(name)) {
		for (const key in name) {
			FORMATS[key] = name[key]
		}
		return FORMATS
	}
	if (typeof name !== "string") {
		return undefined
	}
	const key = name.trim()
	if (!key) {
		return undefined
	}
	if (value.length) {
		FORMATS[key] = value[0]
		return value[0]
	}
	return FORMATS[key]
}

export {
	FORMATS,
	format,
}

// EOF
