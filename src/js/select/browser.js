// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-02

// Module: select/browser
// Browser-backed reactive state for URL and local storage. The browser API
// exposes `ref(value)` for reactive references, `val(value)` for plain value
// coercion, and `parse(value)` as the compatibility dispatcher combining both.

import { Cell, cell } from "./cells.js";
import {
	access,
	assigned,
	eq,
	isObject,
	logger,
	Nothing,
	path as pathify,
	sanitize,
} from "./utils.js";
import { hash, HashFormat, looksLikeHashText, query, RecordFormat } from "./utils/hashfmt.js";

const log = logger("select.browser");

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

function parseRecord(value) {
	return RecordFormat.SanitizeRecord(value, undefined, "browser.record");
}

function formatRecord(value) {
	return RecordFormat.SanitizeRecord(value, undefined, "browser.record");
}

// Constant: record
// Serializer pair for sanitized record-shaped browser state.
const record = {
	parse: parseRecord,
	format: formatRecord,
};

const RE_NUMBER_TEXT = /^-?(?:\d+|\d+\.\d+)$/;
const RE_VALUE_REFERENCE = /^([@?#])([^.?#:]+)(?:\.(.+))?$/;
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
		return sanitize(assigned(scope, p, value));
	}

	set(value, p = Nothing, options = false) {
		const resolvedPath = LocationValueCell.NormalizePathArg(p);
		const force = LocationValueCell.IsForcedWrite(options);
		let next = this.merge
			? LocationValueCell.MergeAtPath(this.value, resolvedPath, value)
			: resolvedPath
				? sanitize(assigned(this.value, resolvedPath, value))
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
				normalize: (value) => Array.isArray(value) ? value : this.hashFormat.sanitizeRecord(value),
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
				? sanitize(assigned(this.value, resolvedPath, value))
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

// Function: selectable
// Wraps a cell into a callable function that doubles as a key-based selector.
// When called with no arguments, returns the underlying cell.
// When called with a key (and optional subpath), returns `cell.select(...)`.
// All property access and methods are forwarded to the cell via Proxy.
function selectable(cell) {
	const fn = (key, path) => {
		if (key === undefined || key === null) return cell
		const keyPath = Array.isArray(key) ? key : [key]
		if (path === undefined) return cell.select(keyPath)
		const extraPath = Array.isArray(path) ? path : `${path}`.split(".")
		return cell.select([...keyPath, ...extraPath])
	}
	return new Proxy(fn, {
		get(_, p) {
			if (p in fn) return fn[p]
			const v = Reflect.get(cell, p)
			return typeof v === "function" ? v.bind(cell) : v
		},
		set(_, p, v) { return Reflect.set(cell, p, v) },
		has(_, p) { return p in fn || p in cell },
	})
}

// Class: Browser
// Browser-backed state manager for URL, hash, query, and local storage.
//
// `hash` and `query` are callable selectors: `state.hash("key")` returns a
// `Selected` view at that key within the hash value. Call with no args to get
// the underlying cell. `state.path` is a plain cell.
//
// Attributes:
// - `location`: LocationState - shared URL state wrapper
// - `win`: Window? - browser window used for side effects
// - `hasWindow`: boolean - true when `window` is available
// - `hasStorage`: boolean - true when `localStorage` is available
// - `localSerializer`: Object - serializer used for local storage values
// - `locals`: Map - registered local storage cells
// - `internals`: Map - internal named cells
// - `path`: Cell - path state cell
// - `query`: Cell (callable) - query state cell
// - `hash`: Cell (callable) - hash state cell
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
		this.query = selectable(this.location.query);
		this.hash = selectable(this.location.hash);

		this.local = this.local.bind(this);
		this.internal = this.internal.bind(this);
		this.ref = this.ref.bind(this);
		this.val = this.val.bind(this);
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

	parseReferencePath(value) {
		if (!value) return null;
		const rawPath = value.split(".");
		const path = new Array(rawPath.length);
		let n = 0;
		for (let i = 0; i < rawPath.length; i++) {
			const segment = rawPath[i];
			if (!segment) continue;
			path[n++] =
				/^\d+$/.test(segment) && Number.isSafeInteger(Number(segment))
					? Number(segment)
					: segment;
		}
		return n ? path.slice(0, n) : null;
	}

	parseReference(value) {
		if (typeof value === "string" && value.includes(":")) {
			const type = value[0];
			if (type === "@" || type === "#" || type === "?") {
				const separator = value.indexOf(":");
				if (separator <= 1) return null;
				const name = value.substring(1, separator);
				const path = this.parseReferencePath(value.substring(separator + 1));
				const root =
					type === "@"
						? this.internal(name)
						: type === "#"
							? this.hash.select([name])
							: this.query.select([name]);
				return path?.length ? root.select(path) : root;
			}
		}
		const match = RE_VALUE_REFERENCE.exec(value);
		if (!match) return null;
		const [, type, name, rawPath] = match;
		const path = this.parseReferencePath(rawPath);
		if (type === "@") {
			const cell = this.internal(name);
			return path?.length ? cell.select(path) : cell;
		}
		const root = type === "#" ? this.hash : this.query;
		return path?.length ? root.select([name, ...path]) : root.select([name]);
	}

	ref(value) {
		if (typeof value !== "string") return undefined;
		return this.parseReference(value) ?? undefined;
	}

	val(value) {
		if (typeof value !== "string") return value;
		if (value === "true") return true;
		if (value === "false") return false;
		if (RE_NUMBER_TEXT.test(value)) return Number(value);
		return looksLikeHashText(value) ? hash.parse(value) : value;
	}

	parse(value) {
		return this.ref(value) ?? this.val(value);
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

	parseResponse(response, options) {
		const contentType = `${response.headers.get("content-type") || ""}`
			.toLowerCase()
			.split(";")[0]
			.trim();
		let res;
		if (contentType === "application/json" || contentType.endsWith("+json")) {
			res = response.json();
		} else if (
			contentType.startsWith("text/") ||
			contentType === "application/xml" ||
			contentType === "application/javascript" ||
			contentType === "application/xhtml+xml" ||
			contentType === "image/svg+xml"
		) {
			res = response.text();
		} else {
			res = response.blob();
		}
		return options?.post ? res.then(options.post) : res;
	}

	failResponse(response) {
		const error = new Error(
			`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
		);
		error.response = response;
		error.status = response.status;
		throw error;
	}

	fetched(input, options = undefined) {
		return cell(this.fetch(input, options));
	}

	async fetch(input, options = undefined) {
		const request = this.parseRequest(input);
		const fetcher =
			typeof globalThis.fetch === "function" ? globalThis.fetch : undefined;
		if (!fetcher) {
			throw new Error("browser.fetch: fetch is not available");
		}
		if (!request) {
			const response = await fetcher.call(globalThis, input, options);
			if (!response.ok) {
				this.failResponse(response);
			}
			return this.parseResponse(response, options);
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
		const response = await fetcher.call(globalThis, request.url, init);
		if (!response.ok) {
			this.failResponse(response);
		}
		return this.parseResponse(response, options);
	}
}

// Function: browser
// Returns the shared `Browser` singleton, creating it with `options` when
// needed.
function browser(options = {}) {
	const win = typeof globalThis !== "undefined" ? globalThis.window : undefined;
	if (!browser.SINGLETON || browser.SINGLETON.win !== win) {
		browser.SINGLETON = new Browser(options);
	}
	return browser.SINGLETON;
}

export { Browser, browser, hash, query, record };
export default browser;

// EOF
