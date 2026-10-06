// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-10-06

// Tests for the server-side rendering module: detached render, cleaned
// serialization, settled async updates, and global install/uninstall.

import { afterEach, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { spawnSync } from "node:child_process"

import ssr, {
	cleanHtml,
	render as renderComponent,
	renderToString,
} from "../src/js/select/ui/ssr.js"
import { ui } from "../src/js/select/ui/index.js"
import { getUIInstance } from "../src/js/select/ui/components/instance.js"
import { lazy } from "../src/js/select/ui/components/registry.js"
import { getPendingAsyncCount, setRenderTaskScheduler } from "../src/js/select/ui/components/runtime.js"

let activeWindow
const instances = new Set()

async function render(...args) {
	const instance = await renderComponent(...args)
	instances.add(instance)
	return instance
}

function makeWindow() {
	activeWindow = new Window({ url: "http://localhost:8000/ssr" })
	return activeWindow
}

function makeList(document) {
	const Row = ui(`<li out="label"></li>`, document).does({
		label: (_self, data) => data.label,
	})
	return ui(`<ul out="items"><li>Empty</li></ul>`, document).does({
		items: (_self, data) =>
			(data.items || []).map((label, i) => Row({ label, $key: i })),
	})
}

afterEach(() => {
	for (const instance of instances) instance.dispose()
	instances.clear()
	ssr.uninstall()
	activeWindow?.close()
	activeWindow = undefined
})

describe("ssr", () => {
	test("a self-scheduling render is bounded and its tasks are discarded", () => {
		const result = spawnSync(process.execPath, ["--eval", `
			const { Window } = await import("happy-dom")
			const { ui } = await import("./src/js/select/ui/index.js")
			const ssr = (await import("./src/js/select/ui/ssr.js")).default
			const window = new Window()
			ssr.install(window)
			try {
				for (const timeout of [0, 20]) {
					const P = ui('<p out="text"></p>', window.document).does({
						text: self => { self._scheduleRender(); return "x" },
					})
					try {
						await ssr.render(P, {}, { timeout })
						throw Error("unbounded render resolved")
					} catch (error) {
						if (!error.message.includes("render queue did not settle")) throw error
					}
				}
				const P = ui('<p out="text"></p>', window.document)
				if (await ssr.renderToString(P, { text: "ok" }) !== "<p>ok</p>") throw Error("queue leaked")
			} finally { ssr.uninstall(); window.close() }
		`], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 3000 })
		expect(result.error).toBeUndefined()
		expect(result.stderr).toBe("")
		expect(result.status).toBe(0)
	})

	test("a concurrent queued failure rejects only its owning render", async () => {
		const window = makeWindow()
		ssr.install(window)
		const A = ui('<p out="text"></p>', window.document).does({
			text: () => new Promise(resolve => setTimeout(() => resolve("a"), 20)),
		})
		let renders = 0
		const B = ui('<p out="text"></p>', window.document)
			.init(self => {
				queueMicrotask(() => self._scheduleRender())
				return {}
			})
			.does({
				text: () => {
					if (++renders > 1) throw Error("B failed")
					return "b"
				},
			})
		const [a, b] = await Promise.allSettled([
			render(A, {}, { timeout: 200 }),
			render(B, {}, { timeout: 200 }),
		])
		expect(a.status).toBe("fulfilled")
		expect(a.value.html()).toBe("<p>a</p>")
		expect(b.status).toBe("rejected")
		expect(b.reason.message).toBe("B failed")
	})

	test("pending work is scoped to a live subtree, not unrelated renders", async () => {
		const window = makeWindow()
		ssr.install(window)
		const Slow = ui('<p out="text"></p>', window.document).does({
			text: () => new Promise(() => {}),
		})
		const slow = await render(Slow, {})
		expect(getPendingAsyncCount(slow.instance)).toBe(1)
		const Fast = ui('<p out="text"></p>', window.document)
		const fast = ssr.create(Fast)
		instances.add(fast)
		expect(getPendingAsyncCount(fast.instance)).toBe(0)
		slow.dispose()
		expect(getPendingAsyncCount(slow.instance)).toBe(0)
		await fast.set({ text: "ok" })
		expect(fast.html()).toBe("<p>ok</p>")
	})

	test("errors while applying async results reject only the owning render", async () => {
		const window = makeWindow()
		ssr.install(window)
		const Good = ui('<p out="text"></p>', window.document).does({
			text: async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
				return "ok"
			},
		})
		const BadChild = ui('<span></span>', window.document).init(() => {
			throw Error("async child failed")
		})
		const Bad = ui('<div out="child"></div>', window.document).does({
			child: async () => BadChild({}),
		})
		const [good, bad] = await Promise.allSettled([
			render(Good, {}, { timeout: 200 }),
			render(Bad, {}, { timeout: 200 }),
		])
		expect(good.status).toBe("fulfilled")
		expect(good.value.html()).toBe("<p>ok</p>")
		expect(bad.status).toBe("rejected")
		expect(bad.reason.message).toBe("async child failed")
	})

	test("failed lazy loaders retry only on an explicit render", async () => {
		const window = makeWindow()
		ssr.install(window)
		let attempts = 0
		const LazyChild = lazy(async () => {
			attempts++
			throw Error("loader failed")
		}, "loading")
		const Parent = ui('<div out="child"></div>', window.document).does({
			child: (_self, data) => LazyChild({ attempt: data.attempt }),
		})
		const parent = await render(Parent, { attempt: 1 })
		expect(attempts).toBe(1)
		expect(parent.html()).toBe("<div>loading</div>")
		await parent.set({ attempt: 2 })
		expect(attempts).toBe(2)
	})

	test("a failed update consumes all sibling errors before recovery", async () => {
		const window = makeWindow()
		ssr.install(window)
		const Bad = ui('<b></b>', window.document).init(() => {
			throw Error("sibling failed")
		})
		const Child = ui('<span out="value"></span>', window.document).does({
			value: async (_self, data) => data.fail ? Bad({}) : "ok",
		})
		const Parent = ui('<div out="children"></div>', window.document).does({
			children: (_self, data) => [Child({ fail: data.fail, $key: 0 }), Child({ fail: data.fail, $key: 1 })],
		})
		const parent = await render(Parent, { fail: false })
		const children = [...parent.instance.children]
		await expect(parent.set({ fail: true })).rejects.toThrow("sibling failed")
		await parent.set({ fail: false })
		expect([...parent.instance.children]).toEqual(children)
		expect(parent.html()).toBe("<div><span>ok</span><span>ok</span></div>")
	})

	test("concurrent consumers await a shared lazy loader and child async work", async () => {
		const window = makeWindow()
		ssr.install(window)
		const Child = ui('<span out="text"></span>', window.document).does({
			text: async (_self, data) => {
				await new Promise(resolve => setTimeout(resolve, 10))
				return data.text
			},
		})
		const LazyChild = lazy(async () => {
			await new Promise(resolve => setTimeout(resolve, 10))
			return Child
		})
		const Parent = ui('<div out="child"></div>', window.document).does({
			child: (_self, data) => LazyChild(data),
		})
		const [a, b] = await Promise.all([
			render(Parent, { text: "a" }, { timeout: 500 }),
			render(Parent, { text: "b" }, { timeout: 500 }),
		])
		expect(a.html()).toBe("<div><span>a</span></div>")
		expect(b.html()).toBe("<div><span>b</span></div>")
	})

	test("renders a detached tree and serializes cleaned HTML", async () => {
		const window = makeWindow()
		ssr.install(window)
		const List = makeList(window.document)
		const inst = await render(List, { items: ["a", "b"] })
		expect(inst.html()).toBe("<ul><li>a</li><li>b</li></ul>")
		expect(window.document.body.innerHTML).toBe("")
	})

	test("update resolves once settled and exposes the new HTML", async () => {
		const window = makeWindow()
		ssr.install(window)
		const List = makeList(window.document)
		const inst = await render(List, { items: ["a"] })
		const result = await inst.update({ items: ["a", "b", "c"] })
		expect(result).toBe(inst)
		expect(inst.html()).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>")
	})

	test("children, when and out:class render together", async () => {
		const window = makeWindow()
		ssr.install(window)
		const Badge = ui(
			`<span out="label" out:class="tone" when="visible"></span>`,
			window.document,
		).does({
			label: (_self, data) => data.label,
			tone: (_self, data) => data.tone,
		})
		const App = ui(`<div out-replace="child"></div>`, window.document).does({
			child: (_self, data) => Badge(data),
		})
		const inst = await render(App, {
			label: "hi",
			tone: "bad",
			visible: true,
		})
		expect(inst.html()).toBe('<div><span class="bad">hi</span></div>')
		await inst.update({ label: "yo", tone: "good", visible: false })
		expect(inst.html()).toBe("<div><!--visible--></div>")
	})

	test("awaits async behaviors when a timeout is provided", async () => {
		const window = makeWindow()
		ssr.install(window)
		const Async = ui(`<p out="value"></p>`, window.document).does({
			value: async (_self, data) => {
				await new Promise((resolve) => setTimeout(resolve, 20))
				return `resolved:${data.n}`
			},
		})
		const inst = await render(Async, { n: 7 }, { timeout: 500 })
		expect(inst.html()).toBe("<p>resolved:7</p>")
	})

	test("concurrent renders do not clobber each other's scheduler", async () => {
		const window = makeWindow()
		ssr.install(window)
		const P = ui(`<p out="text"></p>`, window.document).does({
			text: (_self, data) => data.text,
		})
		const [a, b] = await Promise.all([
			render(P, { text: "one" }),
			render(P, { text: "two" }),
		])
		expect(a.html()).toBe("<p>one</p>")
		expect(b.html()).toBe("<p>two</p>")
	})

	test("render with options.window keeps globals until dispose", async () => {
		const window = makeWindow()
		const hadDocument = Object.hasOwn(globalThis, "document")
		const previous = globalThis.document
		// Build the component against the window (HTML-string templates need a
		// parser), then start from a clean slate so `render` installs.
		ssr.install(window)
		const P = ui(`<p out="text"></p>`, window.document).does({
			text: (_self, data) => data.text,
		})
		ssr.uninstall()
		const inst = await render(P, { text: "a" }, { window })
		// Globals remain installed so the instance stays usable.
		expect(globalThis.document).toBe(window.document)
		await inst.update({ text: "b" })
		expect(inst.html()).toBe("<p>b</p>")
		inst.dispose()
		if (hadDocument) {
			expect(globalThis.document).toBe(previous)
		} else {
			expect(Object.hasOwn(globalThis, "document")).toBe(false)
		}
	})

	test("renderToString returns the serialized string", async () => {
		const window = makeWindow()
		ssr.install(window)
		const P = ui(`<p out="text"></p>`, window.document).does({
			text: (_self, data) => data.text,
		})
		const html = await renderToString(P, { text: "hello" })
		expect(html).toBe("<p>hello</p>")
	})

	test("install/uninstall restore previous globals", () => {
		const window = makeWindow()
		const hadDocument = Object.hasOwn(globalThis, "document")
		const previous = globalThis.document
		ssr.install(window)
		expect(globalThis.document).toBe(window.document)
		ssr.uninstall()
		if (hadDocument) {
			expect(globalThis.document).toBe(previous)
		} else {
			expect(Object.hasOwn(globalThis, "document")).toBe(false)
		}
	})

	test("cleanHtml strips only runtime artifacts and preserves whitespace", () => {
		ssr.install(makeWindow())
		const input =
			'<div ui-parent="ui-3"><!--when:x-->  <span data-state="x"> a </span></div>'
		expect(cleanHtml(input)).toBe('<div>  <span data-state="x"> a </span></div>')
		const content = '<pre>a\n  b</pre><span>A</span> <span>B</span><textarea>a\n  b</textarea>'
		expect(cleanHtml(content)).toBe(content)
		const rawText = '<script>const x = ` ui-parent="ui-1" <!--empty-->`;</script><style>/* <!--empty--> */</style>'
		expect(cleanHtml(rawText)).toBe(rawText)
	})

	test("serialization preserves root text, comments, fragments, and the live tree", () => {
		const window = makeWindow()
		const doc = window.document
		const fragment = doc.createDocumentFragment()
		const node = doc.createElement("div")
		node.setAttribute("ui-parent", "ui-1")
		node.setAttribute("style", "")
		node.innerHTML = '<!--empty--> <span>A</span> <span>B</span>'
		fragment.append(node)
		expect(ssr.serializeNodes([doc.createTextNode(" <&> "), doc.createComment("note"), fragment])).toBe(
			' &lt;&amp;&gt; <!--note--><div> <span>A</span> <span>B</span></div>',
		)
		expect(node.getAttribute("ui-parent")).toBe("ui-1")
		expect(node.innerHTML).toContain("<!--empty-->")
	})

	test("render seeds initializer data and settles its async work", async () => {
		const window = makeWindow()
		ssr.install(window)
		let received
		const P = ui('<p out="value"></p>', window.document).init((_self, data) => {
			received = data
			return { value: `${data.text}!` }
		})
		const data = { text: "hello" }
		const inst = await render(P, data)
		expect(received).toBe(data)
		expect(inst.html()).toBe("<p>hello!</p>")
		expect(inst.nodes).toBe(inst.instance.nodes)

		let renders = 0
		const Initialized = ui('<p out="text"></p>', window.document)
			.init((_self, props) => ({ text: `${props.text}!` }))
			.does({ text: (_self, props) => { renders += 1; return props.text } })
		const initialized = await render(Initialized, data)
		expect(initialized.html()).toBe("<p>hello!</p>")
		expect(renders).toBe(1)

		const Child = ui('<span out="text"></span>', window.document)
		const LazyChild = lazy(async () => Child)
		const Parent = ui('<div out="child"></div>', window.document).does({
			child: (_self, props) => LazyChild(props),
		})
		const parent = await render(Parent, { text: "loaded" })
		expect(parent.html()).toBe("<div><span>loaded</span></div>")
	})

	test("automatic globals remain until the last instance is disposed", async () => {
		const window = makeWindow()
		const previous = globalThis.document
		ssr.install(window)
		const P = ui('<p out="text"></p>', window.document)
		ssr.uninstall()
		const [a, b] = await Promise.all([
			render(P, { text: "a" }, { window }),
			render(P, { text: "b" }, { document: window.document }),
		])
		a.dispose()
		a.dispose()
		expect(globalThis.document).toBe(window.document)
		await b.update({ text: "still live" })
		expect(b.html()).toBe("<p>still live</p>")
		b.dispose()
		expect(globalThis.document).toBe(previous)
	})

	test("explicit render data overrides fallback template default data", async () => {
		const window = makeWindow()
		ssr.install(window)
		const node = window.document.createElement("p")
		node.id = "FallbackSSR"
		node.setAttribute("out", "text")
		node.setAttribute("data", '{"text":"default"}')
		window.document.body.appendChild(node)
		const P = ui("#FallbackSSR", window.document)
		const supplied = await render(P, { text: "actual" })
		expect(supplied.nodes[0].textContent).toBe("actual")
		const fallback = await render(P)
		expect(fallback.nodes[0].textContent).toBe("default")
	})

	test("manual installation is idempotent and uninstall waits for live instances", async () => {
		const window = makeWindow()
		const previous = globalThis.document
		expect(ssr.install(window)).toBe(window)
		expect(ssr.install({ document: window.document })).toBe(window)
		const P = ui('<p out="text"></p>', window.document)
		const inst = await render(P, { text: "a" })
		ssr.uninstall()
		expect(globalThis.document).toBe(window.document)
		inst.dispose()
		expect(globalThis.document).toBe(previous)
	})

	test("a different DOM is rejected while one is installed", () => {
		const window = makeWindow()
		const other = new Window()
		ssr.install(window)
		try {
			expect(() => ssr.install(other)).toThrow("another DOM is still in use")
			expect(globalThis.document).toBe(window.document)
		} finally {
			other.close()
		}
	})

	test("construction and render failures release resources and restore the scheduler", async () => {
		const window = makeWindow()
		const previous = globalThis.document
		ssr.install(window)
		let failedInstance
		let cleaned = false
		const BadInit = ui('<p out="text"></p>', window.document).init((self) => {
			failedInstance = self
			self.effect(() => () => { cleaned = true })
			throw new Error("bad initializer")
		})
		const BadRender = ui('<p out="text"></p>', window.document).does({
			text: (self) => {
				failedInstance = self
				throw new Error("bad behavior")
			},
		})
		ssr.uninstall()
		const scheduler = () => undefined
		const priorScheduler = setRenderTaskScheduler(scheduler)
		try {
			await expect(render(BadInit, {}, { window })).rejects.toThrow("bad initializer")
			expect(cleaned).toBe(true)
			expect(getUIInstance(failedInstance.id)).toBeUndefined()
			expect(globalThis.document).toBe(previous)
			await expect(render(BadRender, {}, { window })).rejects.toThrow("bad behavior")
			expect(getUIInstance(failedInstance.id)).toBeUndefined()
			expect(globalThis.document).toBe(previous)
			expect(setRenderTaskScheduler(priorScheduler)).toBe(scheduler)
		} finally {
			setRenderTaskScheduler(priorScheduler)
		}
	})

	test("a queued render failure does not discard another instance's task", async () => {
		const window = makeWindow()
		ssr.install(window)
		const P = ui('<p out="text"></p>', window.document)
		const a = ssr.create(P)
		const b = ssr.create(P)
		instances.add(a)
		instances.add(b)
		const previous = a.instance.render
		try {
			a.instance.render = () => { throw new Error("queued failure") }
			const failed = a._cycle(() => {
				a.instance.data = { text: "bad" }
				b.instance.data = { text: "good" }
				a.instance._scheduleRender()
				b.instance._scheduleRender()
			})
			const succeeded = b._cycle(() => {})
			await expect(failed).rejects.toThrow("queued failure")
			await succeeded
			expect(b.html()).toBe("<p>good</p>")
			expect(b.instance._renderQueued).toBe(false)
		} finally {
			a.instance.render = previous
		}
	})

	test("early construction failures unregister the partially built instance", async () => {
		const window = makeWindow()
		ssr.install(window)
		const P = ui('<p out="text"></p>', window.document)
		const prior = P.new()
		const failedId = `ui-${Number(prior.id.slice(3)) + 1}`
		prior.dispose()
		const node = P.template.nodes[0]
		node.cloneNode = () => { throw new Error("clone failed") }
		await expect(render(P, { text: "a" })).rejects.toThrow("clone failed")
		expect(getUIInstance(failedId)).toBeUndefined()
	})

	test("renderToString disposes even when serialization fails", async () => {
		const window = makeWindow()
		const previous = globalThis.document
		ssr.install(window)
		let instance
		const P = ui('<p out="text"></p>', window.document).init((self) => {
			instance = self
			self.nodes[0].cloneNode = () => { throw new Error("bad serialization") }
		})
		ssr.uninstall()
		await expect(renderToString(P, { text: "a" }, { window })).rejects.toThrow("bad serialization")
		expect(getUIInstance(instance.id)).toBeUndefined()
		expect(globalThis.document).toBe(previous)
	})

	test("serialize can keep raw markup", () => {
		const window = makeWindow()
		ssr.install(window)
		const node = window.document.createElement("div")
		node.setAttribute("ui-parent", "ui-1")
		node.innerHTML = " x "
		expect(ssr.serializeNodes([node], false)).toContain('ui-parent="ui-1"')
	})
})

// EOF
