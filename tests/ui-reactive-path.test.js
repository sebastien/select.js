import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

function setupGlobals(window) {
	for (const key of [
		"window",
		"document",
		"HTMLElement",
		"Node",
		"DocumentFragment",
		"Text",
		"Comment",
		"Document",
		"Element",
		"customElements",
		"MutationObserver",
		"requestAnimationFrame",
		"HTMLInputElement",
		"HTMLSelectElement",
		"HTMLTextAreaElement",
		"HTMLFormElement",
		"Event",
		"CustomEvent",
		"DOMParser",
	]) {
		globalThis[key] = window[key]
	}
	if (!globalThis.DOMParser && window.DOMParser) {
		globalThis.DOMParser = window.DOMParser
	}
}

describe("ui reactive path updates", () => {
	test("nested cell path write updates only the leaf without remapping siblings", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		// happy-dom may expose DOMParser on window
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/cells.js")
		const { ui, remap } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const itemRenders = { a: 0, b: 0 }
		const Row = ui(`<li><span class="k" out="label"></span><span class="v" out="text"></span></li>`).does({
			label: (_self, { id }) => id,
			text: (_self, { value, id }) => {
				itemRenders[id] = (itemRenders[id] || 0) + 1
				return value
			},
		})
		const List = ui(`<ul out="items"></ul>`).does({
			items: (_self, { value }) => {
				const plain = value?.isReactive ? value.value : value
				return remap(plain, (entry) =>
					Row({ id: entry.id, value: entry.value, $key: entry.id }),
				)
			},
		})

		const state = cell([
			{ id: "a", value: "A" },
			{ id: "b", value: "B" },
		])
		const instance = List.new().set({ value: state }).mount("#app")
		// Allow reactive sub + initial paint
		await new Promise((r) => setTimeout(r, 0))

		expect(itemRenders).toEqual({ a: 1, b: 1 })
		expect(document.querySelectorAll("#app li .v")[0].textContent).toBe("A")

		state.set("A2", [0, "value"])
		await new Promise((r) => setTimeout(r, 0))

		expect(document.querySelectorAll("#app li .v")[0].textContent).toBe("A2")
		expect(document.querySelectorAll("#app li .v")[1].textContent).toBe("B")
		// Sibling row must not re-render from a path-directed leaf write.
		expect(itemRenders.b).toBe(1)
		expect(itemRenders.a).toBeGreaterThanOrEqual(2)

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("unmount releases cell subscriptions", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/cells.js")
		const { ui } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const View = ui(`<span out="text"></span>`).does({
			text: (_self, { value }) =>
				value?.isReactive ? String(value.value) : String(value),
		})
		const state = cell("hello")
		const instance = View.new().set({ value: state }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))

		expect(state.subs.length).toBeGreaterThanOrEqual(1)
		const subCount = state.subs.length

		instance.unmount()
		expect(state.subs.length).toBeLessThan(subCount)

		// Further sets must not throw or touch disposed instance.
		state.set("world")
		await new Promise((r) => setTimeout(r, 0))

		document.body.innerHTML = ""
		window.close?.()
	})

	test("array append via cell path mounts without remapping sibling rows", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/cells.js")
		const { ui, remap } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const itemRenders = {}
		const Row = ui(`<li out="text"></li>`).does({
			text: (_self, { value, id }) => {
				itemRenders[id] = (itemRenders[id] || 0) + 1
				return value
			},
		})
		const List = ui(`<ul out="items"></ul>`).does({
			items: (_self, { value }) => {
				const plain = value?.isReactive ? value.value : value
				return remap(plain, (entry, index) =>
					Row({ id: entry.id, value: entry.value, $key: index }),
				)
			},
		})

		const state = cell([
			{ id: "a", value: "A" },
			{ id: "b", value: "B" },
		])
		const instance = List.new().set({ value: state }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))
		const firstNode = document.querySelector("#app li")
		expect(itemRenders).toEqual({ a: 1, b: 1 })

		state.reconcile([
			{ id: "a", value: "A" },
			{ id: "b", value: "B" },
			{ id: "c", value: "C" },
		])
		await new Promise((r) => setTimeout(r, 0))

		const lis = Array.from(document.querySelectorAll("#app li"))
		expect(lis.map((li) => li.textContent)).toEqual(["A", "B", "C"])
		expect(lis[0]).toBe(firstNode)
		expect(itemRenders.a).toBe(1)
		expect(itemRenders.b).toBe(1)
		expect(itemRenders.c).toBe(1)

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("keyed rows keep their DOM order when earlier panels arrive later", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { ui, remap } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const Row = ui(`<li out:data-panel="id" out="label"></li>`).does({
			label: (_self, { id }) => id,
		})
		const List = ui(`<ul out="items"></ul>`).does({
			items: (_self, { items }) =>
				remap(items, ({ id }) => Row({ id, $key: id })),
		})
		const initial = [{ id: "chat" }, { id: "tools" }, { id: "files" }]
		const panels = [
			{ id: "help" },
			{ id: "chat" },
			{ id: "facts" },
			{ id: "guide" },
			{ id: "tools" },
			{ id: "checklist" },
			{ id: "files" },
		]
		const instance = List.new().set({ items: initial }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))

		const retained = new Map(
			Array.from(document.querySelectorAll("#app li")).map((node) => [
				node.dataset.panel,
				node,
			]),
		)

		instance.update({ items: panels })
		await new Promise((r) => setTimeout(r, 0))

		const rows = Array.from(document.querySelectorAll("#app li"))
		expect(rows.map((node) => node.dataset.panel)).toEqual(
			panels.map(({ id }) => id),
		)
		for (const id of ["chat", "tools", "files"]) {
			expect(rows.find((node) => node.dataset.panel === id)).toBe(retained.get(id))
		}

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("dict key remove via reconcile drops the row", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/cells.js")
		const { ui, remap } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const plain = (v) => (v?.isReactive === true ? v.value : v)
		const Row = ui(`<li out="text"></li>`).does({
			text: (_self, { key, value }) => `${key}:${plain(value)}`,
		})
		const Dict = ui(`<ul out="items"></ul>`).does({
			items: (_self, { value }) =>
				remap(plain(value), (entry, key) =>
					Row({ key, value: entry, $key: key }),
				),
		})

		const state = cell({ a: 1, b: 2 })
		const instance = Dict.new().set({ value: state }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))
		expect(document.querySelectorAll("#app li").length).toBe(2)

		state.reconcile({ a: 1 })
		await new Promise((r) => setTimeout(r, 0))

		const lis = Array.from(document.querySelectorAll("#app li"))
		expect(lis.length).toBe(1)
		expect(lis[0].textContent).toBe("a:1")

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("inspector-style dict path update changes leaf text", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/cells.js")
		const { ui, remap } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const plain = (v) => (v?.isReactive === true ? v.value : v)
		const Item = ui(
			`<li><span class="k" out="label"></span><span class="v" out-replace="value"></span></li>`,
		).does({
			label: (_self, { key }) => `${key}:`,
			value: (_self, { value }) => Scalar({ value: plain(value) }),
		})
		const Dict = ui(`<ul out="items"></ul>`).does({
			items: (_self, { value }) =>
				remap(plain(value), (entry, key) =>
					Item({ key, value: entry, $key: key }),
				),
		})
		const Scalar = ui(`<span out="text"></span>`).does({
			text: (_self, { value }) => `${plain(value)}`,
		})

		const state = cell({ type: "info", message: "hi" })
		const instance = Dict.new().set({ value: state }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))

		expect(document.body.textContent).toContain("info")
		state.reconcile({ type: "warn", message: "hi" })
		await new Promise((r) => setTimeout(r, 0))

		expect(document.body.textContent).toContain("warn")
		expect(document.body.textContent).toContain("hi")

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})
})
