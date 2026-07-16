// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-07-17

// Module: select/browser
// Browser-backed reactive state for URL and local storage. The browser API
// exposes `ref(value)` for reactive references, `val(value)` for plain value
// coercion, `parse(value)` as the compatibility dispatcher combining both,
// `routes(map)` to bind path/hash route handlers from `select/routing`, and
// in-memory messaging via `pub`/`sub` events and `put`/`get`/`send`/`receive`
// channels.

import { Cell, cell } from "./cells.js";
import { routed } from "./routing.js";
import {
	HashFormat,
	hash,
	looksLikeHashText,
	query,
	RecordFormat,
} from "./utils/hashfmt.js";
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

const log = logger("select.browser");
const OPTIONS_SINGLETON = "OPTIONS";
const OPTION_SOURCES = new Map();

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
const RE_VALUE_REFERENCE = /^([@?#*])([^.?#*:]+)(?:\.(.+))?$/;
const RE_REQUEST_REFERENCE = /^([A-Z]+):([^?#]*)(\?[^#]*)?(?:#(.*))?$/;

const JSONSerializer = {
	parse(value) {
		return JSON.parse(value);
	},
	format(value) {
		return JSON.stringify(sanitize(value));
	},
};

function parseHTMLResponse(text) {
	const doc = globalThis.document;
	if (!doc?.createElement) {
		return text;
	}
	const template = doc.createElement("template");
	template.innerHTML = text;
	const content = template.content;
	return content.childNodes.length === 1
		? content.removeChild(content.firstChild)
		: content;
}

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
				normalize: (value) =>
					Array.isArray(value) ? value : this.hashFormat.sanitizeRecord(value),
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

function isOptionSource(value) {
	return typeof value === "string" && value.length > 0;
}

function isEmptyOptionValue(value) {
	if (value === undefined || value === null) return true;
	if (Array.isArray(value)) return value.length === 0;
	return isObject(value) ? Object.keys(value).length === 0 : false;
}

function defineGlobalOptionSource(source, preset = undefined) {
	const existing = Object.getOwnPropertyDescriptor(globalThis, source);
	let raw = existing
		? existing.get
			? existing.get.call(globalThis)
			: existing.value
		: preset;
	if (raw === undefined) {
		raw = preset;
	}
	if (raw === undefined) {
		raw = {};
	}
	const cell = new LocalStorageCell(source, raw, {
		merge: true,
		normalizer: sanitize,
		writer: (value) => {
			raw = value;
		},
	});
	const store = {
		source,
		cell,
		get value() {
			return raw;
		},
		sync(next) {
			raw = next === undefined ? {} : next;
			if (!eq(cell.value, raw)) {
				cell.sync(raw);
			}
		},
		install() {
			try {
				Object.defineProperty(globalThis, source, {
					configurable: true,
					enumerable: true,
					get() {
						return raw;
					},
					set(next) {
						store.sync(next);
					},
				});
			} catch (error) {
				log.warn("select.browser: failed to install global options source", {
					source,
					error,
				});
			}
		},
	};
	store.install();
	cell.sync(raw);
	return store;
}

function getGlobalOptionSource(source = OPTIONS_SINGLETON, preset = undefined) {
	const key = isOptionSource(source) ? source : OPTIONS_SINGLETON;
	let store = OPTION_SOURCES.get(key);
	if (!store) {
		store = defineGlobalOptionSource(key, preset);
		OPTION_SOURCES.set(key, store);
	} else {
		store.install();
		if (preset !== undefined && isEmptyOptionValue(store.cell.value)) {
			store.sync(sanitize(preset));
		}
	}
	return store;
}

// Function: selectable
// Wraps a cell into a callable function that doubles as a key-based selector.
// When called with no arguments, returns the underlying cell.
// When called with a key (and optional subpath), returns `cell.select(...)`.
// All property access and methods are forwarded to the cell via Proxy.
function selectable(target, methods = {}) {
	const getCell = typeof target === "function" ? target : () => target;
	const fn = (key, path) => {
		const cell = getCell();
		if (!cell || key === undefined || key === null) return cell;
		const keyPath = Array.isArray(key) ? key : [key];
		if (path === undefined) return cell.select(keyPath);
		const extraPath = Array.isArray(path) ? path : `${path}`.split(".");
		return cell.select([...keyPath, ...extraPath]);
	};
	Object.assign(fn, methods);
	return new Proxy(fn, {
		get(_, p) {
			if (p in fn) return fn[p];
			const cell = getCell();
			if (!cell) return undefined;
			const v = Reflect.get(cell, p);
			return typeof v === "function" ? v.bind(cell) : v;
		},
		set(_, p, v) {
			const cell = getCell();
			return cell ? Reflect.set(cell, p, v) : false;
		},
		has(_, p) {
			const cell = getCell();
			return p in fn || (!!cell && p in cell);
		},
	});
}

// Function: hashRoutePath
// Extracts the path-like string used for hash routing from a hash cell `value`.
// Prefer `value.path` (hashformat bare-first-token semantics); fall back to a
// string value, otherwise `"/"`.
function hashRoutePath(value) {
	if (typeof value === "string") return value || "/";
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const p = value.path;
		if (p === undefined || p === null || p === "") return "/";
		return `${p}`;
	}
	return "/";
}

// ----------------------------------------------------------------------------
//
// MESSAGING
//
// ----------------------------------------------------------------------------

function eventQueueSize(queue) {
	if (queue === true) return 1;
	if (typeof queue === "number" && queue >= 1) return Math.floor(queue);
	return 0;
}

function isExpired(expiresAt, now = Date.now()) {
	return expiresAt !== undefined && expiresAt <= now;
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
// - `events`: Map - in-memory event topics for pub/sub
// - `channels`: Map - in-memory channel queues for put/get/send/receive
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
		this.events = new Map();
		this.channels = new Map();
		this._optionSource = undefined;
		this._optionStore = undefined;
		this.path = this.location.path;
		this.query = selectable(this.location.query);
		this.hash = selectable(this.location.hash);
		this.option = selectable(() => this._optionStore?.cell, {
			source: (source, preset = undefined) => {
				this.setOptionSource(source, preset);
				return this.option;
			},
		});
		const optionSource = isOptionSource(options.options)
			? options.options
			: OPTIONS_SINGLETON;
		const optionPreset = isOptionSource(options.options)
			? undefined
			: options.options;
		this.setOptionSource(optionSource, optionPreset);

		this.local = this.local.bind(this);
		this.internal = this.internal.bind(this);
		this.ref = this.ref.bind(this);
		this.val = this.val.bind(this);
		this.parse = this.parse.bind(this);
		this.fetch = this.fetch.bind(this);
		this.routes = this.routes.bind(this);
		this.pub = this.pub.bind(this);
		this.sub = this.sub.bind(this);
		this.put = this.put.bind(this);
		this.get = this.get.bind(this);
		this.send = this.send.bind(this);
		this.receive = this.receive.bind(this);

		this.bind();
	}

	setOptionSource(source = OPTIONS_SINGLETON, preset = undefined) {
		const nextSource = isOptionSource(source) ? source : OPTIONS_SINGLETON;
		const nextPreset =
			isObject(preset) || Array.isArray(preset) ? sanitize(preset) : preset;
		this._optionStore = getGlobalOptionSource(nextSource, nextPreset);
		this._optionSource = nextSource;
		return this.option;
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

	eventTopic(eventName) {
		let topic = this.events.get(eventName);
		if (!topic) {
			topic = {
				subs: [],
				last: undefined,
				hasLast: false,
				maxQueue: 0,
				history: undefined,
			};
			this.events.set(eventName, topic);
		}
		return topic;
	}

	channel(channelName) {
		let entry = this.channels.get(channelName);
		if (!entry) {
			entry = { queue: [], waiters: [] };
			this.channels.set(channelName, entry);
		}
		return entry;
	}

	pruneChannel(channelName, entry) {
		if (entry.queue.length === 0 && entry.waiters.length === 0) {
			this.channels.delete(channelName);
		}
	}

	takeChannelItem(item) {
		if (item.timer) clearTimeout(item.timer);
		if (item.resolve) item.resolve(item.value);
		return item.value;
	}

	// Method: pub
	// Publishes `value` on `eventName` to all current subscribers. When
	// `queue` is `true`, retains the last event; when `queue` is a number,
	// retains the last N events for late `sub(..., true)` joiners.
	//
	// Example:
	// ```javascript
	// state.pub("toast", "Saved", true)
	// ```
	pub(eventName, value, queue = undefined) {
		const topic = this.eventTopic(eventName);
		const maxQueue = eventQueueSize(queue);
		if (maxQueue > 0) {
			topic.maxQueue = Math.max(topic.maxQueue, maxQueue);
			if (!topic.history) topic.history = [];
			topic.history.push(value);
			while (topic.history.length > topic.maxQueue) topic.history.shift();
			topic.last = value;
			topic.hasLast = true;
		}
		const subs = topic.subs;
		for (let i = 0; i < subs.length; i++) {
			subs[i](value, eventName);
		}
		return this;
	}

	// Method: sub
	// Subscribes `handler` to `eventName`. Handler receives `(value, eventName)`.
	// When `trigger` is true, immediately invokes with the last retained event
	// if any. Returns an idempotent unsubscriber.
	//
	// Example:
	// ```javascript
	// const off = state.sub("toast", (msg) => show(msg), true)
	// off()
	// ```
	sub(eventName, handler, trigger = false) {
		const topic = this.eventTopic(eventName);
		topic.subs.push(handler);
		if (trigger && topic.hasLast) {
			handler(topic.last, eventName);
		}
		let active = true;
		return () => {
			if (!active) return false;
			active = false;
			const i = topic.subs.indexOf(handler);
			if (i >= 0) topic.subs.splice(i, 1);
			if (topic.subs.length === 0 && !topic.maxQueue) {
				this.events.delete(eventName);
			}
			return true;
		};
	}

	// Method: put
	// Enqueues `value` on `channelName`. Optional `ttl` (ms) expires the value.
	// If a pending `receive` waiter exists, delivers immediately.
	//
	// Example:
	// ```javascript
	// state.put("jobs", { id: 1 }, 5000)
	// ```
	put(channelName, value, ttl = undefined) {
		const entry = this.channel(channelName);
		const expiresAt =
			typeof ttl === "number" && ttl >= 0 ? Date.now() + ttl : undefined;
		if (entry.waiters.length > 0) {
			const waiter = entry.waiters.shift();
			if (waiter.timer) clearTimeout(waiter.timer);
			waiter.resolve(value);
			this.pruneChannel(channelName, entry);
			return this;
		}
		entry.queue.push({ value, expiresAt });
		return this;
	}

	// Method: get
	// Dequeues one non-expired value from `channelName`, or returns `undefined`
	// when empty. Non-blocking.
	//
	// Example:
	// ```javascript
	// const job = state.get("jobs")
	// ```
	get(channelName) {
		const entry = this.channels.get(channelName);
		if (!entry) return undefined;
		const now = Date.now();
		while (entry.queue.length > 0) {
			const item = entry.queue.shift();
			if (isExpired(item.expiresAt, now)) {
				if (item.timer) clearTimeout(item.timer);
				if (item.reject) {
					item.reject(new Error("browser.send: expired"));
				}
				continue;
			}
			const value = this.takeChannelItem(item);
			this.pruneChannel(channelName, entry);
			return value;
		}
		this.pruneChannel(channelName, entry);
		return undefined;
	}

	// Method: send
	// Like `put`, but returns a Promise that resolves with `value` when it is
	// consumed by `get` or `receive`. Rejects on `timeout` (ms) if provided.
	//
	// Example:
	// ```javascript
	// await state.send("jobs", { id: 2 }, 1000)
	// ```
	send(channelName, value, timeout = undefined) {
		const entry = this.channel(channelName);
		if (entry.waiters.length > 0) {
			const waiter = entry.waiters.shift();
			if (waiter.timer) clearTimeout(waiter.timer);
			waiter.resolve(value);
			this.pruneChannel(channelName, entry);
			return Promise.resolve(value);
		}
		return new Promise((resolve, reject) => {
			const item = {
				value,
				expiresAt: undefined,
				resolve,
				reject,
			};
			if (typeof timeout === "number" && timeout >= 0) {
				item.timer = setTimeout(() => {
					const i = entry.queue.indexOf(item);
					if (i >= 0) entry.queue.splice(i, 1);
					this.pruneChannel(channelName, entry);
					reject(new Error("browser.send: timeout"));
				}, timeout);
			}
			entry.queue.push(item);
		});
	}

	// Method: receive
	// Like `get`, but returns a Promise that waits until a value is available.
	// Rejects on `timeout` (ms) if provided.
	//
	// Example:
	// ```javascript
	// const job = await state.receive("jobs", 1000)
	// ```
	receive(channelName, timeout = undefined) {
		const entry = this.channels.get(channelName);
		if (entry && entry.queue.length > 0) {
			const now = Date.now();
			while (entry.queue.length > 0) {
				const item = entry.queue.shift();
				if (isExpired(item.expiresAt, now)) {
					if (item.timer) clearTimeout(item.timer);
					if (item.reject) {
						item.reject(new Error("browser.send: expired"));
					}
					continue;
				}
				const value = this.takeChannelItem(item);
				this.pruneChannel(channelName, entry);
				return Promise.resolve(value);
			}
			this.pruneChannel(channelName, entry);
		}
		const channel = this.channel(channelName);
		return new Promise((resolve, reject) => {
			const waiter = { resolve, reject };
			if (typeof timeout === "number" && timeout >= 0) {
				waiter.timer = setTimeout(() => {
					const i = channel.waiters.indexOf(waiter);
					if (i >= 0) channel.waiters.splice(i, 1);
					this.pruneChannel(channelName, channel);
					reject(new Error("browser.receive: timeout"));
				}, timeout);
			}
			channel.waiters.push(waiter);
		});
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
			if (type === "@" || type === "#" || type === "?" || type === "*") {
				const separator = value.indexOf(":");
				if (separator <= 1) return null;
				const name = value.substring(1, separator);
				const path = this.parseReferencePath(value.substring(separator + 1));
				const root =
					type === "@"
						? this.internal(name)
						: type === "#"
							? this.hash.select([name])
							: type === "?"
								? this.query.select([name])
								: this.option(name);
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
		if (type === "*") {
			return path?.length ? this.option(name, path) : this.option(name);
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
		} else if (contentType === "text/html") {
			res = response.text().then(parseHTMLResponse);
		} else if (contentType === "image/svg+xml") {
			res = response
				.text()
				.then(
					(text) =>
						new DOMParser().parseFromString(text, "image/svg+xml")
							.documentElement,
				);
		} else if (
			contentType.startsWith("text/") ||
			contentType === "application/xml" ||
			contentType === "application/javascript" ||
			contentType === "application/xhtml+xml"
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

	// Method: routes
	// Registers route handlers and binds them to browser location state.
	// Keys starting with `#` are hash routes (matched against `hash.path`);
	// all other keys are path routes (matched against `path`).
	//
	// Dispatches once immediately with the current values, then on every
	// subsequent change. Returns an idempotent cleanup function with helpers:
	// - `path` / `hash`: `routed()` dispatchers (or `null` when unused)
	// - `router`: path router if present, else hash router
	// - `match(p)` / `run(p, ...args)`: prefer the path router
	//
	// Example:
	// ```javascript
	// const stop = state.routes({
	//   "/": home,
	//   "/users/{id:number}": (_p, { id }) => showUser(id),
	//   "#settings": openSettings,
	//   "#profile/{tab}": (_p, { tab }) => openProfile(tab),
	// })
	// stop() // unsubscribe
	// ```
	routes(routeMap = {}) {
		const pathRoutes = {};
		const hashRoutes = {};
		const entries = Object.entries(routeMap || {});
		for (let i = 0; i < entries.length; i++) {
			const [expr, handler] = entries[i];
			if (typeof expr === "string" && expr.startsWith("#")) {
				hashRoutes[expr.slice(1)] = handler;
			} else {
				pathRoutes[expr] = handler;
			}
		}
		const pathR = Object.keys(pathRoutes).length ? routed(pathRoutes) : null;
		const hashR = Object.keys(hashRoutes).length ? routed(hashRoutes) : null;
		const cleanups = [];
		if (pathR) {
			pathR(this.path.value);
			cleanups.push(this.path.effect((p) => pathR(p)));
		}
		if (hashR) {
			const read = () => hashRoutePath(this.hash.value);
			hashR(read());
			cleanups.push(this.hash.effect(() => hashR(read())));
		}
		let active = true;
		const cleanup = () => {
			if (!active) return false;
			active = false;
			for (let i = 0; i < cleanups.length; i++) cleanups[i]();
			return true;
		};
		const primary = pathR || hashR;
		return Object.assign(cleanup, {
			path: pathR,
			hash: hashR,
			router: primary?.router,
			match: primary?.match,
			run: (p, ...args) => (primary ? primary(p, ...args) : undefined),
		});
	}

	async fetch(input, options = undefined) {
		const post =
			typeof options === "function"
				? options
				: typeof options?.post === "function"
					? options.post
					: undefined;
		const fetchOptions =
			!options || typeof options === "function"
				? undefined
				: options.post !== undefined
					? { ...options }
					: options;
		if (fetchOptions && fetchOptions.post !== undefined) {
			delete fetchOptions.post;
		}
		const request = this.parseRequest(input);
		const fetcher =
			typeof globalThis.fetch === "function" ? globalThis.fetch : undefined;
		if (!fetcher) {
			throw new Error("browser.fetch: fetch is not available");
		}
		if (!request) {
			const response = await fetcher.call(globalThis, input, fetchOptions);
			if (!response.ok) {
				this.failResponse(response);
			}
			return this.parseResponse(
				response,
				post ? { ...fetchOptions, post } : fetchOptions,
			);
		}
		const headers = new Headers(fetchOptions?.headers || undefined);
		const init = {
			...fetchOptions,
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
		return this.parseResponse(
			response,
			post ? { ...fetchOptions, post } : fetchOptions,
		);
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
