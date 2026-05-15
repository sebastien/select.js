// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-15

// Module: select/formats
// String case format helpers shared across modules.

function toKebabCase(value) {
	return `${value}`
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase()
}

function toCamelCase(value) {
	return `${value}`
		.toLowerCase()
		.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase())
}

export {
	toCamelCase,
	toKebabCase,
}

// EOF
