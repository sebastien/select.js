// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-15

// Module: select/features/interaction/popup
// Places a panel against a trigger, optionally portaling it to the document
// root so overflow-hidden ancestors cannot clip it.

import { bind, unbind } from "./core.js"
import { Keyboard } from "./keyboard.js"
import { anchored, opposite, viewport } from "./positioning.js"
import fastdom from "../../ui/fastdom.js"
import { attached } from "../../utils/dom.js"

const Z_BASE = 10000
const stack = []
const keyHandlers = { [Keyboard.Down]: onKey }
let keyBound = false
let keyWindow = null

// Function: popup
// Opens `panel` anchored to `trigger` and returns a session with `update` and
// `close`.
function popup(panel, trigger, options = {}) {
	const settings = configure(options)
	const [sourcePos, targetPos] = anchors(settings.at)
	const win = viewOf(panel) ?? viewOf(trigger)
	const host = hostOf(settings.portal, panel)
	const previous = snapshot(panel)
	const restore = host ? attached(panel) : null
	let closed = false
	let pending = false
	let layer = null

	const session = {
		panel,
		trigger,
		underlay: null,
		box: null,
		escape: settings.escape,
		update,
		close,
	}

	stack.push(session)
	const z = Z_BASE + (stack.length - 1) * 2
	if (settings.escape) bindKey()

	if (settings.underlay) {
		layer = underlay(settings.underlay, z)
		layer.addEventListener("click", onUnderlay)
		session.underlay = layer
	}

	panel.style.position = "fixed"
	panel.style.zIndex = `${z + 1}`
	if (host) {
		if (layer) host.appendChild(layer)
		host.appendChild(panel)
	} else if (layer && panel.parentNode) {
		panel.parentNode.insertBefore(layer, panel)
	}

	const observers = observe(panel, trigger, win, scheduleUpdate)
	update()

	function update() {
		if (closed) return session
		const triggerBox = boxOf(trigger.getBoundingClientRect())
		const panelBox = naturalBox(panel)
		const bounds = viewport(win)
		const next = anchored(panelBox, sourcePos, triggerBox, targetPos, bounds, {
			overflow: settings.overflow,
			padding: settings.padding,
			flip: settings.flip,
		})
		applyBox(panel, next, panelBox)
		session.box = next
		return session
	}

	function scheduleUpdate() {
		if (closed || pending) return
		pending = true
		fastdom.measure(() => {
			pending = false
			update()
		})
	}

	function close(reason = "close") {
		if (closed) return session
		closed = true
		remove(session)
		observers.disconnect()
		layer?.removeEventListener("click", onUnderlay)
		layer?.remove()
		restoreStyles(panel, previous)
		restore?.()
		settings.onClose?.(reason)
		return session
	}

	function onUnderlay() {
		close("underlay")
	}

	return session
}

function configure(options) {
	return {
		at: options.at ?? "s",
		overflow: options.overflow ?? "move-resize",
		padding: options.padding ?? 8,
		flip: options.flip !== false,
		portal: options.portal ?? true,
		underlay: options.underlay ?? false,
		escape: options.escape !== false,
		onClose: options.onClose,
	}
}

function anchors(at) {
	if (typeof at === "string" || isPoint(at)) return [opposite(at), at]
	if (Array.isArray(at) && at.length === 2) return at
	throw new Error("Popup `at` requires a position or [source, target] pair")
}

function isPoint(value) {
	return Array.isArray(value) && value.length === 2 && typeof value[0] === "number"
}

function hostOf(portal, node) {
	if (portal === false) return null
	if (portal?.nodeType) return portal
	return node?.ownerDocument?.body ?? globalThis.document?.body ?? null
}

function viewOf(node) {
	return node?.ownerDocument?.defaultView ?? globalThis.window ?? globalThis
}

function underlay(value, z) {
	const options =
		value === true
			? { className: "", dim: false }
			: typeof value === "string"
				? { className: value, dim: false }
				: { className: value.class ?? "", dim: !!value.dim }
	const node = (globalThis.document ?? document).createElement("div")
	node.style.position = "fixed"
	node.style.inset = "0"
	node.style.zIndex = `${z}`
	if (options.dim) node.style.background = "rgba(0, 0, 0, 0.32)"
	if (options.className) node.className = options.className
	return node
}

function observe(panel, trigger, win, update) {
	const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null
	ro?.observe(panel)
	ro?.observe(trigger)
	win?.addEventListener("resize", update)
	win?.addEventListener("scroll", update, true)
	const visual = win?.visualViewport
	visual?.addEventListener("resize", update)
	visual?.addEventListener("scroll", update)
	return {
		disconnect() {
			ro?.disconnect()
			win?.removeEventListener("resize", update)
			win?.removeEventListener("scroll", update, true)
			visual?.removeEventListener("resize", update)
			visual?.removeEventListener("scroll", update)
		},
	}
}

function boxOf(rect) {
	return {
		x: rect.x ?? rect.left,
		y: rect.y ?? rect.top,
		width: rect.width,
		height: rect.height,
	}
}

function naturalBox(node) {
	const width = node.style.width
	const height = node.style.height
	if (width) node.style.width = ""
	if (height) node.style.height = ""
	const box = boxOf(node.getBoundingClientRect())
	if (width) node.style.width = width
	if (height) node.style.height = height
	return box
}

function applyBox(node, box, natural) {
	node.style.position = "fixed"
	node.style.left = `${box.x}px`
	node.style.top = `${box.y}px`
	node.style.right = "auto"
	node.style.bottom = "auto"
	node.style.margin = "0"
	node.style.width = box.width < natural.width ? `${box.width}px` : ""
	node.style.height = box.height < natural.height ? `${box.height}px` : ""
}

function snapshot(node) {
	const style = node.style
	return {
		position: style.position,
		left: style.left,
		top: style.top,
		right: style.right,
		bottom: style.bottom,
		margin: style.margin,
		width: style.width,
		height: style.height,
		zIndex: style.zIndex,
	}
}

function restoreStyles(node, previous) {
	const style = node.style
	style.position = previous.position
	style.left = previous.left
	style.top = previous.top
	style.right = previous.right
	style.bottom = previous.bottom
	style.margin = previous.margin
	style.width = previous.width
	style.height = previous.height
	style.zIndex = previous.zIndex
}

function onKey(event) {
	const session = stack[stack.length - 1]
	if (!session?.escape) return
	const isEsc = event.key === "Escape" || Keyboard.Code(event) === Keyboard.Codes.ESC
	if (!isEsc) return
	event.preventDefault?.()
	session.close("escape")
}

function bindKey() {
	const win = globalThis.window
	if (!win) return
	if (keyBound && keyWindow === win) return
	if (keyBound && keyWindow) unbind(keyWindow, keyHandlers)
	bind(win, keyHandlers)
	keyBound = true
	keyWindow = win
}

function remove(session) {
	const index = stack.lastIndexOf(session)
	if (index >= 0) stack.splice(index, 1)
	if (stack.length === 0 && keyBound) {
		unbind(keyWindow ?? globalThis.window, keyHandlers)
		keyBound = false
		keyWindow = null
	}
}

export { popup }
export default popup

// EOF
