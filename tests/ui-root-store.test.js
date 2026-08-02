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
	if (window.DOMParser) globalThis.DOMParser = window.DOMParser
}

describe("ui root store as instance.data", () => {
	test("set(store) binds cell and update(tree) reconciles", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)

		const cell = (await import("../src/js/select/cells.js")).default
		const { ui, remap } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const plain = (v) => (v?.isReactive === true ? v.value : v)
		const collectionOf = (data) => {
			if (data?.isReactive === true) return data.value
			if (data && typeof data === "object" && "value" in data) {
				return plain(data.value)
			}
			return data
		}

		const Row = ui(`<li out="text"></li>`).does({
			text: (_self, { label }) => label,
		})
		const List = ui(`<ul out="items"></ul>`).does({
			items: (_self, data) =>
				remap(collectionOf(data) || [], (label, i) =>
					Row({ label, $key: i }),
				),
		})

		const state = cell.store({ items: ["a", "b"] })
		// App-shaped store: tree is the cell value itself
		const App = ui(`<div out="body"></div>`).does({
			body: (_self, data) => {
				const tree = plain(data)
				return List({ value: tree.items })
			},
		})

		// Simpler: list store is the array cell
		const listState = cell.store(["a", "b"])
		const instance = List.new().set(listState).mount("#app")
		await new Promise((r) => setTimeout(r, 0))

		expect(instance.data).toBe(listState)
		expect(document.querySelectorAll("#app li").length).toBe(2)
		expect(document.body.textContent).toContain("a")

		instance.update(["a", "b", "c"])
		await new Promise((r) => setTimeout(r, 0))

		expect(listState.value).toEqual(["a", "b", "c"])
		expect(document.querySelectorAll("#app li").length).toBe(3)
		expect(document.body.textContent).toContain("c")

		listState.set("A", [0])
		await new Promise((r) => setTimeout(r, 10))
		expect(listState.value[0]).toBe("A")
		expect(document.querySelectorAll("#app li")[0].textContent).toBe("A")

		instance.unmount()
		void App
		void state
		document.body.innerHTML = ""
		window.close?.()
	})

	test("update(otherStore) rebinds root store", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)

		const cell = (await import("../src/js/select/cells.js")).default
		const { ui, remap } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const collectionOf = (data) =>
			data?.isReactive === true ? data.value : data

		const Row = ui(`<li out="text"></li>`).does({
			text: (_self, { label }) => label,
		})
		const List = ui(`<ul out="items"></ul>`).does({
			items: (_self, data) =>
				remap(collectionOf(data) || [], (label, i) =>
					Row({ label, $key: i }),
				),
		})

		const a = cell.store(["x"])
		const b = cell.store(["y", "z"])
		const instance = List.new().set(a).mount("#app")
		await new Promise((r) => setTimeout(r, 0))
		expect(
			Array.from(document.querySelectorAll("#app li")).map((n) => n.textContent),
		).toEqual(["x"])

		instance.update(b)
		await new Promise((r) => setTimeout(r, 10))
		expect(instance.data).toBe(b)
		expect(
			Array.from(document.querySelectorAll("#app li")).map((n) => n.textContent),
		).toEqual(["y", "z"])

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("root store path miss re-renders only deps of the changed tree key", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)

		const cell = (await import("../src/js/select/cells.js")).default
		const { ui } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `<div id="app"></div>`

		const counts = { title: 0, note: 0 }
		const plain = (v) => (v?.isReactive === true ? v.value : v)
		const View = ui(
			`<div><h1 out="title"></h1><p out="note"></p></div>`,
		).does({
			title: (_self, data) => {
				counts.title += 1
				return plain(data).title
			},
			note: (_self, data) => {
				counts.note += 1
				return plain(data).note
			},
		})

		const store = cell.store({ title: "Hello", note: "World" })
		const instance = View.new().set(store).mount("#app")
		await new Promise((r) => setTimeout(r, 0))
		expect(counts).toEqual({ title: 1, note: 1 })
		expect(document.querySelector("h1").textContent).toBe("Hello")

		// Nested path under `title` cannot walk into a scalar out slot; fallback
		// should still be granular so `note` does not re-run.
		store.set("Hi", ["title"])
		await new Promise((r) => setTimeout(r, 10))
		expect(document.querySelector("h1").textContent).toBe("Hi")
		expect(counts.title).toBeGreaterThanOrEqual(2)
		expect(counts.note).toBe(1)

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})
})
