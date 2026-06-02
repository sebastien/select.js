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
	test("fuses incoming reactive props with top-level init reactives", async () => {
		const window = new Window({ url: "http://localhost:8000/fusion" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/index.js")
		const { ui } = await import("../src/js/select/ui.js")

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
		const { ui } = await import("../src/js/select/ui.js")

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

	test("writes plain updates through the init reactive after reactive fusion", async () => {
		const window = new Window({ url: "http://localhost:8000/fusion" })
		setupGlobals(window)
		const { cell, derived } = await import("../src/js/select/index.js")
		const { ui } = await import("../src/js/select/ui.js")

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
		expect(document.body.textContent?.trim()).toBe("plain")

		upstream.set([{ id: "stale" }])
		await nextTick()
		expect(instance.data.tableData.get()).toEqual([{ id: "plain" }])

		instance.unmount()
		window.close()
	})
})

