// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/html
// HTML-oriented helpers for class-name normalization and text coercion.

import { iresplit, re } from "./text.js";

// ----------------------------------------------------------------------------
//
// BASICS
//
// ----------------------------------------------------------------------------

const microtask =
	typeof globalThis.queueMicrotask === "function"
		? globalThis.queueMicrotask.bind(globalThis)
		: (fn) => Promise.resolve().then(fn);

// Function: asText
// Converts `value` to displayable text, expanding reactive values.
function asText(value) {
	return value === null || value === undefined
		? ""
		: typeof value === "number"
			? `${value}`
			: typeof value === "string"
				? value
				: JSON.stringify(value);
}

// ----------------------------------------------------------------------------
//
// CLASS TOKENS
//
// ----------------------------------------------------------------------------

// Function: iclsx
// Generator yielding normalized class tokens from mixed inputs.
function* iclsx(...args) {
	for (const value of args) {
		if (!value) continue;
		switch (value?.constructor) {
			case Array:
				yield* iclsx(...value);
				break;
			case Object:
				for (const key in value) {
					const token = key.trim();
					if (value[key] && token) yield token;
				}
				break;
			case String: {
				const token = value.trim();
				if (token.length) yield token;
				break;
			}
			case Number:
				yield `${value}`;
				break;
		}
	}
}

// Function: clsx
// Joins normalized class tokens into a single class string.
function clsx(...args) {
	return [...iclsx(...args)].join(" ");
}

// ----------------------------------------------------------------------------
//
// HIGHLIGHTING
//
// ----------------------------------------------------------------------------

// Function: hi
// Highlights `query` matches in `text` and returns a text node or fragment.
function hi(text, query, creator = undefined) {
	query = re(query);
	text = `${text ?? ""}`;
	if (!text) {
		return text;
	}
	switch (query?.constructor) {
		case RegExp: {
			if (text.search(query) === -1) {
				return text;
			}
			const res = document.createDocumentFragment();
			for (const atom of iresplit(text, query)) {
				let node;
				if (typeof atom === "string") {
					node = document.createTextNode(atom);
				} else {
					const text = `${atom[0]}`;
					if (creator) {
						node = creator(text);
					} else {
						node = document.createElement("mark");
						node.classList.add("hi");
						node.appendChild(document.createTextNode(text));
					}
				}
				res.appendChild(node);
			}
			return res;
		}
		default:
			return text;
	}
}

export { asText, clsx, hi, iclsx, microtask };

// EOF
