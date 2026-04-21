# Select Cells (`select.cells.js`)
## Fine-grained reactive values and derivations

```
Version :  ${VERSION}
URL     :  http://github.com/sebastien/select.js
Updated :  2026-04-21
```

Select Cells provides minimal reactive primitives used by `select.ui.js` and
usable on their own. It focuses on explicit updates, path-based selection,
and lightweight pub/sub.

The functions currently implemented are available from the `cell` module.

Primitives
:
 - `cell(value?)`
 - `derived(template, processor?, initial?)`
 - `Cell` (class)
 - `Selected` (class)

Structure helpers
:
 - `access(context, path, offset?)`
 - `assign(scope, path, value, merge?, offset?)`
 - `walk(value, path?)`
 - `expand(value)`

Reactive instance API (Cell / Selected / Derivation)
:
 - `value`, `revision`, `length`
 - `get(key?)`
 - `map(functor)`
 - `set(value, path?, force?)`
 - `select(path)`
 - `sub(handler)` / `unsub(handler)`
 - `pub(value, path?, origin?)`
 - `push(value)` (`Cell` only)
 - `refresh()` (`Selected` only)

Differences with larger state managers
--------------------------------------

- No scheduler or hidden batching layer by default
- Path-oriented updates and subscriptions are first-class
- Can be embedded in plain objects and arrays
- Small API surface designed for composition with Select/UI

Using
-----

```javascript
import cell, { derived } from "@./select.cells.js"

const count = cell(0)
const doubled = derived([count], (n) => n * 2)

count.sub((value) => {
  console.log("count:", value, "doubled:", doubled.value)
})

count.set(1)
count.set(2)
```

Path-based selection example:

```javascript
const state = cell({ user: { profile: { name: "Ada" } } })
const name = state.select(["user", "profile", "name"])

name.sub((value) => console.log("name changed:", value))
state.set("Grace", ["user", "profile", "name"])
```

Extending
---------

Cells are designed to stay small. Prefer extension by composition:
wrap `cell()` and `derived()` in module-specific helpers for domain state.

```javascript
import cell, { derived } from "@./select.cells.js"

export const counter = (initial = 0) => {
  const value = cell(initial)
  const label = derived([value], (n) => `Count: ${n}`)
  return { value, label }
}
```

Contributing
------------

If you'd like to improve Select Cells, open an issue or pull request at
<http://github.com/sebastien/select.js>. Performance and memory footprint
improvements are especially welcome.

API
---

The `cell` module
-----------------

`cell(value?)`

: Creates a mutable reactive `Cell` instance.

`derived(template, processor?, initial?)`

: Creates a reactive derivation from a template containing cells. Derivations
  recompute when source cells publish updates.

`Cell` / `Selected`

: Exported reactive classes used by `cell()` and path selections.

`walk(value, path?)`

: Iterates through nested values and yields `[reactive, path]` entries.

`expand(value)`

: Recursively expands reactive values to plain values.

`access(context, path, offset?)`

: Reads a nested value from `context` by path.

`assign(scope, path, value, merge?, offset?)`

: Writes a nested value by path, creating intermediate containers as needed.

Reactive behavior
-----------------

`reactive.sub(handler)` / `reactive.unsub(handler)`

: Subscribes/unsubscribes update handlers receiving `(value, path, origin)`.

`reactive.select(path)`

: Creates a `Selected` reactive value linked to a path in the parent value.

`cell.set(value, path?, force?)`

: Updates the cell value (optionally under a path) and publishes changes.

`selected.refresh()`

: Re-evaluates the selected path against parent state and publishes updates.

`reactive.map(functor)` / `reactive.length`

: Convenience collection-like helpers on reactive values.
