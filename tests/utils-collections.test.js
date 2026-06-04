import { describe, expect, test } from "bun:test"
import {
	array,
	keys,
	values,
} from "../src/js/select/utils/values.js"
import {
	count,
	each,
	entries,
	first,
	found,
	get,
	has,
	head,
	index,
	isin,
	iter,
	last,
	nth,
} from "../src/js/select/utils/traverse.js"
import {
	icount,
	ientries,
	ifind,
	ifirst,
	ifound,
	ihead,
	iindex,
	ilast,
	inth,
	ipick,
} from "../src/js/select/utils/iter.js"
import {
	appended as append,
	combinations,
	copy,
	difference,
	enumerate,
	filter,
	flatmap,
	flatten,
	grouped as groupBy,
	inserted as insertAt,
	merge,
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
		expect(flatmap([1, 2, 3], (v, i) => [i, v * 2])).toEqual([0, 2, 1, 4, 2, 6])
		expect(flatmap({ a: 1, b: 2 }, (v, k) => [k, v])).toEqual(["a", 1, "b", 2])
		expect(flatmap("alpha", (v, k) => [k, v])).toEqual([0, "alpha"])
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
		expect(first(rows, (row) => row.active)).toBe(rows[0])
		expect(last(rows, (row) => row.active)).toBe(rows[2])
		expect(nth(rows, -1)).toBe(rows[2])
		expect(index(rows, rows[1])).toBe(1)
		expect(found(null, rows[0])).toBeUndefined()
		expect(first("alpha")).toBe("alpha")
		expect(index("alpha", "alpha")).toBe(0)
		expect(index("alpha", "l")).toBe(-1)
		expect(isin(rows, rows[1])).toBe(true)
		expect(isin(rows, { id: 2, active: false })).toBe(false)
		expect(slice(rows, 1)).toEqual([rows[1], rows[2]])
		expect(unique([{ id: 1 }, { id: 1 }, { id: 2 }], "id")).toEqual([
			{ id: 1 },
			{ id: 2 },
		])
	})

	test("streams list-normalized traversal helpers without array coercion", () => {
		let read = 0
		function* values() {
			for (let i = 0; i < 10; i++) {
				read += 1
				yield { id: i, active: i % 2 === 0 }
			}
		}

		expect(first(values(), (v) => v.id === 2)).toEqual({ id: 2, active: true })
		expect(read).toBe(3)

		read = 0
		expect(index(values(), { id: 2 })).toBe(-1)
		expect(read).toBe(10)

		const target = { id: 3 }
		read = 0
		function* withTarget() {
			read += 1
			yield { id: 1 }
			read += 1
			yield target
			read += 1
			yield { id: 4 }
		}
		expect(index(withTarget(), target)).toBe(1)
		expect(read).toBe(2)

		read = 0
		expect(nth(values(), 4)).toEqual({ id: 4, active: true })
		expect(read).toBe(5)

		read = 0
		expect(count(values(), "active")).toBe(5)
		expect(read).toBe(10)
	})

	test("supports public iterator traversal counterparts", () => {
		const rows = [{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true }]
		const map = new Map([["a", rows[0]], ["b", rows[1]], ["c", rows[2]]])
		const set = new Set(["a", "b", "c"])

		expect(iindex(map, rows[1])).toBe("b")
		expect(ifind(set, (v) => v === "b")).toBe(1)
		expect(ifirst({ a: 1, b: 2 })).toBe(1)
		expect(ilast(rows, (row) => row.active)).toBe(rows[2])
		expect(inth(rows, -2)).toBe(rows[1])
		expect(icount(rows, "active")).toBe(2)
		expect(ifound(rows, { id: 2 }, "id")).toBe(rows[1])
		expect(ihead(rows, 2)).toEqual([rows[0], rows[1]])
		expect(ihead(rows, -1)).toEqual([rows[0], rows[1]])
		expect(ipick(null)).toBeUndefined()
		expect(ientries(set)).toEqual([[0, "a"], [1, "b"], [2, "c"]])
	})

	test("returns collection entries without normalizing through values", () => {
		function* values() {
			yield "a"
			yield "b"
		}

		expect(entries(null)).toEqual([])
		expect(entries({ a: 1, b: 2 })).toEqual([["a", 1], ["b", 2]])
		expect(entries(new Map([["a", 1]]))).toEqual([["a", 1]])
		expect(entries(new Set(["a", "b"]))).toEqual([[0, "a"], [1, "b"]])
		expect(entries(values())).toEqual([[0, "a"], [1, "b"]])
		expect(entries("ab")).toEqual([[0, "a"], [1, "b"]])
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
