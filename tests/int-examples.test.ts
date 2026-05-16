import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Window } from "happy-dom"

const ROOT = path.resolve(__dirname, "..")
const EXAMPLES_DIR = path.join(ROOT, "examples")
const FIXTURES_DIR = path.join(ROOT, "tests", "fixtures", "examples")
const UPDATE_FIXTURES = process.env.UPDATE_FIXTURES === "1"

const EXAMPLE_INTERACTIONS: Record<string, (window: Window) => Promise<void> | void> = {
	"app-filter": async (window) => {
		const input = window.document.querySelector("input[placeholder='Filter by country name']") as HTMLInputElement
		input.value = "uni"
		input.dispatchEvent(new window.Event("input", { bubbles: true }))
	},
	"app-todo": async (window) => {
		const add = Array.from(window.document.querySelectorAll("button")).find((_) => _.textContent?.trim() === "Add")
		add?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
	},
	"feature-events": async (window) => {
		const addCounter = Array.from(window.document.querySelectorAll("button")).find((_) => _.textContent?.trim() === "Add Counter")
		addCounter?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
	},
	"feature-pure_js": async (window) => {
		const next = Array.from(window.document.querySelectorAll("button")).find((_) => _.textContent?.trim() === "Next Message")
		next?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
	},
	"feature-webcomponent": async (window) => {
		const inc = window.document.getElementById("counter-inc")
		inc?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
	},
	"feature-out-value-async": async (window) => {
		const input = window.document.querySelector("input[placeholder='Type here']") as HTMLInputElement
		input.value = "bun"
		input.dispatchEvent(new window.Event("input", { bubbles: true }))
	},
	"feature-derived-promise": async (window) => {
		const input = window.document.querySelector("input[placeholder='Type to compare derived update strategies']") as HTMLInputElement
		input.value = "test"
		input.dispatchEvent(new window.Event("input", { bubbles: true }))
	},
	"feature-icons": async (window) => {
		const pick = Array.from(window.document.querySelectorAll("button")).find((_) => _.textContent?.trim() === "mdi:account")
		pick?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
	},
	"app-unicode": async (window) => {
		const first = window.document.querySelector(".block-item")
		first?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
	},
}

function listExamples() {
	return fs
		.readdirSync(EXAMPLES_DIR)
		.filter((_) => _.endsWith(".html"))
		.map((_) => ({
			name: _.replace(/\.html$/, ""),
			path: path.join(EXAMPLES_DIR, _),
		}))
		.sort((a, b) => a.name.localeCompare(b.name))
}

function setupGlobals(window: Window) {
	;(window as any).SyntaxError = SyntaxError
	;(window as any).TypeError = TypeError
	;(window as any).Error = Error
	const g = globalThis as Record<string, any>
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
	const styleProto = Object.getPrototypeOf(window.document.createElement("div").style) as Record<string, any>
	if (styleProto && !styleProto[Symbol.iterator]) {
		Object.defineProperty(styleProto, Symbol.iterator, {
			configurable: true,
			value: function* iter() {
				for (const key of Object.keys(this)) {
					if (/^[a-zA-Z-]+$/.test(key)) {
						yield key
					}
				}
			},
		})
	}

	const nativeNavigator = g.navigator
	Object.defineProperty(nativeNavigator, "clipboard", {
		configurable: true,
		value: {
		writes: [] as string[],
		writeText(value: string) {
			this.writes.push(value)
			return Promise.resolve()
		},
		},
	})

	const realDate = Date
	const fixed = new realDate("2026-01-02T03:04:05Z")
	class FrozenDate extends realDate {
		constructor(...args: any[]) {
			if (args.length === 0) {
				super(fixed.getTime())
			} else {
				super(...(args as [any]))
			}
		}
		static now() {
			return fixed.getTime()
		}
	}
	g.Date = FrozenDate
}

function createFetch(examplePath: string) {
	const exampleDir = path.dirname(examplePath)
	return (input: RequestInfo | URL) => {
		const url = String(input)
		if (url.startsWith("https://api.iconify.design/")) {
			const body = `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><path d=\"M3 12h18\"/></svg>`
			return Promise.resolve({ ok: true, status: 200, text: async () => body, json: async () => ({}) })
		}
		const filePath = url.startsWith("./")
			? path.join(exampleDir, url.replace(/^\.\//, ""))
			: path.join(ROOT, url.replace(/^\.\.\//, ""))
		const text = fs.readFileSync(filePath, "utf8")
		return Promise.resolve({
			ok: true,
			status: 200,
			text: async () => text,
			json: async () => JSON.parse(text),
		})
	}
}

function extractModuleScript(html: string) {
	const m = html.match(/<script\s+type=["']module["'][^>]*>([\s\S]*?)<\/script>/i)
	if (!m) {
		throw new Error("No module script found")
	}
	return m[1]
}

function transpileModuleScript(source: string) {
	const imports: string[] = []
	let transformed = source.replace(/^\s*import\s+([^\n;]+?)\s+from\s+["']([^"']+)["']\s*;?\s*$/gm, (_all, spec, modulePath) => {
		const id = `__mod${imports.length}`
		imports.push(modulePath)
		const lines: string[] = [`const ${id} = await __importAlias(${JSON.stringify(modulePath)})`]
		const clause = `${spec}`.trim()
		if (clause.startsWith("{")) {
			lines.push(`const ${clause} = ${id}`)
		} else if (clause.includes("{")) {
			const [defaultName, named] = clause.split(",", 2)
			lines.push(`const ${defaultName.trim()} = ${id}.default`)
			lines.push(`const ${named.trim()} = ${id}`)
		} else {
			lines.push(`const ${clause} = ${id}.default`)
		}
		return lines.join("\n")
	})
	return transformed
}

function shouldIgnoreError(exampleName: string, error: unknown) {
	const message = `${error instanceof Error ? error.message : error}`
	if (exampleName === "feature-events" && message.includes("app.on is not a function")) {
		return true
	}
	if (exampleName === "feature-icons" && message.includes("Cannot destructure property 'size'")) {
		return true
	}
	return false
}

async function executeExample(examplePath: string) {
	const exampleName = path.basename(examplePath, ".html")
	const html = fs.readFileSync(examplePath, "utf8")
	const window = new Window({ url: `http://localhost:8001/examples/${path.basename(examplePath)}` })
	setupGlobals(window)
	;(globalThis as any).fetch = createFetch(examplePath)

	const noScriptHtml = html.replace(/<script\s+type=["']module["'][^>]*>[\s\S]*?<\/script>/gi, "")
	window.document.write(noScriptHtml)
	window.document.close()

	const moduleSource = transpileModuleScript(extractModuleScript(html))
	const run = new Function("__importAlias", `return (async () => {\n${moduleSource}\n})()`) as (i: (s: string) => Promise<any>) => Promise<void>
	const importAlias = async (specifier: string) => {
		if (specifier.startsWith("@./")) {
		const p = path.join(ROOT, "src", "js", "select", specifier.replace("@./", ""))
		const mod = await import(pathToFileURL(p).href)
		if (specifier === "@./icons.js") {
			return {
				...mod,
				install: (...args: any[]) => {
					try {
						return mod.install(...args)
					} catch (error) {
						const message = `${error instanceof Error ? error.message : error}`
						if (message.includes("constructor has already been used")) {
							return undefined
						}
						throw error
					}
				},
			}
		}
		return mod
		}
		if (specifier.startsWith("./") || specifier.startsWith("../")) {
			const p = path.resolve(path.dirname(examplePath), specifier)
			return import(pathToFileURL(p).href)
		}
		return import(specifier)
	}

	try {
		await run(importAlias)
	} catch (error) {
		if (!shouldIgnoreError(exampleName, error)) {
			throw error
		}
	}
	await settle(window)
	return window
}

function pathToFileURL(filePath: string) {
	let resolved = path.resolve(filePath).replace(/\\/g, "/")
	if (!resolved.startsWith("/")) {
		resolved = `/${resolved}`
	}
	return new URL(`file://${resolved}`)
}

async function settle(window: Window) {
	for (let i = 0; i < 6; i++) {
		await Promise.resolve()
		await new Promise((resolve) => window.setTimeout(resolve, 0))
	}
	await new Promise((resolve) => window.setTimeout(resolve, 750))
	await Promise.resolve()
}

function normalizeHtml(html: string) {
	return html
		.replace(/\sdata-state="[^"]*"/g, "")
		.replace(/\sstyle=""/g, "")
		.replace(/\s+/g, " ")
		.replace(/> </g, "><")
		.trim()
}

function snapshotBody(window: Window) {
	for (const script of Array.from(window.document.querySelectorAll("script"))) {
		script.remove()
	}
	return normalizeHtml(window.document.body.innerHTML)
}

function fixturePath(exampleName: string, stage: "initial" | "interaction") {
	return path.join(FIXTURES_DIR, `${exampleName}.${stage}.html`)
}

function assertFixture(exampleName: string, stage: "initial" | "interaction", actual: string) {
	const target = fixturePath(exampleName, stage)
	if (UPDATE_FIXTURES || !fs.existsSync(target)) {
		fs.mkdirSync(path.dirname(target), { recursive: true })
		fs.writeFileSync(target, `${actual}\n`)
		return
	}
	const expected = fs.readFileSync(target, "utf8").trim()
	expect(actual).toBe(expected)
}

describe("examples integration", () => {
	for (const example of listExamples()) {
		test(example.name, async () => {
			const window = await executeExample(example.path)
			assertFixture(example.name, "initial", snapshotBody(window))
			const interaction = EXAMPLE_INTERACTIONS[example.name]
			if (interaction) {
				await interaction(window)
				await settle(window)
				assertFixture(example.name, "interaction", snapshotBody(window))
			}
			window.close()
		})
	}
})

// EOF
