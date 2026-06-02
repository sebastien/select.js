import { describe, expect, test } from "bun:test"
import {
	array,
	keys,
	values,
} from "../src/js/select/utils/values.js"
import { get, has, iter } from "../src/js/select/utils/traverse.js"
import {
	appended as append,
	combinations,
	copy,
	count,
	difference,
	each,
	enumerate,
	filter,
	flatten,
	first,
	found,
	grouped as groupBy,
	head,
	inserted as insertAt,
	last,
	merge,
	nth,
	partition,
	prepended as prepend,
	prune,
	pruned,
	reduce,
	removeAt,
	resize,
	reverse,
	sorted,
	slice,
	stripe,
	unique,
	updated as set,
} from "../src/js/select/utils/transform.js"

describe("utils.collections", () => {
	test("supports nested get and has across objects, arrays, maps, and sets", () => {
		const value = {
			items: [{ id: "a" }],
			map: new Map([["x", new Set(["y"])]]),
		}

		expect(get(value, ["items", 0, "id"])).toBe("a")
		expect(has(value, ["items", 0, "id"])).toBe(true)
		expect(has(value, ["map", "x", "y"])).toBe(true)
		expect(has(value, ["missing", "x"])).toBe(false)
	})

	test("normalizes keys and values for supported collections", () => {
		expect(keys(["a", "b"])).toEqual([0, 1])
		expect(keys(new Map([["a", 1]]))).toEqual(["a"])
		expect(keys(new Set(["a", "b"]))).toEqual(["a", "b"])
		expect(values({ a: 1, b: 2 })).toEqual([1, 2])
	})

	test("iterates and reduces while preserving collection keys", () => {
		const seen = []
		each(new Map([["a", 1], ["b", 2]]), (v, k) => {
			seen.push([k, v])
		})

		expect(seen).toEqual([["a", 1], ["b", 2]])
		expect(reduce({ a: 1, b: 2 }, (r, v, k) => r + k + v, "")).toBe("a1b2")
	})

	test("supports the merged iterator and reshaping helpers", () => {
		expect(array(4)).toEqual([0, 1, 2, 3])
		expect(reverse(["a", "b", "c"])).toEqual(["c", "b", "a"])
		expect(reverse({ a: 1, b: 2, c: 3 })).toEqual({ c: 3, b: 2, a: 1 })
		expect(resize(["a"], 3, (i) => `x${i}`)).toEqual(["a", "x1", "x2"])
		expect(sorted([{ id: 2 }, { id: 1 }], "id")).toEqual([{ id: 1 }, { id: 2 }])
		expect(flatten([1, [2, [3]]])).toEqual([1, 2, 3])
		expect(iter(["a", "b"], (v, i, r) => (r || "") + `${i}:${v}`, (r) => r, "")).toBe(
			"0:a1:b",
		)
	})

	test("filters, prunes, counts, and finds list-normalized values", () => {
		const rows = [{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true }]

		expect(filter(rows, "active")).toEqual([rows[0], rows[2]])
		expect(prune(rows, "active")).toEqual([rows[1]])
		expect(count(rows, "active")).toBe(2)
		expect(found(rows, { id: 2 }, "id")).toBe(rows[1])
		expect(first(rows, "active")).toBe(rows[0])
		expect(last(rows, "active")).toBe(rows[2])
		expect(nth(rows, -1)).toBe(rows[2])
		expect(slice(rows, 1)).toEqual([rows[1], rows[2]])
		expect(unique([{ id: 1 }, { id: 1 }, { id: 2 }], "id")).toEqual([
			{ id: 1 },
			{ id: 2 },
		])
	})

	test("supports grouping, partitioning, and indexed collection edits", () => {
		const rows = [{ id: 1, type: "a" }, { id: 2, type: "b" }, { id: 3, type: "a" }]
		const [evenMap, oddMap] = partition(new Map([["a", 1], ["b", 2], ["c", 3]]), (v) => v % 2 === 0)

		expect(groupBy(rows, (row) => row.type, (row) => row.id)).toEqual({ a: [1, 3], b: [2] })
		expect(Array.from(evenMap.entries())).toEqual([["b", 2]])
		expect(Array.from(oddMap.entries())).toEqual([
			["a", 1],
			["c", 3],
		])
		expect(prepend(["b", "c"], "a")).toEqual(["a", "b", "c"])
		expect(append(["a", "b"], "c")).toEqual(["a", "b", "c"])
		expect(insertAt(["a", "c"], 1, "b")).toEqual(["a", "b", "c"])
		expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"])
		expect(difference(["a", "b", "c"], ["b"])).toEqual(["a", "c"])
		expect(head(["a", "b", "c"], 2)).toEqual(["a", "b"])
	})

	test("supports enumeration and ordering helpers", () => {
		expect(enumerate("a", "b")).toEqual({ a: "a", b: "b" })
		expect(stripe([0, 1, 2, 3, 4, 5])).toEqual([0, 2, 4, 1, 3, 5])
		expect(combinations(["a", "b", "c"], 2)).toEqual([
			["a", "b"],
			["a", "c"],
			["b", "c"],
		])
		expect(slice({ a: 1, b: 2, c: 3 }, 1)).toEqual({ b: 2, c: 3 })
	})

	test("returns immutable set, pruned, copy, and merge results", () => {
		const original = { nested: { a: 1 }, keep: true, drop: true }
		const updated = set(original, "added", 2)
		const withoutDrop = pruned(original, "drop")
		const cloned = copy(original)
		const merged = merge({ nested: { a: 1 }, list: [1] }, { nested: { b: 2 }, list: [2] })

		expect(updated).toEqual({ nested: { a: 1 }, keep: true, drop: true, added: 2 })
		expect(updated).not.toBe(original)
		expect(withoutDrop).toEqual({ nested: { a: 1 }, keep: true })
		expect(cloned).toEqual(original)
		expect(cloned.nested).not.toBe(original.nested)
		expect(merged).toEqual({ nested: { a: 1, b: 2 }, list: [1, 2] })
	})
})
