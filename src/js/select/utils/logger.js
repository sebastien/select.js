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

// Function: logger
// Returns scoped logging methods (`log`, `warn`, `error`) prefixed with `scope`.
function logger(scope) {
	return {
		log: (...args) => console.log(`[${scope}]`, ...args),
		warn: (...args) => console.warn(`[${scope}]`, ...args),
		error: (...args) => console.error(`[${scope}]`, ...args),
	};
}

export { logger };

// EOF
