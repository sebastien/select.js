import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import browser, { Browser, hash } from "../src/js/select/browser.js"

function snapshotGlobal(key) {
	return {
		had: Object.hasOwn(globalThis, key),
		descriptor: Object.getOwnPropertyDescriptor(globalThis, key),
	}
}

function restoreGlobal(key, snapshot) {
	if (snapshot.had) {
		Object.defineProperty(globalThis, key, snapshot.descriptor)
	} else {
		delete globalThis[key]
	}
}

function setupGlobals(window) {
	window.SyntaxError = SyntaxError
	window.TypeError = TypeError
	window.Error = Error
	const g = globalThis
	g.window = window
	g.document = window.document
	g.Node = window.Node
	g.Element = window.Element
	g.HTMLElement = window.HTMLElement
	g.DocumentFragment = window.DocumentFragment
	g.Text = window.Text
	g.Comment = window.Comment
	g.Document = window.Document
	g.DOMParser = window.DOMParser
	g.MutationObserver = window.MutationObserver
	g.CustomEvent = window.CustomEvent
	g.Event = window.Event
	g.MouseEvent = window.MouseEvent
	g.KeyboardEvent = window.KeyboardEvent
	g.NodeFilter = window.NodeFilter
	g.SVGElement = window.SVGElement
	g.customElements = window.customElements
	g.requestAnimationFrame = window.requestAnimationFrame.bind(window)
	g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
	g.navigator = window.navigator
	g.getComputedStyle = window.getComputedStyle.bind(window)
}

async function expectResponseError(promise, status, statusText) {
	try {
		await promise
		throw new Error("expected fetch to reject")
	} catch (error) {
		expect(error).toBeInstanceOf(Error)
		expect(error.message).toBe(
			`HTTP ${status}${statusText ? ` ${statusText}` : ""}`,
		)
		expect(error.status).toBe(status)
		expect(error.response).toBeInstanceOf(Response)
	}
}

describe("Browser.ref", () => {
	test("returns undefined for non-reference values", () => {
		const instance = new Browser()
		expect(instance.ref("true")).toBeUndefined()
		expect(instance.ref("hello")).toBeUndefined()
		expect(instance.ref({})).toBeUndefined()
	})

	test("supports colon selections across browser cells", () => {
		const instance = new Browser()

		instance.ref("@session.user:profile.name").set("Ada")
		expect(instance.internal("session.user").value).toEqual({
			profile: { name: "Ada" },
		})

		instance.ref("#filters.state:current.label").set("Open")
		expect(instance.hash.value).toEqual({
			"filters.state": { current: { label: "Open" } },
		})

		instance.ref("?users:list.0.name").set("Lin")
		expect(instance.query.value).toEqual({
			users: { list: [{ name: "Lin" }] },
		})
	})
})

describe("Browser.val", () => {
	test("coerces standalone boolean and numeric strings and leaves hashformat text untouched", () => {
		const instance = new Browser()
		expect(instance.val("true")).toBe(true)
		expect(instance.val("false")).toBe(false)
		expect(instance.val("2026")).toBe(2026)
		expect(instance.val("1.5")).toBe(1.5)
		expect(instance.val("hello")).toBe("hello")
		expect(instance.val("a,b,c")).toBe("a,b,c")
		expect(instance.val("a=b")).toBe("a=b")
		expect(instance.val("(a,b,c)")).toEqual(["a", "b", "c"])
		expect(instance.val("@session.user:profile.name")).toBe(
			"@session.user:profile.name",
		)
	})
})

describe("Browser.parse", () => {
	test("dispatches to ref() for references and val() for plain values", () => {
		const instance = new Browser()

		instance.parse("@session.user:profile.name").set("Ada")
		expect(instance.internal("session.user").value).toEqual({
			profile: { name: "Ada" },
		})

		expect(instance.parse("true")).toBe(true)
		expect(instance.parse("false")).toBe(false)
		expect(instance.parse("2026")).toBe(2026)
		expect(instance.parse("1.5")).toBe(1.5)
		expect(instance.parse("hello")).toBe("hello")
		expect(instance.parse("a,b,c")).toBe("a,b,c")
		expect(instance.parse("a=b")).toBe("a=b")
		expect(instance.parse("(a,b,c)")).toEqual(["a", "b", "c"])
	})

	test("shared singleton parses booleans and numbers too", () => {
		expect(browser().parse("true")).toBe(true)
		expect(browser().parse("false")).toBe(false)
		expect(browser().parse("2026")).toBe(2026)
	})
})

describe("Browser.option", () => {
	test("uses the OPTIONS singleton and * references", () => {
		const snapshot = snapshotGlobal("OPTIONS")
		try {
			delete globalThis.OPTIONS
			const instance = new Browser({ options: { theme: "light" } })
			const theme = instance.option("theme")

			expect(globalThis.OPTIONS).toEqual({ theme: "light" })
			expect(theme.value).toBe("light")
			expect(instance.parse("*theme").value).toBe("light")

			globalThis.OPTIONS = { theme: "dark", nested: { mode: "night" } }
			expect(theme.value).toBe("dark")
			expect(instance.parse("*nested.mode").value).toBe("night")

			theme.set("blue")
			expect(globalThis.OPTIONS.theme).toBe("blue")
		} finally {
			restoreGlobal("OPTIONS", snapshot)
		}
	})

	test("switches sources at runtime", () => {
		const optionsSnapshot = snapshotGlobal("OPTIONS")
		const altSnapshot = snapshotGlobal("ALT_OPTIONS")
		const testSnapshot = snapshotGlobal("TEST_OPTIONS")
		try {
			delete globalThis.OPTIONS
			delete globalThis.ALT_OPTIONS
			delete globalThis.TEST_OPTIONS
			globalThis.TEST_OPTIONS = { theme: "light" }
			const instance = new Browser({ options: "TEST_OPTIONS" })

			expect(instance.option("theme").value).toBe("light")

			instance.option.source("ALT_OPTIONS")
			expect(globalThis.ALT_OPTIONS).toEqual({})
			expect(instance.option("theme").value).toBeUndefined()

			globalThis.ALT_OPTIONS = { theme: "dark" }
			expect(instance.option("theme").value).toBe("dark")

			instance.parse("*theme").set("blue")
			expect(globalThis.ALT_OPTIONS.theme).toBe("blue")
		} finally {
			restoreGlobal("ALT_OPTIONS", altSnapshot)
			restoreGlobal("TEST_OPTIONS", testSnapshot)
			restoreGlobal("OPTIONS", optionsSnapshot)
		}
	})
})

describe("hash.parse — path/flag semantics", () => {
	test("#new -> {path:'new', new:true}", () => {
		expect(hash.parse("#new")).toEqual({ path: "new", new: true })
	})

	test("#login/new -> {path:'login/new'} (slash → no flag)", () => {
		expect(hash.parse("#login/new")).toEqual({ path: "login/new" })
	})

	test("#new,old -> {path:'new', new:true, old:true}", () => {
		expect(hash.parse("#new,old")).toEqual({
			path: "new",
			new: true,
			old: true,
		})
	})

	test("#login/new,old -> {path:'login/new', old:true}", () => {
		expect(hash.parse("#login/new,old")).toEqual({
			path: "login/new",
			old: true,
		})
	})

	test("#new,old,foo=bar -> path+flags+key", () => {
		expect(hash.parse("#new,old,foo=bar")).toEqual({
			path: "new",
			new: true,
			old: true,
			foo: "bar",
		})
	})

	test("#new=10 -> {new:10} (no path)", () => {
		expect(hash.parse("#new=10")).toEqual({ new: 10 })
	})

	test("#new=10,old -> {new:10, old:true}", () => {
		expect(hash.parse("#new=10,old")).toEqual({ new: 10, old: true })
	})

	test("#a=1,b=2 -> {a:1, b:2}", () => {
		expect(hash.parse("#a=1,b=2")).toEqual({ a: 1, b: 2 })
	})

	test("#(new,old) -> [new,old] (parenthesized → array)", () => {
		expect(hash.parse("#(new,old)")).toEqual(["new", "old"])
	})

	test("#(a=1,b=2) -> {a:1, b:2}", () => {
		expect(hash.parse("#(a=1,b=2)")).toEqual({ a: 1, b: 2 })
	})
})

describe("hash.parse — edge cases", () => {
	test("empty hash -> {}", () => {
		expect(hash.parse("#")).toEqual({})
		expect(hash.parse("")).toEqual({})
	})

	test("single bare token -> {path, token:true}", () => {
		expect(hash.parse("flag")).toEqual({ path: "flag", flag: true })
	})

	test("path with trailing comma -> path-only", () => {
		expect(hash.parse("#new,")).toEqual({ path: "new", new: true })
	})
})

describe("Browser.fetch", () => {
	test("rejects non-OK direct fetch responses", async () => {
		const instance = new Browser()
		const originalFetch = globalThis.fetch
		globalThis.fetch = async (input) => {
			expect(input).toBe("/missing")
			return new Response('{"error":"missing"}', {
				status: 404,
				statusText: "Not Found",
				headers: { "content-type": "application/json" },
			})
		}

		try {
			await expectResponseError(instance.fetch("/missing"), 404, "Not Found")
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	test("rejects non-OK shorthand fetch responses", async () => {
		const instance = new Browser()
		const originalFetch = globalThis.fetch
		globalThis.fetch = async (input, options) => {
			expect(input).toBe("/submit")
			expect(options.method).toBe("POST")
			expect(options.headers.get("content-type")).toBe("application/json")
			expect(options.body).toBe('{"name":"Ada"}')
			return new Response("broken", {
				status: 500,
				statusText: "Server Error",
				headers: { "content-type": "text/plain" },
			})
		}

		try {
			await expectResponseError(
				instance.fetch("POST:/submit#name=Ada"),
				500,
				"Server Error",
			)
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	test("treats a function second argument as post callback", async () => {
		const instance = new Browser()
		const originalFetch = globalThis.fetch
		globalThis.fetch = async (input, options) => {
			expect(input).toBe("/value")
			expect(options).toBeUndefined()
			return new Response("hello", {
				headers: { "content-type": "text/plain" },
			})
		}

		try {
			await expect(instance.fetch("/value", (value) => `${value}!`)).resolves.toBe(
				"hello!",
			)
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	test("parses text/html into an inert current-document root node", async () => {
		const window = new Window({ url: "http://localhost:8000/fetch-html" })
		setupGlobals(window)
		const instance = new Browser()
		const originalFetch = globalThis.fetch
		globalThis.fetch = async (input, options) => {
			expect(input).toBe("/page")
			expect(options).toBeUndefined()
			return new Response(
				'<section class="page"><img src="/asset.png"><span>Hello</span></section>',
				{
					headers: { "content-type": "text/html; charset=utf-8" },
				},
			)
		}

		try {
			const value = await instance.fetch("/page")
			expect(value.nodeType).toBe(Node.ELEMENT_NODE)
			expect(value.ownerDocument).toBe(document)
			expect(value.matches("section.page")).toBe(true)
			expect(value.querySelector("span").textContent).toBe("Hello")
			expect(value.isConnected).toBe(false)
		} finally {
			globalThis.fetch = originalFetch
			window.close?.()
		}
	})

	test("returns a fragment for multi-root html responses and preserves post callbacks", async () => {
		const window = new Window({ url: "http://localhost:8000/fetch-html-fragment" })
		setupGlobals(window)
		const instance = new Browser()
		const originalFetch = globalThis.fetch
		globalThis.fetch = async () =>
			new Response('<h1>Title</h1><p>Body</p>', {
				headers: { "content-type": "text/html" },
			})

		try {
			const value = await instance.fetch("/fragment", (root) => ({
				type: root.nodeType,
				count: root.childNodes.length,
				owner: root.ownerDocument,
			}))
			expect(value.type).toBe(Node.DOCUMENT_FRAGMENT_NODE)
			expect(value.count).toBe(2)
			expect(value.owner).toBe(document)
		} finally {
			globalThis.fetch = originalFetch
			window.close?.()
		}
	})

	test("fetched absorbs non-OK failures into the cell state", async () => {
		const originalFetch = globalThis.fetch
		globalThis.fetch = async () =>
			new Response("missing", {
				status: 404,
				statusText: "Not Found",
				headers: { "content-type": "text/plain" },
			})

		try {
			const state = browser().fetched("/missing")
			expect(state.isReactive).toBe(true)
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(state.value).toBeUndefined()
			expect(state.isPending).toBe(false)
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})

// EOF
