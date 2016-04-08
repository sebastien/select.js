
# Select.js
## A small jQuery-like library for DOM+SVG manipulation

```
Version :  ${VERSION}
URL     :  http://github.com/sebastien/select.js
Updated :  2016-03-23
```

Select is a small subset of jQuery's functions implemented for DOM and SVG
nodes, and targeting modern browsers. It is a thin wrapper around HTML5
DOM & SVG APIs. It uses strict CSS3 selector query, and as such won't work
as a drop-in replacement to jQuery, but will make the transition easier.

Select is recommended if you want to use the same API for DOM & SVG nodes
and it is not critical to support a wide range of browser [quirks].

We use it internally at [FFunction](http://ffctn.com) as most of the extra features present
in jQuery (events, promises, requests, animations) are already handled
by our specialized modules, and that jQuery does not work well for SVG
nodes, which we manipulate a lot.

That being said, jQuery dramatically
improved the quality of the Web as an environment, and it definitely
enabled us to focus on creating great applications. [Things have changed](http://youmightnotneedjquery.com/)
for the better now, and we don't need so much of a compatibility layer
anymore. You should note, however, that [jQuery still fixes many modern-browser problems](https://docs.google.com/document/d/1LPaPA30bLUB_publLIMF0RlhdnPx_ePXm7oW02iiT6o/preview?sle=true)
so if you need to have a wide support and more features, jQuery is definitely
the better option.

The functions currently implemented are the following, available withing
the `modules.select` object (which you should alias to `$`).

Selection
:
 - `find(selector)`
 - `filter(selector)`
 - `is|like(selector)`
 - `forEach(callback)`

Traversal
:
 - `first()`
 - `last()`
 - `eq(index)`
 - `next(selector?)`
 - `prev[ious](selector?)`
 - `parent(selector?)`
 - `parents(selector?)`
 - `ancestors(selector?)`
 - `children(selector?)`

Manipulation:
:
 - `append(value)`
 - `remove()`
 - `after(value)`
 - `before(value)`
 - `replaceWith(value)`
 - `clone()`
 - `attr(attribute, value)`/`attr(attributes)`
 - `css(attribute, value)`/`css(attributes)`
 - `html(value?)`/`contents(value?)`
 - `text(value?)`
 - `val(value?)`
 - `empty()`
 - `[has|add|remove|toggle]Class(name)`

Display:
:
 - `scrollTop(value?)`
 - `scrollLeft(value?)`
 - `width()`
 - `height()`
 - `position()`
 - `offset()`

Selection:
:
- `select()`

Events:
:
 - `bind(event, callback)`
 - `change(event, callback)`
 - `submit(event, callback)`
 - `click(event, callback)`
 - `keyup(event, callback)`
 - `keydown(event, callback)`
 - `keypress(event, callback)`
 - `trigger(event)`

New (not in jQuery):
:
-  `n[ode]()`
-  `set(value)`
-  `contents(value?)`
-  `clear(length)`
-  `expand(element|[element])`
-  `like(selector)`
-  `list()`

Differences with jQuery
-----------------------

- SVG nodes are supported
- Only modern browsers are supported (IE10+)
- Only a subset of jQuery's functions are implemented (see above)
- Only `ELEMENT_NODE`s are supported (meaning no `document` or `window` supported)
- As a result, select filters out any node that is not an element node (in particular, the document node)
- Selectors are only CSS3 (ie. no Sizzle/jQuery extended syntax)
- No name/key/selector normalization (for performance)

Using
-------

You can include the [script directly from Github](https://raw.githubusercontent.com/sebastien/select.js/master/build/select.js) (although GitHub is not a CDN):

```
<script src="https://raw.githubusercontent.com/sebastien/select.js/master/build/select.js" />
```

The library can be used pretty much like you would use jQuery.

```
// Query the elements, and apply the operations
$("ul li:even").text("Hello!");

// It is also available at different locations
$ == S == modules.select
```


Extending
---------

Select is ready for being extended (or "monkey-patched") if you prefer. Simply
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

Also, a quick note about the implementation style: `select`'s source
code is fairly repetitive, and would actually benefit from C-style macros.
The reason is that I wanted to limit the use of lambdas and stay as close
to possible as C-style programming based on `for`/`while` loops, minimizing
conditional branching. This results in a more verbose, old-school style, but
that (hopefully) translates into better performance.

Once `select` stabilizes, I will probably factor out the common parts
and measure the performance impact.

API
---

The `select` module
-------------------

Once loaded,select.jswill be available as an object/module
named `select` in the global scope. The module can be invoked as
follows to create a selection:

`select(selector, scope)`

:	The main function used to create a selection.

The `select` object (module) also has the following properties

- `VERSION` as `M.m.R` (`M`ajor, `m`inor, `R`evision)
- `NAME` (`select`)
- `LICENSE`, the URL to the license file
- `STATUS` as `LOADING` or `LOADED`

The module will also be registered at the following locations:

- `window.select`
- `window.$` and `window.S` if these values are not defined
- `extend.modules.select` if the Extend library is loaded.


Core functions
---------------

Select is based on a couple of basic functions to query, filter and match
nodes against CSS-3 selectors. These work in modern browsers, including
our beloved IE10+.

`select.match(selector:String, node:Node):Boolean`

:   Tells if the given `node` matches the given selector. This
    function uses `Node.{matches|mozMatchesSelector|webkitMatchesSelector}`
    or falls back to a default (obviously slower) implementation.

    The function returns `true` or `false`

`select.query(selector:String, node:Node?):[Element]`

:	Queries all the descendants of node that match the given selector. This
	is a wrapper around `Element.querySelectorAll`.

      function returns an array of the matching element nodes.

`select.filter(selector:String, node:Node?):[Node]`

:	Filters all the nodes that match the given selector. This is a wrapper
		around `select.filter`.

     This function returns the subset of the array with matching nodes.

Predicates
----------

 The following predicates allow to discriminate values and identify their
 types.

`Selection.Is(value)`

:	Tells if the given value is a `Selection` instance

     select.Selection.Is(new Selection ());

`Selection.IsList(value)`

:	Tells if the given value is a `Selection`, `Array` or `NodeList`


`Selection.IsElement(node)`

:	Tells if the given value is a DOM or SVG element

		select.Selection.IsElement(document.createElement("div"));
		select.Selection.IsElement(document) == false

`Selection.IsNode(node)`

:	Tells if the given value is a DOM or SVG node

		select.Selection.IsNode(document.createElement("div")) == true
		select.Selection.IsNode(document) == true

`Selection.IsDOM(node)`

:	Tells wether the node is a DOM node or not

		select.Selection.IsDOM(document.createElement("div")) == true;
		select.Selection.IsDOM(document.createElementNS("http://www.w3.org/2000/svg", "svg")) == false;

`Selection.IsSVG(node)`

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
		If the selection is empty, the the empty selection will be returned.

     - `selector` is expected to be a string
     - the resulting selection will be flat (ie. an array of node)


`Selection.filter(selector)`

:	Filters all the nodes within the current selection that match
		the give selector. The resulting selection will have
		this selection as scope only if this selection is not empty.

     - `selector` is expected to be a string
     - the resulting selection will be flat (ie. an array of node)

`Selection.iterate(callback:Function(element, index)`

:	Invokes the given callback for each element of the selection wrapped
		in a selection object.. Breaks if the callback returns false.

`Selection.is(selector)`

:	Tells if all the selected nodes match the given selector

`Selection.list()`

:	Returns an array of properly wrapped nodes.

`Selection.first()`

:	Returns a new selection made of thefirst nodeof this selection. If the
		selection is empty or made of 1 node, this function is transparent.

`Selection.last()`

:	Returns a new selection made of thelast nodeof this selection. If the
		selection is empty or made of 1 node, this function is transparent.

`Selection.eq(index:Integer)`

:	Returns a new selection made of thenode at the given `index`.
		if `index` is negative, then the index will be relative to the end
		of the nodes array. If the index is out of the node array bounds,
		the `Empty` selection is returned.

`Selection.next(selector:String?)`

:	Selects each next sibling element of the current selection. If
		`selector` is given, only the matching elements will be added.

`Selection.previous(selector:String?)`

:	Selects each previous sibling element of the current selection. If
		`selector` is given, only the matching elements will be added.

`Selection.parent(selector:String?)`

:	Returns a selection of the direct parents of the current selected
		nodes. If a selector is given, only the matching parents
		will be returned.

`Selection.ancestors(selector:String?)`

:	Returns a selection of the ancestors of the current selected
		nodes. If a selector is given, only the matching parents
		will be returned.

`Selection.children(selector:String?)`

:	Returns a selection of the children of the current selected
		nodes. If a selector is given, only the matching children
		will be returned.

Content & Value
---------------

`Selection.append(value:Number|String|Node|[Node]|Selection):this`

:	Appends the given nodes to the first node in the selection. When
     a string or number is given, then it is wrapped in a text node.

`Selection.remove():Selection`

:	Removes all the nodes from this selection from their parent

`Selection.extend(value:Number|String|Node|[Node]|Selection):this`

:	Appends the given nodes to the first node in the selection. When
     a string or number is given, then it is wrapped in a text node.

`Selection.after(value:Node|[Node]|Selection):this`

:	Appends the given nodes after first node in the selection

`Selection.before(value:Node|[Node]|Selection):this`

:	Appends the given nodes before first node in the selection

`Selection.replaceWith(node:Node|[Node]|Selection):this`

:	Replaces nodes in the given selection with the given nodes. The nodes
		in the current selection will be removed, while the given node list
		or selection will not be changed (but the nodes parent will change,
		obviously).

`Selection.clone():Selection`

:	Clones the first node of this selection

`Selection.empty():this`

:	Removes all the children from all the nodes in the selection

`Selection.isEmpty():Boolean`

:	Tells if the given selection is empty or not.

`Selection.val(value?):Any|Selection`

:	When `value` is not specified ,retrieves the first non-null
	value for the given input fields. If value is specified, then
	the value will be set in all fields.

`Selection.text(value:String?):String|Selection`

:	When `value` is not specified, retrieves the first non-null
	text value for the nodes in the selection, otherwise sets the
	text for all nodes as the given string.

     Note that if `value` is not a string, it will be JSONified.

     This uses [`Node.textContent`](http://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-textContent)

`Selection.html(value:Number|String|Selection|Node|[Node]?):this`
`Selection.contents(value:Number|String|Selection|Node|[Node]?):this`

:	When `value` is not specified, retrieves the first non-null
	HTML value for the nodes in the selection, otherwise sets the
	HTML for all nodes as the given string.

	This uses [`Node.innerHTML`](https://dvcs.w3.org/hg/innerhtml/raw-file/tip/index.html#innerhtml)
	when the given content is a string or a number. If a selection or
	a node is given, then only the first node in the selection will
	be modified.

	FIXME: Not sure if that's the best behaviour... should be clone the
	other nodes, or warn?

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

`Selection.data():undefined|{String:Any}`

:	Retrieves all the data attributesof the first nodewithin
     the selection, as a map, or `undefined` if none.

`Selection.data(name:String):Any`

:	Retrieves the given data attribute, `undefined` if not found.

`Selection.data(name:String, value:Any)`

:	Sets the given data attribute with the given value in all the nodes
	within the selection, JSONified if not a string (non-DOM only)

`Selection.data(values:{String:Any})`

:	Sets the given data attributes based on the given map for all the nodes,
		in the selection JSONified if not a string (non-DOM only)

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

`Selection.hasClass(name:String?)`

:	Tells if there is at least one node that has the given class

Style
-----

These function will convert any value to "px" if not given as a string. Also
note that there is no CSS property normalization, they're passed as-is.

`Selection.css(name:String):Any`

:	Retrieves the given CSS property

`Selection.css(name:String, value:Any)`

:	Sets the given CSS property with the given value

`Selection.css(values:{String:Any})`

:	Sets the given CSS properties based on the given map, JSONified if
	not a string.


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

Selection
---------

`Selection.focus():Selection

:	Sets the focus on the first node of this selection.

`Selection.focus(callback):Selection

:	Binds the given `callback` to the focus event. See Events section.

`Selection.select():Selection

:	Selects all the elements in this selection

`Selection.select(callback):Selection

:	Binds the given `callback` to the select event. See Events section.

Events
------

`Selection.bind(event:String, callback:Function[event], capture:Bool?)`

:	Binds the given `callback` to handle the given `event` in the
		selected elements.

`Selection.unbind(event:String, callback:Function[event])`

:	Unbinds the given `callback` to handle the given `event` in the
		selected elements.

`Selection.trigger(event:Event|String)`

:	Dispatches the given `event`, given by name or value. If
		the event is a string, then the event will be created
		using `document.createEvent`. In all cases, it will be
		dispatched using `<node>.dispatchEvent`.

		See <https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Creating_and_triggering_events> for more details.

The following events are readily available as methods from the selection
object:

Mouse
:
 - `click`
 - `dblclick`
 - `mousedown`
 - `mouseup`
 - `mouseover`
 - `mousemove`
 - `mouseout`

Drag
:
 - `dragstart`
 - `drag`
 - `dragenter`
 - `dragleave`
 - `dragend`
 - `dragover`
 - `drop`

Keyboard
:
 - `keydown`
 - `keypress`
 - `keyup`

Body
:
 - `load`
 - `unload`

Window
:
 - `resize`
 - `scroll`

Forms
:
 - `select`
 - `change`
 - `submit`
 - `reset`
 - `blur`
 - `focusin`
 - `focusout`

 

Helpers & Misc
--------------

`Selection.n[ode](index?):Node|undefined`

:	Returns node with the given index (or first one) directly as a node.
		This is similar to `eq`, except that it returns the node instead
		of a selection.

`Selection.set(value|[value])`

:	Sets this selection's content  to be the given node, array
     of nodes or selection.

`Selection.clear(length)`

:	Clears the current selection until there are only `length` elements
     available.

`Selection.expand(element|elements)`

:	Expands the selection with the given element(s). Non-element
     values will be filtered out.

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

