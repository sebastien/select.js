// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-18
// Updated: 2026-09-23

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let window
let load
let install
let resolve
let Cache
let IconContainer
let fetchCalls
let fetchStub
let originalFetch
let originalDateNow
let now

function setupGlobals(win) {
	win.SyntaxError = SyntaxError
	win.TypeError = TypeError
	win.Error = Error
	const g = globalThis
	g.window = win
	g.document = win.document
	g.Node = win.Node
	g.Element = win.Element
	g.HTMLElement = win.HTMLElement
	g.DocumentFragment = win.DocumentFragment
	g.Text = win.Text
	g.Comment = win.Comment
	g.Document = win.Document
	g.DOMParser = win.DOMParser
	g.MutationObserver = win.MutationObserver
	g.CustomEvent = win.CustomEvent
	g.Event = win.Event
	g.MouseEvent = win.MouseEvent
	g.KeyboardEvent = win.KeyboardEvent
	g.NodeFilter = win.NodeFilter
	g.SVGElement = win.SVGElement
	g.customElements = win.customElements
	g.requestAnimationFrame = (fn) => setTimeout(fn, 0)
	g.cancelAnimationFrame = (id) => clearTimeout(id)
	g.navigator = win.navigator
	g.getComputedStyle = win.getComputedStyle.bind(win)
}

function makeContainer() {
	return document.createElementNS("http://www.w3.org/2000/svg", "svg")
}

function svgSource(name) {
	return { url: `https://icons.test/${name}.svg` }
}

function response(text) {
	return Promise.resolve({ text: () => Promise.resolve(text) })
}

describe("icons.load", () => {
	beforeAll(async () => {
		window = new Window({ url: "http://localhost:8000/icons" })
		setupGlobals(window)
		originalFetch = globalThis.fetch
		originalDateNow = Date.now
		;({ load, install, resolve, Cache, IconContainer } = await import(
			"../src/js/select/features/icons.js"
		))
	})

	afterAll(() => {
		globalThis.fetch = originalFetch
		Date.now = originalDateNow
		// The icons module is a process-wide singleton under `bun test`, so the
		// symbols loaded here with the mocked fetch would otherwise be reused by
		// later integration tests. Clear both the cache and the shared container.
		Cache.clear()
		for (const child of [...IconContainer.children]) {
			child.remove()
		}
		window?.close()
	})

	beforeEach(() => {
		document.body.innerHTML = ""
		fetchCalls = []
		now = 0
		Date.now = () => now
		fetchStub = (...args) => {
			fetchCalls.push(args)
			return response('<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>')
		}
		globalThis.fetch = fetchStub
	})

	test("installs multiple icon element names with distinct constructors", () => {
		const firstName = "ui-icon-test-a"
		const secondName = "ui-icon-test-b"
		install(firstName)
		install(secondName)

		expect(customElements.get(firstName)).toBeDefined()
		expect(customElements.get(secondName)).toBeDefined()
		expect(customElements.get(firstName)).not.toBe(customElements.get(secondName))
	})

	test("renders inline icon SVGs as blocks to avoid baseline spacing", async () => {
		const name = "ui-icon-test-alignment"
		install(name)
		const element = document.createElement(name)
		element.setAttribute("icon", "home")
		document.body.appendChild(element)
		await load("home", "lucide")

		expect(element.shadowRoot.querySelector("svg").style.display).toBe("block")
	})

	test("loads built-in families as individual SVGs", async () => {
		const cache = new Map()
		const container = makeContainer()

		await load("home", "lucide", container, cache)
		await load("home", "iconoir", container, cache)
		await load("home", "eva", container, cache)
		await load("home", "tabler", container, cache)

		expect(fetchCalls.map(([url]) => url)).toEqual([
			"https://cdn.jsdelivr.net/npm/lucide-static@1.54.0/icons/home.svg",
			"https://cdn.jsdelivr.net/npm/iconoir@7.12.1/icons/regular/home.svg",
			"https://cdn.jsdelivr.net/npm/eva-icons@1.1.3/outline/svg/home-outline.svg",
			"https://cdn.jsdelivr.net/npm/@tabler/icons@3.49.0/icons/outline/home.svg",
		])
	})

	test("does not fetch a collection for an unknown source", async () => {
		const cache = new Map()
		const container = makeContainer()

		const symbol = await load("home", "not-a-real-source", container, cache)

		expect(symbol).toBeUndefined()
		expect(fetchCalls).toHaveLength(0)
		expect(container.children.length).toBe(0)
	})

	test("applies eva fill style and outline filename", async () => {
		const cache = new Map()
		const container = makeContainer()

		const symbol = await load("heart", "eva-outline", container, cache)

		expect(fetchCalls[0][0]).toBe(
			"https://cdn.jsdelivr.net/npm/eva-icons@1.1.3/outline/svg/heart-outline.svg",
		)
		expect(symbol?.firstElementChild?.getAttribute("fill")).toBe(
			"var(--color-icon,currentColor)",
		)
		expect(symbol?.firstElementChild?.getAttribute("stroke")).toBe("none")
	})

	test("loads standardized Iconify collections from an explicit source", async () => {
		globalThis.fetch = (url) => {
			fetchCalls.push([url])
			return Promise.resolve({
				json: () =>
					Promise.resolve({
						prefix: "carbon",
						width: 20,
						height: 10,
						icons: { home: { body: '<path d="M0 0h20v10z"/>' } },
						aliases: { mirrored: { parent: "home", hFlip: true } },
					}),
			})
		}
		const cache = new Map()
		const container = makeContainer()

		const source = {
			format: "iconify",
			url: "https://cdn.jsdelivr.net/npm/@iconify-json/carbon/icons.json",
		}
		const symbol = await load("mirrored", source, container, cache)
		const home = await load("home", source, container, cache)

		expect(fetchCalls[0][0]).toBe(
			"https://cdn.jsdelivr.net/npm/@iconify-json/carbon/icons.json",
		)
		expect(fetchCalls).toHaveLength(1)
		expect(home).not.toBe(symbol)
		expect(symbol?.firstElementChild?.getAttribute("viewBox")).toBe("0 0 20 10")
		expect(symbol?.querySelector("g")?.getAttribute("transform")).toContain("scale(-1 1)")
	})

	test("preserves Iconify paint attributes", async () => {
		globalThis.fetch = () =>
			Promise.resolve({
				json: () =>
					Promise.resolve({
						prefix: "test",
						icons: {
							outline: {
								body: '<path fill="none" stroke="currentColor" stroke-width="2" d="M0 0h1"/>',
							},
							filled: { body: '<path fill="currentColor" d="M0 0h1v1z"/>' },
						},
					}),
			})
		const cache = new Map()
		const container = makeContainer()

		const source = {
			format: "iconify",
			url: "https://icons.test/test.json",
		}
		const outline = await load("outline", source, container, cache)
		const filled = await load("filled", source, container, cache)

		expect(outline?.querySelector("path")?.getAttribute("stroke-width")).toBe("2")
		expect(outline?.querySelector("path")?.getAttribute("fill")).toBe("none")
		expect(filled?.querySelector("path")?.getAttribute("fill")).toBe("currentColor")
	})

	test("retries after backoff for a transient load failure", async () => {
		let attempts = 0
		globalThis.fetch = (url) => {
			fetchCalls.push([url])
			attempts += 1
			return attempts === 1
				? Promise.reject(new Error("temporary outage"))
				: response('<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>')
		}
		const cache = new Map()
		const container = makeContainer()

		const first = await load("alert-circle", svgSource("retry"), container, cache)
		expect(first).toBeUndefined()
		expect(cache.size).toBe(1)
		expect(container.children.length).toBe(0)

		const second = await load("alert-circle", svgSource("retry"), container, cache)
		expect(second).toBeUndefined()
		expect(fetchCalls).toHaveLength(1)

		now = 250
		const third = await load("alert-circle", svgSource("retry"), container, cache)
		expect(fetchCalls).toHaveLength(2)
		expect(third?.id).toContain("icon-alert-circle")
		expect(cache.size).toBe(1)
		expect(container.children.length).toBe(1)
	})

	test("stops retrying after three backoff retries", async () => {
		globalThis.fetch = (url) => {
			fetchCalls.push([url])
			return Promise.reject(new Error("missing"))
		}
		const cache = new Map()
		const container = makeContainer()

		await load("missing", svgSource("missing"), container, cache)
		expect(fetchCalls).toHaveLength(1)

		now = 250
		await load("missing", svgSource("missing"), container, cache)
		expect(fetchCalls).toHaveLength(2)

		now = 750
		await load("missing", svgSource("missing"), container, cache)
		expect(fetchCalls).toHaveLength(3)

		now = 1750
		await load("missing", svgSource("missing"), container, cache)
		expect(fetchCalls).toHaveLength(4)

		now = 10000
		const result = await load("missing", svgSource("missing"), container, cache)
		expect(result).toBeUndefined()
		expect(fetchCalls).toHaveLength(4)
		expect(cache.size).toBe(1)
		expect(container.children.length).toBe(0)
	})

	test("reuses the cached result after a successful load", async () => {
		const cache = new Map()
		const container = makeContainer()

		const first = await load("check", svgSource("cache"), container, cache)
		const second = await load("check", svgSource("cache"), container, cache)

		expect(fetchCalls).toHaveLength(1)
		expect(first).toBe(second)
		expect(cache.size).toBe(1)
		expect(container.children.length).toBe(1)
	})

	test("preserves basic svg shapes", async () => {
		globalThis.fetch = () =>
			response('<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>')
		const cache = new Map()
		const container = makeContainer()

		const symbol = await load("square", svgSource("shapes"), container, cache)
		const icon = symbol?.firstElementChild

		expect(icon?.tagName.toLowerCase()).toBe("svg")
		expect(icon?.getAttribute("viewBox")).toBe("0 0 1 1")
		expect(icon?.querySelector("path")?.getAttribute("d")).toBe("M0 0h1v1z")
	})

	test("removes disallowed active elements", async () => {
		globalThis.fetch = () =>
			response('<svg viewBox="0 0 1 1"><script/><path d="M0 0h1v1z"/></svg>')
		const cache = new Map()
		const container = makeContainer()

		const symbol = await load("square", svgSource("active"), container, cache)
		const icon = symbol?.firstElementChild

		expect(icon?.querySelector("script")).toBeNull()
		expect(icon?.querySelector("path")).not.toBeNull()
	})

	test("removes event handler attributes", async () => {
		globalThis.fetch = () =>
			response('<svg viewBox="0 0 1 1" onclick="x"><path d="M0 0h1v1z" onclick="x"/></svg>')
		const cache = new Map()
		const container = makeContainer()

		const symbol = await load("square", svgSource("events"), container, cache)
		const icon = symbol?.firstElementChild
		const path = icon?.querySelector("path")

		expect(icon?.hasAttribute("onclick")).toBe(false)
		expect(path?.hasAttribute("onclick")).toBe(false)
	})

	test("strips non-local url attributes", async () => {
		globalThis.fetch = () =>
			response(
				'<svg viewBox="0 0 1 1"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><path fill="url(#g)" href="#g" xlink:href="https://bad.invalid/icon.svg#x"/></svg>',
			)
		const cache = new Map()
		const container = makeContainer()

		const symbol = await load("square", svgSource("urls"), container, cache)
		const path = symbol?.querySelector("path")

		expect(path?.getAttribute("fill")).toBe("url(#g)")
		expect(path?.getAttribute("href")).toBe("#g")
		expect(path?.hasAttribute("xlink:href")).toBe(false)
	})

	test("loads filled variants as individual SVGs", async () => {
		const cache = new Map()
		const container = makeContainer()

		await load("bookmark", "iconoir-solid", container, cache)
		await load("home-fill", "eva-fill", container, cache)
		await load("home", "tabler-filled", container, cache)
		await load("account", "mdi", container, cache)

		expect(fetchCalls.map(([url]) => url)).toEqual([
			"https://cdn.jsdelivr.net/npm/iconoir@7.12.1/icons/solid/bookmark.svg",
			"https://cdn.jsdelivr.net/npm/eva-icons@1.1.3/fill/svg/home.svg",
			"https://cdn.jsdelivr.net/npm/@tabler/icons@3.49.0/icons/filled/home.svg",
			"https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/account.svg",
		])
		expect(
			container.querySelector("#icon-account-mdi")?.firstElementChild?.getAttribute("fill"),
		).toBe("var(--color-icon,currentColor)")
	})

	test("loads material and radix families as individual SVGs", async () => {
		const cache = new Map()
		const container = makeContainer()

		// Iconify convention: the bare name is the filled style; `-outline` is
		// hollow. `add-home-fill` is the same as `add-home` (redundant suffix).
		await load("add-home", "material-symbols", container, cache)
		await load("add-home-fill", "material-symbols", container, cache)
		await load("add-home-outline", "material-symbols", container, cache)
		await load("home-outline-rounded", "material-symbols-rounded", container, cache)
		await load("add-home", "material-icons", container, cache)
		await load("add-home", "material-icons-two-tone", container, cache)
		await load("align-left", "radix-icons", container, cache)

		expect(fetchCalls.map(([url]) => url)).toEqual([
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.48.0/outlined/add_home-fill.svg",
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.48.0/outlined/add_home-fill.svg",
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.48.0/outlined/add_home.svg",
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.48.0/rounded/home.svg",
			"https://cdn.jsdelivr.net/npm/@material-design-icons/svg@0.14.15/filled/add_home.svg",
			"https://cdn.jsdelivr.net/npm/@material-design-icons/svg@0.14.15/two-tone/add_home.svg",
			"https://cdn.jsdelivr.net/gh/radix-ui/icons@d166d5ab1669b26d8854f50f8304296d54a7a410/packages/radix-icons/icons/align-left.svg",
		])
		expect(
			container.querySelector("#icon-add-home-material-symbols")?.firstElementChild?.getAttribute("fill"),
		).toBe("var(--color-icon,currentColor)")
		expect(
			container.querySelector("#icon-add-home-material-icons")?.firstElementChild?.getAttribute("stroke"),
		).toBe("none")
		// Radix paths already use `currentColor`, so no fill override is applied.
		const radix = container.querySelector("#icon-align-left-radix-icons")
		expect(radix?.firstElementChild?.hasAttribute("fill")).toBe(false)
	})

	test("maps Iconify-style Material Symbols style suffixes to folders", async () => {
		const cache = new Map()
		const container = makeContainer()

		await load("expand-rounded", "material-symbols", container, cache)
		await load("expand-outline-rounded", "material-symbols", container, cache)
		await load(
			"arrow-selector-tool-rounded",
			"material-symbols-light",
			container,
			cache,
		)
		await load(
			"arrow-selector-tool",
			"material-symbols-light-rounded",
			container,
			cache,
		)
		await load(
			"arrow-selector-tool-outline-rounded",
			"material-symbols-light-rounded",
			container,
			cache,
		)
		// A name that merely contains `outline` is not an outline marker.
		await load("check-box-outline-blank", "material-symbols", container, cache)

		expect(fetchCalls.map(([url]) => url)).toEqual([
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.48.0/rounded/expand-fill.svg",
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.48.0/rounded/expand.svg",
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-200@0.48.0/rounded/arrow_selector_tool-fill.svg",
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-200@0.48.0/rounded/arrow_selector_tool-fill.svg",
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-200@0.48.0/rounded/arrow_selector_tool.svg",
			"https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.48.0/outlined/check_box_outline_blank-fill.svg",
		])
	})

	test("loads Siemens iX icons as individual SVGs", async () => {
		const cache = new Map()
		const container = makeContainer()

		const symbol = await load("drag-gripper", "ix", container, cache)

		expect(fetchCalls.map(([url]) => url)).toEqual([
			"https://cdn.jsdelivr.net/npm/@siemens/ix-icons@3.5.0/svg/drag-gripper.svg",
		])
		expect(symbol?.firstElementChild?.getAttribute("fill")).toBe(
			"var(--color-icon,currentColor)",
		)
	})

	test("resolve reports the target url without fetching", () => {
		expect(
			resolve("arrow-selector-tool-rounded", "material-symbols-light"),
		).toMatchObject({
			name: "arrow-selector-tool-rounded",
			fileName: "rounded/arrow_selector_tool-fill",
			url: "https://cdn.jsdelivr.net/npm/@material-symbols/svg-200@0.48.0/rounded/arrow_selector_tool-fill.svg",
		})
		expect(
			resolve("arrow-selector-tool-outline-rounded", "material-symbols-light"),
		).toMatchObject({
			name: "arrow-selector-tool-outline-rounded",
			fileName: "rounded/arrow_selector_tool",
			url: "https://cdn.jsdelivr.net/npm/@material-symbols/svg-200@0.48.0/rounded/arrow_selector_tool.svg",
		})
		expect(resolve("home", "not-a-real-source")).toBeUndefined()
		expect(fetchCalls).toHaveLength(0)
	})

	test("maps Iconify-style Tabler and Iconoir style suffixes to folders", async () => {
		const cache = new Map()
		const container = makeContainer()

		await load("adjustments", "tabler", container, cache)
		await load("adjustments-filled", "tabler", container, cache)
		await load("adjustments", "tabler-filled", container, cache)
		await load("adobe-after-effects", "iconoir", container, cache)
		await load("adobe-after-effects-solid", "iconoir", container, cache)

		expect(fetchCalls.map(([url]) => url)).toEqual([
			"https://cdn.jsdelivr.net/npm/@tabler/icons@3.49.0/icons/outline/adjustments.svg",
			"https://cdn.jsdelivr.net/npm/@tabler/icons@3.49.0/icons/filled/adjustments.svg",
			"https://cdn.jsdelivr.net/npm/@tabler/icons@3.49.0/icons/filled/adjustments.svg",
			"https://cdn.jsdelivr.net/npm/iconoir@7.12.1/icons/regular/adobe-after-effects.svg",
			"https://cdn.jsdelivr.net/npm/iconoir@7.12.1/icons/solid/adobe-after-effects.svg",
		])
	})
})

// EOF
