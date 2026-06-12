import { describe, expect, test } from "bun:test"
import browser, { Browser } from "../src/js/select/browser.js"

describe("Browser.ref", () => {
	test("returns undefined for non-reference values", () => {
		const instance = new Browser()
		expect(instance.ref("true")).toBeUndefined()
		expect(instance.ref("hello")).toBeUndefined()
		expect(instance.ref({})).toBeUndefined()
	})

	test("supports colon selections across browser cells", () => {
		const instance = new Browser()

		instance.ref("@session.user:profile.name").set("Ada")
		expect(instance.internal("session.user").value).toEqual({
			profile: { name: "Ada" },
		})

		instance.ref("#filters.state:current.label").set("Open")
		expect(instance.hash.value).toEqual({
			"filters.state": { current: { label: "Open" } },
		})

		instance.ref("?users:list.0.name").set("Lin")
		expect(instance.query.value).toEqual({
			users: { list: [{ name: "Lin" }] },
		})
	})
})

describe("Browser.val", () => {
	test("coerces standalone boolean and numeric strings and leaves hashformat text untouched", () => {
		const instance = new Browser()
		expect(instance.val("true")).toBe(true)
		expect(instance.val("false")).toBe(false)
		expect(instance.val("2026")).toBe(2026)
		expect(instance.val("1.5")).toBe(1.5)
		expect(instance.val("hello")).toBe("hello")
		expect(instance.val("a,b,c")).toBe("a,b,c")
		expect(instance.val("a=b")).toBe("a=b")
		expect(instance.val("(a,b,c)")).toEqual(["a", "b", "c"])
		expect(instance.val("@session.user:profile.name")).toBe(
			"@session.user:profile.name",
		)
	})
})

describe("Browser.parse", () => {
	test("dispatches to ref() for references and val() for plain values", () => {
		const instance = new Browser()

		instance.parse("@session.user:profile.name").set("Ada")
		expect(instance.internal("session.user").value).toEqual({
			profile: { name: "Ada" },
		})

		expect(instance.parse("true")).toBe(true)
		expect(instance.parse("false")).toBe(false)
		expect(instance.parse("2026")).toBe(2026)
		expect(instance.parse("1.5")).toBe(1.5)
		expect(instance.parse("hello")).toBe("hello")
		expect(instance.parse("a,b,c")).toBe("a,b,c")
		expect(instance.parse("a=b")).toBe("a=b")
		expect(instance.parse("(a,b,c)")).toEqual(["a", "b", "c"])
	})

	test("shared singleton parses booleans and numbers too", () => {
		expect(browser().parse("true")).toBe(true)
		expect(browser().parse("false")).toBe(false)
		expect(browser().parse("2026")).toBe(2026)
	})
})

// EOF
