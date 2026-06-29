// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-16
// Updated: 2026-06-16

// Module: select/interaction/drag
// Drag interaction helpers.

import { bind, unbind } from "./core.js";

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

// Function: drag
// Starts a drag interaction on `event.target` and invokes `move` and `end`
// callbacks with a shared drag context.
function drag(event, move, end, overlay = "dragging") {
	const context = {};
	// We add an overlay, which we can remove if className is null
	if (overlay && !drag.overlay) {
		const o = document.createElement("div");
		o.style.position = "fixed";
		o.style.top = "0";
		o.style.left = "0";
		o.style.width = "100vw";
		o.style.height = "100vh";
		o.style.zIndex = "100";
		drag.overlay = o;
	}
	const dragging = {
		node: event.target,
		ox: event.pageX,
		oy: event.pageY,
		overlay: drag.overlay,
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
	// We add the dragging
	drag.overlay.setAttribute("class", overlay);
	overlay !== null && window?.document?.body?.appendChild(drag.overlay);
	const onEnd = (ev) => {
		drag.overlay.parentNode?.removeChild(drag.overlay);
		drag.overlay.setAttribute("class", "");
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

drag.target = dragtarget;

export { drag, dragtarget };
export default drag;

// EOF
