

# Select.js
## A small jQuery-like library for DOM+SVG manipulation

```
Version :  ${VERSION}
URL     :  http://github.com/sebastien/select.js
```

Select is a small subset of jQuery's functions implemented for DOM and SVG
nodes, and targetting modern browsers. As it uses strict CSS-3 selector
query so won't work as a drop-in replacement to jQuery.

We use it internally at [FFunction](http://ffctn.com) as most of the extra features present
in jQuery (events, promises, requests, animations) are already handled
by our specialized modules, and that jQuery does not work well for SVG 
nodes, which we manipulate a lot.

The functions currently implemented are the following:

Selection
:	
	- `find(selector)`
	- `filter(selector)`

Traversal
:	
	- `first()`
	- `last()`
	- `eq(index)`
	- `next(selector?)`
	- `prev[ious](selector?)`
	- `parent(selector?)`
	- `parents(selector?)`/`ancestors(selector?)`

Manipulation:
:	
	- `attr(attribute, value)`/`attr(attributes)`
	- `css(attribute, value)`/`css(attributes)`
	- `html(value?)`
	- `text(value?)`
	- `val(value?)`
	- `empty()`

Display:
:	
	- `scrollTop(value?)`
	- `scrollLeft(value?)`
	- `width()`
	- `height()`
	- `position()`
	- `offset()`

Events:
:	
	- `bind(event, callback)`/`bind(events)`
	- `ready(callback)`

Differences with jQuery
-----------------------

- SVG nodes are supported
- Only modern browsers are supported (IE10+)
- Only a subset of the functions are implemented (see above)
- Selectors are only CSS3 (ie. no Sizzle/jQuery extended syntax)
- No name/key/selector normalization (for performance)

Using
-------

The library can be used pretty much like you would use jQuery.

```
// Query the elements, and apply the operations
$("ul li:even").text("Hello!");

// It is also available at different locations
$ == S == modules.select
```


Extending
---------

Select is ready for being extended (or monkey-patched) if you prefere. Simply
extend the prototype:

```
modules.select.Selection.prototype.<YOUR NEW METHOD> = function(...) {
   // `this` will reference your `Selection` object
}
```

Contributing
------------

If you'd like to look at the source code or contribute, Select's home page
is at <http://github.com/sebastien/select.js>, feel free to post issues or
pull requests. The goal is to keep this pretty minimal, so my preference
would go to bug reports or performance improvements request as opposed
to new features.


Core functions
---------------

Select is based on a couple of basic functions to query, filter and match
nodes against CSS-3 selectors. These work in modern browsers, including
our beloved IE10+.

`select.match(selector:String, node:Node):Boolean`

:	Tells if the given `node` matches the given selector. This
		function uses `Node.{matches|mozMatchesSelector|webkitMatchesSelector}`
		or falls back to a default (obviously slower) implementation.

		The function returns `true` or `false`

`select.query(selector:String, node:Node?):[Node]`

:	Queries all the descendants of node that match the given selector. This
	is a wrapper around `Elemetn.querySelectorAll`.

		The function returns an array of the matching nodes.

`select.query(selector:String, node:Node?):[Node]`

:	Filtes all the nodes that match the given selector. This is a wrapepr
		around `select.filter`. 

		The function returns the subset of the array with matching nodes.

Operations
----------

 The following functions are utility functions used the `Selection` class, 
 but they are also useful generally.

`Selection.Is(value)`

:	Tells if the given value is a `Selection` instance

		select.Selection.Is(new Selection ());

`Selection.IsNode(node)`

:	Tells if the given value is a DOM or SVG node

		select.Selection.IsNodel(document.createElement("div"));

`Selection.IsDom(node)`

:	Tells wether the node is a DOM node or not

		select.Selection.IsDOM(document.createElement("div")) == true;
		select.Selection.IsDOM(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == false;

`Selection.IsDom(node)`

:	Tells wether the node is an SVG node or not

		select.Selection.IsSVG(document.createElement("div")) == false;
		select.Selection.IsSVG(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == true;

Selection & Filtering
---------------------

 These functions allow to query the DOM/SVG tree, find & filter nodes.

`Selection.find(selector)`

:	Finds all the nodes that match the given selector amongst the descendants
		of the currently selected nodes. The resulting selector will have
		this selection as scope only if this selection is not empty.

	- `selector` is expected to be a string
	- the resulting selection will be flat (ie. an array of node)

	```
		select().find("div")
		select("ul").find("li")
	```

`Selection.filter(selector)`

:	Filters all the nodes within the current selection that match
		the give selector. The resulting selection will have
		this selection as scope only if this selection is not empty.

	- `selector` is expected to be a string
	- the resulting selection will be flat (ie. an array of node)

Selection.first()

:	Returns a new selection made of thefirst nodeof this selection. If the
		selection is empty or made of 1 node, this function is transparent.

Selection.last()

:	Returns a new selection made of thelast nodeof this selection. If the
		selection is empty or made of 1 node, this function is transparent.

Selection.eq(index:Integer)

:	Returns a new selection made of thenode at the given `index`.
		if `index` is negative, then the index will be relative to the end
		of the nodes array. If the index is out of the node array bounds,
		the `Empty` selection is returned.

Selection.next(selector:String?)

:	Selects each next sibling element of the current selection. If 
		`selector` is given, only the matching elements will be added.

Selection.previous(selector:String?)

:	Selects each previous sibling element of the current selection. If 
		`selector` is given, only the matching elements will be added.

Selection.parent(selector:String?)

:	Returns a selection of the direct parents of the current selected
		nodes. If a selector is given, only the matching parents
		will be returned.

Selection.ancestors(selector:String?)

:	Returns a selection of the ancestors of the current selected
		nodes. If a selector is given, only the matching parents
		will be returned.

Content & Value
---------------

`Selection.val(value?)`

:	When `value` is not specified ,retrieves the first non-null
	value for the given input fields. If value is specified, then
	the value will be set in all fields.

`Selection.text(value:String?)`

:	When `value` is not specified, retrieves the first non-null
	text value for the nodes in the selection, otherwise sets the
	text for all nodes as the given string.

	Note that if `value` is not a string, it will be JSONified.

	This uses [`Node.textContent`](http://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-textContent)

`Selection.html(value:String?)`

:	When `value` is not specified, retrieves the first non-null
	HTML value for the nodes in the selection, otherwise sets the
	HTML for all nodes as the given string.

	Note that if `value` is not a string, it will be JSONified.

	This uses [`Node.innerHTML`](https://dvcs.w3.org/hg/innerhtml/raw-file/tip/index.html#innerhtml)

Attributes
----------

### `Selection.attr()`

`Selection.attr(name:String):Any`

:	Retrieves the given attribue value

`Selection.attr(name:String, value:Any)`

:	Sets the given attribute with the given value

`Selection.attr(values:{String:Any})`

:	Sets the given attributes based on the given map, JSONified if
	not a string.

	These function will JSONify non-string values.


### `Selection.data()`

`Selection.data():{String:Any}`

:	Retrieves all the data attributes as a map

`Selection.data(name:String):Any`

:	Retrieves the given data attribute

`Selection.data(name:String, value:Any)` 

:	Sets the given data attribute with the given value, JSONified if
	not a string.

`Selection.data(values:{String:Any})`

:	Sets the given data attributes based on the given map, JSONified if
	not a string.

These work both for HTML and SVG nodes. In case of SVG, the
data will be stored and retrieved from JSON-encoded data attributes.

The main difference with HTML will be that the attributes won't
be converted back to `lower-case` from `camelCase`. For instance

```
select("svg").data("someProperty", "true") 
```

will be stored as `data-someProperty` and not `data-some-property`
like it would be the case in an original HTML document.

### `Selection.[add|remove|has]Class()`

`Selection.addClass(name:String?)`

:	Adds the given class to all the nodes in the selection.

	This uses `Node.classList` with a custom fallback that works for
	DOM & SVG nodes.

`Selection.removeClass(name:String?)`

:	Removes the given class from all the nodes in the selection.

	This uses `Node.classList` with a custom fallback that works for 
	DOM & SVG nodes.

`Selection.hasClass(name:String?)`

:	Tells if there is at least one node that has the given class

Style
-----

Selection.css(name:String):Any

:	Retrieves the given CSS property

Selection.css(name:String, value:Any)

:	Sets the given CSS property with the given value

Selection.css(values:{String:Any})

:	Sets the given CSS properties based on the given map, JSONified if
	not a string.

These function will convert any value to "px" if not given as a string. Also
note that there is no CSS property normalization, they're passed as-is.

Layout
------

`Selection.width():Int`

:	Returns the width of the first node in the selection in pixels.

		This uses `getBoundingClientRect()`, returns `0` if the selection
		if empty.

`Selection.height():Int`

:	Returns the height of the first node in the selection in pixels.

		This uses `getBoundingClientRect()`, returns `0` if the selection
		is empty.

`Selection.offset():{left:Int, top:Int}`

:	Returns the `{left,top}` offset of this node, relative to
		its offset parent.

		This uses `offsetTop` for DOM nodes and `getBoundingClientRect`
		for SVG nodes.

`Selection.scrollTop():Int`

:	Returns the `{left,top}` offset of this node, relative to
		its offset parent.

		This uses `offsetTop` for DOM nodes and `getBoundingClientRect`
		for SVG nodes.

Main function
-------------

`select(selector, scope)`

:	The main function used to create a selection.

License
-------

 Revised BSD License

Copyright (c) 2015, FFunction inc (1165373771 Québec inc) All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this
list of conditions and the following disclaimer. Redistributions in binary
form must reproduce the above copyright notice, this list of conditions and
the following disclaimer in the documentation and/or other materials
provided with the distribution. Neither the name of the FFunction inc
(CANADA) nor the names of its contributors may be used to endorse or promote
products derived from this software without specific prior written
permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

