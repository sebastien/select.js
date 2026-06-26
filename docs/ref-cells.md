# Select Cells Reference Guide

A minimal, fine-grained reactive state management library. It provides primitives for creating reactive values (cells) and derivations, with support for deep path-based updates and subscriptions.

### Overview

Select Cells revolves around the concept of "cells"—reactive containers for data. When a cell's value changes, any dependent derivations or subscribers are notified. It is designed to be lightweight, performant, and easily integrated into any JavaScript project, particularly with `select.ui.js`.

### Core Concepts

### Cells
A `Cell` is a mutable reactive value. You can get its current value via `.value` and update it via `.set(value)`.

```javascript
import { cell } from "./cells.js";
const count = cell(0);
console.log(count.value); // 0
count.set(1);
```

The default export also supports declaring multiple cells from a plain object:

```javascript
import cells from "./cells.js";

const { name, age } = cells({ name: "Ada", age: 37 });
name.set("Adele");
age.set(38);
```

### Derivations
A `Derivation` is a reactive value computed from one or more source cells. It recomputes automatically when its dependencies change.

```javascript
import { cell, derived } from "./cells.js";
const count = cell(10);
const doubled = derived([count], (val) => val * 2);
console.log(doubled.value); // 20
```

Derivations are read-only by default, but they can expose write-through behavior with `.updater(fn)`. The updater runs when `.set(...)` or `.merge(...)` is called on the derived cell, and can redirect that write into the source cells.

```javascript
const count = cell(2)
const doubled = derived(count, (value) => value * 2).updater((value) => {
  count.set(value / 2)
})

doubled.set(10)
console.log(count.value)   // 5
console.log(doubled.value) // 10
```

### Deferred Cells
A `Deferred` cell is a mutable reactive value that delays its update by a specified amount of time. If multiple updates occur within that delay, only the last one is applied (debouncing).

```javascript
import { deferred } from "./cells.js";
const query = deferred("", 300);
query.sub((val) => console.log("Searching for:", val));

query.set("h");
query.set("he");
query.set("hel"); // Only this will trigger the subscription after 300ms
```

### Path-based Selection
Cells support nested data structures. You can "select" a path within a cell to get a reactive view of that specific nested value.

```javascript
const state = cell({ user: { name: "Ada" } });
const name = state.select("user.name");
name.sub((val) => console.log("Name is now:", val));
state.set("Grace", "user.name");
```

### Normalization
Cells can normalize root values before they are stored. Use `.normalize(fn)` to register a function that transforms values passed to `.set(value)`.

```javascript
const amount = cell(0).normalize((value) =>
  value == null ? null : Number(value)
)

amount.set("42")
console.log(amount.value) // 42
```

Notes:

- Normalization applies to root updates like `.set(value)`.
- Path-based updates like `.set(value, "user.age")` do not go through the normalizer.
- `Selected#set(...)` also bypasses the root normalizer because it delegates to a path update on the parent cell.

### Pub/Sub and Updates
Select Cells uses an explicit pub/sub mechanism. Every reactive instance (`Cell`, `Selected`, `Derivation`) allows you to subscribe to changes.

**Basic Subscription:**
```javascript
const count = cell(0);
const handler = (value, path, origin) => {
  console.log(`Value: ${value}, Path: ${path}, Origin: ${origin}`);
};

count.sub(handler);
count.set(1);   // Logs: Value: 1, Path: null, Origin: [Cell]
count.unsub(handler);
```

**Nested Updates:**
When updating a nested path, the update notification propagates from the modified leaf up to the root, and down to any selections affected by that path.

```javascript
const state = cell({ a: { b: 1 } });

// Subscribing to the root
state.sub((value, path) => {
  console.log("Root changed at path:", path);
});

// Subscribing to a specific branch
state.select("a.b").sub((value) => {
  console.log("Branch a.b is now:", value);
});

state.set(2, "a.b"); 
// Logs: 
// Branch a.b is now: 2
// Root changed at path: ["a", "b"]
```

### API Reference

### The `cell` module:

- `cell(value?)`: Factory function to create a new `Cell` instance.
- `cells(value|object)`: Default export. Returns a `Cell` for non-object values, or an object of `Cell` instances for plain-object input.
- `browser(options?)`: Factory that returns browser-backed `path`, `query`, `hash`, `local(key, dflt, opts?)`, and `internal(name, value)` cells.
	- Default `query`/`hash` serialization uses hashformat syntax (for example `a=1,b=(2,3)`).
- `deferred(value?, delay)`: Factory function to create a new `Deferred` cell instance for debounced updates.
- `derived(template, processor?, initial?)`: Factory function to create a new `Derivation` instance. `template` can be a cell, an array of cells, or a function.
- `effect(inputs, effector)`: Factory helper that subscribes to all reactives in `inputs`, runs `effector(expanded, path, origin)`, and returns an idempotent disposer.
- `access(context, path, offset?)`: Utility to read a nested value from a plain object/array by path.
- `assign(scope, path, value, merge?, offset?)`: Utility to write a nested value by path into a plain object/array.
- `walk(value, path?)`: Iterates through a structure and yields `[reactive, path]` for every reactive value found.
- `expand(value)`: Deeply resolves a structure by replacing all reactive values with their current plain values.

### Reactive Instance Methods (Cell / Selected / Derivation):

- `.get(key?)`: Returns the value of the cell, or a specific property if `key` is provided.
- `.set(value, path?, force?)`: Updates the value. If `path` is provided, updates a nested property. If `force` is true, triggers updates even if the value hasn't changed.
- `.normalize(fn)`: Registers a root-value normalizer applied to `.set(value)` updates.
- `.updater(fn)`: On `Derivation`, registers a single write-through handler used by `.set(...)` and `.merge(...)`.
- `.select(path)`: Returns a `Selected` instance linked to a specific path in the current cell.
- `.sub(handler)`: Subscribes a handler function `(value, path, origin) => ...` to updates.
- `.unsub(handler)`: Removes a previously registered subscriber.
- `.effect(handler)`: Subscribes `handler` and returns an idempotent unsubscriber callback.
- `.pub(value, path?, origin?)`: Manually publishes an update notification.
- `.map(functor)`: Creates a new array by mapping over the cell's current value (if it's an array).
- `.merge(value)`: Merges arrays/objects when possible, otherwise replaces with `value`.
- `.push(value)`: Appends an item to the current value (`Cell` and `Selected` support this).
- `.refresh()`: Forces the reactive value to re-evaluate its state.
- `.dispose()`: Releases subscriptions/resources for reactive helpers that support lifecycle (`Selected`, `Deferred`, `Derivation`).

### Reactive Instance Properties:

- `value`: The current plain JavaScript value.
- `revision`: An auto-incrementing integer representing the version of the data.
- `length`: Returns the length of the underlying value (if it supports `.length`).

### Common Patterns

### Browser Query/Hash Format

By default, `browser()` uses the same hashformat serializer for both `location.search` and `location.hash`:

- lists: `1,2,3`
- objects: `a=1,b=2`
- nested values: `a=(1,2),b=(x=1,y=2)`

Notes:

- Legacy URL query parsing (`a=1&b=2`) is not supported by default.
- You can override behavior with `browser({ query: { parse, format }, hash: { parse, format } })`.
- `internal(name, value)` returns an in-memory shared cell and reuses an existing one for the same `name`.
- See [`browser.md`](browser.md) and [`ref-browser.md`](ref-browser.md) for the dedicated browser guide and serializer reference.

### Reactive Objects
You can store complex objects in cells and subscribe to specific paths.

```javascript
const user = cell({ id: 1, profile: { color: "blue" } });
user.select("profile.color").sub((color) => {
    document.body.style.backgroundColor = color;
});
```

### Computed Lists
Derivations are perfect for filtering or sorting lists reactively.

```javascript
const items = cell([1, 2, 3, 4, 5]);
const evenItems = derived([items], (list) => list.filter(n => n % 2 === 0));
```

### Integration with Select UI
Select Cells is the primary state engine for `select.ui.js`.

```javascript
const Counter = ui(`<div>Count: <span out="count"></span></div>`)
    .init(() => {
        const count = cell(0)
        const doubled = derived([count], (value) => value * 2)
        return { count, doubled }
    })
    .does({
        count: (self, { count, doubled }) => `${count.value} (x2: ${doubled.value})`
    });
```
