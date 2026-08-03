import { describe, expect, test } from "bun:test";
import { cell, deferred, reconcile } from "../src/js/select/state/cells.js";
import {
	batch as asyncBatch,
	defer,
	throttle,
} from "../src/js/select/utils/async.js";

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("cell.schedule", () => {
	test("construction with defer tuple debounces last write", async () => {
		const c = cell(0, { schedule: ["defer", 30] });
		const seen = [];
		c.sub((v) => seen.push(v));

		c.set(1);
		c.set(2);
		c.set(3);
		expect(c.value).toBe(0);
		expect(seen).toEqual([]);

		await wait(50);
		expect(c.value).toBe(3);
		expect(seen).toEqual([3]);
	});

	test("construction with throttle tuple leads then trails", async () => {
		const c = cell(0, { schedule: ["throttle", 40] });
		const seen = [];
		c.sub((v) => seen.push(v));

		c.set(1);
		expect(c.value).toBe(1);
		expect(seen).toEqual([1]);

		c.set(2);
		c.set(3);
		expect(c.value).toBe(1);
		expect(seen).toEqual([1]);

		await wait(60);
		expect(c.value).toBe(3);
		expect(seen).toEqual([1, 3]);
	});

	test("shared batched schedule flushes multiple cells together", async () => {
		const group = asyncBatch(undefined, 30);
		const a = cell(0, { schedule: group });
		const b = cell(0, { schedule: group });
		const order = [];
		a.sub((v) => order.push(["a", v]));
		b.sub((v) => order.push(["b", v]));

		// Prime throttle window with an immediate leading flush, then queue.
		a.set(1);
		expect(a.value).toBe(1);

		b.set(2);
		a.set(3);
		expect(b.value).toBe(0);
		expect(a.value).toBe(1);

		await wait(50);
		expect(a.value).toBe(3);
		expect(b.value).toBe(2);
		// Leading a=1, then trailing flush in enqueue order: b=2, a=3.
		expect(order).toEqual([
			["a", 1],
			["b", 2],
			["a", 3],
		]);
	});

	test("runtime schedule() swap cancels pending writes", async () => {
		const c = cell(0, { schedule: ["defer", 40] });
		c.set(1);
		expect(c.value).toBe(0);

		c.schedule(["defer", 40]);
		await wait(60);
		expect(c.value).toBe(0);

		c.set(2);
		await wait(60);
		expect(c.value).toBe(2);
	});

	test("schedule(null) restores immediate updates", () => {
		const c = cell(0, { schedule: ["defer", 100] });
		c.schedule(null);
		c.set(5);
		expect(c.value).toBe(5);
	});

	test("force bypasses schedule", () => {
		const c = cell(0, { schedule: ["defer", 100] });
		c.set(9, undefined, true);
		expect(c.value).toBe(9);
	});

	test("flush applies pending deferred write now", () => {
		const c = cell(0, { schedule: ["defer", 100] });
		c.set(4);
		expect(c.value).toBe(0);
		c.flush();
		expect(c.value).toBe(4);
	});

	test("attach shared defer instance", async () => {
		const shared = defer(undefined, 30, false);
		const a = cell(0).schedule(shared);
		const b = cell(0).schedule(shared);

		a.set(1);
		b.set(2);
		expect(a.value).toBe(0);
		expect(b.value).toBe(0);

		await wait(50);
		expect(a.value).toBe(1);
		expect(b.value).toBe(2);
	});

	test("attach shared throttle instance", async () => {
		const shared = throttle(undefined, 40, false);
		const c = cell(0, { schedule: shared });

		c.set(1);
		expect(c.value).toBe(1);
		c.set(2);
		expect(c.value).toBe(1);
		await wait(60);
		expect(c.value).toBe(2);
	});

	test("deferred(value, delay) is a thin schedule alias", async () => {
		const c = deferred(0, 30);
		expect(c.value).toBe(0);
		c.set(7);
		expect(c.value).toBe(0);
		await wait(50);
		expect(c.value).toBe(7);
	});

	test("reconcile bypasses schedule and applies immediately", () => {
		const c = cell({ n: 0 }, { schedule: ["defer", 100] });
		reconcile(c, { n: 3 });
		expect(c.value).toEqual({ n: 3 });
	});

	test("clear and merge respect schedule", async () => {
		const c = cell({ a: 1, b: 2 }, { schedule: ["defer", 30] });
		c.merge({ b: 9 });
		expect(c.value).toEqual({ a: 1, b: 2 });
		await wait(50);
		expect(c.value).toEqual({ a: 1, b: 9 });

		c.clear();
		expect(c.value).toEqual({ a: 1, b: 9 });
		await wait(50);
		expect(c.value).toBe(undefined);
	});

	test("path set is scheduled", async () => {
		const c = cell({ n: 0 }, { schedule: ["defer", 30] });
		c.set(5, "n");
		expect(c.value).toEqual({ n: 0 });
		await wait(50);
		expect(c.value).toEqual({ n: 5 });
	});

	test("dispose cancels pending schedule for cell", async () => {
		const c = cell(0, { schedule: ["defer", 30] });
		c.set(1);
		c.dispose();
		await wait(50);
		expect(c.value).toBe(0);
	});
});
