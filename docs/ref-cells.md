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

### Path-based Selection
Cells support nested data structures. You can "select" a path within a cell to get a reactive view of that specific nested value.

```javascript
const state = cell({ user: { name: "Alice" } });
const name = state.select("user.name");
name.sub((val) => console.log("Name is now:", val));
state.set("Bob", "user.name");
```

### API Reference

### The `cell` module:

- `cell(value?)`: Factory function to create a new `Cell` instance.
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
    .init(() => ({ count: cell(0) }))
    .does({
        count: (self, { count }) => count.value
    });
```
