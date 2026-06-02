import { describe, expect, test } from "bun:test"
import {
	atom,
	composite,
	empty,
	expand,
	freeze,
	isReactive,
	list,
	set,
	str,
} from "../src/js/select/utils/values.js"

describe("utils.values", () => {
	test("classifies scalar, composite, empty, and reactive values", () => {
		expect(atom("text")).toBe(true)
		expect(atom({})).toBe(false)
		expect(composite(new Map())).toBe(true)
		expect(composite("text")).toBe(false)
		expect(empty(new Set(["x"]))).toEqual(new Set())
		expect(isReactive({ isReactive: true })).toBe(true)
		expect(isReactive({ isReactive: false })).toBe(false)
		expect(isReactive(null)).toBe(false)
	})

	test("expands nested reactive values", () => {
		const nested = {
			value: {
				isReactive: true,
				value: { inner: { isReactive: true, value: "kept" } },
			},
			list: [{ isReactive: true, value: "item" }],
		}

		expect(expand(nested)).toEqual({
			value: { inner: "kept" },
			list: ["item"],
		})
	})

	test("freezes object values and leaves scalars unchanged", () => {
		const value = { name: "select" }
		expect(freeze(value)).toBe(value)
		expect(Object.isFrozen(value)).toBe(true)
		expect(freeze("text")).toBe("text")
	})

	test("coerces values to lists, strings, and native sets", () => {
		function* items() {
			yield "a"
			yield "b"
			yield "a"
		}

		expect(list(null)).toEqual([])
		expect(list("abc")).toEqual(["abc"])
		expect(list(new Map([["a", 1], ["b", 2]]))).toEqual([1, 2])
		expect(list(items())).toEqual(["a", "b", "a"])

		expect(str(null)).toBe("")
		expect(str(["a", "b"])).toBe("ab")
		expect(str(new Set(["a", "b"]))).toBe("ab")
		expect(str(new Map([["a", 1], ["b", 2]]))).toBe("12")
		expect(str({ a: 1 })).toBe('{"a":1}')

		expect(set(null)).toEqual(new Set())
		expect(set("abc")).toEqual(new Set(["abc"]))
		expect(set(["a", "b", "a"])).toEqual(new Set(["a", "b"]))
		expect(set(new Map([["a", 1], ["b", 1]]))).toEqual(new Set([1]))
	})
})
