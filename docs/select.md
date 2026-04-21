# Select.js (`select.js`)
## A small jQuery-like library for DOM+SVG manipulation

Select is a thin, fast wrapper around browser DOM and SVG APIs. It exposes a
single selection abstraction (`Selection`) and keeps behavior explicit, with an
API focused on traversal, mutation, attributes, style, layout and events.

The functions currently implemented are available from the `select` module.

Module exports:

- `select(selector, scope?)`
- `$` (alias to `select`)
- `S` (alias to `select`)
- `query(selector, scope?, limit?)`
- `filter(selector, nodes)`
- `Selection` (class)

Selection and traversal:

- `find(selector)`, `filter(selector)`, `iterate(callback)`, `is(selector)`, `like(selector)`
- `list()`, `first()`, `last()`, `eq(index)`, `get(index)`
- `next(selector?)`, `prev(selector?)`, `previous(selector?)`
- `parent(selector?)`, `parents(selector?, limit?)`, `ancestors(selector?, limit?)`
- `children(selector?)`, `nodes(callback?)`, `walk(callback?)`

Manipulation and content:

- `append(value)`, `prepend(value)`, `remove()`, `extend(value)`
- `after(value)`, `before(value)`, `replaceWith(value)`, `wrap(node)`, `clone()`, `empty()`
- `val(value?)`, `value(value?)`, `text(value?)`, `html(value?)`, `contents(value?)`
- `set(value)`, `copy()`, `clear(length)`, `expand(element|elements)`
- `equals(node|selection)`, `contains(node|selection)`, `isEmpty()`

Attributes, classes, style, layout, events:

- `attr(name, value?)`, `data(name|values, value?, serialize?)`
- `addClass(name)`, `removeClass(name?)`, `hasClass(name)`, `toggleClass(name, value?)`
- `css(name|values, value?)`
- `width()`, `height()`, `offset()`, `scrollTop(value?)`, `scrollLeft(value?)`
- `focus(callback?)`, `select(callback?)`
- `bind(event, callback, capture?)`, `unbind(event, callback)`, `trigger(event)`
- Event shortcuts are available as methods (for example `click`, `keydown`, `submit`, `resize`, ...)
- `node(index?)`

### Differences with jQuery

- SVG nodes are supported as first-class targets
- Targets modern browsers (IE10+ baseline in project docs)
- Uses CSS selectors only (no Sizzle/jQuery selector extensions)
- Focuses on `ELEMENT_NODE` selections
- Avoids key/property normalization for performance

### Using

```html
<script type="module">
import $ from "@./select.js"

$("ul li").addClass("item")
$("svg circle").attr("fill", "tomato")
</script>
```

### Extending

You can add project-specific helpers by extending `Selection.prototype`:

```javascript
import select from "@./select.js"

select.Selection.prototype.flash = function () {
  return this.addClass("flash")
}
```

### API

### The `select` module:

- `select(selector, scope?)`: Creates a `Selection` from CSS selector strings, DOM/SVG nodes, arrays, node lists, or existing selections.
- `S(selector, scope?)`: Alias to `select`.
- `$(selector, scope?)`: Alias to `select`.
- `query(selector, scope?, limit?)`: Queries descendants with CSS selectors and returns matching elements.
- `filter(selector, nodes)`: Filters a node collection by selector.
- `Selection`: Array-like class used by all fluent operations.

### Selection and traversal:

- `find(selector)`: Finds all the nodes that match the given selector amongst the descendants of the currently selected nodes.
- `filter(selector)`: Filters the current selection using a CSS selector or a predicate function.
- `iterate(callback)`: Iterates over the selected nodes and calls the given callback.
- `like(selector)`: Returns true if any of the selected nodes match the given selector.
- `is(selector)`: Returns true if the first selected node matches the given selector.
- `list()`: Returns the selection as a plain array of nodes.
- `first()`: Returns a new selection containing only the first node.
- `last()`: Returns a new selection containing only the last node.
- `eq(index)`: Returns a new selection containing the node at the given index.
- `get(index)`: Returns the node at the given index directly (not wrapped in a selection).
- `next(selector?)`: Returns a selection of the next siblings of the current nodes, optionally filtered by selector.
- `prev(selector?)`: Returns a selection of the previous siblings of the current nodes, optionally filtered by selector.
- `parent(selector?)`: Returns a selection of the parents of the current nodes, optionally filtered by selector.
- `parents(selector?, limit?)`: Returns a selection of all ancestors of the current nodes, optionally filtered by selector and limited by depth.
- `children(selector?)`: Returns a selection of the immediate children of the current nodes, optionally filtered by selector.
- `nodes(callback?)`: Returns a selection of all child nodes (including text and comment nodes).
- `walk(callback?)`: Performs a depth-first traversal of the descendants of the current nodes.

### Manipulation and content:

- `append(value)`: Appends the given value to each node in the selection.
- `prepend(value)`: Prepends the given value to each node in the selection.
- `remove()`: Removes the selected nodes from the DOM.
- `extend(value)`: Adds the given nodes to the current selection.
- `after(value)`: Inserts the given value after each node in the selection.
- `before(value)`: Inserts the given value before each node in the selection.
- `replaceWith(value)`: Replaces each selected node with the given value.
- `wrap(node)`: Wraps each selected node with the given node.
- `clone()`: Returns a new selection containing deep clones of the selected nodes.
- `empty()`: Removes all children from the selected nodes.
- `isEmpty()`: Returns true if the selection is empty.
- `val(value?)`: Gets or sets the value of the first selected node (typically for form inputs).
- `text(value?)`: Gets or sets the text content of the selected nodes.
- `html(value?)`: Gets or sets the HTML content of the selected nodes.
- `contents(value?)`: Gets or sets the children (including text/comment nodes) of the selected nodes.
- `set(value)`: Clears the selection and sets its content to the given value.
- `copy()`: Creates a shallow copy of the selection object.
- `clear(length?)`: Truncates the selection to the specified length.
- `expand(element)`: Adds the given element(s) to the selection, filtering for valid elements.
- `equals(node)`: Returns true if the selection contains exactly the given node.
- `contains(node)`: Returns true if the selection contains the given node.

### Attributes, classes, style, layout:

- `attr(name, value?)`: Gets or sets attributes on the selected nodes.
- `data(name, value?, serialize?)`: Gets or sets data attributes on the selected nodes.
- `addClass(className)`: Adds one or more classes to the selected nodes.
- `removeClass(className?)`: Removes one or more classes from the selected nodes.
- `hasClass(name)`: Returns true if any selected node has the given class.
- `toggleClass(name, value?)`: Toggles a class on the selected nodes.
- `css(name, value?)`: Gets or sets CSS properties on the selected nodes.
- `width()`: Returns the width of the first selected node.
- `height()`: Returns the height of the first selected node.
- `offset()`: Returns the coordinates of the first selected node relative to the document.
- `scrollTop(value?)`: Gets or sets the vertical scroll position.
- `scrollLeft(value?)`: Gets or sets the horizontal scroll position.

### Events:

- `bind(event, callback, capture?)`: Attaches an event listener to the selected nodes.
- `unbind(event, callback)`: Removes an event listener from the selected nodes.
- `trigger(event)`: Dispatches a custom event on the selected nodes.
- `node(index?)`: Returns the node at the specified index (default 0).
- `click(callback?)`: Shortcut for binding to the 'click' event.
- `keydown(callback?)`: Shortcut for binding to the 'keydown' event.
- `submit(callback?)`: Shortcut for binding to the 'submit' event.
- `resize(callback?)`: Shortcut for binding to the 'resize' event.

### Static predicates and helpers:

- `Selection.Is(value)`: Returns true when `value` is a `Selection` instance.
- `Selection.IsList(value)`: Returns true for array-like list inputs.
- `Selection.IsElement(node)`: Returns true for element nodes.
- `Selection.IsText(node)`: Returns true for text nodes.
- `Selection.IsNode(node)`: Returns true for DOM nodes.
- `Selection.IsDOM(node)`: Returns true for HTML DOM elements.
- `Selection.IsSVG(node)`: Returns true for SVG elements.
- `Selection.IsSelection(value)`: Alias/helper to check selection-like values.
- `Selection.AsElementList(value)`: Normalizes input into a list of elements.
- `Selection.Ensure(node)`: Wraps input in a `Selection` when needed.
