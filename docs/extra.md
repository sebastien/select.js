# Select Extra (`select.extra.js`)

## Agnostic helpers for interaction and class composition

`select.extra.js` contains small, framework-agnostic browser helpers. It does
not depend on `select.js` or `select.ui.js`, and can be used in plain DOM code.

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

### Using

```javascript
import { bind, clsx, drag } from "@./select.extra.js"

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
