import { describe, expect, test } from "bun:test"
import { assign } from "../src/js/select/utils/update.js"

	describe("utils.update.assign", () => {
	test("uses the next array slot for undefined final keys", () => {
		expect(assign([], [undefined], "a")).toEqual(["a"])
		expect(assign(["a", undefined, "c"], [undefined], "b")).toEqual([
			"a",
			undefined,
			"c",
			"b",
		])
	})

	test("uses the next object slot for undefined final keys", () => {
		expect(assign({}, [undefined], "a")).toEqual({ 0: "a" })
		expect(assign({ 0: "a", 2: "c" }, [undefined], "b")).toEqual({
			0: "a",
			2: "c",
			3: "b",
		})
	})

	test("resolves undefined intermediate keys against the current container", () => {
		expect(assign({ items: [] }, ["items", undefined], "a")).toEqual({
			items: ["a"],
		})
		expect(
			assign({ refs: { 0: "a", 2: "c" } }, ["refs", undefined], "b"),
		).toEqual({ refs: { 0: "a", 2: "c", 3: "b" } })
	})

	test("creates missing parents before resolving undefined slots", () => {
		expect(assign(undefined, ["a", undefined, "x"], 1)).toEqual({
			a: [{ x: 1 }],
		})
		expect(assign({}, ["a", "b", undefined], 1)).toEqual({
			a: { b: [1] },
		})
		expect(assign({}, ["a", undefined], 1)).toEqual({ a: [1] })
	})

	test("applies merge after resolving undefined keys", () => {
		expect(
			assign({ items: ["a"] }, ["items", undefined], "b", (prev, next) =>
				prev ? `${prev}:${next}` : next,
			),
		).toEqual({ items: ["a", "b"] })
		expect(
			assign({ refs: { 0: "a" } }, ["refs", undefined], "b", (prev, next) =>
				prev ? `${prev}:${next}` : next,
			),
		).toEqual({ refs: { 0: "a", 1: "b" } })
	})

	test("keeps existing container types when resolving undefined keys", () => {
		expect(assign({ refs: {} }, ["refs", undefined], "x")).toEqual({
			refs: { 0: "x" },
		})
		expect(assign({ refs: [] }, ["refs", undefined], "x")).toEqual({
			refs: ["x"],
		})
	})
})
