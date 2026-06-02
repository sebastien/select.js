import { describe, expect, test } from "bun:test"
import selection from "../src/js/select/utils/selection.js"

describe("utils.selection default export", () => {
	test("exposes selection helpers on the default export", () => {
		const items = [{ id: 1 }, { id: 2 }]

		expect(typeof selection.add).toBe("function")
		expect(typeof selection.find).toBe("function")
		expect(typeof selection.has).toBe("function")
		expect(typeof selection.remove).toBe("function")
		expect(typeof selection.toggle).toBe("function")
		expect(typeof selection.next).toBe("function")

		expect(selection.add(items, { id: 3 })).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
		expect(selection.find(items, { id: 2 })).toBe(1)
		expect(selection.has(items, { id: 2 })).toBe(true)
		expect(selection.remove(items, { id: 1 })).toEqual([{ id: 2 }])
		expect(selection.toggle(items, { id: 2 })).toEqual([{ id: 1 }])
		expect(selection.next(items, 1, 1)).toBe(0)
	})
})
