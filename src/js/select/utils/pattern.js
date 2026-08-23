// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-31

// Module: select/utils/pattern
// Character-level `{name}` / `{name:type}` slot parsing shared by routing
// and input masks. Unlike `route()`, slots may sit next to literals.

// Class: Pattern
// Regular-expression matcher used by named pattern slots.
class Pattern {
	constructor(regexp, extractor = undefined) {
		this.regexp = regexp;
		this.extractor = extractor;
	}
}

// Function: pattern
// Creates a `Pattern` from `regexp` and an optional `extractor`.
function pattern(regexp, extractor = undefined) {
	return new Pattern(regexp, extractor);
}

// Function: escapeRegexp
// Escapes regexp metacharacters in `value`, leaving `*` unescaped so
// wildcard patterns can still rewrite it.
function escapeRegexp(value) {
	return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
}

const PATTERNS = {
	chunk: pattern(/^[^/]+$/),
	number: pattern(/^[0-9]+$/),
	alpha: pattern(/^[A-Za-z]+$/),
	string: pattern(/^[A-Za-z0-9_-]+$/),
};

function patternSlot(name, type) {
	const matched =
		type && PATTERNS[type]
			? PATTERNS[type]
			: type
				? new Pattern(new RegExp(type))
				: PATTERNS.chunk;
	return new PatternSlot(matched, name, 0, true);
}

// Class: PatternSlot
// Named slot with a `pattern`, parameter `name`, and positional `index`.
// `raw` is the original `{...}` text; `type` is the optional type/regexp
// body; `source` is the unanchored regexp source used by masks.
class PatternSlot {
	constructor(pattern, name, index, capture = true) {
		this.pattern = pattern;
		this.name = name;
		this.index = index;
		this.capture = capture;
		this.raw = undefined;
		this.type = undefined;
		this.source = undefined;
	}

	toJSON() {
		return { name: this.name, matches: this.pattern.regexp.source };
	}
}

// Function: parseSlot
// Parses a `{name}` or `{name:type}` slot beginning at `offset`.
function parseSlot(text, offset = 0) {
	if (text[offset] !== "{") return null;
	let depth = 0;
	let escaped = false;
	for (let i = offset; i < text.length; i++) {
		const character = text[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === "{") {
			depth++;
		} else if (character === "}") {
			depth--;
			if (depth === 0) {
				const body = text.slice(offset + 1, i);
				const separator = body.indexOf(":");
				const name = separator < 0 ? body : body.slice(0, separator);
				const type = separator < 0 ? undefined : body.slice(separator + 1);
				const slot = patternSlot(name || "", type);
				slot.raw = text.slice(offset, i + 1);
				slot.type = type;
				slot.source = type || PATTERNS.chunk.regexp.source;
				return slot;
			}
		}
	}
	throw new SyntaxError(
		`Pattern slot at ${offset} does not end with a brace: ${text}`,
	);
}

// Function: parsePattern
// Tokenizes literals and named slots in a character-level pattern.
function parsePattern(text) {
	const source = `${text ?? ""}`;
	const tokens = [];
	let literal = "";
	for (let i = 0; i < source.length; i++) {
		if (source[i] !== "{") {
			literal += source[i];
			continue;
		}
		const slot = parseSlot(source, i);
		if (literal) {
			tokens.push(literal);
			literal = "";
		}
		slot.index = tokens.length;
		tokens.push(slot);
		i += slot.raw.length - 1;
	}
	if (literal) tokens.push(literal);
	return tokens;
}

export {
	escapeRegexp,
	PATTERNS,
	Pattern,
	PatternSlot,
	parsePattern,
	parseSlot,
	pattern,
};

// EOF
