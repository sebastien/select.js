# Select Cells (`select.cells.js`)

## Fine-grained reactive values and derivations

Select Cells provides minimal reactive primitives used by `select.ui.js` and
usable on their own. It focuses on explicit updates, path-based selection,
and lightweight pub/sub.

### Primitives:

- `cell(value?)`: Creates a mutable reactive `Cell` instance.
- `deferred(value?, delay)`: Creates a mutable reactive `Deferred` cell that debounces updates by the given delay.
- `derived(template, processor?, initial?)`: Creates a reactive derivation from a template containing cells.
- `Cell` (class): The base class for mutable reactive values.
- `Deferred` (class): A cell that delays and debounces its updates.
- `Selected` (class): A reactive value linked to a specific path within a parent reactive value.
- `Reactive` (class): The abstract base class for all reactive types.

### Structure helpers:

- `access(context, path, offset?)`: Safely reads a nested value from an object/array by path.
- `assign(scope, path, value, merge?, offset?)`: Writes a nested value by path, creating intermediate objects/arrays as needed.
- `walk(value, path?)`: Recursively iterates through a structure and yields `[reactive, path]` for every reactive value found.
- `expand(value)`: Recursively resolves all reactive values within a structure to their plain values.

### Reactive instance API (Cell / Selected / Derivation):

- `value`: The current plain value of the reactive instance.
- `revision`: An integer that increments whenever the value changes.
- `length`: Returns the length of the underlying value if it is a collection.
- `get(key?)`: Returns a child value by key, or the full value if no key is provided.
- `map(functor)`: Returns a new array by applying the functor to each element of the underlying value.
- `set(value, path?, force?)`: Updates the value (optionally at a specific path) and notifies subscribers.
- `select(path)`: Returns a `Selected` instance linked to the specified path.
- `sub(handler)`: Subscribes a handler to receive updates `(value, path, origin)`.
- `unsub(handler)`: Unsubscribes a previously registered handler.
- `pub(value, path?, origin?)`: Manually publishes an update to all subscribers.
- `push(value)`: Appends a value to the underlying array (`Cell` only).
- `refresh()`: Re-evaluates the value from the source (`Selected` and `Derivation` only).
- `dispose()`: Releases resources for lifecycle-aware reactive instances (`Selected`, `Deferred`, `Derivation`).

### Differences with larger state managers

- No scheduler or hidden batching layer by default
- Path-oriented updates and subscriptions are first-class
- Can be embedded in plain objects and arrays
- Small API surface designed for composition with Select/UI

### Using

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

### Extending

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

### API

### The `cell` module:

- `cell(value?)`: Creates a mutable reactive `Cell` instance.
- `deferred(value?, delay)`: Creates a mutable reactive `Deferred` cell that debounces updates.
- `derived(template, processor?, initial?)`: Creates a reactive derivation from a template containing cells.
- `walk(value, path?)`: Iterates through nested values and yields `[reactive, path]` entries.
- `expand(value)`: Recursively expands reactive values to plain values.
- `access(context, path, offset?)`: Reads a nested value from `context` by path.
- `assign(scope, path, value, merge?, offset?)`: Writes a nested value by path, creating intermediate containers as needed.
- `Cell`: Exported reactive class used for root mutable state.
- `Deferred`: Exported reactive class used for debounced state.
- `Selected`: Exported reactive class used for path-based selections.
- `Reactive`: Base class for all reactive primitives.

### Reactive behavior:

- `reactive.sub(handler)`: Subscribes an update handler receiving `(value, path, origin)`.
- `reactive.unsub(handler)`: Unsubscribes a previously registered update handler.
- `reactive.select(path)`: Creates a `Selected` reactive value linked to a path in the parent value.
- `reactive.pub(value, path?, origin?)`: Manually triggers an update notification.
- `reactive.map(functor)`: Convenience helper to map over collection values.
- `reactive.get(key?)`: Retrieves a value or child value.
- `cell.set(value, path?, force?)`: Updates the cell value (optionally under a path) and publishes changes.
- `cell.push(value)`: Appends a value to an underlying array cell.
- `selected.refresh()`: Re-evaluates the selected path against parent state and publishes updates.
- `selected.set(value, path?, force?)`: Updates the parent cell through this selection.
- `selected.dispose()`: Unregisters this selection from its parent cell.
- `derivation.refresh()`: Forces re-computation of a derived value.
- `derivation.unbind()`: Unsubscribes from all source cells.
- `derivation.dispose()`: Unsubscribes from sources and clears derivation subscriptions/references.
- `deferred.dispose()`: Cancels a pending debounced update.
