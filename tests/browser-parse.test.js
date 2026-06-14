import { describe, expect, test } from "bun:test"
import browser, { Browser, hash } from "../src/js/select/browser.js"

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

	test("fetched keeps non-OK failures on the cell promise", async () => {
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
			await expectResponseError(state.value, 404, "Not Found")
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})

// EOF
