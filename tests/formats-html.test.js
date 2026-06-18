import { beforeAll, afterAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let window
let html
let hi
let asDate
let date
let day
let time
let datetime
let month
let format
let timetuple
let fromTimestamp

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
	;({ html, hi, asDate, date, day, time, datetime, month, format, timetuple } = await import("../src/js/select/formats.js"))
	;({ fromTimestamp } = await import("../src/js/select/utils/dates.js"))
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

	test("highlights matching text in html", () => {
		const value = hi("Tanzania", "an")
		expect(value.nodeType).toBe(Node.ELEMENT_NODE)
		expect(value.tagName).toBe("SPAN")
		expect(value.textContent).toBe("Tanzania")
		expect(value.querySelectorAll("mark").length).toBe(2)
		expect(value.querySelectorAll("mark")[0]?.textContent).toBe("an")
	})

	test("parses YYYY-MM-DD as UTC midnight", () => {
		expect(asDate("2026-06-11").toISOString()).toBe("2026-06-11T00:00:00.000Z")
	})

	test("parses YYYY-MM-DDTHH:mm:SS as UTC", () => {
		expect(asDate("2026-06-11T13:45:09").toISOString()).toBe("2026-06-11T13:45:09.000Z")
	})

	test("parses date tuples from the dates module", () => {
		const value = asDate([2026, 6, 11, 13, 45, 9])
		expect(value).toBeInstanceOf(Date)
		expect(value.getFullYear()).toBe(2026)
		expect(value.getMonth() + 1).toBe(6)
		expect(value.getDate()).toBe(11)
		expect(value.getHours()).toBe(13)
		expect(value.getMinutes()).toBe(45)
		expect(value.getSeconds()).toBe(9)
	})

	test("parses epoch timestamps in seconds", () => {
		const value = asDate(1781185509)
		expect(value.toISOString()).toBe("2026-06-11T13:45:09.000Z")
	})

	test("does not treat DateNum values as epoch timestamps", () => {
		const value = asDate(fromTimestamp(1781185509))
		expect(value.getUTCFullYear()).not.toBe(2026)
	})

	test("formats dates module values consistently", () => {
		const tuple = [2026, 6, 11, 13, 45, 9]
		expect(date(tuple)).toBe("2026-06-11")
		expect(month(tuple)).toBe("06")
		expect(day(tuple)).toBe("11")
		expect(time(tuple)).toBe("13:45:09")
		expect(datetime(tuple)).toBe("2026-06-11 13:45:09")
		const value = timetuple(1781185509)
		expect(value).toBeInstanceOf(Date)
		expect(value.getUTCFullYear()).toBe(2026)
		expect(value.getUTCMonth() + 1).toBe(6)
		expect(value.getUTCDate()).toBe(11)
	})

	test("supports month and day name formats", () => {
		const tuple = [2026, 6, 11, 13, 45, 9]
		expect(format("monthname")(tuple)).toBe("June")
		expect(format("dayname")(tuple)).toBe("Thursday")
	})
})
