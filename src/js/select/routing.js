// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-02

// Module: select/routing
// URL-like route tokenization and dispatch.

// Class: RoutePattern
// Regular-expression route matcher used by dynamic path segments.
class RoutePattern {
	constructor(regexp, extractor = undefined) {
		this.regexp = regexp
		this.extractor = extractor
	}
}

function pattern(regexp, extractor = undefined) {
	return new RoutePattern(regexp, extractor)
}

function escapeRegexp(value) {
	return value.replace(/[\\^$+?.()|[\]{}]/g, "\\$&")
}

function wildcardPattern(text) {
	return new RegExp(`^${escapeRegexp(text).replace(/\*/g, ".*")}$`)
}

const ROUTE_PATTERNS = {
	chunk: pattern(/^[^/]+$/),
	number: pattern(/^[0-9]+$/),
	alpha: pattern(/^[A-Za-z]+$/),
	string: pattern(/^[A-Za-z0-9_-]+$/),
}

// Class: RoutePatternSlot
// Route segment wrapper that stores the `pattern`, parameter `name`, and
// positional `index` within the route.
class RoutePatternSlot {
	constructor(pattern, name, index, capture = true) {
		this.pattern = pattern
		this.name = name
		this.index = index
		this.capture = capture
	}

	toJSON() {
		return { name: this.name, matches: this.pattern.regexp.source }
	}
}

// Class: RouteWildcard
// Single-segment wildcard (`*`) route segment.
class RouteWildcard extends RoutePatternSlot {
	constructor(index) {
		super(ROUTE_PATTERNS.chunk, "*", index, false)
	}
}

// Class: RouteDescendant
// Multi-segment wildcard (`**`) route segment that matches the rest of a path.
class RouteDescendant extends RoutePatternSlot {
	constructor(index) {
		super(pattern(/.+/), "**", index, false)
	}
}

// Function: splitPath
// Normalizes `value` into an array of path chunks.
function splitPath(value) {
	if (Array.isArray(value)) {
		return value
	}
	if (value === undefined || value === null) {
		return []
	}
	const text = `${value}`
	if (!text.length) {
		return []
	}
	const items = text.split("/")
	const res = []
	for (let i = 0; i < items.length; i++) {
		if (items[i]) {
			res.push(items[i])
		}
	}
	return res
}

// Function: route
// Parses `text` into a route description. Braced segments become
// `RoutePatternSlot` entries and literal segments stay as strings.
function route(text) {
	if (Array.isArray(text)) {
		return text
	}
	const items = splitPath(text)
	const res = []
	for (let i = 0; i < items.length; i++) {
		const item = items[i]
		if (item === "*") {
			res.push(new RouteWildcard(res.length))
		} else if (item === "**") {
			res.push(new RouteDescendant(res.length))
		} else if (item.startsWith("{")) {
			if (!item.endsWith("}")) {
				throw new SyntaxError(`Route item '${item}' does not end with a brace: ${text}`)
			}
			const parts = item.slice(1, -1).split(":", 2)
			const name = parts[0] || ""
			const type = parts[1]
			const matched =
				type && ROUTE_PATTERNS[type]
					? ROUTE_PATTERNS[type]
					: type
						? new RoutePattern(new RegExp(type))
						: ROUTE_PATTERNS.chunk
			res.push(new RoutePatternSlot(matched, name, res.length, true))
		} else if (item.includes("*")) {
			res.push(new RoutePatternSlot(pattern(wildcardPattern(item)), item, res.length, false))
		} else {
			res.push(item)
		}
	}
	return res
}

// Class: RouteHandler
// Associates a route with a handler function, priority, and captured values.
class RouteHandler {
	constructor(route, value, priority = undefined, captured = null) {
		this.route = route
		this.value = value
		this.priority = priority
		this.captured = captured
	}

	capture(p) {
		const r = {}
		const items = splitPath(p)
		if (this.captured) {
			for (const k in this.captured) {
				const i = this.captured[k]
				if (i !== undefined) {
					r[k] = items[i] ?? ""
				}
			}
		}
		return r
	}

	apply(p, ...value) {
		if (typeof this.value === "function") {
			return this.value(p, this.capture(p), ...value)
		}
		return this.value
	}
}

function routePriority(route) {
	let priority = 3
	for (let i = 0; i < route.length; i++) {
		const item = route[i]
		if (item instanceof RouteDescendant) {
			return 0
		}
		if (item instanceof RouteWildcard) {
			priority = priority > 1 ? 1 : priority
			continue
		}
		if (item instanceof RoutePatternSlot) {
			priority = priority > 2 ? 2 : priority
		}
	}
	return priority
}

// Class: Router
// Tree-based router that stores static and dynamic route handlers.
class Router {
	constructor() {
		this.static = new Map()
		this.dynamic = new Map()
		this.handlers = []
		this.descendants = []
	}

	on(expr, handler = undefined, priority = undefined, offset = 0) {
		const rte = route(expr)
		const chunk = rte[offset]
		if (offset === rte.length) {
			const captured = rte.reduce((r, v, i) => {
				if (v instanceof RoutePatternSlot && v.capture) {
					r = r || {}
					r[v.name] = i
				}
				return r
			}, null)
			this.handlers.push(new RouteHandler(rte, handler, priority ?? routePriority(rte), captured))
		} else if (chunk instanceof RouteDescendant) {
			if (offset !== rte.length - 1) {
				throw new Error(`Route descendant must be terminal: ${rte}`)
			}
			const captured = rte.reduce((r, v, i) => {
				if (v instanceof RoutePatternSlot && v.capture) {
					r = r || {}
					r[v.name] = i
				}
				return r
			}, null)
			this.descendants.push(new RouteHandler(rte, handler, priority ?? routePriority(rte), captured))
		} else if (typeof chunk === "string") {
			if (!this.static.has(chunk)) {
				this.static.set(chunk, new Router())
			}
			this.static.get(chunk)?.on(rte, handler, priority, offset + 1)
		} else if (chunk instanceof RoutePatternSlot) {
			const key = chunk.pattern
			if (!this.dynamic.has(key)) {
				this.dynamic.set(key, new Router())
			}
			this.dynamic.get(key)?.on(rte, handler, priority, offset + 1)
		} else {
			throw new Error(`Unsupported route value: ${chunk}`)
		}
		return this
	}

	off(expr, handler = undefined, offset = 0) {
		const rte = route(expr)
		const chunk = rte[offset]
		if (offset === rte.length) {
			this.handlers = handler ? this.handlers.filter((h) => h.value !== handler) : []
		} else if (chunk instanceof RouteDescendant) {
			this.descendants = handler ? this.descendants.filter((h) => h.value !== handler) : []
		} else if (typeof chunk === "string") {
			this.static.get(chunk)?.off(rte, handler, offset + 1)
		} else if (chunk instanceof RoutePatternSlot) {
			const key = chunk.pattern
			let sub = this.dynamic.get(key)
			if (!sub) {
				for (const [k, v] of this.dynamic.entries()) {
					if (k.regexp.source === key.regexp.source) {
						sub = v
						break
					}
				}
			}
			sub?.off(rte, handler, offset + 1)
		} else {
			throw new Error(`Unsupported route value: ${chunk}`)
		}
		return this
	}

	match(p, offset = 0) {
		const items = splitPath(p)
		const chunk = items[offset]
		if (offset >= items.length) {
			return this.handlers
		}
		if (chunk === undefined) {
			return null
		}
		let matches = null
		if (this.static.has(chunk)) {
			const staticMatches = this.static.get(chunk)?.match(items, offset + 1) ?? null
			if (staticMatches?.length) {
				if (this.descendants.length) {
					staticMatches.push(...this.descendants)
				}
				return staticMatches
			}
		}
		for (const [k, v] of this.dynamic.entries()) {
			if (chunk.match(k.regexp)) {
				const m = v.match(items, offset + 1)
				if (m?.length) {
					if (matches) {
						matches.push(...m)
					} else {
						matches = m
					}
				}
			}
		}
		if (this.descendants.length) {
			if (matches) {
				matches.push(...this.descendants)
			} else {
				matches = this.descendants.slice()
			}
		}
		return matches
	}

	run(p, ...args) {
		const handlers = this.match(p)
		if (!handlers || handlers.length === 0) {
			return undefined
		}
		let best
		for (let i = handlers.length - 1; i >= 0; i--) {
			const h = handlers[i]
			if (!h) {
				continue
			}
			best = !best || (h.priority || 0) > (best.priority || 0) ? h : best
		}
		return best ? best.apply(p, ...args) : undefined
	}

	tree() {
		const res = {}
		res["#handlers"] = this.handlers.slice()
		res["#descendants"] = this.descendants.slice()
		for (const [k, v] of this.static.entries()) {
			res[k] = v.tree()
		}
		if (this.dynamic.size) {
			const dyn = []
			for (const [k, v] of this.dynamic.entries()) {
				dyn.push({ matches: k.regexp.source, node: v.tree() })
			}
			res["#dynamic"] = dyn
		}
		return res
	}
}

// Function: router
// Creates a `Router` and registers all entries from `routes`.
function router(routes = undefined) {
	return Object.entries(routes || {}).reduce((r, [k, v]) => r.on(route(k), v), new Router())
}

// Function: routed
// Returns a callable router wrapper with `.router` and `.match` helpers.
function routed(routes = undefined) {
	const r = router(routes)
	return Object.assign(
		(p, ...args) => r.run(p, ...args),
		{ router: r, match: r.match.bind(r) },
	)
}

export {
	RouteHandler,
	RoutePattern,
	RoutePatternSlot,
	RouteDescendant,
	RouteWildcard,
	Router,
	route,
	routed,
	router,
	splitPath,
};

// EOF
