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
}

function nextTick() {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
	document.body.innerHTML = ""
	globalThis.window?.close?.()
})

describe("ui init preloaded data", () => {
	test("passes options.data to init(self, data) before the first set", async () => {
		const window = new Window({ url: "http://localhost:8000/init-preload" })
		setupGlobals(window)
		const { ui } = await import("../src/js/select/ui.js")

		let sawSelfData = false
		let seenData = undefined
		const Component = ui(`<div out="label"></div>`)
			.init((self, data) => {
				sawSelfData = self.data === data
				seenData = data
				return { label: data?.name ?? "Missing" }
			})
			.does({
				label: (_self, { label }) => label,
			})

		const instance = Component.new(undefined, {
			data: { name: "Ada" },
		}).mount(document.body)

		expect(sawSelfData).toBe(true)
		expect(seenData).toEqual({ name: "Ada" })
		expect(document.body.textContent?.trim()).toBe("Ada")

		instance.unmount()
		window.close()
	})

	test("passes host attributes to init(self, data) for wrapped web components", async () => {
		const window = new Window({ url: "http://localhost:8000/init-webcomponent" })
		setupGlobals(window)
		const { ui, webcomponent } = await import("../src/js/select/ui.js")

		let seenData = undefined
		const Component = ui(`<div out="label"></div>`)
			.init((_self, data) => {
				seenData = data
				return { label: data?.title ?? "Missing" }
			})
			.does({
				label: (_self, { label }) => label,
			})

		const name = `x-init-props-${Date.now()}`
		webcomponent(name, Component, {})

		const element = document.createElement(name)
		element.setAttribute("title", "Hello")
		document.body.appendChild(element)
		await nextTick()

		expect(seenData).toEqual({ title: "Hello" })
		expect(element.shadowRoot.textContent.trim()).toBe("Hello")

		window.close()
	})
})
