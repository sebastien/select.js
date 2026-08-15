import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let windowOf

const window = new Window()
Object.assign(globalThis, {
	window,
	document: window.document,
	DOMParser: window.DOMParser,
	Node: window.Node,
	Element: window.Element,
	HTMLElement: window.HTMLElement,
	DocumentFragment: window.DocumentFragment,
	Text: window.Text,
	Comment: window.Comment,
	Document: window.Document,
	MutationObserver: window.MutationObserver,
	CustomEvent: window.CustomEvent,
	Event: window.Event,
	NodeFilter: window.NodeFilter,
	SVGElement: window.SVGElement,
	customElements: window.customElements,
})

const module = await import("../src/js/select/ui/virtual.js")
windowOf = module.windowOf

describe("virtual grid window", () => {
	test("computes columns, rows, spacers, and an overscanned range", () => {
		const result = windowOf({
			count: 1000,
			viewportWidth: 400,
			viewportHeight: 200,
			scrollTop: 720,
			cellWidth: 82,
			cellHeight: 72,
			gap: 8,
			overscan: 1,
		})

		expect(result.columns).toBe(4)
		expect(result.rows).toBe(250)
		expect(result.start).toBe(32)
		expect(result.end).toBe(52)
		expect(result.offsetY).toBe(640)
		expect(result.totalHeight).toBe(19992)
	})

test("supports a fixed column count and empty data", () => {
		expect(windowOf({ count: 9, columns: 3, viewportHeight: 100, cellHeight: 20 }).columns).toBe(3)
		expect(windowOf({ count: 0 }).count).toBe(0)
		expect(windowOf({ count: 0 }).totalHeight).toBe(0)
	})

	test("mounts a bounded pool of normal item components", async () => {
		const { ui, virtual } = await import("../src/js/select/ui/index.js")
		const item = ui(`<button out="label"></button>`).does({
			label: (_self, data) => data.label,
		})
		const Grid = virtual({ item, columns: 4, cellHeight: 20, gap: 0, overscan: 1 })
		const instance = Grid.new().set({
			count: 1000,
			itemAt: (index) => ({ label: String(index) }),
		})
		instance.mount(document.body)

		expect(document.body.querySelectorAll("button").length).toBeLessThan(100)
		expect(document.body.querySelector("button")?.textContent).toBe("0")
		instance.dispose()
	})
})

// EOF
