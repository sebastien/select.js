import { afterAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let window

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
	g.requestAnimationFrame = win.requestAnimationFrame.bind(win)
	g.cancelAnimationFrame = win.cancelAnimationFrame.bind(win)
	g.navigator = win.navigator
	g.getComputedStyle = win.getComputedStyle.bind(win)
}

afterAll(() => window?.close())

function createWindow() {
	window?.close()
	window = new Window({ url: "http://localhost:8000/repro" })
	setupGlobals(window)
	return window
}

describe("ui out class and conditional root regressions", () => {
	test("splits enabled multi-word out:class object keys into class tokens", async () => {
		createWindow()
		const { default: ui } = await import("../src/js/select/ui/index.js")
		const tokenListPrototype = Object.getPrototypeOf(
			document.createElement("div").classList,
		)
		const nativeAdd = tokenListPrototype.add
		tokenListPrototype.add = function (...tokens) {
			for (const token of tokens) {
				if (/\s/.test(token)) {
					throw new window.DOMException("Token must not contain whitespace")
				}
			}
			return nativeAdd.apply(this, tokens)
		}

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="OutClassMultiWordRepro">
				<div class="base" out:class="classes"></div>
			</template>
		`

		const instance = ui("OutClassMultiWordRepro").new()
		instance.set({ classes: { "alpha beta": true, disabled: false } })
		expect(() => instance.mount("#app")).not.toThrow()
		expect(document.querySelector("#app .base")?.classList.contains("alpha")).toBe(true)
		expect(document.querySelector("#app .base")?.classList.contains("beta")).toBe(true)
		expect(document.querySelector("#app .base")?.classList.contains("disabled")).toBe(false)
		tokenListPrototype.add = nativeAdd
	})

	test("renders content out beneath a when-marked root in a multi-root template", async () => {
		createWindow()
		const { default: ui } = await import("../src/js/select/ui/index.js")

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenMultiRootContentOutRepro">
				<section class="conditional-root" when="visible">
					<span class="content" out="message"></span>
					<span class="attribute" out:data-message="message"></span>
				</section>
			<footer class="sibling-root">sibling</footer>
			</template>
		`

		const instance = ui("WhenMultiRootContentOutRepro").new()
		instance.set({ visible: true, message: "rendered" }).mount("#app")

		expect(document.querySelector("#app .attribute")?.getAttribute("data-message")).toBe("rendered")
		expect(document.querySelector("#app .content")?.textContent).toBe("rendered")
		expect(document.querySelector("#app .sibling-root")?.textContent).toBe("sibling")

		instance.set({ visible: false, message: "hidden" })
		expect(document.querySelector("#app .conditional-root")).toBeNull()
		instance.set({ visible: true, message: "shown again" })
		expect(document.querySelector("#app .content")?.textContent).toBe("shown again")
	})

	test("single-root wrapper renders content out beneath the conditional node", async () => {
		createWindow()
		const { default: ui } = await import("../src/js/select/ui/index.js")

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenSingleRootContentOutRepro">
				<div class="wrapper">
					<section class="conditional-root" when="visible">
						<span class="content" out="message"></span>
					</section>
					<footer class="sibling-root">sibling</footer>
				</div>
			</template>
		`

		ui("WhenSingleRootContentOutRepro").new()
			.set({ visible: true, message: "rendered" })
			.mount("#app")

		expect(document.querySelector("#app .content")?.textContent).toBe("rendered")
	})
})
