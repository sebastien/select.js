import { describe, expect, test } from "bun:test"

import { anchored, fit, flip, opposite, overflows, place, point, viewport } from "../src/js/select/features/interaction/positioning.js"

describe("interaction positioning", () => {
	test("places source and target corners together", () => {
		expect(
			place(
				{ x: 0, y: 0, width: 80, height: 40 },
				"sw",
				{ x: 100, y: 200, width: 60, height: 50 },
				"ne",
			),
		).toEqual({ x: 160, y: 160, width: 80, height: 40 })
	})

	test("accepts relative anchor coordinates", () => {
		expect(point([0.25, 0.75])).toEqual([0.25, 0.75])
		expect(place({ width: 20, height: 10 }, [0, 0], { x: 10, y: 15, width: 5, height: 5 }, [1, 1])).toMatchObject({
			x: 15,
			y: 20,
		})
	})

	test("moves a panel into bounds without resizing", () => {
		expect(
			fit(
				{ x: -10, y: 80, width: 50, height: 40 },
				{ x: 0, y: 0, width: 100, height: 100 },
				{ overflow: "move" },
			),
		).toEqual({ x: 0, y: 60, width: 50, height: 40 })
	})

	test("resizes around the requested anchor", () => {
		expect(
			fit(
				{ x: 20, y: 20, width: 150, height: 120 },
				{ x: 0, y: 0, width: 100, height: 100 },
				{ overflow: "resize", anchor: "sw" },
			),
		).toEqual({ x: 20, y: 40, width: 100, height: 100 })
	})

	test("supports padding and no overflow correction", () => {
		const box = { x: -10, y: -10, width: 150, height: 120 }
		expect(fit(box, { x: 0, y: 0, width: 100, height: 100 }, { overflow: "none" })).toEqual(box)
		expect(fit(box, { x: 0, y: 0, width: 100, height: 100 }, { padding: 10 })).toEqual({
			x: 10,
			y: 10,
			width: 80,
			height: 80,
		})
	})

	test("flips a position on one axis", () => {
		expect(flip("n", "y")).toEqual([0.5, 1])
		expect(flip("nw", "y")).toEqual([0, 1])
		expect(flip("w", "x")).toEqual([1, 0.5])
		expect(opposite("s")).toEqual([0.5, 0])
		expect(opposite("sw")).toEqual([1, 0])
	})

	test("measures signed overflow against padded bounds", () => {
		expect(overflows({ x: -10, y: 0, width: 50, height: 20 }, { x: 0, y: 0, width: 100, height: 100 })).toEqual({
			left: 10,
			top: 0,
			right: -60,
			bottom: -80,
		})
	})

	test("keeps a fitting preferred placement", () => {
		expect(
			anchored(
				{ width: 40, height: 20 },
				"n",
				{ x: 20, y: 10, width: 30, height: 10 },
				"s",
				{ x: 0, y: 0, width: 100, height: 100 },
			),
		).toEqual({ x: 15, y: 20, width: 40, height: 20 })
	})

	test("flips a panel when the preferred side overflows", () => {
		expect(
			anchored(
				{ width: 40, height: 50 },
				"n",
				{ x: 10, y: 80, width: 20, height: 10 },
				"s",
				{ x: 0, y: 0, width: 100, height: 100 },
			),
		).toEqual({ x: 0, y: 30, width: 40, height: 50 })
	})

	test("fits when both sides overflow", () => {
		expect(
			anchored(
				{ width: 200, height: 200 },
				"n",
				{ x: 10, y: 10, width: 20, height: 10 },
				"s",
				{ x: 0, y: 0, width: 100, height: 100 },
			),
		).toEqual({ x: 0, y: 0, width: 100, height: 100 })
	})

	test("skips flipping when disabled", () => {
		expect(
			anchored(
				{ width: 40, height: 50 },
				"n",
				{ x: 10, y: 80, width: 20, height: 10 },
				"s",
				{ x: 0, y: 0, width: 100, height: 100 },
				{ flip: false, overflow: "move" },
			),
		).toEqual({ x: 0, y: 50, width: 40, height: 50 })
	})

	test("reads visual viewport offsets", () => {
		expect(viewport({ visualViewport: { offsetLeft: 5, offsetTop: 7, width: 80, height: 60 } })).toEqual({
			x: 5,
			y: 7,
			width: 80,
			height: 60,
		})
	})
})
