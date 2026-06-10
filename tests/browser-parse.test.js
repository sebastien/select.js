import { describe, expect, test } from "bun:test"
import browser, { Browser } from "../src/js/select/browser.js"

describe("Browser.parse", () => {
	test("coerces standalone boolean strings", () => {
		const instance = new Browser()
		expect(instance.parse("true")).toBe(true)
		expect(instance.parse("false")).toBe(false)
		expect(instance.parse("hello")).toBe("hello")
	})

	test("supports colon selections across browser cells", () => {
		const instance = new Browser()

		instance.parse("@session.user:profile.name").set("Ada")
		expect(instance.internal("session.user").value).toEqual({
			profile: { name: "Ada" },
		})

		instance.parse("#filters.state:current.label").set("Open")
		expect(instance.hash.value).toEqual({
			"filters.state": { current: { label: "Open" } },
		})

		instance.parse("?users:list.0.name").set("Lin")
		expect(instance.query.value).toEqual({
			users: { list: [{ name: "Lin" }] },
		})
	})

	test("shared singleton parses booleans too", () => {
		expect(browser().parse("true")).toBe(true)
		expect(browser().parse("false")).toBe(false)
	})
})

// EOF
