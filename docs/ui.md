# Select UI (`select.ui.js`)

## A standalone, simple and performant UI rendering library

Select UI is a template-driven rendering layer for interactive interfaces. It
binds data and behavior directly to DOM templates using lightweight slot
attributes (`out`, `in`, `inout`, `on:<event>`, `when`, `ref`, `out:<attr>`),
without a build step.

### Template creation:

- `ui(selection, scope?)`: Main entry point for creating templates.
- `Dynamic(type, props?)`: Dynamic component resolution.
- `lazy(loader, placeholder?)`: Lazy loading support.
- `ui.register(name, component)`: Component registration.
- `ui.resolve(name)`: Component lookup.

### Template utilities:

- `len(value)`: Universal length helper.
- `type(value)`: Type identification system.
- `remap(value, mapper)`: Data transformation utility.

### Template API (returned by `ui(...)`):

- `Component(data)`: Applied template creator.
- `new(parent?)`: Instance factory.
- `does(behavior)`: Behavior definition.
- `on(event, handler)` / `sub(event, handler)`: Event subscription.
- `init(initializer)`: State initialization.
- `map(mapper)`: Collection mapping.
- `apply(data)`: Data application.

### Component instance API:

- `set(data, key?)`: Direct state updates.
- `update(data, force?)`: Reactive partial updates.
- `mount(target, previous?)`: DOM attachment.
- `unmount()`: DOM detachment.
- `render(data?)`: Rendering engine access.
- `send(event, data)` / `pub(event, data)`: Message passing.
- `emit(event, data)`: Event emission.
- `on(event, handler)` / `off(event, handler)`: Dynamic event binding.
- `provide(key, value)` / `inject(key, defaultValue?)`: Context management.

### Differences with virtual DOM frameworks

- Direct DOM updates through slot bindings (no virtual DOM diff)
- Template attributes drive behavior (`out`, `in`, `inout`, `on:*`, `when`, `ref`)
- Works with plain ESM and browser-native templates/DOM
- Keeps rendering granular at the slot level

### Using

```html
<template id="Counter">
  <div>
    <button on:click="dec">-</button>
    <span out="count">0</span>
    <button on:click="inc">+</button>
  </div>
</template>

<script type="module">
import ui from "@./select.ui.js"

const Counter = ui("#Counter").does({
  count: (self, { count }) => count ?? 0,
  dec: (self, { count }) => self.update({ count: (count ?? 0) - 1 }),
  inc: (self, { count }) => self.update({ count: (count ?? 0) + 1 }),
})

Counter.new().set({ count: 1 }).mount("#app")
</script>
```

### Extending

UI is designed for composition: create reusable templates, register them for
dynamic resolution, and combine them with behavior maps.

```javascript
import ui, { Dynamic } from "@./select.ui.js"

const Badge = ui("<span out=\"label\"></span>").does({
  label: (self, { label }) => label,
})

ui.register("Badge", Badge)
Dynamic("Badge", { label: "Ready" })
```

### API

### The `ui` module:

- `ui(selection, scope?)`: Creates a template component from a CSS selector, HTML string, DOM node, or node array. Returns a callable template function enhanced with component builder methods.
- `Dynamic(type, props?)`: Resolves a registered component by name (or uses the function directly) and applies `props`.
- `lazy(loader, placeholder?)`: Creates a lazy component resolver that returns `placeholder` until `loader` resolves.
- `ui.register(name, component)`: Registers a component in the dynamic registry.
- `ui.resolve(name)`: Resolves a component from the dynamic registry by name.

### Template utilities:

- `len(value)`: Returns the length or size of the given value (supports arrays, strings, Maps, Sets, and Objects).
- `type(value)`: Returns a numeric type code for the given value (e.g., `type.List`, `type.Dict`).
- `remap(value, mapper)`: Recursively transforms a value using the provided mapper function.

### Template methods:

- `template.new(parent?)`: Creates a new component instance from this template.
- `template.does(behavior)`: Binds slot handlers (behavior) to the template. Handler signature is `(self, data, event?) => value`.
- `template.init(initializer)`: Defines an initializer that provides initial state for each new instance.
- `template.on(event, handler)` / `template.sub(event, handler)`: Subscribes to events bubbled by child instances of this template.
- `template.apply(data)`: Returns an applied template object for composition or nested rendering.
- `template.map(data)`: Returns a list of applied template objects, one for each item in the data collection.
- `template(data)`: Shorthand for `template.apply(data)`.

### Component instance methods:

- `instance.set(data, key?)`: Replaces the instance data and triggers a re-render.
- `instance.update(data, force?)`: Merges partial data updates and re-renders only if tracked dependencies changed.
- `instance.mount(target, previous?)`: Attaches the instance's nodes to the DOM at the specified target.
- `instance.unmount()`: Removes the instance's nodes from the DOM.
- `instance.render(data?)`: Forces a re-render of the instance, optionally with new data.
- `instance.send(event, data)` / `instance.pub(event, data)`: Publishes an event upward through the component tree.
- `instance.emit(event, data)`: Alias for `pub(event, data)`.
- `instance.on(event, handler)` / `instance.off(event, handler)`: Adds or removes runtime event listeners on the instance.
- `instance.provide(key, value)`: Provides a context value to be consumed by child instances.
- `instance.inject(key, defaultValue?)`: Consumes a context value provided by an ancestor instance.

### Slot attributes:

- `out`: Binds a slot's content to a data value (output).
- `in`: Binds a slot's input (e.g., value of an `<input>`) to instance data.
- `inout`: Two-way binding between slot and instance data.
- `on:<event>`: Binds a DOM event to an instance method or behavior handler.
- `when`: Conditional rendering with expression or shorthand predicate syntax.
- `ref`: Provides a reference to the DOM node in the instance's `self.refs`.
- `out:<attr>`: Binds a specific DOM attribute to a data value.
- `slot`: Defines a named slot for content injection.

### `when` shorthand and inference

`when` accepts shorthand slot predicates:

- `when="slot"`: show when `slot` is truthy
- `when="!slot"`: show when `slot` is falsy
- `when="?slot"`: show when `slot !== undefined`
- `when="!?slot"`: show when `slot === undefined`

If the key is omitted, it is inferred from `out` on the same element:

- `when` or `when=""` + `out="slot"` => `when="slot"`
- `when="?"` + `out="slot"` => `when="?slot"`
- `when="!"` + `out="slot"` => `when="!slot"`
- `when="!?"` + `out="slot"` => `when="!?slot"`

If key inference is requested but no `out` slot is available, `when` is left as a
regular HTML attribute and an error is logged.
