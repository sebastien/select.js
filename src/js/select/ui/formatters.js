// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-15

// Module: select/ui/formatters
// Formatter registry API.

const FORMATS = Object.create(null)

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
