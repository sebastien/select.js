# Select Utils/Interaction/Routing Reference Guide

Utility module with agnostic helpers for class-name composition, DOM event
binding, selection list operations, dragging, textarea auto-resize, keyboard
handling, and route dispatch.

## Overview

Helpers are split across `select/utils.js`, `select/interaction.js`, and
`select/routing.js` for clearer boundaries.

## Quick Start

```javascript
import { add, clsx, next, toggle } from "./utils.js";
import { bind, Keyboard } from "./interaction.js";
import { router } from "./routing.js";
import { browser } from "./browser.js";

const input = document.querySelector("input");

bind(input, {
  keydown: (event) => {
    if (Keyboard.Code(event) === Keyboard.Codes.ENTER) {
      input.className = clsx("field", { submitted: true });
    }
  },
});

const routes = router({
  "/": () => console.log("home"),
  "/users/{id:number}": (_path, { id }) => console.log("user", Number(id)),
});

const state = browser();
state.path.sub((path) => {
  routes.run(path);
});

let selection = [{ id: 1 }, { id: 2 }];
selection = toggle(selection, { id: 2 });
selection = add(selection, { id: 3 });
console.log(selection[next(selection, 0, -1)]);
```

### Text Compression Helpers

#### `shortdict(text)`

Builds a dictionary from words to compact base-26 tokens (`a`, `b`, ..., `aa`, ...), sorted by descending frequency.

#### `shortword(text, dict = shortdict(text))`

Compresses text by replacing dictionary words with token values.

#### `unshortword(text, dict = shortdict(text))`

Decompresses text produced by `shortword`. Also supports inline dictionary payloads in the form `word1,word2,...=payload`.

### Selection Helpers

#### `itemkey(item)`

Returns a stable fallback key:

- `item.id`
- `item.key`
- `item.name`
- otherwise `item`

#### `find(items, item, key = itemkey)`

Finds index for `item` in `items`.

- if `items` is nullish, returns `-1`
- if `key === null`, uses strict identity (`indexOf`)
- otherwise compares extracted keys

#### `has(items, item, key = itemkey)`

Returns `true` when `find(...) >= 0`.

#### `add(items, item, key = itemkey)`

Returns a new array with `item` appended only when absent.

#### `remove(items, item, key = itemkey)`

Returns a new array without `item` when found; otherwise returns original input.

#### `toggle(items, item, key = itemkey)`

Removes `item` when present, adds it when absent.

#### `next(itemsOrLength, index, delta = 1)`

Returns wrapped index in the range `[0, n)`, where `n` is:

- `itemsOrLength` when it is a number
- `itemsOrLength.length` when array-like

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

### Routing

#### `route(expr)`

Parses a route expression into normalized path chunks and dynamic capture slots.

Supported slots:

- `{name}`: any non-empty chunk
- `{name:number}`: numeric chunk
- `{name:alpha}`: alphabetic chunk
- `{name:string}`: alphanumeric plus `_` and `-`
- `{name:<regexp>}`: custom regexp source

```javascript
route("/users/{id:number}");
```

#### `class Router`

Route trie that stores handlers for static and dynamic path chunks.

##### `on(expr, handler, priority?)`

Registers a handler for the route expression.

Handler signature:

- `(path, captured, ...args) => any`

`captured` maps slot names to matched string chunks.

##### `off(expr, handler?)`

Unregisters one handler (when provided) or all handlers for `expr`.

##### `match(path)`

Returns matching handlers array at the matched leaf, or `null`.

##### `run(path, ...args)`

Runs the best matching handler.

Selection order:

1. highest `priority`
2. when equal, latest registered

##### `tree()`

Returns a serializable object representation of the route tree.

##### `iwalk()`

Generator yielding all handlers depth-first.

#### `router(routes?)`

Factory that creates a `Router` and registers entries from:

- `{ "/path": handler, ... }`

#### `routed(routes?)`

Factory returning a callable dispatcher function:

- call: `(path, ...args) => any`
- props: `.router`, `.match(path)`

### Browser state

Browser-backed URL and storage state live in `select/browser.js`.

- `browser(options?)`: Returns `{ path, query, hash, local }`
- `path`: `Cell<string>` bound to `location.pathname`
- `query`: `Cell<object>` bound to `location.search`
- `hash`: `Cell<object>` bound to `location.hash`
- `local(key, dflt, opts?)`: `Cell<T>` backed by `localStorage`

See [`browser.md`](browser.md) and [`ref-browser.md`](ref-browser.md) for the
browser guide and serializer reference.
