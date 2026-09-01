import { describe, expect, test } from "bun:test"
import { route } from "../src/js/select/state/routing.js"
import { mask } from "../src/js/select/ui/mask.js"
import { parsePattern, parseSlot } from "../src/js/select/utils/pattern.js"

describe("routing pattern parser", () => {
	test("parses slots with regexp quantifiers and colons", () => {
		const slot = parseSlot("{time:\\d\\d:\\d\\d}")
		expect(slot.name).toBe("time")
		expect(slot.type).toBe("\\d\\d:\\d\\d")
		expect(parsePattern("{year:\\d{4}}/{month:number}")).toHaveLength(3)
		expect(route("users/{id:number}")[1].name).toBe("id")
	})
})

describe("mask", () => {
	const date = mask("{year:\\d{4}}/{month:\\d\\d?}/{day:\\d\\d?}", {
		year: Number,
		month: Number,
		day: Number,
	})
	const completedDate = mask("{year:\\d{4}}-{month:\\d\\d?}-{day:\\d\\d?}", {
		year: Number,
		month: Number,
		day: Number,
	}, { placeholder: "_", pad: "0" })
	const boundedDate = mask("{year:\\d{4}}-{month:\\d\\d?}-{day:\\d\\d?}", {
		year: Number,
		month: Number,
		day: Number,
	}, { placeholder: "_", pad: "0", bounds: { month: [1, 12], day: [1, 31] } })
	const boundedTime = mask("{hour:\\d\\d?}:{minute:\\d\\d?}", {
		hour: Number,
		minute: Number,
	}, { placeholder: "_", pad: "0", bounds: { hour: [0, 23], minute: [0, 59] } })

	test("parses and normalizes complete values", () => {
		expect(date.parse("2026/08/23")).toEqual({ year: 2026, month: 8, day: 23 })
		expect(date.parse("2026/8/23")).toEqual({ year: 2026, month: 8, day: 23 })
		expect(date.parse("2026/8")).toBeNull()
	})

	test("formats values and applies separators while typing", () => {
		expect(date.format({ year: 2026, month: 8, day: 23 })).toBe("2026/8/23")
		expect(date.apply("20268").text).toBe("2026/8")
		expect(date.apply("2026/8/23").text).toBe("2026/8/23")
	})

	test("rejects characters outside a slot", () => {
		expect(date.apply("20a6").text).toBe("20")
	})

	test("fills incomplete slots and positions the cursor", () => {
		expect(completedDate.apply("20", 2)).toMatchObject({
		text: "20__-__-__",
		cursor: 2,
	})
		expect(completedDate.apply("2016-1-", 7)).toMatchObject({
		text: "2016-01-__",
		cursor: 8,
	})
	})

	test("accepts continued input containing placeholders", () => {
		expect(completedDate.apply("2016-01-2_", 10)).toMatchObject({
		text: "2016-01-2_",
		cursor: 9,
	})
	})

	test("keeps later slots when replacing or overflowing a slot", () => {
		expect(completedDate.apply("2026-1-31", 6)).toMatchObject({
			text: "2026-1_-31",
			cursor: 6,
		})
		expect(completedDate.apply("1-08-31", 1)).toMatchObject({
			text: "1___-08-31",
			cursor: 1,
		})
		expect(completedDate.apply("2026-018-31", 7)).toMatchObject({
			text: "2026-01-31",
		})
		expect(completedDate.apply("2026-08-1", 9)).toMatchObject({
			text: "2026-08-1_",
			cursor: 9,
		})
	})

	test("does not pad a slot when the following literal was not just typed", () => {
		expect(completedDate.apply("201-", 3)).toMatchObject({
			text: "201_-__-__",
			cursor: 3,
		})
		expect(completedDate.apply("201-__-__", 3)).toMatchObject({
			text: "201_-__-__",
			cursor: 3,
		})
		expect(completedDate.apply("2016-0-", 6)).toMatchObject({
			text: "2016-0_-__",
			cursor: 6,
		})
		expect(completedDate.apply("2016-0_-__", 6)).toMatchObject({
			text: "2016-0_-__",
			cursor: 6,
		})
	})

	test("clamps completed slots to bounds", () => {
		expect(boundedDate.apply("2016-00-15", 10)).toMatchObject({
			text: "2016-01-15",
		})
		expect(boundedDate.apply("2016-99-15", 10)).toMatchObject({
			text: "2016-12-15",
		})
		expect(boundedDate.apply("2016-02-31", 10)).toMatchObject({
			text: "2016-02-29",
		})
		expect(boundedDate.apply("2015-02-31", 10)).toMatchObject({
			text: "2015-02-28",
		})
		expect(boundedDate.apply("2016-0_-__", 6)).toMatchObject({
			text: "2016-0_-__",
		})
		expect(boundedTime.apply("99:99", 5)).toMatchObject({
			text: "23:59",
		})
		expect(boundedTime.apply("00:00", 5)).toMatchObject({
			text: "00:00",
		})
	})

	test("preserves the caret inside a complete value", () => {
		expect(completedDate.apply("2026-08-31", 1)).toMatchObject({
			text: "2026-08-31",
			cursor: 1,
		})
		expect(completedDate.apply("2026-08-31", 6)).toMatchObject({
			text: "2026-08-31",
			cursor: 6,
		})
		expect(completedDate.apply("2026-08-31", 9)).toMatchObject({
			text: "2026-08-31",
			cursor: 9,
		})
		expect(completedDate.apply("2026-08-31", 5)).toMatchObject({
			text: "2026-08-31",
			cursor: 5,
		})
		expect(completedDate.apply("2026-08-31", 0)).toMatchObject({
			text: "2026-08-31",
			cursor: 0,
		})
		expect(completedDate.apply("2026-08-31", 7)).toMatchObject({
			text: "2026-08-31",
			cursor: 7,
		})
	})

	test("keeps the caret after inserted digits inside a slot", () => {
		expect(completedDate.apply("22026-08-31", 1)).toMatchObject({
			text: "2202-08-31",
			cursor: 1,
		})
		expect(completedDate.apply("20202-08-31", 2)).toMatchObject({
			text: "2020-08-31",
			cursor: 2,
		})
	})
})
