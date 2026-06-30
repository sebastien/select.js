# Select UI (`select/ui.js`)

## A standalone, simple and performant UI rendering library

Select UI is a template-driven rendering layer for interactive interfaces. It
binds data and behavior directly to DOM templates using lightweight slot
attributes (`out`, `in`, `inout`, `on:<event>`, `when`, `ref`, `out:<attr>`),
without a build step.

For icon loading and `<ui-icon>` usage, see [`docs/icons.md`](./icons.md).

Binding note:

- `out` and `on:<event>` payload expressions support mapped object syntax such as
  `a:b|Proc` or `a:b,c:d|Proc`.
- In `out`, function processors receive unwrapped mapped values while
  component/template processors receive raw/reactive mapped values.
- In `on:<event>` publish payloads, mapped values stay raw/reactive.

### Template creation:

- `ui(selection, scope?)`: Main entry point for creating templates.
- `Dynamic(type, props?)`: Dynamic component resolution.
- `lazy(loader, placeholder?)`: Lazy loading support.
- `webcomponent(name, componentFactory, initial?, options?)`: Registers a custom element backed by Select UI or a pure render function.
- `UIWebComponent`: Base class used by registered Select UI custom elements.
- `ui.register(name, component)`: Component registration.
- `ui.resolve(name)`: Component lookup.
- `ui.load(url, scope?)`: Loads and parses external template fragments once, then caches them for template binding.
- `ui.component(name)`: Declares a logic-only component definition that can later be bound with `.using(templateRef)`.
- `ui.formats`: Global formatter/processor registry used by `out` and `when` pipelines.
- `ui.format(name, formatter)`: Registers a formatter in `ui.formats`.
- `ui.unformat(name)`: Removes a formatter from `ui.formats`.
- `ui.resolveFormat(name)`: Looks up a formatter in `ui.formats`.
- `ui.options`: Global UI options.
  - `componentRootClass` (default `true`): Adds the component name as a class on each component root element (`class="ComponentName ..."`, with the component class first).
- Fallback selector mode: if `ui(selector)` does not resolve any `<template>` but matches regular DOM nodes, those nodes are cloned and used as template source.
  - In this mode, `data='{"...": ...}'` on matched source nodes is parsed as JSON object and used as default instance payload.
  - Invalid JSON throws immediately.

### Template utilities:

- `len(value)`: Universal length helper.
- `type(value)`: Type identification system.
- `remap(value, mapper)`: Data transformation utility.

### Template API (returned by `ui(...)`):

- `Component(data)`: Applied template creator.
- `Component.ChildName`: Nested named template exposed as a child component when `<template name="ChildName">` (or `<template id="ChildName">`) is declared inside the component template.
- `singleton`: Optional public slot for caller-managed singleton instance (`Component.singleton = Component.new()`).
- `new(parent?, options?)`: Instance factory. `options.data` pre-seeds
  `self.data` before `init(self, data)` runs.
- `does(behavior)`: Behavior definition.
- `on(event, handler)` / `sub(event, handler)`: Event subscription.
- `init(initializer)`: State initialization. The initializer receives
  `(self, data)` where `data` is `self.data`. Top-level reactives returned from
  `init()` stay stable by identity for the life of the instance; plain incoming
  values write through them and incoming reactives are fused to them until the
  incoming reactive reference changes.
- `cleanup(handler)`: Dispose-time teardown hook.
- `using(selection, scope?)`: Rebinds the same behavior/state definition to another template.
- `map(data)`: Collection mapping to applied templates.
- `apply(data)`: Applied template creation (same result as `Component(data)`).

When you call `Component.new(parent, { data })`, that `data` is available as
`self.data` during `init(self, data)`. Wrapped `webcomponent(...)` hosts use the
same path, so host attributes are available during `init(...)` on first mount.

### Component definition API (returned by `ui.component(name)`):

- `init(initializer)`: State initialization for future bound templates with the
  same stable top-level reactive behavior. Initializers receive `(self, data)`
  where `data` is `self.data`.
- `does(behavior)`: Behavior map for future bound templates.
- `on(event, handler)` / `sub(event, handler)`: Event subscriptions for future bound templates.
- `cleanup(handler)`: Teardown hook for future bound templates.
- `using(selection, scope?)`: Binds the definition to a loaded/existing template and returns a renderable component.

Notes:

- Definitions are not renderable until bound. Calling `.new()`, `.apply()`, or `.map()` on an unbound definition throws.
- For external template refs (`"path/file.html#Template"`), call `await ui.load("path/file.html")` first.
- Name lookup order for `ui("TemplateName")`: document/scope templates first, then the most recently loaded external template with that name.

### Component instance API:

- `set(data, key?)`: Direct state updates. When `data` provides a plain value
  for a top-level reactive created by `init()`, the instance writes through the
  existing reactive instead of replacing it. When `data` provides a reactive,
  the instance fuses it with the existing reactive until the incoming reactive
  reference changes.
- `update(data, force?)`: Reactive partial updates with the same top-level
  reactive fusion semantics as `set(...)`.
- `mount(target, previous?)`: DOM attachment.
  - `mount(target, true)`: replace-host mode. Mounts rendered nodes at `target` position, then removes the original host node.
  - Fallback shorthand: in fallback selector mode with exactly one original host, `mount()` (no args) auto-applies replace-host behavior. If host count is not exactly one, it throws and requires explicit `mount(selector, true)`.
- `unmount()`: DOM detachment.
- `dispose()`: Releases instance listeners/subscriptions and child instances.
- `effect(setup)`: Runs `setup(self)` and auto-runs returned teardown on dispose.
- `render(data?)`: Rendering engine access.
- `pub(event, data)`: Publishes an event upward through the component tree.
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
import ui from "@./ui.js"

const Counter = ui("#Counter").does({
  count: (self, { count }) => count ?? 0,
  dec: (self, { count }) => self.update({ count: (count ?? 0) - 1 }),
  inc: (self, { count }) => self.update({ count: (count ?? 0) + 1 }),
})

Counter.new().set({ count: 1 }).mount("#app")
</script>
```

### Web Components

`select/ui.js` can register native custom elements through `webcomponent(...)`.
The component factory can be either:

- a Select UI template (from `ui(...)`)
- a pure render function returning `Node`, node lists, `Selection`, or text

```javascript
import ui, { webcomponent } from "@./ui.js"

const Counter = ui(`
  <section>
    <h3 out="title">Counter</h3>
    <button on:click="dec">-</button>
    <strong out="count">0</strong>
    <button on:click="inc">+</button>
  </section>
`).does({
  title: (_self, { title }) => title,
  count: (_self, { count }) => count ?? 0,
  dec: (self, { count }) => self.update({ count: (count ?? 0) - 1 }),
  inc: (self, { count }) => self.update({ count: (count ?? 0) + 1 }),
})

webcomponent("x-counter", Counter, { title: "Counter", count: 0 })
```

```html
<x-counter title="Web Counter" count="3"></x-counter>
```

Wrapped Select UI custom elements can publish back to a Select parent through
the `ui-parent` attribute. When a Select template contains a kebab-case custom
element such as `<x-counter>`, Select now injects `ui-parent` automatically
unless the attribute is already set explicitly.

```javascript
const Child = ui(`
  <button on:click="click" out="count"></button>
`).does({
  count: (_self, { count }) => count ?? 0,
  click: (self, { count }) => self.pub("Increment", count ?? 1)
})

webcomponent("x-stepper", Child, { count: 2 })

const Parent = ui(`
  <section>
    <x-stepper count="2"></x-stepper>
    <output out="total"></output>
  </section>
`).sub({
  Increment: (_self, { total }, event) => ({ total: (total ?? 0) + event.data })
})
```

When a wrapped custom element is mounted outside a Select template tree, set
`ui-parent` yourself:

```html
<x-stepper ui-parent="ui-12" count="2"></x-stepper>
```

For a pure renderer:

```javascript
import { webcomponent } from "@./ui.js"

const Badge = ({ label, tone }) => {
  const node = document.createElement("span")
  node.textContent = label ?? "Badge"
  node.style.padding = "0.2rem 0.5rem"
  node.style.borderRadius = "999px"
  node.style.background = tone === "warn" ? "#fff3cd" : "#e7f1ff"
  return node
}

webcomponent("x-badge", Badge, { label: "Ready", tone: "info" })
```

### Extending

UI is designed for composition: create reusable templates, register them for
dynamic resolution, and combine them with behavior maps.

```javascript
import ui, { Dynamic } from "@./ui.js"

const Badge = ui("<span out=\"label\"></span>").does({
  label: (self, { label }) => label,
})

ui.register("Badge", Badge)
Dynamic("Badge", { label: "Ready" })
```

### API

### The `ui` module:

- `ui(selection, scope?)`: Creates a template component from a CSS selector, HTML string, DOM node, or node array. Returns a callable template function enhanced with component builder methods.
- `ui.load(url, scope?)`: Fetches/parses an external fragment and caches discovered `<template>` nodes.
- `ui.component(name)`: Creates or resolves a named logic-only component definition.
- `Dynamic(type, props?)`: Resolves a registered component by name (or uses the function directly) and applies `props`.
- `lazy(loader, placeholder?)`: Creates a lazy component resolver that returns `placeholder` until `loader` resolves.
- `webcomponent(name, componentFactory, initial?, options?)`: Registers a custom element using either a Select UI template component or a pure render function.
- `UIWebComponent`: Exported base class for Select UI-backed custom elements.
- `ui.register(name, component)`: Registers a component in the dynamic registry.
- `ui.resolve(name)`: Resolves a component from the dynamic registry by name.
- `ui.formats`: Global formatter/processor registry used by `out="slot|..."` and `when="...|..."`.
- `ui.format(name, formatter)`: Registers `formatter` in `ui.formats`.
- `ui.unformat(name)`: Removes a formatter from `ui.formats`.
- `ui.resolveFormat(name)`: Resolves a formatter from `ui.formats` by name.
- `ui.options`: Global UI options.
  - `ui.options.componentRootClass` (default `true`): Adds the component name as a class on each component root element when a component has a name (for example from `<template id="ComponentName">` or `<template name="ComponentName">`). The component class is inserted first in the class attribute.

### Template utilities:

- `len(value)`: Returns the length or size of the given value (supports arrays, strings, Maps, Sets, and Objects).
- `type(value)`: Returns a numeric type code for the given value (e.g., `type.List`, `type.Dict`).
- `remap(value, mapper)`: Recursively transforms a value using the provided mapper function.

### Template methods:

- `template.new(parent?)`: Creates a new component instance from this template.
- `template.does(behavior)`: Binds slot handlers (behavior) to the template. Handler signature is `(self, data, event?) => value`.
- `template.init(initializer)`: Defines an initializer that provides initial
  state for each new instance. Top-level reactives returned there remain the
  mounted state object, so later plain props write through them and later
  reactive props fuse to them.
- `template.cleanup(handler)`: Registers a cleanup handler called at instance disposal. Signature: `(self, data) => void`.
- `template.on(event, handler)` / `template.sub(event, handler)`: Subscribes to events bubbled by child instances of this template.
- `template.using(selection, scope?)`: Returns a new component bound to another template while preserving behavior/init/subscriptions.
- `template.apply(data)`: Returns an applied template object for composition or nested rendering (same as `template(data)`).
- `template.map(data)`: Returns a list (or mapped container) of applied template objects, one per entry in the input collection.
- `template(data)`: Shorthand for `template.apply(data)`.

External template resolution details:

- `ui("./fragment.html#Card")`: Explicitly resolves `Card` from that loaded fragment.
- `ui("Card")`: Resolves `Card` from the current document/scope first; if not found, resolves from the most recently loaded external fragment that defines `Card`.
- `ui.load(...)` only fetches/parses once per URL; subsequent lookups reuse cached templates.

### Component instance methods:

- `instance.set(data, key?)`: Replaces the instance data and triggers a re-render.
- `instance.update(data, force?)`: Merges partial data updates and re-renders only if tracked dependencies changed.
- `instance.mount(target, previous?)`: Attaches the instance's nodes to the DOM at the specified target.
- `instance.unmount()`: Removes the instance's nodes from the DOM.
- `instance.dispose()`: Releases runtime listeners/subscriptions and child instances.
- `instance.effect(setup)`: Runs `setup(self)` and registers returned teardown for disposal.
- `instance.render(data?)`: Forces a re-render of the instance, optionally with new data.
- `instance.pub(event, data)`: Publishes an event upward through the component tree.
- `instance.on(event, handler)` / `instance.off(event, handler)`: Adds or removes runtime event listeners on the instance.
- `instance.provide(key, value)`: Provides a context value to be consumed by child instances.
- `instance.inject(key, defaultValue?)`: Consumes a context value provided by an ancestor instance.

### Slot attributes:

- `out`: Binds a slot's content to a data value (output).
- `out-replace`: Same as `out`, but replaces the host element itself with the rendered content.
- `out` with processors: `out="slot|Formatter|Formatter"` pipes the slot value through processors.
- `in`: Binds a slot's input (e.g., value of an `<input>`) to instance data.
- `inout`: Two-way binding between slot and instance data.
- `on:<event>`: Binds a DOM event to a handler (`on:click="save"`) or an effect publish expression (`on:click="item.id!Selected"`).
- `when`: Conditional rendering with shorthand predicates, safe comparisons, and processors (non-eval).
- `ref`: Provides a reference to the DOM node in the instance's `self.ref`.
- `out:<attr>`: Binds a specific DOM attribute to a data value.
  - Binding mode: `out:<attr>="slot|Formatter|Formatter"`
  - Template mode: `out:<attr>="prefix-${path.to.value}-suffix"`
  - Comparison mode: `out:<attr>="slot==value"` (uses the same operators as `when`)
  - Modes are exclusive: use either whole-attribute binding pipelines, comparison expressions, or template interpolation.
- `slot`: Defines a named slot for content injection (content projection), not data output binding.

### `out` processors and `when` shorthand

`out` accepts processor pipelines:

- `out="slot"`: render slot value directly
- `out-replace="slot"`: render slot value in place of the bound node
- `out="slot|Formatter"`: pass `slot` through one processor
- `out="slot|FormatterA|FormatterB"`: chain processors left-to-right
- `out="slot|formatter+arg1+arg2.subvalue"`: call function processors as `formatter(value, arg1, arg2Subvalue, ...)`
- `out="collection|*Formatter"`: apply `Formatter` to each item of `collection` (preserving array/map/set/object shape)
- In starred pipelines, function processors receive the item key as the second argument when no `+arg` values are provided.
- With `+arg` values, starred function processors receive the item key first and the resolved args after it (`processor(item, itemKey, ...args)`).
- Regular (non-starred) processors always receive `processor(item, ...args)`.

Each `+arg` segment is a data-path lookup resolved against the current component
data. Dotted paths such as `+settings.units.suffix` expand reactive values while
traversing and before the processor is invoked.

`out-replace` uses the same binding and processor pipeline as `out`, but mounts
its result between anchors at the original node position. This is useful when
the wrapper element should not remain in the final DOM.

When the `out-replace` host element has classes, styles, or attributes, they are
merged into rendered element node(s). For multi-node results, each rendered
element inherits them. Class/style are merged as union additions, while regular
attributes are only applied when not already set on the rendered node.

Processor lookup order is:

1. component-local nested templates (`Component.Name`, defined by nested `<template name="Name">`/`id="Name">`)
2. global registry (`ui.formats`)

The same lookup order applies to starred processors too (`*Item`, `*asCurrency`):
local nested template first, then global `ui.formats`.

Naming convention:

1. `PascalCase` names are for component formatters (for example `ClientItem`)
2. `camelCase`/`lowercase` names are for function formatters (for example `asCurrency`)

Registering processors:

```javascript
ui.format("ClientItem", ClientItem)
ui.format("asCurrency", (value) => `$${Number(value ?? 0).toFixed(2)}`)
ui.format({
	asPercent: (value) => `${Math.round(Number(value ?? 0) * 100)}%`,
	asLabel: (value) => `${value ?? ""}`,
})
```

### `on:<event>` effects (`!Event`)

Event bindings support handler mode and publish/effect mode:

- `on:click="save"`: call behavior handler `save(self, data, event)`
- `on:click`: same as `on:click="click"`
- `on:click="!Clicked"`: publish `Clicked` with current component data as payload
- `on:click="path.to.value!Selected"`: publish `Selected` with payload from data path
- `on:click="path.to.value|processorA|processorB!Selected"`: same, after processors
- `on:click="path.to.value|formatter+arg1+arg2!Selected"`: same, with resolved processor arguments
- `on:click="!Selected."`: publish then call `event.stopPropagation()`
- `on:click="!Selected-"`: publish then call `event.preventDefault()`
- `on:click="!Selected.-"`: publish then call both `event.stopPropagation()` and `event.preventDefault()`

Effect modifiers (suffix on event name in publish mode):

- `.`: stop propagation
- `-`: prevent default
- `.-` (or `-.`): stop propagation and prevent default

Using nested component-local processors:

```html
<template id="CardList">
  <ul out="items|Item"></ul>
  <template name="Item">
    <li out="label"></li>
  </template>
</template>
```

```javascript
const CardList = ui("#CardList")
CardList.Item.does({
  label: (_self, { label }) => label,
})
CardList.does({
  items: (_self, { items }) => items,
})
```

In this case, `|Item` resolves to `CardList.Item` first, even if `ui.format("Item", ...)` exists globally.

When a processor resolves to a UI component/template, it is applied to the current value and rendered as child content (`out="client|ClientItem"`).
With `*`, the processor is applied per item, including template processors
(`out="clients|*ClientItem"`).

`out:<attr>` also supports template interpolation for all attributes:

- `out:style="width:${width}px; height:${height}px"`
- `out:title="${name} (${role})"`
- `out:style="width:${column.width|em}"`
- `out:href="mailto:${.}"`
- `out:href="/users/${.id}"`

`data` can be referenced explicitly with `data`/`data.path`, or with the root
alias `.`/`.path`:

- `out=".|ListItem"` (pass full data to formatter/component)
- `${.}` (full data in template interpolation)
- `${.email}` (nested path from root data)

The special path prefix `#` resolves to the current item's iteration key
(e.g. the map key when rendering a list with `.map(data, key)`):

- `#` resolves to the key value (from `$key`, `.map()` key parameter, or instance key)
- `#.label` resolves to `key.label` where `key` is the current item's key
- `out="#"` renders the iteration key as the output value

In template mode, placeholders support optional processor pipelines (`${path|Formatter|formatter+arg}`), with no expression evaluation. Missing or invalid placeholders render as empty strings.

`when` accepts shorthand slot predicates:

- `when="slot"`: show when `slot` is truthy
- `when="!slot"`: show when `slot` is falsy
- `when="?slot"`: show when `slot !== undefined`
- `when="!?slot"`: show when `slot === undefined`
- `when="!focus&history"`: show when all clauses are true

`when` also accepts processor pipelines:

- `when="slot|Formatter"`
- `when="slot|formatter+arg1+arg2"`
- `when="?slot|FormatterA|FormatterB"`

`when` uses the same `ui.formats` registry as `out`.

`when` also accepts logical conjunction with `&` between complete shorthand clauses:

- `when="focus&history"`
- `when="!focus&history"`
- `when="?focus&history=ready"`

Each side of `&` must be a complete valid `when` clause. `when` still does not
evaluate arbitrary JavaScript.

`when` also accepts safe comparison expressions in the form `{slot}{op}{raw_value}`.
These same comparison expressions also work in `out:<attr>` bindings
(e.g. `out:checked="panel==3"`, `out:disabled="index>=2"`):

- `when="slot=value"`: non-strict equality (`==`)
- `when="slot!=value"`: non-strict inequality (`!=`)
- `when="slot==value"`: strict equality (`===`)
- `when="slot!==value"`: strict inequality (`!==`)
- `when="slot>value"`, `when="slot>=value"`, `when="slot<value"`, `when="slot<=value"`
- `when="slot~?value"`: case-insensitive string contains

Raw value parsing is literal and safe:

- `true` / `false` -> booleans
- `null` -> `null`
- `undefined` -> `undefined`
- numeric literals (including scientific notation) -> numbers
- other values -> strings

If the key is omitted, it is inferred from `out`/`out:*` on the same element:

- `when` or `when=""` + `out="slot"` => `when="slot"`
- `when="?"` + `out="slot"` => `when="?slot"`
- `when="!"` + `out="slot"` => `when="!slot"`
- `when="!?"` + `out="slot"` => `when="!?slot"`
- `when` + `out:href="mailto:${.}"` => `when="."`

If key inference is requested but no `out` slot is available, `when` is left as a
regular HTML attribute and an error is logged.

Security note: `when` does not evaluate arbitrary JavaScript expressions.

### Eager behaviors and cleanup

`does(...)` supports eager entries using a `!` suffix:

- `does({ "name!": fn })` executes `fn(self, data, event?)` on every render, even if `name!` is not referenced by `out`, `in`, `inout`, `when`, or `out:<attr>`.
- Return `undefined` for side-effect-only handlers (no state write).
- Return any other value to write into key `name` (without `!`).

Use `cleanup(...)` to teardown resources established by eager handlers when the instance is disposed/unmounted.

```javascript
const Feed = ui(`<div out="channel"></div>`)
  .does({
    "channel!": (self, data) => {
      const next = data.name
      const state = self._sub || (self._sub = { name: null, off: null })
      if (state.name !== next) {
        state.off?.()
        state.name = next
        state.off = next ? subscribeToChannel(next) : null
      }
      return undefined
    },
    channel: (self, { channel }) => channel,
  })
  .cleanup((self) => {
    self._sub?.off?.()
  })
```

For local reactive subscriptions, prefer `instance.effect(...)`:

```javascript
const Counter = ui(`<p out="count"></p>`)
  .does({
    init: (self, data) => {
      self.effect(() =>
        data.count.effect(() => {
          self.render()
        }),
      )
    },
    count: (self, { count }) => count?.value ?? count ?? 0,
  })
```

You can also compose multiple reactive inputs with Cells helper:

```javascript
import { effect } from "@./cells.js"

self.effect(() =>
  effect({ count: data.count, filter: data.filter }, ({ count, filter }) => {
    self.render({ count: count?.value ?? count, filter: filter?.value ?? filter })
  }),
)
```
