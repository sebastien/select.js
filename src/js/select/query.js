// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2021-04-06

// Module: select
// A jQuery-like library for DOM and SVG manipulation targeting modern browsers.
// Provides a thin wrapper around HTML5 DOM & SVG APIs with strict CSS3 selector
// queries.
//
// The `Selection` class extends `Array` and provides chainable methods for
// traversal, manipulation, and event handling. Use `select()` to create
// selections.
//
// Example:
// ```javascript
// import { select, $ } from "./select.js"
// const items = $(".item").addClass("active").on("click", handler)
// ```

// TODO: Add a "virtual" mode so that all the changes are made virtually,
//       then pooled, then applied.
// TODO: Add flyweight pattern in order to recycle selection and not put too
// much strain on GC.
// TODO: Updated documentation so that Node -> Element where relevant
// FIXME: Should have a clear strategy on selecting text and nodes, especially
// FIXME: Test length of arguments instead of typeof
// FIXME: the $.selector property is not working properly

// ----------------------------------------------------------------------------
//
// SECTION: Core Functions
//
// ----------------------------------------------------------------------------
// ============================================================================
// SUBSECTION: Selection Helpers
// ============================================================================

// Constant: _match
// Internal browser capability detection for element matching.
// Maps to `1` for standard `matches`, `2` for moz, `3` for webkit, or `null`.

const _match = Element.prototype.matches
	? 1
	: Element.prototype.mozMatchesSelector
		? 2
		: Element.prototype.webkitMatchesSelector
			? 3
			: null;

const logSelect = (level, scope, message, details = {}) => {
	console[level](`[select] ${scope}: ${message}, details`, details);
};

// Function: match
// Tests if `node` matches the given CSS `selector`. Uses native browser
// methods when available with fallback to manual parent query.
//
// Parameters:
// - `selector`: string - CSS selector to test
// - `node`: Node - element to test against
//
// Returns: boolean - true if node matches selector

const match = _match
	? (selector, node) => {
			let index;
			// NOTE: This is where we support the jQuery-like suffixes
			if (selector.startsWith(":first")) {
				selector = selector.substring(0, selector.length - 6);
				index = 0;
			}
			if (index === undefined) {
				try {
					switch (_match) {
						case 1:
							return node?.matches?.(selector);
						case 2:
							return node?.mozMatchesSelector?.(selector);
						case 3:
							return node?.webkitMatchesSelector?.(selector);
						default:
							logSelect("error", "match", "browser not supported", {
								selector,
								node,
								match: _match,
							});
							select.STATUS = "FAILED";
							return node.matches(selector);
					}
				} catch (e) {
					// NOTE: When entering a bad selector, we might get an error that we propagate here.
					logSelect("error", "match", "exception occurred with selector", {
						selector,
						node,
						error: e,
					});
					return null;
				}
			} else {
				const matches = query(selector, undefined, index);
				return matches[index] === node;
			}
		}
	: (selector, node) => {
			if (selector.endsWith(":first")) {
				return query(selector, node) === node;
			} else {
				// NOTE: This is an implementation of `matchSelector` replacing one that
				// would not be already available.
				const parent = node.parentNode;
				if (parent) {
					const matching = parent.querySelectorAll(selector);
					for (let i = 0; i < matching.length; i++) {
						if (matching[i] === node) {
							return true;
						}
					}
				}
				return false;
			}
		};

// Function: query
// Queries all descendants of `scope` matching `selector`. Wraps
// `querySelectorAll` with support for direct child selectors (`>`) and
// `:first` pseudo-class.
//
// Parameters:
// - `selector`: string - CSS selector to query
// - `scope`: Node? - root element for query (defaults to document)
// - `limit`: number? - maximum results to return
//
// Returns: Array<Element> - matching element nodes

// TODO: Implement the `limit` to optimize
const query = (selector, scope, _limit) => {
	selector = selector.trim();
	if (!selector || selector.length === 0) {
		return [scope];
	} else if (selector[0] === ">") {
		selector = selector.substr(1).trim();
		const i = Math.min(
			Math.max(selector.indexOf(">"), 0),
			Math.max(selector.indexOf(" "), 0),
		);
		const selector_node = i > 0 ? selector.substring(0, i) : selector;
		const selector_child =
			i > 0 ? selector.substring(i, selector.length) : null;
		const matching = [];
		const nodes = (scope || document).childNodes;
		let result = null;
		for (let j = 0; j < nodes.length; j++) {
			const n = nodes[j];
			if (match(selector_node, n) && n.nodeType === Node.ELEMENT_NODE) {
				matching.push(n);
			}
		}
		if (selector_child) {
			result = [];
			for (let j = 0; j < matching.length; j++) {
				result = result.concat(select.query(selector_child, matching[j]));
			}
		} else {
			result = matching;
		}
		return result;
	} else {
		// NOTE: This is where we support the jQuery-like suffixes
		let index;
		if (selector.endsWith(":first")) {
			selector = selector.substring(0, selector.length - 6);
			index = 0;
		}
		const result = [];
		// TODO: Intercept exception?
		const nodes = (scope || document).querySelectorAll(selector);
		let count = 0;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node.nodeType === Node.ELEMENT_NODE) {
				if (index === undefined) {
					result.push(node);
					count += 1;
				} else if (index === count) {
					result.push(node);
					break;
				} else {
					count += 1;
				}
			}
		}
		return result;
	}
};

// Function: filter
// Filters `nodes` array to only include elements matching `selector`.
//
// Parameters:
// - `selector`: string - CSS selector to filter by
// - `nodes`: Array<Node> - nodes to filter
//
// Returns: Array<Node> - subset of nodes matching selector

const filter = (selector, nodes) => {
	const result = [];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (match(selector, node)) {
			result.push(node);
		}
	}
	return result;
};

// ----------------------------------------------------------------------------
//
// SECTION: Selection Class
//
// ----------------------------------------------------------------------------
// ============================================================================
// SUBSECTION: Constructor
// ============================================================================

// Class: Selection
// An array-like collection of DOM/SVG elements with chainable manipulation
// methods. Extends native `Array`.
//
// Attributes:
// - `selector`: string|undefined - original selector used to create selection
// - `scope`: Node|Selection|undefined - scope used for the selection
// - `isSelection`: boolean - always true, for type checking
// - `length`: number - number of elements in selection (inherited from Array)
//
// Example:
// ```javascript
// const sel = new Selection(".items", document.body)
// sel.addClass("highlight").text("Updated")
// ```

class Selection extends Array {
	constructor(selector, scope) {
		super();
		let nodes = null;
		if (typeof selector === "string") {
			if (!scope) {
				nodes = query(selector);
			} else {
				scope = select(scope);
				nodes = scope.find(selector);
			}
		} else if (Selection.Is(selector)) {
			nodes = selector;
			scope = selector.scope;
			selector = selector.selector;
			if (selector.scope && scope !== selector.scope) {
				logSelect(
					"error",
					"Selection.new",
					"given scope differs from first argument's",
					{ scope, selectorScope: selector.scope },
				);
			}
		} else if (selector) {
			nodes = Selection.AsElementList(selector);
		}

		this.selector = selector;
		this.scope = scope;
		this.isSelection = true;
		this.expand(nodes);
	}

	// ============================================================================
	// SUBSECTION: Static Predicates
	// ============================================================================

	// Tests if `s` is a Selection instance by checking for class marker.
	static Is(s) {
		return s && s.__class__ === Selection;
	}

	// Tests if `s` is a list-like object (Selection, Array, or NodeList).
	static IsList(s) {
		return s instanceof Selection || Array.isArray(s) || s instanceof NodeList;
	}

	// Tests if `node` is an element node (DOM or SVG).
	static IsElement(node) {
		return (
			node &&
			typeof node.nodeType !== "undefined" &&
			node.nodeType === Node.ELEMENT_NODE
		);
	}

	// Tests if `node` is a text node.
	static IsText(node) {
		return (
			node &&
			typeof node.nodeType !== "undefined" &&
			node.nodeType === Node.TEXT_NODE
		);
	}

	// Tests if `node` is any DOM/SVG node (including document, window).
	static IsNode(node) {
		return node && typeof node.nodeType !== "undefined";
	}

	// Tests if `node` is a DOM element (not SVG).
	static IsDOM(node) {
		return node && typeof node.getBBox === "undefined";
	}

	// Tests if `node` is an SVG element.
	// SEE: http://www.w3.org/TR/SVG11/types.html#__svg__SVGLocatable__getBBox
	static IsSVG(node) {
		return typeof node.getBBox !== "undefined";
	}

	// Tests if `value` is a Selection instance.
	static IsSelection(value) {
		return value instanceof Selection;
	}

	// Converts `value` to an array of element nodes. Handles single nodes,
	// NodeLists, Arrays, and DocumentFragments.
	static AsElementList(value) {
		if (!value) {
			return value;
		} else if (value.nodeType === Node.ELEMENT_NODE) {
			return [value];
		} else if (
			value.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
			value.nodeType === Node.DOCUMENT_NODE
		) {
			const res = [];
			let child = value.firstElementChild;
			while (child) {
				res.push(child);
				child = child.nextSibling;
			}
			return res;
		} else if (value === window) {
			return Selection.AsElementList(window.document);
		} else if (Selection.IsList(value)) {
			// FIXME: Should recurse
			let res = [];
			for (let i = 0; i < value.length; i++) {
				res = res.concat(Selection.AsElementList(value[i]));
			}
			return res;
		} else {
			return [];
		}
	}

	// Returns `node` if it's a Selection, otherwise creates a new Selection.
	static Ensure(node) {
		return Selection.Is(node) ? node : new Selection(node);
	}

	// ============================================================================
	// SUBSECTION: Selection & Filtering
	// ============================================================================

	// Finds all descendants matching `selector` within the current selection.
	// Returns a new Selection with the current selection as scope.
	find(selector) {
		if (this.length === 0) {
			return new Selection();
		}
		const nodes = [];
		// NOTE: We're dealing with NodeList, so no fancy reduce, etc
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			const q = query(selector, node);
			for (let j = 0; j < q.length; j++) {
				nodes.push(q[j]);
			}
		}
		return new Selection(nodes, this);
	}

	// Filters current selection to only include nodes matching `selector`.
	// Accepts CSS selector strings or predicate functions.
	filter(selector) {
		if (typeof selector === "string") {
			return new Selection(
				filter(selector, this),
				this.length > 0 ? this : undefined,
			);
		} else if (typeof selector === "function") {
			return new Selection(Array.prototype.filter.apply(this, [selector]));
		} else {
			logSelect(
				"error",
				"Selection.filter",
				"selector string or predicate expected",
				{ selector },
			);
			return None;
		}
	}

	// Iterates over elements, invoking `callback` with each element wrapped in
	// a Selection. Breaks if callback returns `false`.
	iterate(callback) {
		for (let i = 0; i < this.length; i++) {
			if (callback(new Selection(this[i]), i) === false) {
				break;
			}
		}
		return this;
	}

	// Alias for `is()`. Tests if all nodes match selector or equals given
	// node/selection.
	like(selector) {
		return this.is(selector);
	}

	// Tests if all nodes match `selector` (string) or equals given node/selection.
	is(selector) {
		if (typeof selector === "string") {
			let result = this.length > 0;
			for (let i = 0; i < this.length; i++) {
				if (!match(selector, this[i])) {
					result = false;
					break;
				}
			}
			return result;
		} else {
			return this.equals(selector);
		}
	}

	// Returns array of Selection instances, one for each node.
	list() {
		return this.map(Selection.Ensure);
	}

	// ============================================================================
	// SUBSECTION: Traversal
	// ============================================================================

	// Returns new Selection with only the first node.
	first() {
		return this.length <= 1 ? this : select([this[0]], this);
	}

	// Returns new Selection with only the last node.
	last() {
		return this.length <= 1 ? this : select([this[this.length - 1]], this);
	}

	// Returns new Selection with node at `index`. Supports negative indices.
	get(index) {
		index = index < 0 ? this.length + index : index;
		if (this.length === 1 && index === 0) {
			return this;
		} else {
			return 0 <= index && index < this.length
				? select([this[index]], this)
				: new Selection();
		}
	}

	// Alias for `get()`.
	eq(index) {
		return this.get(index);
	}

	// Returns next sibling elements. If `selector` provided, only matching siblings.
	next(selector) {
		const nodes = [];
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			const sibling = node.nextElementSibling;
			if (sibling && (!selector || match(selector, sibling))) {
				nodes.push(sibling);
			}
		}
		return nodes.length > 0 ? select(nodes, this) : new Selection();
	}

	// Returns previous sibling elements. If `selector` provided, only matching.
	prev(selector) {
		return this.previous(selector);
	}

	// Alias for `prev()`.
	previous(selector) {
		const nodes = [];
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			const sibling = node.previousElementSibling;
			if (sibling && (!selector || match(selector, sibling))) {
				nodes.push(sibling);
			}
		}
		return nodes.length > 0 ? select(nodes, this) : new Selection();
	}

	// Returns direct parent elements. If `selector` provided, only matching parents.
	parent(selector) {
		const nodes = [];
		for (let i = 0; i < this.length; i++) {
			const node = this[i].parentNode;
			if (node && (!selector || match(selector, node))) {
				nodes.push(node);
			}
		}
		return nodes.length > 0 ? select(nodes, this) : new Selection();
	}

	// Returns ancestor elements up to optional `limit` (number or node/selection).
	// If `selector` provided, only matching ancestors.
	ancestors(selector, limit) {
		return this.parents(selector, limit);
	}

	// Alias for `ancestors()`.
	parents(selector, limit) {
		const nodes = [];
		const depth_limit = typeof limit === "number" ? limit : -1;
		const node_limit =
			limit && typeof limit !== "number" ? select(limit) : null;
		const is_function = typeof selector === "function";
		const is_string = typeof selector === "string";
		if (is_string && selector.endsWith(":first")) {
			selector = selector.substring(0, selector.length - 6);
			const _index = 0;
		}
		for (let i = 0; i < this.length; i++) {
			let node = this[i].parentNode;
			while (node) {
				let matches = true;
				if (selector) {
					if (is_function) {
						matches = selector(node, i);
					} else if (is_string) {
						matches = match(selector, node);
					}
				}
				if (matches) {
					nodes.push(node);
					if (depth_limit >= 0 && nodes.length >= depth_limit) {
						// NOTE: We exit early on
						return select(nodes, this);
					}
				}
				node = node.parentNode;
				if (node_limit?.contains(node)) {
					node = null;
				}
			}
		}
		return nodes.length > 0 ? select(nodes, this) : new Selection();
	}

	// Returns child elements. If `selector` provided, only matching children.
	children(selector) {
		const nodes = [];
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			for (let j = 0; j < node.childNodes.length; j++) {
				const child = node.childNodes[j];
				if (
					Selection.IsElement(child) &&
					(!selector || match(selector, child))
				) {
					nodes.push(child);
				}
			}
		}
		return nodes.length > 0 ? select(nodes, this) : new Selection();
	}

	// Returns array of all child nodes (not just elements), optionally filtered
	// by `callback` which receives (child, index, parent).
	nodes(callback) {
		const nodes = [];
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			for (let j = 0; j < node.childNodes.length; j++) {
				const child = node.childNodes[j];
				if (!callback || callback(child, i, node) !== false) {
					nodes.push(child);
				} else {
					return nodes;
				}
			}
		}
		return nodes;
	}

	// Depth-first traversal invoking `callback` for each node (any node type).
	// Receives (node, count). Returns `this`. Breaks if callback returns `false`.
	walk(callback) {
		if (!callback) {
			return this;
		}
		const to_walk = [];
		let count = 0;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			to_walk.push(node);
			while (to_walk.length > 0) {
				const node = to_walk.pop();
				if (callback && callback(node, count++) === false) {
					return this;
				}
				for (let j = 0; j < node.childNodes.length; j++) {
					to_walk.push(node.childNodes[j]);
				}
			}
		}
		return this;
	}

	// ============================================================================
	// SUBSECTION: Content Manipulation
	// ============================================================================

	// Appends `value` to the first node. Handles Selections, Nodes, arrays,
	// strings (as text nodes), and numbers.
	append(value) {
		if (this.length === 0) {
			return this;
		}
		const node = this[0];
		if (Selection.Is(value)) {
			for (let i = 0; i < value.length; i++) {
				node.appendChild(value[i]);
			}
		} else if (value && typeof value.nodeType !== "undefined") {
			node.appendChild(value);
		} else if (Selection.IsList(value)) {
			for (let i = 0; i < value.length; i++) {
				this.append(value[i]);
			}
		} else if (typeof value === "string") {
			for (let i = 0; i < this.length; i++) {
				this[i].appendChild(document.createTextNode(value));
			}
		} else if (typeof value === "number") {
			for (let i = 0; i < this.length; i++) {
				this[i].appendChild(document.createTextNode(value));
			}
		} else if (value) {
			logSelect(
				"error",
				"Selection.append",
				"value is expected to be Number, String, Node, [Node] or Selection",
				{ value },
			);
		}
		return this;
	}

	// Prepends `value` to the first node. Same value handling as `append()`.
	prepend(value) {
		if (this.length === 0) {
			return this;
		}
		const node = this[0];
		const child = node.firstChild;
		if (!child) {
			return this.append(value);
		}
		if (Selection.Is(value)) {
			for (let i = 0; i < value.length; i++) {
				node.insertBefore(value[i], child);
			}
		} else if (value && typeof value.nodeType !== "undefined") {
			node.insertBefore(value, child);
		} else if (Selection.IsList(value)) {
			for (let i = 0; i < value.length; i++) {
				this.prepend(value[i]);
			}
		} else if (typeof value === "string") {
			for (let i = 0; i < this.length; i++) {
				this[i].insertBefore(document.createTextNode(value), child);
			}
		} else if (typeof value === "number") {
			for (let i = 0; i < this.length; i++) {
				this[i].insertBefore(document.createTextNode(value), child);
			}
		} else if (value) {
			logSelect(
				"error",
				"Selection.prepend",
				"value is expected to be Number, String, Node, [Node] or Selection",
				{ value },
			);
		}
		return this;
	}

	// Removes all nodes from their parents.
	remove() {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		}
		return this;
	}

	// Adds elements to this selection. Handles single nodes, NodeLists, arrays.
	extend(value) {
		if (Selection.IsNode(value)) {
			this.push(value);
		} else if (Selection.IsList(value)) {
			for (let i = 0; i < value.length; i++) {
				this.extend(value[i]);
			}
		} else {
			logSelect(
				"error",
				"Selection.extend",
				"value must be a node, selection or list",
				{ value },
			);
		}
		return this;
	}

	// Inserts `value` after the first node in selection.
	after(value) {
		if (this.length === 0) {
			return this;
		}
		const node = this[0];
		let scope = node;
		// NOTE: From an implementation standpoint, `after` is more complicated
		// than `before` as we don't have an `insertAfter` in the DOM.
		//
		// We get the next sibling. If scope is empty, then we'll need to add
		// a child to the parent
		while (scope && !Selection.IsElement(scope.nextSibling)) {
			scope = scope.nextSibling;
		}
		if (scope) {
			if (Selection.Is(value)) {
				for (let i = 0; i < value.length; i++) {
					scope.parentNode.insertBefore(value[i], scope);
				}
			} else if (typeof value.length !== "undefined") {
				for (let i = 0; i < value.length; i++) {
					scope.parentNode.insertBefore(value[i], scope);
				}
			} else if (typeof value.nodeType !== "undefined") {
				scope.parentNode.insertBefore(value, scope);
			} else {
				logSelect(
					"error",
					"Selection.after",
					"value is expected to be Node, [Node] or Selection",
					{ value },
				);
			}
		} else {
			// FIXME: Really not sure about that
			scope = node.parentNode;
			if (Selection.Is(value)) {
				for (let i = 0; i < value.length; i++) {
					scope.appendChild(value[i]);
				}
			} else if (typeof value.length !== "undefined") {
				for (let i = 0; i < value.length; i++) {
					scope.appendChild(value[i]);
				}
			} else if (typeof value.nodeType !== "undefined") {
				scope.appendChild(value);
			} else {
				logSelect(
					"error",
					"Selection.after",
					"value is expected to be Node, [Node] or Selection",
					{ value },
				);
			}
		}
		return this;
	}

	// Inserts `value` before the first node in selection.
	before(value) {
		if (this.length === 0) {
			return this;
		}
		const node = this[0];
		const scope = node;
		const parent = scope.parentNode;
		if (Selection.Is(value)) {
			for (let i = 0; i < value.length; i++) {
				parent.insertBefore(value[i], scope);
			}
		} else if (typeof value.length !== "undefined") {
			for (let i = 0; i < value.length; i++) {
				parent.insertBefore(value[i], scope);
			}
		} else if (typeof value.nodeType !== "undefined") {
			parent.insertBefore(value, scope);
		} else {
			logSelect(
				"error",
				"Selection.before",
				"value is expected to be Node, [Node] or Selection",
				{ value },
			);
		}
		return this;
	}

	// Replaces nodes in current selection with `value`. If selection is empty,
	// removes the value nodes instead.
	replaceWith(value) {
		if (this.length === 0) {
			logSelect(
				"warn",
				"Selection.replaceWith",
				"current selection is empty, so given nodes will be removed",
				{ value },
			);
			if (Selection.IsNode(value)) {
				if (value.parentNode) {
					value.parentNode.removeChild(value);
				}
			} else if (Selection.IsSelection(value) || Selection.IsList(value)) {
				for (let i = 0; i < value.length; i++) {
					const node = value[i];
					if (node.parentNode) {
						node.parentNode.removeChild(node);
					}
				}
			}
			return this;
		} else {
			const scope = this[0];
			const parent = scope.parentNode;
			const added = [];
			if (Selection.IsNode(value)) {
				if (parent) {
					parent.insertBefore(value, scope);
				}
				added.push(value);
			} else if (Selection.IsSelection(value) || Selection.IsList(value)) {
				// FIXME: Make sure the order is preserved
				const added = [];
				for (let i = 0; i < value.length; i++) {
					const n = value[i];
					if (parent) {
						parent.insertBefore(n, scope);
					}
					added.push(n);
				}
			} else {
				logSelect(
					"error",
					"Selection.replaceWith",
					"value is expected to be Node, [Node] or Selection",
					{ value },
				);
			}
			while (this.length > 0) {
				const n = this.pop();
				if (n.parentNode) {
					n.parentNode.removeChild(n);
				}
			}
			while (added.length > 0) {
				this.push(added.pop());
			}
		}
		return this;
	}

	// Tests if this selection equals `node` (element) or contains same nodes
	// as `node` (array/selection).
	equals(node) {
		if (typeof node === "string") {
			return this.equals(query(node));
		} else if (Array.isArray(node)) {
			if (node.length !== this.length) {
				return false;
			}
			for (let i = 0; i < this.length; i++) {
				if (node[i] !== this[i]) {
					return false;
				}
			}
			return true;
		} else if (Selection.IsElement(node)) {
			return this.length === 1 && this[0] === node;
		} else {
			return false;
		}
	}

	// Tests if selection contains all nodes in `node` (array) or contains `node`
	// (single element).
	contains(node) {
		if (Array.isArray(node) || Selection.IsElement(node)) {
			let found = true;
			for (let i = 0; found && i < this.length; i++) {
				found = this.indexOf(node[i]) >= 0;
			}
			return found;
		} else {
			return this.indexOf(node) >= 0;
		}
	}

	// TODO
	// FIXME: Does not work
	// Redo the selection in the given context, returning a new selection.
	// redo(node) {
	// 	return Selection(this.selector[0], node)
	// }

	// Wraps all nodes in `node` and returns Selection with the wrapper.
	wrap(node) {
		node = $(node);
		node.add(this);
		return node;
	}

	// Clones all nodes in selection with deep copy.
	clone() {
		if (this.length === 0) {
			return new (Object.getPrototypeOf(this).constructor)();
		}
		let res;
		for (const child of this) {
			if (res === undefined) {
				res = new (Object.getPrototypeOf(this).constructor)(
					child.cloneNode(true),
				);
			} else {
				res.push(child.cloneNode(true));
			}
		}
		return res;
	}

	// Removes all children from all nodes.
	empty() {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			while (node.firstChild) {
				node.removeChild(node.firstChild);
			}
		}
		return this;
	}

	// Tests if selection has no elements.
	isEmpty() {
		return this.length === 0;
	}

	// TODO: Implement better rules for value extraction

	// ============================================================================
	// SUBSECTION: Value Accessors
	// ============================================================================

	// Alias for `value()`.
	val(value) {
		return this.value(value);
	}

	// Gets or sets form values. When getting, returns first non-null value from
	// inputs or contenteditable elements. When setting, updates all elements.
	value(value) {
		if (typeof value === "undefined") {
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (typeof node.value !== "undefined") {
					return node.value;
				} else if (node.hasAttribute("contenteditable")) {
					return node.textContent;
				}
			}
			return undefined;
		} else {
			value = `${value}`;
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (typeof node.value !== "undefined") {
					node.value = value;
				} else if (node.hasAttribute("contenteditable")) {
					node.textContent = value;
				}
			}
			return this;
		}
	}

	// Gets or sets text content. Uses `textContent` property. Non-string values
	// are JSONified.
	text(value) {
		let result;
		if (typeof value === "undefined") {
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				result = node.textContent;
				if (result) {
					return result;
				}
			}
			return result;
		} else {
			value =
				value === null || value === undefined
					? ""
					: typeof value === "number"
						? `${value}`
						: typeof value === "string"
							? value
							: JSON.stringify(value);
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				switch (node.nodeName) {
					case "INPUT":
					case "TEXTAREA":
					case "SELECT":
						if (node.value !== value) {
							node.value = value;
						}
						break;
					default:
						node.textContent = value;
				}
			}
			return this;
		}
	}

	// Alias for `contents()`.
	html(value) {
		return this.contents(value);
	}

	// Gets or sets HTML content via `innerHTML`. When setting with nodes/selection,
	// empties first then appends.
	//
	// FIXME: Not sure if that's the best behaviour... should we clone the
	// other nodes, or warn?
	contents(value) {
		let result;
		if (typeof value === "undefined") {
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				result = node.innerHTML;
				if (result) {
					return result;
				}
			}
			return result;
		} else {
			if (!value || typeof value === "string" || typeof value === "number") {
				value = value || "";
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					// FIXME: Make sure this works for SVG nodes as well
					node.innerHTML = value;
				}
				return this;
			} else {
				return this.empty().append(value);
			}
		}
	}

	// ============================================================================
	// SUBSECTION: Attributes & Data
	// ============================================================================

	// Gets or sets attributes. Single name returns value. Name/value pair sets.
	// Object sets multiple. Non-string values JSONified. `null` removes attribute.
	attr(name, ...rest) {
		if (typeof name === "string") {
			if (rest.length === 0) {
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					if (node.hasAttribute(name)) {
						return node.getAttribute(name);
					}
				}
				return undefined;
			} else {
				let value = rest[0];
				value =
					typeof value === "string"
						? value
						: value === null
							? value
							: JSON.stringify(value);
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					if (value === null) {
						if (node.hasAttribute(name)) {
							node.removeAttribute(name);
						}
					} else {
						node.setAttribute(name, value);
					}
				}
				return this;
			}
		} else if (name) {
			for (const k in name) {
				this.attr(k, name[k]);
			}
			return this;
		}
		return this;
	}

	// Gets or sets data attributes (data-*). No args returns all data as object.
	// Name arg returns single value. Name/value sets. Object sets multiple.
	// Values are JSON-parsed when getting, JSON-stringified when setting.
	data(name, value, _serialize) {
		if (!name) {
			// There's no name, so we return the dataset
			const node = this[0];
			if (!node) {
				return undefined;
			}
			if (node.dataset) {
				const r = {};
				// NOTE: We do need to expand the dataset, and not
				// return the dataset as is.
				for (const k in node.dataset) {
					let v = node.dataset[k];
					try {
						v = JSON.parse(v);
					} catch (_e) {}
					r[k] = v;
				}
				return r;
			}
			const a = node.attributes;
			let r;
			for (let j = 0; j < a.length; j++) {
				const _ = a[j];
				const n = _.name;
				if (n.startsWith("data-")) {
					let v = _.value;
					// NOTE: We don't call `data` again for performance.
					try {
						v = JSON.parse(v);
					} catch (_e) {}
					// FIXME: Hopefully this won't produce a weird
					// reference issue.
					r = r || {};
					r[n.substring(5, n.length)] = v;
				}
			}
			return r;
		} else if (typeof name === "string") {
			const data_name = `data-${name}`;
			let serialized;
			if (typeof value === "undefined") {
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					let attr_value;
					if (node.hasAttribute(data_name)) {
						attr_value = node.getAttribute(data_name);
					}
					let value =
						typeof node.dataset !== "undefined"
							? node.dataset[name]
							: attr_value;
					try {
						value = JSON.parse(value);
					} catch (_e) {}
					if (typeof value !== "undefined") {
						return value;
					}
				}
				return undefined;
			} else {
				serialized = typeof value === "string" ? value : JSON.stringify(value);
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					if (typeof node.dataset !== "undefined") {
						node.dataset[name] = serialized;
					} else {
						node.setAttribute(data_name, serialized);
					}
				}
				return this;
			}
		} else {
			for (const k in name) {
				this.data(k, name[k]);
			}
			return this;
		}
	}

	// Adds class(es) to all nodes. Accepts single class, array, or multiple args.
	// Handles both classList API and fallback for SVG.
	addClass(...classNames) {
		if (classNames.length > 1) {
			for (let i = 0; i < classNames.length; i++) {
				this.addClass(classNames[i]);
			}
			return this;
		}
		const className = classNames[0];
		if (Array.isArray(className)) {
			for (let i = 0; i < className.length; i++) {
				this.addClass(className[i]);
			}
			return this;
		}
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (node.classList) {
				node.classList.add(className);
			} else {
				const c = node.getAttribute("class");
				if (c && c.length > 0) {
					const m = c.indexOf(className);
					const la = c.length || 0;
					const lc = className.length;
					const n = m + lc;
					const p = m - 1;
					if (!((m === 0 || c[p] === " ") && (n === la || c[n] === " "))) {
						node.setAttribute(`${c} ${className}`);
					}
				} else {
					node.setAttribute(className);
				}
			}
		}
		return this;
	}

	// Removes class from all nodes.
	removeClass(className) {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (node.classList) {
				node.classList.remove(className);
			} else {
				let c = node.getAttribute("class");
				if (c && c.length > 0) {
					const m = c.indexOf(className);
					if (m >= 0) {
						const la = c.length || 0;
						const lc = className.length;
						let nc = "";
						// NOTE: This is an optimized version of the classlist. We could do
						// a simple split/join, but I *assume* this is faster. Premature
						// optimization FTW!
						while (m >= 0) {
							const n = m + lc;
							const p = m - 1;
							if ((m === 0 || c[p] === " ") && (n === la || c[n] === " ")) {
								nc += c.substr(0, m);
							} else {
								nc += c.substr(0, m + lc);
							}
							c = c.substr(m + lc);
						}
						nc += c;
						node.setAttribute("class", nc);
					}
				}
			}
		}
		return this;
	}

	// Tests if any node has the given class.
	hasClass(name) {
		const lc = (name || "").length;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (typeof node.classList !== "undefined") {
				return node.classList.contains(name);
			} else {
				const c = node.className || "";
				if (c && c.length > 0) {
					const m = c.indexOf(name);
					if (m >= 0) {
						const la = c.length || 0;
						const p = m - 1;
						const n = m + lc + 1;
						if ((m === 0 || c[p] === " ") && (m === la || c[n] === " ")) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	// Toggles class based on `value`. If `value` is function, called with
	// (node, index) and return value used. If no value, simply toggles.
	toggleClass(name, value) {
		const sel = select();
		const is_function = value instanceof Function;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			const v = is_function ? value(node, i) : value;
			sel.set(this[i]);
			if (typeof value === "undefined") {
				if (sel.hasClass(name)) {
					sel.removeClass(name);
				} else {
					sel.addClass(name);
				}
			} else if (v && !sel.hasClass(name)) {
				sel.addClass(name);
			} else if (!v && sel.hasClass(name)) {
				sel.removeClass(name);
			}
		}
		return this;
	}

	// ============================================================================
	// SUBSECTION: Style
	// ============================================================================

	// Gets or sets CSS properties. Single name returns value. Name/value pair sets.
	// Object sets multiple. Numeric values (except 0) get "px" suffix.
	css(name, value) {
		if (typeof name === "string") {
			if (typeof value === "undefined") {
				for (let i = 0; i < this.length; i++) {
					// SEE: http://devdocs.io/dom/window/getcomputedstyle
					const style = document.defaultView.getComputedStyle(this[i], null)[
						name
					];
					if (typeof style !== "undefined") {
						return style;
					}
				}
				return undefined;
			} else {
				value = typeof value === "string" ? value : `${value}px`;
				for (let i = 0; i < this.length; i++) {
					this[i].style[name] = value;
				}
				return this;
			}
		} else {
			for (const k in name) {
				this.css(k, name[k]);
			}
			return this;
		}
	}

	// ============================================================================
	// SUBSECTION: Layout
	// ============================================================================

	// Returns width in pixels of first node using `getBoundingClientRect()`.
	width() {
		const node = this[0];
		if (!node) {
			return 0;
		}
		const nb = node.getBoundingClientRect();
		return nb.right - nb.left;
	}

	// Returns height in pixels of first node using `getBoundingClientRect()`.
	height() {
		const node = this[0];
		if (!node) {
			return 0;
		}
		const nb = node.getBoundingClientRect();
		return nb.bottom - nb.top;
	}

	// Returns `{left, top}` offset of first node relative to offset parent.
	offset() {
		const node = this[0];
		if (!node) {
			return undefined;
		}
		if (Selection.IsDOM(node)) {
			return { left: node.offsetLeft, top: node.offsetTop };
		}
		const nb = node.getBoundingClientRect();
		const pb = node.parentNode.getBoundingClientRect();
		return { left: nb.left - pb.left, top: nb.top - pb.top };
	}

	// Gets or sets `scrollTop`. Only works for DOM nodes.
	scrollTop(value) {
		// TODO
		const has_value = value !== undefined && value !== null;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (Selection.IsDOM(node)) {
				if (has_value) {
					node.scrollTop = value;
				} else {
					return node.scrollTop;
				}
			} else {
				// FIXME: Implement me
				logSelect("error", "Selection.scrollTop", "not implemented for SVG", {
					node,
					value,
				});
			}
		}
		return undefined;
	}

	// Gets or sets `scrollLeft`. Only works for DOM nodes.
	scrollLeft(value) {
		// TODO
		const has_value = value !== undefined && value !== null;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (Selection.IsDOM(node)) {
				if (has_value) {
					node.scrollLeft = value;
				} else {
					return node.scrollLeft;
				}
			} else {
				// FIXME: Implement me
				logSelect("error", "Selection.scrollLeft", "not implemented for SVG", {
					node,
					value,
				});
			}
		}
		return undefined;
	}

	// ============================================================================
	// SUBSECTION: Focus & Selection
	// ============================================================================

	// Sets focus on first node, or binds focus event handler if callback provided.
	focus(callback) {
		if (typeof callback === "undefined") {
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (node.focus) {
					node.focus();
					if (document.activeElement === node) {
						return this;
					}
				}
			}
			return this;
		} else {
			return this.bind("focus", callback);
		}
	}

	// Selects contents of nodes, or binds select event handler if callback
	// provided.
	select(callback) {
		if (typeof callback === "undefined") {
			const s = window.getSelection();
			s.removeAllRanges();
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (node.select) {
					node.select();
				} else {
					const r = new Range();
					if (node.nodeType === node.TEXT_NODE) {
						r.selectNode(node);
					} else {
						r.selectNodeContents(node);
					}
					s.removeAllRanges();
					s.addRange(r);
				}
			}
			return this;
		} else {
			return this.bind("select", callback);
		}
	}

	// ============================================================================
	// SUBSECTION: Events
	// ============================================================================

	// SEE: https://en.wikipedia.org/wiki/DOM_events
	// NOTE: We do not redefine/override existing functions.

	// Binds `callback` to `event` on all nodes. Optional `capture` for capture phase.
	bind(event, callback, capture) {
		capture = capture && true;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			node.addEventListener(event, callback, capture);
		}
		return this;
	}

	// Unbinds `callback` from `event` on all nodes.
	unbind(event, callback) {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			node.removeEventListener(event, callback);
		}
		return this;
	}

	// Triggers `event` (string name or Event object) on all nodes using
	// `dispatchEvent`.
	trigger(event) {
		// NOTE: We're doing custom event here, but we might want to be a little
		// bit smarter than that.
		if (typeof event === "string") {
			// SEE: http://stackoverflow.com/questions/5342917/custom-events-in-ie-without-using-libraries
			event = new CustomEvent(event, { bubbles: true, cancelable: true });
		}
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			node.dispatchEvent(event);
		}
		return this;
	}

	// ============================================================================
	// SUBSECTION: Utility
	// ============================================================================

	// Returns node at `index` (default 0) directly, not wrapped in Selection.
	node(index) {
		index = index === undefined ? 0 : index;
		index = index < 0 ? this.length - index : index;
		if (index >= 0 && index < this.length) {
			return this[index];
		} else {
			return undefined;
		}
	}

	// Clears selection and adds `value`.
	set(value) {
		return this.clear().expand(value);
	}

	// Creates new Selection with `value`, does not clone nodes.
	copy(value) {
		return new Selection().expand(value);
	}

	// Reduces selection length to `length` by removing excess elements.
	clear(length) {
		length = length || 0;
		super.splice(length, this.length - length);
		return this;
	}

	// Expands selection with `element` (node, array, NodeList, or Selection).
	expand(element) {
		if (element === window || element === document) {
			element = document.firstElementChild;
		}
		if (!element || element.length === 0) {
			return this;
		} else if (typeof element === "string") {
			return this.expand(query(element));
		} else if (Selection.IsElement(element)) {
			this.push(element);
		} else if (element.nodeType === Node.DOCUMENT_NODE) {
			// NOTE: This does not work on some mobile browsers.
			this.expand(element.firstElementChild);
		} else if (element instanceof NodeList || Selection.IsList(element)) {
			for (let i = 0; i < element.length; i++) {
				this.expand(element[i]);
			}
		} else {
			logSelect("error", "Selection.expand", "unsupported argument", {
				element,
			});
		}
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Factory Function
//
// ----------------------------------------------------------------------------

// Function: select
// Factory function that creates a `Selection`. If `selector` is already a
// Selection and no `scope` provided, returns it directly.
//
// Parameters:
// - `selector`: string|Node|Array|Selection - CSS selector, node(s), or existing Selection
// - `scope`: Node|Selection? - scope for selector queries
//
// Returns: Selection
//
// Example:
// ```javascript
// const items = select(".item")
// const scoped = select("li", document.getElementById("list"))
// const wrapped = select(existingNode)
// ```

const select = (selector, scope) => {
	return Selection.Is(selector) && !scope
		? selector
		: new Selection(selector, scope);
};

// NOTE: This is a bit recursive as the select is actually a factory function
// for Selection object, but we also copy the top-level module attributes in
// it.
// Assign module metadata and utilities to select function
Object.assign(select, {
	Selection: Selection,
	VERSION: "1.0.0b0",
	NAME: "select",
	STATUS: "LOADED",
	isNode: Selection.IsNode,
	isText: Selection.IsText,
	filter,
	match,
	query,
	select,
});

// Aliases for the select function
const S = select;
const $ = select;

// ----------------------------------------------------------------------------
//
// SECTION: Exports
//
// ----------------------------------------------------------------------------

export { $, filter, match, query, S, Selection, select };
export default select;

// EOF
