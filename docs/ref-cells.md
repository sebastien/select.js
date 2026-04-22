# Select Cells Reference Guide

A minimal, fine-grained reactive state management library. It provides primitives for creating reactive values (cells) and derivations, with support for deep path-based updates and subscriptions.

### Overview

Select Cells revolves around the concept of "cells"—reactive containers for data. When a cell's value changes, any dependent derivations or subscribers are notified. It is designed to be lightweight, performant, and easily integrated into any JavaScript project, particularly with `select.ui.js`.

### Core Concepts

### Cells
A `Cell` is a mutable reactive value. You can get its current value via `.value` and update it via `.set(value)`.

```javascript
import { cell } from "./select.cells.js";
const count = cell(0);
console.log(count.value); // 0
count.set(1);
```

### Derivations
A `Derivation` is a reactive value computed from one or more source cells. It recomputes automatically when its dependencies change.

```javascript
import { cell, derived } from "./select.cells.js";
const count = cell(10);
const doubled = derived([count], (val) => val * 2);
console.log(doubled.value); // 20
```

### Deferred Cells
A `Deferred` cell is a mutable reactive value that delays its update by a specified amount of time. If multiple updates occur within that delay, only the last one is applied (debouncing).

```javascript
import { deferred } from "./select.cells.js";
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
- `deferred(value?, delay)`: Factory function to create a new `Deferred` cell instance for debounced updates.
- `derived(template, processor?, initial?)`: Factory function to create a new `Derivation` instance. `template` can be a cell, an array of cells, or a function.
- `access(context, path, offset?)`: Utility to read a nested value from a plain object/array by path.
- `assign(scope, path, value, merge?, offset?)`: Utility to write a nested value by path into a plain object/array.
- `walk(value, path?)`: Iterates through a structure and yields `[reactive, path]` for every reactive value found.
- `expand(value)`: Deeply resolves a structure by replacing all reactive values with their current plain values.

### Reactive Instance Methods (Cell / Selected / Derivation):

- `.get(key?)`: Returns the value of the cell, or a specific property if `key` is provided.
- `.set(value, path?, force?)`: Updates the value. If `path` is provided, updates a nested property. If `force` is true, triggers updates even if the value hasn't changed.
- `.select(path)`: Returns a `Selected` instance linked to a specific path in the current cell.
- `.sub(handler)`: Subscribes a handler function `(value, path, origin) => ...` to updates.
- `.unsub(handler)`: Removes a previously registered subscriber.
- `.pub(value, path?, origin?)`: Manually publishes an update notification.
- `.map(functor)`: Creates a new array by mapping over the cell's current value (if it's an array).
- `.push(value)`: Appends an item to the cell's value (only if it's an array).
- `.refresh()`: Forces the reactive value to re-evaluate its state.
- `.dispose()`: Releases subscriptions/resources for reactive helpers that support lifecycle (`Selected`, `Deferred`, `Derivation`).

### Reactive Instance Properties:

- `value`: The current plain JavaScript value.
- `revision`: An auto-incrementing integer representing the version of the data.
- `length`: Returns the length of the underlying value (if it supports `.length`).

### Common Patterns

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
