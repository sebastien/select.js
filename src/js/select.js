/**
 *
 * # Select.js
 * ## A small jQuery-like library for DOM+SVG manipulation
 *
 * ```
 * Version :  ${VERSION}
 * URL     :  http://github.com/sebastien/select.js
 * Updated :  2021-04-06
 * ```
 *
 * Select is a subset of jQuery's functions implemented for DOM and SVG
 * nodes, and targeting modern browsers. It is a thin wrapper around HTML5
 * DOM & SVG APIs. It uses strict CSS3 selector query, and as such won't work
 * as a drop-in replacement to jQuery, but will make the transition easier.
 *
 * Select is recommended if you want to use the same API for DOM & SVG nodes
 * and it is not critical to support a wide range of browser [quirks].
 *
 * We use it internally at [FFunction](http://ffctn.com) as most of the extra features present
 * in jQuery (events, promises, requests, animations) are already handled
 * by our specialized modules, and that jQuery does not work well for SVG
 * nodes, which we manipulate a lot.
 *
 * That being said, jQuery dramatically
 * improved the quality of the Web as an environment, and it definitely
 * enabled us to focus on creating great applications. [Things have changed](http://youmightnotneedjquery.com/)
 * for the better now, and we don't need so much of a compatibility layer
 * anymore. You should note, however, that [jQuery still fixes many modern-browser problems](https://docs.google.com/document/d/1LPaPA30bLUB_publLIMF0RlhdnPx_ePXm7oW02iiT6o/preview?sle=true)
 * so if you need to have a wide support and more features, jQuery is definitely
 * the better option.
 *
 * The functions currently implemented are the following, available within
 * the `select` object (which you should alias to `$`).
 *
 * Selection
 * :
 *  - `find(selector)`
 *  - `filter(selector)`
 *  - `is|like(selector)`
 *  - `forEach(callback)`
 *
 * Traversal
 * :
 *  - `first()`
 *  - `last()`
 *  - `eq(index)`|`get(index)`
 *  - `next(selector?)`
 *  - `prev[ious](selector?)`
 *  - `parent(selector?)`
 *  - `parents(selector?)`
 *  - `ancestors(selector?)`
 *  - `children(selector?)`
 *
 * Manipulation:
 * :
 *  - `append(value)`
 *  - `prepend(value)`
 *  - `remove()`
 *  - `after(value)`
 *  - `before(value)`
 *  - `replaceWith(value)`
 *  - `clone()`
 *  - `attr(attribute, value)`/`attr(attributes)`
 *  - `css(attribute, value)`/`css(attributes)`
 *  - `html(value?)`/`contents(value?)`
 *  - `text(value?)`
 *  - `val(value?)/`value()`
 *  - `empty()`
 *  - `[has|add|remove|toggle]Class(name)`
 *
 * Display:
 * :
 *  - `scrollTop(value?)`
 *  - `scrollLeft(value?)`
 *  - `width()`
 *  - `height()`
 *  - `position()`
 *  - `offset()`
 *
 * Selection:
 * :
 * - `select()`
 *
 * Events:
 * :
 *  - `bind(event, callback)`
 *  - `unbind(event, callback)`
 *  - `change(event, callback)`
 *  - `submit(event, callback)`
 *  - `click(event, callback)`
 *  - `keyup(event, callback)`
 *  - `keydown(event, callback)`
 *  - `keypress(event, callback)`
 *  - `trigger(event)`
 *
 * New (not in jQuery):
 * :
 * -  `n[ode]()`
 * -  `set(value)`
 * -  `contents(value?)`
 * -  `redo(node)`
 * -  `clear(length)`
 * -  `expand(element|[element])`
 * -  `like(selector)`
 * -  `list()`
 * -  `nodes(callback?)`
 * -  `walk(callback?)`
 * -  `wrap(node)`
 * -  `equals(node|selection)`
 * -  `contains(node|selection)`
 *
 * Differences with jQuery
 * -----------------------
 *
 * - SVG nodes are supported
 * - Only modern browsers are supported (IE10+)
 * - Only a subset of jQuery's functions are implemented (see above)
 * - Only `nodeType===ELEMENT_NODE`s are supported (meaning no `document` or `window` supported)
 * - As a result, select filters out any node that is not an element node (in particular, the document node)
 * - Selectors are only CSS3 (ie. no Sizzle/jQuery extended syntax)
 * - No name/key/selector normalization (for performance)
 * - Distributed as an UMD module
 *
 * Using
 * -------
 *
 * You can include the [script directly from Github](https://raw.githubusercontent.com/sebastien/select.js/master/build/select.js) (although GitHub is not a CDN):
 *
 * ```
 * <script src="https://raw.githubusercontent.com/sebastien/select.js/master/build/select.js" />
 * ```
 *
 * The library can be used pretty much like you would use jQuery.
 *
 * ```
 * // Query the elements, and apply the operations
 * $("ul li:even").text("Hello!");
 *
 * // It is also available at different locations
 * $ == S == window.select
 * ```
 *
 *
 * Extending
 * ---------
 *
 * Select can be extended by "monkey-patched" the prototype:
 *
 * ```
 * select.Selection.prototype.<YOUR NEW METHOD> = function(...) {
 *    // `this` will reference your `Selection` object
 * }
 * ```
 *
 * Contributing
 * ------------
 *
 * If you'd like to look at the source code or contribute, Select's home page
 * is at <http://github.com/sebastien/select.js>, feel free to post issues or
 * pull requests. The goal is to keep this pretty minimal, so my preference
 * would go to bug reports or performance improvements request as opposed
 * to new features.
 *
 * Also, a quick note about the implementation style: `select`'s source
 * code is fairly repetitive, and would actually benefit from C-style macros.
 * The reason is that I wanted to limit the use of lambdas and stay as close
 * to possible as C-style programming based on `for`/`while` loops, minimizing
 * conditional branching. This results in a more verbose, old-school style, but
 * that (hopefully) translates into better performance.
 *
 * Once `select` stabilizes, I will probably factor out the common parts
 * and measure the performance impact.
 *
 * API
 * ---
 */

// TODO: Add a "virtual" mode so that all the changes are made virtually,
//       then pooled, then applied.
// TODO: Add flyweight pattern in order to recycle selection and not put too
// much strain on GC.
// TODO: Updated documentation so that Node -> Element where relevant
// FIXME: Should have a clear strategy on selecting text and nodes, especially
// FIXME: Test length of arguments instead of typeof
// FIXME: the $.selector property is not working properly

/** PASTE:MODULE **/

// ----------------------------------------------------------------------------
/**
 * Core functions
 * ---------------
 *
 * Select is based on a couple of basic functions to query, filter and match
 * nodes against CSS-3 selectors. These work in modern browsers, including
 * our beloved IE10+.
 */

const _match = Element.prototype.matches
	? 1
	: Element.prototype.mozMatchesSelector
		? 2
		: Element.prototype.webkitMatchesSelector
			? 3
			: null;

/**
 * `select.match(selector:String, node:Node):Boolean`
 *
 * :   Tells if the given `node` matches the given selector. This
 *     function uses `Node.{matches|mozMatchesSelector|webkitMatchesSelector}`
 *     or falls back to a default (obviously slower) implementation.
 *
 *     The function returns `true` or `false`
 */
const match = _match
	? (selector, node) => {
			// Here we have a browser match function
			// -- MACRO:Selector normalization --
			let index = undefined;
			// NOTE: This is where we support the jQuery-like suffixes
			if (selector.startsWith(":first")) {
				selector = selector.substring(0, selector.length - 6);
				index = 0;
			}
			// -- MACRO:END --
			if (index == undefined) {
				try {
					switch (_match) {
						case 1:
							return (
								node && node.matches && node.matches(selector)
							);
						case 2:
							return (
								node &&
								node.mozMatchesSelector &&
								node.mozMatchesSelector(selector)
							);
						case 3:
							return (
								node &&
								node.webkitMatchesSelector &&
								node.webkitMatchesSelector(selector)
							);
						default:
							console.error(
								"select.match: browser not supported",
							);
							select.STATUS = "FAILED";
							return node.matches(selector);
					}
				} catch (e) {
					// NOTE: When entering a bad selector, we might get an error that we propagate here.
					console.error(
						"select.match: exception occurred with selector",
						selector,
						"and node",
						node,
						":",
						e,
					);
					return null;
				}
			} else {
				// We need to support the case where an index is given
				const matches = query(selector, undefined, index);
				return matches[index] == node;
			}
		}
	: (selector, node) => {
			// Here we need to emulate a browser match
			if (selector.endsWith(":first")) {
				return query(selector, node) == node;
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

/**
 * `select.query(selector:String, node:Node?):[Element]`
 *
 * :	Queries all the descendants of node that match the given selector. This
 *		is a wrapper around `Element.querySelectorAll`.
 *
 *       function returns an array of the matching element nodes.
 */
export const query = (selector, scope, limit) => {
	// TODO: Implement the `limit` to optimize
	selector = selector.trim();
	if (!selector || selector.length == 0) {
		return [scope];
	} else if (selector[0] == ">") {
		// We have a selector starting with '>'. Sadly, the the `querySelectorAll`
		// does not support it, so we have to split the query.
		selector = selector.substr(1).trim();
		// We look for the first separator, either `>` or ` `. Ideally we should
		// ensure that the separator is not contained within `[]`, for insance
		// `>div[id="value with space"]>span`
		const i = Math.min(
			Math.max(selector.indexOf(">"), 0),
			Math.max(selector.indexOf(" "), 0),
		);
		// Now we extract the node selector and the child(ren) selector.
		const selector_node = i > 0 ? selector.substring(0, i) : selector;
		const selector_child =
			i > 0 ? selector.substring(i, selector.length) : null;
		const matching = [];
		const nodes = (scope || document).childNodes;
		let result = null;
		// Now we match the root nodes of the selector
		for (let j = 0; i < nodes.length; i++) {
			const n = nodes[j];
			if (match(selector_node, n) && n.nodeType == Node.ELEMENT_NODE) {
				matching.push(n);
			}
		}
		if (selector_child) {
			// If we have a child selector, now is the time to run the query
			result = [];
			for (let i = 0; i < matching.length; i++) {
				result = result.concat(
					select.query(selector_child, matching[i]),
				);
			}
		} else {
			// Otherwise the result is the matching root nodes
			result = matching;
		}
		return result;
	} else {
		// -- MACRO:Selector normalization --
		let index = undefined;
		// NOTE: This is where we support the jQuery-like suffixes
		if (selector.endsWith(":first")) {
			selector = selector.substring(0, selector.length - 6);
			index = 0;
		}
		// -- MACRO:END --
		let result = [];
		// TODO: Intercept exception?
		const nodes = (scope || document).querySelectorAll(selector);
		let count = 0;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node.nodeType == Node.ELEMENT_NODE) {
				if (index === undefined) {
					// If there was no index/suffix, we just add the nodes
					result.push(node);
					count += 1;
				} else if (index == count) {
					// If there was a suffix, we only add when the count == index
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

// TODO
// /**
//  * `select.xpath(selector:String, node:Node?):[Element]`
//  *
//  * :	Queries all the descendants of node that match the given XPath expression. This
//  *		is a wrapper around `document.evaluate`.
//  *		See <https://developer.mozilla.org/en-US/docs/Introduction_to_using_XPath_in_JavaScript>
//  *
//  *       function returns an array of the matching element nodes.
// */
// var xpath = function(selector, scope, limit) {
// 	var result         = Selection ();
// 	var scope_document = scope.ownerDocument == null ? scope.documentElement : scope.ownerDocument.documentElement
// 	var resolver       = document.createNSResolver( scope_document );
// 	document.evaluate(selector, scope, resolver);
// }

/**
 * `select.filter(selector:String, node:Node?):[Node]`
 *
 * :	Filters all the nodes that match the given selector. This is a wrapper
 * 		around `select.filter`.
 *
 *      This function returns the subset of the array with matching nodes.
 */
export const filter = (selector, nodes) => {
	const result = [];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (match(selector, node)) {
			result.push(node);
		}
	}
	return result;
};

/*
 * Selection Class
 * ---------------
 *
 * `Selection(selector, scope)`
 *
 * :	Wraps an array of node resulting from the selection of the given
 *		selector in the given scope.
 *
 *      - `selector` can be `String`, `Node`, `Selection` or nothing.
 *      - `scope`    can be `String`, `Node`, `Selection` or nothing.
 *
 *      A selection has the following properties
 *
 *      - `nodes` the array of matching nodes
 *      - `scope` the scope that might be either nothing, a `Node` or a `Selection`
 *      - `length` the length of the `nodes` array, 0 or more.
 *
 *      Note that in any case, the *selection will only contain element nodes*.
 */
export class Selection extends Array {
	constructor(selector, scope) {
		super();
		let nodes = null;
		if (typeof selector == "string") {
			// The selector is a string, so we need to find the query.
			if (!scope) {
				nodes = query(selector);
			} else {
				// We have a scope, so we query it already.
				scope = select(scope);
				// Now we restrict the selector to the matching result.
				nodes = scope.find(selector);
			}
		} else if (Selection.Is(selector)) {
			nodes = selector;
			scope = selector.scope;
			selector = selector.selector;
			if (selector.scope && scope != selector.scope) {
				console.error(
					"Selection.new: given scope differs from first argument's",
					scope,
					"!=",
					selector.scope,
				);
			}
		} else if (selector) {
			nodes = Selection.AsElementList(selector);
		}

		this.selector = selector;
		this.scope = scope;
		this.isSelection = true;
		this.expand(nodes);
		return this;
	}

	// ------------------------------------------------------------------------
	//
	// PREDICATES
	//
	// ------------------------------------------------------------------------
	/**
	 * Predicates
	 * ----------
	 *
	 *  The following predicates allow to discriminate values and identify their
	 *  types.
	 */

	/**
	 * `Selection.Is(value)`
	 *
	 * :	Tells if the given value is a `Selection` instance
	 *
	 *      select.Selection.Is(new Selection ());
	 */
	static Is(s) {
		return s && s.__class__ === Selection;
	}

	/**
	 * `Selection.IsList(value)`
	 *
	 * :	Tells if the given value is a `Selection`, `Array` or `NodeList`
	 *
	 */
	static IsList(s) {
		return (
			s instanceof Selection ||
			s instanceof Array ||
			s instanceof NodeList
		);
	}

	/**
	 * `Selection.IsElement(node)`
	 *
	 * :	Tells if the given value is a DOM or SVG element
	 *
	 * 		select.Selection.IsElement(document.createElement("div"));
	 * 		select.Selection.IsElement(document) == false
	 */
	static IsElement(node) {
		return (
			node &&
			typeof node.nodeType != "undefined" &&
			node.nodeType == Node.ELEMENT_NODE
		);
	}

	/**
	 * `Selection.IsText(node)`
	 *
	 * :	Tells if the given value is Text node or not
	 *
	 */
	static IsText(node) {
		return (
			node &&
			typeof node.nodeType != "undefined" &&
			node.nodeType == Node.TEXT_NODE
		);
	}

	/**
	 * `Selection.IsNode(node)`
	 *
	 * :	Tells if the given value is a DOM or SVG node
	 *
	 * 		select.Selection.IsNode(document.createElement("div")) == true
	 * 		select.Selection.IsNode(document) == true
	 */
	static IsNode(node) {
		return node && typeof node.nodeType != "undefined";
	}

	/**
	 * `Selection.IsDOM(node)`
	 *
	 * :	Tells wether the node is a DOM node or not
	 *
	 * 		select.Selection.IsDOM(document.createElement("div")) == true;
	 * 		select.Selection.IsDOM(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == false;
	 */
	static IsDOM(node) {
		return node && typeof node.getBBox === "undefined";
	}

	/**
	 * `Selection.IsSVG(node)`
	 *
	 * :	Tells wether the node is an SVG node or not
	 *
	 * 		select.Selection.IsSVG(document.createElement("div")) == false;
	 * 		select.Selection.IsSVG(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == true;
	 */
	static IsSVG(node) {
		// SEE: http://www.w3.org/TR/SVG11/types.html#__svg__SVGLocatable__getBBox
		return typeof node.getBBox != "undefined";
	}

	/**
	 * `Selection.IsSelection(value)`
	 *
	 * :	Tells wether the node a selection instance or not
	 */
	static IsSelection(value) {
		return value instanceof Selection;
	}

	/**
	 * `Selection.AsElementList(value:Any)`
	 *
	 * :	Ensures that the given value expands to a node list. This will
	 * 		only match node types and won't do any kind of querying. It just
	 * 		makes sure that only element nodes are returned.
	 */
	static AsElementList(value) {
		if (!value) {
			return value;
		} else if (value.nodeType == Node.ELEMENT_NODE) {
			return [value];
		} else if (
			value.nodeType == Node.DOCUMENT_FRAGMENT_NODE ||
			value.nodeType == Node.DOCUMENT_NODE
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

	static Ensure(node) {
		return Selection.Is(node) ? node : new Selection(node);
	}

	// ----------------------------------------------------------------------------
	//
	// SELECTION
	//
	// ----------------------------------------------------------------------------
	/**
	 * Selection & Filtering
	 * ---------------------
	 *
	 *  These functions allow to query the DOM/SVG tree, find & filter nodes.
	 */

	/**
	 * `Selection.find(selector)`
	 *
	 * :	Finds all the nodes that match the given selector amongst the descendants
	 * 		of the currently selected nodes. The resulting selector will have
	 * 		this selection as scope only if this selection is not empty.
	 * 		If the selection is empty, the the empty selection will be returned.
	 *
	 *      - `selector` is expected to be a string
	 *      - the resulting selection will be flat (ie. an array of node)
	 *
	 */
	find(selector) {
		if (this.length == 0) {
			return new Selection();
		}
		const nodes = [];
		// NOTE: We're dealing with NodeList, so no fancy reduce, etc
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			const q = query(selector, node);
			// This is to prevent for loop scope issues.
			for (let j = 0; j < q.length; j++) {
				nodes.push(q[j]);
			}
		}
		return new Selection(nodes, this);
	}

	/**
	 * `Selection.filter(selector)`
	 *
	 * :	Filters all the nodes within the current selection that match
	 * 		the give selector. The resulting selection will have
	 * 		this selection as scope only if this selection is not empty.
	 *
	 *      - `selector` is expected to be a string
	 *      - the resulting selection will be flat (ie. an array of node)
	 */
	filter(selector) {
		if (typeof selector === "string") {
			return new Selection(
				filter(selector, this),
				this.length > 0 ? this : undefined,
			);
		} else if (typeof selector === "function") {
			return new Selection(
				Array.prototype.filter.apply(this, [selector]),
			);
		} else {
			console.error(
				"Selection.filter(): selector string or predicate expected, got",
				selector,
			);
			return None;
		}
	}

	/**
	 * `Selection.iterate(callback:Function(element, index)`
	 *
	 * :	Invokes the given callback for each element of the selection wrapped
	 * 		in a selection object. Breaks if the callback returns `false`.
	 */
	iterate(callback) {
		const nodes = this;
		for (let i = 0; i < nodes.length; i++) {
			if (callback(new Selection(nodes[i]), i) === false) {
				break;
			}
		}
		return this;
	}

	/**
	 * `Selection.is(selector)`
	 *
	 * :	Tells if all the selected nodes match the given selector
	 */
	like(selector) {
		return this.is(selector);
	}

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

	/**
	 * `Selection.list()`
	 *
	 * :	Returns an array of properly wrapped nodes.
	 */
	list() {
		return this.map(Selection.Ensure);
	}

	// ----------------------------------------------------------------------------
	//
	// TRAVERSAL
	//
	// ----------------------------------------------------------------------------
	//
	// Some implementation notes about traversal: the patterns are the same,
	// ie iterate, extract and filter, but it is not abstracted out in order
	// to preserve performance. At least, we assume that a for loop is going
	// to be faster than a higher-order function combination.

	/**
	 * `Selection.first()`
	 *
	 * :	Returns a new selection made of the *first node* of this selection. If the
	 * 		selection is empty or made of 1 node, this function is transparent.
	 */
	first() {
		return this.length <= 1 ? this : select([this[0]], this);
	}

	/**
	 * `Selection.last()`
	 *
	 * :	Returns a new selection made of the *last node* of this selection. If the
	 * 		selection is empty or made of 1 node, this function is transparent.
	 */
	last() {
		return this.length <= 1 ? this : select([this[this.length - 1]], this);
	}

	/**
	 * `Selection.eq(index:Integer)` / `Selection.get(index:Integer)`
	 *
	 * :	Returns a new selection made of the *node at the given `index`*.
	 * 		if `index` is negative, then the index will be relative to the end
	 * 		of the nodes array. If the index is out of the node array bounds,
	 * 		the `Empty` selection is returned.
	 */
	eq(index) {
		return this.get(index);
	}
	get(index) {
		index = index < 0 ? this.length + index : index;
		if (this.length == 1 && index == 0) {
			return this;
		} else {
			return 0 <= index < this.length
				? select([this[index]], this)
				: new Selection();
		}
	}

	/**
	 * `Selection.next(selector:String?)`
	 *
	 * :	Selects each next sibling element of the current selection. If
	 * 		`selector` is given, only the matching elements will be added.
	 */
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

	/**
	 * `Selection.previous(selector:String?)`
	 *
	 * :	Selects each previous sibling element of the current selection. If
	 * 		`selector` is given, only the matching elements will be added.
	 */
	prev(selector) {
		return this.previous(selector);
	}
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

	/**
	 * `Selection.parent(selector:String?)`
	 *
	 * :	Returns a selection of the direct parents of the current selected
	 * 		nodes. If a selector is given, only the matching parents
	 * 		will be returned.
	 */
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

	/**
	 * `Selection.ancestors(selector:(String|Callback)?,limit:Number|Selection?)`
	 *
	 * :	Returns a selection of the ancestors of the current selected
	 * 		nodes. If a selector is given, only the matching parents
	 * 		will be returned.
	 *
	 * 		The `limit` argument can be either a number, in which case
	 * 		it will limit the number of ancestors to the given number,
	 * 		or it can be a node/selection, in which case it will not
	 * 		go beyond the given node.
	 */
	ancestors(selector, limit) {
		return this.parents(selector, limit);
	}
	parents(selector, limit) {
		const nodes = [];
		const depth_limit = typeof limit === "number" ? limit : -1;
		const node_limit =
			limit && typeof limit !== "number" ? select(limit) : null;
		const is_function = typeof selector === "function";
		const is_string = typeof selector === "string";
		// We need to support :first directly here
		if (is_string && selector.endsWith(":first")) {
			selector = selector.substring(0, selector.length - 6);
			index = 0;
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
				if (node_limit && node_limit.contains(node)) {
					node = null;
				}
			}
		}
		return nodes.length > 0 ? select(nodes, this) : new Selection();
	}

	/**
	 * `Selection.children(selector:String?)`
	 *
	 * :	Returns a selection of the children of the current selected
	 * 		nodes. If a selector is given, only the matching children
	 * 		will be returned.
	 */
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

	/**
	 * `Selection.nodes(callback?):[Node]`
	 *
	 * :	Returns a list of all the child nodes within this element, optionally
	 * 		invoking the given callback.
	 * 		will be returned. Note that we're talking about `Node` here,
	 * 		not elements, returned as an array.
	 *
	 * 		The iteration will exit whenever `callback` returns `false`.
	 */
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

	/***
	 * `Selection.walk(callback?):this`
	 *
	 * :	Invokes the given callback by making depth-first traversal of
	 * 		all the elements in this selection, passing (node, count) as
	 * 		argument. Note that unlike most other functions, the callback
	 * 		will be given any node, not only element nodes, and they
	 * 		will be given without any selection wrapping.
	 *
	 * 		The iteration will exit whenever `callback` returns `false`.
	 */
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

	// ----------------------------------------------------------------------------
	//
	// CONTENT / VALUE
	//
	// ----------------------------------------------------------------------------
	/**
	 * Content & Value
	 * ---------------
	 */

	/**
	 * `Selection.append(value:Number|String|Node|[Node]|Selection):this`
	 *
	 * :	Appends the given nodes to the first node in the selection. When
	 *      a string or number is given, then it is wrapped in a text node.
	 */
	append(value) {
		if (this.length == 0) {
			return this;
		}
		const node = this[0];
		if (Selection.Is(value)) {
			for (let i = 0; i < value.length; i++) {
				node.appendChild(value[i]);
			}
		} else if (value && typeof value.nodeType != "undefined") {
			node.appendChild(value);
		} else if (Selection.IsList(value)) {
			for (let i = 0; i < value.length; i++) {
				this.append(value[i]);
			}
		} else if (typeof value == "string") {
			for (let i = 0; i < this.length; i++) {
				this[i].appendChild(document.createTextNode(value));
			}
		} else if (typeof value == "number") {
			for (let i = 0; i < this.length; i++) {
				this[i].appendChild(document.createTextNode(value));
			}
		} else if (value) {
			console.error(
				"Selection.append: value is expected to be Number, String, Node, [Node] or Selection, got",
				value,
			);
		}
		return this;
	}

	/**
	 * `Selection.prepend(value:Number|String|Node|[Node]|Selection):this`
	 *
	 * :	Prepends the given nodes to the first node in the selection. When
	 *      a string or number is given, then it is wrapped in a text node.
	 */
	prepend(value) {
		if (this.length == 0) {
			return this;
		}
		const node = this[0];
		// We exit early if the node is empty
		const child = node.firstChild;
		if (!child) {
			return this.append(value);
		}
		// We insert before the child
		if (Selection.Is(value)) {
			for (let i = 0; i < value.length; i++) {
				node.insertBefore(value[i], child);
			}
		} else if (value && typeof value.nodeType != "undefined") {
			node.insertBefore(value, child);
		} else if (Selection.IsList(value)) {
			for (let i = 0; i < value.length; i++) {
				this.prepend(value[i]);
			}
		} else if (typeof value == "string") {
			for (let i = 0; i < this.length; i++) {
				this[i].insertBefore(document.createTextNode(value), child);
			}
		} else if (typeof value == "number") {
			for (let i = 0; i < this.length; i++) {
				this[i].insertBefore(document.createTextNode(value), child);
			}
		} else if (value) {
			console.error(
				"Selection.prepend: value is expected to be Number, String, Node, [Node] or Selection, got",
				value,
			);
		}
		return this;
	}

	/**
	 * `Selection.remove():Selection`
	 *
	 * :	Removes all the nodes from this selection from their parent
	 */
	remove() {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		}
		return this;
	}

	/**
	 * `Selection.extend(value:Number|String|Node|[Node]|Selection):this`
	 *
	 * :	Appends the given nodes to the first node in the selection. When
	 *      a string or number is given, then it is wrapped in a text node.
	 */
	extend(value) {
		if (Selection.IsNode(value)) {
			this.push(value);
		} else if (Selection.IsList(value)) {
			for (let i = 0; i < value.length; i++) {
				this.extend(value[i]);
			}
		} else {
			console.error(
				"Selection.extend: value must be a node, selection or list, got",
				value,
			);
		}
		return this;
	}

	/**
	 * `Selection.after(value:Node|[Node]|Selection):this`
	 *
	 * :	Appends the given nodes after first node in the selection
	 */
	after(value) {
		if (this.length == 0) {
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
			// If we have a scope, this means we invoke insertBefore
			if (Selection.Is(value)) {
				for (let i = 0; i < value.length; i++) {
					scope.parentNode.insertBefore(value[i], scope);
				}
			} else if (typeof value.length != "undefined") {
				for (let i = 0; i < value.length; i++) {
					scope.parentNode.insertBefore(value[i], scope);
				}
			} else if (typeof value.nodeType != "undefined") {
				scope.parentNode.insertBefore(value, scope);
			} else {
				console.error(
					"Selection.after: value is expected to be Node, [Node] or Selection, got",
					value,
				);
			}
		} else {
			// FIXME: Really not sure about that
			scope = node.parentNode;
			if (Selection.Is(value)) {
				for (let i = 0; i < value.length; i++) {
					scope.appendChild(value[i]);
				}
			} else if (typeof value.length != "undefined") {
				for (let i = 0; i < value.length; i++) {
					scope.appendChild(value[i]);
				}
			} else if (typeof value.nodeType != "undefined") {
				scope.appendChild(value);
			} else {
				console.error(
					"Selection.after: value is expected to be Node, [Node] or Selection, got",
					value,
				);
			}
		}
		return this;
	}

	/**
	 * `Selection.before(value:Node|[Node]|Selection):this`
	 *
	 * :	Appends the given nodes before the first node in the selection
	 */
	before(value) {
		if (this.length == 0) {
			return this;
		}
		const node = this[0];
		const scope = node;
		const parent = scope.parentNode;
		// If we have a scope, this means we invoke insertBefore
		if (Selection.Is(value)) {
			for (let i = 0; i < value.length; i++) {
				parent.insertBefore(value[i], scope);
			}
		} else if (typeof value.length != "undefined") {
			for (let i = 0; i < value.length; i++) {
				parent.insertBefore(value[i], scope);
			}
		} else if (typeof value.nodeType != "undefined") {
			parent.insertBefore(value, scope);
		} else {
			console.error(
				"Selection.before: value is expected to be Node, [Node] or Selection, got",
				value,
			);
		}
		return this;
	}

	/**
	 * `Selection.replaceWith(node:Node|[Node]|Selection):this`
	 *
	 * :	Replaces nodes in the given selection with the given nodes. The nodes
	 * 		in the current selection will be removed, while the given node list
	 * 		or selection will not be changed (but the nodes parent will change,
	 * 		obviously).
	 */
	replaceWith(value) {
		if (this.length == 0) {
			// When the selection is empty, we remove all the child nodes
			console.warn(
				"Selection.replaceWith: current selection is empty, so given nodes will be removed",
			);
			if (Selection.IsNode(value)) {
				if (value.parentNode) {
					value.parentNode.removeChild(value);
				}
			} else if (
				Selection.IsSelection(value) ||
				Selection.IsList(value)
			) {
				for (let i = 0; i < value.length; i++) {
					const node = value[i];
					if (node.parentNode) {
						node.parentNode.removeChild(node);
					}
				}
			}
			return this;
		} else {
			// Otherwise we move the nodes
			const scope = this[0];
			const parent = scope.parentNode;
			const added = [];
			if (Selection.IsNode(value)) {
				if (parent) {
					parent.insertBefore(value, scope);
				}
				added.push(value);
			} else if (
				Selection.IsSelection(value) ||
				Selection.IsList(value)
			) {
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
				console.error(
					"Selection.replaceWith: value is expected to be Node, [Node] or Selection, got",
					value,
				);
			}
			// We remove all the nodes in the current selection
			while (this.length > 0) {
				const n = this.pop();
				if (n.parentNode) {
					n.parentNode.removeChild(n);
				}
			}
			// And add back the nodes added
			while (added.length > 0) {
				this.push(added.pop());
			}
		}
		return this;
	}

	/**
	 * `Selection.equals(node:Node|Selection):bool`
	 *
	 * :	Tells if this selection equals the given node or selection.
	 */
	equals(node) {
		if (typeof node === "string") {
			return this.equals(query(node));
		} else if (node instanceof Array) {
			if (node.length != this.length) {
				return false;
			}
			for (let i = 0; i < this.length; i++) {
				if (node[i] != this[i]) {
					return false;
				}
			}
			return true;
		} else if (Selection.IsElement(node)) {
			return this.length == 1 && this[0] === node;
		} else {
			return false;
		}
	}

	/**
	 * `Selection.contains(node:Node|Selection?)`
	 *
	 * :	Tells if the current selection contains all of the given nodes/selections.
	 */
	contains(node) {
		if (node instanceof Array || Selection.IsElement(node)) {
			let found = true;
			for (let i = 0; found && i < this.length; i++) {
				found = this.indexOf(node[i]) >= 0;
			}
			return found;
		} else {
			return this.indexOf(node) >= 0;
		}
	}

	// FIXME: Does not work
	// /**
	//  * `Selection.redo(node:Node|Selection):Selection`
	//  *
	//  * :	Redo the selection in the given context, returning a new
	//  * 		selection.
	// */
	// Selection.prototype.redo = function( node ) {
	// 	return Selection( this.selector[0], node);
	// }

	/**
	 * `Selection.wrap(node:Node):this`
	 *
	 * :	Wraps all the nodes in the give node and returns a new selection with the given node.
	 * 		it is equivalent to `$(node).add(this)`
	 */
	wrap(node) {
		node = $(node);
		node.add(this);
		return node;
	}

	/**
	 * `Selection.clone():Selection`
	 *
	 * :	Clones the first node of this selection
	 */
	clone() {
		if (this.length === 0) {
			return new (Object.getPrototypeOf(this).constructor)();
		}
		let res = undefined;
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

	/**
	 * `Selection.empty():this`
	 *
	 * :	Removes all the children from all the nodes in the selection
	 */
	empty() {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			while (node.firstChild) {
				node.removeChild(node.firstChild);
			}
		}
		return this;
	}

	/**
	 * `Selection.isEmpty():Boolean`
	 *
	 * :	Tells if the given selection is empty or not.
	 */
	isEmpty() {
		return this.length == 0;
	}

	// TODO: Implement better rules for value extraction

	/**
	 * `Selection.val(value?):Any|Selection` / `Selection.value`
	 *
	 * :	When `value` is not specified ,retrieves the first non-null
	 *		value for the given input fields. If value is specified, then
	 *		the value will be set in all fields.
	 */
	val() {
		return this.value();
	}
	value(value) {
		if (typeof value == "undefined") {
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (typeof node.value != "undefined") {
					return node.value;
				} else if (node.hasAttribute("contenteditable")) {
					return node.textContent;
				}
			}
			return undefined;
		} else {
			value = "" + value;
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (typeof node.value != "undefined") {
					node.value = value;
				} else if (node.hasAttribute("contenteditable")) {
					node.textContent = value;
				}
			}
			return this;
		}
	}

	/**
	 * `Selection.text(value:String?):String|Selection`
	 *
	 * :	When `value` is not specified, retrieves the first non-null
	 *		text value for the nodes in the selection, otherwise sets the
	 *		text for all nodes as the given string.
	 *
	 *      Note that if `value` is not a string, it will be JSONified.
	 *
	 *      This uses [`Node.textContent`](http://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-textContent)
	 */
	text(value) {
		let result = undefined;
		if (typeof value == "undefined") {
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				result = node.textContent;
				if (result) {
					return result;
				}
			}
			return result;
		} else {
			value = typeof value === "string" ? value : JSON.stringify(value);
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				node.textContent = value;
			}
			return this;
		}
	}

	/**
	 * `Selection.html(value:Number|String|Selection|Node|[Node]?):this`
	 * `Selection.contents(value:Number|String|Selection|Node|[Node]?):this`
	 *
	 * :	When `value` is not specified, retrieves the first non-null
	 *		HTML value for the nodes in the selection, otherwise sets the
	 *		HTML for all nodes as the given string.
	 *
	 *		This uses [`Node.innerHTML`](https://dvcs.w3.org/hg/innerhtml/raw-file/tip/index.html#innerhtml)
	 *		when the given content is a string or a number. If a selection or
	 *		a node is given, then only the first node in the selection will
	 *		be modified.
	 *
	 *		FIXME: Not sure if that's the best behaviour... should be clone the
	 *		other nodes, or warn?
	 */
	html(value) {
		return this.contents(value);
	}
	contents(value) {
		let result = undefined;
		if (typeof value == "undefined") {
			// We return the `innerHTML`
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				result = node.innerHTML;
				if (result) {
					return result;
				}
			}
			return result;
		} else {
			if (
				!value ||
				typeof value === "string" ||
				typeof value === "number"
			) {
				// We set the innerHTML
				value = value || "";
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					// FIXME: Make sure this works for SVG nodes as well
					node.innerHTML = value;
				}
				return this;
			} else {
				// We append the nodes -- note: should be append and clone?
				return this.empty().append(value);
			}
		}
	}

	// ----------------------------------------------------------------------------
	//
	// ATTRIBUTES
	//
	// ----------------------------------------------------------------------------
	/**
	 * Attributes
	 * ----------
	 */

	/**
	 * ### `Selection.attr()`
	 *
	 * `Selection.attr(name:String):Any`
	 *
	 * :	Retrieves the given attribute value
	 *
	 * `Selection.attr(name:String, value:Any)`
	 *
	 * :	Sets the given attribute with the given value
	 *
	 * `Selection.attr(values:{String:Any})`
	 *
	 * :	Sets the given attributes based on the given map, JSONified if
	 *		not a string.
	 *
	 * 	These function will JSONify non-string values.
	 */
	attr(name, value) {
		if (typeof name === "string") {
			if (arguments.length == 1) {
				// We get the style value
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					if (node.hasAttribute(name)) {
						return node.getAttribute(name);
					}
				}
				return undefined;
			} else {
				// We set the style value
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

	/**
	 *
	 * ### `Selection.data()`
	 *
	 * `Selection.data():undefined|{String:Any}`
	 *
	 * :	Retrieves all the data attributes *of the first node* within
	 *      the selection, as a map, or `undefined` if none.
	 *
	 * `Selection.data(name:String):Any`
	 *
	 * :	Retrieves the given data attribute, `undefined` if not found.
	 *
	 * `Selection.data(name:String, value:Any)`
	 *
	 * :	Sets the given data attribute with the given value in all the nodes
	 *		within the selection, JSONified if not a string (non-DOM only)
	 *
	 * `Selection.data(values:{String:Any})`
	 *
	 * :	Sets the given data attributes based on the given map for all the nodes,
	 * 		in the selection JSONified if not a string (non-DOM only)
	 *
	 *  These work both for HTML and SVG nodes. In case of SVG, the
	 *  data will be stored and retrieved from JSON-encoded data attributes.
	 *
	 *  The main difference with HTML will be that the attributes won't
	 *  be converted back to `lower-case` from `camelCase`. For instance
	 *
	 *  ```
	 *  select("svg").data("someProperty", "true")
	 *  ```
	 *
	 *  will be stored as `data-someProperty` and not `data-some-property`
	 *  like it would be the case in an original HTML document.
	 */
	data(name, value, serialize) {
		if (!name) {
			// There's no name, so we return the dataset
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (node.dataset) {
					// If the node has a dataset, that's fine
					const r = {};
					// NOTE: We do neet to expand the dataset, and not
					// return the dataset as is.
					for (const k in node.dataset) {
						v = node.dataset[k];
						try {
							v = JSON.parse(v);
						} catch (e) {}
						r[k] = v;
					}
					return r;
				} else {
					// Otherwise we iterate through the data- prefixed
					// attribute and extract the values.
					const a = node.attributes;
					let r = undefined;
					for (let j = 0; j < a.length; j++) {
						const _ = a[j];
						const n = _.name;
						if (n.startsWith("data-")) {
							const v = _.value;
							// NOTE: We don't call `data` again for/ performance.
							try {
								v = JSON.parse(v);
							} catch (e) {}
							// FIXME: Hopefully this won't produce a weird
							// reference issue.
							r = r || {};
							r[n.substring(5, n.length)] = v;
						}
					}
					return r;
				}
			}
			return undefined;
		} else if (typeof name === "string") {
			// We retrieve/set a specific data attribute, this is only used
			// when `dataset` is not defined.
			const data_name = `data-${name}`;
			let serialized = undefined;
			if (typeof value == "undefined") {
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					// We need to support both HTML elements and SVG nodes
					let attr_value = undefined;
					if (node.hasAttribute(data_name)) {
						attr_value = node.getAttribute(data_name);
					}
					let value =
						typeof node.dataset != "undefined"
							? node.dataset[name]
							: attr_value;
					// We'll try to decode the value, in case it is JSON-encoded (which is supposed to always be the case)
					try {
						value = JSON.parse(value);
					} catch (e) {}
					if (typeof value != "undefined") {
						return value;
					}
				}
				return undefined;
			} else {
				serialized =
					typeof value === "string" ? value : JSON.stringify(value);
				for (let i = 0; i < this.length; i++) {
					const node = this[i];
					// We need to support both HTML elements and SVG nodes
					if (typeof node.dataset != "undefined") {
						node.dataset[name] = serialized;
					} else {
						node.setAttribute(data_name, serialized);
					}
				}
				return this;
			}
		} else {
			// We set a collection specific data attribute
			for (const k in name) {
				this.data(k, name[k]);
			}
			return this;
		}
	}

	/**
	 * ### `Selection.[add|remove|has]Class()`
	 *
	 * `Selection.addClass(name:String|[String],‥)`
	 *
	 * :	Adds the given class to all the nodes in the selection.
	 *
	 *      This uses `Node.classList` with a custom fallback that works for
	 *      DOM & SVG nodes.
	 */
	addClass(className) {
		// Supports giving an array of classes
		if (className instanceof Array) {
			for (let i = 0; i < className.length; i++) {
				this.addClass(className[i]);
			}
			return this;
		}
		// Supports multiple arguments
		if (arguments.length > 1) {
			for (let i = 0; i < arguments.length; i++) {
				this.addClass(arguments[i]);
			}
			return this;
		}
		// And here is the default case where we have only one argument
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (node.classList) {
				// If the node has a classList, we use it directly
				node.classList.add(className);
			} else {
				// Otherwise we emulate it directly
				const c = node.getAttribute("class");
				if (c && c.length > 0) {
					const m = c.indexOf(className);
					const la = c.length || 0;
					const lc = className.length;
					const p = n - 1;
					const n = m + lc;
					// If the className is not surrounded by spaces or start/end, then
					// we can add it
					if (
						!((m == 0 || c[p] == " ") && (n == la || c[n] == " "))
					) {
						node.setAttribute(c + " " + className);
					}
				} else {
					// There is no class attribute, so we just set it
					node.setAttribute(className);
				}
			}
		}
		return this;
	}

	/**
	 * `Selection.removeClass(name:String?)`
	 *
	 * :	Removes the given class from all the nodes in the selection.
	 *
	 *      This uses `Node.classList` with a custom fallback that works for
	 *      DOM & SVG nodes.
	 */
	removeClass(className) {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (node.classList) {
				node.classList.remove(className);
			} else {
				const c = node.getAttribute("class");
				if (c && c.length > 0) {
					const m = c.indexOf(className);
					if (m >= 0) {
						// We only do something if there's a match
						const la = c.length || 0;
						const lc = className.length;
						const nc = "";
						// NOTE: This is an optimized version of the classlist. We could do
						// a simple split/join, but I *assume* this is faster. Premature
						// optimization FTW!
						while (m >= 0) {
							const p = n - 1;
							const n = m + lc;
							// If the className is surrounded by spaces or start/end, then
							// we can remove it.
							if (
								(m == 0 || c[p] == " ") &&
								(n == la || c[n] == " ")
							) {
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

	/**
	 * `Selection.hasClass(name:String?)`
	 *
	 * :	Tells if there is at least one node that has the given class
	 */
	hasClass(name) {
		const lc = (name || "").length;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (typeof node.classList != "undefined") {
				return node.classList.contains(name);
			} else {
				const c = node.className || "";
				if (c & (c.length > 0)) {
					const m = c.indexOf(name);
					if (m >= 0) {
						const la = c.length || 0;
						const p = m - 1;
						const n = m + lc + 1;
						// If the className is surrounded by spaces or start/end, then
						// we have a match.
						if (
							(m == 0 || c[p] == " ") &&
							(m == la || c[n] == " ")
						) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	/**
	 * `Selection.toggleClass(name:String, Value|Predicate?)`
	 *
	 * :	Toggles the class with the given name if the value is true. In
	 * 		case the value is a predicate, it will be invoked with
	 * 		the node and index as arguments.
	 */
	toggleClass(name, value) {
		const sel = select();
		const is_function = value instanceof Function;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			const v = is_function ? value(node, i) : value;
			sel.set(this[i]);
			if (typeof value == "undefined") {
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

	// ----------------------------------------------------------------------------
	//
	// STYLE
	//
	// ----------------------------------------------------------------------------
	/**
	 * Style
	 * -----
	 */

	/**
	 * These function will convert any value to "px" if not given as a string. Also
	 * note that there is no CSS property normalization, they're passed as-is.
	 *
	 * `Selection.css(name:String):Any`
	 *
	 * :	Retrieves the given CSS property
	 *
	 * `Selection.css(name:String, value:Any)`
	 *
	 * :	Sets the given CSS property with the given value
	 *
	 * `Selection.css(values:{String:Any})`
	 *
	 * :	Sets the given CSS properties based on the given map, JSONified if
	 *		not a string.
	 *
	 */
	css(name, value) {
		if (typeof name === "string") {
			if (typeof value === "undefined") {
				// We get the style value
				for (let i = 0; i < this.length; i++) {
					// SEE: http://devdocs.io/dom/window/getcomputedstyle
					const style = document.defaultView.getComputedStyle(
						this[i],
						null,
					)[name];
					if (typeof style != "undefined") {
						return style;
					}
				}
				return undefined;
			} else {
				// We set the style value
				value = typeof value === "string" ? value : value + "px";
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
		return this;
	}

	// ----------------------------------------------------------------------------
	//
	// LAYOUT
	//
	// ----------------------------------------------------------------------------
	/**
	 * Layout
	 * ------
	 */

	/**
	 * `Selection.width():Int`
	 *
	 * :	Returns the width of the first node in the selection in pixels.
	 *
	 *      This uses `getBoundingClientRect()`, returns `0` if the selection
	 *      if empty.
	 */
	width() {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			const nb = node.getBoundingClientRect();
			return nb.right - nb.left;
		}
		return 0;
	}

	/**
	 * `Selection.height():Int`
	 *
	 * :	Returns the height of the first node in the selection in pixels.
	 *
	 *      This uses `getBoundingClientRect()`, returns `0` if the selection
	 *      is empty.
	 */
	height() {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			const nb = node.getBoundingClientRect();
			return nb.bottom - nb.top;
		}
		return 0;
	}

	/**
	 * `Selection.offset():{left:Int, top:Int}`
	 *
	 * :	Returns the `{left,top}` offset of this node, relative to
	 * 		its offset parent.
	 *
	 *      This uses `offsetTop` for DOM nodes and `getBoundingClientRect`
	 *      for SVG nodes.
	 */
	offset() {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			if (Selection.IsDOM(node)) {
				return { left: node.offsetLeft, top: node.offsetTop };
			} else {
				const nb = node.getBoundingClientRect();
				const pb = node.parentNode.getBoundingClientRect();
				return { left: nb.left - pb.left, top: nb.top - pb.top };
			}
		}
		return undefined;
	}

	/**
	 * `Selection.scrollTop(value:Int?):Int`
	 *
	 * :	TODO
	 */
	scrollTop(value) {
		const has_value = value !== undefined;
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
				console.error("Selection.scrollTop: Not implemented for SVG");
			}
		}
		return undefined;
	}

	/**
	 * `Selection.scrollLeft(value:Int?):Int`
	 *
	 * :	TODO
	 */
	scrollLeft(value) {
		const has_value = value !== undefined;
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
				console.error("Selection.scrollLeft: Not implemented for SVG");
			}
		}
		return undefined;
	}

	// ----------------------------------------------------------------------------
	//
	// SELECTION
	//
	// ----------------------------------------------------------------------------

	/**
	 * Selection
	 * ---------
	 */

	/**
	 * `Selection.focus():Selection
	 *
	 * :	Sets the focus on the first node of this selection.
	 *
	 * `Selection.focus(callback):Selection
	 *
	 * :	Binds the given `callback` to the focus event. See Events section.
	 */
	focus(callback) {
		if (typeof callback == "undefined") {
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (node.focus) {
					node.focus();
					if (document.activeElement == node) {
						return this;
					}
				}
			}
			return this;
		} else {
			return this.bind("select", callback);
		}
	}

	/**
	 * `Selection.select():Selection
	 *
	 * :	Selects all the elements in this selection
	 *
	 * `Selection.select(callback):Selection
	 *
	 * :	Binds the given `callback` to the select event. See Events section.
	 */
	select(callback) {
		if (typeof callback == "undefined") {
			const s = window.getSelection();
			s.removeAllRanges();
			for (let i = 0; i < this.length; i++) {
				const node = this[i];
				if (node.select) {
					node.select();
				} else {
					const r = new Range();
					// We want to select the contents, no the node itself
					if (node.nodeType == node.TEXT_NODE) {
						r.selectNode(node);
					} else {
						r.selectNodeContents(node);
					}
					// We clear any other range
					s.removeAllRanges();
					s.addRange(r);
				}
			}
			return this;
		} else {
			return this.bind("select", callback);
		}
	}

	// ----------------------------------------------------------------------------
	//
	// EVENTS
	//
	// ----------------------------------------------------------------------------

	/**
	 * Events
	 * ------
	 */

	/**
	 * `Selection.bind(event:String, callback:Function[event], capture:Bool?)`
	 *
	 * :	Binds the given `callback` to handle the given `event` in the
	 * 		selected elements.
	 */
	bind(event, callback, capture) {
		capture = capture && true;
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			node.addEventListener(event, callback, capture);
		}
		return this;
	}

	/**
	 * `Selection.unbind(event:String, callback:Function[event])`
	 *
	 * :	Unbinds the given `callback` to handle the given `event` in the
	 * 		selected elements.
	 */
	unbind(event, callback) {
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			node.removeEventListener(event, callback);
		}
		return this;
	}

	/**
	 * `Selection.trigger(event:Event|String)`
	 *
	 * :	Dispatches the given `event`, given by name or value. If
	 * 		the event is a string, then the event will be created
	 * 		using `document.createEvent`. In all cases, it will be
	 * 		dispatched using `<node>.dispatchEvent`.
	 *
	 * 		See <https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Creating_and_triggering_events> for more details.
	 */
	trigger(event) {
		// NOTE: We're doing custom event here, but we might want to be a little
		// bit smarter than that.
		if (typeof event === "string") {
			// SEE: http://stackoverflow.com/questions/5342917/custom-events-in-ie-without-using-libraries
			// was before: event = new CustomEvent(event);  (does not work on IE11)
			const name = event;
			event = document.createEvent("HTMLEvents");
			event.initEvent(name, true, true);
		}
		for (let i = 0; i < this.length; i++) {
			const node = this[i];
			node.dispatchEvent(event);
		}
		return this;
	}

	/**
	 * The following events are readily available as methods from the selection
	 * object:
	 *
	 * Mouse
	 * :
	 *  - `click`
	 *  - `dblclick`
	 *  - `mousedown`
	 *  - `mouseup`
	 *  - `mouseover`
	 *  - `mousemove`
	 *  - `mouseout`
	 *  - `mouseenter`
	 *  - `mouseleave`
	 *
	 * Drag
	 * :
	 *  - `dragstart`
	 *  - `drag`
	 *  - `dragenter`
	 *  - `dragleave`
	 *  - `dragend`
	 *  - `dragover`
	 *  - `drop`
	 *
	 * Keyboard
	 * :
	 *  - `keydown`
	 *  - `keypress`
	 *  - `keyup`
	 *
	 * Body
	 * :
	 *  - `load`
	 *  - `unload`
	 *
	 * Window
	 * :
	 *  - `resize`
	 *  - `scroll`
	 *
	 * Forms
	 * :
	 *  - `select`
	 *  - `change`
	 *  - `submit`
	 *  - `reset`
	 *  - `blur`
	 *  - `focusin`
	 *  - `focusout`
	 *
	 */
	// SEE: https://en.wikipedia.org/wiki/DOM_events
	// Here we opt for a code generation approach. This adds a minor performance
	// penalty at loading, and saves a few lines.
	// static EVENTS = [
	// 	"click",     "dblclick",
	// 	"mousedown", "mouseup",  "mouseover", "mousemove", "mouseout", "mouseenter", "mouseleave",
	// 	"dragstart", "drag",     "dragenter", "dragleave", "dragover",
	// 	"drop",      "dragend",
	// 	"keydown",   "keypress", "keyup",
	// 	"load",      "unload",   "resize",    "scroll",
	// 	"select",    "change",   "input",
	// 	"submit",    "reset",
	// 	"focus",     "blur",
	// 	"focusin",   "focusout"
	// ].reduce( (r,event) => {
	// 	// NOTE: We do not redefine/override functions
	// 	if (typeof Selection.prototype[event] == "undefined") {
	// 		Selection.prototype[event] = function(callback, capture){
	// 			return this.bind(event, callback, capture);
	// 		}
	// 	}
	// 	return r;
	// });

	// ----------------------------------------------------------------------------
	//
	// SPECIFIC
	//
	// ----------------------------------------------------------------------------

	/**
	 * Helpers & Misc
	 * --------------
	 */

	/**
	 * `Selection.n[ode](index?):Node|undefined`
	 *
	 * :	Returns node with the given index (or first one) directly as a node.
	 * 		This is similar to `eq`, except that it returns the node instead
	 * 		of a selection.
	 */
	node(index) {
		index = index || 0;
		index = index < 0 ? this.length - index : index;
		if (index >= 0 && index < this.length) {
			return this[index];
		} else {
			return undefined;
		}
	}

	/**
	 * `Selection.set(value|[value])`
	 *
	 * :	Sets this selection's content  to be the given node, array
	 *      of nodes or selection.
	 */
	set(value) {
		return this.clear().expand(value);
	}

	/**
	 * `Selection.copy()`
	 *
	 * :	Creates a copy fo the selection, but not a copy of the nodes.
	 */
	copy(value) {
		return new Selection().expand(value);
	}

	/**
	 * `Selection.clear(length)`
	 *
	 * :	Clears the current selection until there are only `length` elements
	 *      available.
	 */
	clear(length) {
		length = length || 0;
		super.splice(length, this.length - length);
		return this;
	}

	/**
	 * `Selection.expand(element|elements)`
	 *
	 * :	Expands the selection with the given element(s). Non-element
	 *      values will be filtered out.
	 */
	expand(element) {
		// We normalize the element
		if (element == window || element == document) {
			element = document.firstElementChild;
		}
		if (!element || element.length == 0) {
			return this;
		} else if (typeof element === "string") {
			return this.expand(query(element));
		} else if (Selection.IsElement(element)) {
			this.push(element);
		} else if (element.nodeType == Node.DOCUMENT_NODE) {
			// NOTE: This does not work on some mobile browsers.
			this.expand(element.firstElementChild);
		} else if (element instanceof NodeList || Selection.IsList(element)) {
			for (let i = 0; i < element.length; i++) {
				this.expand(element[i]);
			}
		} else {
			console.error("Selection.expand: Unsupported argument", element);
		}
		return this;
	}
}
// ----------------------------------------------------------------------------
//
// MAIN
//
// ----------------------------------------------------------------------------

/** CUT:MODULE **/
/**
 * The `select` module
 * -------------------
 *
 * Once loaded, *select.js* will be available as an object/module
 * named `select` in the global scope. The module can be invoked as
 * follows to create a selection:
 *
 * `select(selector, scope)`
 *
 * :	The main function used to create a selection.
 *
 * The `select` object (module) also has the following properties
 *
 * - `VERSION` as `M.m.R` (`M`ajor, `m`inor, `R`evision)
 * - `NAME` (`select`)
 * - `LICENSE`, the URL to the license file
 * - `STATUS` as `LOADING` or `LOADED`
 *
 * The module will also be registered at the following locations:
 *
 * - `window.select`
 * - `window.$` and `window.S` if these values are not defined
 * - `extend.modules.select` if the Extend library is loaded.
 *
 */
export const select = (selector, scope) => {
	return Selection.Is(selector) && !scope
		? selector
		: new Selection(selector, scope);
};

// NOTE: This is a bit recursive as the select is actually a factory function
// for Selection object, but we also copy the top-level module attributes in
// it.
//
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
export const S = select;
export const $ = select;
export default select;

/* EOF - @LITERATE */
