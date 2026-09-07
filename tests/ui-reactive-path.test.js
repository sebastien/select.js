import { describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

function setupGlobals(window) {
	for (const key of [
		"window",
		"document",
		"HTMLElement",
		"Node",
		"DocumentFragment",
		"Text",
		"Comment",
		"Document",
		"Element",
		"customElements",
		"MutationObserver",
		"requestAnimationFrame",
		"HTMLInputElement",
		"HTMLSelectElement",
		"HTMLTextAreaElement",
		"HTMLFormElement",
		"Event",
		"CustomEvent",
		"DOMParser",
	]) {
		globalThis[key] = window[key]
	}
	if (!globalThis.DOMParser && window.DOMParser) {
		globalThis.DOMParser = window.DOMParser
	}
}

describe("ui reactive path updates", () => {
	test("raw entry detection preserves live identity and sample fallback semantics", async () => {
		const { attachReactive } = await import("../src/js/select/ui/components/reactive.js")
		const { AppliedUITemplate } = await import("../src/js/select/ui/components/model.js")
		class Instance {}
		attachReactive(Instance)
		const instance = new Instance()
		const raw = { id: "a", value: "A" }
		for (const [label, tree, live, sample, expected] of [
			["inspector", [raw], [raw], raw, true],
			["moved live entry with stale wrapper", [{}, raw], [{}, raw], {}, true],
			["first live entry moved", [{}, raw], [raw], {}, true],
			["transformed", [raw], [raw.value], raw.value, false],
			["equal but not identical", [raw], [{ ...raw }], { ...raw }, false],
			["sample fallback after live miss", [raw], [{}], raw, true],
			["sample fallback without live rows", [raw], [], raw, true],
			["empty tree", [], [undefined], undefined, false],
			["no live rows must not invent undefined", [undefined], [], raw, false],
			["undefined sample", [undefined], [], undefined, true],
			["live NaN fallback", [raw, NaN], [NaN], raw.value, true],
			["sample NaN fallback", [NaN], [], NaN, true],
			["negative zero is not positive", [0], [-0], -0, false],
			["positive zero is not negative", [-0], [0], 0, false],
			["live negative zero fallback", [raw, -0], [-0], raw.value, true],
			["live positive zero fallback", [raw, 0], [0], raw.value, true],
			["sample negative zero", [-0], [], -0, true],
			["sample positive zero", [0], [], 0, true],
			["sample opposite negative zero", [0], [], -0, false],
			["sample opposite positive zero", [-0], [], 0, false],
			["both zero signs", [0, -0], [], -0, true],
		]) {
			const slot = {
				_listItems: [new AppliedUITemplate(null, { value: sample })],
				_listLength: live.length,
				mapping: new Map(live.map((value, i) => [i, { data: { value } }])),
			}
			expect(instance._collectionRowUsesRawEntry(slot, tree), label).toBe(expected)
		}
		for (const sample of [undefined, { data: { value: raw } }, new AppliedUITemplate(null, {}), new AppliedUITemplate(null, null)]) {
			expect(instance._collectionRowUsesRawEntry({ _listItems: [sample], _listLength: 1 }, [raw])).toBe(false)
		}
	})

	test("raw entry detection uses linear indexed reads on transformed misses and one on common matches", async () => {
		const { attachReactive } = await import("../src/js/select/ui/components/reactive.js")
		const { AppliedUITemplate } = await import("../src/js/select/ui/components/model.js")
		class Instance {}
		attachReactive(Instance)
		const instance = new Instance()
		for (const size of [1000, 10000]) {
			const tree = Array.from({ length: size }, (_, id) => ({ id, value: String(id) }))
			let reads = 0
			const indexed = new Proxy(tree, {
				get(target, key, receiver) {
					if (typeof key === "string" && /^\d+$/.test(key)) reads++
					return Reflect.get(target, key, receiver)
				},
			})
			const slot = {
				_listItems: tree.map((entry) => new AppliedUITemplate(null, { id: entry.id, value: entry.value })),
				_listLength: size,
			}
			expect(instance._collectionRowUsesRawEntry(slot, indexed)).toBe(false)
			expect(reads).toBeLessThanOrEqual(size + 1)
			slot.mapping = new Map([[0, { data: { value: tree[0] } }]])
			reads = 0
			expect(instance._collectionRowUsesRawEntry(slot, indexed)).toBe(true)
			expect(reads).toBe(1)
		}
	})

	for (const wrapped of [false, true]) {
		test(`a mapped row's scalar field does not refresh its unrelated items list (wrapped=${wrapped})`, async () => {
			const window = new Window()
			setupGlobals(window)
			const { cell } = await import("../src/js/select/state/cells.js")
			const { ui, remap } = await import("../src/js/select/ui/index.js")
			const Row = ui(`<li><span out="name"></span><ul out="items"></ul></li>`).does({
				name: (_self, data) => (wrapped ? data.value : data).name,
				items: (_self, data) => (wrapped ? data.value : data).items,
			})
			const List = ui(`<ul out="items"></ul>`).does({
				items: (_self, { value }) => remap(value.value, (entry) => Row(wrapped ? { value: entry } : entry)),
			})
			const state = cell([{ name: "before", items: ["child"] }])
			const root = document.createElement("div")
			document.body.append(root)
			const instance = List.new().set({ value: state }).mount(root)
			const child = root.querySelector("li ul").firstChild
			try {
				state.set("after", [0, "name"])
				await new Promise((resolve) => setTimeout(resolve, 0))
				expect(root.querySelector("span").textContent).toBe("after")
				expect(root.querySelector("li ul").textContent).toBe("child")
				expect(root.querySelector("li ul").firstChild).toBe(child)
				state.set("updated child", [0, "items", 0])
				await new Promise((resolve) => setTimeout(resolve, 0))
				expect(root.querySelector("span").textContent).toBe("after")
				expect(root.querySelector("li ul").textContent).toBe("updated child")
			} finally {
				instance.unmount()
				root.remove()
				window.close()
			}
		})
	}

	for (const [host, projection] of [
		["value", "value"],
		["items", "value"],
		["data", "value"],
		["value", "body"],
	]) {
		test(`nested collection paths preserve provenance through ${projection} into ${host}`, async () => {
			const window = new Window()
			setupGlobals(window)
			const { cell } = await import("../src/js/select/state/cells.js")
			const { ui, remap } = await import("../src/js/select/ui/index.js")
			let mappings = 0
			const Leaf = ui(`<li out="name"></li>`)
			const Nested = ui(`<ul out="items"></ul>`).does({
				items: (_self, data) => {
					mappings++
					return remap(data[host], (entry) => Leaf({ name: entry.name }))
				},
			})
			const Row = ui(`<section out="${projection}"></section>`).does({
				[projection]: (_self, { value }) => Nested({ [host]: value }),
			})
			const List = ui(`<div out="items"></div>`).does({
				items: (_self, { value }) => remap(value.value, (entry) => Row({ value: entry })),
			})
			const state = cell([[{ name: "before" }], [{ name: "sibling" }]])
			const root = document.createElement("div")
			document.body.append(root)
			const instance = List.new().set({ value: state }).mount(root)
			const first = root.querySelector("li")
			try {
				for (const name of ["after", "again"]) {
					state.set(name, [0, 0, "name"])
					await new Promise((resolve) => setTimeout(resolve, 0))
					expect(root.textContent).toBe(`${name}sibling`)
					expect(root.querySelector("li")).toBe(first)
					expect(mappings).toBe(2)
				}
			} finally {
				instance.unmount()
				root.remove()
				window.close()
			}
		})
	}

	for (const projection of ["value", "body"]) {
		test(`unsafe ${projection} projection refreshes without routing into an unrelated list`, async () => {
			const window = new Window()
			setupGlobals(window)
			const { cell } = await import("../src/js/select/state/cells.js")
			const { ui, remap } = await import("../src/js/select/ui/index.js")
			const Leaf = ui(`<li out="name"></li>`)
			const Nested = ui(`<article><span out="label"></span><ul out="items"></ul></article>`).does({
				items: (_self, { items }) => remap(items, (entry) => Leaf(entry)),
			})
			const unrelated = [{ name: "unrelated" }]
			const Row = ui(`<section out="${projection}"></section>`).does({
				[projection]: (_self, { value }) => Nested({ label: value[0].name, items: unrelated }),
			})
			const List = ui(`<div out="items"></div>`).does({
				items: (_self, { value }) => remap(value.value, (entry) => Row({ value: entry })),
			})
			const state = cell([[{ name: "before" }]])
			const root = document.createElement("div")
			document.body.append(root)
			const instance = List.new().set({ value: state }).mount(root)
			const leaf = root.querySelector("li")
			try {
				for (const name of ["after", "again"]) {
					state.set(name, [0, 0, "name"])
					await new Promise((resolve) => setTimeout(resolve, 0))
					expect(root.querySelector("span").textContent).toBe(name)
					expect(root.querySelector("li").textContent).toBe("unrelated")
					expect(root.querySelector("li")).toBe(leaf)
				}
			} finally {
				instance.unmount()
				root.remove()
				window.close()
			}
		})
	}

	for (const nested of [false, true]) {
		for (const output of ["label", "value"]) {
			test(`collection transforms survive repeated deep writes (nested=${nested}, output=${output})`, async () => {
				const window = new Window()
				setupGlobals(window)
				const { cell } = await import("../src/js/select/state/cells.js")
				const { ui, remap } = await import("../src/js/select/ui/index.js")
				let mappings = 0
				const Row = ui(`<li out="${output}"></li>`).does({
					[output]: (_self, { value }) => value.detail.name,
				})
				const List = ui(`<ul out="items"></ul>`).does({
					items: (_self, { value }) => {
						mappings++
						return remap(nested ? value : value.value, (entry) =>
							Row({ value: { detail: { name: entry.detail.name.toUpperCase() } } }),
						)
					},
				})
				const Projection = ui(`<section out="body"></section>`).does({
					body: (_self, { value }) => List({ value }),
				})
				const Outer = ui(`<div out="items"></div>`).does({
					items: (_self, { value }) => remap(value.value, (entry) => Projection({ value: entry })),
				})
				const entries = [{ detail: { name: "before" } }]
				const state = cell(nested ? [entries] : entries)
				const root = document.createElement("div")
				document.body.append(root)
				const instance = (nested ? Outer : List).new().set({ value: state }).mount(root)
				const leaf = root.querySelector("li")
				try {
					expect(root.textContent).toBe("BEFORE")
					for (const [i, name] of ["after", "again"].entries()) {
						state.set(name, nested ? [0, 0, "detail", "name"] : [0, "detail", "name"])
						await new Promise((resolve) => setTimeout(resolve, 0))
						expect(root.textContent).toBe(name.toUpperCase())
						expect(mappings).toBe(i + 2)
						expect(root.querySelector("li")).toBe(leaf)
					}
				} finally {
					instance.unmount()
					root.remove()
					window.close()
				}
			})
		}
	}

	for (const route of ["mirror", "raw fallback", "transformed fallback"]) {
		test(`path ${route} preserves unrelated init fusion`, async () => {
			const window = new Window()
			setupGlobals(window)
			const { cell } = await import("../src/js/select/state/cells.js")
			const { ui, remap } = await import("../src/js/select/ui/index.js")
			const upstream = cell("upstream")
			let row
			let mappings = 0
			const Row = ui(`<li><span out="label"></span><b out="channel"></b></li>`)
				.init(() => ({ channel: cell("initial") }))
				.does({
					label: (self, { value }) => {
						row = self
						return route === "mirror" ? value?.name : value?.detail.name
					},
					channel: (_self, { channel }) => channel.value,
				})
			const List = ui(`<ul out="items"></ul>`).does({
				items: (_self, { value }) => {
					mappings++
					return remap(value.value, (entry) => Row({
						value: route === "transformed fallback"
							? { detail: { name: entry.detail.name.toUpperCase() } }
							: entry,
						channel: upstream,
					}))
				},
			})
			const state = cell([route === "mirror" ? { name: "before" } : { detail: { name: "before" } }])
			const root = document.createElement("div")
			document.body.append(root)
			const instance = List.new().set({ value: state }).mount(root)
			const mountedRow = row
			const internal = row.data.channel
			const fusion = row._getReactiveTopLevelFusion("channel")
			const subscriptions = upstream.subs.length
			const leaf = root.querySelector("li")
			try {
				expect(subscriptions).toBeGreaterThan(0)
				for (const [i, name] of ["after", "again"].entries()) {
					if (route === "raw fallback") {
						// Publish an identity-preserving change to exercise the proven raw fallback.
						state.value[0].detail.name = name
						state.pub(name, [0, "detail", "name"])
					} else {
						state.set(name, route === "mirror" ? [0, "name"] : [0, "detail", "name"])
					}
					await new Promise((resolve) => setTimeout(resolve, 0))
					expect(root.querySelector("span").textContent).toBe(route === "transformed fallback" ? name.toUpperCase() : name)
					expect(row).toBe(mountedRow)
					expect(root.querySelector("li")).toBe(leaf)
					expect(mappings).toBe(route === "transformed fallback" ? i + 2 : 1)
					expect(row.data.channel).toBe(internal)
					expect(row._getReactiveTopLevelFusion("channel")).toBe(fusion)
					expect(upstream.subs.length).toBe(subscriptions)
					upstream.set(`incoming ${name}`)
					await new Promise((resolve) => setTimeout(resolve, 0))
					expect(internal.value).toBe(`incoming ${name}`)
					expect(root.querySelector("b").textContent).toBe(`incoming ${name}`)
					internal.set(`outgoing ${name}`)
					await new Promise((resolve) => setTimeout(resolve, 0))
					expect(upstream.value).toBe(`outgoing ${name}`)
					expect(root.querySelector("b").textContent).toBe(`outgoing ${name}`)
				}
			} finally {
				instance.unmount()
				root.remove()
				window.close()
			}
			expect(upstream.subs.length).toBe(0)
		})
	}

	test("removal with later edits renders the same tree as a fresh inspector", async () => {
		const window = new Window()
		setupGlobals(window)
		const { createApp } = await import("../benchmarks/inspector/frameworks/selectui.js")
		const { createSnapshot } = await import("../benchmarks/inspector/common.js")
		const root = document.createElement("div")
		document.body.append(root)
		const initial = {
			logs: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d", count: 0, items: [1, 2] }],
		}
		const app = await createApp(root, structuredClone(initial))
		const next = structuredClone(initial)
		next.logs.splice(1, 1)
		next.logs[2].count = 1
		next.logs[2].items.reverse()
		try {
			for (const count of [1, 2]) {
				next.logs[2].count = count
				app.update(structuredClone(next))
				await new Promise((resolve) => setTimeout(resolve, 0))
				const reference = document.createElement("div")
				const fresh = await createApp(reference, structuredClone(next))
				try {
					expect(createSnapshot(root)).toEqual(createSnapshot(reference))
				} finally {
					fresh.dispose()
				}
			}
		} finally {
			app.dispose()
			root.remove()
			window.close()
		}
	})

	test("nested inspector reconciliation keeps leaf, swap, type, and deletion output current", async () => {
		const window = new Window()
		setupGlobals(window)
		const { createApp } = await import("../benchmarks/inspector/frameworks/selectui.js")
		const root = document.createElement("div")
		document.body.append(root)
		let data = {
			logs: [
				{ type: "log", context: { origin: "AuthService.login", trace: 640851 } },
				{ type: "warning", context: { origin: "AnalyticsTracker.trackEvent", trace: 929929 } },
			],
		}
		const app = await createApp(root, structuredClone(data))
		const firstRow = root.querySelector("li li")
		try {
			for (const mutate of [
				(next) => { next.logs.reverse() },
				(next) => { next.logs[0].context.trace = 123 },
				(next) => { next.logs[0].context.trace = { nested: true } },
				(next) => { next.logs[0].context.trace = "scalar" },
				(next) => { next.logs[0].context.value = { key: "collection field" } },
				(next) => { next.logs[0].context.value.key = "updated field" },
				(next) => { delete next.logs[0].context.value },
				(next) => { next.logs[1].context.benchmark = "added" },
				(next) => { delete next.logs[1].context.benchmark },
			]) {
				data = structuredClone(data)
				mutate(data)
				app.update(structuredClone(data))
				await new Promise((resolve) => setTimeout(resolve, 0))
				const reference = document.createElement("div")
				const fresh = await createApp(reference, structuredClone(data))
				try {
					expect(root.textContent).toBe(reference.textContent)
					expect(root.querySelectorAll("li").length).toBe(reference.querySelectorAll("li").length)
					expect(root.querySelector("li li")).toBe(firstRow)
				} finally {
					fresh.dispose()
				}
			}
		} finally {
			app.dispose()
			root.remove()
			window.close()
		}
	})

	test("nested cell path write updates only the leaf without remapping siblings", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		// happy-dom may expose DOMParser on window
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/state/cells.js")
		const { ui, remap } = await import("../src/js/select/ui/index.js")

		document.body.innerHTML = `<div id="app"></div>`

		const itemRenders = { a: 0, b: 0 }
		const Row = ui(`<li><span class="k" out="label"></span><span class="v" out="text"></span></li>`).does({
			label: (_self, { id }) => id,
			text: (_self, { value, id }) => {
				itemRenders[id] = (itemRenders[id] || 0) + 1
				return value
			},
		})
		const List = ui(`<ul out="items"></ul>`).does({
			items: (_self, { value }) => {
				const plain = value?.isReactive ? value.value : value
				return remap(plain, (entry) =>
					Row({ id: entry.id, value: entry.value, $key: entry.id }),
				)
			},
		})

		const state = cell([
			{ id: "a", value: "A" },
			{ id: "b", value: "B" },
		])
		const instance = List.new().set({ value: state }).mount("#app")
		// Allow reactive sub + initial paint
		await new Promise((r) => setTimeout(r, 0))

		expect(itemRenders).toEqual({ a: 1, b: 1 })
		expect(document.querySelectorAll("#app li .v")[0].textContent).toBe("A")

		state.set("A2", [0, "value"])
		await new Promise((r) => setTimeout(r, 0))

		expect(document.querySelectorAll("#app li .v")[0].textContent).toBe("A2")
		expect(document.querySelectorAll("#app li .v")[1].textContent).toBe("B")
		// Sibling row must not re-render from a path-directed leaf write.
		expect(itemRenders.b).toBe(1)
		expect(itemRenders.a).toBeGreaterThanOrEqual(2)

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("append after leaf path update uses local list fast-path", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		globalThis.SELECT_UI_LIST_STATS = true
		globalThis.SELECT_UI_LIST_STATS_COUNTS = null

		// Use the inspector framework app (dict root → list under key).
		const { createApp } = await import(
			"../benchmarks/inspector/frameworks/selectui.js"
		)

		document.body.innerHTML = `<div id="app"></div>`
		const root = document.querySelector("#app")
		const app = await createApp(root, {
			logs: [
				{ type: "info", msg: "a" },
				{ type: "warn", msg: "b" },
			],
		})
		await new Promise((r) => setTimeout(r, 0))

		// Leaf update then append (identity-preserving reconcile) must hit appendLocal
		app.update({
			logs: [
				{ type: "info", msg: "a!" },
				{ type: "warn", msg: "b" },
			],
		})
		await new Promise((r) => setTimeout(r, 0))
		app.update({
			logs: [
				{ type: "info", msg: "a!" },
				{ type: "warn", msg: "b" },
				{ type: "error", msg: "c" },
			],
		})
		await new Promise((r) => setTimeout(r, 10))

		const counts = globalThis.SELECT_UI_LIST_STATS_COUNTS || {}
		expect(document.body.textContent).toContain("a!")
		expect(document.body.textContent).toContain("c")
		expect(counts.appendLocal || 0).toBeGreaterThanOrEqual(1)
		expect(counts.fullSlotRender || 0).toBe(0)

		globalThis.SELECT_UI_LIST_STATS = false
		globalThis.SELECT_UI_LIST_STATS_COUNTS = null
		app.dispose()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("unmount releases cell subscriptions", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/state/cells.js")
		const { ui } = await import("../src/js/select/ui/index.js")

		document.body.innerHTML = `<div id="app"></div>`

		const View = ui(`<span out="text"></span>`).does({
			text: (_self, { value }) =>
				value?.isReactive ? String(value.value) : String(value),
		})
		const state = cell("hello")
		const instance = View.new().set({ value: state }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))

		expect(state.subs.length).toBeGreaterThanOrEqual(1)
		const subCount = state.subs.length

		instance.unmount()
		expect(state.subs.length).toBeLessThan(subCount)

		// Further sets must not throw or touch disposed instance.
		state.set("world")
		await new Promise((r) => setTimeout(r, 0))

		document.body.innerHTML = ""
		window.close?.()
	})

	test("array append via cell path mounts without remapping sibling rows", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/state/cells.js")
		const { ui, remap } = await import("../src/js/select/ui/index.js")

		document.body.innerHTML = `<div id="app"></div>`

		const itemRenders = {}
		const Row = ui(`<li out="text"></li>`).does({
			text: (_self, { value, id }) => {
				itemRenders[id] = (itemRenders[id] || 0) + 1
				return value
			},
		})
		const List = ui(`<ul out="items"></ul>`).does({
			items: (_self, { value }) => {
				const plain = value?.isReactive ? value.value : value
				return remap(plain, (entry, index) =>
					Row({ id: entry.id, value: entry.value, $key: index }),
				)
			},
		})

		const state = cell([
			{ id: "a", value: "A" },
			{ id: "b", value: "B" },
		])
		const instance = List.new().set({ value: state }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))
		const firstNode = document.querySelector("#app li")
		expect(itemRenders).toEqual({ a: 1, b: 1 })

		state.reconcile([
			{ id: "a", value: "A" },
			{ id: "b", value: "B" },
			{ id: "c", value: "C" },
		])
		await new Promise((r) => setTimeout(r, 0))

		const lis = Array.from(document.querySelectorAll("#app li"))
		expect(lis.map((li) => li.textContent)).toEqual(["A", "B", "C"])
		expect(lis[0]).toBe(firstNode)
		expect(itemRenders.a).toBe(1)
		expect(itemRenders.b).toBe(1)
		expect(itemRenders.c).toBe(1)

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("keyed rows keep their DOM order when earlier panels arrive later", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { ui, remap } = await import("../src/js/select/ui/index.js")

		document.body.innerHTML = `<div id="app"></div>`

		const Row = ui(`<li out:data-panel="id" out="label"></li>`).does({
			label: (_self, { id }) => id,
		})
		const List = ui(`<ul out="items"></ul>`).does({
			items: (_self, { items }) =>
				remap(items, ({ id }) => Row({ id, $key: id })),
		})
		const initial = [{ id: "chat" }, { id: "tools" }, { id: "files" }]
		const panels = [
			{ id: "help" },
			{ id: "chat" },
			{ id: "facts" },
			{ id: "guide" },
			{ id: "tools" },
			{ id: "checklist" },
			{ id: "files" },
		]
		const instance = List.new().set({ items: initial }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))

		const retained = new Map(
			Array.from(document.querySelectorAll("#app li")).map((node) => [
				node.dataset.panel,
				node,
			]),
		)

		instance.update({ items: panels })
		await new Promise((r) => setTimeout(r, 0))

		const rows = Array.from(document.querySelectorAll("#app li"))
		expect(rows.map((node) => node.dataset.panel)).toEqual(
			panels.map(({ id }) => id),
		)
		for (const id of ["chat", "tools", "files"]) {
			expect(rows.find((node) => node.dataset.panel === id)).toBe(retained.get(id))
		}

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("dict key remove via reconcile drops the row", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/state/cells.js")
		const { ui, remap } = await import("../src/js/select/ui/index.js")

		document.body.innerHTML = `<div id="app"></div>`

		const plain = (v) => (v?.isReactive === true ? v.value : v)
		const Row = ui(`<li out="text"></li>`).does({
			text: (_self, { key, value }) => `${key}:${plain(value)}`,
		})
		const Dict = ui(`<ul out="items"></ul>`).does({
			items: (_self, { value }) =>
				remap(plain(value), (entry, key) =>
					Row({ key, value: entry, $key: key }),
				),
		})

		const state = cell({ a: 1, b: 2 })
		const instance = Dict.new().set({ value: state }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))
		expect(document.querySelectorAll("#app li").length).toBe(2)

		state.reconcile({ a: 1 })
		await new Promise((r) => setTimeout(r, 0))

		const lis = Array.from(document.querySelectorAll("#app li"))
		expect(lis.length).toBe(1)
		expect(lis[0].textContent).toBe("a:1")

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})

	test("inspector-style dict path update changes leaf text", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" })
		setupGlobals(window)
		if (window.DOMParser) globalThis.DOMParser = window.DOMParser

		const { cell } = await import("../src/js/select/state/cells.js")
		const { ui, remap } = await import("../src/js/select/ui/index.js")

		document.body.innerHTML = `<div id="app"></div>`

		const plain = (v) => (v?.isReactive === true ? v.value : v)
		const Item = ui(
			`<li><span class="k" out="label"></span><span class="v" out-replace="value"></span></li>`,
		).does({
			label: (_self, { key }) => `${key}:`,
			value: (_self, { value }) => Scalar({ value: plain(value) }),
		})
		const Dict = ui(`<ul out="items"></ul>`).does({
			items: (_self, { value }) =>
				remap(plain(value), (entry, key) =>
					Item({ key, value: entry, $key: key }),
				),
		})
		const Scalar = ui(`<span out="text"></span>`).does({
			text: (_self, { value }) => `${plain(value)}`,
		})

		const state = cell({ type: "info", message: "hi" })
		const instance = Dict.new().set({ value: state }).mount("#app")
		await new Promise((r) => setTimeout(r, 0))

		expect(document.body.textContent).toContain("info")
		state.reconcile({ type: "warn", message: "hi" })
		await new Promise((r) => setTimeout(r, 0))

		expect(document.body.textContent).toContain("warn")
		expect(document.body.textContent).toContain("hi")

		instance.unmount()
		document.body.innerHTML = ""
		window.close?.()
	})
})
