/**
 *
 * # Select
 * ## A small library for DOM+SVG manipulation
 * 
 * Select is a small subset of jQuery's features implement for DOM and SVG nodes,
 * targetting modern browsers.
 *
 * We use it internally at FFunction as most of the extra features present
 * in jQuery (events, promises, requests, animations) are already handled
 * by our specialized modules, and that jQuery does not work well for SVG 
 * nodes, which we manipulate a lot.
 *
 * Select can be considered as a thin wrapper around Sizzle that is focused on
 * easily querying and navigating the dom. The functions currently implemented
 * are the following:
 *
 * - `find`
 * - `filter`
 * - `attr`
 * - `css`
 * - `html`
 * - `text`
 * - `val`
 * - `width`
 * - `height`
 * - `position`
 * - `offset`
 * - `scroll`
 *
*/

// -- MODULE DECLARATION ------------------------------------------------------
var modules = typeof extend != "undefined" && extend.Modules || typeof modules!= "undefined" && modules || {};
var select  = (function(modules) {
// ----------------------------------------------------------------------------

/**
 * @class Selection
*/
var Selection  = function( selector, scope) {
	if (typeof selector == "string") {
		if (typeof scope == "string") {
			scope = select(scope);
			scope = scope.length == 1 ? scope.nodes[0] : scope;
		}
		if (!scope) {
			this.nodes  = Sizzle(selector);
		} else if (Selection.Is(scope)) {
			var s       = scope.find(selector);
			this.nodes  = s.nodes;
		} else if (Selection.IsNode(scope)) {
			this.nodes = Sizzle(selector, scope);
		} else {
			console.error("Selection(_, scope): scope is expected to be Selection, node, string or nothing, got", scope);
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
 * @operation Selection.Is(value)
 * Tells if the given value is a Selection instance
 *
 * ```
 * select.Selection.Is(new Selection ());
 * ```
*/
Selection.Is = function (s) {
	return s && (s._class === Selection);
}

/**
 * @operation Selection.IsNode(node)
 * Tells if the given value is a DOM or SVG node
 *
 * ```
 * select.Selection.IsNodel(document.createElement("div"));
 * ```
*/
Selection.IsNode = function (node) {
	return node && typeof(node.nodeType) != "undefined";
}

/**
 * @operation Selection.IsDom(node)
 * Tells wether the node is a DOM node or not
 *
 * ```
 * select.Selection.IsDOM(document.createElement("div")) == true;
 * select.Selection.IsDOM(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == false;
 * ```
*/
Selection.IsDOM = function (node) {
	return node && typeof(node.getBBox) === "undefined";
}

/**
 * @operation Selection.IsDom(node)
 * Tells wether the node is an SVG node or not
 *
 * ```
 * select.Selection.IsSVG(document.createElement("div")) == false;
 * select.Selection.IsSVG(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == true;
 * ```
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

Selection.prototype.find  = function( selector ) {
	return new Selection (this.nodes.reduce(function(p,node,i,r){
		return r.concat(Sizzle(selector, node));
	}, []));
}

Selection.prototype.filter      = function( selector ) {
	return new Selection (Sizzle.matches(selector, this.nodes))
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
 * @function
*/
var select = function( selector, scope ) {
	return new Selection (selector, scope );
}

select.Selection = Selection;
select.VERSION   = "0.0.0";
select.LICENSE   = "http://ffctn.com/doc/licenses/bsd.html";
modules.select   = select;

// -- MODULE EXPORT -----------------------------------------------------------
if      (typeof define === "function"  && define.amd )     {define(function(){ return select; });}
else if (typeof module !== "undefined" && module.exports ) {module.exports          = select;}
})(modules);
// ----------------------------------------------------------------------------

/* EOF */
