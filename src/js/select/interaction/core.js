// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-16
// Updated: 2026-06-16

// Module: select/interaction/core
// Core DOM interaction helpers.

// Function: bind
// Registers `handlers` on `node`. Accepts a single node or an array-like
// collection of nodes and returns the original `node`.
function bind(node, handlers) {
	if (handlers) {
		for (const [name, handler] of Object.entries(handlers)) {
			for (const target of Array.isArray(node) ? node : [node]) {
				target.addEventListener(name, handler);
			}
		}
	}
	return node;
}

// Function: unbind
// Removes `handlers` from `node`. Accepts a single node or an array-like
// collection of nodes and returns the original `node`.
function unbind(node, handlers) {
	if (handlers) {
		for (const [name, handler] of Object.entries(handlers)) {
			for (const target of Array.isArray(node) ? node : [node]) {
				target.removeEventListener(name, handler);
			}
		}
	}
	return node;
}

// Function: target
// Walks up from `node` until `pred(node)` returns true.
function target(node, pred) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		if (pred(node)) return node;
		node = node.parentNode;
	}
	return undefined;
}

const core = { bind, unbind, target };

export { bind, core, target, unbind };
export default core;

// EOF
