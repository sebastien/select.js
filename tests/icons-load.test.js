// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-17

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let window
let load
let fetchCalls
let fetchStub
let originalFetch
let originalDateNow
let now

function setupGlobals(win) {
	win.SyntaxError = SyntaxError
	win.TypeError = TypeError
	win.Error = Error
	const g = globalThis
	g.window = win
	g.document = win.document
	g.Node = win.Node
	g.Element = win.Element
	g.HTMLElement = win.HTMLElement
	g.DocumentFragment = win.DocumentFragment
	g.Text = win.Text
	g.Comment = win.Comment
	g.Document = win.Document
	g.DOMParser = win.DOMParser
	g.MutationObserver = win.MutationObserver
	g.CustomEvent = win.CustomEvent
	g.Event = win.Event
	g.MouseEvent = win.MouseEvent
	g.KeyboardEvent = win.KeyboardEvent
	g.NodeFilter = win.NodeFilter
	g.SVGElement = win.SVGElement
	g.customElements = win.customElements
	g.requestAnimationFrame = (fn) => setTimeout(fn, 0)
	g.cancelAnimationFrame = (id) => clearTimeout(id)
	g.navigator = win.navigator
	g.getComputedStyle = win.getComputedStyle.bind(win)
}

function makeContainer() {
	return document.createElementNS("http://www.w3.org/2000/svg", "svg")
}

function response(text) {
	return Promise.resolve({ text: () => Promise.resolve(text) })
}

describe("icons.load", () => {
	beforeAll(async () => {
		window = new Window({ url: "http://localhost:8000/icons" })
		setupGlobals(window)
		originalFetch = globalThis.fetch
		originalDateNow = Date.now
		;({ load } = await import("../src/js/select/icons.js"))
	})

	afterAll(() => {
		globalThis.fetch = originalFetch
		Date.now = originalDateNow
		window?.close()
	})

	beforeEach(() => {
		document.body.innerHTML = ""
		fetchCalls = []
		now = 0
		Date.now = () => now
		fetchStub = (...args) => {
			fetchCalls.push(args)
			return response('<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>')
		}
		globalThis.fetch = fetchStub
	})

	test("retries after backoff for a transient load failure", async () => {
		let attempts = 0
		globalThis.fetch = (url) => {
			fetchCalls.push([url])
			attempts += 1
			return attempts === 1
				? Promise.reject(new Error("temporary outage"))
				: response('<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>')
		}
		const cache = new Map()
		const container = makeContainer()

		const first = await load("alert-circle", "lucide", container, cache)
		expect(first).toBeUndefined()
		expect(cache.size).toBe(1)
		expect(container.children.length).toBe(0)

		const second = await load("alert-circle", "lucide", container, cache)
		expect(second).toBeUndefined()
		expect(fetchCalls).toHaveLength(1)

		now = 250
		const third = await load("alert-circle", "lucide", container, cache)
		expect(fetchCalls).toHaveLength(2)
		expect(third?.id).toBe("icon-alert-circle-lucide")
		expect(cache.size).toBe(1)
		expect(container.children.length).toBe(1)
	})

	test("stops retrying after three backoff retries", async () => {
		globalThis.fetch = (url) => {
			fetchCalls.push([url])
			return Promise.reject(new Error("missing"))
		}
		const cache = new Map()
		const container = makeContainer()

		await load("missing", "lucide", container, cache)
		expect(fetchCalls).toHaveLength(1)

		now = 250
		await load("missing", "lucide", container, cache)
		expect(fetchCalls).toHaveLength(2)

		now = 750
		await load("missing", "lucide", container, cache)
		expect(fetchCalls).toHaveLength(3)

		now = 1750
		await load("missing", "lucide", container, cache)
		expect(fetchCalls).toHaveLength(4)

		now = 10000
		const result = await load("missing", "lucide", container, cache)
		expect(result).toBeUndefined()
		expect(fetchCalls).toHaveLength(4)
		expect(cache.size).toBe(1)
		expect(container.children.length).toBe(0)
	})

	test("reuses the cached result after a successful load", async () => {
		const cache = new Map()
		const container = makeContainer()

		const first = await load("check", "lucide", container, cache)
		const second = await load("check", "lucide", container, cache)

		expect(fetchCalls).toHaveLength(1)
		expect(first).toBe(second)
		expect(cache.size).toBe(1)
		expect(container.children.length).toBe(1)
	})
})

// EOF
