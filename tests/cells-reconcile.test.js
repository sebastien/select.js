import { describe, expect, test } from "bun:test"
import { cell, reconcile, selected } from "../src/js/select/cells.js"

describe("cell.reconcile", () => {
	test("no-op when value is referentially equal", () => {
		const tree = { a: 1 }
		const state = cell(tree)
		const rev = state.revision
		const paths = []
		state.sub((_v, path) => paths.push(path))
		state.reconcile(tree)
		expect(state.revision).toBe(rev)
		expect(paths).toEqual([])
		expect(state.value).toBe(tree)
	})

	test("patches a single nested leaf without replacing siblings", () => {
		const state = cell({
			user: { name: "Ada", age: 36 },
			todos: [{ id: "1", text: "x" }],
		})
		const nameRef = state.value.user
		const todosRef = state.value.todos
		const paths = []
		state.sub((_v, path) => paths.push(path === null ? null : [...path]))

		state.reconcile({
			user: { name: "Ada", age: 37 },
			todos: [{ id: "1", text: "x" }],
		})

		expect(state.value.user.age).toBe(37)
		expect(state.value.user.name).toBe("Ada")
		expect(state.value.todos).toEqual([{ id: "1", text: "x" }])
		// Sibling branches keep identity when untouched along the write path.
		expect(state.value.todos).toBe(todosRef)
		expect(paths.some((p) => Array.isArray(p) && p.join(".") === "user.age")).toBe(
			true,
		)
		// Name leaf unchanged — should not require a name path write.
		expect(paths.some((p) => Array.isArray(p) && p.join(".") === "user.name")).toBe(
			false,
		)
		void nameRef
	})

	test("deep-equal clone is a no-op for primitives (no leaf sets)", () => {
		const state = cell({ a: { b: 1 }, c: [1, 2] })
		const rev = state.revision
		const paths = []
		state.sub((_v, path) => paths.push(path))
		state.reconcile(structuredClone(state.value))
		expect(state.revision).toBe(rev)
		expect(paths).toEqual([])
	})

	test("same-length array reconciles by index", () => {
		const state = cell({
			logs: [
				{ type: "info", message: "a" },
				{ type: "warn", message: "b" },
			],
		})
		const paths = []
		state.sub((_v, path) => {
			if (path != null) paths.push(path.join("."))
		})
		state.reconcile({
			logs: [
				{ type: "error", message: "a" },
				{ type: "warn", message: "b" },
			],
		})
		expect(state.value.logs[0].type).toBe("error")
		expect(state.value.logs[1].message).toBe("b")
		expect(paths).toContain("logs.0.type")
		expect(paths.some((p) => p.startsWith("logs.1"))).toBe(false)
	})

	test("array middle remove keeps remaining element identity", () => {
		const a = { id: 1 }
		const b = { id: 2 }
		const c = { id: 3 }
		const state = cell({ logs: [a, b, c] })
		const paths = []
		state.sub((_v, path) => {
			paths.push(path == null ? null : path.join("."))
		})
		state.reconcile({ logs: [{ id: 1 }, { id: 3 }] })
		expect(state.value.logs).toEqual([{ id: 1 }, { id: 3 }])
		expect(state.value.logs[0]).toBe(a)
		expect(state.value.logs[1]).toBe(c)
		expect(paths).toContain("logs")
	})

	test("array tail pop keeps prefix element identity", () => {
		const a = { id: 1 }
		const b = { id: 2 }
		const c = { id: 3 }
		const state = cell({ logs: [a, b, c] })
		state.reconcile({ logs: [{ id: 1 }, { id: 2 }] })
		expect(state.value.logs.length).toBe(2)
		expect(state.value.logs[0]).toBe(a)
		expect(state.value.logs[1]).toBe(b)
	})

	test("array multi-remove replaces when not a single shift/tail pop", () => {
		const a = { id: 1, v: 0 }
		const b = { id: 2 }
		const c = { id: 3 }
		const d = { id: 4 }
		const state = cell({ logs: [a, b, c, d] })
		state.reconcile({
			logs: [
				{ id: 1, v: 1 },
				{ id: 2 },
			],
		})
		expect(state.value.logs).toEqual([
			{ id: 1, v: 1 },
			{ id: 2 },
		])
		expect(state.value.logs.length).toBe(2)
	})

	test("array tail multi-pop keeps prefix element identity", () => {
		const a = { id: 1 }
		const b = { id: 2 }
		const c = { id: 3 }
		const d = { id: 4 }
		const state = cell({ logs: [a, b, c, d] })
		state.reconcile({ logs: [{ id: 1 }, { id: 2 }] })
		expect(state.value.logs.length).toBe(2)
		expect(state.value.logs[0]).toBe(a)
		expect(state.value.logs[1]).toBe(b)
	})

	test("array append keeps existing element identity", () => {
		const first = { id: 1, type: "info" }
		const second = { id: 2, type: "warn" }
		const state = cell({ logs: [first, second] })
		state.reconcile({
			logs: [
				{ id: 1, type: "info" },
				{ id: 2, type: "warn" },
				{ id: 3, type: "error" },
			],
		})
		expect(state.value.logs.length).toBe(3)
		expect(state.value.logs[0]).toBe(first)
		expect(state.value.logs[1]).toBe(second)
		expect(state.value.logs[2]).toEqual({ id: 3, type: "error" })
	})

	test("array append with prefix content change still patches", () => {
		const first = { id: 1, type: "info" }
		const second = { id: 2, type: "warn" }
		const state = cell({ logs: [first, second] })
		state.reconcile({
			logs: [
				{ id: 1, type: "error" },
				{ id: 2, type: "warn" },
				{ id: 3, type: "error" },
			],
		})
		expect(state.value.logs.length).toBe(3)
		// Endpoint sample sees first element changed → full prefix reconcile path.
		expect(state.value.logs[0].type).toBe("error")
		expect(state.value.logs[1]).toBe(second)
		expect(state.value.logs[2]).toEqual({ id: 3, type: "error" })
	})

	test("type change replaces the node", () => {
		const state = cell({ data: [1, 2, 3] })
		state.reconcile({ data: { retyped: true } })
		expect(state.value.data).toEqual({ retyped: true })
	})

	test("removes object keys missing from next", () => {
		const state = cell({ a: 1, b: 2 })
		state.reconcile({ a: 1 })
		expect(state.value.a).toBe(1)
		expect("b" in state.value).toBe(false)
		expect(state.value).toEqual({ a: 1 })
	})

	test("removes nested object keys missing from next", () => {
		const state = cell({ ctx: { origin: "x", benchmark: "y" } })
		state.reconcile({ ctx: { origin: "x" } })
		expect(state.value.ctx).toEqual({ origin: "x" })
		expect("benchmark" in state.value.ctx).toBe(false)
	})

	test("batches subscriber notifications", () => {
		const state = cell({ a: 1, b: 2, c: 3 })
		let calls = 0
		state.sub(() => {
			calls += 1
		})
		state.reconcile({ a: 10, b: 20, c: 30 })
		// Three leaf writes, one flush wave — each pub still delivers, but
		// they run after the batch (handlers see final tree on each call).
		expect(calls).toBe(3)
		expect(state.value).toEqual({ a: 10, b: 20, c: 30 })
	})

	test("works via reconcile(target, value) export", () => {
		const state = cell({ x: 1 })
		reconcile(state, { x: 2 })
		expect(state.value.x).toBe(2)
	})

	test("Selected.reconcile patches relative to selection path", () => {
		const state = cell({ user: { name: "Ada", age: 36 } })
		const user = state.select("user")
		const paths = []
		state.sub((_v, path) => {
			if (path != null) paths.push(path.join("."))
		})
		user.reconcile({ name: "Ada", age: 37 })
		expect(state.value.user.age).toBe(37)
		expect(paths).toContain("user.age")
		user.release()
	})

	test("selected() helper reconcile", () => {
		const state = cell({ nested: { v: 1 } })
		const nest = selected(state, "nested")
		nest.reconcile({ v: 2 })
		expect(state.value.nested.v).toBe(2)
		nest.release()
	})

	test("throws on non-reactive target", () => {
		expect(() => reconcile({}, { a: 1 })).toThrow(TypeError)
	})

	test("root primitive replace", () => {
		const state = cell(1)
		state.reconcile(2)
		expect(state.value).toBe(2)
	})

	test("root object replace when becoming array", () => {
		const state = cell({ a: 1 })
		state.reconcile([1, 2])
		expect(state.value).toEqual([1, 2])
	})
})
