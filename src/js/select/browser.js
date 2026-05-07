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
	Nothing,
	path as pathify,
	reassign,
	sanitizeValue,
} from "./utils.js";

const logSelectBrowser = (level, scope, message, details = {}) => {
	console[level](`[select.browser] ${scope}: ${message}, details`, details);
};

class RecordFormat {
	static UNSAFE_LOCATION_KEY = /^(?:__proto__|prototype|constructor)$/;

	constructor(scope, serializer, warn) {
		this.scope = scope;
		this.serializer = serializer;
		this.warn = warn;
	}

	static warnIssue(warn, scope, message, details = {}) {
		if (typeof warn === "function") warn(scope, new Error(message), details);
	}

	static sanitizeText(value, warn, scope, details = {}) {
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
			RecordFormat.warnIssue(warn, scope, "control characters pruned", {
				value: text,
				sanitized,
				...details,
			});
		}
		return sanitized;
	}

	static sanitizeKey(key, warn, scope, details = {}) {
		const sanitized = RecordFormat.sanitizeText(key, warn, scope, details);
		if (
			!sanitized ||
			RecordFormat.UNSAFE_LOCATION_KEY.test(sanitized) ||
			sanitized.endsWith("[]")
		) {
			RecordFormat.warnIssue(warn, scope, "unsafe key pruned", {
				key,
				sanitized,
				...details,
			});
			return undefined;
		}
		return sanitized;
	}

	static sanitizeItem(value, warn, scope, details = {}) {
		if (value === undefined) return undefined;
		if (value === null || value === true || value === false) return value;
		if (typeof value === "string")
			return RecordFormat.sanitizeText(value, warn, scope, details);
		if (typeof value === "number") {
			if (Number.isFinite(value)) return value;
			RecordFormat.warnIssue(warn, scope, "non-finite number pruned", {
				value,
				...details,
			});
			return undefined;
		}
		RecordFormat.warnIssue(warn, scope, "unsupported location value pruned", {
			type: typeof value,
			value,
			...details,
		});
		return undefined;
	}

	static sanitizeArray(value, warn, scope, details = {}) {
		const res = [];
		for (let i = 0; i < value.length; i++) {
			const item = RecordFormat.sanitizeItem(value[i], warn, scope, {
				...details,
				index: i,
			});
			if (item !== undefined) res.push(item);
		}
		return res;
	}

	static sanitizeRecord(value, warn, scope) {
		if (!isObject(value)) {
			if (value !== undefined && value !== null) {
				RecordFormat.warnIssue(
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
			const safeKey = RecordFormat.sanitizeKey(key, warn, scope, { key });
			if (safeKey === undefined) continue;
			const item = value[key];
			if (Array.isArray(item)) {
				const safeArray = RecordFormat.sanitizeArray(item, warn, scope, {
					key: safeKey,
				});
				if (safeArray.length) res[safeKey] = safeArray;
			} else {
				const safeValue = RecordFormat.sanitizeItem(item, warn, scope, {
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
		return RecordFormat.sanitizeRecord(value, this.warn, this.scope);
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

	static sanitizeText(value, warn) {
		const text = RecordFormat.sanitizeText(value, warn, "browser.path");
		return text ? (text.startsWith("/") ? text : `/${text}`) : "/";
	}

	parse(value) {
		const text = PathFormat.sanitizeText(value, this.warn);
		const segments = text.split("/");
		for (let i = 0; i < segments.length; i++) {
			try {
				segments[i] = decodeURIComponent(segments[i]);
			} catch (error) {
				RecordFormat.warnIssue(
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
		const text = PathFormat.sanitizeText(value, this.warn);
		const segments = text.split("/");
		for (let i = 0; i < segments.length; i++)
			segments[i] = encodeURIComponent(segments[i]);
		return segments.join("/") || "/";
	}

	read(win, fallback = "/") {
		return win?.location
			? this.parse(win.location.pathname)
			: PathFormat.sanitizeText(fallback, this.warn);
	}
}

class HashFormat extends RecordFormat {
	static RE_HASH_ESCAPE = /[&,()="]/;
	static RE_HASH_NUMBER = /^-?\d+(_?\d+)*(\.\d+)?$/;

	constructor(serializer, warn) {
		super("browser.hash", serializer, warn);
	}

	static decodeComponent(value) {
		if (!value?.includes("%")) return value;
		try {
			return decodeURIComponent(value);
		} catch (_error) {
			return value;
		}
	}

	static formatAtom(value) {
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

	static *iformat(value, depth = 0) {
		if (
			value === undefined ||
			value === null ||
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			yield HashFormat.formatAtom(value);
			return;
		}
		if (depth > 0) yield "(";
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				yield* HashFormat.iformat(value[i], depth + 1);
				if (i < value.length - 1) yield ",";
			}
		} else if (isObject(value)) {
			const keys = Object.keys(value).sort();
			for (let i = 0; i < keys.length; i++) {
				const key = keys[i];
				yield `${key}=`;
				yield* HashFormat.iformat(value[key], depth + 1);
				if (i < keys.length - 1) yield ",";
			}
		}
		if (depth > 0) yield ")";
	}

	static formatHash(value) {
		return [...HashFormat.iformat(value)].join("");
	}

	static nextSeparator(value, offset = 0) {
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

	static parseAtom(value) {
		const decode = HashFormat.decodeComponent(value);
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

	static parseHash(value) {
		const source = RecordFormat.sanitizeText(
			value,
			undefined,
			"browser.hashformat",
		);
		const root = [];
		const stack = [root];
		const indexStack = [{ key: undefined, index: 0 }];
		let key;
		let keyBlocked = false;
		let index = 0;
		let rawStart = -1;
		let cursor = 0;
		const current = () => stack[stack.length - 1];
		const commit = (atom) => {
			const container = current();
			if (key !== undefined) {
				if (Array.isArray(container)) {
					const parent = stack[stack.length - 2];
					const parentRef = indexStack[indexStack.length - 1];
					const replacement = {};
					for (let i = 0; i < container.length; i++)
						replacement[i] = container[i];
					if (parent) parent[parentRef.key ?? parentRef.index] = replacement;
					stack[stack.length - 1] = replacement;
				}
				current()[key] = atom;
				return;
			}
			if (Array.isArray(container)) container.push(atom);
			else container[index] = atom;
		};
		while (cursor < source.length) {
			if (rawStart >= 0) {
				const quote = source.indexOf('"', cursor);
				if (quote < 0) {
					const raw = HashFormat.decodeComponent(
						source.substring(rawStart).replaceAll('\\"', '"'),
					);
					if (raw !== "") commit(raw);
					break;
				}
				if (source[quote - 1] === "\\") {
					cursor = quote + 1;
					continue;
				}
				const raw = HashFormat.decodeComponent(
					source.substring(rawStart, quote).replaceAll('\\"', '"'),
				);
				if (raw !== "") commit(raw);
				rawStart = -1;
				cursor = quote + 1;
				continue;
			}
			const [sepIndex, sep] = HashFormat.nextSeparator(source, cursor);
			const end = sepIndex === null ? source.length : sepIndex;
			const token = source.substring(cursor, end).trim();
			if (sep === "=") {
				const nextKey = RecordFormat.sanitizeKey(
					HashFormat.decodeComponent(token),
					undefined,
					"browser.hash",
				);
				key = nextKey;
				keyBlocked = nextKey === undefined;
				cursor = sepIndex + 1;
				continue;
			}
			if (!keyBlocked && token !== "") {
				const atom = HashFormat.parseAtom(token);
				if (atom !== "") commit(atom);
			}
			if (sep === ",") {
				key = undefined;
				keyBlocked = false;
				index += 1;
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
				indexStack.push({ key, index });
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
		return RecordFormat.sanitizeText(
			`${value || ""}`.replace(/^#/, ""),
			this.warn,
			this.scope,
		);
	}

	encodeText(value) {
		return RecordFormat.sanitizeText(
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
		const text = RecordFormat.sanitizeText(value, this.warn, this.scope);
		const normalized = text.replace(/^\?/, "");
		const i = normalized.indexOf("#");
		if (i >= 0) {
			const pruned = normalized.slice(0, i);
			RecordFormat.warnIssue(
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

const QuerySerializer = {
	parse(value) {
		const parsed = HashFormat.parseHash(`${value || ""}`.replace(/^[?#]/, ""));
		if (isObject(parsed)) return parsed;
		if (Array.isArray(parsed)) return Object.assign({}, parsed);
		return {};
	},
	format(value) {
		return HashFormat.formatHash(
			RecordFormat.sanitizeRecord(value, undefined, "browser.query"),
		);
	},
};

const JSONSerializer = {
	parse(value) {
		return JSON.parse(value);
	},
	format(value) {
		return JSON.stringify(sanitizeValue(value));
	},
};

class LocationValueCell extends Cell {
	constructor(value, options = {}) {
		super(value);
		this.mode = options.mode === "push" ? "push" : "replace";
		this.merge = options.merge || false;
		this.normalize = options.normalize;
		this.writer = options.writer;
	}

	static normalizePathArg(path) {
		return pathify(path, Nothing);
	}

	static isForcedWrite(options) {
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

	static historyMode(options, dflt = "replace") {
		if (options && typeof options === "object" && !Array.isArray(options)) {
			return options.mode === "push" ? "push" : dflt;
		}
		return dflt;
	}

	static mergeAtPath(scope, p, value) {
		if (!p || p.length === 0) return value;
		if (p.length === 1 && isObject(scope) && isObject(value)) {
			return sanitizeValue({ ...scope, ...value });
		}
		return sanitizeValue(reassign(scope, p, value));
	}

	set(value, p = Nothing, options = false) {
		const resolvedPath = LocationValueCell.normalizePathArg(p);
		const force = LocationValueCell.isForcedWrite(options);
		let next = this.merge
			? LocationValueCell.mergeAtPath(this.value, resolvedPath, value)
			: resolvedPath
				? sanitizeValue(reassign(this.value, resolvedPath, value))
				: value;
		if (this.normalize) next = this.normalize(next);
		if (!force && eq(this.value, next)) return this;
		this._update(
			resolvedPath ? access(next, resolvedPath) : next,
			resolvedPath,
			force,
		);
		if (this.writer) {
			this.writer(this.value, {
				mode: LocationValueCell.historyMode(options, this.mode),
				path: resolvedPath,
			});
		}
		return this;
	}

	sync(value) {
		if (this.normalize) value = this.normalize(value);
		this._update(value, Nothing, false);
		return this;
	}
}

class LocationState {
	constructor(options = {}) {
		this.win = LocationState.getWindow();
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
						logSelectBrowser(
							"warn",
							scope,
							error?.message || "browser warning",
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
				: QuerySerializer;
		const hashSerializer =
			options.hash &&
			typeof options.hash.parse === "function" &&
			typeof options.hash.format === "function"
				? options.hash
				: QuerySerializer;
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

	static getWindow() {
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
		super(value);
		this.key = key;
		this.merge = options.merge || false;
		this.writer = options.writer;
	}

	set(value, p = Nothing, options = false) {
		const resolvedPath = LocationValueCell.normalizePathArg(p);
		const force = LocationValueCell.isForcedWrite(options);
		const next = this.merge
			? LocationValueCell.mergeAtPath(this.value, resolvedPath, value)
			: resolvedPath
				? sanitizeValue(reassign(this.value, resolvedPath, value))
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

function browser(options = {}) {
	const location = new LocationState(options);
	const win = location.win;
	const hasWindow = location.hasWindow;
	const hasStorage = !!(hasWindow && win.localStorage);
	const localSerializer =
		options.local &&
		typeof options.local.parse === "function" &&
		typeof options.local.format === "function"
			? options.local
			: JSONSerializer;

	const locals = new Map();
	const writeLocal = (key, value, serializer) => {
		if (!hasStorage) return;
		if (value === undefined) {
			win.localStorage.removeItem(key);
			return;
		}
		const formatted = serializer.format(value);
		if (formatted === undefined) win.localStorage.removeItem(key);
		else win.localStorage.setItem(key, formatted);
	};

	if (hasWindow && typeof win.addEventListener === "function") {
		win.addEventListener("storage", (event) => {
			if (!event.key || !locals.has(event.key)) return;
			const entry = locals.get(event.key);
			const fallback = entry.defaultValue;
			const next =
				event.newValue === null
					? fallback
					: location.safeParse(
							`browser.local:${event.key}`,
							entry.serializer,
							event.newValue,
							entry.cell.value ?? fallback,
						);
			if (!eq(entry.cell.value, next)) entry.cell.sync(next);
		});
	}

	const local = (key, dflt, opts = {}) => {
		if (locals.has(key)) return locals.get(key).cell;
		const serializer =
			opts &&
			typeof opts.parse === "function" &&
			typeof opts.format === "function"
				? opts
				: localSerializer;
		const initial = hasStorage
			? (() => {
					const raw = win.localStorage.getItem(key);
					return raw === null
						? dflt
						: location.safeParse(`browser.local:${key}`, serializer, raw, dflt);
				})()
			: dflt;
		const cell = new LocalStorageCell(key, initial, {
			merge: true,
			writer: (value) => writeLocal(key, value, serializer),
		});
		locals.set(key, { cell, defaultValue: dflt, serializer });
		if (
			hasStorage &&
			win.localStorage.getItem(key) === null &&
			dflt !== undefined
		) {
			writeLocal(key, initial, serializer);
		}
		return cell;
	};

	return {
		path: location.path,
		query: location.query,
		hash: location.hash,
		local,
	};
}

export { browser };
export default browser;

// EOF
