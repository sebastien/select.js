import { describe, expect, test } from "bun:test"
import { cell, derived } from "../src/js/select/cells.js"
import { Nothing } from "../src/js/select/utils.js"

function foreignReactive(initialValue) {
	return {
		isReactive: true,
		isPending: false,
		value: initialValue,
		_subs: [],
		sub(handler) {
			this._subs.push(handler)
			return this
		},
		unsub(handler) {
			const i = this._subs.indexOf(handler)
			if (i >= 0) this._subs.splice(i, 1)
			return this
		},
		set(next) {
			this.value = next
			for (const handler of this._subs.slice()) {
				handler(this.value, undefined, this)
			}
			return this
		},
	}
}

describe("cells.derived", () => {
	test("single-input processor receives exactly one unwrapped value", () => {
		const source = cell("alpha")
		const calls = []
		const d = derived(source, (...args) => {
			calls.push(args)
			return args[0]
		})

		expect(calls.length).toBe(1)
		expect(calls[0].length).toBe(1)
		expect(calls[0][0]).toBe("alpha")
		expect(d.value).toBe("alpha")

		source.set("beta")
		expect(calls.length).toBe(2)
		expect(calls[1].length).toBe(1)
		expect(calls[1][0]).toBe("beta")
		expect(d.value).toBe("beta")
	})

	test("single-input processor does not receive reactive objects on source updates", () => {
		const source = cell(cell("x"))
		const values = []
		const d = derived(source, (value) => {
			values.push(value)
			return value
		})

		expect(values[0]).toBe("x")
		expect(d.value).toBe("x")

		source.set(cell("y"))
		expect(values[1]).toBe("y")
		expect(d.value).toBe("y")
	})

	test("single foreign reactive source passes expanded values to processor", () => {
		const source = foreignReactive("alpha")
		const seen = []
		const d = derived(source, (value) => {
			seen.push(value)
			return value
		})

		expect(seen[0]).toBe("alpha")
		expect(d.value).toBe("alpha")

		source.set("beta")
		expect(seen[1]).toBe("beta")
		expect(d.value).toBe("beta")
	})

	test("mixed templates expand nested foreign and local reactives", () => {
		const local = cell("left")
		const foreign = foreignReactive("right")
		const seen = []
		const d = derived(
			{
				one: local,
				two: [foreign, { three: cell("deep") }],
			},
			(value) => {
				seen.push(value)
				return value
			},
		)

		expect(seen[0]).toEqual({
			one: "left",
			two: ["right", { three: "deep" }],
		})
		expect(d.value).toEqual({
			one: "left",
			two: ["right", { three: "deep" }],
		})

		foreign.set("right2")
		expect(seen[1]).toEqual({
			one: "left",
			two: ["right2", { three: "deep" }],
		})
		expect(d.value).toEqual({
			one: "left",
			two: ["right2", { three: "deep" }],
		})
	})

	test("acquires and releases selected inputs on dispose", () => {
		const root = cell({ user: { name: "Ada" } })
		const user = root.select("user")

		expect(user._refs).toBe(1)

		const d = derived(user, (value) => value)

		expect(user._refs).toBe(2)
		expect(d.value).toEqual({ name: "Ada" })

		d.dispose()
		expect(user._refs).toBe(1)

		user.release()
		expect(root._selectionCache.size).toBe(0)
	})

	test("releases replaced selected inputs on update", () => {
		const root = cell({ a: 1, b: 2 })
		const a = root.select("a")
		const b = root.select("b")
		const d = derived(a, (value) => value)

		expect(a._refs).toBe(2)
		expect(b._refs).toBe(1)

		d.update(b)

		expect(a._refs).toBe(1)
		expect(b._refs).toBe(2)
		expect(d.value).toBe(2)

		d.dispose()
		expect(b._refs).toBe(1)

		a.release()
		b.release()
		expect(root._selectionCache.size).toBe(0)
	})

	test("publishes previous value at changed path for direct cell updates", () => {
		const root = cell({ user: { name: "Ada" } })
		const seen = []

		root.sub((value, path, _origin, previous) => {
			seen.push({ value, path, previous })
		})

		root.set("Bea", ["user", "name"])

		expect(seen).toEqual([
			{ value: "Bea", path: ["user", "name"], previous: "Ada" },
		])
	})

	test("publishes relative changed path and previous value for selected ancestors", () => {
		const root = cell({ user: { name: "Ada", meta: { visits: 1 } } })
		const user = root.select("user")
		const seen = []

		user.sub((value, path, _origin, previous) => {
			seen.push({ value, path, previous })
		})

		root.set("Bea", ["user", "name"])
		root.set(2, ["user", "meta", "visits"])

		expect(seen).toEqual([
			{ value: "Bea", path: ["name"], previous: "Ada" },
			{ value: 2, path: ["meta", "visits"], previous: 1 },
		])

		user.release()
	})

	test("publishes previous selected value when an ancestor path is replaced", () => {
		const root = cell({ user: { name: "Ada" } })
		const name = root.select(["user", "name"])
		const seen = []

		name.sub((value, path, _origin, previous) => {
			seen.push({ value, path, previous })
		})

		root.set({ name: "Bea" }, "user")

		expect(seen).toEqual([{ value: "Bea", path: Nothing, previous: "Ada" }])

		name.release()
	})
})
