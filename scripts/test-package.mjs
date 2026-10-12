import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), "select-package-"))

function run(command, args, options = {}) {
	return execFileSync(command, args, {
		cwd: ROOT,
		encoding: "utf8",
		...options,
	})
}

try {
	const packed = JSON.parse(
		run("npm", ["pack", "--dry-run=false", "--json", "--ignore-scripts", "--pack-destination", TEMP]),
	)
	const metadata = Array.isArray(packed) ? packed[0] : Object.values(packed)[0]
	const files = metadata.files.map((file) => file.path)
	for (const prefix of ["deps/", "tests/", "benchmarks/", "dist/www/"]) {
		if (files.some((file) => file.startsWith(prefix))) {
			throw new Error(`npm package includes excluded path: ${prefix}`)
		}
	}
	if (files.some((file) => file.endsWith(".gz"))) {
		throw new Error("npm package includes precompressed gzip artifacts")
	}
	if (files.some((file) => file.endsWith(".min.js") && file !== "dist/select/index.min.js" && file !== "dist/selectjs.min.js")) {
		throw new Error("npm package includes leaf minified modules")
	}

	const consumer = path.join(TEMP, "consumer")
	const modules = path.join(consumer, "node_modules")
	fs.mkdirSync(modules, { recursive: true })
	execFileSync("tar", ["-xzf", path.join(TEMP, metadata.filename), "-C", consumer])
	const packagePath = path.join(modules, "@ssebastien", "select")
	fs.mkdirSync(path.dirname(packagePath), { recursive: true })
	fs.renameSync(path.join(consumer, "package"), packagePath)
	const happyDOM = pathToFileURL(path.join(ROOT, "node_modules/happy-dom/lib/index.js")).href
	fs.writeFileSync(
		path.join(consumer, "verify.mjs"),
		`import { Window } from ${JSON.stringify(happyDOM)}
const window = new Window()
Object.assign(globalThis, { window, document: window.document, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement, DocumentFragment: window.DocumentFragment, Text: window.Text, Comment: window.Comment, Document: window.Document, DOMParser: window.DOMParser, MutationObserver: window.MutationObserver, CustomEvent: window.CustomEvent, Event: window.Event, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, NodeFilter: window.NodeFilter, SVGElement: window.SVGElement, customElements: window.customElements, requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window), getComputedStyle: window.getComputedStyle.bind(window) })
Object.defineProperty(globalThis, "navigator", { configurable: true, value: window.navigator })
const root = await import("@ssebastien/select")
const cells = await import("@ssebastien/select/state/cells.js")
const query = await import("@ssebastien/select/features/query.js")
const canonicalCells = await import("@ssebastien/select/state/cells")
const canonicalQuery = await import("@ssebastien/select/features/query")
const canonicalUI = await import("@ssebastien/select/ui")
const canonicalSSR = await import("@ssebastien/select/ui/ssr")
const leafSSR = await import("@ssebastien/select/ui/ssr.js")
const canonicalUtils = await import("@ssebastien/select/utils")
await import("@ssebastien/select/utils/search.js")
await import("@ssebastien/select/src/js/select/features/query.js")
await import("@ssebastien/select/dist/select/features/query.js")
if (
 root.cell !== cells.cell ||
 root.cell !== canonicalCells.cell ||
 typeof query.default !== "function" ||
 canonicalQuery.default !== query.default ||
 typeof canonicalUI.default !== "function" ||
  typeof canonicalUtils.len !== "function" ||
  canonicalSSR.render !== leafSSR.render ||
  canonicalSSR.default.render !== canonicalSSR.render
) {
  throw new Error("package export identity check failed")
}
const Component = canonicalUI.ui('<p out="text"></p>', window.document)
if (await canonicalSSR.renderToString(Component, { text: "packed SSR" }, { window }) !== '<p>packed SSR</p>') {
  throw new Error("package SSR render failed")
}
window.close()
`,
	)
	execFileSync(process.execPath, ["verify.mjs"], { cwd: consumer, stdio: "inherit" })
} finally {
	fs.rmSync(TEMP, { recursive: true, force: true })
}

// EOF
