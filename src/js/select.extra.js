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

// --
// Extracts a stable item key
function itemkey(item) {
	return item?.id ?? item?.key ?? item?.name ?? item;
}

// --
// Finds item index in a list with optional key extractor
function find(items, item, key = itemkey) {
	if (!items) {
		return -1;
	}
	items = list(items);
	if (key === null) {
		return items.indexOf(item);
	}
	const extract = key ?? itemkey;
	const k = extract(item);
	return items.findIndex((_) => extract(_) === k);
}

// --
// Checks if item exists in a list
function has(items, item, key = itemkey) {
	return find(items, item, key) >= 0;
}

// --
// Adds item to list if not already present
function add(items, item, key = itemkey) {
	if (!items) {
		return [item];
	}
	items = list(items);
	const i = find(items, item, key);
	if (i === -1) {
		return [...items, item];
	}
	return items;
}

// --
// Removes item from list if present
function remove(items, item, key = itemkey) {
	if (!items) {
		return items;
	}
	items = list(items);
	const i = find(items, item, key);
	if (i >= 0) {
		const res = [...items];
		res.splice(i, 1);
		return res;
	}
	return items;
}

// --
// Toggles item presence in a list
function toggle(items, item, key = itemkey) {
	return has(items, item, key)
		? (remove(items, item, key) ?? [])
		: add(items, item, key);
}

// --
// Gets the wrapped index around bounds
function next(items, index, delta = 1) {
	const n = typeof items === "number" ? items : (items?.length ?? 0);
	if (n <= 0) {
		return 0;
	}
	return (((index + delta) % n) + n) % n;
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

const extra = Object.freeze({
	bind,
	clsx,
	bool,
	cmp,
	predicate,
	extractor,
	sorted,
	filter,
	find,
	has,
	drag,
	dragtarget,
	iclsx,
	Keyboard,
	itemkey,
	next,
	add,
	remove,
	route,
	Router,
	router,
	routed,
	target,
	toggle,
	unbind,
	list,
	unique,
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
	find,
	has,
	drag,
	dragtarget,
	iclsx,
	Keyboard,
	itemkey,
	next,
	add,
	remove,
	route,
	Router,
	router,
	routed,
	target,
	toggle,
	unbind,
	unique,
	list,
};
export default extra;

// EOF
