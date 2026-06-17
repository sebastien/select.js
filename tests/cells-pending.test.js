import { describe, expect, test } from "bun:test";
import { cell, derived, switched } from "../src/js/select/cells.js";

function deferred() {
	let resolve;
	const promise = new Promise((next) => {
		resolve = next;
	});
	return { promise, resolve };
}

function flush() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function pendingCell(mode) {
	const source = cell("ready", { pending: mode });
	const pending = deferred();
	const seen = [];

	source.sub((value) => {
		seen.push(value);
	});

	source.set(pending.promise);

	return { source, pending, seen };
}

describe("cells.pending", () => {
	test("cell clears its value while pending", async () => {
		const { source, pending, seen } = pendingCell("clear");

		expect(source.value).toBe(undefined);
		expect(source.isPending).toBe(true);
		expect(seen).toEqual([undefined]);

		pending.resolve("loaded");
		await flush();

		expect(source.value).toBe("loaded");
		expect(source.isPending).toBe(false);
		expect(seen).toEqual([undefined, "loaded"]);
	});

	test("cell keeps its value while pending", async () => {
		const { source, pending, seen } = pendingCell("keep");

		expect(source.value).toBe("ready");
		expect(source.isPending).toBe(true);
		expect(seen).toEqual(["ready"]);

		pending.resolve("loaded");
		await flush();

		expect(source.value).toBe("loaded");
		expect(source.isPending).toBe(false);
		expect(seen).toEqual(["ready", "loaded"]);
	});

	test("cell.clear() sets the cell value to undefined", () => {
		const value = cell("ready");

		value.clear();

		expect(value.value).toBe(undefined);
		expect(value.isPending).toBe(false);
	});

	test("selected.clear() clears the selected path", () => {
		const root = cell({ user: { name: "Ada" } });
		const name = root.select(["user", "name"]);

		name.clear();

		expect(root.value).toEqual({ user: {} });
		expect(name.value).toBe(undefined);
	});

	test("derived clears or keeps its value while pending", async () => {
		for (const mode of ["clear", "keep"]) {
			const source = cell("ready");
			const pending = deferred();
			const value = derived(
				source,
				(input) => (input === "loading" ? pending.promise : input),
				{ pending: mode },
			);

			expect(value.value).toBe("ready");

			source.set("loading");
			expect(value.isPending).toBe(true);
			expect(value.value).toBe(mode === "clear" ? undefined : "ready");

			pending.resolve("loaded");
			await flush();

			expect(value.value).toBe("loaded");
			expect(value.isPending).toBe(false);
		}
	});

	test("switched clears or keeps its value while pending", async () => {
		for (const mode of ["clear", "keep"]) {
			const source = cell("ready");
			const pending = deferred();
			const value = switched(
				source,
				(key) => (key === "loading" ? pending.promise : cell(`user:${key}`)),
				{ pending: mode },
			);

			expect(value.value).toBe("user:ready");

			source.set("loading");
			expect(value.isPending).toBe(true);
			expect(value.value).toBe(mode === "clear" ? undefined : "user:ready");

			pending.resolve(cell("user:loaded"));
			await flush();

			expect(value.value).toBe("user:loaded");
			expect(value.isPending).toBe(false);
		}
	});

	test("selected values stay pending while keeping the previous nested value", async () => {
		const root = cell({ user: { name: "Ada" } }, { pending: "keep" });
		const name = root.select(["user", "name"]);
		const pending = deferred();

		root.set(pending.promise, ["user", "name"]);

		expect(name.value).toBe("Ada");
		expect(name.isPending).toBe(true);

		pending.resolve("Bea");
		await flush();

		expect(name.value).toBe("Bea");
		expect(name.isPending).toBe(false);
	});
});
