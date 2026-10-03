import { afterEach, describe, expect, test } from "bun:test"

import { Window } from "happy-dom"

function setupGlobals(window) {
	window.SyntaxError = SyntaxError
	window.TypeError = TypeError
	window.Error = Error
	const g = globalThis
	g.window = window
	g.document = window.document
	g.Node = window.Node
	g.Element = window.Element
	g.HTMLElement = window.HTMLElement
	g.DocumentFragment = window.DocumentFragment
	g.Text = window.Text
	g.Comment = window.Comment
	g.Document = window.Document
	g.DOMParser = window.DOMParser
	g.MutationObserver = window.MutationObserver
	g.CustomEvent = window.CustomEvent
	g.Event = window.Event
	g.MouseEvent = window.MouseEvent
	g.KeyboardEvent = window.KeyboardEvent
	g.NodeFilter = window.NodeFilter
	g.SVGElement = window.SVGElement
	g.customElements = window.customElements
	g.requestAnimationFrame = window.requestAnimationFrame.bind(window)
	g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
	g.navigator = window.navigator
	g.getComputedStyle = window.getComputedStyle.bind(window)
}

function nextTick() {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
	document.body.innerHTML = ""
	globalThis.window?.close?.()
})

describe("ui init reactive fusion", () => {
	test("replaces caller-owned computed selections without writing into the old source", async () => {
		const window = new Window({ url: "http://localhost:8000/rebind" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/state/cells.js")
		const { ui } = await import("../src/js/select/ui/index.js")
		const sourceA = cell(1), sourceB = cell(2)
		const a = derived(sourceA, (value) => [value]).select(0)
		const b = derived(sourceB, (value) => [value]).select(0)
		const Component = ui(`<span out="value"></span>`)
		const instance = Component.new().set({ value: a }).mount(document.body)
		instance.update({ value: b })
		sourceB.set(3)
		await nextTick()
		expect(instance.data.value).toBe(b)
		expect(document.body.textContent).toBe("3")
		expect(a.value).toBe(1)
		sourceA.set(4)
		await nextTick()
		expect(document.body.textContent).toBe("3")
		instance.dispose(); a.parent.dispose(); b.parent.dispose(); a.release(); b.release()
	})

	test("fuses incoming reactive props with top-level init reactives", async () => {
		const window = new Window({ url: "http://localhost:8000/fusion" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/index.js")
		const { ui } = await import("../src/js/select/ui/index.js")

		const upstream = cell([{ id: "alpha" }])
		const Component = ui(`<div out="summary"></div>`)
			.init(() => {
				const tableData = cell([])
				return {
					tableData,
					summary: derived([tableData], ([rows]) => rows.map((_) => _.id).join(",")),
				}
			})
			.does({
				summary: (_self, { summary }) => summary.value,
			})

		const instance = Component.new().set({ tableData: upstream }).mount(document.body)

		expect(instance.data.tableData).not.toBe(upstream)
		expect(instance.data.tableData.get()).toEqual([{ id: "alpha" }])
		expect(document.body.textContent?.trim()).toBe("alpha")

		upstream.set([{ id: "beta" }])
		await nextTick()
		expect(instance.data.tableData.get()).toEqual([{ id: "beta" }])
		expect(document.body.textContent?.trim()).toBe("beta")

		instance.data.tableData.set([{ id: "gamma" }])
		await nextTick()
		expect(upstream.get()).toEqual([{ id: "gamma" }])
		expect(document.body.textContent?.trim()).toBe("gamma")

		instance.unmount()
		window.close()
	})

	test("rebinds fusion when the incoming reactive reference changes", async () => {
		const window = new Window({ url: "http://localhost:8000/fusion" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/index.js")
		const { ui } = await import("../src/js/select/ui/index.js")

		const upstreamA = cell([{ id: "a" }])
		const upstreamB = cell([{ id: "b" }])
		const Component = ui(`<div out="summary"></div>`)
			.init(() => {
				const tableData = cell([])
				return {
					tableData,
					summary: derived([tableData], ([rows]) => rows.map((_) => _.id).join(",")),
				}
			})
			.does({
				summary: (_self, { summary }) => summary.value,
			})

		const instance = Component.new().set({ tableData: upstreamA }).mount(document.body)
		instance.update({ tableData: upstreamB })
		await nextTick()

		expect(instance.data.tableData.get()).toEqual([{ id: "b" }])
		expect(document.body.textContent?.trim()).toBe("b")

		upstreamA.set([{ id: "old" }])
		await nextTick()
		expect(instance.data.tableData.get()).toEqual([{ id: "b" }])

		instance.data.tableData.set([{ id: "current" }])
		await nextTick()
		expect(upstreamB.get()).toEqual([{ id: "current" }])
		expect(document.body.textContent?.trim()).toBe("current")

		instance.unmount()
		window.close()
	})

	test("keeps fusion active after plain updates through the init reactive", async () => {
		const window = new Window({ url: "http://localhost:8000/fusion" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/index.js")
		const { ui } = await import("../src/js/select/ui/index.js")

		const upstream = cell([{ id: "alpha" }])
		const Component = ui(`<div out="summary"></div>`)
			.init(() => {
				const tableData = cell([])
				return {
					tableData,
					summary: derived([tableData], ([rows]) => rows.map((_) => _.id).join(",")),
				}
			})
			.does({
				summary: (_self, { summary }) => summary.value,
			})

		const instance = Component.new().set({ tableData: upstream }).mount(document.body)
		const internal = instance.data.tableData

		instance.update({ tableData: [{ id: "plain" }] })
		await nextTick()

		expect(instance.data.tableData).toBe(internal)
		expect(instance.data.tableData.get()).toEqual([{ id: "plain" }])
		expect(upstream.get()).toEqual([{ id: "plain" }])
		expect(document.body.textContent?.trim()).toBe("plain")

		upstream.set([{ id: "stale" }])
		await nextTick()
		expect(instance.data.tableData.get()).toEqual([{ id: "stale" }])
		expect(document.body.textContent?.trim()).toBe("stale")

		instance.unmount()
		window.close()
	})

	test("keeps read-only init derivations out of incoming prop fusion", async () => {
		const window = new Window({ url: "http://localhost:8000/fusion" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/index.js")
		const { ui } = await import("../src/js/select/ui/index.js")

		const upstream = cell(true)
		const Component = ui(`<div out="status"></div>`)
			.init(() => {
				const source = cell(false)
				return { status: derived(source, (value) => value) }
			})
			.does({
				status: (_self, { status }) => String(status.value),
			})

		const instance = Component.new().set({ status: upstream }).mount(document.body)

		expect(instance.data.status.value).toBe(false)
		expect(document.body.textContent?.trim()).toBe("false")

		upstream.set(false)
		instance.update({ status: undefined })
		await nextTick()
		expect(instance.data.status.value).toBe(false)

		instance.unmount()
		window.close()
	})

	test("does not write read-only derivations through an input binding", async () => {
		const window = new Window({ url: "http://localhost:8000/fusion" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/index.js")
		const { ui } = await import("../src/js/select/ui/index.js")
		const Component = ui(`<input inout:value="value">`).init(() => {
			const source = cell(false)
			return { value: derived(source, (value) => value) }
		})
		const instance = Component.new().mount(document.body)
		const value = instance.data.value
		const set = value.set
		let writes = 0
		value.set = (...args) => {
			writes += 1
			return set.apply(value, args)
		}
		const input = document.querySelector("input")
		input.value = "true"
		input.dispatchEvent(new Event("input", { bubbles: true }))

		expect(writes).toBe(0)
		expect(value.value).toBe(false)

		instance.unmount()
		window.close()
	})

	test("unwraps selected cells returned by input behaviors", async () => {
		const window = new Window({ url: "http://localhost:8000/selected" })
		setupGlobals(window)
		const { cell } = await import("../src/js/select/state/cells.js")
		const { ui } = await import("../src/js/select/ui/index.js")
		const Component = ui(`<input inout:value="name">`)
			.init(() => {
				const source = cell({ name: "Block name" })
				return { name: source.select("name") }
			})
			.does({
				name: (_self, data) => data.name,
			})

		Component.new().mount(document.body)

		expect(document.querySelector("input")?.value).toBe("Block name")
	})

	test("rerenders every behavior that depends on a resolved root derived value", async () => {
		const window = new Window({ url: "http://localhost:8000/derived-render" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/index.js")
		const { ui } = await import("../src/js/select/ui/index.js")

		let resolve
		const pending = new Promise((next) => {
			resolve = next
		})
		const Component = ui(`<div><span out="state"></span><span out="value"></span></div>`)
			.init(() => {
				const source = cell("loading")
				return { value: derived(source, () => pending) }
			})
			.does({
				state: (_self, { value }) => (value.isPending ? "pending" : "ready"),
				value: (_self, { value }) => value.value || "empty",
			})
		const instance = Component.new().mount(document.body)

		expect(document.body.textContent?.trim()).toBe("pendingempty")
		resolve("loaded")
		await nextTick()
		await nextTick()

		expect(document.body.textContent?.trim()).toBe("readyloaded")

		instance.unmount()
		window.close()
	})
})


describe("queued reactive fusion", () => {
	async function fixture(upstreamValue = { x: 0, y: 0 }) {
		const window = new Window({ url: "http://localhost:8000/queued-fusion" })
		setupGlobals(window)
		const { batch, cell } = await import("../src/js/select/state/cells.js")
		const { ui } = await import("../src/js/select/ui/index.js")
		const upstream = cell(upstreamValue)
		const Component = ui(`<span out="position"></span>`)
			.init(() => ({ layout: cell({}) }))
			.does({ position: (_self, { layout }) => JSON.stringify(layout.value) })
		const instance = Component.new().set({ layout: upstream }).mount(document.body)
		const seen = []
		const guard = (value) => {
			seen.push(value)
			if (seen.length > 30) throw new Error("Reactive fusion did not settle")
		}
		upstream.sub(guard)
		instance.data.layout.sub(guard)
		return { batch, cell, Component, upstream, instance, seen, guard }
	}

	test("does not echo two internal writes in one batch", async () => {
		const { batch, upstream, instance, seen } = await fixture()
		batch(() => {
			instance.data.layout.set({ x: 1 })
			instance.data.layout.set({ x: 2 })
		})
		expect(instance.data.layout.value).toEqual({ x: 2 })
		expect(upstream.value).toEqual({ x: 2 })
		expect(seen.map((value) => value.x)).toEqual([1, 2, 1, 2])
		await nextTick()
		expect(document.body.textContent).toBe('{"x":2}')
		instance.dispose()
	})

	test("does not echo batched upstream writes", async () => {
		const { batch, upstream, instance, seen } = await fixture()
		batch(() => { upstream.set({ x: 1 }); upstream.set({ x: 2 }) })
		expect(instance.data.layout.value).toEqual({ x: 2 })
		expect(upstream.value).toEqual({ x: 2 })
		expect(seen.map((value) => value.x)).toEqual([1, 2, 1, 2])
		instance.dispose()
	})

	test("preserves nested writes through a selected upstream", async () => {
		const { batch, cell, instance, guard } = await fixture()
		const root = cell([{ x: 0, y: 0 }])
		const selected = root.select(0)
		instance.update({ layout: selected })
		selected.sub(guard)
		batch(() => {
			instance.data.layout.set(1, "x")
			instance.data.layout.set(2, "y")
		})
		expect(root.value).toEqual([{ x: 1, y: 2 }])
		expect(instance.data.layout.value).toEqual({ x: 1, y: 2 })
		batch(() => { root.set(3, [0, "x"]); root.set(4, [0, "y"]) })
		expect(root.value).toEqual([{ x: 3, y: 4 }])
		expect(instance.data.layout.value).toEqual({ x: 3, y: 4 })
		instance.dispose()
	})

	test("settles shared and chained component bindings", async () => {
		const { batch, Component, upstream, instance, guard } = await fixture()
		const sibling = Component.new().set({ layout: upstream }).mount(document.body)
		const child = Component.new().set({ layout: instance.data.layout }).mount(document.body)
		sibling.data.layout.sub(guard)
		child.data.layout.sub(guard)
		batch(() => {
			instance.data.layout.set({ x: 1 })
			instance.data.layout.set({ x: 2 })
		})
		for (const source of [upstream, instance.data.layout, sibling.data.layout, child.data.layout]) {
			expect(source.value).toEqual({ x: 2 })
		}
		child.dispose(); sibling.dispose(); instance.dispose()
	})

	test("does not replay queued writes into a replacement binding", async () => {
		const { batch, cell, upstream, instance } = await fixture()
		const replacement = cell({ x: 10 })
		batch(() => {
			instance.data.layout.set({ x: 1 })
			instance.update({ layout: replacement })
		})
		expect(upstream.value).toEqual({ x: 0, y: 0 })
		expect(replacement.value).toEqual({ x: 10 })
		expect(instance.data.layout.value).toEqual({ x: 10 })
		instance.data.layout.set({ x: 11 })
		expect(replacement.value).toEqual({ x: 11 })
		instance.dispose()
	})

	test("disposed bindings do not forward queued writes", async () => {
		const { batch, upstream, instance } = await fixture()
		batch(() => { instance.data.layout.set({ x: 1 }); instance.dispose() })
		expect(upstream.value).toEqual({ x: 0, y: 0 })
	})

	test("independent subscriber writes still propagate", async () => {
		const { upstream, instance } = await fixture()
		upstream.sub((value) => { if (value.x === 1) upstream.set({ x: 2 }) })
		instance.data.layout.set({ x: 1 })
		expect(upstream.value).toEqual({ x: 2 })
		expect(instance.data.layout.value).toEqual({ x: 2 })
		instance.dispose()
	})
	for (const internalLast of [false, true]) {
		test(`simultaneous writes on both sides retain the last write (internal=${internalLast})`, async () => {
			const { batch, upstream, instance } = await fixture()
			batch(() => {
				const first = internalLast ? upstream : instance.data.layout
				const last = internalLast ? instance.data.layout : upstream
				first.set({ x: 1 })
				last.set({ x: 2 })
			})
			expect(upstream.value).toEqual({ x: 2 })
			expect(instance.data.layout.value).toEqual({ x: 2 })
			instance.dispose()
		})
	}

})
