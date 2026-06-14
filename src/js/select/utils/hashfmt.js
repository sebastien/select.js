// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-15

// Module: select/utils/hashfmt
// Compact hash-format (hashfmt) parser and formatter. Serializes scalars,
// arrays, and plain objects into a URL-safe notation and back.
//
// Summary
//
// - Scalars — `undefined` → `"undefined"`, `null` → `"_"`, `true`/`false`
//   → `"T"`/`"F"`, numbers as-is, strings with `"` or `'` quoting
//   when needed
// - Arrays — `(a,b,c)` or bare `1,2,3`
// - Objects — `key=value,key2=value2`
// - Nested — `outer=(inner=a,inner2=b)`
//
// Escaping: `&,( )="'` in unquoted strings triggers `"..."` quoting.
// Inside quoted strings `\\"` and `\\'` unescape to `"` and `'`.

// ----------------------------------------------------------------------------
//
// HASHFMT CORE
//
// ----------------------------------------------------------------------------

const RE_HASH_ESCAPE = /[&,()="']/
const RE_HASH_NUMBER = /^-?\d+(_?\d+)*(\.\d+)?$/

import { isObject } from "./values.js"

// ----------------------------------------------------------------------------
//
// RECORD AND HASH FORMAT
//
// ----------------------------------------------------------------------------

// Class: RecordFormat
// Serialization-aware record format with sanitization hooks. Provides a
// configurable pipeline for parsing text into sanitized records and
// formatting them back.
//
// - scope: string - logging scope identifier
// - serializer: Object - `{ parse, format }` pair for the underlying format
// - warn: function - warning callback `(scope, error, details)`
class RecordFormat {
	static UNSAFE_LOCATION_KEY = /^(?:__proto__|prototype|constructor)$/;

	constructor(scope, serializer, warn) {
		this.scope = scope;
		this.serializer = serializer;
		this.warn = warn;
	}

	static WarnIssue(warn, scope, message, details = {}) {
		if (typeof warn === "function") warn(scope, new Error(message), details);
	}

	static SanitizeText(value, warn, scope, details = {}) {
		const text = `${value ?? ""}`;
		let sanitized = "";
		for (let i = 0; i < text.length; i++) {
			const code = text.charCodeAt(i);
			if (
				(code >= 0x00 && code <= 0x1f) ||
				code === 0x7f ||
				code === 0x2028 ||
				code === 0x2029
			)
				continue;
			sanitized += text[i];
		}
		if (sanitized !== text) {
			RecordFormat.WarnIssue(warn, scope, "control characters pruned", {
				value: text,
				sanitized,
				...details,
			});
		}
		return sanitized;
	}

	static SanitizeKey(key, warn, scope, details = {}) {
		const sanitized = RecordFormat.SanitizeText(key, warn, scope, details);
		if (
			!sanitized ||
			RecordFormat.UNSAFE_LOCATION_KEY.test(sanitized) ||
			sanitized.endsWith("[]")
		) {
			RecordFormat.WarnIssue(warn, scope, "unsafe key pruned", {
				key,
				sanitized,
				...details,
			});
			return undefined;
		}
		return sanitized;
	}

	static SanitizeItem(value, warn, scope, details = {}) {
		if (value === undefined) return undefined;
		if (value === null || value === true || value === false) return value;
		if (typeof value === "string")
			return RecordFormat.SanitizeText(value, warn, scope, details);
		if (typeof value === "number") {
			if (Number.isFinite(value)) return value;
			RecordFormat.WarnIssue(warn, scope, "non-finite number pruned", {
				value,
				...details,
			});
			return undefined;
		}
		if (Array.isArray(value))
			return RecordFormat.SanitizeArray(value, warn, scope, details);
		if (isObject(value)) return RecordFormat.SanitizeRecord(value, warn, scope);
		RecordFormat.WarnIssue(warn, scope, "unsupported location value pruned", {
			type: typeof value,
			value,
			...details,
		});
		return undefined;
	}

	static SanitizeArray(value, warn, scope, details = {}) {
		const res = [];
		for (let i = 0; i < value.length; i++) {
			const item = RecordFormat.SanitizeItem(value[i], warn, scope, {
				...details,
				index: i,
			});
			if (item !== undefined) res.push(item);
		}
		return res;
	}

	static SanitizeRecord(value, warn, scope) {
		if (!isObject(value)) {
			if (value !== undefined && value !== null) {
				RecordFormat.WarnIssue(
					warn,
					scope,
					"unsupported location container pruned",
					{
						type: typeof value,
						value,
					},
				);
			}
			return {};
		}
		const res = {};
		for (const key in value) {
			if (!Object.hasOwn(value, key)) continue;
			const safeKey = RecordFormat.SanitizeKey(key, warn, scope, { key });
			if (safeKey === undefined) continue;
			const item = value[key];
			if (Array.isArray(item)) {
				const safeArray = RecordFormat.SanitizeArray(item, warn, scope, {
					key: safeKey,
				});
				if (safeArray.length) res[safeKey] = safeArray;
			} else {
				const safeValue = RecordFormat.SanitizeItem(item, warn, scope, {
					key: safeKey,
				});
				if (safeValue !== undefined) res[safeKey] = safeValue;
			}
		}
		return res;
	}

	decodeText(value) {
		return `${value || ""}`;
	}

	encodeText(value) {
		return `${value || ""}`;
	}

	sanitizeRecord(value) {
		return RecordFormat.SanitizeRecord(value, this.warn, this.scope);
	}

	parse(value, fallback = {}) {
		const text = this.decodeText(value);
		return this.sanitizeRecord(this.safeParse(text, fallback));
	}

	format(value) {
		return this.encodeText(this.serializer.format(this.sanitizeRecord(value)));
	}

	read(win, fallback = {}) {
		return win?.location ? this.parse(this.source(win), fallback) : fallback;
	}

	safeParse(text, fallback) {
		try {
			return this.serializer.parse(text);
		} catch (error) {
			this.warn(this.scope, error, { text });
			return fallback;
		}
	}
}

// Class: HashFormat
// RecordFormat subclass specialized for `#`-backed browser hash values.
// Strips leading `#` on decode and wraps decode-text through sanitization.
class HashFormat extends RecordFormat {
	constructor(serializer, warn) {
		super("browser.hash", serializer, warn);
	}

	parse(value, fallback = {}) {
		const text = this.decodeText(value);
		const parsed = this.safeParse(text, fallback);
		if (Array.isArray(parsed)) return parsed;
		return this.sanitizeRecord(parsed);
	}

	source(win) {
		return win.location.hash;
	}

	decodeText(value) {
		return RecordFormat.SanitizeText(
			`${value || ""}`.replace(/^#/, ""),
			this.warn,
			this.scope,
		);
	}

	encodeText(value) {
		return RecordFormat.SanitizeText(
			`${value || ""}`.replace(/^#/, ""),
			this.warn,
			this.scope,
		);
	}
}

// Function: decodeComponent
// Decodes `%`-encoded URI components in `value`, returning the raw value
// on error.
function decodeComponent(value) {
	if (!value?.includes("%")) return value
	try {
		return decodeURIComponent(value)
	} catch (_error) {
		return value
	}
}

// Function: formatAtom
// Converts a scalar `value` to its hashfmt string representation.
// - `undefined` → `"undefined"`
// - `null` → `"_"`
// - `true` → `"T"`, `false` → `"F"`
// - Numbers → decimal string
// - Strings → quoted with `"` when they contain `&,( )="\''`
function formatAtom(value) {
	if (value === undefined) return "undefined"
	if (value === null) return "_"
	if (value === true) return "T"
	if (value === false) return "F"
	if (typeof value === "number")
		return Number.isFinite(value) ? `${value}` : ""
	const text = `${value}`
	return RE_HASH_ESCAPE.test(text)
		? `"${text.replaceAll('"', '\\"')}"`
		: text
}

// Function: iFormat
// Generator that recursively formats `value` at `depth`. Yields string
// fragments that produce a valid hashfmt string when joined.
function* iFormat(value, depth = 0) {
	if (
		value === undefined ||
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		yield formatAtom(value)
		return
	}
	if (depth > 0) yield "("
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			yield* iFormat(value[i], depth + 1)
			if (i < value.length - 1) yield ","
		}
	} else if (isObject(value)) {
		const keys = Object.keys(value).sort()
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i]
			yield `${key}=`
			yield* iFormat(value[key], depth + 1)
			if (i < keys.length - 1) yield ","
		}
	}
	if (depth > 0) yield ")"
}

// Function: formatHashValue
// Formats `value` into a complete hashfmt string by joining the
// `iFormat` generator output.
function formatHashValue(value) {
	return [...iFormat(value)].join("")
}

// Function: nextSeparator
// Scans `value` from `offset` for the next `,`, `=`, `(`, `)`, `"`,
// or `'` character, respecting quoting. Returns `[index, separatorChar]`
// or `[null, null]` when no separator is found.
function nextSeparator(value, offset = 0) {
	let quoted = false
	for (let i = offset; i < value.length; i++) {
		const c = value[i]
		if ((c === '"' || c === "'") && value[i - 1] !== "\\") {
			quoted = !quoted
			if (quoted) return [i, c]
			continue
		}
		if (!quoted && (c === "," || c === "=" || c === "(" || c === ")")) {
			return [i, c]
		}
	}
	return [null, null]
}

// Function: parseAtom
// Converts a hashfmt scalar token `value` back to a JavaScript scalar.
// - `""` → `""`
// - `"_"`/`"null"` → `null`
// - `"undefined"` → `undefined`
// - `"T"`/`"true"` → `true`, `"F"`/`"false"` → `false`
// - Numbers (with optional `_` separators) → `Number`
// - Otherwise → decoded string
function parseAtom(value) {
	const decode = decodeComponent(value)
	if (value === "") return ""
	if (decode === "_" || decode === "null") return null
	if (decode === "undefined") return undefined
	if (decode === "T" || decode === "true") return true
	if (decode === "F" || decode === "false") return false
	if (RE_HASH_NUMBER.test(decode)) {
		const parsed = Number(decode.replaceAll("_", ""))
		if (!Number.isNaN(parsed)) return parsed
	}
	return decode
}

// Function: parseHashText
// Recursive-descent parser for hashfmt. Returns a parsed structure
// (array, object, or scalar) from `value`.
//
// Notice: the caller is responsible for sanitizing the input value
// (e.g. stripping control characters) before calling.
function parseHashText(value) {
	const source = `${value ?? ""}`
	const root = []
	const stack = [root]
	const indexStack = [{ key: undefined, index: 0, mode: "array" }]
	let key
	let keyBlocked = false
	let index = 0
	let rawStart = -1
	let rawQuote = '"'
	let cursor = 0
	const current = () => stack[stack.length - 1]
	const currentContext = () => indexStack[indexStack.length - 1]
	const promoteCurrentToObject = () => {
		const ctx = currentContext()
		if (ctx.mode === "object") return
		if (!Array.isArray(current())) {
			ctx.mode = "object"
			return
		}
		const parent = stack[stack.length - 2]
		const parentRef = indexStack[indexStack.length - 1]
		const replacement = {}
		for (let i = 0; i < current().length; i++) {
			const item = current()[i]
			if (item !== undefined) replacement[`${item}`] = true
		}
		if (parent) parent[parentRef.key ?? parentRef.index] = replacement
		stack[stack.length - 1] = replacement
		ctx.mode = "object"
	}
	const commit = (atom, forcedKey = undefined) => {
		const container = current()
		const targetKey = forcedKey !== undefined ? forcedKey : key
		if (targetKey !== undefined) {
			promoteCurrentToObject()
			current()[targetKey] = atom
			return
		}
		if (currentContext().mode === "object") {
			if (atom !== undefined) current()[`${atom}`] = true
			return
		}
		if (Array.isArray(container)) container.push(atom)
		else container[index] = atom
	}
	while (cursor < source.length) {
		if (rawStart >= 0) {
			const quote = source.indexOf(rawQuote, cursor)
			if (quote < 0) {
				const raw = decodeComponent(
					source.substring(rawStart).replaceAll(`\\${rawQuote}`, rawQuote),
				)
				if (raw !== "") commit(raw)
				break
			}
			if (source[quote - 1] === "\\") {
				cursor = quote + 1
				continue
			}
			const raw = decodeComponent(
				source.substring(rawStart, quote).replaceAll(`\\${rawQuote}`, rawQuote),
			)
			if (raw !== "") commit(raw)
			rawStart = -1
			cursor = quote + 1
			continue
		}
		const [sepIndex, sep] = nextSeparator(source, cursor)
		const end = sepIndex === null ? source.length : sepIndex
		const token = source.substring(cursor, end).trim()
		if (sep === "=") {
			const nextKey = decodeComponent(token)
			key = nextKey
			keyBlocked = nextKey === undefined || nextKey === ""
			if (!keyBlocked) promoteCurrentToObject()
			cursor = sepIndex + 1
			continue
		}
		if (!keyBlocked && token !== "") {
			if (currentContext().mode === "object" && key === undefined) {
				const nextKey = decodeComponent(token)
				if (nextKey !== undefined && nextKey !== "") commit(true, nextKey)
			} else {
				const atom = parseAtom(token)
				if (atom !== "") commit(atom)
			}
		}
		if (sep === ",") {
			key = undefined
			keyBlocked = false
			if (currentContext().mode === "array") index += 1
			cursor = sepIndex + 1
			continue
		}
		if (sep === '"' || sep === "'") {
			rawStart = sepIndex + 1
			rawQuote = sep
			cursor = rawStart
			continue
		}
		if (sep === "(") {
			if (keyBlocked) {
				cursor = sepIndex + 1
				continue
			}
			const nested = []
			commit(nested)
			stack.push(nested)
			indexStack.push({ key, index, mode: "array" })
			key = undefined
			keyBlocked = false
			index = 0
			cursor = sepIndex + 1
			continue
		}
		if (sep === ")") {
			if (stack.length > 1) {
				stack.pop()
				const previous = indexStack.pop()
				key = previous?.key
				index = previous?.index ?? 0
			}
			cursor = sepIndex + 1
			continue
		}
		break
	}
	const result =
		stack[0][0] !== undefined && stack[0].length === 1
			? stack[0][0]
			: stack[0]
	if (Array.isArray(result) || isObject(result)) return result
	if (result === undefined) return {}
	return { 0: result }
}

// Function: isArrayLikeRecord
// Returns true when `value` is an object whose keys are sequential
// positive integers `"0"`, `"1"`, ... `"N-1"`.
function isArrayLikeRecord(value) {
	if (!isObject(value)) return false
	const keys = Object.keys(value)
	if (!keys.length) return false
	for (let i = 0; i < keys.length; i++) {
		if (keys[i] !== `${i}`) return false
	}
	return true
}

// Function: normalizeHashValue
// Recursively normalizes a parsed hashfmt `value`. Converts
// array-like records (`{"0": a, "1": b}`) to arrays. Leaves arrays
// and typed scalars untouched.
function normalizeHashValue(value) {
	if (Array.isArray(value)) {
		const res = new Array(value.length)
		for (let i = 0; i < value.length; i++)
			res[i] = normalizeHashValue(value[i])
		return res
	}
	if (isArrayLikeRecord(value)) {
		const keys = Object.keys(value)
		const res = new Array(keys.length)
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i]
			res[i] = normalizeHashValue(value[key])
		}
		return res
	}
	if (isObject(value)) {
		const res = {}
		const keys = Object.keys(value)
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i]
			res[key] = normalizeHashValue(value[key])
		}
		return res
	}
	return value
}

// Function: looksLikeHashText
// Returns true when `value` looks like a hashfmt expression (starts
// with `(` and ends with `)`).
function looksLikeHashText(value) {
	return value.startsWith("(") && value.endsWith(")")
}

// ----------------------------------------------------------------------------
//
// HIGH-LEVEL ENTRY POINTS
//
// ----------------------------------------------------------------------------

// Function: parseHashValue
// Parses a standalone hashfmt `value` into a JavaScript value. Unlike
// `parseHash`, this is a pure parser with no prefix stripping or path
// detection. Single-element arrays are unwrapped to scalars.
//
// This is the entry point for `out=cell?defaultValue` where the
// default value is expressed as a hashfmt literal.
//
// Example:
// ```javascript
// parseHashValue("0")                  // 0
// parseHashValue('"Sebastien"')        // "Sebastien"
// parseHashValue("()")                 // []
// parseHashValue("debug=T")            // { debug: true }
// parseHashValue("1,2,3")              // [1, 2, 3]
// ```
function parseHashValue(value) {
	const parsed = parseHashText(value)
	const normalized = normalizeHashValue(parsed)
	if (Array.isArray(normalized) && normalized.length === 1)
		return normalized[0]
	return normalized
}

// Function: parseHash
// Parses hashfmt text `value` with browser-hash preprocessing.
// Strips a leading `#`, applies path-detection semantics for bare
// first tokens, and normalizes the result.
function parseHash(value) {
	const source = `${value || ""}`.replace(/^#/, "")
	if (!source) return {}
	if (source.startsWith("(")) {
		const parsed = parseHashText(source)
		return normalizeHashValue(parsed)
	}
	const [sepIdx, sep] = nextSeparator(source, 0)
	const firstSegment = sepIdx === null ? source : source.substring(0, sepIdx).trim()
	if (firstSegment && sep !== "=") {
		const pathValue = parseAtom(firstSegment)
		const pathStr = `${pathValue}`
		if (sep !== ",") {
			return pathStr.includes("/")
				? { path: pathValue }
				: { path: pathValue, [pathStr]: true }
		}
		const remaining = source.substring(sepIdx + 1).trim()
		if (!remaining) {
			return pathStr.includes("/")
				? { path: pathValue }
				: { path: pathValue, [pathStr]: true }
		}
		const rest = normalizeHashValue(parseHashText(remaining))
		if (Array.isArray(rest)) {
			const result = { path: pathValue }
			if (!pathStr.includes("/")) result[pathStr] = true
			for (let i = 0; i < rest.length; i++) result[rest[i]] = true
			return result
		}
		if (typeof rest === "string") {
			const result = { path: pathValue }
			if (!pathStr.includes("/")) result[pathStr] = true
			result[rest] = true
			return result
		}
		if (isObject(rest)) {
			rest.path = pathValue
			if (!pathStr.includes("/")) rest[pathStr] = true
			return rest
		}
		return pathStr.includes("/")
			? { path: pathValue }
			: { path: pathValue, [pathStr]: true }
	}
	const parsed = parseHashText(source)
	return normalizeHashValue(parsed)
}

// Function: formatHash
// Formats `value` as a hashfmt string, normalizing array-like
// records to arrays first.
function formatHash(value) {
	return formatHashValue(normalizeHashValue(value))
}

// Function: parseQuery
// Parses hashfmt text `value` as a query string. Strips leading
// `?` or `#` and any trailing `#` fragment, then parses and
// normalizes.
function parseQuery(value) {
	const text = `${value || ""}`.replace(/^[?#]/, "")
	const i = text.indexOf("#")
	const source = i >= 0 ? text.slice(0, i) : text
	if (!source) return {}
	const parsed = parseHashText(source)
	return normalizeHashValue(parsed)
}

// Function: formatQuery
// Formats `value` as a hashfmt string suitable for query strings.
function formatQuery(value) {
	return formatHashValue(normalizeHashValue(value))
}

// ----------------------------------------------------------------------------
//
// SERIALIZER PAIRS
//
// ----------------------------------------------------------------------------

const hash = {
	parse: parseHash,
	format: formatHash,
}

const query = {
	parse: parseQuery,
	format: formatQuery,
}

export {
	decodeComponent,
	formatAtom,
	formatHash,
	formatHashValue,
	formatQuery,
	hash,
	HashFormat,
	iFormat,
	isArrayLikeRecord,
	looksLikeHashText,
	nextSeparator,
	normalizeHashValue,
	parseAtom,
	parseHash,
	parseHashText,
	parseHashValue,
	parseQuery,
	query,
	RecordFormat,
	RE_HASH_ESCAPE,
	RE_HASH_NUMBER,
}

// EOF
