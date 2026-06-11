import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Window } from "happy-dom"
import * as utils from "../src/js/select/utils.js"
import {
	by,
	date,
	days,
	datedays,
	datenum,
	day,
	diffcal,
	dist,
	hour,
	minute,
	months,
	monthdays,
	month,
	now,
	numdate,
	second,
	timezone,
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
		expect(utils.dates.datenum).toBe(datenum)
		expect(index.dates).toBeDefined()
		expect(index.dates.numdate).toBe(numdate)
		expect(index.datenum).toBe(datenum)
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

describe("utils.dates datenum and numdate", () => {
	test("converts explicit date components to a numeric value", () => {
		const result = datenum(2024, 1, 1)
		expect(result).toBeTypeOf("number")
		expect(result).toBeGreaterThan(0)
	})

	test("converts Date objects consistently", () => {
		const value = new Date(2024, 0, 1)
		expect(datenum(value)).toBe(datenum(2024, 1, 1))
	})

	test("includes time components correctly", () => {
		const base = datenum(2024, 1, 1)
		const withTime = datenum(2024, 1, 1, 12, 30, 30)
		expect(withTime - base).toBe(
			12 * by.hour.step + 30 * by.minute.step + 30 * by.second.step,
		)
	})

	test("matches Date object input and explicit components with time", () => {
		const d = new Date(2024, 0, 1, 14, 15, 16)
		expect(datenum(d)).toBe(datenum(2024, 1, 1, 14, 15, 16))
	})

	test("handles leap years and non-leap years correctly", () => {
		const leapFeb28 = datenum(2024, 2, 28)
		const leapFeb29 = datenum(2024, 2, 29)
		const leapMar1 = datenum(2024, 3, 1)
		expect(leapFeb29 - leapFeb28).toBe(by.day.step)
		expect(leapMar1 - leapFeb29).toBe(by.day.step)

		const feb28 = datenum(2023, 2, 28)
		const mar1 = datenum(2023, 3, 1)
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
			const [ry, rm, rd, rh, rmn, rs] = numdate(datenum(y, m, d))
			expect([ry, rm, rd, rh, rmn, rs]).toEqual([y, m, d, 0, 0, 0])
		}
	})

	test("round-trips time components", () => {
		const parts = [2024, 5, 20, 14, 30, 45]
		expect(numdate(datenum(...parts))).toEqual(parts)
	})

	test("supports the high-level date helper", () => {
		expect(date(new Date(2024, 0, 1))).toEqual([2024, 1, 1])
		expect(date(2024, 1, 2)).toEqual([2024, 1, 2])
		expect(date(datenum(2024, 1, 2, 3, 4, 5))).toEqual([2024, 1, 2, 3, 4, 5])
	})

	test("exposes date part accessors and now helper", () => {
		const d = new Date(2024, 4, 20, 14, 30, 45)
		const dn = datenum(2024, 5, 20, 14, 30, 45)
		expect(year(d)).toBe(2024)
		expect(month(d)).toBe(5)
		expect(day(d)).toBe(20)
		expect(hour(d)).toBe(14)
		expect(minute(d)).toBe(30)
		expect(second(d)).toBe(45)
		expect(year(dn)).toBe(2024)
		expect(month(dn)).toBe(5)
		expect(day(dn)).toBe(20)
		expect(hour(dn)).toBe(14)
		expect(minute(dn)).toBe(30)
		expect(second(dn)).toBe(45)
		expect(year([2024, 5, 20, 14, 30, 45])).toBe(2024)
		expect(month([2024, 5, 20, 14, 30, 45])).toBe(5)
		expect(day([2024, 5, 20, 14, 30, 45])).toBe(20)
		expect(hour([2024, 5, 20, 14, 30, 45])).toBe(14)
		expect(minute([2024, 5, 20, 14, 30, 45])).toBe(30)
		expect(second([2024, 5, 20, 14, 30, 45])).toBe(45)
		expect(now()).toEqual(date(new Date()))
	})

	test("lists month, day, and week ranges from a date context", () => {
		const yearMonths = months([2024, 5, 20])
		expect(yearMonths).toHaveLength(12)
		expect(yearMonths[0]).toEqual([2024, 1, 1])
		expect(yearMonths[4]).toEqual([2024, 5, 1])
		expect(yearMonths[11]).toEqual([2024, 12, 1])

		const monthDays = days([2024, 2, 20])
		expect(monthDays).toHaveLength(29)
		expect(monthDays[0]).toEqual([2024, 2, 1])
		expect(monthDays[28]).toEqual([2024, 2, 29])

		expect(week([2024, 1, 1])).toEqual([2024, 1, 1])
		expect(week([2024, 1, 8])).toEqual([2024, 1, 8])
		expect(week([2024, 1, 10])).toEqual([2024, 1, 8])
		expect(week([2024, 1, 7], 6)).toEqual([2024, 1, 7])
		expect(week([2024, 1, 8], 6)).toEqual([2024, 1, 7])

		const monthWeeks = weeks([2024, 1, 20])
		expect(monthWeeks).toEqual([
			[2024, 1, 1],
			[2024, 1, 8],
			[2024, 1, 15],
			[2024, 1, 22],
			[2024, 1, 29],
		])
		expect(monthWeeks.at(-1)).toEqual(week([2024, 1, 31]))

		const septemberWeeks = weeks([2024, 9, 20])
		expect(septemberWeeks[0]).toEqual(week([2024, 9, 1]))
		expect(septemberWeeks.at(-1)).toEqual(week([2024, 9, 30]))
		expect(weeks([2024, 1, 20], 6)).toEqual([
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
		expect(diffcal(datenum(2023, 1, 1), datenum(2023, 1, 10))).toEqual([0, 0, 9, 0, 0, 0])
		expect(diffcal(datenum(2023, 1, 1), datenum(2023, 2, 1))).toEqual([0, 1, 0, 0, 0, 0])
		expect(diffcal(datenum(2024, 2, 28), datenum(2024, 3, 1))).toEqual([0, 0, 2, 0, 0, 0])
		expect(diffcal(datenum(2023, 2, 28), datenum(2023, 3, 1))).toEqual([0, 0, 1, 0, 0, 0])
		expect(diffcal(datenum(2023, 2, 1), datenum(2023, 1, 1))).toEqual([0, -1, 0, 0, 0, 0])
		expect(diffcal(datenum(2023, 1, 1, 10, 0, 0), datenum(2023, 1, 1, 12, 30, 15))).toEqual([
			0,
			0,
			0,
			2,
			30,
			15,
		])
		expect(diffcal(datenum(2023, 1, 20), datenum(2023, 2, 1))).toEqual([0, 0, 12, 0, 0, 0])
	})

	test("calculates approximate linear distances", () => {
		const totalMs =
			by.year.step + by.month.step + by.day.step + by.hour.step + by.minute.step + by.second.step
		expect(dist(totalMs)).toEqual([1, 1, 1, 1, 1, 1])

		const d1 = datenum(2024, 1, 1)
		const d2 = datenum(2025, 2, 2, 1, 1, 1)
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
					const dn = datenum(y, m, d)
					const [ry, rm, rd] = numdate(dn)
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
