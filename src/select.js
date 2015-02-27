/**
 *
 * # Select
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

(function( window ) {

/**
 * @class Selection
*/
var Selection  = function( selector, scope) {
	this.nodes    = typeof(selector) == "string" ? Sizzle( selector, scope ) : selector;
	this.selector = selector;
	this.scope    = scope;
	this.length   = this.nodes.length;
};

/**
 * @operation Selection.IsDom
*/
Selection.IsDOM = function (node) {
}

Selection.IsSVG = function (node) {
}

Selection.find  = function( selector ) {
	return new Selection (this.nodes.reduce(function(p,node,i,r){
		return r.concat(Sizzle(selector, node));
	}), []);
}


Selection.val      = function( ) {
}

Selection.data      = function(  ) {
}

Selection.text      = function(  ) {
}

Selection.html      = function(  ) {
}

Selection.filter      = function( selector ) {
	return new Selection (Sizzle.matches(selector, this.nodes))
}

Selection.addClass    = function( className ) {
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

Selection.removeClass = function() {
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
				if ((m == 0)  || (c[p] == " ")) && ((n == la) || (c[n] == " ")) {
				}
			}
			if (c.indexOf(className) == -1) {

			}
		}
	}
}
}

Selection.hasClass = function() {
}

Selection.css         = function(name,value) {
	// FIXME: Should normalize CSS properties and values, see
	// animation Update
	if (typeof(name) == "string") {
	} else {
	}
	return this;
}

Selection.attr        = function(name, value) {
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
}

Selection.width       = function() {
}

Selection.height      = function() {
}

Selection.offset      = function() {
}

Selection.scrollTop   = function() {
}

Selection.position    = function() {
}


/**
 * @function
*/
var select = function( selector, scope ) {
	return new Selection (selector, scope );
}

select.Selection = Selection;

// -- MODULE EXPORT -----------------------------------------------------------
if      (typeof define === "function" && define.amd )      {define(function(){ return select; });}
else if (typeof module !== "undefined" && module.exports ) {module.exports          = select;}
else                                                       {window.select           = select;}
})( window );

/* EOF */
