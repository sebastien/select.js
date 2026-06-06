import { describe, expect, test } from "bun:test"
import browser, { Browser } from "../src/js/select/browser.js"

describe("Browser.parse", () => {
	test("coerces standalone boolean strings", () => {
		const instance = new Browser()
		expect(instance.parse("true")).toBe(true)
		expect(instance.parse("false")).toBe(false)
		expect(instance.parse("hello")).toBe("hello")
	})

	test("shared singleton parses booleans too", () => {
		expect(browser().parse("true")).toBe(true)
		expect(browser().parse("false")).toBe(false)
	})
})

// EOF
