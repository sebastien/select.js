import { afterEach, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let activeWindow
let windowSnapshot

afterEach(() => {
	activeWindow?.close()
	activeWindow = undefined
	if (windowSnapshot) {
		if (windowSnapshot.had) {
			Object.defineProperty(globalThis, "window", windowSnapshot.descriptor)
		} else {
			delete globalThis.window
		}
		windowSnapshot = undefined
	}
})

describe("FastDOM", () => {
	test("batches reads before writes with requestAnimationFrame", async () => {
		activeWindow = new Window()
		windowSnapshot = {
			had: Object.hasOwn(globalThis, "window"),
			descriptor: Object.getOwnPropertyDescriptor(globalThis, "window"),
		}
		const frames = []
		activeWindow.requestAnimationFrame = (callback) => {
			frames.push(callback)
			return frames.length
		}
		Object.assign(globalThis, { window: activeWindow })
		const { FastDOM } = await import(
			`../src/js/select/ui/fastdom.js?test=${Date.now()}`
		)
		const scheduler = new FastDOM()
		const calls = []

		scheduler.mutate(() => calls.push("write"))
		scheduler.measure(() => calls.push("read"))
		expect(frames).toHaveLength(1)
		frames[0](0)
		expect(calls).toEqual(["read", "write"])
	})
})

// EOF
