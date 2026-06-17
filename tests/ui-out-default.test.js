// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-15
// Updated: 2026-06-15

import { afterAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let _window
const tick = () => new Promise((r) => setTimeout(r, 10))

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

describe("[default] out=cell?defaultValue", () => {
	afterAll(() => {
		if (_window) _window.close()
	})

	test("default value when cell is undefined", async () => {
		_window = new Window({ url: "http://localhost:8000/test" })
		setupGlobals(_window)
		const { default: ui } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="DefRepro">
				<span out="name?'N/A'"></span>
			</template>
		`
		const Comp = ui("DefRepro")
		const instance = Comp.new().set({ name: undefined }).mount("#app")
		instance.render()
		await tick()
		instance.render()
		await tick()

		const span = document.querySelector("#app span")
		expect(span.textContent).toBe("N/A")
	})

	test("default value not applied when cell has a value", async () => {
		_window = new Window({ url: "http://localhost:8000/test" })
		setupGlobals(_window)
		const { default: ui } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="DefRepro2">
				<span out="name?'N/A'">Placeholder</span>
			</template>
		`
		const Comp = ui("DefRepro2")
		const instance = Comp.new().set({ name: "Alice" }).mount("#app")
		instance.render()
		await tick()
		instance.render()
		await tick()

		const span = document.querySelector("#app span")
		expect(span.textContent).toBe("Alice")
	})
})

// EOF
