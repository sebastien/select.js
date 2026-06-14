// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-16

// Module: select/interaction/placement
// Sortable placement helpers for measurement, slot resolution, and placeholder
// application.

function match(node, selector) {
	if (typeof selector === "function") {
		return selector(node)
	}
	return node.matches(selector)
}

function items(listNode, context) {
	const res = []
	for (const node of listNode.children) {
		if (node === context.sourceNode || node === context.placeholder) {
			continue
		}
		if (match(node, context.options.item)) {
			res.push(node)
		}
	}
	return res
}

function measure(listNode, context) {
	const display = context.placeholder.style?.display
	if (context.placeholder.style) {
		context.placeholder.style.display = "none"
	}
	const nodes = items(listNode, context)
	const res = []
	for (let i = 0; i < nodes.length; i++) {
		res.push({
			node: nodes[i],
			index: i,
			box: nodes[i].getBoundingClientRect(),
		})
	}
	if (context.placeholder.style) {
		context.placeholder.style.display = display
	}
	return res
}

function rows(items) {
	const res = []
	for (let i = 0; i < items.length; i++) {
		const item = items[i]
		let row = null
		for (let j = 0; j < res.length; j++) {
			if (Math.abs(res[j].top - item.box.top) <= 8) {
				row = res[j]
				break
			}
		}
		if (!row) {
			row = { top: item.box.top, bottom: item.box.bottom, centerY: 0, items: [] }
			res.push(row)
		}
		row.top = Math.min(row.top, item.box.top)
		row.bottom = Math.max(row.bottom, item.box.bottom)
		row.items.push(item)
	}
	res.sort((a, b) => a.top - b.top)
	for (let i = 0; i < res.length; i++) {
		const row = res[i]
		row.index = i
		row.centerY = row.top + (row.bottom - row.top) / 2
		row.items.sort((a, b) => a.box.left - b.box.left)
	}
	return res
}

function row(rows, y, motion, previous) {
	if (rows.length === 0) {
		return null
	}
	for (let i = 0; i < rows.length; i++) {
		const current = rows[i]
		if (y >= current.top - 6 && y <= current.bottom + 6) {
			return current
		}
	}
	if (rows.length === 1) {
		return rows[0]
	}
	for (let i = 0; i < rows.length - 1; i++) {
		const current = rows[i]
		const next = rows[i + 1]
		if (y > current.centerY && y < next.centerY) {
			if (Math.abs(motion.dy) > Math.abs(motion.dx) * 0.8) {
				return motion.dy > 0 ? next : current
			}
			if (previous?.row === current.index || previous?.row === next.index) {
				return rows[previous.row]
			}
			return y < (current.centerY + next.centerY) / 2 ? current : next
		}
	}
	return y < rows[0].centerY ? rows[0] : rows[rows.length - 1]
}

function cols(rows) {
	let reference = rows[0]
	for (let i = 1; i < rows.length; i++) {
		if (rows[i].items.length > reference.items.length) {
			reference = rows[i]
		}
	}
	const res = []
	for (let i = 0; i < reference.items.length; i++) {
		const box = reference.items[i].box
		res.push(box.left + box.width / 2)
	}
	return res
}

function col(cols, x) {
	for (let i = 0; i < cols.length; i++) {
		if (x < cols[i]) {
			return i
		}
	}
	return cols.length
}

function slot(row, x, cols) {
	const items = row.items
	const index = col(cols, x)
	if (index >= items.length) {
		const last = items[items.length - 1]
		return { row: row.index, col: index, index: last.index + 1 }
	}
	for (let i = 0; i < items.length; i++) {
		const box = items[i].box
		const mid = box.left + box.width / 2
		if (x < mid) {
			return { row: row.index, col: i, index: items[i].index }
		}
	}
	const last = items[items.length - 1]
	return { row: row.index, col: items.length, index: last.index + 1 }
}

function linear(items, _x, y) {
	for (let i = 0; i < items.length; i++) {
		const box = items[i].box
		if (y < box.top + box.height / 2) {
			return { index: items[i].index, row: i, col: 0 }
		}
	}
	return { index: items.length, row: items.length, col: 0 }
}

function grid(items, x, y, context) {
	const grouped = rows(items)
	const centers = cols(grouped)
	const current = row(grouped, y, context.pointer, context.placement)
	return slot(current, x, centers)
}

function apply(placeholder, listNode, index, context) {
	if (!listNode) {
		return false
	}
	const nodes = items(listNode, context)
	const targetNode = nodes[index]
	if (!targetNode) {
		if (placeholder.parentNode === listNode && placeholder === listNode.lastElementChild) {
			return false
		}
		listNode.appendChild(placeholder)
		return true
	}
	const parent = targetNode.parentNode
	if (placeholder.parentNode === parent && placeholder.nextSibling === targetNode) {
		return false
	}
	parent.insertBefore(placeholder, targetNode)
	return true
}

const placement = { measure, linear, grid, apply }

export { measure, linear, grid, apply, placement }
export default placement

// EOF
