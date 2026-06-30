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
	const styleProto = Object.getPrototypeOf(window.document.createElement("div").style)
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

describe("ui when comparison sibling exclusivity", () => {
	test("keeps sibling branches exclusive for true, false and string true", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		const { ui } = await import("../src/js/select/ui.js")

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenComparisonSiblingsRepro">
				<div>
					<span class="yes" when="value==true">yes</span>
					<span class="no" when="value!=true">no</span>
				</div>
			</template>
		`

		const instance = ui("WhenComparisonSiblingsRepro").new().mount("#app")

		instance.set({ value: true })
		expect(document.querySelectorAll("#app span")).toHaveLength(1)
		expect(document.querySelector("#app .yes")?.textContent?.trim()).toBe("yes")
		expect(document.querySelector("#app .no")).toBeNull()

		instance.set({ value: false })
		expect(document.querySelectorAll("#app span")).toHaveLength(1)
		expect(document.querySelector("#app .yes")).toBeNull()
		expect(document.querySelector("#app .no")?.textContent?.trim()).toBe("no")

		instance.set({ value: "true" })
		expect(document.querySelectorAll("#app span")).toHaveLength(1)
		expect(document.querySelector("#app .yes")).toBeNull()
		expect(document.querySelector("#app .no")?.textContent?.trim()).toBe("no")

		document.body.innerHTML = ""
		window.close?.()
	})

	test("keeps sibling custom-element branches exclusive", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		const { ui } = await import("../src/js/select/ui.js")

		if (!customElements.get("x-probe")) {
			customElements.define(
				"x-probe",
				class extends HTMLElement {
					connectedCallback() {
						this.textContent ||= this.getAttribute("label") || "probe"
					}
				},
			)
		}

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenComparisonCustomElementRepro">
				<div>
					<x-probe class="yes" when="value==true" label="yes"></x-probe>
					<x-probe class="no" when="value!=true" label="no"></x-probe>
				</div>
			</template>
		`

		const instance = ui("WhenComparisonCustomElementRepro").new().mount("#app")

		instance.set({ value: true })
		expect(document.querySelectorAll("#app x-probe")).toHaveLength(1)
		expect(document.querySelector("#app .yes")?.textContent?.trim()).toBe("yes")
		expect(document.querySelector("#app .no")).toBeNull()

		instance.set({ value: false })
		expect(document.querySelectorAll("#app x-probe")).toHaveLength(1)
		expect(document.querySelector("#app .yes")).toBeNull()
		expect(document.querySelector("#app .no")?.textContent?.trim()).toBe("no")

		document.body.innerHTML = ""
		window.close?.()
	})

	test("keeps sibling ui-icon branches exclusive", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		const originalFetch = globalThis.fetch
		globalThis.fetch = async () =>
			new Response(
				'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg>',
			)
		const { ui } = await import("../src/js/select/ui.js")
		const { install } = await import("../src/js/select/icons.js")

		install()

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenComparisonIconRepro">
				<div>
					<ui-icon class="yes" when="value==true" icon="lucide:circle-check"></ui-icon>
					<ui-icon class="no" when="value!=true" icon="lucide:circle"></ui-icon>
				</div>
			</template>
		`

		const instance = ui("WhenComparisonIconRepro").new().mount("#app")

		instance.set({ value: true })
		expect(document.querySelectorAll("#app ui-icon")).toHaveLength(1)
		expect(document.querySelector("#app .yes")).not.toBeNull()
		expect(document.querySelector("#app .no")).toBeNull()

		instance.set({ value: false })
		expect(document.querySelectorAll("#app ui-icon")).toHaveLength(1)
		expect(document.querySelector("#app .yes")).toBeNull()
		expect(document.querySelector("#app .no")).not.toBeNull()

		globalThis.fetch = originalFetch
		document.body.innerHTML = ""
		window.close?.()
	})

	test("applies when predicates inside nested returned local templates", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		const originalFetch = globalThis.fetch
		globalThis.fetch = async () =>
			new Response(
				'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg>',
			)
		const { ui } = await import("../src/js/select/ui.js")
		const { install } = await import("../src/js/select/icons.js")

		install()
		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenNestedLocalTemplateRepro">
				<div class="host" out="Value"></div>
				<template name="Boolean">
					<ui-icon class="yes" when="value==true" icon="lucide:circle-check"></ui-icon>
					<ui-icon class="no" when="value!=true" icon="lucide:circle"></ui-icon>
				</template>
			</template>
		`

		const Repro = ui("WhenNestedLocalTemplateRepro").does({
			Value() {
				return Repro.Boolean({ value: true })
			},
		})

		Repro.new().mount("#app")

		expect(document.querySelectorAll("#app ui-icon")).toHaveLength(1)
		expect(document.querySelector("#app .yes")).not.toBeNull()
		expect(document.querySelector("#app .no")).toBeNull()

		globalThis.fetch = originalFetch
		document.body.innerHTML = ""
		window.close?.()
	})
})
