/**
 *
 * # Select.js
 * ## A small jQuery-like library for DOM+SVG manipulation
 *
 * ```
 * Version :  ${VERSION}
 * URL     :  http://github.com/sebastien/select.js
 * ```
 * 
 * Select is a small subset of jQuery's functions implemented for DOM and SVG
 * nodes, and targetting modern browsers. It is a thing wrapper around HTML5
 * DOM & SVG APIs. It uses strict CSS-3 selector
 * query, and as such won't work as a drop-in replacement to jQuery, but will
 * make a transition easier.
 *
 * We use it internally at [FFunction](http://ffctn.com) as most of the extra features present
 * in jQuery (events, promises, requests, animations) are already handled
 * by our specialized modules, and that jQuery does not work well for SVG 
 * nodes, which we manipulate a lot.
 *
 * That being said, jQuery dramatically
 * improved the quality of the Web as an environment, and it definitely
 * enabled us to focus on creating great applications. [Things have changed](http://youmightnotneedjquery.com/)
 * for the better now, and we don't need so much of a compatibilitjQueryy layer
 * anymore.
 *
 * The functions currently implemented are the following, available withing
 * the `modules.select` object (which you should alias to `$`).
 *
 * Selection
 * :	
 *  - `find(selector)`
 *  - `filter(selector)`
 *  - `is(selector)`
 *  - `forEach(callback)`
 *
 * Traversal
 * :	
 *  - `first()`
 *  - `last()`
 *  - `eq(index)`
 *  - `next(selector?)`
 *  - `prev[ious](selector?)`
 *  - `parent(selector?)`
 *  - `parents(selector?)`
 *  - `ancestors(selector?)`
 *
 * Manipulation:
 * :	
 *  - `append(value)`
 *  - `remove()`
 *  - `after(value)`
 *  - `before(value)`
 *  - `clone()`
 *  - `attr(attribute, value)`/`attr(attributes)`
 *  - `css(attribute, value)`/`css(attributes)`
 *  - `html(value?)`
 *  - `text(value?)`
 *  - `val(value?)`
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
 * Events:
 * :	
 *  - `bind(event, callback)`
 *  - `change(event, callback)`
 *  - `submit(event, callback)`
 *  - `click(event, callback)`
 *  - `keyup(event, callback)`
 *  - `keydown(event, callback)`
 *  - `keypress(event, callback)`
 *
 * New (not in jQuery):
 * :	
 * -  `n[ode]()`
 * -  `set(value)`
 * -  `clear(length)`
 * -  `expand(element|[element])`
 *
 * Differences with jQuery
 * -----------------------
 *
 * - SVG nodes are supported
 * - Only modern browsers are supported (IE10+)
 * - Only a subset of jQuery's functions are implemented (see above)
 * - Select filters out any node that is not an element node (in particular, the document node)
 * - Selectors are only CSS3 (ie. no Sizzle/jQuery extended syntax)
 * - No name/key/selector normalization (for performance)
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
 * $ == S == modules.select
 * ```
 *
 *
 * Extending
 * ---------
 *
 * Select is ready for being extended (or "monkey-patched") if you prefer. Simply
 * extend the prototype:
 *
 * ```
 * modules.select.Selection.prototype.<YOUR NEW METHOD> = function(...) {
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

// TODO: Add flyweight pattern in order to recycle selection and not put too
// much strain on GC.
// TODO: Remove dependency on Sizzle, it weight way too much for what it brings.
// TODO: Updated documentation so that Node -> Element where relevant
// FIXME: Should have a clear strategy on selecting text and nodes, especially

// -- MODULE DECLARATION ------------------------------------------------------
var modules = typeof extend != "undefined" && extend.Modules || typeof modules!= "undefined" && modules || {};
var select  = S = $ = (function(modules) {

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

var _match = null;
if      (Element.prototype.matches)               {_match = 1;}
else if (Element.prototype.mozMatchesSelector)    {_match = 2;}
else if (Element.prototype.webkitMatchesSelector) {_match = 3;}

/**
 * `select.match(selector:String, node:Node):Boolean`
 *
 * :   Tells if the given `node` matches the given selector. This
 *     function uses `Node.{matches|mozMatchesSelector|webkitMatchesSelector}`
 *     or falls back to a default (obviously slower) implementation.
 *
 *      The function returns `true` or `false`
*/
var match = _match ? function(selector, node) {
	switch (_match) {
		case 1:
			return node && node.matches && node.matches(selector);
		case 2:
			return node && node.mozMatchesSelector && node.mozMatchesSelector(selector);
		case 3:
			return node && node.webkitMatchesSelector && node.webkitMatchesSelector(selector);
		default:
			console.error("select.match: browser not supported");
			select.STATUS = "FAILED";
			return node.matches(selector);
	}
} : function (selector, node ) {
	// NOTE: This is an implemnetation of matchSelector replacing one that
	// would not be already available.
	var parent   = node.parentNode;
	var matching = parent.querySelectorAll(selector);
	var i        = 0;
	for (var i=0 ; i < matching.length ; i++ ) {
		if (matching[i] === node) {
			return true;
		}
	}
	return false;
}

/**
 * `select.query(selector:String, node:Node?):[Element]`
 *
 * :	Queries all the descendants of node that match the given selector. This
 *		is a wrapper around `Elemetn.querySelectorAll`.
 *
 *       function returns an array of the matching element nodes.
*/
var query = function(selector, scope) {
	selector = selector.trim();
	if (!selector || selector.length == 0) {
		return [scope];
	} else if (selector[0] == ">" ) {
		selector   = selector.substr(1).trim();
		var result = [];
		var nodes  = (scope||document).childNodes;
		for (var i=0 ; i<nodes.length ; i++) {
			var n = nodes[i];
			if (match(selector, n) && n.nodeType == Node.ELEMENT_NODE) {
				result.push(n);
			}
		}
		return result;
	} else {
		var result = [];
		var nodes  = (scope||document).querySelectorAll(selector);
		for (var i=0 ; i<nodes.length ; i++ ) {
			var node = nodes[i];
			if ( node.nodeType == Node.ELEMENT_NODE ) {
				result.push(node);
			}
		}
		return result;
	}
}

/**
 * `select.query(selector:String, node:Node?):[Node]`
 *
 * :	Filtes all the nodes that match the given selector. This is a wrapepr
 * 		around `select.filter`. 
 *
 *      This function returns the subset of the array with matching nodes.
*/
var filter = function(selector, nodes) {
	var result = [];
	for (var i=0 ; i<nodes.length ; i++ ) {
		var node=nodes[i];
		if (match(selector, node)) {
			result.push(node);
		}
	}
	return result;
}

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
var Selection  = function( selector, scope) {
	var nodes = null;
	if (typeof selector == "string") {
		// The selector is a string, so we need to find the query.
		if (!scope) {
			nodes = query(selector);
		} else {
			// We have a scope, so we query it already. 
			scope = modules.select(scope);
			// Now we restrict the selector to the matching result.
			nodes = scope.find(selector);
		} 
	} else if (Selection.IsList(selector) || Selection.IsNode(selector)) {
		// If the selector is a list, we just copy it as is
		nodes = selector;
	} else if (selector) {
		console.error("Selection.new: selector should be String, Array, NodeList, Node or nothing, got", selector)
	} 
	this.set(nodes);
	this.selector    = selector;
	this.scope       = scope;
	this.isSelection = true;
	this.__class__   = Selection;
	return this;
};

// SEE: http://dean.edwards.name/weblog/2006/11/hooray/
Selection.prototype = new Array();

// ----------------------------------------------------------------------------
// 
// PREDICATES
//
// ----------------------------------------------------------------------------
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
Selection.Is = function (s) {
	return s && (s.__class__ === Selection);
}

/**
 * `Selection.IsList(value)`
 * 
 * :	Tells if the given value is a `Selection`, `Array` or `NodeList`
 *
*/
Selection.IsList = function (s) {
	return s instanceof Selection || s instanceof Array || s instanceof NodeList;
}

/**
 * `Selection.IsElement(node)`
 * 
 * :	Tells if the given value is a DOM or SVG element
 *
 * 		select.Selection.IsElement(document.createElement("div"));
 * 		select.Selection.IsElement(document) == false
*/
Selection.IsElement = function (node) {
	return node && typeof(node.nodeType) != "undefined" && node.nodeType == Node.ELEMENT_NODE;
}

/**
 * `Selection.IsNode(node)`
 * 
 * :	Tells if the given value is a DOM or SVG node
 *
 * 		select.Selection.IsNode(document.createElement("div")) == true
 * 		select.Selection.IsNode(document) == true
*/
Selection.IsNode = function (node) {
	return node && typeof(node.nodeType) != "undefined";
}

/**
 * `Selection.IsDom(node)`
 *
 * :	Tells wether the node is a DOM node or not
 *
 * 		select.Selection.IsDOM(document.createElement("div")) == true;
 * 		select.Selection.IsDOM(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == false;
*/
Selection.IsDOM = function (node) {
	return node && typeof(node.getBBox) === "undefined";
}

/**
 * `Selection.IsDOM(node)`
 * 
 * :	Tells wether the node is an SVG node or not
 *
 * 		select.Selection.IsSVG(document.createElement("div")) == false;
 * 		select.Selection.IsSVG(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == true;
*/
Selection.IsSVG = function (node) {
	// SEE: http://www.w3.org/TR/SVG11/types.html#__svg__SVGLocatable__getBBox
	return typeof(node.getBBox) != "undefined";
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
 *
 *      - `selector` is expected to be a string
 *      - the resulting selection will be flat (ie. an array of node)
 *
 *      ```
 *      select().find("div")
 *      select("ul").find("li")
 *      ```
*/
Selection.prototype.find  = function( selector ) {
	var nodes = [];
	// NOTE: We're dealing with NodeList, so no fancy reduce, etc
	for (var i=0 ; i<this.length ; i++) {
		var node = this[i];
		// var q    = query (selector, node);
		q = [];
		// This is to prevent for loop scope issues.
		for (var j=0 ; j<q.length ; j++ ) {
			nodes.push(q[j]);
		}
	};
	return new Selection (nodes.length > 0 ? nodes : query(selector), this.length > 0 ? this : undefined);
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
Selection.prototype.filter = function( selector ) {
	return new Selection (filter(selector, this), this.length > 0 ? this : undefined);
}

/**
 * `Selection.forEach(callback:Function(element, index)`
 * 
 * :	Invokes the given callback for each element of the selection. Breaks
 * 		if the callback returns false.
*/
Selection.prototype.forEach = function( callback ) {
	var nodes = this;
	for (var i=0 ; i<nodes.length ; i++ ) { 
		if (callback(nodes[i], i) === false) {
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
Selection.prototype.is = function( selector ) {
	var result = this.length > 0;
	for (var i=0 ; i<this.length ; i++ ) {
		if (!select.match(selector, this[i])) {
			result = false;
			break;
		}
	}
	return result;
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
Selection.prototype.first = function() {
	return this.length <= 1 ? this : select([this[0]], this);
}

/**
 * `Selection.last()` 
 *
 * :	Returns a new selection made of the *last node* of this selection. If the
 * 		selection is empty or made of 1 node, this function is transparent.
*/
Selection.prototype.last = function() {
	return this.length <= 1 ? this : select([this[this.length - 1]], this);
}

/**
 * `Selection.eq(index:Integer)`
 *
 * :	Returns a new selection made of the *node at the given `index`*.
 * 		if `index` is negative, then the index will be relative to the end
 * 		of the nodes array. If the index is out of the node array bounds,
 * 		the `Empty` selection is returned.
*/
Selection.prototype.eq = function(index) {
	index = index < 0 ? this.length + index : index ;
	if (this.length == 1 && index == 0) {
		return this;
	} else {
		return 0 <= index < this.length ? select([this[index]], this) : select.Empty;
	}
}

/**
 * `Selection.next(selector:String?)`
 *
 * :	Selects each next sibling element of the current selection. If 
 * 		`selector` is given, only the matching elements will be added.
*/
Selection.prototype.next = function(selector) {
	var nodes = [];
	for (var i=0 ; i<this.length ; i++) {
		var node    = this[i];
		var sibling = node.nextElementSibling;
		if (sibling && (!selector || match(selector, node))) {nodes.push(sibling)}
	};
	return nodes.length > 0 ? select(nodes, this) : select.Empty;
}

/**
 * `Selection.previous(selector:String?)`
 *
 * :	Selects each previous sibling element of the current selection. If 
 * 		`selector` is given, only the matching elements will be added.
*/
Selection.prototype.previous = Selection.prototype.prev = function(selector) {
	var nodes = [];
	for (var i=0 ; i < this.length ; i++) {
		var node    = this[i];
		var sibling = node.previousElementSibling;
		if (sibling && (!selector || match(selector, node))) {nodes.push(sibling)}
	};
	return nodes.length > 0 ? select(nodes, this) : select.Empty;
}

/**
 * `Selection.parent(selector:String?)`
 *
 * :	Returns a selection of the direct parents of the current selected
 * 		nodes. If a selector is given, only the matching parents
 * 		will be returned.
*/
Selection.prototype.parent = function(selector) {
	var nodes = [];
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i].parentNode;
		if (node && (!selector || match(selector, node))) {
			nodes.push(node);
		}
	}
	return nodes.length > 0 ? select(nodes, this) : select.Empty;
}

/**
 * `Selection.ancestors(selector:String?)`
 *
 * :	Returns a selection of the ancestors of the current selected
 * 		nodes. If a selector is given, only the matching parents
 * 		will be returned.
*/
Selection.prototype.ancestors = Selection.prototype.parents = function( selector ) {
	var nodes = [];
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i].parentNode;
		while (node) {
			if (!selector || match(selector, node)) {
				nodes.push(node);
			}
			node = node.parentNode;
		}
	}
	return nodes.length > 0 ? select(nodes, this) : select.Empty;
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
 * `Selection.append(value:Node|[Node]|Selection)`
 *
 * :	Appends the given nodes to the first node in the selection
*/
Selection.prototype.append = function( value ) {
	if (this.length == 0) { return this; }
	var node = this[0];
	if (Selection.Is(value)) {
		for (var i=0 ; i<value.length ; i++) {
			node.appendChild(value[i]);
		}
	} else if (typeof value.length != "undefined") {
		for (var i=0 ; i<value.length ; i++) {
			node.appendChild(value[i]);
		}
	} else if (typeof value.nodeType != "undefined") {
		node.appendChild(value);
	} else {
		console.error("Selection.append: value is expected to be Node, [Node] or Selection, got", value)
	}
}

/**
 * `Selection.after(value:Node|[Node]|Selection)`
 *
 * :	Appends the given nodes after first node in the selection
*/
Selection.prototype.after = function( value ) {
	if (this.length == 0) { return this; }
	var node = this[0];
	var scope = node;
	// NOTE: From an implementation standpoint, `after` is more complicated
	// than `before` as we don't have an `insertAfter` in the DOM.
	//
	// We get the next sibling. If scope is empty, then we'll need to add 
	// a child to the parent
	while (scope && !Selection.IsElement(scope.nextSibling)) {scope = scope.nextSibling;}
	if (scope) {
		// If we have a scope, this means we invoke insertBefore
		if (Selection.Is(value)) {
			for (var i=0 ; i<value.length ; i++) {
				scope.insertBefore(value[i]);
			}
		} else if (typeof value.length != "undefined") {
			for (var i=0 ; i<value.length ; i++) {
				scope.insertBefore(value[i]);
			}
		} else if (typeof value.nodeType != "undefined") {
			scope.insertBefore(value);
		} else {
			console.error("Selection.after: value is expected to be Node, [Node] or Selection, got", value)
		}
	} else {
		scope = scope.parentNode;
		if (Selection.Is(value)) {
			for (var i=0 ; i<value.length ; i++) {
				scope.appendChild(value[i]);
			}
		} else if (typeof value.length != "undefined") {
			for (var i=0 ; i<value.length ; i++) {
				scope.appendChild(value[i]);
			}
		} else if (typeof value.nodeType != "undefined") {
			scope.appendChild(value);
		} else {
			console.error("Selection.after: value is expected to be Node, [Node] or Selection, got", value)
		}
	}
}

/**
 * `Selection.before(value:Node|[Node]|Selection)`
 *
 * :	Appends the given nodes before first node in the selection
*/
Selection.prototype.before = function( value ) {
	if (this.length == 0) { return this; }
	var node = this[0];
	var scope = node;
	// If we have a scope, this means we invoke insertBefore
	if (Selection.Is(value)) {
		for (var i=0 ; i<value.length ; i++) {
			scope.insertBefore(value[i]);
		}
	} else if (typeof value.length != "undefined") {
		for (var i=0 ; i<value.length ; i++) {
			scope.insertBefore(value[i]);
		}
	} else if (typeof value.nodeType != "undefined") {
		scope.insertBefore(value);
	} else {
		console.error("Selection.before: value is expected to be Node, [Node] or Selection, got", value)
	}
	return this;
}

/**
 * `Selection.after(value:Node|[Node]|Selection)`
 *
 * :	Appends the given nodes after first node in the selection
*/
Selection.prototype.after = function( value ) {
	if (this.length == 0) { return this; }
	var node = this[0];
	var scope = node;
	// We get the next sibling. If scope is empty, then we'll need to add 
	// a child to the parent
	while (scope && !Selection.IsElement(scope.nextSibling)) {scope = scope.nextSibling;}
	if (scope) {
		// If we have a scope, this means we invoke insertBefore
		if (Selection.Is(value)) {
			for (var i=0 ; i<value.length ; i++) {
				scope.insertBefore(value[i]);
			}
		} else if (typeof value.length != "undefined") {
			for (var i=0 ; i<value.length ; i++) {
				scope.insertBefore(value[i]);
			}
		} else if (typeof value.nodeType != "undefined") {
			scope.insertBefore(value);
		} else {
			console.error("Selection.after: value is expected to be Node, [Node] or Selection, got", value)
		}
	} else {
		scope = scope.parentNode;
		if (Selection.Is(value)) {
			for (var i=0 ; i<value.length ; i++) {
				scope.appendChild(value[i]);
			}
		} else if (typeof value.length != "undefined") {
			for (var i=0 ; i<value.length ; i++) {
				scope.appendChild(value[i]);
			}
		} else if (typeof value.nodeType != "undefined") {
			scope.appendChild(value);
		} else {
			console.error("Selection.after: value is expected to be Node, [Node] or Selection, got", value)
		}
	}
}

/**
 * `Selection.clone()`
 *
 * :	Clones the first node of this selection
*/
Selection.prototype.clone = function( value ) {
	if (this.length == 0) { return this; }
	var node = this[0];
	return select(node.cloneNode(true), this);
}

/**
 * `Selection.empty()`
 *
 * :	Removes all the children from all the nodes in the selection
*/
Selection.prototype.empty = function( ) {
	for (var i=0 ; i<this.length ; i++ ) {
		var node = this[i];
		while (node.firstChild) { node.removeChild(node.firstChild);}
	}
	return this;
}

/**
 * `Selection.val(value?)`
 *
 * :	When `value` is not specified ,retrieves the first non-null
 *		value for the given input fields. If value is specified, then
 *		the value will be set in all fields.
*/
Selection.prototype.val      = function( value ) {
	if (typeof value == "undefined") {
		for (var i=0 ; i < this.length ; i++ ) {
			var node = this[i];
			if (typeof node.value != "undefined") {
				return node.value;
			}
		}
		return undefined;
	} else {
		value = "" + value;
		for (var i=0 ; i < this.length ; i++ ) {
			var node = this[i];
			if (typeof node.value != "undefined") {
				return node.value = value;
			}
		}
		return this;
	}
}


/**
 * `Selection.text(value:String?)`
 *
 * :	When `value` is not specified, retrieves the first non-null
 *		text value for the nodes in the selection, otherwise sets the
 *		text for all nodes as the given string.
 *
 *      Note that if `value` is not a string, it will be JSONified.
 *
 *      This uses [`Node.textContent`](http://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-textContent)
*/
Selection.prototype.text = function( value ) {
	var result = undefined;
	if (typeof value == "undefined") {
		for (var i=0 ; i < this.length ; i++ ) {
			var node = this[i];
			result   = node.textContent;
			if (result) {
				return result;
			}
		}
		return result;
	} else {
		value = typeof value === "string" ? value : JSON.stringify(value);
		for (var i=0 ; i < this.length ; i++ ) {
			var node = this[i];
			node.textContent = value;
		}
		return this;
	}
}

/**
 * `Selection.html(value:String|Selection|Node|[Node]?):this`
 *
 * :	When `value` is not specified, retrieves the first non-null
 *		HTML value for the nodes in the selection, otherwise sets the
 *		HTML for all nodes as the given string.
 *
 *      This uses [`Node.innerHTML`](https://dvcs.w3.org/hg/innerhtml/raw-file/tip/index.html#innerhtml)
*/
Selection.prototype.html      = function( value ) {
	var result = undefined;
	if (typeof value == "undefined") {
		for (var i=0 ; i < this.length ; i++ ) {
			var node = this[i];
			result   = node.innerHTML;
			if (result) {
				return result;
			}
		}
		return result;
	} else {
		if (!value || typeof value === "string") {
			value = value || "";
			for (var i=0 ; i < this.length ; i++ ) {
				var node = this[i];
				node.innerHTML = value;
			}
			return this;
		} else {
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
 * :	Retrieves the given attribue value
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
Selection.prototype.attr        = function(name, value) {
	if (typeof name === "string") {
		if (typeof value === "undefined") {
			// We get the style value
			for (var i=0 ; i<this.length ; i++ ) {
				var node = this[i];
				if (node.hasAttribute(name)) {
					return node.getAttribute(name);
				}
			}
			return undefined;
		} else {
			// We set the style value
			value = typeof value === "string" ? value : JSON.stringify(value);
			for (var i=0 ; i<this.length ; i++ ) {
				this[i].setAttribute(name, value);
			}
			return this;
		}
	} else if (name) {
		for (var k in name) {this.attr(k, name[k]);}
		return this;
	} 
	return this;
};

/**
 *
 * ### `Selection.data()`
 *
 * `Selection.data():{String:Any}`
 *
 * :	Retrieves all the data attributes as a map
 *
 * `Selection.data(name:String):Any`
 *
 * :	Retrieves the given data attribute
 *
 * `Selection.data(name:String, value:Any)` 
 *
 * :	Sets the given data attribute with the given value, JSONified if
 *		not a string.
 *
 * `Selection.data(values:{String:Any})`
 *
 * :	Sets the given data attributes based on the given map, JSONified if
 *		not a string.
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
Selection.prototype.data      = function( name, value  ) {
	if (!name) {
		for (var i=0 ; i < this.length ; i++ ) {
			var node = this[i];
			if (node.dataset) {
				return node.dataset;
			}
		}
		return null;
	} else if (typeof name === "string") {
		// We retrieve/set a specific data attribute
		var data_name = "data-" + name;
		if (typeof value == "undefined") {
			for (var i=0 ; i < this.length ; i++ ) {
				var node = this[i];
				var serialized = undefined;
				// We need to support both HTML elements and SVG nodes
				if (typeof node.dataset != "undefined") {
					var result = node.dataset[name]
					if (typeof result != "undefined") {
						return result;
					}
				} else {
					if (node.hasAttribute(data_name)) {
						return JSON.parse(node.getAttribute(data_name))
					}
				}
			}
			return this;
		} else {
			for (var i=0 ; i < this.length ; i++ ) {
				var node = this[i];
				var serialized = undefined;
				// We need to support both HTML elements and SVG nodes
				if (typeof node.dataset != "undefined") {
					node.dataset[name] = value;
				} else {
					if (typeof serialized == "undefined") {serialized = typeof value === "string" ? value : JSON.stringify(value)}
					node.setAttribute(data_name, serialized);
				}
			}
			return this;
		}
	} else {
		// We retrieve/set a collection specific data attribute
		for (var k in name) {
			this.data(k, name[k]);
		}
		return this;
	}
}

/**
 * ### `Selection.[add|remove|has]Class()`
 *
 * `Selection.addClass(name:String?)`
 *
 * :	Adds the given class to all the nodes in the selection.
 * 
 *      This uses `Node.classList` with a custom fallback that works for
 *      DOM & SVG nodes.
*/
Selection.prototype.addClass    = function( className ) {
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i];
		if (node.classList) {
			// If the node has a classList, we use it directly
			node.classList.add(className)
		} else {
			// Otherwise we emulate it directly
			var c   = node.getAttribute("class");
			if (c && c.length > 0) {
				var m   = c.indexOf(className);
				var la  = c.length || 0;
				var lc  = className.length;
				var p = n - 1;
				var n = m + lc;
				// If the className is not surrounded by spaces or start/end, then
				// we can add it
				if ( ! (((m == 0)  || (c[p] == " ")) && ((n == la) || (c[n] == " "))) ) {
					node.setAttribute (c + " " + className);
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
Selection.prototype.removeClass = function( className ) {
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i];
		if (node.classList) {
			node.classList.remove(className)
		} else {
			var c   = node.getAttribute("class");
			var m   = c.indexOf(className);
			if (m >= 0) {
				// We only do something if there's a match
				var la  = c.length || 0;
				var lc  = className.length;
				var nc  = "";
				// NOTE: This is an optimized version of the classlist. We could do
				// a simple split/join, but I *assume* this is faster. Premature
				// optimization FTW!
				while (m >= 0) {
					var p = n - 1;
					var n = m + lc;
					// If the className is surrounded by spaces or start/end, then
					// we can remove it.
					if (((m == 0)  || (c[p] == " ")) && ((n == la) || (c[n] == " "))) {
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
	return this;
};

/**
 * `Selection.hasClass(name:String?)`
 *
 * :	Tells if there is at least one node that has the given class
*/
Selection.prototype.hasClass = function(name) {
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i];
		if (typeof(node.classList) != "undefined") {
				return node.classList.contains(name);
		} else {
			var c   = node.className;
			if (c) {
				var m   = c.indexOf(className);
				var la  = c.length || 0;
				var lc  = className.length;
				// If the className is surrounded by spaces or start/end, then
				// we have a match.
				if (((m == 0)  || (c[p] == " ")) && ((n == la) || (c[n] == " "))) {
					return true;
				}
			}
		}
	}
	return false;
};

/**
 * `Selection.hasClass(name:String?)`
 *
 * :	Tells if there is at least one node that has the given class
*/
Selection.prototype.toggleClass = function(name, value) {
	var sel = select();
	for (var i=0 ; i < this.length ; i++ ) {
		sel.set(this[i]);
		if      (typeof value == "undefined") {
			if (sel.hasClass(name)) {sel.removeClass(name);}
			else                    {sel.addClass(name);}
		} else if ( value && !sel.hasClass(name)) {
			sel.addClass   (name); 
		} else if (!value &&  sel.hasClass(name)) {
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
Selection.prototype.css         = function(name, value) {
	if (typeof name === "string") {
		if (typeof value === "undefined") {
			// We get the style value
			for (var i=0 ; i<this.length ; i++ ) {
				var style = this[i].style[name];
				if (typeof style != "undefined") {
					return style;
				}
			}
			return undefined;
		} else {
			// We set the style value
			value = typeof value === "string" ? value : value + "px";
			for (var i=0 ; i<this.length ; i++ ) {
				this[i].style[name] = value;
			}
			return this;
		}
	} else {
		for (var k in name) {this.css(k, name[k]);}
		return this;
	}
	return this;
};

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
Selection.prototype.width = function() {
	for (var i=0 ; i < this.length ; i++ ) {
		var node=this[i];
		var nb = node.getBoundingClientRect();
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
Selection.prototype.height = function() {
	for (var i=0 ; i < this.length ; i++ ) {
		var node=this[i];
		var nb = node.getBoundingClientRect();
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
Selection.prototype.offset      = function() {
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i];
		if (Selection.IsDOM(node)) {
			return {left:node.offsetLeft, top:node.offsetTop};
		} else {
			var nb = node.getBoundingClientRect();
			var pb = node.parentNode.getBoundingClientRect();
			return {left:nb.left - pb.left, top:nb.top - pb.top};
		}
	}
	return undefined;
}

/**
 * `Selection.scrollTop():Int`
 *
 * :	Returns the `{left,top}` offset of this node, relative to
 * 		its offset parent.
 *
 *      This uses `offsetTop` for DOM nodes and `getBoundingClientRect`
 *      for SVG nodes.
*/
Selection.prototype.scrollTop   = function() {
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i];
		if (Selection.IsDOM(node)) {
			return node.scrollTop;
		} else {
			// FIXME: Implement me
			console.error("Selection.scrollTop: Not implemented for SVG")
		}
	}
	return undefined;
}

// ----------------------------------------------------------------------------
// 
// EVENTS
//
// ----------------------------------------------------------------------------

/**
 * `Selection.bind(event:String, callback:Function[event], capture:Bool?)`
 *
 * :	Binds the given `callback` to handle the given `event` in the
 * 		selected elements.
*/
Selection.prototype.bind = function( event, callback, capture ) {
	capture = capture && true;
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i];
		node.addEventListener( event, callback, capture );
	}
	return self;
}

/**
 * `Selection.unbind(event:String, callback:Function[event], capture:Bool?)`
 *
 * :	Unbinds the given `callback` to handle the given `event` in the
 * 		selected elements.
*/
Selection.prototype.unbind = function( event, callback ) {
	capture = capture && true;
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this[i];
		node.removeEventListener( event, callback );
	}
	return self;
}

/**
 *  The following events are readily available as methods from the selection
 *  object:
 *
 *  Mouse:
 *  :
 * - click
 * - dblclick
 * - mousedown
 * - mouseup
 * - mouseover
 * - mousemove
 * - mouseout
 *
 *  Drag
 *  :
 *    - dragstart
 *    - drag
 *    - dragenter
 *    - dragleave
 *    - dragend
 *    - dragover
 *    - drop
 *
 *  Keyboard
 *  :
 * - keydown
 * - keypress
 * - keyup
 *
 *  Body
 *  :
 * - load
 * - unload
 *
 *  Window
 *  :
 * - resize
 * - scroll
 *
 *  Forms
 *  :
 * - select
 * - change
 * - submit
 * - reset
 * - focus
 * - blur
 * - focusin
 * - focusout
 */
// SEE: https://en.wikipedia.org/wiki/DOM_events
// Here we opt for a code generation approach. This adds a minor performance
// penalty at loading, and saves a few lines.
Selection.EVENTS = [
	"click",     "dblclick", 
	"mousedown", "mouseup",  "mouseover", "mousemove", "mouseout",
	"dragstart", "drag",     "dragenter", "dragleave", "dragover",
	"drop",      "dragend", 
	"keydown",   "keypress", "keyup", 
	"load",      "unload",   "resize",    "scroll", 
	"select",    "change",
	"submit",    "reset",
	"focus",     "blur", 
	"focusin",   "focusout"
];
Selection.EVENTS.forEach(function(event){
	Selection.prototype[event] = function(callback, capture){
		return this.bind(event, callback, capture);
	}
})

// ----------------------------------------------------------------------------
// 
// SPECIFIC
//
// ----------------------------------------------------------------------------

/**
 * `Selection.n[ode](index?):Node|undefined`
 *
 * :	Returns node with the given index (or first one) directly as a node.
 * 		This is similar to `eq`, except that it returns the node instead
 * 		of a selection.
*/
Selection.prototype.n = Selection.prototype.node = function(index) {
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
Selection.prototype.set = function(value) {
	return this.clear().expand(value);
}

/**
 * `Selection.clear(length)`
 *
 * :	Clears the current selection until there are only `length` elements
 *      available.
*/
Selection.prototype.clear = function(length) {
	length = length || 0;
	this.splice(length, this.length - length);
	return this;
}

/**
 * `Selection.expand(element|elements)`
 *
 * :	Expands the selection with the given element(s). Non-element
 *      values will be filtered out.
*/
Selection.prototype.expand = function(element) {
	if (!element || element.length == 0) {
		return this;
	} else if (Selection.IsElement(element)) {
		this.push(element);
	} else if (element instanceof NodeList) {
		// NOTE: We don't call expand here as we want to avoid
		// a recursive call per element -- it might be premature optimization.
		for (var i=0 ; i<element.length ; i++) {
			var e = element[i];
			if (Selection.IsElement(e)) {
				this.push(element);
			}
		}
	} else if (Selection.IsList(element)) {
		this.unshift.apply(this, element.filter(Selection.IsElement));
	} else {
		console.error("Selection.expand: Unsupported argument", element)
	}
	return this;
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
var select = function( selector, scope ) {
	return (Selection.Is(selector) && !scope) ? selector :  new Selection (selector, scope );
}

select.Selection = Selection;
select.VERSION   = "0.4.0";
select.NAME      = "select"
select.LICENSE   = "http://ffctn.com/doc/licenses/bsd.html";
select.STATUS    = "LOADED";
select.Empty     = new Selection();
select.filter    = filter;
select.match     = match;
select.query     = query;
modules.select   = select;

// -- MODULE EXPORT -----------------------------------------------------------
if      (typeof extend !== "undefined") {extend.modules.select = select;}
if      (typeof define === "function"  && define.amd )     {define(function(){ return select; });}
else if (typeof module !== "undefined" && module.exports ) {module.exports          = select;}
if      (typeof window !== "undefined") {
	// FIXME: For some reason, that doesn't work
	if (typeof (window.$) == "undefined") {window.$ = window.$ || select;}
	if (typeof (window.S) == "undefined") {window.S = window.S || select;}
}
})(modules);

/** END:MODULE **/

// ----------------------------------------------------------------------------

/**
 * License
 * -------
 *
 *  Revised BSD License
 *
 * Copyright (c) 2015, FFunction inc (1165373771 Québec inc) All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this
 * list of conditions and the following disclaimer. Redistributions in binary
 * form must reproduce the above copyright notice, this list of conditions and
 * the following disclaimer in the documentation and/or other materials
 * provided with the distribution. Neither the name of the FFunction inc
 * (CANADA) nor the names of its contributors may be used to endorse or promote
 * products derived from this software without specific prior written
 * permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
*/

$ = window.modules.select;
/* EOF */
