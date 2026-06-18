import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Window } from "happy-dom"
import * as utils from "../src/js/select/utils.js"
import {
	by,
	days,
	datedays,
	day,
	diffcal,
	dist,
	fromDate,
	fromTimestamp,
	fromTuple,
	hour,
	minute,
	months,
	monthdays,
	month,
	now,
	second,
	timezone,
	toDate,
	toTimestamp,
	toTuple,
	week,
	weeks,
	year,
	yeardays,
} from "../src/js/select/utils/dates.js"

const ROOT = path.resolve(import.meta.dir, "..")

function setupGlobals() {
	const window = new Window()
	Object.assign(globalThis, {
		window,
		document: window.document,
		Node: window.Node,
		Element: window.Element,
		HTMLElement: window.HTMLElement,
		DocumentFragment: window.DocumentFragment,
		Text: window.Text,
		Comment: window.Comment,
		Document: window.Document,
		DOMParser: window.DOMParser,
		MutationObserver: window.MutationObserver,
		CustomEvent: window.CustomEvent,
		Event: window.Event,
		MouseEvent: window.MouseEvent,
		KeyboardEvent: window.KeyboardEvent,
		NodeFilter: window.NodeFilter,
		SVGElement: window.SVGElement,
		customElements: window.customElements,
		requestAnimationFrame: window.requestAnimationFrame.bind(window),
		cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
		navigator: window.navigator,
		getComputedStyle: window.getComputedStyle.bind(window),
	})
	return window
}

function pathToFileURL(filePath) {
	let resolved = path.resolve(filePath).replace(/\\/g, "/")
	if (!resolved.startsWith("/")) {
		resolved = `/${resolved}`
	}
	return new URL(`file://${resolved}`)
}

describe("utils.dates export surface", () => {
	test("exports dates namespace from utils and top-level index", async () => {
		const window = setupGlobals()
		const index = await import(pathToFileURL(path.join(ROOT, "src/js/select/index.js")).href)
		expect(utils.dates).toBeDefined()
		expect(utils.dates.fromTuple).toBe(fromTuple)
		expect(utils.dates.toTuple).toBe(toTuple)
		expect(index.dates).toBeDefined()
		expect(index.dates.toTimestamp).toBe(toTimestamp)
		expect(index.fromTuple).toBe(fromTuple)
		window.close()
	})
})

describe("utils.dates calendar helpers", () => {
	test("calculates year and month day counts", () => {
		expect(yeardays(2024)).toBe(366)
		expect(yeardays(2023)).toBe(365)
		expect(yeardays(2023, 3)).toBe(59)
		expect(yeardays(2024, 3)).toBe(60)
		expect(monthdays(2023, 2)).toBe(28)
		expect(monthdays(2024, 2)).toBe(29)
	})

	test("calculates days for a given year start", () => {
		expect(datedays(2024)).toBe(datedays(2024, 1, 1))
	})

	test("progresses by 365 days for non-leap years", () => {
		expect(datedays(2024) - datedays(2023)).toBe(365)
	})

	test("progresses by 366 days for leap years", () => {
		expect(datedays(2025) - datedays(2024)).toBe(366)
	})

	test("handles month progression correctly within a year", () => {
		expect(datedays(2023, 2, 1) - datedays(2023, 1, 1)).toBe(31)
		expect(datedays(2023, 3, 1) - datedays(2023, 2, 1)).toBe(28)
	})

	test("handles leap and non-leap February correctly", () => {
		const leapFeb28 = datedays(2024, 2, 28)
		const leapFeb29 = datedays(2024, 2, 29)
		const leapMar1 = datedays(2024, 3, 1)
		expect(leapFeb29 - leapFeb28).toBe(1)
		expect(leapMar1 - leapFeb29).toBe(1)

		const feb28 = datedays(2023, 2, 28)
		const mar1 = datedays(2023, 3, 1)
		expect(mar1 - feb28).toBe(1)
	})

	test("validates century rules for leap years", () => {
		expect(datedays(1901) - datedays(1900)).toBe(365)
		expect(datedays(2001) - datedays(2000)).toBe(366)
	})

	test("calculates day progression correctly", () => {
		expect(datedays(2024, 1, 10) - datedays(2024, 1, 1)).toBe(9)
	})
})

describe("utils.dates conversion helpers", () => {
	test("converts explicitly between supported date representations", () => {
		const tuple = [2024, 6, 10, 12, 34, 56]
		const dateNum = fromTuple(tuple)
		const iso = "2024-06-10T12:34:56.000Z"
		expect(toTuple(dateNum)).toEqual(tuple)
		expect(toDate(dateNum).toISOString()).toBe(iso)
		expect(toTimestamp(dateNum)).toBe(1718022896)
		expect(fromDate(new Date(iso))).toBe(dateNum)
		expect(fromTimestamp(1718022896)).toBe(dateNum)
	})

	test("converts explicit date components to a numeric value", () => {
		const result = fromTuple([2024, 1, 1])
		expect(result).toBeTypeOf("number")
		expect(result).toBeGreaterThan(0)
	})

	test("converts Date objects consistently using UTC fields", () => {
		const value = new Date("2024-01-01T00:00:00Z")
		expect(fromDate(value)).toBe(fromTuple([2024, 1, 1]))
	})

	test("includes time components correctly", () => {
		const base = fromTuple([2024, 1, 1])
		const withTime = fromTuple([2024, 1, 1, 12, 30, 30])
		expect(withTime - base).toBe(
			12 * by.hour.step + 30 * by.minute.step + 30 * by.second.step,
		)
	})

	test("matches Date object input and explicit components with time", () => {
		const d = new Date("2024-01-01T14:15:16Z")
		expect(fromDate(d)).toBe(fromTuple([2024, 1, 1, 14, 15, 16]))
	})

	test("handles leap years and non-leap years correctly", () => {
		const leapFeb28 = fromTuple([2024, 2, 28])
		const leapFeb29 = fromTuple([2024, 2, 29])
		const leapMar1 = fromTuple([2024, 3, 1])
		expect(leapFeb29 - leapFeb28).toBe(by.day.step)
		expect(leapMar1 - leapFeb29).toBe(by.day.step)

		const feb28 = fromTuple([2023, 2, 28])
		const mar1 = fromTuple([2023, 3, 1])
		expect(mar1 - feb28).toBe(by.day.step)
	})

	test("round-trips selected dates", () => {
		const inputs = [
			[2024, 1, 1],
			[2024, 7, 1],
			[2024, 2, 29],
			[2023, 2, 28],
			[2023, 12, 31],
			[1900, 1, 1],
			[100, 12, 31],
			[200, 1, 1],
			[1582, 10, 4],
			[1600, 2, 29],
			[1700, 2, 28],
		]

		for (const [y, m, d] of inputs) {
			const [ry, rm, rd, rh, rmn, rs] = toTuple(fromTuple([y, m, d]))
			expect([ry, rm, rd, rh, rmn, rs]).toEqual([y, m, d, 0, 0, 0])
		}
	})

	test("round-trips time components", () => {
		const parts = [2024, 5, 20, 14, 30, 45]
		expect(toTuple(fromTuple(parts))).toEqual(parts)
	})

	test("supports canonical extraction through toTuple", () => {
		expect(toTuple(fromDate(new Date("2024-01-01T00:00:00Z"))).slice(0, 3)).toEqual([
			2024,
			1,
			1,
		])
		expect(toTuple(fromTuple([2024, 1, 2, 3, 4, 5])).slice(0, 3)).toEqual([
			2024,
			1,
			2,
		])
	})

	test("exposes date part accessors and now helper on canonical values", () => {
		const d = new Date("2024-05-20T14:30:45Z")
		const dn = fromTuple([2024, 5, 20, 14, 30, 45])
		expect(year(fromDate(d))).toBe(2024)
		expect(month(fromDate(d))).toBe(5)
		expect(day(fromDate(d))).toBe(20)
		expect(hour(fromDate(d))).toBe(14)
		expect(minute(fromDate(d))).toBe(30)
		expect(second(fromDate(d))).toBe(45)
		expect(year(dn)).toBe(2024)
		expect(month(dn)).toBe(5)
		expect(day(dn)).toBe(20)
		expect(hour(dn)).toBe(14)
		expect(minute(dn)).toBe(30)
		expect(second(dn)).toBe(45)
		expect(year(fromTuple([2024, 5, 20, 14, 30, 45]))).toBe(2024)
		expect(month(fromTuple([2024, 5, 20, 14, 30, 45]))).toBe(5)
		expect(day(fromTuple([2024, 5, 20, 14, 30, 45]))).toBe(20)
		expect(hour(fromTuple([2024, 5, 20, 14, 30, 45]))).toBe(14)
		expect(minute(fromTuple([2024, 5, 20, 14, 30, 45]))).toBe(30)
		expect(second(fromTuple([2024, 5, 20, 14, 30, 45]))).toBe(45)
		expect(toTuple(now())).toHaveLength(6)
	})

	test("lists month, day, and week ranges as canonical DateNum values", () => {
		const yearMonths = months(fromTuple([2024, 5, 20]))
		expect(yearMonths).toHaveLength(12)
		expect(toTuple(yearMonths[0]).slice(0, 3)).toEqual([2024, 1, 1])
		expect(toTuple(yearMonths[4]).slice(0, 3)).toEqual([2024, 5, 1])
		expect(toTuple(yearMonths[11]).slice(0, 3)).toEqual([2024, 12, 1])

		const monthDays = days(fromTuple([2024, 2, 20]))
		expect(monthDays).toHaveLength(29)
		expect(toTuple(monthDays[0]).slice(0, 3)).toEqual([2024, 2, 1])
		expect(toTuple(monthDays[28]).slice(0, 3)).toEqual([2024, 2, 29])

		expect(toTuple(week(fromTuple([2024, 1, 1]))).slice(0, 3)).toEqual([2024, 1, 1])
		expect(toTuple(week(fromTuple([2024, 1, 8]))).slice(0, 3)).toEqual([2024, 1, 8])
		expect(toTuple(week(fromTuple([2024, 1, 10]))).slice(0, 3)).toEqual([2024, 1, 8])
		expect(toTuple(week(fromTuple([2024, 1, 7]), 6)).slice(0, 3)).toEqual([2024, 1, 7])
		expect(toTuple(week(fromTuple([2024, 1, 8]), 6)).slice(0, 3)).toEqual([2024, 1, 7])

		const monthWeeks = weeks(fromTuple([2024, 1, 20]))
		expect(monthWeeks.map((_) => toTuple(_).slice(0, 3))).toEqual([
			[2024, 1, 1],
			[2024, 1, 8],
			[2024, 1, 15],
			[2024, 1, 22],
			[2024, 1, 29],
		])
		expect(monthWeeks.at(-1)).toEqual(week(fromTuple([2024, 1, 31])))

		const septemberWeeks = weeks(fromTuple([2024, 9, 20]))
		expect(septemberWeeks[0]).toEqual(week(fromTuple([2024, 9, 1])))
		expect(septemberWeeks.at(-1)).toEqual(week(fromTuple([2024, 9, 30])))
		expect(weeks(fromTuple([2024, 1, 20]), 6).map((_) => toTuple(_).slice(0, 3))).toEqual([
			[2023, 12, 31],
			[2024, 1, 7],
			[2024, 1, 14],
			[2024, 1, 21],
			[2024, 1, 28],
		])
	})
})

describe("utils.dates diff helpers", () => {
	test("calculates exact calendar differences", () => {
		expect(diffcal(fromTuple([2023, 1, 1]), fromTuple([2023, 1, 10]))).toEqual([0, 0, 9, 0, 0, 0])
		expect(diffcal(fromTuple([2023, 1, 1]), fromTuple([2023, 2, 1]))).toEqual([0, 1, 0, 0, 0, 0])
		expect(diffcal(fromTuple([2024, 2, 28]), fromTuple([2024, 3, 1]))).toEqual([0, 0, 2, 0, 0, 0])
		expect(diffcal(fromTuple([2023, 2, 28]), fromTuple([2023, 3, 1]))).toEqual([0, 0, 1, 0, 0, 0])
		expect(diffcal(fromTuple([2023, 2, 1]), fromTuple([2023, 1, 1]))).toEqual([0, -1, 0, 0, 0, 0])
		expect(diffcal(fromTuple([2023, 1, 1, 10, 0, 0]), fromTuple([2023, 1, 1, 12, 30, 15]))).toEqual([
			0,
			0,
			0,
			2,
			30,
			15,
		])
		expect(diffcal(fromTuple([2023, 1, 20]), fromTuple([2023, 2, 1]))).toEqual([0, 0, 12, 0, 0, 0])
	})

	test("calculates approximate linear distances", () => {
		const totalMs =
			by.year.step + by.month.step + by.day.step + by.hour.step + by.minute.step + by.second.step
		expect(dist(totalMs)).toEqual([1, 1, 1, 1, 1, 1])

		const d1 = fromTuple([2024, 1, 1])
		const d2 = fromTuple([2025, 2, 2, 1, 1, 1])
		const distance = d2 - d1
		const components = dist(d1, d2)
		const reconstructed =
			components[0] * by.year.step +
			components[1] * by.month.step +
			components[2] * by.day.step +
			components[3] * by.hour.step +
			components[4] * by.minute.step +
			components[5] * by.second.step
		expect(Math.abs(reconstructed - distance)).toBeLessThan(1000)
		expect(dist(1000, 0)[5]).toBeLessThan(0)
	})

	test("returns timezone offsets in minute-step increments", () => {
		expect(timezone() % by.minute.step).toBe(0)
	})
})

describe("utils.dates synthetic validation", () => {
	test("round-trips all dates from year 0 to 3000", () => {
		let failures = 0
		const errors = []
		const maxErrors = 10

		for (let y = 0; y <= 3000; y++) {
			for (let m = 1; m <= 12; m++) {
				const dmax = monthdays(y, m)
				for (let d = 1; d <= dmax; d++) {
					const dn = fromTuple([y, m, d])
					const [ry, rm, rd] = toTuple(dn)
					if (ry !== y || rm !== m || rd !== d) {
						failures++
						if (failures <= maxErrors) {
							errors.push(`Mismatch: ${y}-${m}-${d} -> ${dn} -> ${ry}-${rm}-${rd}`)
						}
					}
				}
			}
		}

		expect(errors).toEqual([])
		expect(failures).toBe(0)
	})
})

// EOF
