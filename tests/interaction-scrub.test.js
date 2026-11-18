import { afterEach, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { scrub } from "../src/js/select/features/interaction/scrub.js"

let activeWindow

function setup() {
	activeWindow = new Window({
		innerWidth: 1000,
		innerHeight: 800,
	})
	Object.assign(globalThis, {
		window: activeWindow,
		document: activeWindow.document,
		Node: activeWindow.Node,
		Element: activeWindow.Element,
		HTMLElement: activeWindow.HTMLElement,
	})
	return activeWindow
}

function field(attributes = {}, parent = activeWindow.document.body) {
	const input = activeWindow.document.createElement("input")
	input.className = "scrub"
	input.type = "number"
	for (const [name, value] of Object.entries(attributes)) {
		input.setAttribute(name, value)
	}
	parent.append(input)
	return input
}

function pointer(node, type, x, init = {}) {
	const event = new activeWindow.PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		isPrimary: true,
		button: 0,
		pointerId: 1,
		clientX: x,
		...init,
	})
	node.dispatchEvent(event)
	return event
}

// Presses `input` at the first point, then moves through the others.
function press(input, [x, ...moves], init = {}) {
	const down = pointer(input, "pointerdown", x)
	for (const to of moves) {
		pointer(input, "pointermove", to, init)
	}
	return down
}

function release(input, x) {
	return pointer(input, "pointerup", x)
}

function record(input) {
	const events = []
	input.addEventListener("input", () => events.push(`input:${input.value}`))
	input.addEventListener("change", () => events.push(`change:${input.value}`))
	return events
}

function pressEscape(node) {
	node.dispatchEvent(
		new activeWindow.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
	)
}

afterEach(() => {
	activeWindow?.close()
	activeWindow = undefined
})

describe("interaction scrub", () => {
	test("moves one step per pixel from the press point", () => {
		const window = setup()
		const stop = scrub(window.document)
		const input = field({ value: "10", step: "1" })
		const down = press(input, [100, 105])
		expect(down.defaultPrevented).toBe(true)
		expect(input.value).toBe("15")
		// The pointer may leave the field while scrubbing.
		pointer(window.document.body, "pointermove", 110)
		expect(input.value).toBe("20")
		release(input, 110)

		const coarse = field({ value: "0", min: "0", step: "5" })
		press(coarse, [0, 4])
		expect(coarse.value).toBe("20")
		release(coarse, 4)
		stop()
	})

	test("scrubs ten times faster with Shift", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "0", step: "1" })
		press(input, [100, 110], { shiftKey: true })
		expect(input.value).toBe("100")
		// Modifiers are read on every move.
		pointer(input, "pointermove", 115)
		expect(input.value).toBe("105")
		release(input, 115)
	})

	test("scrubs finer with Alt and stays on the step grid", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "0", step: "10" })
		const events = record(input)
		press(input, [0, 4, 10, 24, 31], { altKey: true })
		expect(input.value).toBe("30")
		expect(events).toEqual(["input:10", "input:20", "input:30"])
		release(input, 31)
	})

	test("snaps decimal steps without float noise", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "0", step: "0.1" })
		const events = record(input)
		press(input, [0, 4, 5, 6, 7, 8, 9])
		expect(events).toEqual(["input:0.4", "input:0.5", "input:0.6", "input:0.7", "input:0.8", "input:0.9"])
		// Alt: 0.9 - 0.06 = 0.84, then - 0.24 = 0.6, always on the 0.1 grid.
		pointer(input, "pointermove", 3, { altKey: true })
		expect(input.value).toBe("0.8")
		pointer(input, "pointermove", -21, { altKey: true })
		expect(input.value).toBe("0.6")
		release(input, -21)

		const offset = field({ value: "0.05", min: "0.05", step: "0.1" })
		press(offset, [0, 4])
		expect(offset.value).toBe("0.45")
		release(offset, 4)
	})

	test("clamps to min and max without a dead zone", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "5", min: "0", max: "10", step: "1" })
		press(input, [0, 20])
		expect(input.value).toBe("10")
		pointer(input, "pointermove", 17)
		expect(input.value).toBe("7")
		pointer(input, "pointermove", -100)
		expect(input.value).toBe("0")
		release(input, -100)

		const offGrid = field({ value: "90", min: "0", max: "95", step: "10" })
		press(offGrid, [0, 20])
		expect(offGrid.value).toBe("90")
		release(offGrid, 20)
	})

	test("fires input while scrubbing and a single change on release", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "0", step: "1" })
		const events = record(input)
		press(input, [0, 5, 6, 6, 8])
		expect(input.classList.contains("active")).toBe(true)
		release(input, 8)
		expect(events).toEqual(["input:5", "input:6", "input:8", "change:8"])
		expect(input.classList.contains("active")).toBe(false)
		expect(window.document.activeElement).not.toBe(input)
		// The gesture listeners are gone after release.
		pointer(input, "pointermove", 50)
		expect(input.value).toBe("8")
	})

	test("does not fire change when the value returns to its start", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "5", step: "1" })
		const events = record(input)
		press(input, [0, 5, 0])
		release(input, 0)
		expect(events).toEqual(["input:10", "input:5"])
	})

	test("a click without travel focuses and selects the field", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "7", step: "1" })
		const events = record(input)
		let selected = false
		input.select = () => {
			selected = true
		}
		press(input, [100, 102, 97])
		expect(input.classList.contains("active")).toBe(false)
		release(input, 97)
		expect(window.document.activeElement).toBe(input)
		expect(selected).toBe(true)
		expect(input.value).toBe("7")
		expect(events).toEqual([])
	})

	test("leaves a focused field to text editing", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "7", step: "1" })
		input.focus()
		const down = press(input, [0, 20])
		release(input, 20)
		expect(down.defaultPrevented).toBe(false)
		expect(input.value).toBe("7")
	})

	test("ignores disabled and read-only fields", () => {
		const window = setup()
		scrub(window.document)
		for (const attribute of ["disabled", "readonly"]) {
			const input = field({ value: "7", step: "1", [attribute]: "" })
			const down = press(input, [0, 20])
			release(input, 20)
			expect(down.defaultPrevented).toBe(false)
			expect(input.value).toBe("7")
		}
	})

	test("ignores secondary buttons and non-primary pointers", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "7", step: "1" })
		expect(pointer(input, "pointerdown", 0, { button: 2 }).defaultPrevented).toBe(false)
		expect(pointer(input, "pointerdown", 0, { isPrimary: false }).defaultPrevented).toBe(false)
		pointer(input, "pointermove", 20)
		expect(input.value).toBe("7")
	})

	test("Escape restores the value from the press without change", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "10", step: "1" })
		const events = record(input)
		let escaped = false
		window.addEventListener("keydown", () => {
			escaped = true
		})
		press(input, [0, 15])
		expect(input.value).toBe("25")
		pressEscape(window.document.body)
		expect(input.value).toBe("10")
		expect(input.classList.contains("active")).toBe(false)
		expect(escaped).toBe(false)
		pointer(input, "pointermove", 40)
		release(input, 40)
		expect(input.value).toBe("10")
		expect(events).toEqual(["input:25", "input:10"])
	})

	test("pointercancel restores the value from the press", () => {
		const window = setup()
		scrub(window.document)
		const input = field({ value: "10", step: "1" })
		const events = record(input)
		press(input, [0, 15])
		pointer(input, "pointercancel", 15)
		expect(input.value).toBe("10")
		expect(events).toEqual(["input:25", "input:10"])
	})

	test("data-scrub-pixels overrides the pixels option", () => {
		const window = setup()
		scrub(window.document, { pixels: 2 })
		const input = field({ value: "0", step: "1" })
		press(input, [0, 10])
		expect(input.value).toBe("5")
		release(input, 10)

		const count = field({ value: "0", step: "1", "data-scrub-pixels": "8" })
		press(count, [0, 16])
		expect(count.value).toBe("2")
		pointer(count, "pointermove", 40)
		expect(count.value).toBe("5")
		release(count, 40)
	})

	test("starts an empty field from the start option, or from min", () => {
		const window = setup()
		const stop = scrub(window.document, { start: () => 50 })
		const input = field({ step: "1" })
		const events = record(input)
		press(input, [0, 5])
		release(input, 5)
		expect(events).toEqual(["input:55", "change:55"])
		stop()

		scrub(window.document)
		const bounded = field({ min: "10", step: "1" })
		press(bounded, [0, 5])
		expect(bounded.value).toBe("15")
		release(bounded, 5)
	})

	test("only scrubs matching fields inside the root", () => {
		const window = setup()
		const panel = window.document.createElement("div")
		window.document.body.append(panel)
		scrub(panel, { selector: "[data-scrub]" })
		const inside = field({ value: "0", step: "1", "data-scrub": "" }, panel)
		const plain = field({ value: "0", step: "1" }, panel)
		const outside = field({ value: "0", step: "1", "data-scrub": "" })
		press(inside, [0, 5])
		release(inside, 5)
		expect(inside.value).toBe("5")
		for (const input of [plain, outside]) {
			expect(press(input, [0, 5]).defaultPrevented).toBe(false)
			release(input, 5)
			expect(input.value).toBe("0")
		}
	})

	test("stop() unbinds the listener", () => {
		const window = setup()
		const stop = scrub(window.document)
		stop()
		const input = field({ value: "0", step: "1" })
		const down = press(input, [0, 20])
		release(input, 20)
		expect(down.defaultPrevented).toBe(false)
		expect(input.value).toBe("0")
	})
})
