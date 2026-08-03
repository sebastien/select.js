# Select Cells (`select/state/cells.js`)

## Fine-grained reactive values and derivations

Select Cells provides minimal reactive primitives used by `select/ui.js` and
usable on their own. It focuses on explicit updates, path-based selection,
and lightweight pub/sub.

### Primitives:

- `cell(value?, options?)`: Creates a mutable reactive `Cell`. Options: `{ pending, schedule }` where `schedule` is `["defer"|"throttle"|"batch", delay]`, a shared utils/async scheduler, or `null`.
- `cells(value|object)`: Default export. Creates a single mutable reactive `Cell`, or a plain object of cells when given a plain object.
- `cell.store(initial?)` / `cellStore(initial?)`: Root cell for store-mode UI trees (see bag vs store in `ref-ui.md`). Same pattern as `cell.derived`. `cell.store.map(shape)` ≡ `cells(shape)`.
- `reconcile(target, value)` / `cell.reconcile(value)`: Diff-merge a plain tree onto a cell with batched path writes (bypasses schedule).
- `browser(options?)`: Creates browser-backed cells for `path`, `query`, `hash`, `localStorage`, and in-memory shared state.
	- Query and hash use the same hashformat serializer by default (`a=1,b=(2,3)`).
- `deferred(value?, delay)`: Alias for `cell(value, { schedule: ["defer", delay] })` (debounced writes).
- `derived(template, processor?, initial?)`: Creates a reactive derivation from a template containing cells.
	- Use `.updater(fn)` on the returned derivation to forward `set(...)` or `merge(...)` writes into source cells.
- `effect(inputs, effector)`: Subscribes to all reactives in `inputs`, runs `effector(expanded, path, origin)`, returns disposer.
- `Cell` (class): The base class for mutable reactive values.
- `Selected` (class): A reactive value linked to a specific path within a parent reactive value.
- `Reactive` (class): The abstract base class for all reactive types.

### Structure helpers:

- `access(context, path, offset?)`: Safely reads a nested value from an object/array by path.
- `assign(scope, path, value, merge?, offset?)`: Writes a nested value by path, creating intermediate objects/arrays as needed. `undefined` path entries pick the next free numeric slot in the current array or object, and create arrays when they need to materialize a missing container.
- `walk(value, path?)`: Recursively iterates through a structure and yields `[reactive, path]` for every reactive value found.
- `expand(value)`: Recursively resolves all reactive values within a structure to their plain values.

### Reactive instance API (Cell / Selected / Derivation):

- `value`: The current plain value of the reactive instance.
- `revision`: An integer that increments whenever the value changes.
- `length`: Returns the length of the underlying value if it is a collection.
- `get(key?)`: Returns a child value by key, or the full value if no key is provided.
- `map(functor)`: Returns a new array by applying the functor to each element of the underlying value.
- `set(value, path?, force?)`: Updates the value (optionally at a specific path) and notifies subscribers. `force` bypasses `schedule`.
- `schedule(spec)`: Attaches/replaces/clears a write scheduler on a `Cell` (construct-time or runtime).
- `flush()`: Runs the attached scheduler immediately (`Cell`).
- `select(path)`: Returns a `Selected` instance linked to the specified path.
- `sub(handler)`: Subscribes a handler to receive updates `(value, path, origin)`.
- `unsub(handler)`: Unsubscribes a previously registered handler.
- `effect(handler)`: Subscribes `handler` and returns an idempotent unsubscriber callback.
- `pub(value, path?, origin?)`: Manually publishes an update to all subscribers.
- `merge(value)`: Merges or replaces the current value (`Cell` and `Selected`).
- `push(value)`: Appends a value to the underlying array (`Cell` and `Selected`).
- `refresh()`: Re-evaluates the value from the source (`Selected` and `Derivation` only).
- `dispose()`: Releases resources for lifecycle-aware reactive instances (`Selected`, `Cell` schedule, `Derivation`).

### Differences with larger state managers

- No write scheduler by default (`schedule` is opt-in); sync `batch()` only coalesces pubs in one turn
- Path-oriented updates and subscriptions are first-class
- Can be embedded in plain objects and arrays
- Small API surface designed for composition with Select/UI

### Using

```javascript
import cell, { derived } from "@select/state/cells.js"

const count = cell(0)
const doubled = derived([count], (n) => n * 2)

count.sub((value) => {
  console.log("count:", value, "doubled:", doubled.value)
})

count.set(1)
count.set(2)
```

Write-through derivation example:

```javascript
const count = cell(2)
const doubled = derived(count, (n) => n * 2).updater((value) => {
  count.set(value / 2)
})

doubled.set(10)
console.log(count.value)   // 5
console.log(doubled.value) // 10
```

Multiple cell declaration example:

```javascript
import cells from "@select/state/cells.js"

const { name, age } = cells({ name: "Ada", age: 37 })

name.set("Adele")
age.set(38)
```

Store-mode root (app/tree state) example:

```javascript
import cell from "@select/state/cells.js"

// One root cell for a whole document/tree (like cell.derived / cell.batch)
const state = cell.store({
  logs: [],
  filter: "all",
})

// Path write
state.set("warn", "filter")

// Full snapshot patch (structuredClone + edit, server payload, …)
state.reconcile({
  logs: [{ type: "info", message: "hi" }],
  filter: "warn",
})

// Fine-grained view
const logs = state.select("logs")
logs.push({ type: "error", message: "boom" })
```

Pass the root cell into UI as top-level data so instances subscribe automatically:

```javascript
Inspector.new().set({ value: state }).mount("#app")
// later:
state.reconcile(nextTree)
```

Browser-backed state example:

```javascript
import { browser } from "@select/state/browser.js"

const state = browser()
const sidebar = state.query.select("sidebar")

sidebar.set("open")
const prefs = state.local("prefs", { theme: "light" })
prefs.select("theme").set("dark")

const modal = state.internal("modal.open", false)
modal.set(true)
```

Serializer note:

- Default query/hash format is hashformat (comma-separated atoms, `key=value`, nested values in parentheses).
- Legacy URLSearchParams-style query parsing (`a=1&b=2`) is not supported by default.
- Custom serializers can still be provided through `browser({ query, hash })`.
- See [`browser.md`](browser.md) and [`ref-browser.md`](ref-browser.md) for the browser-specific guide and API reference.

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
import cell, { derived } from "@select/state/cells.js"

export const counter = (initial = 0) => {
  const value = cell(initial)
  const label = derived([value], (n) => `Count: ${n}`)
  return { value, label }
}
```

### API

### The `cell` module:

- `cell(value?, options?)`: Creates a mutable reactive `Cell`. Options: `{ pending, schedule }`.
- `cells(value|object)`: Default export. Returns a single cell for non-object values, or an object of cells for plain-object input.
- `browser(options?)`: Creates `{ path, query, hash, local, internal }` browser-backed reactive helpers.
- `deferred(value?, delay)`: Alias for `cell(value, { schedule: ["defer", delay] })`.
- `derived(template, processor?, initial?)`: Creates a reactive derivation from a template containing cells.
- `walk(value, path?)`: Iterates through nested values and yields `[reactive, path]` entries.
- `expand(value)`: Recursively expands reactive values to plain values.
- `access(context, path, offset?)`: Reads a nested value from `context` by path.
- `assign(scope, path, value, merge?, offset?)`: Writes a nested value by path, creating intermediate containers as needed.
- `Cell`: Exported reactive class used for root mutable state.
- `Selected`: Exported reactive class used for path-based selections.
- `Reactive`: Base class for all reactive primitives.

### Reactive behavior:

- `reactive.sub(handler)`: Subscribes an update handler receiving `(value, path, origin)`.
- `reactive.unsub(handler)`: Unsubscribes a previously registered update handler.
- `reactive.select(path)`: Creates a `Selected` reactive value linked to a path in the parent value.
- `reactive.pub(value, path?, origin?)`: Manually triggers an update notification.
- `reactive.map(functor)`: Convenience helper to map over collection values.
- `reactive.get(key?)`: Retrieves a value or child value.
- `cell.set(value, path?, force?)`: Updates the cell value (optionally under a path) and publishes changes. `force` bypasses `schedule`.
- `cell.schedule(spec)`: Attaches/replaces/clears a write scheduler.
- `cell.flush()`: Runs the attached scheduler immediately.
- `cell.merge(value)`: Merges arrays/objects, or replaces with `value`.
- `cell.push(value)`: Appends a value to an underlying array cell.
- `selected.refresh()`: Re-evaluates the selected path against parent state and publishes updates.
- `selected.set(value, path?, force?)`: Updates the parent cell through this selection.
- `selected.merge(value)`: Merges arrays/objects at the selected path, or replaces with `value`.
- `selected.push(value)`: Appends a value at the selected path (coercing non-arrays as needed).
- `selected.dispose()`: Unregisters this selection from its parent cell.
- `derivation.refresh()`: Forces re-computation of a derived value.
- `derivation.updater(fn)`: Registers a single write-through handler used by `derivation.set(...)` and `derivation.merge(...)`.
- `derivation.unbind()`: Unsubscribes from all source cells.
- `derivation.dispose()`: Unsubscribes from sources and clears derivation subscriptions/references.
- `cell.dispose()`: Cancels pending scheduled writes and detaches the schedule.
