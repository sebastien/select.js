# Select Utils/Interaction/Routing Reference Guide

Utility helpers are split across `select/utils.js`, `select/utils/*.js`,
`select/interaction.js`, and `select/routing.js`. `select/utils.js` is the
compatibility barrel that re-exports the split utility modules. Search helpers
live in `select/utils/search.js` as a direct import.

## Quick Start

```javascript
import { add, clsx, next, toggle } from "@./utils.js"
import { Keyboard, bind, drag } from "@./interaction.js"
import { browser } from "@./browser.js"
import { router } from "@./routing.js"

const input = document.querySelector("input")

bind(input, {
  keydown: (event) => {
    if (Keyboard.Code(event) === Keyboard.Codes.ENTER) {
      input.className = clsx("field", { submitted: true })
    }
  },
})

const routes = router({
  "/": () => console.log("home"),
  "/users/{id:number}": (_path, { id }) => console.log("user", Number(id)),
})

const state = browser()
state.path.sub((path) => {
  routes.run(path)
})

let selection = [{ id: 1 }, { id: 2 }]
selection = toggle(selection, { id: 2 })
selection = add(selection, { id: 3 })
console.log(selection[next(selection, 0, -1)])
```

## Utility Modules

### `select/utils.js`

Compatibility barrel for the split utility modules.

Exports:

- `itemkey`, `items`, `index`, `find`, `has`, `add`, `remove`, `toggle`, `next`, `wrapindex`
- `asText`, `clsx`, `iclsx`, `hi`, `microtask`
- `cmp`, `eq`
- `asTrue`, `def`, `idem`, `extractor`, `predicate`, `memo`, `pipe`, `swallow`
- `ikeys`, `iitems`, `iremap`, `iwalk`, `ileaves`
- `logger`
- `sanitize`, `sanitizer`, `Sanitizer`
- text helpers such as `shortdict`, `shortword`, `unshortword`, `re`, `rescape`, `sprintf`, `uid`
- the remaining split modules (`math`, `transform`, `traverse`, `update`, `values`)
- `sel`

### Selection helpers

#### `itemkey(item)`

Returns `item.id ?? item.key ?? item.name ?? item`.

#### `items(values)`

Normalizes values into `{ label, value }` entries when needed.

#### `index(items, item, key = itemkey)`

Returns the matching index, or `-1`.

If `key === null`, strict identity matching is used.

#### `find(items, item, key = itemkey)`

Alias for `index`.

#### `has(items, item, key = itemkey)`

Returns `true` when `item` is present.

#### `add(items, item, key = itemkey)`

Returns a new array with `item` appended when absent.

#### `remove(items, item, key = itemkey)`

Returns a new array without `item` when found.

#### `toggle(items, item, key = itemkey)`

Removes `item` when present, adds it when absent.

#### `next(itemsOrLength, index, delta = 1)`

Returns a wrapped index in `[0, n)`.

#### `wrapindex(itemsOrLength, index, delta = 1)`

Low-level circular index helper used by `next`.

#### `sel`

Convenience bundle containing the selection helpers.

### Classname composition

#### `iclsx(...args)`

Generator that yields normalized class tokens.

Accepted values:

- strings
- arrays, flattened recursively
- objects, where truthy values emit their keys
- numbers

Falsy values are ignored.

```javascript
[...iclsx("btn", ["primary", null], { active: true, hidden: false })]
// ["btn", "primary", "active"]
```

#### `clsx(...args)`

Returns a space-joined class string from `iclsx(...args)`.

### Search helpers

#### `match(value, criteria)`

Returns `true` when `value` satisfies `criteria`.

- falsy criteria match everything
- regular expressions test the string form of `value`
- arrays require all criteria to match
- objects require all enumerable keys to match recursively
- functions are called as predicates
- everything else is matched by strict identity

#### `predicate(...criteria)`

Returns a matcher that requires all criteria to pass.

#### `textfilter(text)`

Builds a case-insensitive regular expression from `text`.

- `OR` splits alternatives
- quoted phrases are treated as exact phrases
- `?` expands to an optional whitespace-delimited capture

`select/utils/search.js` is imported directly instead of through the
compatibility barrel.

### Event binding

#### `bind(node, handlers)`

Registers `{ eventName: handler }` on a single node or an array of nodes.
Returns the original `node`.

#### `unbind(node, handlers)`

Removes handlers registered with `bind`.
Returns the original `node`.

### Dragging

#### `drag(event, move?, end?)`

Starts a drag interaction from a mouse event and returns a cancel function.

- `move(event, delta)` runs on `mousemove`
- `end(event, delta)` runs on `mouseup` or `mouseleave`

`delta` includes `dx`, `dy`, `ox`, `oy`, `isFirst`, `isLast`, `step`, and `context`.

`drag.target` is an alias for `dragtarget`.

#### `dragtarget(node, name?)`

Walks ancestors until it finds `data-drag`.

- without `name`, any `data-drag` matches
- with `name`, only `data-drag="name"` matches

#### `target(node, predicate)`

Returns the first ancestor matching `predicate`, or `undefined`.

### Input helpers

#### `autoresize(event)`

Auto-resizes a textarea by setting `height = auto` first, then expanding to
`border + scrollHeight`.

### Keyboard utilities

`Keyboard` provides event-name constants, key-code constants, and helper methods.

- `Keyboard.Down`: `"keydown"`
- `Keyboard.Up`: `"keyup"`
- `Keyboard.Press`: `"press"`
- `Keyboard.Codes`: Enter, Esc, Tab, arrows, modifiers, and related codes
- `Keyboard.Key(event)`: returns the key label
- `Keyboard.Code(event)`: returns the numeric key code
- `Keyboard.Char(event)`: returns a printable character or newline for Enter
- `Keyboard.IsControl(event)`: true when the key is non-character/control input
- `Keyboard.HasModifier(event)`: true when Alt or Ctrl is pressed

### Routing

#### `splitPath(value)`

Normalizes a string or array into path chunks.

#### `route(text)`

Parses a route expression into strings and `RoutePatternSlot` values.

Supported slot forms:

- `{name}`: any non-empty chunk
- `{name:number}`: numeric chunk
- `{name:alpha}`: alphabetic chunk
- `{name:string}`: alphanumeric plus `_` and `-`
- `{name:<regexp>}`: custom regexp source

#### `RoutePattern`

Wrapper around a regular expression used by dynamic path segments.

#### `RoutePatternSlot`

Route segment wrapper storing the pattern, parameter name, and position.

#### `RouteHandler`

Associates a route with a handler, priority, and captured slots.

#### `class Router`

Tree-based router that stores static and dynamic route handlers.

Methods:

- `on(expr, handler, priority?, offset?)`: registers a handler
- `off(expr, handler?, offset?)`: unregisters one handler or all handlers for the route
- `match(path, offset?)`: returns the handlers at the matched leaf, or `null`
- `run(path, ...args)`: runs the best matching handler

Selection order for `run`:

1. highest `priority`
2. latest registered when priorities are equal

Handler signature:

- `(path, captured, ...args) => any`

`captured` maps slot names to matched path chunks.

#### `router(routes?)`

Creates a `Router` and registers entries from `{ "/path": handler, ... }`.

#### `routed(routes?)`

Returns a callable dispatcher with `.router` and `.match(path)` attached.

### Browser state

`browser(options?)` returns the shared `Browser` singleton.

The `Browser` instance exposes `path`, `query`, `hash`, `local`, `internal`,
`parse`, `fetch`, and `fetched`.

Exported browser module symbols are `Browser`, `browser`, `hash`, `query`, and `record`.

See [`browser.md`](browser.md) and [`ref-browser.md`](ref-browser.md) for the
browser guide and serializer reference.
