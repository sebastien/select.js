import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let window
let select

function setupGlobals(win) {
	Object.assign(globalThis, {
		window: win,
		document: win.document,
		Node: win.Node,
		NodeList: win.NodeList,
		Element: win.Element,
		HTMLElement: win.HTMLElement,
		SVGElement: win.SVGElement,
	})
}

beforeAll(async () => {
	window = new Window()
	setupGlobals(window)
	;({ select } = await import("../src/js/select/features/query.js"))
})

afterAll(() => {
	window?.close()
})

describe("select query helpers", () => {
	test("matches native selectors and returns null for invalid selectors", () => {
		const node = document.createElement("div")
		node.className = "item"

		expect(select.match(".item", node)).toBe(true)
		expect(select.match(".missing", node)).toBe(false)
		expect(select.match("[", node)).toBeNull()
	})

	test("reads and writes JSON data through dataset", () => {
		const node = document.createElement("div")
		const selection = select(node)

		selection.data("userId", { id: 1 })
		expect(node.getAttribute("data-user-id")).toBe('{"id":1}')
		expect(selection.data("userId")).toEqual({ id: 1 })
		expect(selection.data()).toEqual({ userId: { id: 1 } })
	})

	test("uses classList for HTML and SVG elements", () => {
		const html = document.createElement("div")
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")

		select([html, svg]).addClass("active", "visible")
		expect(html.classList.contains("active")).toBe(true)
		expect(svg.classList.contains("visible")).toBe(true)
		expect(select(html).hasClass("active")).toBe(true)

		select([html, svg]).removeClass("active")
		expect(html.classList.contains("active")).toBe(false)
		expect(svg.classList.contains("active")).toBe(false)
	})

	test("gets and sets both scroll axes", () => {
		const node = document.createElement("div")
		const selection = select(node)

		selection.scrollTop(12)
		selection.scrollLeft(24)
		expect(selection.scrollTop()).toBe(12)
		expect(selection.scrollLeft()).toBe(24)
	})

	test("appends and prepends string and number text", () => {
		const node = document.createElement("div")
		node.append(document.createElement("span"))
		const selection = select(node)

		selection.append(2).prepend("first")
		expect(node.childNodes[0].textContent).toBe("first")
		expect(node.childNodes[1].nodeName).toBe("SPAN")
		expect(node.childNodes[2].textContent).toBe("2")
	})

	test("inserts relative node collections with existing ordering", () => {
		const parent = document.createElement("div")
		const first = document.createElement("span")
		const second = document.createElement("span")
		parent.append(first, second)
		const beforeA = document.createElement("i")
		const beforeB = document.createElement("b")
		const after = document.createElement("em")
		const tail = document.createElement("strong")

		select(second).before([beforeA, beforeB])
		select(first).after(after)
		select(second).after(tail)
		expect(Array.from(parent.children)).toEqual([
			after,
			first,
			beforeA,
			beforeB,
			second,
			tail,
		])
	})
})

// EOF
