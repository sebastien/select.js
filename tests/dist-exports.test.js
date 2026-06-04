import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Window } from "happy-dom"

const ROOT = path.resolve(__dirname, "..")
const DIST_BUNDLE_PATH = path.join(ROOT, "dist", "selectjs.min.js")

function setupGlobals() {
	const window = new Window()
	Object.assign(globalThis, {
		window,
		document: window.document,
		Node: window.Node,
		Element: window.Element,
		HTMLElement: window.HTMLElement,
		DocumentFragment: window.DocumentFragment,
		Text: window.Text,
		Comment: window.Comment,
		Document: window.Document,
		DOMParser: window.DOMParser,
		MutationObserver: window.MutationObserver,
		CustomEvent: window.CustomEvent,
		Event: window.Event,
		MouseEvent: window.MouseEvent,
		KeyboardEvent: window.KeyboardEvent,
		NodeFilter: window.NodeFilter,
		SVGElement: window.SVGElement,
		customElements: window.customElements,
		requestAnimationFrame: window.requestAnimationFrame.bind(window),
		cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
		navigator: window.navigator,
		getComputedStyle: window.getComputedStyle.bind(window),
	})
	return window
}

function pathToFileURL(filePath) {
	let resolved = path.resolve(filePath).replace(/\\/g, "/")
	if (!resolved.startsWith("/")) {
		resolved = `/${resolved}`
	}
	return new URL(`file://${resolved}`)
}

describe("dist bundle export surface", () => {
	test("source index keeps explicit overlapping exports", async () => {
		const window = setupGlobals()
		const mod = await import(pathToFileURL(path.join(ROOT, "src/js/select/index.js")).href)
		for (const name of ["expand", "len", "remap", "type"]) {
			expect(mod[name]).toBeDefined()
		}
		window.close()
	})

	test.if(fs.existsSync(DIST_BUNDLE_PATH))(
		"dist bundle matches critical source exports",
		async () => {
			const window = setupGlobals()
			const source = await import(pathToFileURL(path.join(ROOT, "src/js/select/index.js")).href)
			const dist = await import(pathToFileURL(DIST_BUNDLE_PATH).href)
			for (const name of ["expand", "len", "remap", "type", "ui"]) {
				expect(typeof dist[name]).toBe(typeof source[name])
				expect(dist[name]).toBeDefined()
			}
			window.close()
		},
	)
})

// EOF
