import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Window } from "happy-dom"

const ROOT = path.resolve(__dirname, "..")
const DIST_ROOT = path.join(ROOT, "dist")
const DIST_BUNDLE_PATH = path.join(ROOT, "dist", "selectjs.min.js")
const DIST_INDEX_MIN_PATH = path.join(ROOT, "dist", "select", "index.min.js")
const DIST_QUERY_PATH = path.join(ROOT, "dist", "select", "query.js")
const HAS_DIST_BUNDLE = fs.existsSync(DIST_BUNDLE_PATH)
const REQUIRE_DIST = process.env.REQUIRE_DIST === "1"

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

function missingDistMessage(filePath) {
	return `Missing dist artifact: ${path.relative(ROOT, filePath)}. Run \`make dist\` or \`bun run test:dist\` before requiring dist verification.`
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

	test("dist bundle matches critical source exports", async () => {
		if (!HAS_DIST_BUNDLE) {
			if (REQUIRE_DIST) {
				throw new Error(missingDistMessage(DIST_BUNDLE_PATH))
			}
			return
		}

		const window = setupGlobals()
		const source = await import(pathToFileURL(path.join(ROOT, "src/js/select/index.js")).href)
		const dist = await import(pathToFileURL(DIST_BUNDLE_PATH).href)
		for (const name of ["expand", "len", "remap", "type", "ui"]) {
			expect(typeof dist[name]).toBe(typeof source[name])
			expect(dist[name]).toBeDefined()
		}
		window.close()
	})

	test("leaf modules preserve ESM imports", async () => {
		if (!fs.existsSync(DIST_QUERY_PATH)) {
			if (REQUIRE_DIST) {
				throw new Error(missingDistMessage(DIST_QUERY_PATH))
			}
			return
		}

		const window = setupGlobals()
		const source = await import(pathToFileURL(path.join(ROOT, "src/js/select/query.js")).href)
		const dist = await import(pathToFileURL(DIST_QUERY_PATH).href)
		expect(dist.select).toBeDefined()
		expect(typeof dist.select).toBe(typeof source.select)
		expect(fs.readFileSync(DIST_QUERY_PATH, "utf8")).toContain("import")
		window.close()
	})

	test("index shims re-export the canonical full bundle", async () => {
		if (!fs.existsSync(DIST_INDEX_MIN_PATH)) {
			if (REQUIRE_DIST) {
				throw new Error(missingDistMessage(DIST_INDEX_MIN_PATH))
			}
			return
		}

		const window = setupGlobals()
		const bundle = await import(pathToFileURL(DIST_BUNDLE_PATH).href)
		const index = await import(pathToFileURL(DIST_INDEX_MIN_PATH).href)
		for (const name of ["cell", "ui", "remap"]) {
			expect(index[name]).toBe(bundle[name])
		}
		window.close()
	})

	test("dist contains only the declared artifact products", () => {
		if (!fs.existsSync(DIST_ROOT)) {
			if (REQUIRE_DIST) {
				throw new Error(missingDistMessage(DIST_ROOT))
			}
			return
		}

		expect(fs.existsSync(path.join(DIST_ROOT, "select", "query.js"))).toBe(true)
		expect(fs.existsSync(path.join(DIST_ROOT, "select", "index.min.js"))).toBe(true)
		expect(fs.existsSync(path.join(DIST_ROOT, "select", "query.min.js"))).toBe(false)
		expect(fs.existsSync(path.join(DIST_ROOT, "selectjs.min.js.gz"))).toBe(false)
		expect(fs.existsSync(path.join(DIST_ROOT, "www"))).toBe(false)
	})
})

// EOF
