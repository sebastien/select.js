// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-07

// Module: select/browser
// Browser-backed reactive state for URL and local storage.

import { Cell } from "./cells.js";
import {
	access,
	eq,
	isObject,
	logger,
	Nothing,
	path as pathify,
	reassign,
	sanitize,
} from "./utils.js";

const log = logger("select.browser");

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

class PathFormat {
	constructor(warn) {
		this.warn = warn;
	}

	static SanitizeText(value, warn) {
		const text = RecordFormat.SanitizeText(value, warn, "browser.path");
		return text ? (text.startsWith("/") ? text : `/${text}`) : "/";
	}

	parse(value) {
		const text = PathFormat.SanitizeText(value, this.warn);
		const segments = text.split("/");
		for (let i = 0; i < segments.length; i++) {
			try {
				segments[i] = decodeURIComponent(segments[i]);
			} catch (error) {
				RecordFormat.WarnIssue(
					this.warn,
					"browser.path",
					"path segment decode failed",
					{
						error,
						segment: segments[i],
						index: i,
					},
				);
			}
		}
		const p = segments.join("/");
		return p || "/";
	}

	format(value) {
		const text = PathFormat.SanitizeText(value, this.warn);
		const segments = text.split("/");
		for (let i = 0; i < segments.length; i++)
			segments[i] = encodeURIComponent(segments[i]);
		return segments.join("/") || "/";
	}

	read(win, fallback = "/") {
		return win?.location
			? this.parse(win.location.pathname)
			: PathFormat.SanitizeText(fallback, this.warn);
	}
}

class HashFormat extends RecordFormat {
	static RE_HASH_ESCAPE = /[&,()="]/;
	static RE_HASH_NUMBER = /^-?\d+(_?\d+)*(\.\d+)?$/;

	constructor(serializer, warn) {
		super("browser.hash", serializer, warn);
	}

	static DecodeComponent(value) {
		if (!value?.includes("%")) return value;
		try {
			return decodeURIComponent(value);
		} catch (_error) {
			return value;
		}
	}

	static FormatAtom(value) {
		if (value === undefined) return "undefined";
		if (value === null) return "_";
		if (value === true) return "T";
		if (value === false) return "F";
		if (typeof value === "number")
			return Number.isFinite(value) ? `${value}` : "";
		const text = `${value}`;
		return HashFormat.RE_HASH_ESCAPE.test(text)
			? `"${text.replaceAll('"', '\\"')}"`
			: text;
	}

	static *IFormat(value, depth = 0) {
		if (
			value === undefined ||
			value === null ||
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			yield HashFormat.FormatAtom(value);
			return;
		}
		if (depth > 0) yield "(";
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				yield* HashFormat.IFormat(value[i], depth + 1);
				if (i < value.length - 1) yield ",";
			}
		} else if (isObject(value)) {
			const keys = Object.keys(value).sort();
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				yield `${key}=`;
				yield* HashFormat.IFormat(value[key], depth + 1);
				if (i < keys.length - 1) yield ",";
			}
		}
		if (depth > 0) yield ")";
	}

	static FormatHash(value) {
		return [...HashFormat.IFormat(value)].join("");
	}

	static NextSeparator(value, offset = 0) {
		let quoted = false;
		for (let i = offset; i < value.length; i++) {
			const c = value[i];
			if (c === '"' && value[i - 1] !== "\\") {
				quoted = !quoted;
				if (quoted) return [i, '"'];
				continue;
			}
			if (!quoted && (c === "," || c === "=" || c === "(" || c === ")")) {
				return [i, c];
			}
		}
		return [null, null];
	}

	static ParseAtom(value) {
		const decode = HashFormat.DecodeComponent(value);
		if (value === "") return "";
		if (decode === "_" || decode === "null") return null;
		if (decode === "undefined") return undefined;
		if (decode === "T" || decode === "true") return true;
		if (decode === "F" || decode === "false") return false;
		if (HashFormat.RE_HASH_NUMBER.test(decode)) {
			const parsed = Number(decode.replaceAll("_", ""));
			if (!Number.isNaN(parsed)) return parsed;
		}
		return decode;
	}

	static ParseHash(value) {
		const source = RecordFormat.SanitizeText(
			value,
			undefined,
			"browser.hashformat",
		);
		const root = [];
		const stack = [root];
		const indexStack = [{ key: undefined, index: 0, mode: "array" }];
		let key;
		let keyBlocked = false;
		let index = 0;
		let rawStart = -1;
		let cursor = 0;
		const current = () => stack[stack.length - 1];
		const currentContext = () => indexStack[indexStack.length - 1];
		const promoteCurrentToObject = () => {
			const ctx = currentContext();
			if (ctx.mode === "object") return;
			if (!Array.isArray(current())) {
				ctx.mode = "object";
				return;
			}
			const parent = stack[stack.length - 2];
			const parentRef = indexStack[indexStack.length - 1];
			const replacement = {};
			for (let i = 0; i < current().length; i++) {
				const item = current()[i];
				if (item !== undefined) replacement[`${item}`] = true;
			}
			if (parent) parent[parentRef.key ?? parentRef.index] = replacement;
			stack[stack.length - 1] = replacement;
			ctx.mode = "object";
		};
		const commit = (atom, forcedKey = undefined) => {
			const container = current();
			const targetKey = forcedKey !== undefined ? forcedKey : key;
			if (targetKey !== undefined) {
				promoteCurrentToObject();
				current()[targetKey] = atom;
				return;
			}
			if (currentContext().mode === "object") {
				if (atom !== undefined) current()[`${atom}`] = true;
				return;
			}
			if (Array.isArray(container)) container.push(atom);
			else container[index] = atom;
		};
		while (cursor < source.length) {
			if (rawStart >= 0) {
				const quote = source.indexOf('"', cursor);
				if (quote < 0) {
					const raw = HashFormat.DecodeComponent(
						source.substring(rawStart).replaceAll('\\"', '"'),
					);
					if (raw !== "") commit(raw);
					break;
				}
				if (source[quote - 1] === "\\") {
					cursor = quote + 1;
					continue;
				}
				const raw = HashFormat.DecodeComponent(
					source.substring(rawStart, quote).replaceAll('\\"', '"'),
				);
				if (raw !== "") commit(raw);
				rawStart = -1;
				cursor = quote + 1;
				continue;
			}
			const [sepIndex, sep] = HashFormat.NextSeparator(source, cursor);
			const end = sepIndex === null ? source.length : sepIndex;
			const token = source.substring(cursor, end).trim();
			if (sep === "=") {
				const nextKey = RecordFormat.SanitizeKey(
					HashFormat.DecodeComponent(token),
					undefined,
					"browser.hash",
				);
				key = nextKey;
				keyBlocked = nextKey === undefined;
				if (nextKey !== undefined) promoteCurrentToObject();
				cursor = sepIndex + 1;
				continue;
			}
			if (!keyBlocked && token !== "") {
				if (currentContext().mode === "object" && key === undefined) {
					const nextKey = RecordFormat.SanitizeKey(
						HashFormat.DecodeComponent(token),
						undefined,
						"browser.hash",
					);
					if (nextKey !== undefined) commit(true, nextKey);
				} else {
					const atom = HashFormat.ParseAtom(token);
					if (atom !== "") commit(atom);
				}
			}
			if (sep === ",") {
				key = undefined;
				keyBlocked = false;
				if (currentContext().mode === "array") index += 1;
				cursor = sepIndex + 1;
				continue;
			}
			if (sep === '"') {
				rawStart = sepIndex + 1;
				cursor = rawStart;
				continue;
			}
			if (sep === "(") {
				if (keyBlocked) {
					cursor = sepIndex + 1;
					continue;
				}
				const nested = [];
				commit(nested);
				stack.push(nested);
				indexStack.push({ key, index, mode: "array" });
				key = undefined;
				keyBlocked = false;
				index = 0;
				cursor = sepIndex + 1;
				continue;
			}
			if (sep === ")") {
				if (stack.length > 1) {
					stack.pop();
					const previous = indexStack.pop();
					key = previous?.key;
					index = previous?.index ?? 0;
				}
				cursor = sepIndex + 1;
				continue;
			}
			break;
		}
		const result =
			stack[0][0] !== undefined && stack[0].length === 1
				? stack[0][0]
				: stack[0];
		if (Array.isArray(result) || isObject(result)) return result;
		if (result === undefined) return {};
		return { 0: result };
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

class QueryFormat extends RecordFormat {
	constructor(serializer, warn) {
		super("browser.query", serializer, warn);
	}

	source(win) {
		return win.location.search;
	}

	decodeText(value) {
		const text = RecordFormat.SanitizeText(value, this.warn, this.scope);
		const normalized = text.replace(/^\?/, "");
		const i = normalized.indexOf("#");
		if (i >= 0) {
			const pruned = normalized.slice(0, i);
			RecordFormat.WarnIssue(
				this.warn,
				this.scope,
				"query hash fragment pruned",
				{
					value: normalized,
					sanitized: pruned,
				},
			);
			return pruned;
		}
		return normalized;
	}

	encodeText(value) {
		return this.decodeText(value);
	}
}

function isArrayLikeRecord(value) {
	if (!isObject(value)) return false;
	const keys = Object.keys(value);
	if (!keys.length) return false;
	for (let i = 0; i < keys.length; i++) {
		if (keys[i] !== `${i}`) return false;
	}
	return true;
}

function normalizeHashValue(value) {
	if (Array.isArray(value)) {
		const res = new Array(value.length);
		for (let i = 0; i < value.length; i++)
			res[i] = normalizeHashValue(value[i]);
		return res;
	}
	if (isArrayLikeRecord(value)) {
		const keys = Object.keys(value);
		const res = new Array(keys.length);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			res[i] = normalizeHashValue(value[key]);
		}
		return res;
	}
	if (isObject(value)) {
		const res = {};
		const keys = Object.keys(value);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			res[key] = normalizeHashValue(value[key]);
		}
		return res;
	}
	return value;
}

function parseRecord(value) {
	return RecordFormat.SanitizeRecord(value, undefined, "browser.record");
}

function formatRecord(value) {
	return RecordFormat.SanitizeRecord(value, undefined, "browser.record");
}

function parseHash(value) {
	const parsed = HashFormat.ParseHash(`${value || ""}`.replace(/^#/, ""));
	return normalizeHashValue(parsed);
}

function formatHash(value) {
	return HashFormat.FormatHash(normalizeHashValue(value));
}

function parseQuery(value) {
	const text = `${value || ""}`.replace(/^[?#]/, "");
	const i = text.indexOf("#");
	const parsed = HashFormat.ParseHash(i >= 0 ? text.slice(0, i) : text);
	return normalizeHashValue(parsed);
}

function formatQuery(value) {
	return HashFormat.FormatHash(normalizeHashValue(value));
}

const record = {
	parse: parseRecord,
	format: formatRecord,
};

const hash = {
	parse: parseHash,
	format: formatHash,
};

const query = {
	parse: parseQuery,
	format: formatQuery,
};

const RE_INTERNAL_REFERENCE = /^@([^.?#:]+)(?:\.(.+))?$/;
const RE_REQUEST_REFERENCE = /^([A-Z]+):([^?#]*)(\?[^#]*)?(?:#(.*))?$/;

const JSONSerializer = {
	parse(value) {
		return JSON.parse(value);
	},
	format(value) {
		return JSON.stringify(sanitize(value));
	},
};

class LocationValueCell extends Cell {
	constructor(value, options = {}) {
		super(value);
		this.mode = options.mode === "push" ? "push" : "replace";
		this.merge = options.merge || false;
		this._valueNormalizer = options.normalize;
		this.writer = options.writer;
	}

	static NormalizePathArg(path) {
		return pathify(path, Nothing);
	}

	static IsForcedWrite(options) {
		return (
			options === true ||
			!!(
				options &&
				typeof options === "object" &&
				!Array.isArray(options) &&
				options.force
			)
		);
	}

	static HistoryMode(options, dflt = "replace") {
		if (options && typeof options === "object" && !Array.isArray(options)) {
			return options.mode === "push" ? "push" : dflt;
		}
		return dflt;
	}

	static MergeAtPath(scope, p, value) {
		if (!p || p.length === 0) return value;
		if (p.length === 1 && isObject(scope) && isObject(value)) {
			return sanitize({ ...scope, ...value });
		}
		return sanitize(reassign(scope, p, value));
	}

	set(value, p = Nothing, options = false) {
		const resolvedPath = LocationValueCell.NormalizePathArg(p);
		const force = LocationValueCell.IsForcedWrite(options);
		let next = this.merge
			? LocationValueCell.MergeAtPath(this.value, resolvedPath, value)
			: resolvedPath
				? sanitize(reassign(this.value, resolvedPath, value))
				: value;
		if (this._valueNormalizer) next = this._valueNormalizer(next);
		if (!force && eq(this.value, next)) return this;
		this._update(
			resolvedPath ? access(next, resolvedPath) : next,
			resolvedPath,
			force,
		);
		if (this.writer) {
			this.writer(this.value, {
				mode: LocationValueCell.HistoryMode(options, this.mode),
				path: resolvedPath,
			});
		}
		return this;
	}

	sync(value) {
		if (this._valueNormalizer) value = this._valueNormalizer(value);
		this._update(value, Nothing, false);
		return this;
	}
}

class LocationState {
	constructor(options = {}) {
		this.win = LocationState.GetWindow();
		this.hasWindow = !!this.win?.location;
		this.hasHistory = !!(
			this.hasWindow &&
			this.win.history &&
			typeof this.win.history.replaceState === "function"
		);
		this.warn =
			typeof options.warn === "function"
				? options.warn
				: (scope, error, details = {}) =>
						log.warn(
							`${scope}: ${error?.message || "browser warning"}, details`,
							{
								error,
								...details,
							},
						);
		this.mode = options.mode === "push" ? "push" : "replace";
		const querySerializer =
			options.query &&
			typeof options.query.parse === "function" &&
			typeof options.query.format === "function"
				? options.query
				: query;
		const hashSerializer =
			options.hash &&
			typeof options.hash.parse === "function" &&
			typeof options.hash.format === "function"
				? options.hash
				: hash;
		this.pathFormat = new PathFormat(this.warn);
		this.queryFormat = new QueryFormat(querySerializer, this.warn);
		this.hashFormat = new HashFormat(hashSerializer, this.warn);

		this.path = new LocationValueCell(
			this.pathFormat.read(
				this.hasWindow ? this.win : undefined,
				options.path || "/",
			),
			{
				mode: this.mode,
				normalize: (value) => this.pathFormat.parse(value),
				writer: (_value, settings) => this.writeURL(settings.mode),
			},
		);
		this.query = new LocationValueCell(
			this.queryFormat.read(this.hasWindow ? this.win : undefined, {}),
			{
				mode: this.mode,
				merge: true,
				normalize: (value) => this.queryFormat.sanitizeRecord(value),
				writer: (_value, settings) => this.writeURL(settings.mode),
			},
		);
		this.hash = new LocationValueCell(
			this.hashFormat.read(this.hasWindow ? this.win : undefined, {}),
			{
				mode: this.mode,
				merge: true,
				normalize: (value) => this.hashFormat.sanitizeRecord(value),
				writer: (_value, settings) => this.writeURL(settings.mode),
			},
		);

		this.bind();
	}

	static GetWindow() {
		return typeof globalThis !== "undefined" && globalThis.window
			? globalThis.window
			: undefined;
	}

	safeParse(scope, serializer, text, fallback) {
		try {
			return serializer.parse(text);
		} catch (error) {
			this.warn(scope, error, { text });
			return fallback;
		}
	}

	formatURL(pathValue, queryValue, hashValue) {
		const p = this.pathFormat.format(pathValue);
		const search = this.queryFormat.format(queryValue);
		const hash = this.hashFormat.format(hashValue);
		return `${p}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
	}

	writeURL(mode = this.mode) {
		if (!this.hasHistory) return;
		const url = this.formatURL(
			this.path.value,
			this.query.value,
			this.hash.value,
		);
		if (mode === "push" && typeof this.win.history.pushState === "function") {
			this.win.history.pushState(null, "", url);
		} else {
			this.win.history.replaceState(null, "", url);
		}
	}

	syncFromLocation() {
		const nextPath = this.pathFormat.read(
			this.hasWindow ? this.win : undefined,
			this.path.value,
		);
		const nextQuery = this.queryFormat.read(
			this.hasWindow ? this.win : undefined,
			this.query.value || {},
		);
		const nextHash = this.hashFormat.read(
			this.hasWindow ? this.win : undefined,
			this.hash.value || {},
		);
		if (!eq(this.path.value, nextPath)) this.path.sync(nextPath);
		if (!eq(this.query.value, nextQuery)) this.query.sync(nextQuery);
		if (!eq(this.hash.value, nextHash)) this.hash.sync(nextHash);
	}

	bind() {
		if (!this.hasWindow || typeof this.win.addEventListener !== "function")
			return;
		this.win.addEventListener("popstate", () => this.syncFromLocation());
		this.win.addEventListener("hashchange", () => {
			const nextHash = this.hashFormat.read(this.win, this.hash.value || {});
			if (!eq(this.hash.value, nextHash)) this.hash.sync(nextHash);
		});
	}
}

class LocalStorageCell extends Cell {
	constructor(key, value, options = {}) {
		const normalizer =
			typeof options.normalizer === "function" ? options.normalizer : undefined;
		const initial = normalizer ? normalizer(value) : value;
		super(initial);
		this.key = key;
		this.merge = options.merge || false;
		this.writer = options.writer;
		if (normalizer) {
			this.normalize(normalizer);
		}
	}

	set(value, p = Nothing, options = false) {
		const resolvedPath = LocationValueCell.NormalizePathArg(p);
		const force = LocationValueCell.IsForcedWrite(options);
		const next = this.merge
			? LocationValueCell.MergeAtPath(this.value, resolvedPath, value)
			: resolvedPath
				? sanitize(reassign(this.value, resolvedPath, value))
				: value;
		if (!force && eq(this.value, next)) return this;
		this._update(
			resolvedPath ? access(next, resolvedPath) : next,
			resolvedPath,
			force,
		);
		if (this.writer) this.writer(this.value, { path: resolvedPath });
		return this;
	}

	sync(value) {
		this._update(value, Nothing, false);
		return this;
	}
}

function looksLikeHashText(value) {
	return (
		value.startsWith("#") ||
		value.includes("=") ||
		value.includes(",") ||
		value.includes("(") ||
		value.includes(")")
	);
}

class Browser {
	constructor(options = {}) {
		this.location = new LocationState(options);
		this.win = this.location.win;
		this.hasWindow = this.location.hasWindow;
		this.hasStorage = !!(this.hasWindow && this.win.localStorage);
		this.localSerializer =
			options.local &&
			typeof options.local.parse === "function" &&
			typeof options.local.format === "function"
				? options.local
				: JSONSerializer;
		this.locals = new Map();
		this.internals = new Map();
		this.path = this.location.path;
		this.query = this.location.query;
		this.hash = this.location.hash;

		this.local = this.local.bind(this);
		this.internal = this.internal.bind(this);
		this.parse = this.parse.bind(this);
		this.fetch = this.fetch.bind(this);

		this.bind();
	}

	bind() {
		if (!this.hasWindow || typeof this.win.addEventListener !== "function")
			return;
		this.win.addEventListener("storage", (event) => {
			if (!event.key || !this.locals.has(event.key)) return;
			const entry = this.locals.get(event.key);
			const fallback = entry.defaultValue;
			const next =
				event.newValue === null
					? fallback
					: this.location.safeParse(
							`browser.local:${event.key}`,
							entry.serializer,
							event.newValue,
							entry.cell.value ?? fallback,
						);
			if (!eq(entry.cell.value, next)) entry.cell.sync(next);
		});
	}

	writeLocal(key, value, serializer) {
		if (!this.hasStorage) return;
		if (value === undefined) {
			this.win.localStorage.removeItem(key);
			return;
		}
		const formatted = serializer.format(value);
		if (formatted === undefined) this.win.localStorage.removeItem(key);
		else this.win.localStorage.setItem(key, formatted);
	}

	local(key, dflt, normalizer = undefined, opts = {}) {
		if (this.locals.has(key)) return this.locals.get(key).cell;
		const normalized =
			typeof normalizer === "function"
				? normalizer
				: typeof opts === "function"
					? opts
					: undefined;
		const serializerOptions =
			normalizer &&
			typeof normalizer === "object" &&
			typeof normalizer.parse === "function" &&
			typeof normalizer.format === "function"
				? normalizer
				: opts &&
						typeof opts === "object" &&
						typeof opts.parse === "function" &&
						typeof opts.format === "function"
					? opts
					: {};
		const serializer =
			serializerOptions &&
			typeof serializerOptions.parse === "function" &&
			typeof serializerOptions.format === "function"
				? serializerOptions
				: this.localSerializer;
		const loaded = this.hasStorage
			? (() => {
					const raw = this.win.localStorage.getItem(key);
					return raw === null
						? dflt
						: this.location.safeParse(
								`browser.local:${key}`,
								serializer,
								raw,
								dflt,
							);
				})()
			: dflt;
		const normalizedDefault = normalized ? normalized(dflt) : dflt;
		const cell = new LocalStorageCell(key, loaded, {
			merge: true,
			normalizer: normalized,
			writer: (value) => this.writeLocal(key, value, serializer),
		});
		this.locals.set(key, { cell, defaultValue: normalizedDefault, serializer });
		if (
			this.hasStorage &&
			((this.win.localStorage.getItem(key) === null &&
				normalizedDefault !== undefined) ||
				!eq(loaded, cell.value))
		) {
			this.writeLocal(key, cell.value, serializer);
		}
		return cell;
	}

	internal(name, value) {
		if (this.internals.has(name)) return this.internals.get(name);
		const cell = new Cell(value);
		this.internals.set(name, cell);
		return cell;
	}

	parse(value) {
		if (typeof value !== "string") return value;
		const internalMatch = RE_INTERNAL_REFERENCE.exec(value);
		if (internalMatch) {
			const cell = this.internal(internalMatch[1]);
			const path = internalMatch[2]?.split(".").filter(Boolean);
			return path?.length ? cell.select(path) : cell;
		}
		return looksLikeHashText(value) ? hash.parse(value) : value;
	}

	parseRequest(value) {
		if (typeof value !== "string") return null;
		const match = RE_REQUEST_REFERENCE.exec(value);
		if (!match) return null;
		const [, method, path, rawQuery, rawData] = match;
		return {
			method,
			url: `${path || ""}${rawQuery || ""}`,
			body: rawData !== undefined ? hash.parse(rawData) : undefined,
		};
	}

	parseResponse(response) {
		const contentType = `${response.headers.get("content-type") || ""}`
			.toLowerCase()
			.split(";")[0]
			.trim();
		if (contentType === "application/json" || contentType.endsWith("+json")) {
			return response.json();
		}
		if (
			contentType.startsWith("text/") ||
			contentType === "application/xml" ||
			contentType === "application/javascript" ||
			contentType === "application/xhtml+xml" ||
			contentType === "image/svg+xml"
		) {
			return response.text();
		}
		return response.blob();
	}

	async fetch(input, options = undefined) {
		const request = this.parseRequest(input);
		const fetcher =
			typeof globalThis.fetch === "function" ? globalThis.fetch : undefined;
		if (!fetcher) {
			throw new Error("browser.fetch: fetch is not available");
		}
		if (!request) {
			const response = await fetcher(input, options);
			return this.parseResponse(response);
		}
		const headers = new Headers(options?.headers || undefined);
		const init = {
			...options,
			method: request.method,
			headers,
		};
		if (request.body !== undefined) {
			if (!headers.has("content-type")) {
				headers.set("content-type", "application/json");
			}
			init.body = JSON.stringify(sanitize(request.body));
		}
		const response = await fetcher(request.url, init);
		return this.parseResponse(response);
	}
}

function browser(options = {}) {
	return browser.SINGLETON ?? (browser.SINGLETON = new Browser(options));
}

export { Browser, browser, hash, query, record };
export default browser;

// EOF
