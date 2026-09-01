// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-13
// Updated: 2026-08-15

// Module: select/features/interaction/positioning
// Provides pure helpers for anchoring and fitting rectangular panels.

const POSITIONS = {
	nw: [0, 0],
	n: [0.5, 0],
	ne: [1, 0],
	w: [0, 0.5],
	c: [0.5, 0.5],
	e: [1, 0.5],
	sw: [0, 1],
	s: [0.5, 1],
	se: [1, 1],
}

// Function: point
// Resolves a cardinal position or relative `[x, y]` point.
function point(position) {
	if (typeof position === "string") {
		const result = POSITIONS[position.toLowerCase()]
		if (!result) throw new Error(`Unknown panel position "${position}"`)
		return result
	}
	if (
		!Array.isArray(position) ||
		position.length !== 2 ||
		position.some(value => typeof value !== "number" || !Number.isFinite(value))
	)
		throw new Error("Panel positions require a cardinal string or [x, y] coordinates")
	return position
}

// Function: place
// Places `source` so its `sourcePosition` coincides with `targetPosition`.
function place(source, sourcePosition, target, targetPosition) {
	const [sx, sy] = point(sourcePosition)
	const [tx, ty] = point(targetPosition)
	return {
		x: target.x + target.width * tx - source.width * sx,
		y: target.y + target.height * ty - source.height * sy,
		width: source.width,
		height: source.height,
	}
}

// Function: fit
// Applies an overflow policy to `box` within `bounds` and returns a new box.
// `overflow` is one of `none`, `move`, `resize`, or `move-resize`.
function fit(box, bounds = viewport(), options = {}) {
	const overflow = options.overflow ?? "move-resize"
	const anchor = point(options.anchor ?? "nw")
	const padding = options.padding ?? 0
	if (!Number.isFinite(padding) || padding < 0)
		throw new Error("Panel fitting padding must be a non-negative number")
	if (!["none", "move", "resize", "move-resize"].includes(overflow))
		throw new Error(`Unknown panel overflow policy "${overflow}"`)
	if (overflow === "none") return rectangle(box)

	const container = {
		x: bounds.x + padding,
		y: bounds.y + padding,
		width: Math.max(0, bounds.width - padding * 2),
		height: Math.max(0, bounds.height - padding * 2),
	}
	const result = rectangle(box)
	if (overflow === "resize" || overflow === "move-resize") {
		result.width = Math.min(result.width, container.width)
		result.height = Math.min(result.height, container.height)
		result.x = box.x + (box.width - result.width) * anchor[0]
		result.y = box.y + (box.height - result.height) * anchor[1]
	}
	if (overflow === "move" || overflow === "move-resize") {
		result.x = clamp(result.x, container.x, container.x + container.width - result.width)
		result.y = clamp(result.y, container.y, container.y + container.height - result.height)
	}
	return result
}

// Function: opposite
// Returns the point opposite `position` on both axes.
function opposite(position) {
	const [x, y] = point(position)
	return [invert(x), invert(y)]
}

// Function: flip
// Inverts `position` on `axis`, which must be `"x"` or `"y"`.
function flip(position, axis) {
	const [x, y] = point(position)
	if (axis === "x") return [invert(x), y]
	if (axis === "y") return [x, invert(y)]
	throw new Error(`Unknown flip axis "${axis}"`)
}

// Function: overflows
// Returns signed overflow of `box` past `bounds`, after `padding`.
function overflows(box, bounds, padding = 0) {
	const left = bounds.x + padding
	const top = bounds.y + padding
	const right = bounds.x + bounds.width - padding
	const bottom = bounds.y + bounds.height - padding
	return {
		left: left - box.x,
		top: top - box.y,
		right: box.x + box.width - right,
		bottom: box.y + box.height - bottom,
	}
}

// Function: anchored
// Places `source` on `target`, flipping overflowing axes when that reduces
// overflow, then applies `fit`.
function anchored(source, sourcePosition, target, targetPosition, bounds = viewport(), options = {}) {
	const padding = options.padding ?? 0
	let box = placeOffset(source, sourcePosition, target, targetPosition, options.offset)
	if (options.flip !== false) {
		const sides = overflows(box, bounds, padding)
		let from = sourcePosition
		let to = targetPosition
		if (sides.left > 0 || sides.right > 0) {
			from = flip(from, "x")
			to = flip(to, "x")
		}
		if (sides.top > 0 || sides.bottom > 0) {
			from = flip(from, "y")
			to = flip(to, "y")
		}
		if (from !== sourcePosition || to !== targetPosition) {
			const flipped = placeOffset(source, from, target, to, options.offset)
			if (amount(overflows(flipped, bounds, padding)) < amount(sides)) box = flipped
		}
	}
	return fit(box, bounds, options)
}

// Function: placeOffset
// Places a source and adds an anchor-relative distance that reverses on flip.
function placeOffset(source, sourcePosition, target, targetPosition, offset) {
	const box = place(source, sourcePosition, target, targetPosition)
	const [x, y] = offsetPoint(offset)
	const [sx, sy] = point(sourcePosition)
	const [tx, ty] = point(targetPosition)
	return {
		...box,
		x: box.x + Math.sign(tx - sx) * x,
		y: box.y + Math.sign(ty - sy) * y,
	}
}

function offsetPoint(offset) {
	if (offset == null) return [0, 0]
	if (typeof offset === "number" && Number.isFinite(offset) && offset >= 0)
		return [offset, offset]
	if (
		Array.isArray(offset) &&
		offset.length === 2 &&
		offset.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)
	)
		return offset
	throw new Error("Panel offset requires a non-negative number or [x, y] distances")
}

// Function: viewport
// Returns the visible viewport rectangle for `window`, including visual offsets.
function viewport(windowObject = globalThis) {
	const visual = windowObject.visualViewport
	if (visual)
		return { x: visual.offsetLeft, y: visual.offsetTop, width: visual.width, height: visual.height }
	if (Number.isFinite(windowObject.innerWidth) && Number.isFinite(windowObject.innerHeight))
		return { x: 0, y: 0, width: windowObject.innerWidth, height: windowObject.innerHeight }
	throw new Error("Cannot determine the viewport dimensions")
}

function invert(value) {
	return value === 0.5 ? 0.5 : 1 - value
}

function amount(sides) {
	return Math.max(0, sides.left) + Math.max(0, sides.top) + Math.max(0, sides.right) + Math.max(0, sides.bottom)
}

function rectangle(box) {
	return { x: box.x, y: box.y, width: box.width, height: box.height }
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), Math.max(min, max))
}

const positioning = { anchored, fit, flip, opposite, overflows, place, point, viewport }

export { POSITIONS, anchored, fit, flip, opposite, overflows, place, point, positioning, viewport }
export default positioning

// EOF
