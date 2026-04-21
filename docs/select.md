# Select.js (`select.js`)
## A small jQuery-like library for DOM+SVG manipulation

```
Version :  ${VERSION}
URL     :  http://github.com/sebastien/select.js
Updated :  2026-04-21
```

Select is a thin, fast wrapper around browser DOM and SVG APIs. It exposes a
single selection abstraction (`Selection`) and keeps behavior explicit, with an
API focused on traversal, mutation, attributes, style, layout and events.

The functions currently implemented are available from the `select` module.

Module exports
:
 - `select(selector, scope?)`
 - `$` (alias to `select`)
 - `S` (alias to `select`)
 - `query(selector, scope?, limit?)`
 - `filter(selector, nodes)`
 - `Selection` (class)

Selection and traversal
:
 - `find(selector)`, `filter(selector)`, `iterate(callback)`, `is(selector)`, `like(selector)`
 - `list()`, `first()`, `last()`, `eq(index)`, `get(index)`
 - `next(selector?)`, `prev(selector?)`, `previous(selector?)`
 - `parent(selector?)`, `parents(selector?, limit?)`, `ancestors(selector?, limit?)`
 - `children(selector?)`, `nodes(callback?)`, `walk(callback?)`

Manipulation and content
:
 - `append(value)`, `prepend(value)`, `remove()`, `extend(value)`
 - `after(value)`, `before(value)`, `replaceWith(value)`, `wrap(node)`, `clone()`, `empty()`
 - `val(value?)`, `value(value?)`, `text(value?)`, `html(value?)`, `contents(value?)`
 - `set(value)`, `copy()`, `clear(length)`, `expand(element|elements)`
 - `equals(node|selection)`, `contains(node|selection)`, `isEmpty()`

Attributes, classes, style, layout, events
:
 - `attr(name, value?)`, `data(name|values, value?, serialize?)`
 - `addClass(name)`, `removeClass(name?)`, `hasClass(name)`, `toggleClass(name, value?)`
 - `css(name|values, value?)`
 - `width()`, `height()`, `offset()`, `scrollTop(value?)`, `scrollLeft(value?)`
 - `focus(callback?)`, `select(callback?)`
 - `bind(event, callback, capture?)`, `unbind(event, callback)`, `trigger(event)`
 - Event shortcuts are available as methods (for example `click`, `keydown`, `submit`, `resize`, ...)
 - `node(index?)`

Differences with jQuery
-----------------------

- SVG nodes are supported as first-class targets
- Targets modern browsers (IE10+ baseline in project docs)
- Uses CSS selectors only (no Sizzle/jQuery selector extensions)
- Focuses on `ELEMENT_NODE` selections
- Avoids key/property normalization for performance

Using
-----

```html
<script type="module">
import $ from "@./select.js"

$("ul li").addClass("item")
$("svg circle").attr("fill", "tomato")
</script>
```

Extending
---------

You can add project-specific helpers by extending `Selection.prototype`:

```javascript
import select from "@./select.js"

select.Selection.prototype.flash = function () {
  return this.addClass("flash")
}
```

Contributing
------------

If you'd like to improve Select, open an issue or pull request at
<http://github.com/sebastien/select.js>. Performance and correctness changes
are preferred over adding broad new surface area.

API
---

The `select` module
-------------------

`select(selector, scope?)`

: Creates a `Selection` from CSS selector strings, DOM/SVG nodes, arrays,
  node lists, or existing selections.

`query(selector, scope?, limit?)`

: Queries descendants with CSS selectors and returns matching elements.

`filter(selector, nodes)`

: Filters a node collection by selector.

`Selection`

: Array-like class used by all fluent operations.

Static predicates and helpers
-----------------------------

`Selection.Is(value)`
`Selection.IsList(value)`
`Selection.IsElement(node)`
`Selection.IsText(node)`
`Selection.IsNode(node)`
`Selection.IsDOM(node)`
`Selection.IsSVG(node)`
`Selection.IsSelection(value)`
`Selection.AsElementList(value)`
`Selection.Ensure(node)`

: Type checks and normalization helpers for building and validating selections.
