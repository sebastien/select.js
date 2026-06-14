// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-16

// Module: select/interaction/drag
// Drag interaction helpers.

import { bind, unbind } from "./core.js"

// Function: dragtarget
// Walks up from `node` to find a `data-drag` target, optionally matching
// `name`.
function dragtarget(node, name) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		const element = node
		if (!name && element.hasAttribute("data-drag")) return element
		if (name && element.getAttribute("data-drag") === name) return element
		node = element.parentNode
	}
	return node?.nodeType === Node.ELEMENT_NODE ? node : undefined
}

// Function: drag
// Starts a drag interaction on `event.target` and invokes `move` and `end`
// callbacks with a shared drag context.
function drag(event, move, end) {
	const context = {}
	const dragging = {
		node: event.target,
		ox: event.pageX,
		oy: event.pageY,
		pointerEvents: event.target.style.pointerEvents,
		userSelect: event.target.style.userSelect,
		context,
		isFirst: true,
		isLast: false,
		step: 0,
		dx: 0,
		dy: 0,
	}
	const data = Object.create(dragging)
	const scope = globalThis.window
	const onEnd = (ev) => {
		dragging.node.style.pointerEvents = dragging.pointerEvents
		dragging.node.style.userSelect = dragging.userSelect
		unbind(scope, handlers)
		data.dx = ev.pageX - dragging.ox
		data.dy = ev.pageY - dragging.oy
		data.isLast = true
		end?.(ev, data)
	}
	const handlers = {
		mousemove: (ev) => {
			data.dx = ev.pageX - dragging.ox
			data.dy = ev.pageY - dragging.oy
			data.isFirst = dragging.step === 0
			dragging.step += 1
			const result = move?.(ev, data)
			switch (result) {
				case null:
					ev.preventDefault()
					ev.stopPropagation()
					break
				case false:
					doEnd()
			}
		},
		mouseup: onEnd,
		mouseleave: onEnd,
	}
	event.target.style.userSelect = "none"
	const doEnd = () => unbind(scope, handlers)
	bind(scope, handlers)
	return doEnd
}

drag.target = dragtarget

export { drag, dragtarget }
export default drag

// EOF
