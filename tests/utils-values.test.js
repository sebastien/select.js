import { describe, expect, test } from "bun:test"
import {
	atom,
	composite,
	empty,
	expand,
	freeze,
	isReactive,
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
})
