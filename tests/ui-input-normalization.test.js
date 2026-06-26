import { afterEach, describe, expect, test } from "bun:test"

import { Window } from "happy-dom"

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
	const styleProto = Object.getPrototypeOf(
		window.document.createElement("div").style,
	)
	if (styleProto && !styleProto[Symbol.iterator]) {
		Object.defineProperty(styleProto, Symbol.iterator, {
			configurable: true,
			value: function* iter() {
				for (const key of Object.keys(this)) {
					if (/^[a-zA-Z-]+$/.test(key)) {
						yield key
					}
				}
			},
		})
	}
}

afterEach(() => {
	document.body.innerHTML = ""
	globalThis.window?.close?.()
})

describe("ui input normalization", () => {
	test("normalizes number inputs for inout bindings", async () => {
		const window = new Window({ url: "http://localhost:8000/input-normalization" })
		setupGlobals(window)
		const { ui } = await import("../src/js/select/ui.js")

		const Component = ui(`<input type="number" inout:value="amount" />`)
		const instance = Component.new().set({ amount: 12 }).mount(document.body)
		const input = document.querySelector("input")

		expect(input?.value).toBe("12")

		input.value = "42.5"
		input.dispatchEvent(new Event("input", { bubbles: true }))

		expect(instance.data.amount).toBe(42.5)
		expect(typeof instance.data.amount).toBe("number")
	})

	test("normalizes empty number inputs to null", async () => {
		const window = new Window({ url: "http://localhost:8000/input-normalization" })
		setupGlobals(window)
		const { ui } = await import("../src/js/select/ui.js")
		const { cell } = await import("../src/js/select/cells.js")

		const amount = cell(9)
		const Component = ui(`<input type="number" in="amount" />`)

		Component.new().set({ amount }).mount(document.body)
		const input = document.querySelector("input")

		input.value = ""
		input.dispatchEvent(new Event("input", { bubbles: true }))

		expect(amount.value).toBeNull()
	})
})

// EOF
