# Select Extra (`select.extra.js`)

## Agnostic helpers for interaction and routing

`select.extra.js` contains small, framework-agnostic helpers. It does not
depend on `select.js` or `select.ui.js`, and can be used in plain DOM code.

### Class helpers

- `clsx(...values)`: Joins class fragments into one class string.
- `iclsx(...values)`: Generator form of `clsx` (yields each normalized token).

Accepted `clsx` values:

- strings (`"btn active"`)
- arrays (nested arrays are flattened)
- objects (`{ active: true, hidden: false }`)
- numbers (converted to strings)
- falsy and booleans are ignored

### Interaction helpers

- `bind(nodeOrNodes, handlers)`: Attaches multiple event listeners.
- `unbind(nodeOrNodes, handlers)`: Removes listeners attached with `bind`.
- `drag(event, move?, end?)`: Starts a mouse drag interaction and returns a cancel function.
- `dragtarget(node, name?)`: Finds nearest ancestor with `data-drag` (optionally matching `name`).
- `target(node, predicate)`: Walks ancestors and returns the first matching element.
- `autoresize(event)`: Auto-resizes a textarea to fit content.
- `Keyboard`: Key helpers and code constants (`Keyboard.Key`, `Keyboard.Code`, `Keyboard.Char`, ...).

### Routing helpers

- `route(expr)`: Parses route expressions such as `/users/{id:number}`.
- `Router`: Route trie with `on`, `off`, `match`, `run`, `tree`, and `iwalk`.
- `router(map)`: Creates a `Router` from `{ routeExpr: handler }`.
- `routed(map)`: Returns a callable dispatcher with attached `.router` and `.match`.

Supported route slot forms:

- `{name}`: non-empty path chunk
- `{name:number}`: numeric chunk
- `{name:alpha}`: alphabetic chunk
- `{name:string}`: alphanumeric, `_`, and `-`
- `{name:<regexp>}`: custom regexp source

### Browser state

Browser URL and storage state now live in `select.cells.js` via
`browser(options?)`, which returns reactive `path`, `query`, `hash`, and
`local(key, dflt, opts?)` cells.

### Using

```javascript
import { bind, clsx, drag, router } from "@./select.extra.js"
import { browser } from "@./select.cells.js"

const button = document.querySelector("button")

bind(button, {
  click: () => {
    button.className = clsx("btn", { active: true })
  },
})

document.addEventListener("mousedown", (event) => {
  const handle = event.target.closest("[data-drag='handle']")
  if (!handle) return
  drag(event, (_event, delta) => {
    handle.style.transform = `translate(${delta.dx}px, ${delta.dy}px)`
  })
})

const routes = router({
  "/": () => console.log("home"),
  "/users/{id:number}": (_path, { id }) => console.log("user", Number(id)),
})

const state = browser()
state.path.sub((path) => {
  routes.run(path)
})
```

### API

### Class helpers

- `clsx(...values)`: Returns a space-joined class string from mixed values.
- `iclsx(...values)`: Iterates normalized class tokens from mixed values.

### Event and drag helpers

- `bind(node, handlers)`: Adds handlers from `{ eventName: handler }` and returns `node`.
- `unbind(node, handlers)`: Removes handlers from `{ eventName: handler }` and returns `node`.
- `drag(event, move?, end?)`: Tracks mouse movement from the initial event and calls:
  - `move(event, data)` during movement
  - `end(event, data)` on mouseup/mouseleave
  - returns a cleanup function to stop tracking immediately
- `dragtarget(node, name?)`: Returns the nearest drag handle element.
- `target(node, predicate)`: Returns nearest ancestor matching `predicate`.

### Textarea and keyboard

- `autoresize(event)`: Resizes `event.target` textarea based on scroll height.
- `Keyboard.Down` / `Keyboard.Up` / `Keyboard.Press`: Event-name constants.
- `Keyboard.Codes`: Key code constants (Enter, Esc, arrows, modifiers, etc.).
- `Keyboard.Key(event)`: Returns key identifier (`event.key` fallback).
- `Keyboard.Code(event)`: Returns numeric key code.
- `Keyboard.Char(event)`: Returns typed character or newline for Enter.
- `Keyboard.IsControl(event)`: True when key represents control/non-char input.
- `Keyboard.HasModifier(event)`: True when Alt or Ctrl is pressed.

### Routing

- `route(expr)`: Returns normalized route chunks and capture slots.
- `new Router()`: Creates an empty router.
- `router(routes?)`: Creates and preloads a router from route map.
- `routed(routes?)`: Returns callable `(path, ...args)` with:
  - `.router`: backing `Router` instance
  - `.match(path)`: same as `router.match(path)`

`Router` methods:

- `on(expr, handler, priority?)`: Registers handler.
- `off(expr, handler?)`: Unregisters one or all handlers for expr.
- `match(path)`: Returns matching handler list or `null`.
- `run(path, ...args)`: Runs best handler (highest priority, then latest registered).
- `tree()`: Returns a serializable route tree.
- `iwalk()`: Yields all handlers depth-first.

Handler signature:

- `(path, captured, ...args) => any`
- `captured` is an object keyed by slot names.

### Browser state

- `browser(options?)`: Imported from `@./select.cells.js`, returns browser-backed reactive cells.
