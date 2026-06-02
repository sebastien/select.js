import { describe, expect, test } from "bun:test"
import {
	clamp,
	closest,
	closestInOrder,
	cnk,
	describe as describeSeries,
	factorial,
	mean,
	min,
	minmax,
	range,
	smoothstep,
	smootherstep,
	subdivide,
	sum,
	wrap,
} from "../src/js/select/utils/math.js"

describe("utils.math", () => {
	test("supports range building, wrapping, and interpolation helpers", () => {
		expect(range(5)).toEqual([0, 1, 2, 3, 4])
		expect(range(1, 5, 1, true)).toEqual([1, 2, 3, 4, 5])
		expect(subdivide(0, 1, 5, true)).toEqual([0, 0.25, 0.5, 0.75, 1])
		expect(wrap(-1, 10)).toBe(9)
		expect(clamp(12, 0, 10)).toBe(10)
		expect(smoothstep(0.5)).toBe(0.5)
		expect(smootherstep(0.5)).toBe(0.5)
	})

	test("supports ordered and generic closest lookups", () => {
		expect(closestInOrder([10, 20, 40], 29)).toBe(20)
		expect(closestInOrder([10, 20, 40], 30, 1)).toBe(40)
		expect(closest([5, 11, 19], 13)).toBe(11)
	})

	test("computes aggregates across nested and flat collections", () => {
		expect(min([8, [3, 10], 5])).toBe(3)
		expect(minmax([8, 3, 10, 5])).toEqual([3, 10])
		expect(sum([1, 2, 3, 4])).toBe(10)
		expect(mean([2, 4, 6, 8])).toBe(5)
	})

	test("computes combinatorics and summary statistics", () => {
		expect(factorial(5)).toBe(120)
		expect(cnk(5, 2)).toBe(10)
		expect(describeSeries([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({
			min: 2,
			max: 9,
			total: 40,
			count: 8,
			mean: 5,
			variance: 4,
			deviation: 2,
			values: [2, 4, 4, 4, 5, 5, 7, 9],
		})
	})
})
