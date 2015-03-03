/**
 *
 * # Select.js
 * ## A small library for DOM+SVG manipulation
 *
 * ```
 * Version :  ${VERSION}
 * URL     :  http://github.com/sebastien/select.js
 * ```
 * 
 * Select is a small subset of jQuery's features implement for DOM and SVG nodes,
 * targetting modern browsers.
 *
 *
 * We use it internally at [FFunction](http://ffctn.com) as most of the extra features present
 * in jQuery (events, promises, requests, animations) are already handled
 * by our specialized modules, and that jQuery does not work well for SVG 
 * nodes, which we manipulate a lot.
 *
 * Select can be considered as a thin wrapper around Sizzle that is focused on
 * easily querying and navigating the dom. The functions currently implemented
 * are the following:
 *
 * - `find(selector)`
 * - `filter(selector)`
 * - `attr(attribute, value)`/`attr(attributes)`
 * - `css(attribute, value)`/`css(attributes)`
 * - `html(value?)`
 * - `text(value?)`
 * - `val(value?)`
 * - `empty()`
 * - `scrollTop(value?)`
 * - `scrollLeft(value?)`
 * - `first()`
 * - `last()`
 * - `eq(index)`
 * - `next(selector?)`
 * - `previous(selector?)`
 * - `parent(selector?)`
 * - `parents(selector?)`
 * - `ready(callback)`
 *
 * The following are implemented as read-only
 *
 * - `width()`
 * - `height()`
 * - `position()`
 * - `offset()`
 *
 *
 * Here's how to use the library
 *
 * ```
 * // Get a reference to the `select` function, alias it to S
 * $ = modules.select;
 *
 * // Query the elements, and apply the operations
 * $("ul li:even").text("Hello!");
 * ```
 *
 * If you'd like to look at the source code or contribute, Select's home page
 * is at <http://github.com/sebastien/select.js>, feel free to post issues or
 * pull requests.
 *
*/

// TODO: Add flyweight pattern in order to recycle selection and not put too
// much strain on GC.
// TODO: Remove dependency on Sizzle, it weight way too much for what it brings.

// -- MODULE DECLARATION ------------------------------------------------------
var modules = typeof extend != "undefined" && extend.Modules || typeof modules!= "undefined" && modules || {};
var select  = (function(modules) {
// ----------------------------------------------------------------------------

var query  = function(selector, scope) {return Sizzle(selector, scope);}
var filter = function(selector, nodes) {return Sizzle.matches(selector, nodes);}
/*
 * Selection Class
 * ---------------
 *
 * `Selection(selector, scope)`
 *
 * :	Wraps an array of node resulting from the selection of the given
 *		selector in the given scope.
 *
 *		- `selector` can be `String`, `Node`, `Selection` or nothing.
 *		- `scope`    can be `String`, `Node`, `Selection` or nothing.
 *
 *		A selection has the following properties
 *
 *		- `nodes` the array of matching nodes
 *		- `scope` the scope that might be either nothing, a `Node` or a `Selection`
 *		- `length` the length of the `nodes` array, 0 or more.
 *
*/
var Selection  = function( selector, scope) {
	if (typeof selector == "string") {
		if (scope) {
			scope       = modules.select(scope);
			this.nodes  = scope.find(selector).nodes;
		} else {
			this.nodes  = query(selector);
		}
	} else if (Selection.IsNode(selector)) {
		this.nodes = [selector];
	} else if (selector) {
		// TODO: Should check that selector is a either a list of nodes
		this.nodes = Selection.Is(selector) ? selector.nodes : selector;
	} else {
		this.nodes = [];
	}
	this.selector = selector;
	this.scope    = scope;
	this.length   = this.nodes.length;
	this._class   = Selection;
};

// ----------------------------------------------------------------------------
// 
// OPERATIONS
//
// ----------------------------------------------------------------------------
/**
 * Operations
 * ----------
 *
 *  The following functions are utility functions used the `Selection` class, 
 *  but they are also useful generally.
*/

/**
 * `Selection.Is(value)`
 * 
 * :	Tells if the given value is a `Selection` instance
 *
 * 		select.Selection.Is(new Selection ());
*/
Selection.Is = function (s) {
	return s && (s._class === Selection);
}

/**
 * `Selection.IsNode(node)`
 * 
 * :	Tells if the given value is a DOM or SVG node
 *
 * 		select.Selection.IsNodel(document.createElement("div"));
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
 * `Selection.IsDom(node)`
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
 *		- `selector` is expected to be a string
 *		- the resulting selection will be flat (ie. an array of node)
 *
 *		```
 * 		select().find("div")
 * 		select("ul").find("li")
 *		```
*/
Selection.prototype.find  = function( selector ) {
	var nodes = this.nodes.reduce(function(r,node,i){
		var q = query(selector, node);
		return r.concat(q);
	}, []);
	// NOTE: We only add the current selection as a scope if it's not empty,
	return new Selection (nodes.length > 0 ? nodes : query(selector), this.length > 0 ? this : undefined);
}

/**
 * `Selection.filter(selector)`
 * 
 * :	Filters all the nodes within the current selection that match
 * 		the give selector. The resulting selection will have
 * 		this selection as scope only if this selection is not empty.
 *
 *		- `selector` is expected to be a string
 *		- the resulting selection will be flat (ie. an array of node)
*/
Selection.prototype.filter = function( selector ) {
	return new Selection (filter(selector, this.nodes), this.length > 0 ? this : undefined);
}

// ----------------------------------------------------------------------------
// 
// TRAVERSAL
//
// ----------------------------------------------------------------------------

/**
 * Selection.first()
 *
 * :	Returns a new selection made of the *first node* of this selection. If the
 * 		selection is empty or made of 1 node, this function is transparent.
*/
Selection.prototype.first = function() {
	return this.length <= 1 ? this : select([this.nodes[0]], this);
}

/**
 * Selection.last()
 *
 * :	Returns a new selection made of the *last node* of this selection. If the
 * 		selection is empty or made of 1 node, this function is transparent.
*/
Selection.prototype.last = function() {
	return this.length <= 1 ? this : select([this.nodes[this.length - 1]], this);
}

/**
 * Selection.eq(index:Integer)
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
		return 0 <= index < this.length ? select([this.nodes[index]], this) : select.Empty;
	}
}

Selection.prototype.next = function(selector) {
}

Selection.prototype.previous = function(selector) {
}

Selection.prototype.parent = function(selector) {
}

Selection.prototype.parents = function( selector ) {
}


// ----------------------------------------------------------------------------
// 
// CONTENT / VALUE
//
// ----------------------------------------------------------------------------

Selection.prototype.val      = function( ) {
}

Selection.prototype.data      = function(  ) {
}

Selection.prototype.text      = function(  ) {
}

Selection.prototype.html      = function(  ) {
}

// ----------------------------------------------------------------------------
// 
// ATTRIBUTES & STYLE
//
// ----------------------------------------------------------------------------

Selection.prototype.addClass    = function( className ) {
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this.nodes[i];
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
Selection.prototype.removeClass = function() {
	for (var i=0 ; i < this.length ; i++ ) {
		var node = this.nodes[i];
		if (node.classList) {
			node.classList.remove(className)
		} else {
			var c   = node.getAttribute("classes");
			var m   = c.indexOf(className);
			var la  = c.length || 0;
			var lc  = className.length;
			// NOTE: This is an optimized version of the classlist
			while (m >= 0) {
				var p = n - 1;
				var n = m + lc;
				// If the className is surrounded by spaces or start/end, then
				// we can remove it.
				if (((m == 0)  || (c[p] == " ")) && ((n == la) || (c[n] == " "))) {
				}
			}
			if (c.indexOf(className) == -1) {

			}
		}
	}
};

Selection.prototype.hasClass = function() {
};

Selection.prototype.css         = function(name,value) {
	// FIXME: Should normalize CSS properties and values, see
	// animation Update
	if (typeof(name) == "string") {
	} else {
	}
	return this;
};

Selection.prototype.attr        = function(name, value) {
	if (typeof(name) == "string") {
	} else {
		value = "" + value;
		for (var k in name) {
			for (var i=0 ; i<this.length ; i++ ) {
				this.nodes[i].setAttribute(k, value);
			}
		}
	}
	return this;
};


// ----------------------------------------------------------------------------
// 
// LAYOUT
//
// ----------------------------------------------------------------------------

Selection.prototype.width       = function() {
}

Selection.prototype.height      = function() {
}

Selection.prototype.offset      = function() {
}

Selection.prototype.scrollTop   = function() {
}

Selection.prototype.position    = function() {
}


// ----------------------------------------------------------------------------
// 
// MAIN
//
// ----------------------------------------------------------------------------

/**
 * Main function
 * -------------
 *
 * `select(selector, scope)`
 *
 * :	The main function used to create a selection.
*/
var select = function( selector, scope ) {
	return (Selection.Is(selector) && !scope) ? selector :  new Selection (selector, scope );
}

select.Selection = Selection;
select.VERSION   = "0.0.1";
select.LICENSE   = "http://ffctn.com/doc/licenses/bsd.html";
select.Empty     = new Selection();
modules.select   = select;

// -- MODULE EXPORT -----------------------------------------------------------
if      (typeof define === "function"  && define.amd )     {define(function(){ return select; });}
else if (typeof module !== "undefined" && module.exports ) {module.exports          = select;}
})(modules);
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

/* EOF */
