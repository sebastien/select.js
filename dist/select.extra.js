// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: select.extra
// Agnostic utility helpers for class-name composition and DOM interactions.
// This module is intentionally independent from `select.js` and `select.ui.js`.

// ----------------------------------------------------------------------------
//
// SECTION: Classname Composition
//
// ----------------------------------------------------------------------------

function* iclsx(...args) {
	for (const value of args) {
		if (!value) {
			continue;
		}
		switch (value?.constructor) {
			case Array:
				yield* iclsx(...value);
				break;
			case Object:
				for (const key in value) {
					const token = key.trim();
					if (value[key] && token) {
						yield token;
					}
				}
				break;
			case String:
				{
					const token = value.trim();
					if (token.length) {
						yield token;
					}
				}
				break;
			case Number:
				yield `${value}`;
				break;
			case Boolean:
				break;
		}
	}
}

const clsx = (...args) => {
	return [...iclsx(...args)].join(" ");
};

// ----------------------------------------------------------------------------
//
// SECTION: Event Binding
//
// ----------------------------------------------------------------------------

const bind = (node, handlers) => {
	if (handlers) {
		for (const [name, handler] of Object.entries(handlers)) {
			for (const target of Array.isArray(node) ? node : [node]) {
				target.addEventListener(name, handler);
			}
		}
	}
	return node;
};

const unbind = (node, handlers) => {
	if (handlers) {
		for (const [name, handler] of Object.entries(handlers)) {
			for (const target of Array.isArray(node) ? node : [node]) {
				target.removeEventListener(name, handler);
			}
		}
	}
	return node;
};

// ----------------------------------------------------------------------------
//
// SECTION: Dragging
//
// ----------------------------------------------------------------------------

const drag = (event, move, end) => {
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
	const onEnd = (event) => {
		const mouseEvent = event;
		dragging.node.style.pointerEvents = dragging.pointerEvents;
		dragging.node.style.userSelect = dragging.userSelect;
		unbind(scope, handlers);
		data.dx = mouseEvent.pageX - dragging.ox;
		data.dy = mouseEvent.pageY - dragging.oy;
		data.isLast = true;
		end?.(mouseEvent, data);
	};
	const handlers = {
		mousemove: (event) => {
			const mouseEvent = event;
			data.dx = mouseEvent.pageX - dragging.ox;
			data.dy = mouseEvent.pageY - dragging.oy;
			data.isFirst = dragging.step === 0;
			dragging.step += 1;
			const result = move?.(mouseEvent, data);
			switch (result) {
				case null:
					event.preventDefault();
					event.stopPropagation();
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
};

const target = (node, predicate) => {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		if (predicate(node)) {
			return node;
		}
		node = node.parentNode;
	}
	return undefined;
};

const dragtarget = (node, name) => {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		const element = node;
		if (!name && element.hasAttribute("data-drag")) {
			return element;
		}
		if (name && element.getAttribute("data-drag") === name) {
			return element;
		}
		node = element.parentNode;
	}
	return node?.nodeType === Node.ELEMENT_NODE ? node : undefined;
};

drag.target = dragtarget;

// ----------------------------------------------------------------------------
//
// SECTION: Input Helpers
//
// ----------------------------------------------------------------------------

const autoresize = (event) => {
	const node = event.target;
	node.style.height = "auto";
	const style = globalThis.window.getComputedStyle(node);
	const border =
		parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
	node.style.height = `${border + node.scrollHeight}px`;
};

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

const extra = Object.freeze({
	autoresize,
	bind,
	clsx,
	drag,
	dragtarget,
	iclsx,
	Keyboard,
	target,
	unbind,
});

export {
	autoresize,
	bind,
	clsx,
	drag,
	dragtarget,
	iclsx,
	Keyboard,
	target,
	unbind,
};
export default extra;

// EOF
