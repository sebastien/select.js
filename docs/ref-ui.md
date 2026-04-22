# Select UI Reference Guide

A standalone, simple and performant UI rendering library designed for quickly
creating interactive UIs and visualizations.

## Overview

Select UI uses a template-based approach with declarative data binding. You
define templates in HTML with special attributes (`out`, `in`, `inout`,
`on:<event>`, `when`, `ref`) and connect them to behavior handlers that manage
state and rendering.

## Quick Start

```javascript
import ui from "./select.ui.js";

// Create a component from HTML
const Hello = ui(`<div out="message">Loading...</div>`).does({
  message: (self, { message }) => message,
});

// Instantiate, set data, and mount
Hello.new().set({ message: "Hello, World!" }).mount("#app");
```

## Core Concepts

### Templates

Templates can be defined in two ways:

**Inline HTML:**

```javascript
const Button = ui(`<button out="label">Click me</button>`);
```

**DOM Templates:**

```html
<template id="Button">
  <button out="label">Click me</button>
</template>
```

```javascript
const Button = ui("#Button");
```

### Slot Attributes

| Attribute      | Purpose                                  |
| -------------- | ---------------------------------------- |
| `out`          | Output slot - renders data to DOM        |
| `out:<attr>`   | Attribute slot - binds data to attribute |
| `in`           | Input slot - captures user input         |
| `inout`        | Bidirectional - both input and output    |
| `on:<event>`   | Event handler binding                    |
| `when`         | Conditional rendering                    |
| `ref`          | Direct DOM node reference                |

### Component Lifecycle

```
ui(template) → .does(behavior) → .new() → .set(data) → .mount(target)
```

### List Rendering

Rendering collections of data is handled by returning an array of nested
components (Applied Templates) from an `out` behavior.

```javascript
const Item = ui(`<li out="name"></li>`).does({
  name: (self, { name }) => name,
});

const List = ui(`<ul out="items"></ul>`).does({
  items: (self, { items }) => items.map(Item),
});
```

When an array is returned to an `out` slot:
1. Each item is matched to a DOM node (reusing existing nodes if keys/indices match).
2. If the item is an `AppliedUITemplate`, a component instance is managed.
3. If the item is a string/number, a text node is managed.
4. If the item is a DOM Node, it is inserted directly.

#### Efficient Mapping with `.map()`

The `.map(data)` method on a component is a shorthand for `remap(data, v => Component(v))`.

```javascript
items: (self, { items }) => Item.map(items)
```

### Nested Templates

Templates can be nested to create complex structures. You can define a child
template and use it within a parent's behavior.

#### DOM-Based Nesting

When using `<template>` elements in your HTML, you can nest them to organize your UI components.

```html
<template id="TodoList">
  <ul out="items"></ul>
  <template id="TodoItem">
    <li out="label"></li>
  </template>
</template>
```

To use the nested template, you simply select it by its ID. Select UI will find it even if it's inside another template's content.

```javascript
const TodoItem = ui("#TodoItem").does({
  label: (self, { label }) => label,
});

const TodoList = ui("#TodoList").does({
  items: (self, { items }) => items.map(TodoItem),
});
```

#### Composition with Applied Templates

You can also use standard `<slot>` elements for composition, allowing parents to
inject content into children.

```html
<template id="Card">
  <div class="card">
    <div class="header"><slot name="header"></slot></div>
    <div class="body"><slot></slot></div>
  </div>
</template>
```

```javascript
const Card = ui("#Card");

const Page = ui(`<div out="content"></div>`).does({
  content: (self) => Card({
    slots: {
      header: ui(`<h3>Title</h3>`)(),
      default: ui(`<p>Card content</p>`)()
    }
  })
});
```

## API Reference

### `ui(selection)`

Creates a component from an HTML string or DOM selector.

```javascript
// From HTML string
const Component = ui(`<div out="content"></div>`);

// From template element
const Component = ui("#MyTemplate");
```

Returns a component function with these methods:

- `new(parent?)`: Create a new component instance.
- `does(behavior)`: Define behavior handlers for slots. Returns the component for chaining.
- `init(initializer)`: Define initial state (often used with cells). Returns the component for chaining.
- `on(event, handler)` / `sub(event, handler)`: Subscribe to events bubbled by child instances. Returns the component for chaining.
- `map(data)`: Map a collection of data to a list of applied templates.
- `apply(data)`: Create an applied template for composition (same result as calling the component as a function).
- `ui.register(name, component)`: Register a component in the global registry.
- `ui.resolve(name)`: Resolve a component from the global registry.

### Component Instance Methods

- `set(data, key?)`: Replaces the instance data and triggers a re-render.
- `update(data, force?)`: Merges partial data updates and re-renders only if tracked dependencies changed.
- `mount(target, previous?)`: Attaches the instance's nodes to the DOM at the specified target.
- `unmount()`: Removes the instance's nodes from the DOM.
- `dispose()`: Releases instance resources (runtime listeners, reactive/context subscriptions, child instances) without removing nodes directly.
- `render(data?)`: Forces a re-render of the instance, optionally with new data.
- `send(event, data)` / `pub(event, data)`: Publishes an event upward through the component tree.
- `emit(event, data)`: Alias for `pub(event, data)`.
- `on(event, handler)` / `off(event, handler)`: Adds or removes runtime event listeners on the instance.
- `provide(key, value)`: Provides a context value to be consumed by child instances.
- `inject(key, defaultValue?)`: Consumes a context value provided by an ancestor instance.
- `does(behavior)`: Binds additional behavior handlers to the instance.

### Slot Attributes

- `out`: Binds a slot's content to a data value (output).
- `out:<attr>`: Binds a specific DOM attribute to a data value (e.g., `out:class`, `out:style`, `out:disabled`).
- `in`: Binds a slot's input (e.g., value of an `<input>`) to instance data.
- `inout`: Two-way binding between slot and instance data.
- `on:<event>`: Binds a DOM event to an instance method or behavior handler.
- `when`: Conditional rendering with expression or shorthand predicates.
- `ref`: Provides a reference to the DOM node in the instance's `self.ref`.
- `slot`: Defines a named slot for content injection.


### Behavior Definition

#### `.does(behavior)`

Defines handlers for slots. Each handler receives `(self, data, event?)`.

```javascript
const Counter = ui(`
  <div>
    <span out="count">0</span>
    <button on:click="increment">+</button>
  </div>
`).does({
  count: (self, { count }) => count ?? 0,
  increment: (self, { count }) => self.update({ count: (count ?? 0) + 1 }),
});
```

**Handler signature:** `(self, data, event?) => value`

- `self` - The component instance
- `data` - Current component data
- `event` - DOM event (for `on:<event>`/`in` handlers)

### Event Subscription

#### `.on(event, handler)` / `.sub(event, handler)`

Subscribe to events published by child components.

```javascript
const List = ui("#List")
  .does({
    items: (self, { items }) => items.map(Item),
  })
  .on({
    Remove: (self, { items }, event) =>
      self.set({ items: items.filter((i) => i !== event.data) }),
  });
```

**Handler return values:**

- `false` - Stop event propagation and processing
- `null` - Stop propagation but continue processing
- Other - Continue normal propagation

### Initial State

#### `.init(initializer)`

Define initial state, useful with reactive cells.

```javascript
import cell, { derived } from "./select.cells.js";

const ColorPicker = ui("#ColorPicker").init(() => {
  const red = cell(100);
  const green = cell(130);
  const blue = cell(10);
  const color = derived([red, green, blue], (r, g, b) => `rgb(${r},${g},${b})`);
  return { red, green, blue, color };
});
```

### Instance Properties

| Property | Description                              |
| -------- | ---------------------------------------- |
| `data`   | Current component data                   |
| `nodes`  | Array of root DOM nodes                  |
| `ref`    | Object containing `ref` attribute nodes  |
| `parent` | Parent component instance                |
| `id`     | Unique instance identifier               |
| `state`  | Instance-specific internal state         |

## Slot Types

### Output Slots (`out`)

Render data to the DOM. Content can be text, HTML, or nested components.

```html
<span out="name">Default text</span>
```

```javascript
.does({
  name: (self, { name }) => name,
})
```

### Input Slots (`in`)

Capture user input. The handler receives the DOM event.

```html
<input in="search" placeholder="Search..." />
```

```javascript
.does({
  search: (self, data, event) => {
    if (event) {
      self.update({ query: event.target.value });
    }
    return data.query;
  },
})
```

### Bidirectional Slots (`inout`)

Both display and capture data.

```html
<input inout="value" type="text" />
```

```javascript
.does({
  value: (self, data, event) => {
    return event ? self.update({ value: event.target.value }) : data.value;
  },
})
```

### Event Slots (`on:<event>`)

Bind event handlers with explicit event types using `on:<event>="handlerName"`.

```html
<!-- Click event with "save" handler -->
<button on:click="save">Save</button>

<!-- Handler name defaults to event type if omitted -->
<button on:click>Click me</button>

<!-- Form submit -->
<form on:submit="handleSubmit">...</form>

<!-- Multiple events on same element -->
<button on:click="save" on:mouseenter="highlight">Save</button>
```

```javascript
.does({
  save: (self, data, event) => {
    console.log("Saving:", data);
  },
  click: (self, data, event) => {
    console.log("Clicked!");
  },
  highlight: (self, data, event) => {
    event.target.classList.add("highlighted");
  },
})
```

### Conditional Slots (`when`)

Show/hide elements with either slot shorthand predicates or full expressions.

Shorthand forms:

- `slot` (truthy)
- `!slot` (falsy)
- `?slot` (defined, including `null`)
- `!?slot` (undefined)

Key inference from `out` on the same element:

- `when` or `when=""` + `out="slot"` => `when="slot"`
- `when="?"` + `out="slot"` => `when="?slot"`
- `when="!"` + `out="slot"` => `when="!slot"`
- `when="!?"` + `out="slot"` => `when="!?slot"`

If key inference is requested but no `out` slot exists, `when` stays as a
regular HTML attribute and an error is logged.

For full expressions, `when` still evaluates JavaScript with access to `self`,
`data`, and `event`.

```html
<div when="data.editing">
  <input in="editValue" />
  <button on:click="save">Save</button>
</div>
<div when="!data.editing">
  <span out="value"></span>
  <button on:click="edit">Edit</button>
</div>

<div when out="open">
  Visible when `open` is truthy
</div>

<div when="?" out="value">
  Visible when `value` is defined
</div>
```

### Reference Slots (`ref`)

Direct access to DOM nodes.

```html
<canvas ref="canvas"></canvas>
```

```javascript
.does({
  draw: (self, data) => {
    const ctx = self.ref.canvas.getContext("2d");
    // Draw on canvas
  },
})
```

### Attribute Slots (`out:<attr>`)

Bind behavior outputs directly to element attributes. Use `out:<attr>` where
`<attr>` is the attribute name, optionally with a custom slot name.

```html
<!-- Uses "disabled" as the behavior name -->
<button out:disabled>Submit</button>

<!-- Uses "isDisabled" as the behavior name -->
<button out:disabled="isDisabled">Submit</button>

<!-- Multiple attribute bindings -->
<div out:class="classes" out:style="styles" out:data-id="itemId">
  Content
</div>
```

```javascript
.does({
  isDisabled: (self, { loading }) => loading,
  classes: (self, { active }) => ({ active, highlight: true }),
  styles: (self, { color }) => ({ backgroundColor: color }),
  itemId: (self, { id }) => id,
})
```

**Handler signature:** `(self, data, attrValue, node) => value`

- `self` - The component instance
- `data` - Current component data
- `attrValue` - Current attribute value (string or null)
- `node` - The DOM element

#### Special Handling for `class`

Returns are additive (original template classes preserved). Falsy values are
filtered out (like `clsx`):

```javascript
// Object format - keys are class names, values toggle them
classes: (self, { active, error }) => ({
  active: active,      // Add "active" if truthy
  error: error,        // Add "error" if truthy
  highlight: true,     // Always add "highlight"
  disabled: false,     // Never add "disabled"
})

// Array format - all truthy values become classes
classes: (self, { type }) => [
  'btn',
  `btn-${type}`,
  type === 'primary' && 'btn-bold'
]

// String format
classes: (self, { type }) => `btn btn-${type}`
```

#### Special Handling for `style`

Returns are additive (original template styles preserved):

```javascript
// Object format - camelCase properties
styles: (self, { bg, size }) => ({
  backgroundColor: bg,
  fontSize: `${size}px`,
  padding: null,  // Removes this property
})

// String format
styles: (self, { bg }) => `background-color: ${bg}; padding: 10px`
```

#### Boolean Attributes

For attributes like `disabled`, `hidden`, `readonly`:

```javascript
// Truthy adds the attribute, falsy removes it
isDisabled: (self, { loading, error }) => loading || error,
isHidden: (self, { visible }) => !visible,
```

#### Regular Attributes

```javascript
// Set to value, or remove with null/undefined
ariaLabel: (self, { label }) => label,
dataId: (self, { id }) => id ?? null,  // null removes attribute
```

## Nesting Components

### Using Applied Templates

Apply a component to data to create nested components.

```javascript
const Item = ui(`<li out="name"></li>`).does({
  name: (self, { name }) => name,
});

const List = ui(`<ul out="items"></ul>`).does({
  items: (self, { items }) =>
    items.map((item) => Item(item)), // Item(item) returns AppliedUITemplate
});
```

### Parent-Child Communication

Children send events up to parents.

```javascript
const Item = ui(`
  <li>
    <span out="name"></span>
    <button on:click="remove">X</button>
  </li>
`).does({
  name: (self, { name }) => name,
  remove: (self, data) => self.send("Remove", data),
});

const List = ui(`<ul out="items"></ul>`)
  .does({
    items: (self, { items }) => items.map(Item),
  })
  .on({
    Remove: (self, { items }, event) =>
      self.set({ items: items.filter((i) => i !== event.data) }),
  });
```

## Utility Functions

### `type(value)`

Returns the type of a value as a constant.

```javascript
import { type } from "./select.ui.js";

type(null); // type.Null
type(42); // type.Number
type("hello"); // type.String
type(true); // type.Boolean
type([1, 2]); // type.List
type({ a: 1 }); // type.Dict
type(new Date()); // type.Object
```

Type constants:

- `type.Null` (1)
- `type.Number` (2)
- `type.Boolean` (3)
- `type.String` (4)
- `type.Object` (5)
- `type.List` (10)
- `type.Dict` (11)

### `len(value)`

Returns the length/size of a value.

```javascript
import { len } from "./select.ui.js";

len(null); // 0
len([1, 2, 3]); // 3
len("hello"); // 5
len({ a: 1, b: 2 }); // 2
len(new Map([["a", 1]])); // 1
len(new Set([1, 2])); // 2
```

### `remap(value, fn)`

Maps over arrays, objects, Maps, or Sets uniformly.

```javascript
import { remap } from "./select.ui.js";

remap([1, 2, 3], (v) => v * 2); // [2, 4, 6]
remap({ a: 1, b: 2 }, (v, k) => v * 2); // { a: 2, b: 4 }
```

## Common Patterns

### Form Handling

```html
<template id="LoginForm">
  <form on:submit>
    <input inout="username" placeholder="Username" />
    <input inout="password" type="password" placeholder="Password" />
    <button type="submit">Login</button>
  </form>
</template>
```

```javascript
const LoginForm = ui("#LoginForm").does({
  username: (self, data, event) =>
    event ? self.update({ username: event.target.value }) : data.username,
  password: (self, data, event) =>
    event ? self.update({ password: event.target.value }) : data.password,
  submit: (self, { username, password }, event) => {
    event.preventDefault();
    self.send("Login", { username, password });
  },
});
```

### Filtered Lists

```javascript
const FilteredList = ui(`
  <div>
    <input inout="filter" placeholder="Filter..." />
    <ul out="items"></ul>
  </div>
`).does({
  filter: (self, data, event) =>
    event ? self.update({ filter: event.target.value }) : data.filter,
  items: (self, { items, filter }) => {
    const filtered = filter
      ? items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()))
      : items;
    return filtered.map(Item);
  },
});
```

### Editable Items

```html
<template id="EditableItem">
  <div when="!data.editing">
    <span out="value"></span>
    <button on:click="edit">Edit</button>
  </div>
  <div when="data.editing">
    <input inout="editValue" />
    <button on:click="save">Save</button>
    <button on:click="cancel">Cancel</button>
  </div>
</template>
```

```javascript
const EditableItem = ui("#EditableItem").does({
  value: (self, { value }) => value,
  editValue: (self, data, event) =>
    event
      ? self.update({ editValue: event.target.value })
      : data.editValue ?? data.value,
  edit: (self, { value }) => self.update({ editing: true, editValue: value }),
  save: (self, { editValue }) =>
    self.update({ editing: false, value: editValue }),
  cancel: (self) => self.update({ editing: false }),
});
```

### Type-Based Rendering

```javascript
const inspect = (value) => {
  const t = type(value);
  switch (t) {
    case type.List:
      return InspectList({ value });
    case type.Dict:
      return InspectDict({ value });
    case type.String:
      return InspectString({ value });
    case type.Number:
      return InspectNumber({ value });
    default:
      return InspectDefault({ value });
  }
};
```

### Reactive State with Cells

```javascript
import cell, { derived } from "./select.cells.js";

const Counter = ui(`
  <div>
    <span out="display"></span>
    <button on:click="increment">+</button>
  </div>
`)
  .init(() => {
    const count = cell(0);
    const display = derived([count], (c) => `Count: ${c}`);
    return { count, display };
  })
  .does({
    display: (self, { display }) => display.value,
    increment: (self, { count }) => count.set(count.value + 1),
  });
```

### Dynamic Styling

Use `out:class` and `out:style` for reactive styling without direct DOM
manipulation:

```javascript
const StatusBadge = ui(`
  <span class="badge" out:class="badgeClass" out:style="badgeStyle" out="label">
    Status
  </span>
`).does({
  label: (self, { status }) => status,
  badgeClass: (self, { status }) => ({
    'badge-success': status === 'active',
    'badge-warning': status === 'pending',
    'badge-danger': status === 'error',
  }),
  badgeStyle: (self, { pulse }) => pulse
    ? { animation: 'pulse 1s infinite' }
    : null,
});

// Usage
StatusBadge.new().set({ status: 'active', pulse: true }).mount('#app');
```

```javascript
// Button with dynamic variants
const Button = ui(`
  <button class="btn" out:class="btnClass" out:disabled="isDisabled" on:click>
    <span out="label">Click</span>
  </button>
`).does({
  label: (self, { label }) => label,
  btnClass: (self, { variant, loading }) => ({
    [`btn-${variant || 'primary'}`]: true,
    'btn-loading': loading,
  }),
  isDisabled: (self, { disabled, loading }) => disabled || loading,
  click: (self, data, event) => {
    if (!data.disabled && !data.loading) {
      self.send("Click", data);
    }
  },
});
```

## Best Practices

1. **Use templates in HTML** for better readability and performance
2. **Keep behaviors pure** when possible - return values, use `update()` for
   state changes
3. **Use `update()` for partial updates** instead of `set()` to preserve state
4. **Leverage `when` attributes** for conditional UI instead of JavaScript logic
5. **Use `ref` sparingly** - prefer `out:attr` bindings over direct DOM manipulation
6. **Send events up, pass data down** - follow unidirectional data flow
7. **Use `init()` with cells** for complex reactive state management
8. **Prefer `out:class` and `out:style`** over manipulating `ref` nodes directly
