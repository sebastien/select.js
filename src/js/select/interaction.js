// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-02

// Module: select/interaction
// DOM interaction helpers.

// Function: bind
// Registers `handlers` on `node`. Accepts a single node or an array-like
// collection of nodes and returns the original `node`.
function bind(node, handlers) {
	if (handlers) {
		for (const [name, handler] of Object.entries(handlers)) {
			for (const target of Array.isArray(node) ? node : [node]) {
				target.addEventListener(name, handler);
			}
		}
	}
	return node;
}

// Function: unbind
// Removes `handlers` from `node`. Accepts a single node or an array-like
// collection of nodes and returns the original `node`.
function unbind(node, handlers) {
	if (handlers) {
		for (const [name, handler] of Object.entries(handlers)) {
			for (const target of Array.isArray(node) ? node : [node]) {
				target.removeEventListener(name, handler);
			}
		}
	}
	return node;
}

// Function: drag
// Starts a drag interaction on `event.target` and invokes `move` and `end`
// callbacks with a shared drag context.
function drag(event, move, end) {
	const context = {};
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
	};
	const data = Object.create(dragging);
	const scope = globalThis.window;
	const onEnd = (ev) => {
		dragging.node.style.pointerEvents = dragging.pointerEvents;
		dragging.node.style.userSelect = dragging.userSelect;
		unbind(scope, handlers);
		data.dx = ev.pageX - dragging.ox;
		data.dy = ev.pageY - dragging.oy;
		data.isLast = true;
		end?.(ev, data);
	};
	const handlers = {
		mousemove: (ev) => {
			data.dx = ev.pageX - dragging.ox;
			data.dy = ev.pageY - dragging.oy;
			data.isFirst = dragging.step === 0;
			dragging.step += 1;
			const result = move?.(ev, data);
			switch (result) {
				case null:
					ev.preventDefault();
					ev.stopPropagation();
					break;
				case false:
					doEnd();
			}
		},
		mouseup: onEnd,
		mouseleave: onEnd,
	};
	event.target.style.userSelect = "none";
	const doEnd = () => unbind(scope, handlers);
	bind(scope, handlers);
	return doEnd;
}

// Function: target
// Walks up from `node` until `pred(node)` returns true.
function target(node, pred) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		if (pred(node)) return node;
		node = node.parentNode;
	}
	return undefined;
}

// Function: dragtarget
// Walks up from `node` to find a `data-drag` target, optionally matching
// `name`.
function dragtarget(node, name) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		const element = node;
		if (!name && element.hasAttribute("data-drag")) return element;
		if (name && element.getAttribute("data-drag") === name) return element;
		node = element.parentNode;
	}
	return node?.nodeType === Node.ELEMENT_NODE ? node : undefined;
}

drag.target = dragtarget;

// Function: autoresize
// Resizes a textarea-like `event.target` to fit its scroll height.
function autoresize(event) {
	const node = event.target;
	node.style.height = "auto";
	const style = globalThis.window.getComputedStyle(node);
	const border =
		parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
	node.style.height = `${border + node.scrollHeight}px`;
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
		return event ? (event.key ?? event.keyIdentifier ?? null) : null;
	},
	Code(event) {
		return event ? (event.keyCode ?? null) : null;
	},
	Char(event) {
		const key = Keyboard.Key(event);
		return !key ? null : key.length === 1 ? key : key === "Enter" ? "\n" : null;
	},
	IsControl(event) {
		const key = Keyboard.Key(event);
		return !!(key && key.length > 1);
	},
	HasModifier(event) {
		return !!(event && (event.altKey || event.ctrlKey));
	},
};

export { Keyboard, autoresize, bind, drag, dragtarget, target, unbind };
export default { Keyboard, autoresize, bind, drag, dragtarget, target, unbind };

// EOF
