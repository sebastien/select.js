// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-07-11

// Module: select/interaction/draggable
// Mouse drag, drop, and sort interaction helpers. Drags use a cloned visual;
// generic drops append a clone by default while <sort> moves the source item.

import { target } from "./core.js";
import drag from "./drag.js";
import placement from "./placement.js";

// Function: draggabletarget
// Walks up from `node` to find a draggable source, optionally matching `name`.
function draggabletarget(node, name) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		const element = node;
		if (!name && element.hasAttribute("data-draggable")) return element;
		if (name && element.getAttribute("data-draggable") === name) {
			return element;
		}
		node = element.parentNode;
	}
	return undefined;
}

// Function: droptarget
// Walks up from `node` to find a drop target, optionally matching `name`.
function droptarget(node, name) {
	while (node && node.nodeType === Node.ELEMENT_NODE) {
		const element = node;
		if (!name && element.hasAttribute("data-drop-target")) return element;
		if (name && element.getAttribute("data-drop-target") === name) {
			return element;
		}
		node = element.parentNode;
	}
	return undefined;
}

// Function: draggable
// Starts a generic drag/drop interaction. Accepted targets receive a cloned
// preview and retain that clone on drop unless `drop` performs a custom commit.
function draggable(event, options = {}) {
	const settings = draggableOptions(options);
	const sourceNode = find(event.target, settings.source);
	if (!sourceNode) return undefined;
	event.preventDefault();
	const session = createSession(sourceNode, event, settings, "drop");
	session.source = descriptor(sourceNode, settings.source, "data-draggable");
	updateDragPreview(session, event);
	return drag(
		event,
		(ev) => {
			updateDrop(session, ev);
			updateDragPreview(session, ev);
			settings.onMove?.(state(session, ev));
		},
		(ev) => finishDrop(session, ev),
		null,
	);
}

function draggableOptions(options) {
	return {
		source: options.source ?? "[data-draggable]",
		target: options.target ?? "[data-drop-target]",
		overlay: options.overlay ?? globalThis.document.body,
		dragPreview: options.dragPreview !== false,
		sourceClass: options.sourceClass ?? "is-dragging-source",
		previewClass: options.previewClass ?? "draggable-preview",
		effectPreviewClass: options.effectPreviewClass ?? "draggable-drop-preview",
		accept: options.accept,
		preview: options.preview,
		drop: options.drop,
		onMove: options.onMove,
		onDrop: options.onDrop,
		onCancel: options.onCancel,
	};
}

function createSession(sourceNode, event, options, mode) {
	const box = sourceNode.getBoundingClientRect();
	const ox = event.clientX - box.left;
	const oy = event.clientY - box.top;
	const preview = options.dragPreview ? sourceNode.cloneNode(true) : null;
	if (preview) {
		preview.classList.add(options.previewClass);
		preview.style.position = "fixed";
		preview.style.left = "0px";
		preview.style.top = "0px";
		preview.style.width = `${box.width}px`;
		preview.style.height = `${box.height}px`;
		preview.style.pointerEvents = "none";
		options.overlay?.appendChild(preview);
	}
	sourceNode.classList.add(options.sourceClass);
	return {
		mode,
		options,
		sourceNode,
		preview,
		box,
		ox,
		oy,
		rx: ox / Math.max(1, box.width),
		ry: oy / Math.max(1, box.height),
		pointer: { x: event.clientX, y: event.clientY, dx: 0, dy: 0 },
		proposal: undefined,
		target: undefined,
		effectPreview: undefined,
		previewCleanup: undefined,
	};
}

function descriptor(node, selector, fallback) {
	return {
		node,
		id: node.getAttribute(attributeName(selector, fallback)) ?? undefined,
	};
}

function accepts(targetNode, source, options, proposal, session) {
	const accepted = targetNode.getAttribute("data-drop-accept");
	if (accepted) {
		const names = accepted.trim().split(/\s+/);
		if (!names.includes("*") && !names.includes(source.id ?? "")) {
			return false;
		}
	}
	return options.accept?.(proposal, state(session, proposal.event)) !== false;
}

function updateDrop(session, event) {
	updatePointer(session, event.clientX, event.clientY);
	const targetNode = find(
		globalThis.document.elementFromPoint(event.clientX, event.clientY),
		session.options.target,
	);
	if (!targetNode) {
		clearEffectPreview(session);
		session.proposal = undefined;
		session.target = undefined;
		return;
	}
	const targetDescriptor = descriptor(
		targetNode,
		session.options.target,
		"data-drop-target",
	);
	const proposal = { source: session.source, target: targetDescriptor, event };
	if (
		!accepts(targetNode, session.source, session.options, proposal, session)
	) {
		clearEffectPreview(session);
		session.proposal = undefined;
		session.target = undefined;
		return;
	}
	const custom = session.options.preview?.(proposal, state(session, event));
	if (custom === false) {
		clearEffectPreview(session);
		session.proposal = undefined;
		session.target = undefined;
		return;
	}
	const resolved = resolvePreview(proposal, custom);
	clearEffectPreview(session);
	session.proposal = resolved;
	session.target = resolved.target;
	if (custom?.cleanup) {
		session.previewCleanup = custom.cleanup;
	} else {
		const effectPreview = session.sourceNode.cloneNode(true);
		effectPreview.classList.add(session.options.effectPreviewClass);
		effectPreview.style.pointerEvents = "none";
		resolved.target.node.appendChild(effectPreview);
		session.effectPreview = effectPreview;
	}
}

function resolvePreview(proposal, custom) {
	if (!custom || typeof custom !== "object") return proposal;
	if (custom.proposal) return { ...proposal, ...custom.proposal };
	const { cleanup, ...changes } = custom;
	return Object.keys(changes).length ? { ...proposal, ...changes } : proposal;
}

function finishDrop(session, event) {
	const current = session.proposal;
	if (!current) {
		clearSession(session);
		session.options.onCancel?.(state(session, event));
		return;
	}
	if (session.options.drop) {
		clearEffectPreview(session);
		session.options.drop(current, state(session, event));
	} else if (session.effectPreview) {
		session.effectPreview.classList.remove(session.options.effectPreviewClass);
		session.effectPreview = undefined;
	}
	clearSession(session);
	session.options.onDrop?.(state(session, event));
}

function clearEffectPreview(session) {
	session.previewCleanup?.();
	session.previewCleanup = undefined;
	session.effectPreview?.remove();
	session.effectPreview = undefined;
}

function clearSession(session) {
	clearEffectPreview(session);
	session.preview?.remove();
	session.sourceNode.classList.remove(session.options.sourceClass);
}

// Function: sorttarget
// Walks up from `node` to find a sortable item, optionally matching `name`.
function sorttarget(node, name) {
	return find(
		node,
		name ? `[data-sortable-item="${name}"]` : "[data-sortable-item]",
	);
}

// Function: sort
// Starts a sortable interaction. The source is represented by a clone while
// dragging, and successful default drops move the original item.
function sort(event, options = {}) {
	const settings = sortOptions(options);
	const sourceNode = find(event.target, settings.item);
	const sourceList = sourceNode
		? find(sourceNode.parentNode, settings.list)
		: undefined;
	if (!sourceNode || !sourceList) return undefined;
	event.preventDefault();
	const session = createSession(sourceNode, event, settings, "sort");
	const index = sortIndex(sourceNode, sourceList, settings);
	session.source = {
		...descriptor(sourceNode, settings.item, "data-sortable-item"),
		listNode: sourceList,
		listId: listId(sourceList, settings),
		index,
	};
	session.placeholder = createPlaceholder(sourceNode, settings);
	sourceList.insertBefore(session.placeholder, sourceNode);
	sourceNode.classList.add(settings.sourceHiddenClass);
	updateDragPreview(session, event);
	return drag(
		event,
		(ev) => {
			updateSort(session, ev);
			updateDragPreview(session, ev);
			settings.onMove?.(state(session, ev));
		},
		(ev) => finishSort(session, ev),
		null,
	);
}

function sortOptions(options) {
	return {
		...draggableOptions(options),
		item: options.item ?? "[data-sortable-item]",
		list: options.list ?? "[data-sortable-list]",
		axis: options.axis ?? "data-axis",
		placeholder: options.placeholder !== false,
		placeholderClass: options.placeholderClass ?? "sortable-placeholder",
		sourceHiddenClass: options.sourceHiddenClass ?? "is-dragging-source-hidden",
	};
}

function updateSort(session, event) {
	updatePointer(session, event.clientX, event.clientY);
	const listNode = find(
		globalThis.document.elementFromPoint(event.clientX, event.clientY),
		session.options.list,
	);
	if (!listNode) {
		session.proposal = undefined;
		return;
	}
	const target = descriptor(
		listNode,
		session.options.list,
		"data-sortable-list",
	);
	let proposal = {
		source: session.source,
		target,
		listNode,
		listId: listId(listNode, session.options),
		...sortPlacement(listNode, event.clientX, event.clientY, session),
		event,
	};
	if (!accepts(listNode, session.source, session.options, proposal, session)) {
		session.proposal = undefined;
		return;
	}
	const custom = session.options.preview?.(proposal, state(session, event));
	if (custom === false) {
		session.proposal = undefined;
		return;
	}
	proposal = resolvePreview(proposal, custom);
	if (!proposal.listNode) {
		session.proposal = undefined;
		return;
	}
	placement.apply(
		session.placeholder,
		proposal.listNode,
		proposal.index,
		session,
	);
	session.proposal = placeholderProposal(session, proposal);
}

function finishSort(session, event) {
	const current = session.proposal;
	if (!current) {
		clearSortSession(session);
		session.options.onCancel?.(state(session, event));
		return;
	}
	if (session.options.drop) {
		clearSortSession(session);
		session.options.drop(current, state(session, event));
	} else {
		placement.apply(
			session.sourceNode,
			current.listNode,
			current.index,
			session,
		);
		clearSortSession(session);
	}
	session.options.onDrop?.(state(session, event));
}

function clearSortSession(session) {
	session.placeholder?.remove();
	session.preview?.remove();
	session.sourceNode.classList.remove(session.options.sourceClass);
	session.sourceNode.classList.remove(session.options.sourceHiddenClass);
}

function sortPlacement(listNode, x, y, session) {
	const items = placement.measure(listNode, session);
	if (items.length === 0) return { index: 0, row: 0, col: 0 };
	return axis(listNode, session.options) === "y"
		? placement.linear(items, x, y, session)
		: placement.grid(items, x, y, session);
}

function placeholderProposal(session, proposal) {
	const listNode = session.placeholder.parentNode;
	let index = 0;
	for (const node of listNode.children) {
		if (node === session.sourceNode) continue;
		if (node === session.placeholder) {
			return {
				...proposal,
				listNode,
				listId: listId(listNode, session.options),
				index,
			};
		}
		if (matches(node, session.options.item)) index += 1;
	}
	return {
		...proposal,
		listNode,
		listId: listId(listNode, session.options),
		index,
	};
}

function createPlaceholder(sourceNode, options) {
	if (!options.placeholder)
		return globalThis.document.createComment("sortable-placeholder");
	const placeholder = sourceNode.cloneNode(true);
	placeholder.classList.add(options.placeholderClass);
	placeholder.classList.remove(options.sourceClass);
	placeholder.classList.remove(options.sourceHiddenClass);
	placeholder.removeAttribute("data-index");
	placeholder.removeAttribute(
		attributeName(options.item, "data-sortable-item"),
	);
	placeholder.style.pointerEvents = "none";
	return placeholder;
}

function sortIndex(node, listNode, options) {
	const value = node.getAttribute("data-index");
	if (value !== null) return parseInt(value, 10);
	let index = 0;
	for (const child of listNode.children) {
		if (child === node) return index;
		if (matches(child, options.item)) index += 1;
	}
	return 0;
}

function listId(node, options) {
	return (
		node.getAttribute(attributeName(options.list, "data-sortable-list")) ??
		undefined
	);
}

function axis(node, options) {
	return node.getAttribute(options.axis) ?? node.dataset.axis ?? "y";
}

function updatePointer(session, x, y) {
	session.pointer.dx = x - session.pointer.x;
	session.pointer.dy = y - session.pointer.y;
	session.pointer.x = x;
	session.pointer.y = y;
}

function updateDragPreview(session, event) {
	if (!session.preview) return;
	session.preview.style.left = `${event.clientX - session.box.width * session.rx}px`;
	session.preview.style.top = `${event.clientY - session.box.height * session.ry}px`;
}

function state(session, event) {
	return {
		source: session.source,
		target: session.target,
		proposal: session.proposal,
		placeholder: session.placeholder,
		preview: session.preview,
		effectPreview: session.effectPreview,
		pointer: session.pointer,
		box: session.box,
		grab: { x: session.ox, y: session.oy },
		event,
	};
}

function find(node, selector) {
	return target(node, (_) => matches(_, selector));
}

function matches(node, selector) {
	return typeof selector === "function"
		? selector(node)
		: node.matches(selector);
}

function attributeName(selector, fallback) {
	return typeof selector === "string" && /^\[[^=\]]+\]$/.test(selector)
		? selector.slice(1, -1)
		: fallback;
}

draggable.target = draggabletarget;
sort.target = sorttarget;

export { draggable, draggabletarget, droptarget, sort, sorttarget };
export default draggable;

// EOF
