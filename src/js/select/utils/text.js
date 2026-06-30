// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/text
// Text compression, highlighting, and regular-expression helpers.

const RE_SHORTWORD = /[A-Za-z][A-Za-z0-9]+/g;
const RE_OFFKEY = /([^A-Za-z0-9 \t\n])/g;
const RE_SPACES = /[ \t\n]+/g;
const RE_WORD_BOUNDARY = /([a-z0-9])([A-Z])/g;
const RE_CACHE = new Map();

// ----------------------------------------------------------------------------
//
// NORMALIZATION
//
// ----------------------------------------------------------------------------

// Function: rescape
// Escapes regexp metacharacters in `value`.
function rescape(value) {
	return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Function: words
// Splits mixed-case, kebab-case, snake_case, and spaced `value` into words.
function words(value) {
	const normalized = `${value ?? ""}`
		.replace(RE_WORD_BOUNDARY, "$1 $2")
		.replace(/[-_\s]+/g, " ")
		.trim();
	if (!normalized) {
		return [];
	}
	return normalized.split(/\s+/g);
}

// Function: fromKebabCase
// Splits kebab-cased `text` into trimmed segments.
function fromKebabCase(text) {
	return `${text ?? ""}`.split("-").map((_) => _.trim());
}

// Function: fromCamelCase
// Splits camelCase `text` into lowercase words.
function fromCamelCase(text) {
	return words(text).map((_) => _.toLowerCase());
}

// Function: fromPascalCase
// Splits PascalCase `text` into lowercase words.
function fromPascalCase(text) {
	return words(text).map((_) => _.toLowerCase());
}

// Function: capitalize
// Uppercases the first character in `text`.
function capitalize(text) {
	text = `${text ?? ""}`;
	return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

// Function: asNumber
// Coerces numeric-like values into a number, defaulting to `0`.
function asNumber(value) {
	if (value === undefined || value === null) {
		return 0;
	}
	if (typeof value === "number") {
		return Number.isNaN(value) ? 0 : value;
	}
	return value instanceof Date ? value.getTime() : 0;
}

// ----------------------------------------------------------------------------
//
// REGULAR EXPRESSIONS
//
// ----------------------------------------------------------------------------

// Function: re
// Returns a cached regular expression for string `query`.
function re(query) {
	if (query?.constructor !== String) {
		return query;
	}
	if (query.length === 0) {
		return null;
	}
	if (RE_CACHE.has(query)) {
		return RE_CACHE.get(query);
	}
	const res = new RegExp(query, "ig");
	RE_CACHE.set(query, res);
	return res;
}

// Function: reducematches
// Reduces `text` and regexp matches through `reducer`, including unmatched spans.
function reducematches(text, regexp, reducer, initial = []) {
	let res = initial;
	let i = 0;
	let o = 0;
	let r;
	for (const match of `${text ?? ""}`.matchAll(regexp)) {
		if (o !== match.index) {
			r = reducer(res, text.substring(o, match.index), i++);
			res = r === undefined ? res : r;
		}
		r = reducer(res, match, i++);
		o = match.index + match[0].length;
		res = r === undefined ? res : r;
	}
	if (o !== text.length) {
		r = reducer(res, text.substring(o), i++);
		res = r === undefined ? res : r;
	}
	return res;
}

// Function: iresplit
// Splits the given `text` based on the regular expression `re`.
function* iresplit(text, re, outputText = true) {
	if (!text?.length) {
		return;
	}
	switch (re?.constructor) {
		case String:
			re = new RegExp(re, "g");
			break;
		case RegExp:
			re = re.global ? re : new RegExp(re, `g${re.flags}`);
			break;
	}
	let o = 0;
	let match;
	while ((match = re.exec(text)) !== null) {
		if (outputText && o < match.index) {
			yield text.substring(o, match.index);
		}
		yield match;
		o = match.index + match[0].length;
	}
	if (outputText && o < text.length) {
		yield text.substring(o);
	}
}

// ----------------------------------------------------------------------------
//
// KEYS AND IDS
//
// ----------------------------------------------------------------------------

// Function: safekey
// Normalizes arbitrary text into a key-safe token separated by `sep`.
function safekey(value, sep = "_") {
	return `${value ?? ""}`
		.trim()
		.replace(RE_OFFKEY, "_")
		.replace(RE_SPACES, sep);
}

// Function: fromSnakeCase
// Splits snake_cased `text` into trimmed segments.
function fromSnakeCase(text) {
	return `${text ?? ""}`.split("_").map((_) => _.trim());
}

// Function: uid
// Returns a short base-36 identifier.
function uid() {
	return (
		`000${((Math.random() * 46656) | 0).toString(36)}`.slice(-3) +
		`000${((Math.random() * 46656) | 0).toString(36)}`.slice(-3)
	);
}

// ----------------------------------------------------------------------------
//
// FORMATTING
//
// ----------------------------------------------------------------------------

// Function: sprintf
// Formats `format` using printf-like substitutions.
function sprintf(...args) {
	function strRepeat(value, count) {
		const res = new Array(count);
		for (let i = 0; i < count; i++) {
			res[i] = value;
		}
		return res.join("");
	}

	let i = 0;
	let a;
	let f = args[i++];
	const o = [];
	let m;
	let p;
	let c;
	let x;
	while (f) {
		if ((m = /^[^\x25]+/.exec(f))) {
			o.push(m[0]);
		} else if ((m = /^\x25{2}/.exec(f))) {
			o.push("%");
		} else if (
			(m =
				/^\x25(?:(\d+)\$)?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([bcdefosuxX])/.exec(
					f,
				))
		) {
			a = args[m[1] || i++];
			if (a === null || a === undefined) {
				console.error(
					"std.core.sprintf: too few arguments, expected ",
					args.length,
					"got",
					i - 1,
					"in",
					args[0],
				);
				return;
			}
			if (/[^s]/.test(m[7]) && typeof a !== "number") {
				console.error(
					"std.core.sprintf: expected number at",
					i - 1,
					"got",
					a,
					"in",
					args[0],
				);
				return;
			}
			switch (m[7]) {
				case "b":
					a = a.toString(2);
					break;
				case "c":
					a = String.fromCharCode(a);
					break;
				case "d":
					a = parseInt(a, 10);
					break;
				case "e":
					a = m[6] ? a.toExponential(m[6]) : a.toExponential();
					break;
				case "f":
					a = m[6] ? parseFloat(a).toFixed(m[6]) : parseFloat(a);
					break;
				case "o":
					a = a.toString(8);
					break;
				case "s":
					a = (a = `${a}`) && m[6] ? a.substring(0, m[6]) : a;
					break;
				case "u":
					a = Math.abs(a);
					break;
				case "x":
					a = a.toString(16);
					break;
				case "X":
					a = a.toString(16).toUpperCase();
					break;
			}
			a = /[def]/.test(m[7]) && m[2] && a > 0 ? `+${a}` : a;
			c = m[3] ? (m[3] === "0" ? "0" : m[3].charAt(1)) : " ";
			x = m[5] - `${a}`.length;
			p = m[5] ? strRepeat(c, x) : "";
			o.push(m[4] ? a + p : p + a);
		} else {
			console.error(
				"std.core.sprintf: reached state that shouldn't have been reached.",
			);
			return;
		}
		f = f.substring(m[0].length);
	}
	return o.join("");
}

// ----------------------------------------------------------------------------
//
// COMPRESSION
//
// ----------------------------------------------------------------------------

// Function: b26
// Encodes integer `i` to base-26 lowercase token.
function b26(i) {
	let result = "";
	const base = 26;
	do {
		result = String.fromCharCode(97 + (i % base)) + result;
		i = Math.floor(i / base) - 1;
	} while (i >= 0);
	return result;
}

// Function: strhash
// Hashes `text` with the DJB2 family algorithm and optional `seed`.
function strhash(text, seed = 5381) {
	let hash = seed;
	let i = `${text ?? ""}`.length;
	const source = `${text ?? ""}`;
	while (i) {
		hash = (hash * 33) ^ source.charCodeAt(--i);
	}
	return hash >>> 0;
}

// Function: numcode
// Encodes integer `number` using the given `alphabet`.
function numcode(
	number,
	alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
) {
	const res = [];
	const n = alphabet.length;
	let v = number;
	while (v > 0) {
		const r = v % n;
		v = Math.floor(v / n);
		res.unshift(alphabet.charAt(r));
	}
	return res.join("");
}

// Function: shortdict
// Builds dictionary mapping frequent words in `text` to compact tokens.
function shortdict(text) {
	const words = Array.isArray(text)
		? text
		: `${text ?? ""}`.match(RE_SHORTWORD) || [];
	const counts = new Map();
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		counts.set(word, (counts.get(word) || 0) + 1);
	}
	const sortedWords = Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.map((entry) => entry[0]);
	return Object.fromEntries(sortedWords.map((word, i) => [word, b26(i)]));
}

// Function: shortword
// Compresses words in `text` using `dict` substitutions.
function shortword(text, dict = shortdict(text)) {
	let compressed = `${text ?? ""}`;
	for (const [originalWord, indexWord] of Object.entries(dict || {})) {
		const original = `${originalWord}`;
		if (!original) continue;
		compressed = compressed.replace(
			new RegExp(`\\b${rescape(original)}\\b`, "g"),
			`${indexWord}`,
		);
	}
	return compressed;
}

// Function: unshortword
// Expands compressed tokens in `text` using `dict` substitutions.
function unshortword(text, dict = shortdict(text)) {
	const source = `${text ?? ""}`;
	let compressed = source;
	let activeDict = dict || {};
	const splitIndex = source.indexOf("=");
	if (splitIndex >= 0) {
		const dictionary = source.slice(0, splitIndex);
		compressed = source.slice(splitIndex + 1);
		const words = dictionary ? dictionary.split(",") : [];
		const decoded = {};
		for (let i = 0; i < words.length; i++) {
			const word = words[i]?.trim();
			if (word) decoded[word] = b26(i);
		}
		activeDict = decoded;
	}
	let decompressed = compressed;
	for (const [originalWord, indexWord] of Object.entries(activeDict)) {
		const short = `${indexWord ?? ""}`;
		if (!short) continue;
		decompressed = decompressed.replace(
			new RegExp(`\\b${rescape(short)}\\b`, "g"),
			`${originalWord}`,
		);
	}
	return decompressed;
}

// ----------------------------------------------------------------------------
//
// CASE HELPERS
//
// ----------------------------------------------------------------------------

// Function: isPascalCase
// Returns true when `name` matches PascalCase naming.
function isPascalCase(name) {
	return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

// Function: isCamelCase
// Returns true when `name` matches camelCase naming.
function isCamelCase(name) {
	return /^[a-z][A-Za-z0-9]*$/.test(`${name ?? ""}`);
}

// Function: isSnakeCase
// Returns true when `name` matches lowercase snake_case naming.
function isSnakeCase(name) {
	return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(`${name ?? ""}`);
}

// Function: toCamelCase
// Normalizes `value` into camelCase text.
function toCamelCase(value) {
	const w = words(value);
	let res = "";
	for (let i = 0; i < w.length; i++) {
		const word = w[i].toLowerCase();
		if (!word) continue;
		res += i === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`;
	}
	return res;
}

// Function: toPascalCase
// Normalizes `value` into PascalCase text.
function toPascalCase(value) {
	const w = words(value);
	let res = "";
	for (let i = 0; i < w.length; i++) {
		const word = w[i].toLowerCase();
		if (!word) continue;
		res += `${word[0].toUpperCase()}${word.slice(1)}`;
	}
	return res;
}

// Function: toKebabCase
// Normalizes `value` into lower kebab-case text.
function toKebabCase(value) {
	return _words(value).join("-").toLowerCase();
}

// Function: toSnakeCase
// Normalizes `value` into lower snake_case text.
function toSnakeCase(value) {
	return _words(value).join("_").toLowerCase();
}

export {
	asNumber,
	b26,
	capitalize,
	fromCamelCase,
	fromKebabCase,
	fromPascalCase,
	fromSnakeCase,
	iresplit,
	isCamelCase,
	isPascalCase,
	isSnakeCase,
	numcode,
	re,
	reducematches,
	rescape,
	safekey,
	shortdict,
	shortword,
	sprintf,
	strhash,
	toCamelCase,
	toKebabCase,
	toPascalCase,
	toSnakeCase,
	uid,
	words,
	unshortword,
};

// EOF
