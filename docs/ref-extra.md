# Select Extra Reference Guide

Utility module with agnostic helpers for class-name composition, DOM event
binding, dragging, textarea auto-resize, and keyboard handling.

## Overview

`select.extra.js` is intentionally independent from Select UI internals. Use it
in plain DOM scripts, custom elements, or alongside any rendering library.

## Quick Start

```javascript
import { bind, clsx, Keyboard } from "./select.extra.js";

const input = document.querySelector("input");

bind(input, {
  keydown: (event) => {
    if (Keyboard.Code(event) === Keyboard.Codes.ENTER) {
      input.className = clsx("field", { submitted: true });
    }
  },
});
```

## API Reference

### Classname Composition

#### `iclsx(...args)`

Generator that yields normalized class tokens.

Accepted values:

- string (trimmed)
- number (stringified)
- array (flattened recursively)
- object (`key` emitted when `value[key]` is truthy)

Ignored values:

- falsy values (`null`, `undefined`, `""`, `0`, `false`)
- booleans

```javascript
[...iclsx("btn", ["primary", null], { active: true, hidden: false })];
// ["btn", "primary", "active"]
```

#### `clsx(...args)`

Returns a space-joined classname string from `iclsx(...args)`.

```javascript
clsx("btn", ["large"], { disabled: false, active: true });
// "btn large active"
```

### Event Binding

#### `bind(node, handlers)`

Attaches event handlers from `{ eventName: handler }` to one node or an array of
nodes. Returns the original `node` argument.

```javascript
bind(button, {
  click: onClick,
  mouseenter: onEnter,
});
```

#### `unbind(node, handlers)`

Removes event handlers from one node or an array of nodes. Returns the original
`node` argument.

```javascript
unbind(button, {
  click: onClick,
  mouseenter: onEnter,
});
```

### Dragging

#### `drag(event, move?, end?)`

Starts a mouse drag interaction from a `mousedown` event.

- `move(event, delta)` runs on `mousemove`
- `end(event, delta)` runs on `mouseup` or `mouseleave`
- returns `cancel()` function

`delta` includes:

- `dx`, `dy`: displacement from drag origin
- `ox`, `oy`: origin position (`pageX`, `pageY`)
- `isFirst`: true on first move callback
- `isLast`: true in end callback
- `step`: number of move steps
- `context`: mutable shared object for drag lifecycle state

```javascript
node.addEventListener("mousedown", (event) => {
  drag(event, (_event, delta) => {
    node.style.transform = `translate(${delta.dx}px, ${delta.dy}px)`;
  });
});
```

#### `dragtarget(node, name?)`

Walks up ancestors until it finds an element with `data-drag`.

- no `name`: any `data-drag`
- with `name`: exact `data-drag="name"`

#### `target(node, predicate)`

Generic ancestor walk helper. Returns first matching node or `undefined`.

### Input Helpers

#### `autoresize(event)`

Auto-resizes a textarea by setting:

1. `height = auto`
2. `height = border + scrollHeight`

Use with:

```javascript
textarea.addEventListener("input", autoresize);
```

### Keyboard Utilities

`Keyboard` object provides constants and helper methods.

#### Event constants

- `Keyboard.Down`: `"keydown"`
- `Keyboard.Up`: `"keyup"`
- `Keyboard.Press`: `"press"`

#### Key code constants

- `Keyboard.Codes.ENTER`, `ESC`, `TAB`, `SPACE`, arrows, modifiers, etc.

#### Methods

- `Keyboard.Key(event)`: key label (`event.key` fallback)
- `Keyboard.Code(event)`: numeric key code
- `Keyboard.Char(event)`: printable character or newline for Enter
- `Keyboard.IsControl(event)`: true if key is non-character/control
- `Keyboard.HasModifier(event)`: true when Alt or Ctrl is pressed
