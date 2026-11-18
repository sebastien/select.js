# Select Interaction Reference

`@select/features/interaction/index.js` provides small DOM interaction helpers for event binding,
mouse dragging, keyboard handling, draggable drop targets, sortable list
slotting, panel positioning, popup sessions, and number field scrubbing.

## Importing

```javascript
import {
	Keyboard,
	autoresize,
	bind,
	drag,
	draggable,
	popup,
	scrub,
	sort,
	unbind,
} from "@select/features/interaction/index.js"
```

The default export is an object containing the same grouped helpers:
`interaction.core`, `interaction.drag`, `interaction.draggable`,
`interaction.keyboard`, `interaction.Keyboard`, `interaction.autoresize`,
`interaction.sortable`, `interaction.popup`, `interaction.positioning`,
`interaction.scrub`, and `interaction.sort`.

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
`draggable-drop-preview` classes. Every `*Class` option (`sourceClass`,
`previewClass`, `effectPreviewClass`, `hoverClass`, `dropClass`, and, for
`sort`, `placeholderClass` and `sourceHiddenClass`) is a whitespace-separated
string of tokens; non-string values are ignored.

The remaining options are `overlay`, `accept(proposal, state)`,
`drop(proposal, state)`, `onMove(state)`, `onDrop(state)`, and
`onCancel(state)`. A custom `drop` callback owns the commit; the target preview
is cleaned before it runs. Flat `source`, `target`, `dragPreview`,
`replaceTarget`, `dropPreview`, and `preview` options are not supported.

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
`onCancel` are also supported. `axis` selects the slot strategy: `y`
uses linear vertical slotting; any other value uses grid slotting. The
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

## Sortable Slot Helpers

The default `sortable` export provides the lower-level algorithms used by
`sort`.

### `sortable.measure(listNode, context)`

Returns measured sortable items as `{ node, index, box }`. The source and
placeholder are excluded from the result while measurements are taken.

### `sortable.linear(items, x, y)`

Returns a slot `{ index, row, col }` based on vertical item centers.

### `sortable.grid(items, x, y, context)`

Groups measured items into rows and resolves a two-dimensional slot from
the pointer position and recent pointer motion.

### `sortable.apply(placeholder, listNode, index, context)`

Inserts `placeholder` before the item at `index`, or appends it when the index
is past the final item. Returns `true` when the DOM position changes and
`false` when it is already in the requested position or no list is supplied.

## Positioning Helpers

`positioning` is a pure geometry module. It does not write styles or listen to
the DOM.

### `affinity(box, bounds?)` / `reanchor(box, bounds, captured?)`

`affinity` picks the nearest of the nine cardinal loci (`nw`…`se`) to the center
of `box` inside `bounds` (default `viewport()`), and returns `{ locus, dx, dy }`
where `dx`/`dy` is the offset of the matching point from that locus.

`reanchor` places `box` so that captured offset is preserved against new
`bounds`. Same bounds is an identity. Parent-anchored panels should keep using
`anchored` instead.

```javascript
const captured = affinity(panelRect, oldViewport)
const next = reanchor(panelRect, newViewport, captured)
```

`Snappable.resize(bounds)` applies this to unattached roots and translates
sticky children with them. The first call with no prior bounds only stores them.

### `place(source, sourcePosition, target, targetPosition)`

Returns a `{ x, y, width, height }` box that aligns `sourcePosition` on `source`
with `targetPosition` on `target`. Positions are cardinal names (`nw`, `n`,
`ne`, `w`, `c`, `e`, `sw`, `s`, `se`) or relative `[x, y]` points in `0..1`.

```javascript
place(panelRect, "n", triggerRect, "s")
```

### `fit(box, bounds?, options?)`

Applies an overflow policy inside `bounds` (default `viewport()`). `overflow` is
`none`, `move`, `resize`, or `move-resize`. `padding` insets the bounds.
`anchor` controls how `resize` shrinks the box.

### `viewport(window?)`

Returns the visible rectangle, using `visualViewport` when present.

### `flip(position, axis)` / `opposite(position)` / `overflows(box, bounds, padding?)`

`flip` inverts a position on `"x"` or `"y"`. `opposite` inverts both axes.
`overflows` returns signed overflow per side.

### `anchored(source, sourcePos, target, targetPos, bounds?, options?)`

Places `source` on `target`, flips overflowing axes when that reduces overflow,
then applies `fit`. Pass `flip: false` to skip flipping.

## Popup Sessions

### `popup(panel, trigger, options?)`

Moves `panel` next to `trigger` with `position: fixed`, keeps it inside the
viewport, and returns `{ panel, trigger, underlay, box, update, close }`.

Defaults:

- `at`: `"s"` — panel `n` on trigger `s`. A pair `["n", "s"]` is also accepted.
- `portal`: `true` — appends the panel to `document.body`. Pass `false` to leave
  it in place, or a node to use as the host.
- `place`: `true` — positions the panel with `position: fixed`. Pass `false` to
  keep the panel in flow and skip geometry.
- `overflow`: `"move-resize"`
- `padding`: `8`
- `flip`: `true`
- `underlay`: `false`. `true` adds a click-to-close cover; a string is a class
  name; `{ class, dim }` can dim the page.
- `outside`: `false` — when `true`, a pointerdown outside the panel and trigger
  closes the session (`"outside"`).
- `escape`: `true` — Escape closes the topmost session.
- `focus`: `false`. `true` focuses the first field in the panel (including
  slotted content); a selector or node focuses that target.
- `onClose(reason)` — `"underlay"`, `"escape"`, `"outside"`, or `"close"`.

```javascript
const session = popup(menu, button, {
	at: "s",
	underlay: { class: "popup-cover", dim: true },
	onClose: () => menu.hidden = true,
})
session.update()
session.close()
```

The panel must be measurable (`display` not `none`) when `popup` runs. Call
`session.update()` after content or trigger layout changes; resize, scroll, and
`visualViewport` listeners already do that.

## Scrubbing Number Fields

### `scrub(root?, options?)`

Lets the user change a number field by pressing it and dragging sideways,
while a plain click still focuses the field for typing. `scrub` installs one
delegated `pointerdown` listener on `root` (default `document`), so matching
fields can be added or removed at any time. It returns a `stop()` function
that removes the listener.

Options:

- `selector`: `"input.scrub"` — the fields that scrub. The match is found with
  `event.target.closest(selector)` and must be inside `root`.
- `pixels`: `1` — pointer travel in CSS pixels per `step`. A field's
  `data-scrub-pixels` attribute overrides it, for example `8` for small counts.
- `threshold`: `3` — horizontal travel in pixels before a press becomes a
  scrub. Shorter presses stay clicks.
- `start(input)` — the value to scrub from when the field is empty or not a
  finite number, for example the effective value of an automatic field.
  Defaults to `min` when it is finite, else `0`.

Behaviour:

- Only primary pointers and the main button scrub. Disabled, read-only, and
  focused fields are left alone, so caret placement and text selection keep
  working while typing.
- The field's `step` (missing, empty, or `any` means `1`), `min`, and `max`
  attributes drive the value. The value moves by `step` every `pixels`
  pixels, ten times faster with Shift and ten times finer with Alt. Modifiers
  are read on every move, so they can change mid-drag.
- The value stays within `min` and `max`, and lands on the step grid measured
  from `min` (or `0`), rounded to the step's decimal places, so a `0.1` step
  shows `0.3` rather than `0.30000000000000004`. Alt only makes the drag
  finer; values stay on the grid.
- Travel below the threshold counts once the scrub starts, so the value
  follows the pointer from the press point.
- The pointer is captured during the gesture, and it may leave the field.

Events:

- `input` (bubbling) whenever the shown value changes during a scrub.
- `change` (bubbling) once on release, when the value differs from the value
  at the press.
- A click without travel focuses the field and selects its text, with no
  `input` or `change` event.
- Escape or `pointercancel` restores the value from the press, with an `input`
  event if it had changed and no `change` event. The Escape key press is
  consumed, so it does not also close an enclosing popup.

```html
<input class="scrub" type="number" value="100" min="0" max="800" step="10" aria-label="Zoom">
```

```javascript
const stop = scrub(document)
input.addEventListener("change", () => save(input.valueAsNumber))
```

The module only handles the gesture. Styling comes from the stylesheet, for
example ui.css styles `input.scrub`: an `ew-resize` cursor, `touch-action:
pan-y` so horizontal touch drags reach the field, and the `.active` class that
`scrub` sets on the field while it is being scrubbed.

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
