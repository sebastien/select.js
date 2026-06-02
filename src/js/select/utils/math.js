// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-06-02

// Module: select/utils/math
// Numeric helper functions for interpolation, ranges, distances, and summary
// statistics. Collection-aware helpers use Select.js list/reduce semantics.

import { len, list, reduce } from "./collections.js"
import { ileaves } from "./iter.js"

// ----------------------------------------------------------------------------
//
// INTERNALS
//
// ----------------------------------------------------------------------------

// Function: _extreme
// Returns the extreme scalar found in `args` using reducer `func`.
function _extreme(func, args) {
	let res
	for (let i = 0; i < args.length; i++) {
		res = _extremeValue(args[i], func, res)
	}
	return res
}

// Function: _extremeValue
// Walks nested collection values and accumulates an extreme into `current`.
function _extremeValue(value, func, current) {
	for (const node of ileaves(value)) {
		current = current === undefined ? node : func(current, node)
	}
	return current
}

// ----------------------------------------------------------------------------
//
// BASIC OPERATIONS
//
// ----------------------------------------------------------------------------

// Function: sign
// Returns `-1` for negative values and `1` otherwise.
function sign(value) {
	return value < 0 ? -1 : 1
}

// Function: order
// Returns the logarithmic order of magnitude of `value` in `base`.
function order(value, base = 10) {
	return Math.log(Math.abs(value)) / Math.log(base)
}

// Function: clamp
// Clamps `value` to the inclusive range `[min, max]`.
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value))
}

// Function: round
// Rounds `value` to `factor`; `bound` selects floor `(-1)`, nearest `(0)`, or ceil `(1)`.
function round(value, factor = 1, bound = 0) {
	const base = value / factor
	const rounded =
		bound < 0 ? Math.floor(base) : bound > 0 ? Math.ceil(base) : Math.round(base)
	return rounded * factor
}

// Function: wrap
// Wraps `value` within `[0, abs(base))`.
function wrap(value, base = 10) {
	const size = Math.abs(base)
	return size === 0 || value === 0 ? 0 : value > 0 ? value % size : (size + (value % size)) % size
}

// Function: add
// Adds `a` and `b`, or sums a single list-like `a`.
function add(a, b) {
	return Array.isArray(a) ? reduce(a, (r, v) => r + v, 0) : a + b
}

// Function: sub
// Subtracts `b` from `a`, or subtracts the first two values of pair `a`.
function sub(a, b) {
	return Array.isArray(a) ? a[0] - a[1] : a - b
}

// Function: mul
// Multiplies `a` and `b`, or multiplies every value in list-like `a`.
function mul(a, b) {
	return Array.isArray(a) ? reduce(a, (r, v) => r * v, 1) : a * b
}

// Function: sq
// Returns the square of `value`.
function sq(value) {
	return value * value
}

// Function: sqrt
// Returns the square root of `value`.
function sqrt(value) {
	return Math.sqrt(value)
}

// ----------------------------------------------------------------------------
//
// INTERPOLATION
//
// ----------------------------------------------------------------------------

// Function: lerp
// Linearly interpolates between `a` and `b` using factor `t`.
function lerp(a, b, t = 0.5) {
	return a + (b - a) * t
}

// Function: prel
// Converts `t` from the interval `[a, b]` into a normalized ratio.
function prel(a, b, t) {
	return (t - a) / (b - a)
}

// Function: sinestep
// Applies cosine easing to normalized `value`.
function sinestep(value) {
	return (Math.cos(Math.PI + Math.PI * value) + 1) / 2
}

// Function: smoothstep
// Applies cubic smoothstep easing to normalized `value`.
function smoothstep(value) {
	return value * value * (3 - 2 * value)
}

// Function: smootherstep
// Applies quintic smootherstep easing to normalized `value`.
function smootherstep(value) {
	return value * value * value * (value * (value * 6 - 15) + 10)
}

// ----------------------------------------------------------------------------
//
// RANGES AND DISTANCES
//
// ----------------------------------------------------------------------------

// Function: range
// Returns values from `start` to `end` using `step`; when `closed`, includes `end`.
function range(start, end, step = 1, closed = false) {
	if (end === undefined) {
		end = start
		start = 0
	}
	if (step === 0) {
		return closed && start === end ? [start] : []
	}
	const count = Math.ceil(Math.max(0, (end - start) / step)) + (closed ? 1 : 0)
	const res = new Array(count)
	let value = start
	for (let i = 0; i < count; i++) {
		res[i] = value
		value += step
	}
	return res
}

// Function: subdivide
// Splits `[start, end]` into `steps` evenly spaced values.
function subdivide(start = 0, end = 1, steps = 100, closed = true) {
	if (steps <= 0) {
		return []
	}
	if (start === end) {
		return closed ? [start] : []
	}
	if (steps === 1) {
		return [start]
	}
	return range(start, end, (end - start) / (steps - (closed ? 1 : 0)), closed)
}

// Function: dist
// Returns the absolute distance between `a` and `b`.
function dist(a, b) {
	return Math.abs(b - a)
}

// Function: reldist
// Returns the signed relative distance from `a` to `b`.
function reldist(a, b) {
	return (b - a) / b
}

// Function: circdist
// Returns the shortest circular distance between normalized values `a` and `b`.
function circdist(a, b) {
	const delta = Math.abs(b - a) % 1
	return delta > 0.5 ? 1 - delta : delta
}

// Function: within
// Returns true when `value` is within inclusive range `[min, max]`.
function within(value, min, max) {
	return min <= value && value <= max
}

// Function: closestInOrder
// Returns the nearest value to `value` in ascending `values`; `affinity` biases ties.
function closestInOrder(values, value, affinity = 0) {
	let i = 0
	const n = values.length
	let last = 0
	while (i < n) {
		const current = values[i]
		if (value === current) {
			return value
		}
		if (value < current) {
			if (i === 0) {
				return current
			}
			if (affinity === 0) {
				return value - last < current - value ? last : current
			}
			return affinity < 0 ? last : current
		}
		last = current
		i += 1
	}
	return last
}

// Function: closest
// Returns the closest entry to `value` in `values` using `distance`.
function closest(values, value, distance = dist) {
	return reduce(
		values,
		(result, entry, index) => {
			const delta = distance(entry, value)
			if (index === 0 || result.dist > delta) {
				result.dist = delta
				result.value = entry
			}
			return result
		},
		{ dist: undefined, value: undefined },
	).value
}

// Function: delta
// Returns pairwise deltas for `series` using `distance`.
function delta(series, distance = sub) {
	const res = []
	for (let i = 1; i < series.length; i++) {
		res.push(distance(series[i], series[i - 1]))
	}
	return res
}

// Function: sqdist
// Returns the squared distance between `a` and `b`.
function sqdist(a, b) {
	return sq(sub(a, b))
}

// ----------------------------------------------------------------------------
//
// AGGREGATES
//
// ----------------------------------------------------------------------------

// Function: min
// Returns the minimum scalar across `args`, descending into list-like values.
function min(...args) {
	return _extreme(Math.min, args)
}

// Function: max
// Returns the maximum scalar across `args`, descending into list-like values.
function max(...args) {
	return _extreme(Math.max, args)
}

// Function: minmax
// Returns `[min, max]` for `series`.
function minmax(series) {
	return reduce(
		list(series),
		(result, value, index) => {
			if (index === 0) {
				result[0] = value
				result[1] = value
			} else {
				result[0] = min(result[0], value)
				result[1] = max(result[1], value)
			}
			return result
		},
		[undefined, undefined],
	)
}

// Function: maxmin
// Returns `[max, min]` for `series`.
function maxmin(series) {
	const [lo, hi] = minmax(series)
	return [hi, lo]
}

// Function: extent
// Returns the absolute span between minimum and maximum values in `series`.
function extent(series) {
	return Math.abs(sub(minmax(series)))
}

// Function: midpoint
// Returns the midpoint between the minimum and maximum values in `series`.
function midpoint(series) {
	return lerp(...minmax(series), 0.5)
}

// Function: sum
// Returns the sum of `collection`.
function sum(collection) {
	return reduce(collection, add, 0)
}

// Function: mean
// Returns the arithmetic mean of `series`.
function mean(series) {
	const count = len(series)
	return count ? sum(series) / count : undefined
}

// Function: rmsd
// Returns the root mean square deviation of `series` from `target`.
function rmsd(series, target = 1) {
	const count = len(series)
	return count ? Math.sqrt(reduce(series, (r, v) => r + sqdist(v, target), 0) / count) : undefined
}

// Function: describe
// Returns summary statistics for numeric `series`.
function describe(series) {
	const res = reduce(
		series,
		(result, value) => {
			result.min = result.min === undefined ? value : Math.min(result.min, value)
			result.max = result.max === undefined ? value : Math.max(result.max, value)
			result.total += value
			result.count += 1
			return result
		},
		{
			min: undefined,
			max: undefined,
			total: 0,
			count: 0,
			mean: undefined,
			variance: undefined,
			deviation: undefined,
			values: series,
		},
	)
	if (!res.count) {
		return res
	}
	res.mean = res.total / res.count
	res.variance =
		reduce(
			series,
			(result, value) => {
				const offset = value - res.mean
				return result + offset * offset
			},
			0,
		) / res.count
	res.deviation = Math.sqrt(res.variance)
	return res
}

// ----------------------------------------------------------------------------
//
// DISCRETE MATH
//
// ----------------------------------------------------------------------------

// Function: factorial
// Returns the factorial of non-negative integer `n`.
function factorial(n) {
	if (n <= 1) {
		return 1
	}
	let res = 1
	for (let i = 2; i <= n; i++) {
		res *= i
	}
	return res
}

// Function: cnk
// Returns the binomial coefficient for `n` choose `k`.
function cnk(n, k) {
	return factorial(n) / (factorial(k) * factorial(n - k))
}

// Function: nicer
// Snaps `value` to a nearby pleasant round number from normalized `values`.
function nicer(value, affinity = 0, values = [1, 5, 10, 20, 25, 50, 100]) {
	const magnitude = Math.abs(value)
	const direction = sign(value)
	const scale = 10 ** (Math.floor(order(magnitude)) - 1)
	return direction * closestInOrder(values, magnitude / scale, affinity * direction) * scale
}

export {
	add,
	circdist,
	clamp,
	closest,
	closestInOrder,
	cnk,
	delta,
	describe,
	dist,
	extent,
	factorial,
	lerp,
	max,
	maxmin,
	mean,
	midpoint,
	min,
	minmax,
	mul,
	nicer,
	order,
	prel,
	range,
	reldist,
	rmsd,
	round,
	sign,
	sinestep,
	smoothstep,
	smootherstep,
	sq,
	sqdist,
	sqrt,
	sub,
	subdivide,
	sum,
	within,
	wrap,
}

// EOF
