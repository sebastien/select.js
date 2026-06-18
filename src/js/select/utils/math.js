// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/utils/math
// Numeric helper functions for interpolation, ranges, distances, and summary
// statistics. Collection-aware helpers use Select.js list/reduce semantics.

import { ileaves } from "./iter.js";
import { reduce } from "./transform.js";
import { len, list } from "./values.js";

const PI = Math.PI;
const TAU = PI * 2;

// ----------------------------------------------------------------------------
//
// INTERNALS
//
// ----------------------------------------------------------------------------

// Function: extreme
// Returns the extreme scalar found in `args` using reducer `func`.
function extreme(func, args) {
	let res;
	for (let i = 0; i < args.length; i++) {
		for (const node of ileaves(args[i])) {
			res = res === undefined ? node : func(res, node);
		}
	}
	return res;
}

// Function: isNumericList
// Returns true when `value` should be treated as an indexable numeric list.
function isNumericList(value) {
	return (
		Array.isArray(value) ||
		(ArrayBuffer.isView(value) && !(value instanceof DataView))
	);
}

// Function: unary
// Applies unary numeric operator `func` to scalar or list-like `value`.
function unary(value, func) {
	if (!isNumericList(value)) {
		return func(value);
	}
	const res = new value.constructor(value.length);
	for (let i = 0; i < value.length; i++) {
		res[i] = func(value[i], i);
	}
	return res;
}

// Function: binary
// Applies binary numeric operator `func` to scalars or pairwise list-like values.
function binary(a, b, func, initial = undefined) {
	if (!isNumericList(a)) {
		return func(a, b);
	}
	if (b === undefined) {
		if (a.length === 0) {
			return initial;
		}
		let res = initial === undefined ? a[0] : initial;
		for (let i = initial === undefined ? 1 : 0; i < a.length; i++) {
			res = func(res, a[i]);
		}
		return res;
	}
	const res = new a.constructor(a.length);
	if (isNumericList(b)) {
		const n = Math.min(a.length, b.length);
		let i = 0;
		for (; i < n; i++) {
			res[i] = func(a[i], b[i]);
		}
		for (; i < a.length; i++) {
			res[i] = a[i];
		}
	} else {
		for (let i = 0; i < a.length; i++) {
			res[i] = func(a[i], b);
		}
	}
	return res;
}

// ----------------------------------------------------------------------------
//
// BASIC OPERATIONS
//
// ----------------------------------------------------------------------------

// Function: cos
// Returns the cosine of `value` in radians.
function cos(value) {
	return Math.cos(value);
}

// Function: sin
// Returns the sine of `value` in radians.
function sin(value) {
	return Math.sin(value);
}

// Function: deg
// Converts `value` from radians to degrees.
function deg(value) {
	return ((value / TAU) * 360) % 360;
}

// Function: rad
// Converts `value` from degrees to radians.
function rad(value) {
	return ((value / 360) * TAU) % TAU;
}

// Function: sind
// Returns the sine of `value` in degrees.
function sind(value) {
	return Math.sin(rad(value));
}

// Function: cosd
// Returns the cosine of `value` in degrees.
function cosd(value) {
	return Math.cos(rad(value));
}

// Function: pis
// Converts `value` in radians to a factor of pi.
function pis(value) {
	return value / PI;
}

// Function: radial
// Returns `[x, y]` coordinates for `angle` and `radius`.
function radial(angle, radius = 1) {
	return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

// Function: radiald
// Returns `[x, y]` coordinates for degree `angle` and `radius`.
function radiald(angle, radius = 1) {
	return radial(rad(angle), radius);
}

// Function: sign
// Returns `-1` for negative values and `1` otherwise.
function sign(value) {
	return value < 0 ? -1 : 1;
}

// Function: order
// Returns the logarithmic order of magnitude of `value` in `base`.
function order(value, base = 10) {
	return Math.log(Math.abs(value)) / Math.log(base);
}

// Function: clamp
// Clamps `value` to the inclusive range `[min, max]`.
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

// Function: abs
// Returns the absolute value of `value`, preserving list shape when possible.
function abs(value) {
	return unary(value, Math.abs);
}

// Function: floor
// Returns the floor of `value`, preserving list shape when possible.
function floor(value, factor = undefined) {
	return factor === undefined
		? unary(value, Math.floor)
		: round(value, factor, -1);
}

// Function: ceil
// Returns the ceil of `value`, preserving list shape when possible.
function ceil(value, factor = undefined) {
	return factor === undefined
		? unary(value, Math.ceil)
		: round(value, factor, 1);
}

// Function: frac
// Returns the fractional part of `value`.
function frac(value) {
	return unary(value, (entry) => {
		const scalar = Math.abs(entry);
		return scalar - Math.floor(scalar);
	});
}

// Function: round
// Rounds `value` to `factor`; `bound` selects floor `(-1)`, nearest `(0)`, or ceil `(1)`.
function round(value, factor = 1, bound = 0) {
	if (isNumericList(value)) {
		const res = new value.constructor(value.length);
		for (let i = 0; i < value.length; i++) {
			res[i] = round(value[i], factor, bound);
		}
		return res;
	}
	const base = value / factor;
	const rounded =
		bound < 0
			? Math.floor(base)
			: bound > 0
				? Math.ceil(base)
				: Math.round(base);
	return rounded * factor;
}

// Function: wrap
// Wraps `value` within `[0, abs(base))`.
function wrap(value, base = 10) {
	const size = Math.abs(base);
	return size === 0 || value === 0
		? 0
		: value > 0
			? value % size
			: (size + (value % size)) % size;
}

// Function: add
// Adds `a` and `b`, or sums a single list-like `a`.
function add(a, b) {
	return binary(a, b, (left, right) => left + right, 0);
}

// Function: sub
// Subtracts `b` from `a`, or subtracts the first two values of pair `a`.
function sub(a, b) {
	if (isNumericList(a) && b === undefined) {
		return (a[0] || 0) - (a[1] || 0);
	}
	return binary(a, b, (left, right) => left - right);
}

// Function: mul
// Multiplies `a` and `b`, or multiplies every value in list-like `a`.
function mul(a, b) {
	return binary(a, b, (left, right) => left * right, 1);
}

// Function: div
// Divides `a` by `b`, preserving list shape when `a` is list-like.
function div(a, b) {
	if (isNumericList(a) && b === undefined) {
		return a.length > 1 ? a[0] / (a[1] || 1) : a[0];
	}
	return binary(a, b, (left, right) => left / (right || 1));
}

// Function: sq
// Returns the square of `value`.
function sq(value) {
	return value * value;
}

// Function: sqrt
// Returns the square root of `value`.
function sqrt(value) {
	return Math.sqrt(value);
}

// ----------------------------------------------------------------------------
//
// INTERPOLATION
//
// ----------------------------------------------------------------------------

// Function: lerp
// Linearly interpolates between `a` and `b` using factor `t`.
function lerp(a, b, t = 0.5) {
	if (isNumericList(a) && isNumericList(b)) {
		const n = Math.max(a.length, b.length);
		const res = new a.constructor(n);
		for (let i = 0; i < n; i++) {
			const left = a[i] === undefined ? b[i] : a[i];
			const right = b[i] === undefined ? a[i] : b[i];
			res[i] = lerp(left, right, t);
		}
		return res;
	}
	return a + (b - a) * t;
}

// Function: prel
// Converts `t` from the interval `[a, b]` into a normalized ratio.
function prel(a, b, t) {
	return (t - a) / (b - a);
}

// Function: sinestep
// Applies cosine easing to normalized `value`.
function sinestep(value) {
	return (Math.cos(Math.PI + Math.PI * value) + 1) / 2;
}

// Function: smoothstep
// Applies cubic smoothstep easing to normalized `value`.
function smoothstep(value) {
	return value * value * (3 - 2 * value);
}

// Function: smootherstep
// Applies quintic smootherstep easing to normalized `value`.
function smootherstep(value) {
	return value * value * value * (value * (value * 6 - 15) + 10);
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
		end = start;
		start = 0;
	}
	if (step < 0 && start < end) {
		step = (end - start) / Math.abs(step);
	} else if (step > 0 && start > end) {
		step = (end - start) / Math.abs(step);
	}
	if (step === 0) {
		return closed && start === end ? [start] : [];
	}
	const span = (end - start) / step;
	const count = Math.ceil(Math.max(0, span)) + (closed ? 1 : 0);
	const res = new Array(count);
	let value = start;
	for (let i = 0; i < count; i++) {
		res[i] = value;
		value += step;
	}
	return res;
}

// Function: subdivide
// Splits `[start, end]` into `steps` evenly spaced values.
function subdivide(start = 0, end = 1, steps = 100, closed = true) {
	if (steps <= 0) {
		return [];
	}
	if (start === end) {
		return closed ? [start] : [];
	}
	if (steps === 1) {
		return [start];
	}
	return range(start, end, (end - start) / (steps - (closed ? 1 : 0)), closed);
}

// Function: dist
// Returns the absolute distance between `a` and `b`.
function dist(a, b) {
	return Math.abs(b - a);
}

// Function: reldist
// Returns the signed relative distance from `a` to `b`.
function reldist(a, b) {
	return (b - a) / b;
}

// Function: circdist
// Returns the shortest circular distance between normalized values `a` and `b`.
function circdist(a, b) {
	const delta = Math.abs(b - a) % 1;
	return delta > 0.5 ? 1 - delta : delta;
}

// Function: within
// Returns true when `value` is within inclusive range `[min, max]`.
function within(value, min, max) {
	return between(value, min, max);
}

// Function: closestInOrder
// Returns the nearest value to `value` in ascending `values`; `affinity` biases ties.
function closestInOrder(values, value, affinity = 0) {
	let i = 0;
	const n = values.length;
	let last = 0;
	while (i < n) {
		const current = values[i];
		if (value === current) {
			return value;
		}
		if (value < current) {
			if (i === 0) {
				return current;
			}
			if (affinity === 0) {
				return value - last < current - value ? last : current;
			}
			return affinity < 0 ? last : current;
		}
		last = current;
		i += 1;
	}
	return last;
}

// Function: closest
// Returns the closest entry to `value` in `values`, or the closest multiple of `b` to scalar `a`.
function closest(a, b, c = dist) {
	if (!isNumericList(a) && typeof a?.[Symbol.iterator] !== "function") {
		const value = a;
		const multiple = b === undefined ? 10 : b;
		const bound = c === undefined ? 1 : c;
		if (bound > 0) {
			return Math.ceil(value / multiple) * multiple;
		}
		if (bound < 0) {
			return Math.floor(value / multiple) * multiple;
		}
		return Math.round(value / multiple) * multiple;
	}
	const values = list(a);
	const value = b;
	const distance = typeof c === "function" ? c : dist;
	return reduce(
		values,
		(result, entry, index) => {
			const delta = distance(entry, value);
			if (index === 0 || result.dist > delta) {
				result.dist = delta;
				result.value = entry;
			}
			return result;
		},
		{ dist: undefined, value: undefined },
	).value;
}

// Function: delta
// Returns pairwise deltas for `series` using `distance`.
function delta(series, distance = sub) {
	const res = [];
	for (let i = 1; i < series.length; i++) {
		res.push(distance(series[i], series[i - 1]));
	}
	return res;
}

// Function: sqdist
// Returns the squared distance between `a` and `b`.
function sqdist(a, b) {
	return sq(sub(a, b));
}

// ----------------------------------------------------------------------------
//
// AGGREGATES
//
// ----------------------------------------------------------------------------

// Function: min
// Returns the minimum scalar across `args`, descending into list-like values.
function min(...args) {
	return extreme(Math.min, args);
}

// Function: max
// Returns the maximum scalar across `args`, descending into list-like values.
function max(...args) {
	return extreme(Math.max, args);
}

// Function: minmax
// Returns `[min, max]` for `series`.
function minmax(series, other = undefined) {
	if (typeof other === "function") {
		const extractor = other;
		return reduce(
			list(series),
			(result, value, index) => {
				const entry = extractor(value, index);
				if (result === undefined) {
					return [entry, entry];
				}
				result[0] = min(result[0], entry);
				result[1] = max(result[1], entry);
				return result;
			},
			undefined,
		);
	}
	if (other !== undefined && !isNumericList(series)) {
		if (isNumericList(other)) {
			return [
				other[0] === undefined ? series : min(series, other[0]),
				other[1] === undefined ? series : max(series, other[1]),
			];
		}
		return [min(series, other), max(series, other)];
	}
	return reduce(
		list(series),
		(result, value, index) => {
			if (index === 0) {
				result[0] = value;
				result[1] = value;
			} else {
				result[0] = min(result[0], value);
				result[1] = max(result[1], value);
			}
			return result;
		},
		[undefined, undefined],
	);
}

// Function: maxmin
// Returns `[max, min]` for `series`.
function maxmin(series) {
	const [lo, hi] = minmax(series);
	return [hi, lo];
}

// Function: extent
// Returns the absolute span between minimum and maximum values in `series`.
function extent(series) {
	return Math.abs(sub(minmax(series)));
}

// Function: midpoint
// Returns the midpoint between the minimum and maximum values in `series`.
function midpoint(series) {
	return lerp(...minmax(series), 0.5);
}

// Function: sum
// Returns the sum of `collection`.
function sum(collection) {
	return reduce(collection, add, 0);
}

// Function: mean
// Returns the arithmetic mean of `series`.
function mean(series) {
	const count = len(series);
	return count ? sum(series) / count : undefined;
}

// Function: average
// Returns the arithmetic mean of `series`.
function average(series) {
	return mean(series);
}

// Function: rmsd
// Returns the root mean square deviation of `series` from `target`.
function rmsd(series, target = 1) {
	const count = len(series);
	return count
		? Math.sqrt(reduce(series, (r, v) => r + sqdist(v, target), 0) / count)
		: undefined;
}

// Function: describe
// Returns summary statistics for numeric `series`.
function describe(series) {
	const res = reduce(
		series,
		(result, value) => {
			result.min =
				result.min === undefined ? value : Math.min(result.min, value);
			result.max =
				result.max === undefined ? value : Math.max(result.max, value);
			result.total += value;
			result.count += 1;
			return result;
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
	);
	if (!res.count) {
		return res;
	}
	res.mean = res.total / res.count;
	res.variance =
		reduce(
			series,
			(result, value) => {
				const offset = value - res.mean;
				return result + offset * offset;
			},
			0,
		) / res.count;
	res.deviation = Math.sqrt(res.variance);
	return res;
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
		return 1;
	}
	let res = 1;
	for (let i = 2; i <= n; i++) {
		res *= i;
	}
	return res;
}

// Function: cnk
// Returns the binomial coefficient for `n` choose `k`.
function cnk(n, k) {
	return factorial(n) / (factorial(k) * factorial(n - k));
}

// Function: random
// Returns a random value in `[0, 1)`, `[0, lower)`, or `[lower, upper)`.
function random(lower = undefined, upper = undefined) {
	if (lower === undefined) {
		return Math.random();
	}
	if (upper === undefined) {
		return Math.random() * lower;
	}
	return lerp(lower, upper, Math.random());
}

// Function: mod
// Returns mathematical modulo instead of JavaScript remainder.
function mod(value, modulus) {
	const remainder = value % modulus;
	return remainder >= 0 ? remainder : remainder + Math.abs(modulus);
}

// Function: log10
// Returns the base-10 logarithm of `value`.
function log10(value) {
	return Math.log(value) / Math.LN10;
}

// Function: logn
// Returns the logarithm of `value` in `base`.
function logn(value, base) {
	return Math.log(value) / Math.log(base);
}

// Function: between
// Returns true when `value` is between `a` and `b` using inclusive bounds by default.
function between(value, a, b, includeA = true, includeB = true) {
	if (isNumericList(a)) {
		return between(value, a[0], a[a.length - 1], includeA, includeB);
	}
	if (a === undefined) {
		return includeB ? value <= b : value < b;
	}
	if (b === undefined) {
		return includeA ? value >= a : value > a;
	}
	if (includeA && includeB) {
		return value >= a && value <= b;
	}
	if (includeA && !includeB) {
		return value >= a && value < b;
	}
	if (!includeA && includeB) {
		return value > a && value <= b;
	}
	return value > a && value < b;
}

// Function: contained
// Returns true when range `[a0, a1]` is fully contained within `[b0, b1]`.
function contained(a0, a1, b0 = undefined, b1 = undefined) {
	if (isNumericList(a0) && isNumericList(a1)) {
		b0 = a1[0];
		b1 = a1[1];
		a1 = a0[1];
		a0 = a0[0];
	}
	return between(a0, b0, b1) && between(a1, b0, b1);
}

// Function: overlaps
// Returns true when ranges `[a0, a1]` and `[b0, b1]` overlap.
function overlaps(a0, a1, b0 = undefined, b1 = undefined) {
	if (isNumericList(a0) && isNumericList(a1)) {
		b0 = a1[0];
		b1 = a1[1];
		a1 = a0[1];
		a0 = a0[0];
	}
	const amin = Math.min(a0, a1);
	const amax = Math.max(a0, a1);
	const bmin = Math.min(b0, b1);
	const bmax = Math.max(b0, b1);
	return !(amax < bmin || bmax < amin);
}

// Function: scale
// Maps `value` from `fromRange` into `toRange`.
function scale(value, fromRange, toRange = undefined) {
	if (toRange === undefined) {
		toRange = fromRange;
		fromRange = [0, 1];
	}
	if (!isNumericList(fromRange)) {
		fromRange = [0, fromRange];
	}
	if (!isNumericList(toRange)) {
		toRange = [0, toRange];
	}
	const offset =
		(value - fromRange[0]) /
		(fromRange[fromRange.length - 1] - fromRange[0] || 1);
	return toRange[0] + offset * (toRange[toRange.length - 1] - toRange[0]);
}

// Function: multiscale
// Maps `value` across piecewise linear ranges.
function multiscale(value, fromRanges, toRanges) {
	const n = len(fromRanges);
	if (len(toRanges) !== n || n === 0) {
		return undefined;
	}
	for (let i = 0; i < n; i++) {
		const start = fromRanges[i];
		const j = i + 1;
		if (i === 0 && value < start) {
			return toRanges[0];
		}
		if (j < n) {
			const end = fromRanges[j];
			if (value >= start && value < end) {
				return lerp(toRanges[i], toRanges[j], prel(start, end, value));
			}
		} else {
			return toRanges[i];
		}
	}
}

// Function: roundsum
// Scales and rounds `series` so its total matches `total`.
function roundsum(series, total = 100, factor = 1) {
	const sourceTotal = sum(series);
	const last = len(series) - 1;
	let running = 0;
	const values = list(series);
	const res = new Array(values.length);
	for (let index = 0; index < values.length; index++) {
		const value = values[index];
		if (index === last) {
			res[index] = total - running;
			continue;
		}
		const rounded = round(scale(value, sourceTotal, total), factor);
		running += rounded;
		res[index] = rounded;
	}
	return res;
}

// Function: nice
// Returns a human-friendly rounded value near `value`.
function nice(value, steps = 10, bound = 1) {
	if (isNumericList(value)) {
		const res = new value.constructor(value.length);
		for (let i = 0; i < value.length; i++) {
			res[i] = nice(value[i], steps, i === 0 ? -1 : bound);
		}
		return res;
	}
	if (value < 0) {
		return -nice(Math.abs(value), steps, bound);
	}
	if (value === 0) {
		return 0;
	}
	let scaleValue = 0;
	while (10 ** scaleValue < value) {
		scaleValue += 1;
	}
	const divider = 10 ** scaleValue / steps;
	return closest(value, divider, bound);
}

// Function: step
// Returns a convenient step size for `[start, end]`.
function step(start, end, count = 10, base = 10) {
	const span = Math.abs(end - start);
	if (!span || !count) {
		return 0;
	}
	const startScale = start ? Math.log(Math.abs(start)) / Math.log(base) : 0;
	const endScale = end ? Math.log(Math.abs(end)) / Math.log(base) : 0;
	const scaleOrder = Math.ceil(Math.abs(endScale - startScale));
	const stepOrder = scaleOrder - 1;
	return (
		sign(end - start) * round(base ** scaleOrder / count, base ** stepOrder)
	);
}

// Function: steps
// Returns a scale of convenient values from `start` to `end`.
function steps(start, end, count = 10, base = 10) {
	const delta = step(start, end, count, base);
	if (!delta) {
		return start === end ? [start] : [];
	}
	const res = [];
	if (start < end) {
		for (let value = start; value <= end; value += delta) {
			res.push(value);
		}
	} else {
		for (let value = start; value >= end; value += delta) {
			res.push(value);
		}
	}
	return res;
}

// Function: nicer
// Snaps `value` to a nearby pleasant round number from normalized `values`.
function nicer(value, affinity = 0, values = [1, 5, 10, 20, 25, 50, 100]) {
	if (value === 0) {
		return 0;
	}
	const magnitude = Math.abs(value);
	const direction = sign(value);
	const scale = 10 ** (Math.floor(order(magnitude)) - 1);
	return (
		direction *
		closestInOrder(values, magnitude / scale, affinity * direction) *
		scale
	);
}

export {
	abs,
	add,
	average,
	between,
	ceil,
	circdist,
	clamp,
	closest,
	closestInOrder,
	cnk,
	contained,
	cos,
	cosd,
	deg,
	delta,
	describe,
	dist,
	div,
	extent,
	extreme,
	factorial,
	floor,
	frac,
	lerp,
	log10,
	logn,
	max,
	maxmin,
	mean,
	midpoint,
	min,
	minmax,
	mod,
	mul,
	multiscale,
	nice,
	nicer,
	order,
	overlaps,
	PI,
	pis,
	prel,
	rad,
	radial,
	radiald,
	random,
	range,
	reldist,
	rmsd,
	round,
	roundsum,
	scale,
	sign,
	sin,
	sind,
	sinestep,
	smootherstep,
	smoothstep,
	sq,
	sqdist,
	sqrt,
	step,
	steps,
	sub,
	subdivide,
	sum,
	TAU,
	within,
	wrap,
};

// EOF
