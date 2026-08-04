import { describe, expect, test } from "bun:test"
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

describe("ui.load json", () => {
	test("loads and caches JSON resources by content type", async () => {
		const window = new Window({ url: "http://localhost:8000/ui-load-json" })
		setupGlobals(window)
		const { default: ui } = await import(
			`../src/js/select/ui/index.js?ui-load-json=${Date.now()}`
		)
		const originalFetch = globalThis.fetch
		let count = 0
		globalThis.fetch = async (input) => {
			count += 1
			expect(input).toBe("http://localhost:8000/api/config")
			return new Response('{"theme":"dark","flags":{"debug":true}}', {
				headers: { "content-type": "application/json; charset=utf-8" },
			})
		}

		try {
			const first = await ui.load("/api/config")
			const second = await ui.load("/api/config")

			expect(first.type).toBe("json")
			expect(first.data).toEqual({ theme: "dark", flags: { debug: true } })
			expect(second).toBe(first)
			expect(count).toBe(1)
		} finally {
			globalThis.fetch = originalFetch
			window.close?.()
		}
	})

	test("loads JSON resources from .json urls without a JSON content type", async () => {
		const window = new Window({ url: "http://localhost:8000/ui-load-json-ext" })
		setupGlobals(window)
		const { default: ui } = await import(
			`../src/js/select/ui/index.js?ui-load-json-ext=${Date.now()}`
		)
		const originalFetch = globalThis.fetch
		globalThis.fetch = async (input) => {
			expect(input).toBe("http://localhost:8000/data/page.json")
			return new Response('{"title":"Hello"}', {
				headers: { "content-type": "text/plain" },
			})
		}

		try {
			const resource = await ui.load("/data/page.json")
			expect(resource.type).toBe("json")
			expect(resource.data).toEqual({ title: "Hello" })
		} finally {
			globalThis.fetch = originalFetch
			window.close?.()
		}
	})
})

// EOF
