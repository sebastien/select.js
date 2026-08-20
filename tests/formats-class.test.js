import { describe, expect, test } from "bun:test"

import { format } from "../src/js/select/features/formats.js"

describe("class formatter", () => {
	test("joins strings, arrays, and object flags", () => {
		const cssClass = format("class")
		expect(cssClass("fit-w", { lined: true, hidden: false }, ["p-2", ""])).toBe(
			"fit-w lined p-2",
		)
	})
})
