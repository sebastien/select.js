import { describe, expect, test } from "bun:test"

import { Window } from "happy-dom"

function setupGlobals(window) {
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
	g.NodeFilter = window.NodeFilter
}

describe("ui global link handler", () => {
	test("dispatches empty anchor click bindings to the current global callback", async () => {
		const window = new Window({ url: "http://localhost:8000/" })
		setupGlobals(window)
		const { ui, options } = await import("../src/js/select/ui/index.js")
		document.body.innerHTML = `<div id="app"></div>`

		const calls = []
		options.link = (_self, data, event) => {
			calls.push({ data, event })
			event.preventDefault()
		}
		const Component = ui(`<a href="/next" on:click>Next</a>`)
			.new()
			.set({ value: 3 })
			.mount("#app")
		const anchor = document.querySelector("a")
		const event = new MouseEvent("click", { bubbles: true, cancelable: true })
		anchor.dispatchEvent(event)

		expect(calls).toHaveLength(1)
		expect(calls[0].data).toBe(Component.data)
		expect(calls[0].event).toBe(event)
		expect(event.defaultPrevented).toBe(true)

		const replacement = () => calls.push("replacement")
		options.link = replacement
		anchor.dispatchEvent(new MouseEvent("click", { bubbles: true }))
		expect(calls.at(-1)).toBe("replacement")

		Component.unmount()
		options.link = undefined
		window.close?.()
	})

	test("treats empty on:click with out:href as a global link", async () => {
		const window = new Window({ url: "http://localhost:8000/" })
		setupGlobals(window)
		const { ui, options } = await import("../src/js/select/ui/index.js")
		document.body.innerHTML = `<div id="app"></div>`

		const calls = []
		options.link = (_self, _data, event) => {
			calls.push(event.currentTarget.getAttribute("href"))
			event.preventDefault()
		}
		const Component = ui(`<a out:href="href" on:click>Next</a>`)
			.new()
			.set({ href: "/dynamic" })
			.mount("#app")
		const anchor = document.querySelector("a")
		const event = new MouseEvent("click", { bubbles: true, cancelable: true })
		anchor.dispatchEvent(event)

		expect(calls).toEqual(["/dynamic"])
		expect(event.defaultPrevented).toBe(true)

		Component.unmount()
		options.link = undefined
		window.close?.()
	})

	test("keeps explicit anchor handlers local", async () => {
		const window = new Window({ url: "http://localhost:8000/" })
		setupGlobals(window)
		const { ui, options } = await import("../src/js/select/ui/index.js")
		document.body.innerHTML = `<div id="app"></div>`
		let local = 0
		let global = 0
		options.link = () => {
			global++
		}
		const Component = ui(`<a href="/next" on:click="track">Next</a>`)
			.does({ track: () => local++ })
			.new()
			.mount("#app")

		document.querySelector("a").dispatchEvent(new MouseEvent("click"))
		expect(local).toBe(1)
		expect(global).toBe(0)

		Component.unmount()
		options.link = undefined
		window.close?.()
	})
})
