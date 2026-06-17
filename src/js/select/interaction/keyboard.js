// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-16
// Updated: 2026-06-16

// Module: select/interaction/keyboard
// Keyboard helpers and textarea autoresize.

// Function: autoresize
// Resizes a textarea-like `event.target` to fit its scroll height.
function autoresize(event) {
	const node = event.target
	node.style.height = "auto"
	const style = globalThis.window.getComputedStyle(node)
	const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
	node.style.height = `${border + node.scrollHeight}px`
}

// Constant: Keyboard
// Keyboard event names and common key codes used by interaction helpers.
const Keyboard = {
	Down: "keydown",
	Up: "keyup",
	Press: "press",
	Codes: {
		SPACE: 32,
		TAB: 9,
		ENTER: 13,
		COMMA: 188,
		COLON: 186,
		BACKSPACE: 8,
		INSERT: 45,
		DELETE: 46,
		ESC: 27,
		UP: 38,
		DOWN: 40,
		LEFT: 37,
		RIGHT: 39,
		PAGE_UP: 33,
		PAGE_DOWN: 34,
		HOME: 36,
		END: 35,
		SHIFT: 16,
		ALT: 18,
		CTRL: 17,
		META_L: 91,
		META_R: 92,
	},
	Key(event) {
		return event ? (event.key ?? event.keyIdentifier ?? null) : null
	},
	Code(event) {
		return event ? (event.keyCode ?? null) : null
	},
	Char(event) {
		const key = Keyboard.Key(event)
		return !key ? null : key.length === 1 ? key : key === "Enter" ? "\n" : null
	},
	IsControl(event) {
		const key = Keyboard.Key(event)
		return !!(key && key.length > 1)
	},
	HasModifier(event) {
		return !!(event && (event.altKey || event.ctrlKey))
	},
}

const keyboard = Keyboard

export { keyboard, Keyboard, autoresize }
export default keyboard

// EOF
