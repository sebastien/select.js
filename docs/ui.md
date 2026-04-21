# Select UI (`select.ui.js`)
## A standalone, simple and performant UI rendering library

```
Version :  ${VERSION}
URL     :  http://github.com/sebastien/select.js
Updated :  2026-04-21
```

Select UI is a template-driven rendering layer for interactive interfaces. It
binds data and behavior directly to DOM templates using lightweight slot
attributes (`out`, `in`, `inout`, `on:<event>`, `when`, `ref`, `out:<attr>`),
without a build step.

The functions currently implemented are available from the `ui` module.

Template creation
:
 - `ui(selection, scope?)`
 - `Dynamic(type, props?)`
 - `lazy(loader, placeholder?)`
 - `ui.register(name, component)`
 - `ui.resolve(name)`

Template utilities
:
 - `len(value)`
 - `type(value)` and `type.{Null|Number|Boolean|String|Object|List|Dict}`
 - `remap(value, mapper)`

Template API (returned by `ui(...)`)
:
 - `Component(data)` (applied template)
 - `new(parent?)`
 - `does(behavior)`
 - `on(event, handler)` / `sub(event, handler)`
 - `init(initializer)`
 - `map(mapper)`
 - `apply(data)`

Component instance API
:
 - `set(data, key?)`
 - `update(data, force?)`
 - `mount(target, previous?)`
 - `unmount()`
 - `render(data?)`
 - `send(event, data)` / `pub(event, data)`
 - `emit(event, data)`
 - `on(event, handler)` / `off(event, handler)`
 - `provide(key, value)` / `inject(key, defaultValue?)`

Differences with virtual DOM frameworks
--------------------------------------

- Direct DOM updates through slot bindings (no virtual DOM diff)
- Template attributes drive behavior (`out`, `in`, `inout`, `on:*`, `when`, `ref`)
- Works with plain ESM and browser-native templates/DOM
- Keeps rendering granular at the slot level

Using
-----

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

Extending
---------

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

Contributing
------------

If you'd like to improve Select UI, open an issue or pull request at
<http://github.com/sebastien/select.js>. Improvements around rendering
correctness, performance, and documentation clarity are preferred.

API
---

The `ui` module
---------------

`ui(selection, scope?)`

: Creates a template component from a CSS selector, HTML string, DOM node,
  or node array. Returns a callable template function enhanced with component
  builder methods (`new`, `does`, `on`, `init`, `map`, `apply`).

`Dynamic(type, props?)`

: Resolves a registered component by name (or uses the function directly)
  and applies `props`.

`lazy(loader, placeholder?)`

: Creates a lazy component resolver that returns `placeholder` until `loader`
  resolves.

`ui.register(name, component)` / `ui.resolve(name)`

: Registers and resolves dynamic components by name.

Template methods
----------------

`template.does(behavior)`

: Binds slot handlers. Handler signature is typically
  `(self, data, event?) => value`.

`template.init(initializer)`

: Provides initial state for each instance (often used with cells).

`template.on(event, handler)` / `template.sub(event, handler)`

: Subscribes to template-level events bubbled by child instances.

`template.new(parent?)`

: Creates a component instance that can be mounted.

`template(data)` / `template.apply(data)`

: Returns an applied template object for composition and nested rendering.

Component instance methods
--------------------------

`instance.set(data, key?)`

: Replaces instance data and renders.

`instance.update(data, force?)`

: Merges partial updates and renders only when tracked dependencies changed.

`instance.mount(target, previous?)` / `instance.unmount()`

: Attaches/removes instance nodes in the DOM.

`instance.send(event, data)` / `instance.pub(event, data)`

: Emits events upward for parent coordination.

`instance.emit(event, data)`

: Alias to `pub(event, data)`.

`instance.on(event, handler)` / `instance.off(event, handler)`

: Adds/removes runtime event subscribers on an instance.

`instance.provide(key, value)` / `instance.inject(key, defaultValue?)`

: Provides and consumes parent context values. Reactive context values trigger
  re-render on updates.

Slot attributes
---------------

`out`, `in`, `inout`, `on:<event>`, `when`, `ref`, `out:<attr>`

: Define rendering, input, event handling, conditional display, references,
  and attribute-level bindings.
