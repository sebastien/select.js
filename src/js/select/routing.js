// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-07

// Module: select/routing
// URL-like route tokenization and dispatch.

class RoutePattern {
	constructor(regexp, extractor = undefined) {
		this.regexp = regexp
		this.extractor = extractor
	}
}

const pattern = (regexp, extractor = undefined) =>
	new RoutePattern(regexp, extractor)

const ROUTE_PATTERNS = {
	chunk: pattern(/^[^/]+$/),
	number: pattern(/^[0-9]+$/),
	alpha: pattern(/^[A-Za-z]+$/),
	string: pattern(/^[A-Za-z0-9_-]+$/),
}

class RoutePatternSlot {
	constructor(pattern, name, index) {
		this.pattern = pattern
		this.name = name
		this.index = index
	}

	toJSON() {
		return { name: this.name, matches: this.pattern.regexp.source }
	}
}

const splitPath = (value) => {
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

const route = (text) => {
	if (Array.isArray(text)) {
		return text
	}
	const items = splitPath(text)
	const res = []
	for (let i = 0; i < items.length; i++) {
		const item = items[i]
		if (item.startsWith("{")) {
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
			res.push(new RoutePatternSlot(matched, name, res.length))
		} else {
			res.push(item)
		}
	}
	return res
}

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
		return this.value(p, this.capture(p), ...value)
	}
}

class Router {
	constructor() {
		this.static = new Map()
		this.dynamic = new Map()
		this.handlers = []
	}

	on(expr, handler = undefined, priority = undefined, offset = 0) {
		const rte = route(expr)
		const chunk = rte[offset]
		if (offset === rte.length) {
			const captured = rte.reduce((r, v, i) => {
				if (v instanceof RoutePatternSlot) {
					r = r || {}
					r[v.name] = i
				}
				return r
			}, null)
			this.handlers.push(new RouteHandler(rte, handler, priority, captured))
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
		if (this.static.has(chunk)) {
			return this.static.get(chunk)?.match(items, offset + 1) ?? null
		}
		for (const [k, v] of this.dynamic.entries()) {
			if (chunk.match(k.regexp)) {
				return v.match(items, offset + 1)
			}
		}
		return null
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
}

const router = (routes = undefined) =>
	Object.entries(routes || {}).reduce((r, [k, v]) => r.on(route(k), v), new Router())

const routed = (routes = undefined) => {
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
	Router,
	route,
	routed,
	router,
	splitPath,
}

// EOF
