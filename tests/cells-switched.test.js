import { describe, expect, test } from "bun:test"

import { cell, switched } from "../src/js/select/cells.js"

describe("cells.switched", () => {
	test("mirrors updates from the current reactive target", () => {
		const source = cell("alpha")
		const value = switched(source, (key) => cell(`user:${key}`))

		expect(value.value).toBe("user:alpha")

		value.target.set("user:beta")
		expect(value.value).toBe("user:beta")

		value.dispose()
	})

	test("switches between selected targets and propagates writes", () => {
		const users = cell({
			ada: { name: "Ada" },
			bea: { name: "Bea" },
		})
		const id = cell("ada")
		const user = switched(id, (key) => users.select([key]))

		expect(user.value).toEqual({ name: "Ada" })
		expect(users._selectionCache.get("string:ada")?._refs).toBe(1)

		user.set({ name: "Adele" })
		expect(users.value.ada).toEqual({ name: "Adele" })
		expect(user.value).toEqual({ name: "Adele" })

		id.set("bea")
		expect(user.value).toEqual({ name: "Bea" })
		expect(users._selectionCache.has("string:ada")).toBe(false)
		expect(users._selectionCache.get("string:bea")?._refs).toBe(1)

		users.set("Beatrice", ["bea", "name"])
		expect(user.value).toEqual({ name: "Beatrice" })

		user.dispose()
		expect(users._selectionCache.size).toBe(0)
	})

	test("uses a writable fallback for plain values", () => {
		const source = cell("alpha")
		const value = switched(source, (key) => `user:${key}`)

		expect(value.value).toBe("user:alpha")

		value.set("local")
		expect(value.value).toBe("local")

		source.set("beta")
		expect(value.value).toBe("user:beta")

		value.dispose()
	})

	test("supports nested selections that track the switched value", () => {
		const users = cell({
			ada: { name: "Ada" },
			bea: { name: "Bea" },
		})
		const id = cell("ada")
		const user = switched(id, (key) => users.select([key]))
		const name = user.select("name")

		expect(name.value).toBe("Ada")

		users.set("Adele", ["ada", "name"])
		expect(name.value).toBe("Adele")

		id.set("bea")
		expect(name.value).toBe("Bea")

		name.set("Beatrice")
		expect(users.value.bea.name).toBe("Beatrice")

		name.release()
		user.dispose()
		expect(users._selectionCache.size).toBe(0)
	})
})
