import { beforeAll, afterAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let window
let html

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
}

beforeAll(async () => {
	window = new Window({ url: "http://localhost:8000/formats" })
	setupGlobals(window)
	;({ html } = await import("../src/js/select/formats.js"))
})

afterAll(() => {
	window?.close?.()
})

describe("formats.html", () => {
	test("returns a node for a single root element", () => {
		const value = html("<div class=\"box\">hello</div>")
		expect(value.nodeType).toBe(Node.ELEMENT_NODE)
		expect(value.tagName).toBe("DIV")
		expect(value.className).toBe("box")
		expect(value.textContent).toBe("hello")
	})

	test("returns a fragment for multiple root nodes", () => {
		const value = html("<div>hello</div><span>world</span>")
		expect(value.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE)
		expect(value.childNodes.length).toBe(2)
		expect(value.firstElementChild.tagName).toBe("DIV")
		expect(value.lastElementChild.tagName).toBe("SPAN")
	})
})

