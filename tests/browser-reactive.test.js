import { describe, expect, test } from "bun:test"
import { Browser } from "../src/js/select/state/browser.js"
import { derived, effect, unwrap } from "../src/js/select/state/cells.js"

// Browser `hash`, `query` and `option` are callable proxies over their cells;
// they must work as reactive sources wherever the cells themselves do.
describe("Browser selectable cells as reactive sources", () => {
	test("derived tracks the hash proxy", () => {
		const state = new Browser()
		state.hash.set({ path: "manage" })
		const route = derived({ hash: state.hash }, ({ hash }) => hash?.path)
		expect(route.value).toBe("manage")
		state.hash.set({ path: "manage/request/982" })
		expect(route.value).toBe("manage/request/982")
		state.hash.sync({ path: "plan" })
		expect(route.value).toBe("plan")
	})

	test("derived tracks the query proxy given directly", () => {
		const state = new Browser()
		state.query.set({ page: "1" })
		const page = derived(state.query, (query) => query?.page)
		expect(page.value).toBe("1")
		state.query.set({ page: "2" })
		expect(page.value).toBe("2")
	})

	test("effect and unwrap accept the hash proxy", () => {
		const state = new Browser()
		state.hash.set({ path: "a" })
		const seen = []
		const stop = effect({ hash: state.hash }, ({ hash }) => seen.push(hash?.path))
		state.hash.set({ path: "b" })
		expect(seen.at(-1)).toBe("b")
		expect(unwrap(state.hash)).toEqual({ path: "b" })
		stop?.()
	})
})
