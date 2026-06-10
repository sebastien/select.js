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

describe("ui browser.parse ownership", () => {
	test("releases initializer-owned parsed selections on unmount", async () => {
		const window = new Window({ url: "http://localhost:8000/ownership" })
		setupGlobals(window)
		const { ui } = await import("../src/js/select/ui.js")
		const { Browser } = await import("../src/js/select/browser.js")
		const instanceBrowser = new Browser()
		const Component = ui("<div></div>").init(() => ({
			user: instanceBrowser.parse("@users:ada"),
		}))

		const instance = Component.new().mount(document.body)
		const user = instance.data.user

		expect(user._refs).toBe(2)

		instance.unmount()
		await nextTick()

		expect(user._refs).toBe(0)
		expect(instanceBrowser.internal("users")._selectionCache.size).toBe(0)
	})

	test("releases attribute-processor parsed selections on disconnect", async () => {
		const window = new Window({ url: "http://localhost:8000/webcomponent" })
		setupGlobals(window)
		const { ui, webcomponent } = await import("../src/js/select/ui.js")
		const { Browser } = await import("../src/js/select/browser.js")
		const instanceBrowser = new Browser()
		const Component = ui("<div></div>")
		const name = `x-parse-ownership-${Date.now()}`

		webcomponent(name, Component, {
			user: instanceBrowser.parse,
		})

		const element = document.createElement(name)
		element.setAttribute("user", "@users:ada")
		document.body.appendChild(element)
		await nextTick()

		const user = element.instance.data.user
		expect(user._refs).toBe(2)

		element.remove()
		await nextTick()

		expect(user._refs).toBe(0)
		expect(instanceBrowser.internal("users")._selectionCache.size).toBe(0)
	})
})
