// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-07-15

// Module: select/utils/dom
// DOM helpers for node inspection, attribute updates, text updates, and
// insertion/removal operations.

import { logger } from "./logger.js";

const log = logger("ui.dom");

// Function: isNode
// Returns true when `value` exposes a DOM `nodeType`.
function isNode(value) {
	return value?.nodeType !== undefined;
}

// Function: isContainer
// Returns true when `node` can contain child nodes: an element, document, or
// document fragment.
function isContainer(node) {
	switch (node?.nodeType) {
		case Node.ELEMENT_NODE:
		case Node.DOCUMENT_NODE:
		case Node.DOCUMENT_FRAGMENT_NODE:
			return true;
		default:
			return false;
	}
}
// Function: isInputNode
// Returns true when `node` is an input, textarea, select, or details element.
function isInputNode(node) {
	switch (node?.nodeName) {
		case "INPUT":
		case "TEXTAREA":
		case "SELECT":
		case "DETAILS":
		case "input":
		case "textarea":
		case "select":
		case "details":
			return true;
		default:
			return false;
	}
}

// Function: isEmpty
// Returns true for whitespace-only text nodes and empty document fragments.
// Elements, documents, comments, and unsupported node types are not empty.
function isEmpty(node) {
	switch (node?.nodeType) {
		case Node.TEXT_NODE:
			return /^\s*$/.test(node.data);
		case Node.DOCUMENT_FRAGMENT_NODE:
			return node.childNodes.length === 0;
		case Node.ELEMENT_NODE:
		case Node.DOCUMENT_NODE:
		case Node.COMMENT_NODE:
			return false;
		default:
			return false;
	}
}

// Function: strip
// Removes empty nodes from the beginning and end of the mutable `nodes` array
// and returns that same array.
function strip(nodes) {
	while (nodes.length && isEmpty(nodes[0])) {
		nodes.splice(0, 1);
	}
	while (nodes.length && isEmpty(nodes.at(-1))) {
		nodes.pop();
	}
	return nodes;
}
// Function: path
// Returns the list of child-node indices from `parent` to `node`. If `node` is
// not a descendant of `parent`, returns `undefined`. When `path` is provided,
// the computed indices are appended to it without modifying the original.
function path(node, parent, path) {
	const res = [];
	while (node && node !== parent) {
		if (!node.parentNode) {
			return undefined;
		}
		res.splice(
			0,
			0,
			Array.prototype.indexOf.call(node.parentNode.childNodes, node),
		);
		node = node.parentNode;
	}
	if (node !== parent) {
		return undefined;
	}
	return path ? path.concat(res) : res;
}

// Function: attr
// Sets, removes, or updates `name` on `node` and returns `node`.
// - `value`: Attribute value. `null`, `undefined`, and `false` remove the
//   attribute; objects are serialized, except object-valued styles, which are
//   assigned to `node.style`.
// - `append`: When negative, appends the new value after the existing value;
//   when positive, places it before the existing value.
// - `ns`: Optional namespace URI for namespaced attributes.
// - `force`: Forces input `value` assignment even when unchanged.
function attr(node, name, value, append = 0, ns = undefined, force = false) {
	const t = typeof value;
	if (!ns && name.startsWith("on")) {
		const n = name.toLowerCase();
		if (node[n] !== undefined) {
			// We have a callback
			node[n] = value;
		}
		return node;
	}
	if (!ns && name === "style" && t === "object") {
		// We manage style properties by value
		if (!append) {
			node.setAttribute("style", "");
		}
		Object.assign(node.style, value);
	} else if (!ns && name === "value" && node.value !== undefined) {
		const w = value === undefined || value === null ? "" : `${value}`;
		if (force || w !== node.value) {
			node.value = w;
		}
	} else if (!ns && name.startsWith("on") && node[name] !== undefined) {
		// We have a callback
		node[name] = value;
		// FIXME: We may change: undefined is remove, null is blank?
	} else if (value === undefined || value === null || value === false) {
		// We remove the attribute
		ns ? node.removeAttributeNS(ns, name) : node.removeAttribute(name);
	} else {
		// We have a regular value that we stringify
		const v =
			value === true
				? "true"
				: t === "number"
					? `${value}`
					: t === "string"
						? value
						: JSON.stringify(value);
		const e = ns ? node.getAttributeNS(ns, name) : node.getAttribute(name);
		if (append) {
			// If we append, we create an intermediate value.
			const w = `${append < 0 && e ? `${e} ` : ""}${v}${
				append > 0 && e ? ` ${e}` : ""
			}`;
			ns ? node.setAttributeNS(ns, name, w) : node.setAttribute(name, w);
		} else if (e !== v) {
			// We don't set the same attribute twice
			ns ? node.setAttributeNS(ns, name, v) : node.setAttribute(name, v);
		}
	}
	return node;
}

// Function: before
// Inserts `node` before `next`. If `next` is detached, logs an error and
// leaves `node` unchanged.
function before(next, node) {
	if (!next.parentNode) {
		log.error("Can't mount node as no parent", { next, node });
	}
	next.parentNode?.insertBefore(node, next);
	return node;
}

// Function: append
// Inserts `node` after `previous`, at the beginning of `parent` when
// `previous` is null, or at the end of `parent` when it is omitted.
function append(parent, node, previous = undefined) {
	if (previous) {
		return after(previous, node);
	} else if (previous === null) {
		if (parent.childNodes.length) {
			parent.insertBefore(node, parent.childNodes[0]);
			return node;
		} else {
			return mount(parent, node);
		}
	} else {
		return mount(parent, node);
	}
}

// Function: after
// Inserts `node` immediately after `previous` when `previous` is attached.
function after(previous, node) {
	switch (previous.nextSibling) {
		case null:
		case undefined:
			previous.parentNode?.appendChild(node);
			return node;
		case node:
			return node;
		default:
			previous.parentNode?.insertBefore(node, previous.nextSibling);
			return node;
	}
}

// Function: mount
// Attaches `node` to `parent`, or inserts it after `previous` when supplied.
// Arrays are mounted in order; an empty array is returned unchanged.
function mount(parent, node, previous) {
	if (previous) {
		return after(previous, node);
	}
	switch (parent.nodeType) {
		case Node.ELEMENT_NODE:
		case Node.DOCUMENT_NODE:
		case Node.DOCUMENT_FRAGMENT_NODE:
			if (Array.isArray(node)) {
				if (node.length === 0) {
					return node;
				}
				let n = node[0];
				n.parentNode !== parent && parent.appendChild(n);
				for (let i = 1; i < node.length; i++) {
					after(n, node[i]);
					n = node[i];
				}
			} else {
				node.parentNode !== parent && parent.appendChild(node);
			}
			break;
		default:
			// NOTE: If we use after, this will invert the order. When
			// comment is used as an anchor, it will indicate the
			// end, not the start.
			before(parent, node);
	}
	return node;
}

// Function: unmount
// Removes `node`, or every node in an array, from its parent and returns the
// original value.
function unmount(node) {
	if (node === null || node === undefined) {
		return node;
	} else if (Array.isArray(node)) {
		for (const n of node) {
			n.parentNode?.removeChild(n);
		}
	} else {
		node.parentNode?.removeChild(node);
	}
	return node;
}

// Function: replace
// Replaces `previous` with `node`. Array values are replaced at the position of
// their first node and then fully unmounted. Empty arrays are left unchanged.
function replace(previous, node) {
	if (node === null || node === undefined) {
		return node;
	} else if (Array.isArray(previous)) {
		if (previous.length === 0) {
			return node;
		}
		previous[0].parentNode?.insertBefore(node, previous[0]);
		unmount(previous);
	} else {
		previous.parentNode?.replaceChild(node, previous);
	}
	return node;
}

// Function: unwrap
// Returns the only element-like child of `node` when all other children are
// empty text nodes. Otherwise returns `node`.
function unwrap(node) {
	let element;
	for (const child of node.childNodes) {
		switch (child.nodeType) {
			case Node.ELEMENT_NODE:
			case Node.DOCUMENT_NODE:
			case Node.DOCUMENT_FRAGMENT_NODE:
				if (element) {
					return node;
				} else {
					element = child;
				}
				break;
			case Node.TEXT_NODE:
				if (child.data) {
					return node;
				}
		}
	}
	return element || node;
}

// Function: text
// Updates the text content of `node` and returns it. Input values are updated
// through their `value` property while preserving the selection when possible.
function text(node, text) {
	switch (node?.nodeType) {
		case Node.TEXT_NODE:
			if (node.data !== text) {
				node.data = text;
			}
			break;
		case Node.ELEMENT_NODE:
		case Node.DOCUMENT_NODE:
		case Node.DOCUMENT_FRAGMENT_NODE:
			if (isInputNode(node)) {
				if (node.value !== text) {
					// We preserve the selection on an input.
					const { selectionStart, selectionEnd } = node;
					node.value = text;
					if (selectionStart !== null && selectionEnd !== null) {
						node.setSelectionRange(selectionStart, selectionEnd);
					}
				}
			} else {
				if (node.textContent !== text) {
					node.textContent = text;
				}
			}
			break;
	}
	return node;
}
// Function: attached
// Returns a callback that restores `node` to its original parent and relative
// position. With `affinity < 1`, it favors the original start position; with
// `affinity >= 1`, it favors the original end position.
function attached(node, affinity = -1) {
	const parent = node.parentNode;
	const prev = node.previousSibling;
	const next = node.nextSibling;

	return () =>
		parent?.insertBefore(
			node,
			affinity < 1
				? prev?.parentNode === parent
					? prev.nextSibling
					: parent.firstChild
				: next?.parentNode === parent
					? next
					: null,
		);
}

// Function: swap
// Replaces `target` with `node` and returns `node`.
function swap(target, node) {
	target.replaceWith(node);
	return node;
}

// Function: swapped
// Replaces `target` with `node` and returns a callback that restores both nodes
// to their original positions.
function swapped(target, node) {
	const restoreNode = attached(node);
	const restoreTarget = attached(target);

	target.replaceWith(node);

	return () => (restoreTarget(), restoreNode());
}

export { isInputNode, swap, attached, swapped };
export default {
	isNode,
	isContainer,
	isInputNode,
	isEmpty,
	strip,
	path,
	attr,
	before,
	append,
	after,
	mount,
	unmount,
	replace,
	unwrap,
	text,
	swap,
	attached,
	swapped,
};
// EOF
