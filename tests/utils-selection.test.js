import { describe, expect, test } from "bun:test"
import { add, find, has, next, remove, toggle } from "../src/js/select/utils.js"

describe("utils.selection barrel", () => {
	test("re-exports selection helpers from the compatibility barrel", () => {
		const items = [{ id: 1 }, { id: 2 }]

		expect(typeof add).toBe("function")
		expect(typeof find).toBe("function")
		expect(typeof has).toBe("function")
		expect(typeof remove).toBe("function")
		expect(typeof toggle).toBe("function")
		expect(typeof next).toBe("function")

		expect(add(items, { id: 3 })).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
		expect(find(items, { id: 2 })).toBe(1)
		expect(has(items, { id: 2 })).toBe(true)
		expect(remove(items, { id: 1 })).toEqual([{ id: 2 }])
		expect(toggle(items, { id: 2 })).toEqual([{ id: 1 }])
		expect(next(items, 1, 1)).toBe(0)
	})
})
