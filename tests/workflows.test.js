import { describe, expect, test } from "bun:test"
import { Browser, browser } from "../src/js/select/state/browser.js"
import { step, WorkflowRuntime, workflow } from "../src/js/select/features/workflows.js"

describe("workflows", () => {
	test("uses the shared browser state by default", () => {
		expect(new WorkflowRuntime().state).toBe(browser())
	})

	test("uses IndexedDB store names from the store option", async () => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB")
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			value: {
				open() {
					throw new Error("unavailable")
				},
			},
		})
		try {
			const named = new WorkflowRuntime({ store: "idb:workflow-cache" })
			const defaulted = new WorkflowRuntime({
				store: "indexeddb",
				storeName: "ignored",
			})
			await Promise.all([named.ready, defaulted.ready])
			expect(named.store.storeName).toBe("workflow-cache")
			expect(defaulted.store.storeName).toBe("kv")
		} finally {
			if (descriptor) {
				Object.defineProperty(globalThis, "indexedDB", descriptor)
			} else {
				delete globalThis.indexedDB
			}
		}
	})

	test("runs per-step pre and post hooks around cached results", async () => {
		const calls = []
		let runs = 0
		const Value = step(
			function* (value) {
				runs += 1
				return value * 2
			},
			"Value",
			{
				cache: true,
				pre: [
					(input, output, fromCache) =>
						calls.push(["pre:first", input, output, fromCache]),
					(input, output, fromCache) =>
						calls.push(["pre:second", input, output, fromCache]),
				],
				post: (input, output, fromCache) =>
					calls.push(["post", input, output, fromCache]),
			},
		)
		const runtime = new WorkflowRuntime()

		expect(await runtime.run(Value(3))).toBe(6)
		expect(await runtime.run(Value(3))).toBe(6)
		expect(runs).toBe(1)
		expect(calls).toEqual([
			["pre:first", [3], undefined, false],
			["pre:second", [3], undefined, false],
			["post", [3], 6, false],
			["pre:first", [3], undefined, true],
			["pre:second", [3], undefined, true],
			["post", [3], 6, true],
		])
	})

	test("runs per-step error hooks once after retries are exhausted", async () => {
		const calls = []
		let runs = 0
		const boom = new Error("boom")
		const Fail = step(
			function* (value) {
				runs += 1
				throw boom
			},
			"Fail",
			{
				retries: 2,
				backoff: { delay: 0, factor: 1 },
				pre: (input) => calls.push(["pre", input]),
				post: () => calls.push(["post"]),
				error: [
					(input, error) => calls.push(["error:first", input, error]),
					(input, error) => calls.push(["error:second", input, error]),
				],
			},
		)
		const runtime = new WorkflowRuntime()

		await expect(runtime.run(Fail(9))).rejects.toBe(boom)
		expect(runs).toBe(3)
		expect(calls).toEqual([
			["pre", [9]],
			["error:first", [9], boom],
			["error:second", [9], boom],
		])
	})

	test("binds event callbacks and runs returned workflow streams", async () => {
		const state = new Browser()
		const calls = []
		let complete
		const completed = new Promise((resolve) => {
			complete = resolve
		})
		const wrkf = workflow(
			{
				*Refresh(value) {
					calls.push(["run", value])
					complete()
					return value
				},
			},
			{
				Refresh: {
					on: {
						refresh: [
							(value, eventName, runtime) => {
								calls.push(["first", value, eventName, runtime])
								return wrkf.Refresh(value)
							},
							(value) => calls.push(["second", value]),
						],
					},
				},
			},
		)
		const runtime = new WorkflowRuntime({ state })
		const off = runtime.bind(wrkf)

		state.pub("refresh", 7)
		await completed
		expect(calls).toEqual([
			["first", 7, "refresh", runtime],
			["second", 7],
			["run", 7],
		])
		expect(off()).toBe(true)
		state.pub("refresh", 8)
		expect(calls).toHaveLength(3)
		expect(off()).toBe(false)
	})

	test("keeps repeated bindings independent and supports unbind", () => {
		const state = new Browser()
		const otherState = new Browser()
		const calls = []
		const wrkf = workflow(
			{
				*Refresh() {},
			},
			{
				Refresh: {
					on: {
						refresh: (value) => calls.push(value),
					},
				},
			},
		)
		const runtime = new WorkflowRuntime({ state })
		const first = runtime.bind(wrkf, otherState)
		const second = runtime.bind(wrkf, otherState)

		state.pub("refresh", "default")
		otherState.pub("refresh", "bound")
		expect(calls).toEqual(["bound", "bound"])
		expect(first()).toBe(true)
		otherState.pub("refresh", "remaining")
		expect(calls).toEqual(["bound", "bound", "remaining"])
		expect(runtime.unbind(wrkf)).toBe(1)
		otherState.pub("refresh", "removed")
		expect(calls).toEqual(["bound", "bound", "remaining"])
		expect(second()).toBe(false)
	})

	test("contains event callback failures", () => {
		const state = new Browser()
		const errors = []
		let observed = 0
		const wrkf = workflow(
			{
				*Refresh() {},
			},
			{
				Refresh: {
					on: {
						refresh: () => {
							throw new Error("event failure")
						},
					},
				},
			},
		)
		const runtime = new WorkflowRuntime({
			state,
			logger: { error: (...args) => errors.push(args) },
		})
		runtime.bind(wrkf)
		state.sub("refresh", () => {
			observed += 1
		})

		expect(() => state.pub("refresh")).not.toThrow()
		expect(observed).toBe(1)
		expect(errors).toHaveLength(1)
	})
})
