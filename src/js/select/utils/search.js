// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-03
// Updated: 2026-06-03

// Module: select/utils/search
// Predicate combinators and text-search helpers.
//
// `match` resolves a criteria value against a candidate. Criteria can be
// primitives, regular expressions, arrays, object shapes, or predicate
// functions. `textfilter` builds a search regexp from a query string using
// `OR` clauses, quoted phrases, and a `?` wildcard token.
//
// Example:
// ```javascript
// import search from "./utils/search.js"
//
// const filter = search.text("alpha OR \"beta gamma\"")
// filter.test("alpha") // true
// ```

// ----------------------------------------------------------------------------
//
// SECTION: Internal Combinators
//
// ----------------------------------------------------------------------------

// Function: donot
// Returns the negated result of `match(value, criteria)`.
function donot(value, criteria) {
	return !match(value, criteria);
}

// Function: doand
// Returns `true` when all `criteria` match `value`.
function doand(value, ...criteria) {
	for (const c of criteria) {
		if (!match(value, c)) {
			return false;
		}
	}
	return true;
}

// Function: door
// Returns `true` when any of `criteria` matches `value`.
function door(value, ...criteria) {
	for (const c of criteria) {
		if (match(value, c)) {
			return true;
		}
	}
	return false;
}

// ----------------------------------------------------------------------------
//
// SECTION: Combinators
//
// ----------------------------------------------------------------------------

// Function: or
// Returns a predicate that matches `value` when any of `criteria` match.
function or(...criteria) {
	return (value) => door(value, ...criteria);
}

// Function: and
// Returns a predicate that matches `value` when all of `criteria` match.
function and(...criteria) {
	return (value) => doand(value, ...criteria);
}

// Function: not
// Returns a predicate that negates `criteria`.
function not(criteria) {
	return (value) => donot(value, criteria);
}

// ----------------------------------------------------------------------------
//
// SECTION: Matching
//
// ----------------------------------------------------------------------------

// Function: match
// Returns `true` when `value` satisfies `criteria`.
//
// - Falsy criteria matches everything.
// - `RegExp` criteria test the string form of `value`.
// - Array criteria require all items to match.
// - Object criteria require all enumerable keys to match recursively.
// - Function criteria are called with `value` and should return a boolean.
// - Other criteria are matched by strict identity.
function match(value, criteria) {
	if (!criteria) {
		return true;
	}
	// We support different types of values for matching
	switch (value?.constructor) {
		case Array:
			for (const v of value) {
				if (match(v, criteria)) {
					return true;
				}
			}
			return false;
		case Object:
			for (const k in value) {
				if (match(value[k], criteria)) {
					return true;
				}
			}
			return false;
		case undefined:
			return false;
	}
	// No we match the value (a number/boolean/string) against the criteria.
	if (criteria instanceof RegExp) {
		if (value === undefined || value === null) {
			return false;
		} else {
			const v = typeof value === "string" ? value : `${value}`;
			if (!criteria.test(v)) {
				return false;
			}
		}
	} else if (Array.isArray(criteria)) {
		// We need to match ALL criteria.
		for (const c of criteria) {
			if (!match(value, c)) {
				return false;
			}
		}
		return true;
	} else if (criteria.constructor === Object) {
		// Match every enumerable property in the shape.
		for (const k in criteria) {
			const c = criteria[k];
			const v = value ? value[k] : undefined;
			if (!match(v, c)) {
				return false;
			}
		}
		return true;
	} else if (criteria instanceof Function) {
		// It's a function.
		return criteria(value);
	} else {
		// It's a value, and we filter by identity.
		return value === criteria;
	}
	return true;
}

// ----------------------------------------------------------------------------
//
// SECTION: Text Search
//
// ----------------------------------------------------------------------------

// Function: textfilter
// Builds a case-insensitive regular expression from `text`.
//
// `OR` splits alternatives, quoted terms are treated as exact phrases, and
// `?` expands to an optional whitespace-delimited capture.
//
// Example:
// ```javascript
// const re = textfilter('alpha OR "beta gamma"')
// re.test("beta gamma") // true
// ```
function textfilter(text) {
	return text && typeof text === "string"
		? new RegExp(
				`${text
					.trim()
					.split(/\s+OR\s+/i)
					.map((part) => {
						// Replace special characters with their escaped versions.
						part = part
							.replace(/([\\.*+?^${}|/()[\]\\])/g, "\\$1")
							.replace(/\s*\?\s*/g, "(?:\\s+([^\\s]+))?");
						// Handle exact phrases with quotes.
						return part.startsWith('"') && part.endsWith('"')
							? `\\b${part.slice(1, -1)}\\b`
							: part;
					})
					.join("|")}`,
				"i",
			)
		: null;
}

// Function: predicate
// Returns a predicate for `criteria`.
//
// - No criteria returns `null`.
// - One criterion returns a unary matcher using `match`.
// - Multiple criteria return an `and` combinator.
function predicate(...criteria) {
	switch (criteria.length) {
		case 0:
		case undefined:
			return null;
		case 1:
			return (_) => match(_, criteria[0]);
		default:
			return (_) => and(_, ...criteria);
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Exports
//
// ----------------------------------------------------------------------------

export { match, predicate, textfilter };
export default { text: textfilter, and, or, not, match, predicate };

// EOF
