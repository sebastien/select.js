// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: select.extra
// Agnostic utility helpers for class-name composition and DOM interactions.
// This module is intentionally independent from `select.js` and `select.ui.js`.

// ----------------------------------------------------------------------------
//
// SEARCH/FILTER/RESULTS
//
// ----------------------------------------------------------------------------

// --
// Ensures the value is a boolean
function bool(value) {
	if (value == null) return false;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") return value.length > 0;
	// For objects and arrays, they are truthy unless null/undefined
	return true;
}

// --
// Compares two values, with optional extractor
function cmp(a, b, extractorFunc) {
	if (extractorFunc) {
		const ext = extractor(extractorFunc);
		a = ext(a);
		b = ext(b);
	}
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

// --
// Creates a predicate function from predicate or extractor
function predicate(predicateOrExtractor) {
	if (typeof predicateOrExtractor === "function") {
		return predicateOrExtractor;
	} else if (predicateOrExtractor == null) {
		return (v) => bool(v);
	} else {
		const ext = extractor(predicateOrExtractor);
		return (v) => bool(ext(v));
	}
}

// --
// Creates an extractor function from path/key or uses function directly
function extractor(pathOrFunc) {
	if (typeof pathOrFunc === "function") {
		return pathOrFunc;
	} else if (pathOrFunc == null) {
		return (v) => v;
	} else {
		return (v) => get(v, pathOrFunc);
	}
}

// --
// Sorts values by comparing extracted values
function sorted(values, extractorFunc) {
	const arr = list(values);
	if (extractorFunc) {
		const ext = extractor(extractorFunc);
		return arr.slice().sort((a, b) => cmp(ext(a), ext(b)));
	}
	return arr.slice().sort();
}

// --
// Returns unique values based on extractor
function unique(values, extractorFunc) {
	const arr = list(values);
	if (extractorFunc) {
		const ext = extractor(extractorFunc);
		const seen = new Set();
		return arr.filter((v) => {
			const key = ext(v);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}
	return Array.from(new Set(arr));
}

// --
// Filters values based on predicate
function filter(values, predicateOrExtractor) {
	const arr = list(values);
	const pred = predicate(predicateOrExtractor);
	return arr.filter(pred);
}

// --
// Converts value to list (array)
function list(value) {
	if (value == null) return [];
	switch (value?.constructor) {
		case Array:
			return value;
		case Object:
			return Object.values(value);
		case Map:
			return Array.from(value.values());
		case Set:
			return Array.from(value);
		default:
			return [value];
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Classname Composition
//
// ----------------------------------------------------------------------------

function* iclsx(...args) {
	for (const value of args) {
		if (!value) {
			continue;
		}
		switch (value?.constructor) {
			case Array:
				yield* iclsx(...value);
				break;
			case Object:
				for (const key in value) {
					const token = key.trim();
					if (value[key] && token) {
						yield token;
					}
				}
				break;
			case String:
				{
					const token = value.trim();
					if (token.length) {
						yield token;
					}
				}
				break;
			case Number:
				yield `${value}`;
				break;
			case Boolean:
				break;
		}
	}
}

const clsx = (...args) => {
	return [...iclsx(...args)].join(" ");
};

// ----------------------------------------------------------------------------
//
// SECTION: Event Binding
//
// ----------------------------------------------------------------------------

const bind = (node, handlers) => {
	if (handlers) {
		for (const [name, handler] of Object.entries(handlers)) {
			for (const target of Array.isArray(node) ? node : [node]) {
				target.addEventListener(name, handler);
			}
		}
	}
	return node;
};

const unbind = (node, handlers) => {
	if (handlers) {
		for (const [name, handler] of Object.entries(handlers)) {
			for (const target of Array.isArray(node) ? node : [node]) {
				target.removeEventListener(name, handler);
			}
		}
	}
	return node;
};

// ----------------------------------------------------------------------------
//
// SECTION: Dragging
//
// ----------------------------------------------------------------------------

const drag = (event, move, end) => {
	const context = {};
	const dragging = {
		node: event.target,
		ox: event.pageX,
		oy: event.pageY,
		pointerEvents: event.target.style.pointerEvents,
		userSelect: event.target.style.userSelect,
		context,
		isFirst: true,
		isLast: false,
		step: 0,
		dx: 0,
		dy: 0,
	};
	const data = Object.create(dragging);
	const scope = globalThis.window;
	const onEnd = (event) => {
		const mouseEvent = event;
		dragging.node.style.pointerEvents = dragging.pointerEvents;
		dragging.node.style.userSelect = dragging.userSelect;
		unbind(scope, handlers);
		data.dx = mouseEvent.pageX - dragging.ox;
		data.dy = mouseEvent.pageY - dragging.oy;
		data.isLast = true;
		end?.(mouseEvent, data);
	};
	const handlers = {
		mousemove: (event) => {
			const mouseEvent = event;
			data.dx = mouseEvent.pageX - dragging.ox;
			data.dy = mouseEvent.pageY - dragging.oy;
			data.isFirst = dragging.step === 0;
			dragging.step += 1;
			const result = move?.(mouseEvent, data);
			switch (result) {
				case null:
					event.preventDefault();
					event.stopPropagation();
					break;
				case false:
					doEnd();
			}
		},
		mouseup: onEnd,
		mouseleave: onEnd,
	};
	event.target.style.userSelect = "none";
	const doEnd = () => unbind(scope, handlers);
	bind(scope, handlers);
	return doEnd;
};

const target = (node, predicate) => {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		if (predicate(node)) {
			return node;
		}
		node = node.parentNode;
	}
	return undefined;
};

const dragtarget = (node, name) => {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		const element = node;
		if (!name && element.hasAttribute("data-drag")) {
			return element;
		}
		if (name && element.getAttribute("data-drag") === name) {
			return element;
		}
		node = element.parentNode;
	}
	return node?.nodeType === Node.ELEMENT_NODE ? node : undefined;
};

drag.target = dragtarget;

// ----------------------------------------------------------------------------
//
// SECTION: Input Helpers
//
// ----------------------------------------------------------------------------

const autoresize = (event) => {
	const node = event.target;
	node.style.height = "auto";
	const style = globalThis.window.getComputedStyle(node);
	const border =
		parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
	node.style.height = `${border + node.scrollHeight}px`;
};

const Keyboard = {
	Down: "keydown",
	Up: "keyup",
	Press: "press",
	Codes: {
		SPACE: 32,
		TAB: 9,
		ENTER: 13,
		COMMA: 188,
		COLON: 186,
		BACKSPACE: 8,
		INSERT: 45,
		DELETE: 46,
		ESC: 27,
		UP: 38,
		DOWN: 40,
		LEFT: 37,
		RIGHT: 39,
		PAGE_UP: 33,
		PAGE_DOWN: 34,
		HOME: 36,
		END: 35,
		SHIFT: 16,
		ALT: 18,
		CTRL: 17,
		META_L: 91,
		META_R: 92,
	},
	Key(event) {
		return event ? (event.key ?? event.keyIdentifier ?? null) : null;
	},
	Code(event) {
		return event ? (event.keyCode ?? null) : null;
	},
	Char(event) {
		const key = Keyboard.Key(event);
		return !key ? null : key.length === 1 ? key : key === "Enter" ? "\n" : null;
	},
	IsControl(event) {
		const key = Keyboard.Key(event);
		return !!(key && key.length > 1);
	},
	HasModifier(event) {
		return !!(event && (event.altKey || event.ctrlKey));
	},
};

// ----------------------------------------------------------------------------
//
// SECTION: Routing
//
// ----------------------------------------------------------------------------

class RoutePattern {
	constructor(regexp, extractor = undefined) {
		this.regexp = regexp;
		this.extractor = extractor;
	}
}

const pattern = (regexp, extractor = undefined) =>
	new RoutePattern(regexp, extractor);

const ROUTE_PATTERNS = {
	chunk: pattern(/^[^/]+$/),
	number: pattern(/^[0-9]+$/),
	alpha: pattern(/^[A-Za-z]+$/),
	string: pattern(/^[A-Za-z0-9_-]+$/),
};

class RoutePatternSlot {
	constructor(pattern, name, index) {
		this.pattern = pattern;
		this.name = name;
		this.index = index;
	}

	toJSON() {
		return { name: this.name, matches: this.pattern.regexp.source };
	}
}

const splitPath = (value) => {
	if (Array.isArray(value)) {
		return value;
	}
	if (value === undefined || value === null) {
		return [];
	}
	const text = `${value}`;
	if (!text.length) {
		return [];
	}
	const items = text.split("/");
	const res = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item) {
			res.push(item);
		}
	}
	return res;
};

const route = (text) => {
	if (Array.isArray(text)) {
		return text;
	}
	const items = splitPath(text);
	const res = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item.startsWith("{")) {
			if (!item.endsWith("}")) {
				throw new SyntaxError(
					`Route item '${item}' does not end with a brace: ${text}`,
				);
			}
			const parts = item.slice(1, -1).split(":", 2);
			const name = parts[0] || "";
			const type = parts[1];
			const matched =
				type && ROUTE_PATTERNS[type]
					? ROUTE_PATTERNS[type]
					: type
						? new RoutePattern(new RegExp(type))
						: ROUTE_PATTERNS.chunk;
			res.push(new RoutePatternSlot(matched, name, res.length));
		} else {
			res.push(item);
		}
	}
	return res;
};

class RouteHandler {
	constructor(route, value, priority = undefined, captured = null) {
		this.route = route;
		this.value = value;
		this.priority = priority;
		this.captured = captured;
	}

	capture(path) {
		const r = {};
		const items = splitPath(path);
		if (this.captured) {
			for (const k in this.captured) {
				const index = this.captured[k];
				if (index !== undefined) {
					r[k] = items[index] ?? "";
				}
			}
		}
		return r;
	}

	apply(path, ...value) {
		return this.value(path, this.capture(path), ...value);
	}
}

class Router {
	constructor() {
		this.static = new Map();
		this.dynamic = new Map();
		this.handlers = [];
	}

	on(expr, handler = undefined, priority = undefined, offset = 0) {
		const rte = route(expr);
		const chunk = rte[offset];
		if (offset === rte.length) {
			const captured = rte.reduce((r, v, i) => {
				if (v instanceof RoutePatternSlot) {
					r = r || {};
					r[v.name] = i;
				}
				return r;
			}, null);
			this.handlers.push(new RouteHandler(rte, handler, priority, captured));
		} else if (typeof chunk === "string") {
			if (!this.static.has(chunk)) {
				this.static.set(chunk, new Router());
			}
			const sub = this.static.get(chunk);
			if (sub) {
				sub.on(rte, handler, priority, offset + 1);
			}
		} else if (chunk instanceof RoutePatternSlot) {
			const key = chunk.pattern;
			if (!this.dynamic.has(key)) {
				this.dynamic.set(key, new Router());
			}
			const sub = this.dynamic.get(key);
			if (sub) {
				sub.on(rte, handler, priority, offset + 1);
			}
		} else {
			throw new Error(`Unsupported route value: ${chunk}`);
		}
		return this;
	}

	off(expr, handler = undefined, offset = 0) {
		const rte = route(expr);
		const chunk = rte[offset];
		if (offset === rte.length) {
			if (handler) {
				this.handlers = this.handlers.filter((h) => h.value !== handler);
			} else {
				this.handlers = [];
			}
		} else if (typeof chunk === "string") {
			if (this.static.has(chunk)) {
				this.static.get(chunk)?.off(rte, handler, offset + 1);
			}
		} else if (chunk instanceof RoutePatternSlot) {
			const key = chunk.pattern;
			let sub = this.dynamic.get(key);
			if (!sub) {
				for (const [k, v] of this.dynamic.entries()) {
					if (k.regexp.source === key.regexp.source) {
						sub = v;
						break;
					}
				}
			}
			if (sub) {
				sub.off(rte, handler, offset + 1);
			}
		} else {
			throw new Error(`Unsupported route value: ${chunk}`);
		}
		return this;
	}

	match(path, offset = 0) {
		const items = splitPath(path);
		const chunk = items[offset];
		if (offset >= items.length) {
			return this.handlers;
		}
		if (chunk === undefined) {
			return null;
		}
		if (this.static.has(chunk)) {
			return this.static.get(chunk)?.match(items, offset + 1) ?? null;
		}
		for (const [k, v] of this.dynamic.entries()) {
			const m = chunk.match(k.regexp);
			if (m) {
				return v.match(items, offset + 1);
			}
		}
		return null;
	}

	run(path, ...args) {
		const handlers = this.match(path);
		if (!handlers || handlers.length === 0) {
			return undefined;
		}
		let best;
		for (let i = handlers.length - 1; i >= 0; i--) {
			const h = handlers[i];
			if (!h) {
				continue;
			}
			best = !best || (h.priority || 0) > (best.priority || 0) ? h : best;
		}
		return best ? best.apply(path, ...args) : undefined;
	}

	*iwalk() {
		for (const handler of this.handlers) {
			yield handler;
		}
		for (const v of this.static.values()) {
			for (const w of v.iwalk()) {
				yield w;
			}
		}
		for (const v of this.dynamic.values()) {
			for (const w of v.iwalk()) {
				yield w;
			}
		}
	}

	tree() {
		const routes = {};
		for (const [k, v] of this.static.entries()) {
			routes[k] = v.tree();
		}
		for (const [k, v] of this.dynamic.entries()) {
			routes[k.regexp.source] = v.tree();
		}
		const handlers = this.handlers.map((h) => h.route);
		const res = {};
		if (Object.keys(routes).length) {
			Object.assign(res, routes);
		}
		if (handlers.length) {
			res["#handlers"] = handlers;
		}
		return res;
	}
}

const router = (routes = undefined) => {
	return Object.entries(routes || {}).reduce(
		(r, [k, v]) => r.on(route(k), v),
		new Router(),
	);
};

const routed = (routes = undefined) => {
	const r = router(routes);
	return Object.assign(
		(path, ...args) => {
			return r.run(path, ...args);
		},
		{ router: r, match: r.match.bind(r) },
	);
};

// ----------------------------------------------------------------------------
//
// SECTION: URL History
//
// ----------------------------------------------------------------------------

const isBrowser =
	typeof globalThis !== "undefined" &&
	!!globalThis.window &&
	!!globalThis.document;

const isPlainObject = (value) => {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
};

const eq = (a, b) => {
	if (a === b) {
		return true;
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!eq(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		let count = 0;
		for (const k in a) {
			if (!Object.hasOwn(a, k)) {
				continue;
			}
			count += 1;
			if (!Object.hasOwn(b, k) || !eq(a[k], b[k])) {
				return false;
			}
		}
		for (const k in b) {
			if (Object.hasOwn(b, k)) {
				count -= 1;
			}
		}
		return count === 0;
	}
	return false;
};

const hashIsObject = (value) =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hashNeedsQuote = (str) => {
	return (
		str.includes(",") ||
		str.includes("=") ||
		str.includes("(") ||
		str.includes(")") ||
		str.includes("&") ||
		str.includes('"')
	);
};

const hashQuoteString = (str) => {
	if (hashNeedsQuote(str)) {
		return `"${str.replace(/"/g, '\\"')}"`;
	}
	return str;
};

const formatHashValue = (value) => {
	if (value === null) return "null";
	if (value === undefined) return "";
	if (typeof value === "boolean") return `${value}`;
	if (typeof value === "number") return `${value}`;
	if (typeof value === "string") return hashQuoteString(value);
	if (Array.isArray(value)) {
		if (value.length === 0) return "()";
		const items = new Array(value.length);
		for (let i = 0; i < value.length; i++) {
			items[i] = formatHashValue(value[i]);
		}
		return `(${items.join(",")})`;
	}
	if (hashIsObject(value)) {
		const keys = Object.keys(value);
		if (keys.length === 0) return "()";
		const entries = new Array(keys.length);
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			entries[i] = `${k}=${formatHashValue(value[k])}`;
		}
		return `(${entries.join(",")})`;
	}
	return `${value}`;
};

const hashTokenize = (str) => {
	const tokens = [];
	let current = "";
	let inQuotes = false;
	let i = 0;
	while (i < str.length) {
		const char = str[i];
		if (inQuotes) {
			if (char === "\\" && str[i + 1] === '"') {
				current += '"';
				i += 2;
			} else if (char === '"') {
				inQuotes = false;
				i += 1;
			} else {
				current += char;
				i += 1;
			}
		} else if (char === '"') {
			inQuotes = true;
			i += 1;
		} else if (char === "," || char === "=" || char === "(" || char === ")") {
			if (current) {
				tokens.push(current);
			}
			tokens.push(char);
			current = "";
			i += 1;
		} else if (char.trim() === "") {
			i += 1;
		} else {
			current += char;
			i += 1;
		}
	}
	if (current) {
		tokens.push(current);
	}
	return tokens;
};

const parseHashPrimitive = (str) => {
	const trimmed = str.trim();
	if (trimmed === "") return "";
	if (trimmed === "null") return null;
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	const number = Number(trimmed);
	if (!Number.isNaN(number) && trimmed !== "") {
		return number;
	}
	return trimmed;
};

const parseHashValue = (tokens, i) => {
	const token = tokens[i];
	if (token === "(") {
		const items = [];
		let j = i + 1;
		while (j < tokens.length && tokens[j] !== ")") {
			if (tokens[j] === ",") {
				j += 1;
				continue;
			}
			const [val, next] = parseHashValue(tokens, j);
			items.push(val);
			j = next;
		}
		if (j < tokens.length && tokens[j] === ")") {
			j += 1;
		}
		let hasKeyValue = false;
		for (let k = 0; k < items.length; k++) {
			const item = items[k];
			if (hashIsObject(item) && Object.keys(item).length === 1) {
				hasKeyValue = true;
				break;
			}
		}
		if (!hasKeyValue) {
			return [items, j];
		}
		const obj = {};
		for (let k = 0; k < items.length; k++) {
			const item = items[k];
			if (!hashIsObject(item)) {
				return [items, j];
			}
			Object.assign(obj, item);
		}
		return [obj, j];
	}
	if (token === ")" || token === ",") {
		return [null, i + 1];
	}
	if (tokens[i + 1] === "=") {
		const key = token;
		const [val, next] = parseHashValue(tokens, i + 2);
		return [{ [key]: val }, next];
	}
	return [parseHashPrimitive(token), i + 1];
};

const parseHash = (str) => {
	const trimmed = `${str || ""}`.trim();
	if (!trimmed) {
		return [];
	}
	const tokens = hashTokenize(trimmed);
	if (tokens.length === 0) {
		return [];
	}
	if (tokens[0] === "(") {
		const [result] = parseHashValue(tokens, 0);
		return result;
	}
	const results = [];
	let i = 0;
	while (i < tokens.length) {
		if (tokens[i] === ",") {
			i += 1;
			continue;
		}
		const [value, next] = parseHashValue(tokens, i);
		results.push(value);
		i = next;
	}
	let hasObject = false;
	for (let j = 0; j < results.length; j++) {
		if (hashIsObject(results[j])) {
			hasObject = true;
			break;
		}
	}
	if (!hasObject) {
		return results.length === 1 ? results[0] : results;
	}
	const obj = {};
	const rest = [];
	for (let j = 0; j < results.length; j++) {
		const value = results[j];
		if (hashIsObject(value)) {
			Object.assign(obj, value);
		} else {
			rest.push(value);
		}
	}
	if (rest.length) {
		obj.__rest = rest;
	}
	return obj;
};

const formatHash = (value) => {
	if (value === null || value === undefined) return "";
	if (Array.isArray(value)) {
		if (value.length === 0) return "";
		const items = new Array(value.length);
		for (let i = 0; i < value.length; i++) {
			items[i] = formatHashValue(value[i]);
		}
		return items.join(",");
	}
	if (hashIsObject(value)) {
		const keys = Object.keys(value);
		if (keys.length === 0) {
			return "";
		}
		const entries = new Array(keys.length);
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			entries[i] = `${k}=${formatHashValue(value[k])}`;
		}
		return entries.join(",");
	}
	return formatHashValue(value);
};

const parsePrimitive = (value) => {
	if (value === "null") return null;
	if (value === "true") return true;
	if (value === "false") return false;
	const num = Number(value);
	if (!Number.isNaN(num) && value.trim() !== "") return num;
	return value;
};

const formatPrimitive = (value) => {
	if (value === null) return "null";
	if (value === true) return "true";
	if (value === false) return "false";
	return `${value}`;
};

const asHashObject = (value) => {
	if (hashIsObject(value)) {
		return value;
	}
	if (Array.isArray(value)) {
		return { __rest: value };
	}
	if (value === undefined || value === null) {
		return {};
	}
	return { value };
};

const PathSerializer = {
	parse(value) {
		return splitPath(value);
	},
	format(path) {
		const items = splitPath(path);
		return `/${items.join("/")}`;
	},
};

const HashSerializer = {
	parse(value) {
		const hashValue = `${value || ""}`.replace(/^#/, "");
		if (!hashValue) {
			return { path: "" };
		}
		const parts = hashValue.split("&");
		const first = parts[0];
		const rest = [];
		for (let i = 1; i < parts.length; i++) {
			rest.push(parts[i]);
		}
		if (first.includes("=")) {
			return { path: "", ...asHashObject(parseHash(hashValue)) };
		}
		const restValue = rest.length
			? asHashObject(parseHash(rest.join("&")))
			: {};
		return { path: first || "", ...restValue };
	},
	format(hash) {
		const data = hash || { path: "" };
		const path = typeof data.path === "string" ? data.path : "";
		const rest = {};
		for (const k in data) {
			if (k === "path") {
				continue;
			}
			rest[k] = data[k];
		}
		const parts = [];
		if (path) {
			parts.push(path);
		}
		const params = formatHash(rest);
		if (params) {
			parts.push(params);
		}
		return parts.join("&");
	},
};

const ParamsSerializer = {
	parse(value) {
		const result = {};
		const search = `${value || ""}`.replace(/^\?/, "");
		const entries = new URLSearchParams(search);
		for (const [k, v] of entries.entries()) {
			if (k.endsWith("[]")) {
				const baseKey = k.slice(0, -2);
				const existing = result[baseKey];
				if (Array.isArray(existing)) {
					existing.push(parsePrimitive(v));
				} else if (existing !== undefined) {
					result[baseKey] = [existing, parsePrimitive(v)];
				} else {
					result[baseKey] = [parsePrimitive(v)];
				}
			} else {
				result[k] = parsePrimitive(v);
			}
		}
		return result;
	},
	format(params) {
		const search = new URLSearchParams();
		for (const k in params || {}) {
			const v = params[k];
			if (Array.isArray(v)) {
				for (let i = 0; i < v.length; i++) {
					search.append(`${k}[]`, formatPrimitive(v[i]));
				}
			} else if (v !== undefined) {
				search.set(k, formatPrimitive(v));
			}
		}
		return search.toString();
	},
};

class URLHistory {
	constructor(
		pathSerializer = PathSerializer,
		hashSerializer = HashSerializer,
		paramsSerializer = ParamsSerializer,
	) {
		this.pathSerializer = pathSerializer;
		this.hashSerializer = hashSerializer;
		this.paramsSerializer = paramsSerializer;
		this.path = [];
		this.hash = { path: "" };
		this.params = {};
		this.title = "";
		this.onPathCallbacks = [];
		this.onHashCallbacks = [];
		this.onParamsCallbacks = [];
		this.onPushCallbacks = [];
		this.onReplaceCallbacks = [];
		this.onPopState = this.onPopState.bind(this);
		this.onHashChange = this.onHashChange.bind(this);
		this.init();
	}

	init() {
		if (!isBrowser) {
			return;
		}
		this.syncFromURL();
		globalThis.window.addEventListener("popstate", this.onPopState);
		globalThis.window.addEventListener("hashchange", this.onHashChange);
	}

	destroy() {
		if (!isBrowser) {
			return;
		}
		globalThis.window.removeEventListener("popstate", this.onPopState);
		globalThis.window.removeEventListener("hashchange", this.onHashChange);
	}

	syncFromURL() {
		if (!isBrowser) {
			return;
		}
		this.path = this.pathSerializer.parse(globalThis.window.location.pathname);
		this.hash = this.hashSerializer.parse(globalThis.window.location.hash);
		this.params = this.paramsSerializer.parse(
			globalThis.window.location.search,
		);
		this.title = globalThis.document.title;
	}

	notify(callbacks, current, previous, type) {
		for (let i = 0; i < callbacks.length; i++) {
			callbacks[i](current, previous, type);
		}
	}

	formatURLSearch() {
		const search = this.paramsSerializer.format(this.params);
		return search ? `?${search}` : "";
	}

	formatURLHash() {
		const hash = this.hashSerializer.format(this.hash);
		return hash ? `#${hash}` : "";
	}

	formatURL() {
		return `${this.pathSerializer.format(this.path)}${this.formatURLSearch()}${this.formatURLHash()}`;
	}

	writeURL(replace = true) {
		if (!isBrowser) {
			return;
		}
		const url = this.formatURL();
		if (replace) {
			globalThis.window.history.replaceState(null, "", url);
		} else {
			globalThis.window.history.pushState(null, "", url);
		}
	}

	onPopState() {
		const previousPath = this.path;
		const previousHash = this.hash;
		const previousParams = this.params;
		this.syncFromURL();
		if (!eq(previousPath, this.path)) {
			this.notify(this.onPathCallbacks, this.path, previousPath, "path");
		}
		if (!eq(previousHash, this.hash)) {
			this.notify(this.onHashCallbacks, this.hash, previousHash, "hash");
		}
		if (!eq(previousParams, this.params)) {
			this.notify(
				this.onParamsCallbacks,
				this.params,
				previousParams,
				"params",
			);
		}
	}

	onHashChange() {
		if (!isBrowser) {
			return;
		}
		const previous = this.hash;
		this.hash = this.hashSerializer.parse(globalThis.window.location.hash);
		if (!eq(previous, this.hash)) {
			this.notify(this.onHashCallbacks, this.hash, previous, "hash");
		}
	}

	setTitle(title, replace = false) {
		const previous = this.title;
		this.title = title;
		if (isBrowser) {
			globalThis.document.title = title;
		}
		if (replace) {
			this.notify(this.onReplaceCallbacks, title, previous, "path");
		} else {
			this.notify(this.onPushCallbacks, title, previous, "path");
		}
	}

	getTitle() {
		return this.title;
	}

	setPath(path, replace = true) {
		const next =
			typeof path === "string" ? this.pathSerializer.parse(path) : path;
		if (eq(this.path, next)) {
			return;
		}
		const previous = this.path;
		this.path = splitPath(next);
		this.writeURL(replace);
		this.notify(this.onPathCallbacks, this.path, previous, "path");
		if (replace) {
			this.notify(this.onReplaceCallbacks, this.path, previous, "path");
		} else {
			this.notify(this.onPushCallbacks, this.path, previous, "path");
		}
	}

	getPath() {
		return [...this.path];
	}

	setHash(hash, replace = false) {
		const next = typeof hash === "string" ? { path: hash } : hash;
		if (eq(this.hash, next)) {
			return;
		}
		const previous = this.hash;
		this.hash = next;
		this.writeURL(replace);
		this.notify(this.onHashCallbacks, this.hash, previous, "hash");
		if (replace) {
			this.notify(this.onReplaceCallbacks, this.hash, previous, "hash");
		} else {
			this.notify(this.onPushCallbacks, this.hash, previous, "hash");
		}
	}

	getHash() {
		return this.hash;
	}

	mergeHash(hash, replace = true) {
		const currentIsObject = hashIsObject(this.hash);
		const nextIsObject = hashIsObject(hash);
		const merged =
			currentIsObject && nextIsObject
				? Object.fromEntries(
						Object.entries({ ...this.hash, ...hash }).filter(
							([, v]) => v !== null,
						),
					)
				: hash;
		if (eq(this.hash, merged)) {
			return;
		}
		this.setHash(merged, replace);
	}

	setParams(params, replace = true) {
		const next = { ...(params || {}) };
		if (eq(this.params, next)) {
			return;
		}
		const previous = this.params;
		this.params = next;
		this.writeURL(replace);
		this.notify(this.onParamsCallbacks, this.params, previous, "params");
		if (replace) {
			this.notify(this.onReplaceCallbacks, this.params, previous, "params");
		} else {
			this.notify(this.onPushCallbacks, this.params, previous, "params");
		}
	}

	mergeParams(params, replace = true) {
		const merged = Object.fromEntries(
			Object.entries({ ...this.params, ...(params || {}) }).filter(
				([, v]) => v !== null,
			),
		);
		if (eq(this.params, merged)) {
			return;
		}
		this.setParams(merged, replace);
	}

	getParams() {
		return { ...this.params };
	}

	onPath(callback, trigger = false) {
		this.onPathCallbacks.push(callback);
		if (trigger) {
			callback(this.path, undefined, "path");
		}
		return () => {
			this.onPathCallbacks = this.onPathCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}

	onHash(callback, trigger = false) {
		this.onHashCallbacks.push(callback);
		if (trigger) {
			callback(this.hash, undefined, "hash");
		}
		return () => {
			this.onHashCallbacks = this.onHashCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}

	onParams(callback, trigger = false) {
		this.onParamsCallbacks.push(callback);
		if (trigger) {
			callback(this.params, undefined, "params");
		}
		return () => {
			this.onParamsCallbacks = this.onParamsCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}

	onPush(callback, trigger = false) {
		this.onPushCallbacks.push(callback);
		if (trigger) {
			callback(this.path, undefined, "path");
		}
		return () => {
			this.onPushCallbacks = this.onPushCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}

	onReplace(callback, trigger = false) {
		this.onReplaceCallbacks.push(callback);
		if (trigger) {
			callback(this.path, undefined, "path");
		}
		return () => {
			this.onReplaceCallbacks = this.onReplaceCallbacks.filter(
				(cb) => cb !== callback,
			);
		};
	}
}

const extra = Object.freeze({
	bind,
	clsx,
	bool,
	cmp,
	predicate,
	extractor,
	sorted,
	filter,
	drag,
	dragtarget,
	HashSerializer,
	iclsx,
	Keyboard,
	ParamsSerializer,
	PathSerializer,
	route,
	Router,
	router,
	routed,
	target,
	unbind,
	list,
	unique,
	URLHistory,
});

export {
	autoresize,
	bind,
	clsx,
	bool,
	cmp,
	predicate,
	extractor,
	sorted,
	filter,
	drag,
	dragtarget,
	HashSerializer,
	iclsx,
	Keyboard,
	ParamsSerializer,
	PathSerializer,
	route,
	Router,
	router,
	routed,
	target,
	unbind,
	unique,
	list,
	URLHistory,
};
export default extra;

// EOF
