import { describe, expect, test } from "bun:test"
import cell, {
	cell as cellNamed,
	cells,
	cellStore,
	reconcile,
} from "../src/js/select/cells.js"

describe("cell.store / cellStore", () => {
	test("returns a cell with shallow-copied plain object", () => {
		const input = { a: 1, nested: { b: 2 } }
		const state = cell.store(input)
		expect(state.isReactive).toBe(true)
		expect(state.value).toEqual({ a: 1, nested: { b: 2 } })
		expect(state.value).not.toBe(input)
		expect(state.value.nested).toBe(input.nested)
		input.a = 99
		expect(state.value.a).toBe(1)
	})

	test("non-object initial values match cell()", () => {
		const s = cell.store(0)
		expect(s.value).toBe(0)
		s.set(1)
		expect(s.value).toBe(1)
	})

	test("supports reconcile and select like cell", () => {
		const state = cell.store({ user: { name: "Ada", age: 36 } })
		const paths = []
		state.sub((_v, path) => {
			if (path != null) paths.push(path.join("."))
		})
		state.reconcile({ user: { name: "Ada", age: 37 } })
		expect(state.value.user.age).toBe(37)
		expect(paths).toContain("user.age")

		const age = state.select(["user", "age"])
		expect(age.value).toBe(37)
		age.release()
	})

	test("cell.store.map aliases cells()", () => {
		const map = cell.store.map({ x: 1, y: 2 })
		expect(map.x.isReactive).toBe(true)
		expect(map.y.value).toBe(2)
		const viaCells = cells({ x: 1, y: 2 })
		expect(Object.keys(map)).toEqual(Object.keys(viaCells))
	})

	test("cellStore named export is cell.store", () => {
		expect(cell.store).toBe(cellStore)
		expect(cellNamed.store).toBe(cellStore)
		const s = cellStore({ n: 0 })
		expect(s.value.n).toBe(0)
	})

	test("cell.store.reconcile delegates to reconcile()", () => {
		const state = cell.store({ n: 1 })
		cell.store.reconcile(state, { n: 2 })
		expect(state.value.n).toBe(2)
		reconcile(state, { n: 3 })
		expect(state.value.n).toBe(3)
	})
})
