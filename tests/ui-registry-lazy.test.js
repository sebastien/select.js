import { afterEach, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let activeWindow

function setupGlobals(window) {
	Object.assign(globalThis, {
		window,
		document: window.document,
		Node: window.Node,
		Element: window.Element,
		HTMLElement: window.HTMLElement,
		DocumentFragment: window.DocumentFragment,
		Text: window.Text,
		Comment: window.Comment,
		Document: window.Document,
		DOMParser: window.DOMParser,
		MutationObserver: window.MutationObserver,
		CustomEvent: window.CustomEvent,
		Event: window.Event,
		NodeFilter: window.NodeFilter,
		SVGElement: window.SVGElement,
		customElements: window.customElements,
	})
}

afterEach(() => {
	activeWindow?.close()
	activeWindow = undefined
})

describe("ui registry and lazy", () => {
	test("ui.register mirrors components into FORMATS for processors", async () => {
		activeWindow = new Window()
		setupGlobals(activeWindow)
		const { Dynamic, FORMATS, ui } = await import("../src/js/select/ui/index.js")

		const Badge = ui(`<span out="label"></span>`).does({
			label: (_self, { label }) => label ?? "Badge",
		})
		ui.register("Badge", Badge)

		expect(FORMATS.Badge).toBe(Badge)
		expect(ui.resolve("Badge")).toBe(Badge)

		const applied = Dynamic("Badge", { label: "Hi" })
		expect(applied).toBeTruthy()
		const host = document.createElement("div")
		applied.template.new(null, { data: applied.data }).mount(host)
		expect(host.textContent).toContain("Hi")
	})

	test("FORMATS components resolve via Dynamic without ui.register", async () => {
		activeWindow = new Window()
		setupGlobals(activeWindow)
		const { Dynamic, ui } = await import("../src/js/select/ui/index.js")

		// ui() with a named template registers into FORMATS; Dynamic should see it.
		document.body.innerHTML = `<template id="DynChip"><b out="label"></b></template>`
		const Chip = ui("#DynChip").does({
			label: (_self, { label }) => label ?? "chip",
		})
		expect(ui.formats.DynChip).toBe(Chip)

		const applied = Dynamic("DynChip", { label: "x" })
		expect(applied).toBeTruthy()
	})

	test("lazy re-renders parent when loader resolves", async () => {
		activeWindow = new Window()
		setupGlobals(activeWindow)
		const { lazy, ui } = await import("../src/js/select/ui/index.js")

		let resolveLoader
		const loader = () =>
			new Promise((resolve) => {
				resolveLoader = resolve
			})

		const Heavy = ui(`<div class="heavy">loaded</div>`)
		const placeholder = ui(`<div class="ph">loading</div>`)()
		const LazyHeavy = lazy(loader, placeholder)

		const App = ui(`<div out="content"></div>`).does({
			content: (_self, data) =>
				data.show ? LazyHeavy(data) : "idle",
		})

		const host = document.createElement("div")
		document.body.appendChild(host)
		const app = App.new()
		app.set({ show: true })
		app.mount(host)
		expect(host.textContent).toContain("loading")

		// loader() is started on a microtask after first render
		await Promise.resolve()
		expect(typeof resolveLoader).toBe("function")
		resolveLoader(Heavy)
		// allow loader then + scheduleRender microtask
		await Promise.resolve()
		await Promise.resolve()
		await new Promise((r) => setTimeout(r, 0))

		expect(host.textContent).toContain("loaded")
	})
})

// EOF
