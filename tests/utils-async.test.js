import { describe, expect, test } from "bun:test"
import { Batched, Deferred, Throttled } from "../src/js/select/utils/async.js"

function wait(delay) {
	return new Promise((resolve) => setTimeout(resolve, delay))
}

describe("async schedulers", () => {
	test("cancels deferred callbacks", async () => {
		let calls = 0
		const task = new Deferred(() => calls++, 10)

		task.push()
		task.cancel()
		await wait(20)
		expect(calls).toBe(0)
	})

	test("cancels throttled trailing callbacks", async () => {
		let calls = 0
		const task = new Throttled(() => calls++, 20)

		task.push()
		task.push()
		task.cancel()
		await wait(30)
		expect(calls).toBe(1)
	})

	test("cancels pending batches and clears their values", async () => {
		const batches = []
		const task = new Batched((items) => batches.push(items), 20)

		task.push("first")
		task.push("second")
		task.cancel()
		await wait(30)
		expect(batches).toEqual([["first"]])
		expect(task.items).toEqual([])
	})
})

// EOF
