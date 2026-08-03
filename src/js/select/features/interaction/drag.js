// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-16
// Updated: 2026-06-16

// Module: select/features/interaction/drag
// Drag interaction helpers.

import { attributeTarget, bind, unbind } from "./core.js";

// Function: dragtarget
// Walks up from `node` to find a `data-drag` target, optionally matching
// `name`.
function dragtarget(node, name) {
	return attributeTarget(node, "data-drag", name);
}

// Function: drag
// Starts a mouse drag on `event.target` and invokes `move` and `end` callbacks
// with a shared drag context. The optional gesture overlay is transparent to
// hit-testing so higher-level interactions can use `elementFromPoint`.
function drag(event, move, end, overlay = "dragging", threshold = 0) {
	const context = {};
	// We add an overlay, which we can remove if className is null.
	if (overlay && !drag.overlay) {
		const o = document.createElement("div");
		o.style.position = "fixed";
		o.style.top = "0";
		o.style.left = "0";
		o.style.width = "100vw";
		o.style.height = "100vh";
		o.style.zIndex = "100";
		o.style.pointerEvents = "none";
		drag.overlay = o;
	}
	const gestureOverlay = overlay ? drag.overlay : null;
	const dragging = {
		node: event.target,
		ox: event.pageX,
		oy: event.pageY,
		overlay: gestureOverlay,
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
	let stopped = false;
	if (gestureOverlay) {
		gestureOverlay.setAttribute("class", overlay);
		window?.document?.body?.appendChild(gestureOverlay);
	}
	const onEnd = (ev) => {
		if (stopped) return;
		stopped = true;
		gestureOverlay?.parentNode?.removeChild(gestureOverlay);
		gestureOverlay?.setAttribute("class", "");
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
			if (Math.hypot(data.dx, data.dy) < threshold) {
				return;
			}
			data.isFirst = dragging.step === 0;
			dragging.step += 1;
			const result = move?.(ev, data);
			switch (result) {
				case null:
					ev.preventDefault();
					ev.stopPropagation();
					break;
				case false:
					onEnd(ev);
			}
		},
		mouseup: onEnd,
		mouseleave: onEnd,
	};
	event.target.style.userSelect = "none";
	const doEnd = () => onEnd(event);
	bind(scope, handlers);
	return doEnd;
}

drag.target = dragtarget;

export { drag, dragtarget };
export default drag;

// EOF
