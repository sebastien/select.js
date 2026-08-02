import { afterEach, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let activeWindow

function setupGlobals(window) {
	Object.assign(globalThis, {
		window,
		document: window.document,
		Node: window.Node,
		Element: window.Element,
		HTMLElement: window.HTMLElement,
		DocumentFragment: window.DocumentFragment,
		Text: window.Text,
		Comment: window.Comment,
		Document: window.Document,
		DOMParser: window.DOMParser,
		MutationObserver: window.MutationObserver,
		CustomEvent: window.CustomEvent,
		Event: window.Event,
		NodeFilter: window.NodeFilter,
		SVGElement: window.SVGElement,
		customElements: window.customElements,
	})
}

afterEach(() => {
	activeWindow?.close()
	activeWindow = undefined
})

describe("ui component definitions", () => {
	test("keeps fluent definition methods before and after binding a template", async () => {
		activeWindow = new Window()
		setupGlobals(activeWindow)
		const { ui } = await import("../src/js/select/ui.js")
		const init = () => ({ label: "Ready" })
		const behavior = { label: (_self, data) => data.label }
		const handler = () => undefined
		const cleanup = () => undefined
		const definition = ui.component("FacadeDefinition")

		expect(definition.init(init)).toBe(definition)
		expect(definition.does(behavior)).toBe(definition)
		expect(definition.on("ready", handler)).toBe(definition)
		expect(definition.sub("done", handler)).toBe(definition)
		expect(definition.cleanup(cleanup)).toBe(definition)
		expect(() => definition()).toThrow("definition is not bound")
		expect(() => definition.new()).toThrow("definition is not bound")

		const component = definition.using(`<span out="label"></span>`)
		expect(component.definition.initializer).toBe(init)
		expect(component.definition.behavior).toEqual(behavior)
		expect(component.definition.subs.get("ready")).toEqual([handler])
		expect(component.definition.subs.get("done")).toEqual([handler])
		expect(component.definition.doCleanup).toBe(cleanup)
		expect(component.does(behavior)).toBe(component)
		expect(component.on("again", handler)).toBe(component)
		expect(component.cleanup(cleanup)).toBe(component)
	})
})

// EOF
