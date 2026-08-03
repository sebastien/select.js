// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-07-11

// Module: select/features/interaction/draggable
// Mouse drag, drop, and sort interaction helpers. Draggable interactions use
// nested source and target descriptors; <sort> moves the source item.

import { attributeTarget, target } from "./core.js";
import drag from "./drag.js";
import placement from "./placement.js";

// Function: draggabletarget
// Walks up from `node` to find a draggable source, optionally matching `name`.
function draggabletarget(node, name) {
	return attributeTarget(node, "data-draggable", name);
}

// Function: droptarget
// Walks up from `node` to find a drop target, optionally matching `name`.
function droptarget(node, name) {
	return attributeTarget(node, "data-drop-target", name);
}

// Function: draggable
// Starts a generic drag/drop interaction using nested `source` and `target`
// descriptors.
function draggable(event, options = {}) {
	const settings = draggable.options(options);
	const sourceNode =
		settings.source.node ?? find(event.target, settings.source.match);
	if (!sourceNode || sourceNode.nodeType !== Node.ELEMENT_NODE)
		return undefined;
	event.preventDefault();
	const session = createSession(sourceNode, event, settings, "drop");
	session.source = descriptor(
		sourceNode,
		settings.source.match,
		"data-draggable",
	);
	startSource(session, event);
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

draggable.options = (options) => ({
	source: {
		match: options.source?.match ?? "[data-draggable]",
		node: options.source?.node,
		action: sourceAction(options.source?.action ?? "copy"),
		preview: options.source?.preview,
		unpreview: options.source?.unpreview,
	},
	target: {
		match: options.target?.match ?? "[data-drop-target]",
		action: targetAction(options.target?.action ?? "append"),
		preview: options.target?.preview,
		unpreview: options.target?.unpreview,
	},
	overlay: options.overlay ?? globalThis.document.body,
	sourceClass: options.sourceClass ?? "is-dragging-source",
	previewClass: options.previewClass ?? "draggable-preview",
	effectPreviewClass: options.effectPreviewClass ?? "draggable-drop-preview",
	hoverClass: options.hoverClass ?? "is-drag-hover",
	dropClass: options.dropClass ?? "is-drag-drop",
	accept: options.accept,
	drop: options.drop,
	onMove: options.onMove,
	onDrop: options.onDrop,
	onCancel: options.onCancel,
});

function sourceAction(action) {
	if (action === "move") return "remove-drag";
	if (["copy", "remove-drag", "remove-drop"].includes(action)) return action;
	throw new Error(
		`Unknown draggable source action "${action}". Available actions: copy, move, remove-drag, remove-drop.`,
	);
}

function targetAction(action) {
	if (["append", "prepend", "replace", "content"].includes(action)) {
		return action;
	}
	throw new Error(
		`Unknown draggable target action "${action}". Available actions: append, prepend, replace, content.`,
	);
}

function createSession(sourceNode, event, options, mode) {
	const box = sourceNode.getBoundingClientRect();
	const ox = event.clientX - box.left;
	const oy = event.clientY - box.top;
	sourceNode.classList.add(options.sourceClass);
	return {
		mode,
		options,
		sourceNode,
		preview: undefined,
		previewEvent: event,
		box,
		ox,
		oy,
		rx: ox / Math.max(1, box.width),
		ry: oy / Math.max(1, box.height),
		pointer: { x: event.clientX, y: event.clientY, dx: 0, dy: 0 },
		proposal: undefined,
		target: undefined,
		targetPreview: undefined,
		targetPreviewCleanup: undefined,
		targetPreviewTarget: undefined,
		targetPreviewEvent: undefined,
		targetPreviewRestore: undefined,
		targetContentRestore: undefined,
		sourceRemoved: false,
		sourceParent: sourceNode.parentNode,
		sourceNext: sourceNode.nextSibling,
	};
}

function startSource(session, event) {
	const config = session.options.source;
	const preview = config.preview?.(
		event,
		state(session, event),
		session.preview,
	);
	if (preview !== undefined) session.preview = preview;
	if (!session.preview) {
		session.preview = session.sourceNode.cloneNode(true);
		session.preview.classList.add(session.options.previewClass);
	}
	if (session.preview) {
		session.preview.style.position = "fixed";
		session.preview.style.left = "0px";
		session.preview.style.top = "0px";
		session.preview.style.width = `${session.box.width}px`;
		session.preview.style.height = `${session.box.height}px`;
		session.preview.style.pointerEvents = "none";
		session.options.overlay?.appendChild(session.preview);
	}
	if (config.action === "remove-drag") {
		session.sourceNode.remove();
		session.sourceRemoved = true;
	}
	updateDragPreview(session, event);
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
	const hit = globalThis.document.elementFromPoint(
		event.clientX,
		event.clientY,
	);
	if (
		session.targetPreview &&
		(hit === session.targetPreview || session.targetPreview.contains(hit))
	) {
		return;
	}
	const targetNode = find(hit, session.options.target.match);
	if (!targetNode) {
		clearTargetPreview(session);
		setHoverTarget(session, undefined);
		session.proposal = undefined;
		session.target = undefined;
		return;
	}
	const targetDescriptor = descriptor(
		targetNode,
		session.options.target.match,
		"data-drop-target",
	);
	const proposal = { source: session.source, target: targetDescriptor, event };
	if (
		!accepts(targetNode, session.source, session.options, proposal, session)
	) {
		clearTargetPreview(session);
		setHoverTarget(session, undefined);
		session.proposal = undefined;
		session.target = undefined;
		return;
	}
	if (session.target?.node !== targetNode) clearTargetPreview(session);
	session.proposal = proposal;
	session.target = targetDescriptor;
	setHoverTarget(session, targetNode);
	if (session.targetPreviewTarget !== targetNode) {
		createTargetPreview(session, proposal, event);
	}
}

function createTargetPreview(session, proposal, event) {
	const config = session.options.target;
	const preview = config.preview?.(
		event,
		state(session, event),
		session.targetPreview,
	);
	if (preview !== undefined) session.targetPreview = preview;
	let node = session.targetPreview;
	if (!node) {
		node = session.sourceNode.cloneNode(true);
		node.classList.add(session.options.effectPreviewClass);
	}
	if (!node?.nodeType) return;
	session.targetPreview = node;
	session.targetPreviewTarget = proposal.target.node;
	session.targetPreviewEvent = event;
	if (config.action === "replace") {
		const target = proposal.target.node;
		const parent = target.parentNode;
		if (parent) {
			const slot = target.getAttribute("slot");
			if (slot !== null && node.setAttribute) node.setAttribute("slot", slot);
			const next = target.nextSibling;
			parent.replaceChild(node, target);
			session.targetPreviewRestore = () => {
				if (node.parentNode) node.parentNode.replaceChild(target, node);
				else if (parent) parent.insertBefore(target, next);
			};
		}
	} else if (config.action === "content") {
		const target = proposal.target.node;
		const children = [...target.childNodes];
		target.replaceChildren(node);
		session.targetContentRestore = () => target.replaceChildren(...children);
	} else if (config.action === "prepend") {
		proposal.target.node.prepend(node);
	} else {
		proposal.target.node.append(node);
	}
}

function setHoverTarget(session, targetNode) {
	if (session.hoverTarget === targetNode) return;
	session.hoverTarget?.classList.remove(session.options.hoverClass);
	session.hoverTarget = targetNode;
	session.hoverTarget?.classList.add(session.options.hoverClass);
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
		setHoverTarget(session, undefined);
		clearSession(session);
		session.options.onCancel?.(state(session, event));
		return;
	}
	setHoverTarget(session, undefined);
	if (session.options.dropClass) {
		const committedTarget =
			session.options.target.action === "replace"
				? session.targetPreview
				: current.target.node;
		committedTarget?.classList.add(session.options.dropClass);
	}
	if (session.options.drop) {
		clearTargetPreview(session);
		session.options.drop(current, state(session, event));
	}
	if (session.options.source.action === "remove-drop")
		session.sourceNode.remove();
	clearSession(session, true);
	session.options.onDrop?.(state(session, event));
}

function clearTargetPreview(session, committed = false) {
	if (!session.targetPreview) return;
	if (!committed) {
		session.targetPreviewCleanup?.(session.targetPreview);
		session.options.target.unpreview?.(
			session.targetPreviewEvent,
			state(session),
			session.targetPreview,
		);
		session.targetPreviewRestore?.();
		session.targetContentRestore?.();
		if (session.targetPreview.parentNode) session.targetPreview.remove();
	}
	session.targetPreview = undefined;
	session.targetPreviewCleanup = undefined;
	session.targetPreviewTarget = undefined;
	session.targetPreviewEvent = undefined;
	session.targetPreviewRestore = undefined;
	session.targetContentRestore = undefined;
}

function clearSession(session, committed = false) {
	clearTargetPreview(session, committed);
	setHoverTarget(session, undefined);
	if (session.preview) {
		session.options.source.unpreview?.(
			session.previewEvent,
			state(session),
			session.preview,
		);
		session.preview.remove();
	}
	if (!committed && session.sourceRemoved) {
		const parent = session.sourceParent;
		if (parent)
			parent.insertBefore(
				session.sourceNode,
				session.sourceNext?.parentNode === parent ? session.sourceNext : null,
			);
	}
	session.sourceNode.classList.remove(session.options.sourceClass);
}

// Function: sorttarget
// Walks up from `node` to find a sortable item, optionally matching `name`.
function sorttarget(node, name) {
	return attributeTarget(node, "data-sortable-item", name);
}

function copyCanvases(source, target) {
	const sources = source.querySelectorAll("canvas");
	const targets = target.querySelectorAll("canvas");
	for (let i = 0; i < sources.length && i < targets.length; i += 1) {
		const from = sources[i];
		const to = targets[i];
		if (to.width !== from.width || to.height !== from.height) {
			to.width = from.width;
			to.height = from.height;
		}
		to.getContext("2d")?.drawImage(from, 0, 0);
	}
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
	let session;
	return drag(
		event,
		(ev) => {
			if (!session) {
				ev.preventDefault();
				session = createSession(sourceNode, event, settings, "sort");
				const index = sortIndex(sourceNode, sourceList, settings);
				session.source = {
					...descriptor(sourceNode, settings.item, "data-sortable-item"),
					listNode: sourceList,
					listId: listId(sourceList, settings),
					index,
				};
				session.placeholder = createPlaceholder(sourceNode, settings);
				copyCanvases(sourceNode, session.placeholder);
				sourceList.insertBefore(session.placeholder, sourceNode);
				sourceNode.classList.add(settings.sourceHiddenClass);
				startSortPreview(session, event);
			}
			updateSort(session, ev);
			updateDragPreview(session, ev);
			settings.onMove?.(state(session, ev));
		},
		(ev) => session && finishSort(session, ev),
		null,
		settings.threshold,
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
		threshold: options.threshold ?? 0,
	};
}

function draggableOptions(options) {
	return {
		overlay: options.overlay ?? globalThis.document.body,
		dragPreview: options.dragPreview !== false,
		sourceClass: options.sourceClass ?? "is-dragging-source",
		previewClass: options.previewClass ?? "draggable-preview",
		effectPreviewClass: options.effectPreviewClass ?? "draggable-drop-preview",
		hoverClass: options.hoverClass ?? "is-drag-hover",
		dropClass: options.dropClass ?? "is-drag-drop",
		accept: options.accept,
		dropPreview: options.dropPreview ?? options.preview,
		drop: options.drop,
		onMove: options.onMove,
		onDrop: options.onDrop,
		onCancel: options.onCancel,
	};
}

function startSortPreview(session, _event) {
	if (!session.options.dragPreview) return;
	session.preview = session.sourceNode.cloneNode(true);
	copyCanvases(session.sourceNode, session.preview);
	session.preview.classList.remove(session.options.sourceHiddenClass);
	session.preview.classList.add(session.options.previewClass);
	session.preview.classList.add("sh-2");
	session.preview.style.position = "fixed";
	session.preview.style.boxSizing = "border-box";
	session.preview.style.width = `${session.box.width}px`;
	session.preview.style.height = `${session.box.height}px`;
	session.preview.style.pointerEvents = "none";
	session.options.overlay?.appendChild(session.preview);
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
	const custom = session.options.dropPreview?.(proposal, state(session, event));
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
		dragPreview: session.preview,
		effectPreview: session.targetPreview,
		targetPreview: session.targetPreview,
		dropPreview: session.targetPreview,
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
	if (Array.isArray(selector)) {
		for (const item of selector) {
			if (matches(node, item)) return true;
		}
		return false;
	}
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
