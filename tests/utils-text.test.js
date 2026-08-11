import { describe, expect, test } from "bun:test"
import { ohash } from "../src/js/select/utils/text.js"

describe("utils.text.ohash", () => {
	test("returns a stable unsigned 32-bit number", () => {
		const hash = ohash({ a: 1, b: [2, 3] })
		expect(hash).toBe(hash >>> 0)
		expect(ohash({ a: 1, b: [2, 3] })).toBe(hash)
	})

	test("normalizes object key order when canonical", () => {
		expect(ohash({ b: 1, a: 2 })).toBe(ohash({ a: 2, b: 1 }))
		expect(ohash({ b: 1, a: 2 }, 5381, false)).not.toBe(
			ohash({ a: 2, b: 1 }, 5381, false),
		)
	})

	test("normalizes map and set insertion order when canonical", () => {
		expect(ohash(new Map([["b", 1], ["a", 2]]))).toBe(
			ohash(new Map([["a", 2], ["b", 1]])),
		)
		expect(ohash(new Set([2, 1, 3]))).toBe(ohash(new Set([3, 2, 1])))
		expect(ohash(new Map([["b", 1], ["a", 2]]), 5381, false)).not.toBe(
			ohash(new Map([["a", 2], ["b", 1]]), 5381, false),
		)
		expect(ohash(new Set([2, 1, 3]), 5381, false)).not.toBe(
			ohash(new Set([3, 2, 1]), 5381, false),
		)
	})

	test("keeps array order even when canonical", () => {
		expect(ohash([1, 2])).not.toBe(ohash([2, 1]))
	})

	test("distinguishes types with the same surface value", () => {
		const hashes = [
			ohash(1),
			ohash("1"),
			ohash([1]),
			ohash({ 0: 1 }),
			ohash(new Set([1])),
			ohash(new Map([[0, 1]])),
			ohash(null),
			ohash(undefined),
			ohash(true),
		]
		expect(new Set(hashes).size).toBe(hashes.length)
		expect(ohash([])).not.toBe(ohash({}))
		expect(ohash([])).not.toBe(ohash(new Set()))
		expect(ohash({})).not.toBe(ohash(new Map()))
	})

	test("hashes dates by timestamp", () => {
		expect(ohash(new Date(0))).toBe(ohash(new Date(0)))
		expect(ohash(new Date(1))).not.toBe(ohash(new Date(2)))
	})

	test("changes with seed and walks nested values", () => {
		const value = { user: { tags: ["a", "b"], when: new Date(0) } }
		expect(ohash(value, 1)).not.toBe(ohash(value, 2))
		expect(ohash(value)).not.toBe(ohash({ user: { tags: ["a"], when: new Date(0) } }))
	})

	test("does not throw on cycles", () => {
		const object = { a: 1 }
		object.self = object
		const list = [1]
		list.push(list)
		const map = new Map()
		map.set("self", map)
		const set = new Set()
		set.add(set)
		expect(ohash(object)).toBe(ohash(object))
		expect(ohash(list)).toBe(ohash(list))
		expect(ohash(map)).toBe(ohash(map))
		expect(ohash(set)).toBe(ohash(set))
	})
})
