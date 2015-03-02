

# Select.js
## A small library for DOM+SVG manipulation

```
Version :  ${VERSION}
URL     :  http://github.com/sebastien/select.js
```

Select is a small subset of jQuery's features implement for DOM and SVG nodes,
targetting modern browsers.


We use it internally at [FFunction](http://ffctn.com) as most of the extra features present
in jQuery (events, promises, requests, animations) are already handled
by our specialized modules, and that jQuery does not work well for SVG 
nodes, which we manipulate a lot.

Select can be considered as a thin wrapper around Sizzle that is focused on
easily querying and navigating the dom. The functions currently implemented
are the following:

- `find(selector)`
- `filter(selector)`
- `attr(attribute, value)`/`attr(attributes)`
- `css(attribute, value)`/`css(attributes)`
- `html(value?)`
- `text(value?)`
- `val(value?)`
- `scrollTop(value?)`
- `scrollLeft(value?)`
- `first()`
- `last()`
- `eq(index)`
- `next(selector?)`
- `previous(selector?)`
- `parent(selector?)`
- `parents(selector?)`
- `ready(callback)`

The following are implemented as read-only

- `width()`
- `height()`
- `position()`
- `offset()`


Here's how to use the library

```
// Get a reference to the `select` function, alias it to S
$ = modules.select;

// Query the elements, and apply the operations
$("ul li:even").text("Hello!");
```

If you'd like to look at the source code or contribute, Select's home page
is at <http://github.com/sebastien/select.js>, feel free to post issues or
pull requests.


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

