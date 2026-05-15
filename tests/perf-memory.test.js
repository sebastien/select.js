import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Window } from "happy-dom"

const ROOT = path.resolve(import.meta.dir, "..")

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

function installFetch() {
	const nativeFetch = globalThis.fetch?.bind(globalThis)
	globalThis.fetch = (input, ...args) => {
		const url = String(input)
		if (url.startsWith("./")) {
			const filePath = path.join(ROOT, "benchmarks/inspector", url.replace(/^\.\//, ""))
			const text = fs.readFileSync(filePath, "utf8")
			return Promise.resolve({
				ok: true,
				status: 200,
				text: async () => text,
				json: async () => JSON.parse(text),
			})
		}
		if (url.startsWith("../../")) {
			const filePath = path.join(ROOT, url.replace(/^\.\.\/\.\.\//, ""))
			const text = fs.readFileSync(filePath, "utf8")
			return Promise.resolve({
				ok: true,
				status: 200,
				text: async () => text,
				json: async () => JSON.parse(text),
			})
		}
		if (!nativeFetch) {
			return Promise.reject(new Error(`Unsupported fetch URL: ${url}`))
		}
		return nativeFetch(input, ...args)
	}
}

async function collectGarbage() {
	if (typeof Bun !== "undefined" && typeof Bun.gc === "function") {
		Bun.gc(true)
	}
	if (typeof globalThis.gc === "function") {
		globalThis.gc()
	}
	await Promise.resolve()
}

function heapMB() {
	return process.memoryUsage().heapUsed / (1024 * 1024)
}

describe("perf memory", () => {
	test("inspector selectui heap drift stays bounded across repeated cycles", async () => {
		const window = new Window({
			url: "http://localhost:8001/benchmarks/inspector/",
		})
		setupGlobals(window)
		installFetch()

		const { loadDataset, cloneDataset, createPatchPhases } = await import("../benchmarks/inspector/common.js")
		const { createApp } = await import("../benchmarks/inspector/frameworks/selectui.js")

		const base = await loadDataset()
		const phases = createPatchPhases(base)
		const updates = []
		let current = cloneDataset(base)
		for (const phase of phases) {
			for (const operation of phase.operations) {
				const next = cloneDataset(current)
				operation.apply(next)
				updates.push(next)
				current = next
			}
		}

		const root = document.createElement("div")
		document.body.appendChild(root)
		const samples = []
		const cycles = 16
		for (let i = 0; i < cycles; i++) {
			const app = await createApp(root, cloneDataset(base))
			for (let j = 0; j < updates.length; j++) {
				app.update(updates[j])
			}
			app.dispose()
			root.replaceChildren()
			globalThis._benchmarkApp = null
			await collectGarbage()
			samples.push(heapMB())
		}

		root.remove()
		window.close?.()
		await collectGarbage()

		const measured = samples.slice(4)
		const min = Math.min(...measured)
		const max = Math.max(...measured)
		const drift = max - min

		expect(Number.isFinite(drift)).toBe(true)
		// Keep threshold loose enough for runtime variance while still catching leaks.
		expect(drift).toBeLessThan(64)
	}, 120000)
})
