import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { Browser, browser } from "../src/js/select/state/browser.js"

function browserAt(path = "/", hash = {}) {
	const state = new Browser()
	state.path.set(path)
	state.hash.set(hash)
	return state
}

describe("Browser.routes", () => {
	test("dispatches path routes immediately and on path change", () => {
		const state = browserAt("/")
		const hits = []
		const stop = state.routes({
			"/": () => hits.push("home"),
			"/users/{id:number}": (_path, { id }) => hits.push(`user:${id}`),
		})

		expect(hits).toEqual(["home"])
		state.path.set("/users/42")
		expect(hits).toEqual(["home", "user:42"])
		state.path.set("/missing")
		expect(hits).toEqual(["home", "user:42"])

		expect(stop()).toBe(true)
		expect(stop()).toBe(false)
		state.path.set("/")
		expect(hits).toEqual(["home", "user:42"])
	})

	test("treats # keys as hash.path routes", () => {
		const state = browserAt("/", { path: "settings" })
		const hits = []
		const stop = state.routes({
			"#settings": () => hits.push("settings"),
			"#profile/{tab}": (_path, { tab }) => hits.push(`profile:${tab}`),
		})

		expect(hits).toEqual(["settings"])
		state.hash.set({ path: "profile/activity" })
		expect(hits).toEqual(["settings", "profile:activity"])
		state.path.set("/users/1")
		expect(hits).toEqual(["settings", "profile:activity"])

		stop()
		state.hash.set({ path: "settings" })
		expect(hits).toEqual(["settings", "profile:activity"])
	})

	test("supports mixed path and hash route maps", () => {
		const state = browserAt("/docs", { path: "login/new" })
		const hits = []
		const stop = state.routes({
			"/docs": () => hits.push("path:docs"),
			"#login/{step}": (_path, { step }) => hits.push(`hash:${step}`),
		})

		expect(hits).toEqual(["path:docs", "hash:new"])
		state.path.set("/docs")
		state.hash.set({ path: "login/retry" })
		expect(hits).toEqual(["path:docs", "hash:new", "hash:retry"])

		stop()
	})

	test("returns routed helpers on the cleanup function", () => {
		const state = browserAt("/a")
		const stop = state.routes({
			"/a": () => "A",
			"#b": () => "B",
		})

		expect(typeof stop).toBe("function")
		expect(typeof stop.path).toBe("function")
		expect(typeof stop.hash).toBe("function")
		expect(stop.router).toBe(stop.path.router)
		expect(stop.run("/a")).toBe("A")
		expect(stop.path("/a")).toBe("A")
		expect(stop.hash("b")).toBe("B")
		expect(stop.match("/a")?.length).toBeGreaterThan(0)

		stop()
	})

	test("empty map is a no-op cleanup with null dispatchers", () => {
		const state = browserAt()
		const stop = state.routes({})
		expect(stop.path).toBeNull()
		expect(stop.hash).toBeNull()
		expect(stop.router).toBeUndefined()
		expect(stop.run("/")).toBeUndefined()
		expect(stop()).toBe(true)
		expect(stop()).toBe(false)
	})
})

describe("Browser base path", () => {
	test("strips and prefixes an explicit base pathname", () => {
		const state = new Browser({ base: "/app" })
		state.path.set("/app/meeting/X")
		expect(state.path.value).toBe("/meeting/X")
		expect(state.location.pathFormat.format("/meeting/X")).toBe(
			"/app/meeting/X",
		)
		expect(state.location.pathFormat.format("/")).toBe("/app/")
		state.go("/team/Y")
		expect(state.path.value).toBe("/team/Y")
		expect(state.location.pathFormat.format(state.path.value)).toBe(
			"/app/team/Y",
		)
	})

	test("leaves paths unchanged without a base", () => {
		const state = new Browser()
		state.path.set("/meeting/X")
		expect(state.path.value).toBe("/meeting/X")
		expect(state.location.pathFormat.format("/meeting/X")).toBe("/meeting/X")
	})

	test("base true ignores document.baseURI when no base tag is present", () => {
		const state = new Browser({ base: true })
		state.path.set("/team/X")
		expect(state.path.value).toBe("/team/X")
		expect(state.location.pathFormat.base).toBe("")
	})
})

describe("Browser.draft", () => {
	test("does not persist until the first real edit", () => {
		const state = new Browser()
		const draft = state.draft("note", { text: "" })
		expect(draft.hasDraft).toBe(false)
		expect(draft.value).toEqual({ text: "" })
		draft.set({ text: "hello" })
		expect(draft.hasDraft).toBe(true)
		draft.clearDraft()
		expect(draft.hasDraft).toBe(false)
		draft.set({ text: "after-clear" })
		expect(draft.hasDraft).toBe(true)
		draft.clearDraft()
		draft.resetDraft({ text: "reset" })
		expect(draft.hasDraft).toBe(false)
		expect(draft.value).toEqual({ text: "reset" })
		draft.set({ text: "after-reset" })
		expect(draft.hasDraft).toBe(true)
	})

	test("falls back when localStorage access is denied", () => {
		const window = new Window({ url: "http://localhost:8000/" })
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get() {
				throw new Error("storage denied")
			},
		})
		const state = new Browser({ window })
		expect(state.hasStorage).toBe(false)
		const draft = state.draft("note", { text: "" })
		draft.set({ text: "memory" })
		expect(draft.hasDraft).toBe(true)
		expect(draft.value).toEqual({ text: "memory" })
		window.close?.()
	})
})

describe("browser singleton options", () => {
	test("recreates the singleton when the base changes", () => {
		const window = new Window({ url: "http://localhost:8000/" })
		browser.SINGLETON = undefined
		const first = browser({ window, base: "/one" })
		const second = browser({ window, base: "/two" })
		expect(second).not.toBe(first)
		expect(second.location.pathFormat.base).toBe("/two")
		browser.SINGLETON = undefined
		window.close?.()
	})
})
