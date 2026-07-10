# Select Interaction Reference

`@select/interaction.js` provides small DOM interaction helpers for event binding,
mouse dragging, keyboard handling, draggable drop targets, sortable lists, and
sortable placement.

## Importing

```javascript
import {
	Keyboard,
	autoresize,
	bind,
	drag,
	draggable,
	sort,
	unbind,
} from "@select/interaction.js"
```

The default export is an object containing the same grouped helpers:
`interaction.core`, `interaction.drag`, `interaction.draggable`,
`interaction.keyboard`, `interaction.Keyboard`, `interaction.autoresize`,
`interaction.placement`, and `interaction.sort`.

## Core Helpers

### `bind(node, handlers)`

Registers each `{ eventName: handler }` pair with `addEventListener` and
returns the original `node`. `node` may be a DOM node or an array of nodes.

```javascript
bind(button, {
	click: () => console.log("clicked"),
	mousedown: start,
})
```

### `unbind(node, handlers)`

Removes handlers previously registered with `bind` and returns the original
`node`. The same handler function must be supplied to remove a listener.

### `target(node, predicate)`

Walks from `node` through its element ancestors and returns the first element
for which `predicate(element)` is true. Returns `undefined` when no ancestor
matches.

## Mouse Dragging

### `drag(event, move?, end?, overlay?)`

Starts a mouse drag from `event.target` and returns a function that ends the
drag. The helper listens on `window` for `mousemove`, `mouseup`, and
`mouseleave`.

`move(event, state)` runs for each mouse move. `end(event, state)` runs once
when the gesture ends. The shared `state` object contains:

- `node`: the original event target
- `ox`, `oy`: the starting page coordinates
- `dx`, `dy`: the current displacement from the start
- `step`: the number of move events processed
- `isFirst`: true for the first move
- `isLast`: true for the final callback
- `context`: an object shared by the callbacks

Returning `null` from `move` prevents the current event's default action and
stops propagation. Returning `false` ends the drag immediately. The optional
`overlay` is a CSS class name for a transparent, fixed, pointer-transparent
gesture overlay; pass `null` to disable it.

```javascript
const stop = drag(event, (moveEvent, state) => {
	marker.style.transform = `translate(${state.dx}px, ${state.dy}px)`
}, (endEvent, state) => {
	console.log("moved", state.dx, state.dy)
})

// The returned function can cancel the gesture.
stop()
```

### `dragtarget(node, name?)`

Walks up from `node` until it finds an element with `data-drag`. Without
`name`, any `data-drag` attribute matches. With `name`, the attribute must
equal that value. `drag.target` is an alias for `dragtarget`.

```html
<div data-drag="card">
	<button>Drag this card</button>
</div>
```

## Draggable Drop Interactions

### `draggable(event, options?)`

Starts a drag from the closest nested `source.match` element and previews an
accepted nested `target.match` element. A `match` value can be a selector
string, a predicate, or an array of selector strings and predicates. The
defaults are `[data-draggable]` and `[data-drop-target]`; target acceptance is controlled by the
whitespace-separated `data-drop-accept` attribute, where `*` accepts every
source.

The function returns the low-level drag cancellation function, or `undefined`
when the event target is not inside a matching source.

The nested API is:

```javascript
draggable(event, {
	source: {
		match: "[data-draggable]",
		action: "copy", // "copy", "remove-drag", or "remove-drop"
		preview(event, state, node) {
			return state.source.node.cloneNode(true)
		},
		unpreview(event, state, node) {},
	},
	target: {
		match: "[data-drop-target]",
		action: "append", // "append", "prepend", "replace", or "content"
		preview(event, state, node) {
			return state.source.node.cloneNode(true)
		},
		unpreview(event, state, node) {},
	},
})
```

Source and target identifiers are read from the attribute named by their
selector. For the defaults, these are `data-draggable` and
`data-drop-target`. A target can restrict sources with a whitespace-separated
`data-drop-accept` list. `*` accepts every source.

```html
<button data-draggable="note">Release notes</button>
<div data-drop-target="notes" data-drop-accept="note"></div>
```

`source.preview(event, state, node)` is called once at drag start. `node` is
the current source preview node. If the callback returns a non-`undefined`
value, that value becomes the new preview node and is stored in state; an
`undefined` return keeps the current node. The resulting node is attached to the
`overlay` (default `document.body`) and follows the pointer. `target.preview`
uses the same `(event, state, node)` contract and is called once when entering
a new accepted target. Its node is inserted using
the target action and remains stable across repeated moves. `unpreview` runs
when a preview is abandoned because the target changes or the drag is
cancelled. A committed target preview remains in the document.

Source actions are `copy`, `remove-drop`, and `remove-drag`; `move` is an alias
for `remove-drag`. The latter removes the source at drag start and restores it
at its original position on cancellation. Target actions are `append`,
`prepend`, `replace`, and `content`. `content` replaces all children of the
target while preserving the target element itself. The
default previews are clones using `draggable-preview` and
`draggable-drop-preview` classes.

The remaining options are `overlay`, `sourceClass`, `hoverClass`, `dropClass`,
`accept(proposal, state)`, `drop(proposal, state)`, `onMove(state)`,
`onDrop(state)`, and `onCancel(state)`. A custom `drop` callback owns the
commit; the target preview is cleaned before it runs. Flat `source`, `target`,
`dragPreview`, `replaceTarget`, `dropPreview`, and `preview` options are not
supported.

The `proposal` passed to callbacks contains `source`, `target`, and `event`.
Each descriptor contains the matched `node` and its identifier as `id`.

The `state` passed to `accept`, source/target `preview`, `onMove`, `drop`, `onDrop`, and
`onCancel` is an interaction snapshot with this shape:

```javascript
{
	source,       // source descriptor
	target,       // current target descriptor, or undefined
	proposal,     // current accepted proposal, or undefined
	preview,      // pointer-following clone, or null
	dragPreview,  // alias for the pointer-following clone
	effectPreview, // target-side preview clone, or undefined
	targetPreview, // stable custom target preview node, or undefined
	pointer,      // { x, y, dx, dy }
	box,          // source getBoundingClientRect() result
	grab,         // { x, y } offset within the source at pointer-down
	event,        // current mouse event
}
```

`pointer.x` and `pointer.y` are the latest client coordinates; `dx` and `dy`
are the displacement since the previous pointer update. `grab` is the
pointer's initial offset inside the source. `preview` is the clone that
follows the pointer, while `effectPreview` is the optional clone inserted at
the current drop target. These object references are useful for applying
classes or custom visual effects during callbacks.

For `draggable`, `source` and `target` are descriptors of the source and drop
target. A descriptor has the form `{ node, id }`, where `node` is the matched
element and `id` is its matching data-attribute value. The generic proposal is
`{ source, target, event }`.

`draggabletarget(node, name?)` finds the closest `data-draggable` source and
`droptarget(node, name?)` finds the closest `data-drop-target`. The
`draggable.target` property aliases `draggabletarget`.

## Sortable Lists

### `sort(event, options?)`

Starts a sortable interaction for the closest item inside the closest list.
The source item is hidden while a placeholder marks the proposed position.
On a successful drop, the original item is moved unless a custom `drop`
callback is supplied.

Default selectors and options:

```javascript
{
	item: "[data-sortable-item]",
	list: "[data-sortable-list]",
	axis: "data-axis",
	placeholder: true,
	placeholderClass: "sortable-placeholder",
	sourceHiddenClass: "is-dragging-source-hidden",
}
```

The draggable options `overlay`, `dragPreview`, `sourceClass`, `previewClass`,
`effectPreviewClass`, `accept`, `dropPreview`, `preview`, `drop`, `onMove`, `onDrop`, and
`onCancel` are also supported. `axis` selects the placement strategy: `y`
uses linear vertical placement; any other value uses grid placement. The
element's `data-axis` value overrides the default.

```html
<div data-sortable-list="backlog" data-axis="y">
	<button data-sortable-item="a">First</button>
	<button data-sortable-item="b">Second</button>
</div>
```

Items and lists expose identifiers through their matching attributes. An item
with `data-index` supplies its initial index; otherwise its position among
matching siblings is used. `sorttarget(node, name?)` finds the closest
sortable item and `sort.target` aliases it.

The sortable state uses the same shape, but its `source` descriptor also
contains `listNode`, `listId`, and the source `index`. Its `target` descriptor
identifies the current list. The sortable `proposal` additionally contains:

```javascript
{
	source,
	target,
	listNode, // proposed destination list
	listId,   // destination list identifier
	index,    // proposed item index
	row,      // grid row, when applicable
	col,      // grid column, when applicable
	event,
}
```

A custom `preview` may return these changed fields, which allows applications
to move a placeholder into another list. Returning `false` rejects the
current position. During `onMove`, `drop`, `onDrop`, and `onCancel`, read the
current proposal through `state.proposal` rather than retaining an earlier
callback argument.

```javascript
sort(event, {
	onMove: ({ proposal }) => {
		status.textContent = proposal ? `Position ${proposal.index}` : "No drop"
	},
	drop: ({ source, listNode, index }) => {
		updateModel(source.id, listNode.dataset.sortableList, index)
	},
})
```

## Placement Helpers

The default `placement` export provides the lower-level algorithms used by
`sort`.

### `placement.measure(listNode, context)`

Returns measured sortable items as `{ node, index, box }`. The source and
placeholder are excluded from the result while measurements are taken.

### `placement.linear(items, x, y)`

Returns a placement `{ index, row, col }` based on vertical item centers.

### `placement.grid(items, x, y, context)`

Groups measured items into rows and resolves a two-dimensional placement from
the pointer position and recent pointer motion.

### `placement.apply(placeholder, listNode, index, context)`

Inserts `placeholder` before the item at `index`, or appends it when the index
is past the final item. Returns `true` when the DOM position changes and
`false` when it is already in the requested position or no list is supplied.

## Keyboard and Input Helpers

### `autoresize(event)`

Resizes a textarea-like `event.target` to fit its content. It resets the
height to `auto`, then sets it to `scrollHeight` plus the top and bottom border
widths.

### `Keyboard`

`Keyboard` is also exported as the default `keyboard` value. It contains event
names, common legacy key codes, and event helpers:

- `Keyboard.Down`, `Keyboard.Up`, `Keyboard.Press`: event names
- `Keyboard.Codes`: numeric codes for Enter, Escape, arrows, modifiers, and
  editing/navigation keys
- `Keyboard.Key(event)`: key label, or `null`
- `Keyboard.Code(event)`: numeric `keyCode`, or `null`
- `Keyboard.Char(event)`: a printable one-character key, `"\\n"` for Enter,
  or `null`
- `Keyboard.IsControl(event)`: true for multi-character control keys
- `Keyboard.HasModifier(event)`: true when Alt or Ctrl is pressed

```javascript
bind(input, {
	[Keyboard.Down](event) {
		if (Keyboard.Code(event) === Keyboard.Codes.ENTER) {
			submit(input.value)
		}
	},
})
```
