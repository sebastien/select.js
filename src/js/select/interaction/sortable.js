// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-16

// Module: select/interaction/sortable
// Sortable drag interaction helpers.

import { target } from "./core.js"
import drag from "./drag.js"
import placement from "./placement.js"

// Function: sorttarget
// Walks up from `node` to find a `data-sortable-item` target, optionally
// matching `name`.
function sorttarget(node, name) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		const element = node
		if (!name && element.hasAttribute("data-sortable-item")) return element
		if (name && element.getAttribute("data-sortable-item") === name) {
			return element
		}
		node = element.parentNode
	}
	return node?.nodeType === Node.ELEMENT_NODE ? node : undefined
}

// Function: sortable
// Starts a sortable drag interaction from `event.target`. The interaction uses
// `data-sortable-item`, `data-sortable-list`, and `data-axis` by default and
// invokes `onDrop` with `{source, drop}` when the item is released. Custom
// placement can be provided with `place(next, state)`.
function sortable(event, optionsOrDrop) {
	const options = sortableOptions(optionsOrDrop)
	const sourceNode = sortableItem(event.target, options)
	const sourceList = sourceNode ? sortableList(sourceNode, options) : undefined
	if (!sourceNode || !sourceList) {
		return undefined
	}
	event.preventDefault()
	const { preview, box, ox, oy } = createSortablePreview(sourceNode, event, options)
	const placeholder = createSortablePlaceholder(sourceNode, options)
	sourceList.insertBefore(placeholder, sourceNode)
	hideSortableSource(sourceNode, options)
	const index = sortableIndex(sourceNode, sourceList, options)
	const session = {
		options,
		sourceNode,
		sourceList,
		preview,
		placeholder,
		box,
		ox,
		oy,
		rx: ox / Math.max(1, box.width),
		ry: oy / Math.max(1, box.height),
		previewWidth: box.width,
		previewHeight: box.height,
		pointer: {
			x: event.clientX,
			y: event.clientY,
			dx: 0,
			dy: 0,
		},
		placement: null,
		drop: {
			listNode: sourceList,
			listId: sortableListId(sourceList, options),
			index,
			row: index,
			col: 0,
		},
		source: {
			node: sourceNode,
			listNode: sourceList,
			listId: sortableListId(sourceList, options),
			itemId: sortableItemId(sourceNode, options),
			index,
		},
	}
	updateSortablePreview(session, event)
	return drag(
		event,
		(ev) => {
			session.drop = locateSortablePlaceholder(session, ev.clientX, ev.clientY, ev) ?? session.drop
			updateSortablePreview(session, ev)
			options.onMove?.(ev, sortableState(session))
		},
		(ev) => {
			const state = sortableState(session, ev)
			clearSortableArtifacts(session)
			if (state.drop) {
				options.onDrop?.(state)
			} else {
				options.onCancel?.(state)
			}
		},
	)
}

function sortableOptions(optionsOrDrop) {
	const options = typeof optionsOrDrop === "function" ? { onDrop: optionsOrDrop } : (optionsOrDrop ?? {})
	return {
		item: options.item ?? "[data-sortable-item]",
		list: options.list ?? "[data-sortable-list]",
		axis: options.axis ?? "data-axis",
		overlay: options.overlay ?? null,
		preview: options.preview ?? true,
		placeholder: options.placeholder ?? true,
		sourceClass: options.sourceClass ?? "is-dragging-source",
		sourceHiddenClass: options.sourceHiddenClass ?? "is-dragging-source-hidden",
		placeholderClass: options.placeholderClass ?? "sortable-placeholder",
		previewClass: options.previewClass ?? "sortable-preview",
		place: options.place,
		onMove: options.onMove,
		onDrop: options.onDrop,
		onCancel: options.onCancel,
	}
}

function sortableState(session, event) {
	return {
		source: session.source,
		drop: session.drop,
		placeholder: session.placeholder,
		preview: session.preview,
		pointer: session.pointer,
		box: session.box,
		grab: { x: session.ox, y: session.oy },
		left: event ? event.clientX - session.ox : undefined,
		top: event ? event.clientY - session.oy : undefined,
		event,
	}
}

function sortableMatches(node, selector) {
	if (typeof selector === "function") {
		return selector(node)
	}
	return node.matches(selector)
}

function sortableItem(node, options) {
	return target(node, (_) => sortableMatches(_, options.item))
}

function sortableList(node, options) {
	return target(node, (_) => sortableMatches(_, options.list))
}

function sortableItemId(node, options) {
	return node.getAttribute(attributeName(options.item, "data-sortable-item")) ?? node.dataset.sortableItem
}

function sortableListId(node, options) {
	return node.getAttribute(attributeName(options.list, "data-sortable-list")) ?? node.dataset.sortableList
}

function sortableAxis(node, options) {
	return node.getAttribute(options.axis) ?? node.dataset.axis ?? "y"
}

function attributeName(selector, fallback) {
	return typeof selector === "string" && /^\[[^=\]]+\]$/.test(selector)
		? selector.slice(1, -1)
		: fallback
}

function sortableListItems(listNode, session) {
	const res = []
	for (const node of listNode.children) {
		if (node === session.sourceNode || node === session.placeholder) {
			continue
		}
		if (sortableMatches(node, session.options.item)) {
			res.push(node)
		}
	}
	return res
}

function sortableIndex(node, listNode, options) {
	const value = node.getAttribute("data-index")
	if (value !== null) {
		return parseInt(value, 10)
	}
	const nodes = sortableListItems(listNode, { sourceNode: null, placeholder: null, options })
	for (let i = 0; i < nodes.length; i++) {
		if (nodes[i] === node) {
			return i
		}
	}
	return 0
}

function createSortablePreview(itemNode, event, options) {
	const preview = options.preview ? itemNode.cloneNode(true) : null
	const box = itemNode.getBoundingClientRect()
	const ox = event.clientX - box.left
	const oy = event.clientY - box.top
	if (preview) {
		preview.classList.add(options.previewClass)
		preview.classList.remove(options.sourceClass)
		preview.classList.remove(options.sourceHiddenClass)
		preview.style.position = "fixed"
		preview.style.left = "0px"
		preview.style.top = "0px"
		preview.style.width = `${box.width}px`
		preview.style.height = `${box.height}px`
		preview.style.pointerEvents = "none"
		const overlay = options.overlay || globalThis.document.body
		overlay.appendChild(preview)
	}
	return { preview, box, ox, oy }
}

function createSortablePlaceholder(sourceNode, options) {
	if (!options.placeholder) {
		return globalThis.document.createComment("sortable-placeholder")
	}
	const placeholder = sourceNode.cloneNode(true)
	placeholder.classList.add(options.placeholderClass)
	placeholder.classList.remove(options.sourceClass)
	placeholder.classList.remove(options.sourceHiddenClass)
	placeholder.removeAttribute("data-index")
	placeholder.removeAttribute("data-sortable-item")
	placeholder.dataset.sortablePlaceholder = "true"
	placeholder.style.pointerEvents = "none"
	return placeholder
}

function hideSortableSource(sourceNode, options) {
	sourceNode.classList.add(options.sourceClass)
	sourceNode.classList.add(options.sourceHiddenClass)
}

function showSortableSource(sourceNode, options) {
	sourceNode.classList.remove(options.sourceClass)
	sourceNode.classList.remove(options.sourceHiddenClass)
}

function nearestSortableTarget(x, y, options) {
	const current = globalThis.document.elementFromPoint(x, y)
	return {
		list: sortableList(current, options),
		item: sortableItem(current, options),
	}
}

function distanceSquared(x1, y1, x2, y2) {
	const dx = x2 - x1
	const dy = y2 - y1
	return dx * dx + dy * dy
}

function updateSortablePointer(session, x, y) {
	const pointer = session.pointer
	pointer.dx = x - pointer.x
	pointer.dy = y - pointer.y
	pointer.x = x
	pointer.y = y
	return pointer
}

function sortablePlacementForList(listNode, x, y, session) {
	const items = placement.measure(listNode, session)
	const listId = sortableListId(listNode, session.options)
	if (items.length === 0) {
		return { listId, listNode, index: 0, row: 0, col: 0 }
	}
	const slot =
		sortableAxis(listNode, session.options) === "y"
			? placement.linear(items, x, y, session)
			: placement.grid(items, x, y, session)
	return { listId, listNode, ...slot }
}

function shouldAcceptSortablePlacement(next, previous, motion) {
	if (!previous || previous.listId !== next.listId) {
		return true
	}
	if (previous.index === next.index) {
		return false
	}
	if (previous.row !== next.row) {
		return Math.abs(motion.dy) > 1 || Math.abs(next.row - previous.row) > 1
	}
	return Math.abs(motion.dx) > 1 || Math.abs(next.index - previous.index) > 1
}

function locateSortablePlaceholder(session, x, y, event) {
	const motion = updateSortablePointer(session, x, y)
	const { list } = nearestSortableTarget(x, y, session.options)
	if (!list) {
		return undefined
	}
	const proposed = sortablePlacementForList(list, x, y, session)
	const custom = session.options.place?.(proposed, sortableState(session, event))
	if (custom === false) {
		return sortablePlaceholderDrop(session)
	}
	const next = custom === undefined ? proposed : { ...proposed, ...custom }
	if (!next) {
		placement.apply(session.placeholder, list, 0, session)
		return { listNode: list, listId: sortableListId(list, session.options), index: 0, row: 0, col: 0 }
	}
	if (shouldAcceptSortablePlacement(next, session.placement, motion)) {
		placement.apply(session.placeholder, next.listNode, next.index, session)
		session.placement = next
	}
	return sortablePlaceholderDrop(session)
}

function sortablePlaceholderDrop(session) {
	const listNode = session.placeholder.parentNode
	if (!listNode || !sortableMatches(listNode, session.options.list)) {
		return undefined
	}
	let index = 0
	for (const node of listNode.children) {
		if (node === session.sourceNode) {
			continue
		}
		if (node === session.placeholder) {
			return { ...session.placement, listNode, listId: sortableListId(listNode, session.options), index }
		}
		if (sortableMatches(node, session.options.item)) {
			index += 1
		}
	}
	return { ...session.placement, listNode, listId: sortableListId(listNode, session.options), index }
}

function clearSortableArtifacts(session) {
	session.placeholder?.remove()
	session.preview?.remove()
	showSortableSource(session.sourceNode, session.options)
}

function updateSortablePreview(session, event) {
	if (!session.preview) {
		return
	}
	let width = session.box.width
	let height = session.box.height
	const placeholder = session.placeholder
	if (placeholder?.isConnected && placeholder.getBoundingClientRect) {
		const box = placeholder.getBoundingClientRect()
		const cx = box.left + box.width / 2
		const cy = box.top + box.height / 2
		const dist = Math.sqrt(distanceSquared(event.clientX, event.clientY, cx, cy))
		const blend = Math.max(0, Math.min(1, (220 - dist) / 220))
		const ease = 0.34 + blend * 0.5
		width = session.previewWidth + (box.width - session.previewWidth) * ease
		height = session.previewHeight + (box.height - session.previewHeight) * ease
	}
	const x = event.clientX - width * session.rx
	const y = event.clientY - height * session.ry
	session.previewWidth = width
	session.previewHeight = height
	session.preview.style.left = `${x}px`
	session.preview.style.top = `${y}px`
	session.preview.style.width = `${width}px`
	session.preview.style.height = `${height}px`
}

sortable.target = sorttarget

export { sortable, sorttarget }
export default sortable

// EOF
