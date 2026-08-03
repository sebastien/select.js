import { describe, expect, test } from "bun:test"
import { Browser } from "../src/js/select/state/browser.js"

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

describe("Browser.pub/sub", () => {
	test("publishes to multiple subscribers", () => {
		const state = new Browser()
		const hits = []
		const offA = state.sub("toast", (value, name) => hits.push(["a", value, name]))
		const offB = state.sub("toast", (value) => hits.push(["b", value]))
		state.pub("toast", "Saved")
		expect(hits).toEqual([
			["a", "Saved", "toast"],
			["b", "Saved"],
		])
		offA()
		offB()
	})

	test("does not replay without queue even when trigger is true", () => {
		const state = new Browser()
		const hits = []
		state.pub("toast", "missed")
		state.sub("toast", (value) => hits.push(value), true)
		expect(hits).toEqual([])
	})

	test("replays last queued event when trigger is true", () => {
		const state = new Browser()
		const hits = []
		state.pub("toast", "first", true)
		state.pub("toast", "second", true)
		state.sub("toast", (value) => hits.push(value), true)
		expect(hits).toEqual(["second"])
	})

	test("queue size N retains last N; trigger still only last", () => {
		const state = new Browser()
		const hits = []
		state.pub("log", 1, 3)
		state.pub("log", 2, 3)
		state.pub("log", 3, 3)
		state.pub("log", 4, 3)
		const topic = state.events.get("log")
		expect(topic.history).toEqual([2, 3, 4])
		state.sub("log", (value) => hits.push(value), true)
		expect(hits).toEqual([4])
	})

	test("unsub is idempotent and stops further events", () => {
		const state = new Browser()
		const hits = []
		const off = state.sub("toast", (value) => hits.push(value))
		state.pub("toast", "a")
		expect(off()).toBe(true)
		expect(off()).toBe(false)
		state.pub("toast", "b")
		expect(hits).toEqual(["a"])
	})

	test("live subscribers still receive non-queued pubs", () => {
		const state = new Browser()
		const hits = []
		state.sub("toast", (value) => hits.push(value))
		state.pub("toast", "live")
		expect(hits).toEqual(["live"])
	})
})

describe("Browser.put/get", () => {
	test("put/get is FIFO", () => {
		const state = new Browser()
		state.put("jobs", "a")
		state.put("jobs", "b")
		expect(state.get("jobs")).toBe("a")
		expect(state.get("jobs")).toBe("b")
		expect(state.get("jobs")).toBeUndefined()
	})

	test("get returns undefined when empty", () => {
		const state = new Browser()
		expect(state.get("missing")).toBeUndefined()
	})

	test("put with ttl expires before get", () => {
		const state = new Browser()
		const realNow = Date.now
		let now = 1_000_000
		Date.now = () => now
		try {
			state.put("jobs", "stale", 10)
			now += 11
			expect(state.get("jobs")).toBeUndefined()
		} finally {
			Date.now = realNow
		}
	})

	test("put hands off to pending receive without residual queue", async () => {
		const state = new Browser()
		const pending = state.receive("jobs")
		state.put("jobs", { id: 1 })
		await expect(pending).resolves.toEqual({ id: 1 })
		expect(state.get("jobs")).toBeUndefined()
		expect(state.channels.has("jobs")).toBe(false)
	})
})

describe("Browser.send/receive", () => {
	test("send resolves when get consumes the value", async () => {
		const state = new Browser()
		const sent = state.send("jobs", { id: 2 })
		expect(state.get("jobs")).toEqual({ id: 2 })
		await expect(sent).resolves.toEqual({ id: 2 })
	})

	test("send resolves when receive consumes the value", async () => {
		const state = new Browser()
		const sent = state.send("jobs", "payload")
		const received = state.receive("jobs")
		await expect(received).resolves.toBe("payload")
		await expect(sent).resolves.toBe("payload")
	})

	test("receive waits for put", async () => {
		const state = new Browser()
		const pending = state.receive("jobs")
		queueMicrotask(() => state.put("jobs", "later"))
		await expect(pending).resolves.toBe("later")
	})

	test("send hands off to pending receive", async () => {
		const state = new Browser()
		const pending = state.receive("jobs")
		const sent = state.send("jobs", "direct")
		await expect(pending).resolves.toBe("direct")
		await expect(sent).resolves.toBe("direct")
		expect(state.channels.has("jobs")).toBe(false)
	})

	test("send timeout rejects", async () => {
		const state = new Browser()
		const sent = state.send("jobs", "x", 20)
		await expect(sent).rejects.toThrow("browser.send: timeout")
		expect(state.get("jobs")).toBeUndefined()
	})

	test("receive timeout rejects", async () => {
		const state = new Browser()
		const pending = state.receive("jobs", 20)
		await expect(pending).rejects.toThrow("browser.receive: timeout")
		expect(state.channels.has("jobs")).toBe(false)
	})
})
