// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-10-06

// Guards that the aggregate and features barrels can be imported in a runtime
// without a DOM. Run in a fresh subprocess so DOM globals installed by other
// test files cannot mask a regression.

import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function importInFreshProcess(relativePath) {
	const absolute = path.join(ROOT, relativePath)
	const script = `
		(async () => {
			for (const key of ["document", "window", "DOMParser", "customElements"]) {
				if (key in globalThis) throw new Error("DOM global leaked: " + key)
			}
			const mod = await import(${JSON.stringify(absolute)})
			process.stdout.write("OK:" + Object.keys(mod).length)
		})().catch((error) => {
			process.stderr.write(String(error && error.message ? error.message : error))
			process.exit(1)
		})
	`
	return spawnSync(process.execPath, ["-e", script], { encoding: "utf8" })
}

describe("headless import", () => {
	test("select/index.js imports without a DOM", () => {
		const result = importInFreshProcess("src/js/select/index.js")
		expect(result.stderr).toBe("")
		expect(result.status).toBe(0)
		expect(result.stdout.startsWith("OK:")).toBe(true)
	})

	test("select/features/index.js imports without a DOM", () => {
		const result = importInFreshProcess("src/js/select/features/index.js")
		expect(result.stderr).toBe("")
		expect(result.status).toBe(0)
		expect(result.stdout.startsWith("OK:")).toBe(true)
	})

	test("select/features/icons.js imports without a DOM", () => {
		const result = importInFreshProcess("src/js/select/features/icons.js")
		expect(result.stderr).toBe("")
		expect(result.status).toBe(0)
		expect(result.stdout.startsWith("OK:")).toBe(true)
	})

	test("select/ui/ssr.js imports without a DOM", () => {
		const result = importInFreshProcess("src/js/select/ui/ssr.js")
		expect(result.stderr).toBe("")
		expect(result.status).toBe(0)
		expect(result.stdout.startsWith("OK:")).toBe(true)
	})

	test("HTML formatters become DOM-backed after a headless import", () => {
		const script = `
			const { html } = await import("./src/js/select/features/formats.js")
			if (html("<b>x</b>") !== "<b>x</b>") throw new Error("headless fallback changed")
			const { Window } = await import("happy-dom")
			const { install, uninstall } = await import("select/ui/ssr")
			const window = new Window()
			install(window)
			try {
				const node = html("<b>x</b>")
				if (node.outerHTML !== "<b>x</b>") throw new Error("formatter stayed headless")
				const nodes = html("<b>x</b><i>y</i>")
				if (nodes.nodeType !== 11 || nodes.childNodes.length !== 2) throw new Error("bad fragment")
			} finally { uninstall(); window.close() }
		`
		const result = spawnSync(process.execPath, ["--eval", script], { cwd: ROOT, encoding: "utf8" })
		expect(result.stderr).toBe("")
		expect(result.status).toBe(0)
	})
})

// EOF
