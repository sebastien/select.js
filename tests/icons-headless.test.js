// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-10-07

import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../", import.meta.url))

for (const headless of [true, false]) {
	test(`icons install after ${headless ? "headless" : "browser"} import`, () => {
		const script = `
			(async () => {
				const assert = (await import("node:assert/strict")).default
				for (const key of ["document", "window", "HTMLElement", "customElements"]) {
					assert.equal(key in globalThis, false, "DOM global leaked: " + key)
				}
				let mod
				if (${headless}) {
					mod = await import("./src/js/select/features/icons.js")
					assert.equal(mod.default.container, null)
					assert.equal(mod.IconContainer, null)
					mod.default.install()
					assert.equal(mod.default.container, null)
				}
				const { Window } = await import("happy-dom")
				const window = new Window()
				for (const key of ["document", "HTMLElement", "customElements", "Node", "DOMParser"]) {
					globalThis[key] = window[key]
				}
				globalThis.window = window
				globalThis.fetch = async () => new Response('<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>')
				mod ||= await import("./src/js/select/features/icons.js")
				assert.equal(mod.default.install, mod.install)
				mod.default.install("ui-icon")
				const container = mod.default.container
				assert.ok(container instanceof window.SVGElement)
				assert.equal(container.ownerDocument, document)
				assert.equal(container, mod.IconContainer)
				assert.equal(mod.default.container, container)
				const First = customElements.get("ui-icon")
				mod.install("ui-icon")
				assert.equal(customElements.get("ui-icon"), First)
				mod.install("ui-icon-other")
				assert.notEqual(customElements.get("ui-icon-other"), First)
				for (const tag of ["ui-icon", "ui-icon-other"]) {
					const element = document.createElement(tag)
					assert.ok(element instanceof HTMLElement)
					assert.ok(element.shadowRoot)
					element.setAttribute("icon", "lucide:home")
					document.body.appendChild(element)
					await mod.load("home", "lucide")
					// Inline rendering follows the shared load promise in another microtask.
					await Promise.resolve()
					assert.ok(element.shadowRoot.querySelector("svg path"))
					element.setAttribute("size", "32")
					assert.equal(element.shadowRoot.querySelector("svg").getAttribute("width"), "32")
				}
				window.close()
				process.stdout.write("OK")
			})().catch((error) => {
				process.stderr.write(String(error.stack || error))
				process.exit(1)
			})
		`
		const result = spawnSync(process.execPath, ["-e", script], {
			cwd: ROOT,
			encoding: "utf8",
		})
		expect(result.stderr).toBe("")
		expect(result.status).toBe(0)
		expect(result.stdout).toBe("OK")
	})
}

test("explicit icon containers load and sanitize without DOM globals", () => {
	const script = `
		(async () => {
			const assert = (await import("node:assert/strict")).default
			const keys = ["document", "window", "HTMLElement", "customElements", "Node", "DOMParser"]
			const assertHeadless = () => {
				for (const key of keys) assert.equal(key in globalThis, false, "DOM global leaked: " + key)
			}
			assertHeadless()
			const mod = await import("./src/js/select/features/icons.js")
			await assert.rejects(mod.load("home", "lucide"), /a DOM .* is required/)
			const { Window } = await import("happy-dom")
			const window = new Window()
			const document = window.document
			const body = '<title>Safe title</title><g><script/><path d="M0 0h24v24H0z" onclick="bad()" fill="url(https://bad.invalid/x)"/><use href="#local"/><use href="https://bad.invalid/x"/></g>'
			let requests = 0
			globalThis.fetch = async (url) => {
				requests++
				return new Response(url.endsWith(".json")
					? JSON.stringify({ prefix: "test", width: 24, height: 24, icons: { home: { body } } })
					: '<svg viewBox="0 0 24 24" onload="bad()">' + body + '</svg>')
			}
			for (const format of ["svg", "iconify"]) {
				const container = document.createElementNS("http://www.w3.org/2000/svg", "svg")
				const source = { format, url: "https://icons.test/home." + (format === "svg" ? "svg" : "json") }
				const cache = new Map()
				const symbol = await mod.load("home", source, container, cache)
				assert.ok(symbol instanceof window.SVGElement)
				assert.equal(symbol.parentNode, container)
				assert.equal(container.parentNode, document.body)
				assert.equal(symbol.firstChild.getAttribute("viewBox"), "0 0 24 24")
				assert.equal(symbol.firstChild.hasAttribute("onload"), false)
				assert.equal(symbol.querySelector("script"), null)
				assert.equal(symbol.querySelector("title").textContent, "Safe title")
				assert.equal(symbol.querySelector("path").getAttribute("d"), "M0 0h24v24H0z")
				assert.equal(symbol.querySelector("path").hasAttribute("onclick"), false)
				assert.equal(symbol.querySelector("path").hasAttribute("fill"), false)
				assert.equal(symbol.querySelector("use").getAttribute("href"), "#local")
				assert.equal(symbol.querySelectorAll("use")[1].hasAttribute("href"), false)
				for (const node of [symbol, ...symbol.querySelectorAll("*"), symbol.querySelector("title").firstChild]) {
					assert.equal(node.ownerDocument, document)
				}
				assert.equal(await mod.load("home", source, container, cache), symbol)
				for (const mode of ["inline", undefined]) {
					const icon = mod.icon("home", source, { container, mode })
					await mod.load("home", source, container)
					await Promise.resolve()
					assert.equal(icon.ownerDocument, document)
					assert.ok(icon.querySelector(mode === "inline" ? "path" : "use"))
				}
				assertHeadless()
			}
			assert.equal(requests, 4)
			assert.equal(mod.default.container, null)
			assert.equal(mod.IconContainer, null)
			window.close()
			process.stdout.write("OK")
		})().catch((error) => {
			process.stderr.write(String(error.stack || error))
			process.exit(1)
		})
	`
	const result = spawnSync(process.execPath, ["-e", script], {
		cwd: ROOT,
		encoding: "utf8",
	})
	expect(result.stderr).toBe("")
	expect(result.status).toBe(0)
	expect(result.stdout).toBe("OK")
})

// EOF
