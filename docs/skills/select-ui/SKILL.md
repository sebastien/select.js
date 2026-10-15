---
name: select-ui
description: Use when building or modifying UI with select/ui, including template bindings, component behavior, where markup lives (templates, fragments, ui.fromHTML), sub-template composition, cells-based reactive state, derived/deferred state, and browser-backed state from select/state/browser.js.
---

# Select UI

Use this skill when the task touches `select/ui`,
`select/state/cells.js`, or `select/state/browser.js`.

Prefer working from existing patterns in the repo before introducing new ones.
This library is direct, DOM-oriented, and performance-sensitive.

## When To Use

Use this skill for:

- Creating or editing components built with `ui(...)`
- Wiring templates with `out`, `in`, `inout`, `on:<event>`, `when`, `ref`, or `slot`
- Adding reactive state with `cell(...)`, `derived(...)`, `deferred(...)`, or `effect(...)`
- Connecting UI state to URL or `localStorage` with `browser()`
- Building or updating Select UI web components with `webcomponent(...)`

## Structure Rules

These are not preferences. They are how Select UI components are written.

### Rule 1: markup never lives in the `ui(...)` call

A component's markup is a `<template>` (or a loaded fragment), never a string
passed to `ui(...)`. JavaScript holds the behaviour, HTML holds the structure.

Never:

```javascript
const ItemList = ui(`
  <ul>
    <li out="label"></li>
  </ul>
`).does({
  label: (_self, { label }) => label,
})
```

Always, in this order:

1. `<template id="ItemList">` in the page, then `ui("#ItemList")` — single-file
   apps, and what most examples in this repo do
2. `await ui.load("./components/ItemList.html")` then
   `ui("./components/ItemList.html#ItemList")` — multi-file apps
3. `ui.fromHTML(html, "ItemList")` — when markup must live in the JS module; it
   keeps the component name and isolates nested template names
4. a bare `ui("<div out=\"x\"></div>")` — only for tiny unnamed fragments such as
   a single-element wrapper, never for a named component

Two concrete reasons, beyond readability. Inside a JavaScript template literal
`${...}` is interpolation, so `out:style="width:${width}px"` either throws or is
silently replaced by a JavaScript value. And a string starting with `<` is
registered in the current document template scope together with every nested
`<template name="…">` it declares, so two components that share a nested name
collide and only the first registration wins.

### Rule 2: sub-templates are nested templates, never DOM built in the behaviour

Rendering a list of items means declaring a nested template and binding the
collection to it. Add behaviour only when the items need actions or business
logic. Never build DOM inside a behaviour map.

Never:

```javascript
.does({
  items: (_self, { items }) => {
    const nodes = []
    for (const item of items) {
      const li = document.createElement("li")
      li.textContent = item.label
      nodes.push(li)
    }
    return nodes
  },
})
```

No `createElement`, `appendChild`, `replaceChildren`, or `innerHTML` inside
`.does(...)`, `.init(...)`, or an event handler.

Always:

```html
<template id="ItemList">
  <ul out="items|*Item"></ul>
  <template name="Item">
    <li out="label"></li>
  </template>
</template>
```

```javascript
const ItemList = ui("#ItemList")
```

No pass-through `items` or `label` handlers are needed. Use
`out="value.path|Component"` for one value and
`out="value.path|*Component"` for a collection. A `*` applies the processor per
item; without `*`, it receives the whole value. Nested templates resolve
locally first; register external components with
`ui.format("Component", Component)`.

Only when a behaviour must shape the rows, use
`items.map((item, index) => Item({ ...item, $key: index }))`
(`Component.map(data, processor?, key?)` is the documented approach for dynamic
lists and keeps DOM identity across updates).

Legitimate exceptions, where DOM really is the payload:

- nodes returned by a DOM-native API: `icon(name, source)` SVG nodes, canvas,
  third-party widgets
- `webcomponent(name, renderFn)` pure render functions
- content projection through `data.slots`

### Rule 3: behaviours never mutate the DOM imperatively

Handlers write state; slots render it.

```javascript
// Wrong — the DOM is now out of sync with the component
status: (_self, data) => {
  document.querySelector("#status").textContent = `${data.count} items`
},
```

```html
<!-- Right — the view reads and formats the state -->
<p><span out="count"></span> items</p>
```

Route DOM node access through `ref` when a node is genuinely needed, and keep
imperative code inside `effect(...)`/`cleanup(...)`, registered on the instance
that owns the node.

### Rule 4: data selection and formatting belong in the view

Do not add behaviour handlers merely to destructure data, return a property,
unwrap a cell, format a label, or apply a component. Use `out` paths and
formatter pipelines instead:

```html
<span out="value.path"></span>
<span out="count|count"></span>
<div out="value.path|Component"></div>
<ul out="value.path|*Component"></ul>
```

Here `count|count` uses the built-in collection-count formatter: it renders
the collection's size, or an empty string when empty. It is not a numeric
`count ?? 0` fallback. For a numeric counter initialized to `0`, use
`out="count"` directly.

Use existing formatters first. Complex formatting rules worth sharing belong
in a named formatter registered with `ui.format("formatName", formatter)` and
used as `out="value.path|formatName"`, not duplicated across behaviour maps.
Reserve behaviour for actions, state transitions, business logic, and genuinely
complex shared computations that cannot be expressed by bindings and formatters.
Destructuring data in an action handler is fine; pass-through rendering handlers
are not.

## Workflow

1. Inspect the existing template and behavior shape first.
2. Keep data selection, formatting, and component mapping in template bindings;
   use behavior maps for actions and business logic.
3. Keep mutable state in `cell(...)` when the UI must react to it.
4. Use `derived(...)` for computed state instead of hand-synchronizing values.
5. Use `browser()` only for browser resources: `path`, `query`, `hash`, and
   `local(...)`.
6. Prefer extending existing components and examples over inventing new
   abstractions.

## Core Patterns

### Components

Prefer this shape:

```html
<template id="Counter">
  <span out="count"></span>
  <button type="button" on:click="inc">Increment</button>
</template>
```

```javascript
import ui from "@select/ui"

const Counter = ui("#Counter")
	.init(() => ({ count: 0 }))
	.does({
		inc: (self, { count }) => self.update({ count: (count ?? 0) + 1 }),
	})
```

Use:

- `ui("#Name")` for a `<template id="Name">` in the page, or the scope argument
  for a detached scope
- `ui("./file.html#Name")` after `await ui.load("./file.html")` for external
  fragments
- `ui.fromHTML(html, name)` for markup embedded in a JavaScript module
- `ui("<div>…</div>")` only for tiny unnamed fragments
- `ui.component(name)` when behavior and template binding should be separated
- `Component.ChildName` when the component template declares a nested
  `<template name="ChildName">`, which is how sub-templates are composed
- `.using(templateRef)` to rebind the same behavior to another template

Prefer `<template>` elements and fragments over HTML strings. An HTML string
starting with `<` is still registered in the document template scope, including
any nested `<template name="…">` it declares, so two components sharing a nested
name collide. See `docs/ui.md` for the rationale behind this rule.

Avoid framework-style indirection. Select UI expects direct template bindings
and explicit behavior handlers.

### Template Bindings

Prefer these bindings:

- `out` for text, nodes, or nested applied templates
- `out:<attr>` for attributes
- `in` for input capture
- `inout` for two-way binding
- `on:<event>` for DOM event handlers
- `when` for conditional rendering
- `ref` for node references
- `slot` for content projection

Bind data paths directly, including nested paths and cells. Use `|formatter`
for presentation, `|Component` for a child, and `|*Component` for a collection.
Do not introduce a handler when a binding can express the same thing. Keep
necessary handlers small and deterministic, and never mutate DOM manually.

### Cells

Use cells for reactive state inside `.init(...)` or shared module state.

```html
<template id="Counter">
  <span out="count"></span>
  <span out="doubledCount"></span>
  <button type="button" on:click="inc">Increment</button>
</template>
```

```javascript
import ui from "@select/ui"
import { cell, derived } from "@select/state/cells.js"

const Counter = ui("#Counter").init(() => {
	const count = cell(0)
	const doubledCount = derived([count], (n) => n * 2)
	return { count, doubledCount }
}).does({
	inc: (_self, { count }) => count.set(count.value + 1),
})
```

Bindings read reactive values directly; do not add handlers just to return
`.value`. Use `derived(...)` for computed state, not simple display formatting.

Prefer:

- `cell(value)` for mutable root state
- `state.select(path)` for focused nested state
- `derived(template, processor, initial?, strategy?)` for computed state
- `deferred(value, delay)` for debounced input/query state
- `effect(inputs, effector)` for reactive side effects

Notes:

- Cells are explicit pub/sub primitives, not hidden schedulers.
- Prefer selections and derived values over manual synchronization.
- Dispose lifecycle-aware reactives when they outlive a component instance.

### Browser State

Use `browser()` for browser-backed reactive state:

```html
<template id="App">
  <aside when="sidebar==open">Sidebar</aside>
  <button type="button" on:click="openSidebar">Open sidebar</button>
</template>
```

```javascript
import ui from "@select/ui"
import { browser } from "@select/state/browser.js"

const state = browser()
const App = ui("#App")
	.init(() => ({ sidebar: state.query.select("sidebar") }))
	.does({
		openSidebar: (_self, { sidebar }) => sidebar.set("open"),
	})

const prefs = state.local("prefs", { theme: "light" })
prefs.select("theme").set("dark")
```

`browser()` returns:

- `path`: pathname-backed cell
- `query`: search-backed cell
- `hash`: hash-backed cell
- `local(key, dflt, normalizerOrSerializer?, opts?)`: `localStorage`-backed cell
- `internal(name, value)`: in-memory shared cell for cross-component state

Important:

- Default `query` and `hash` parsing uses the project hashformat-style syntax,
  not standard `URLSearchParams`
- `query.select(...)` and `hash.select(...)` are the preferred way to update
  partial URL state
- `local(...)` is appropriate for persisted preferences and similar client state
- `browser()` has non-browser fallback behavior; avoid assuming `window` always
  exists

### Web Components

Use `webcomponent(...)` when the task explicitly needs a native custom element.
Wrapped Select UI custom elements can reconnect `pub()` bubbling to a mounted
Select parent through the special `ui-parent` host attribute. When a Select
template renders a kebab-case custom element such as `<x-counter>`, Select
injects `ui-parent` automatically unless it is already set explicitly. When a
wrapped custom element is mounted outside a Select template tree, set
`ui-parent` manually to the parent instance id.

```html
<template id="Badge">
  <span out="label"></span>
</template>
```

```javascript
import ui, { webcomponent } from "@select/ui"

const Badge = ui("#Badge")

webcomponent("x-badge", Badge, { label: "Ready" })
```

```html
<x-stepper ui-parent="ui-12" count="2"></x-stepper>
```

Prefer plain Select UI components unless custom-element interop is required.

## Source Map

Read these files when you need exact behavior or edge cases:

- `docs/ui.md` — see `Component structure and anti-patterns` for the markup
  placement rules and sub-template composition
- `docs/ref-ui.md`
- `docs/cells.md`
- `docs/ref-cells.md`
- `src/js/select/features/formats.js` — built-in formatters and their semantics
- `src/js/select/ui/eval.js` — data paths and formatter/component pipelines
- `src/js/select/state/browser.js`

Read examples when you need repo-native patterns:

- `examples/feature-nested-templates.html` — nested templates, keyed lists, and
  `*Item` processors
- `examples/app-filter.html` — a filtered list composed from a sub-template
- `examples/feature-context.html`
- `examples/feature-events.html`
- `examples/feature-webcomponent.html`
- `examples/app-colorpicker.html`

## Working Rules

- Preserve the existing `ui(...).init(...).does(...)` style unless the local
  code clearly uses another supported pattern
- Markup in templates, sub-templates nested, state through cells
- Data paths, formatting, and component mapping in `out` bindings; no
  pass-through rendering handlers
- Prefer explicit `for` loops and direct updates in performance-sensitive code
- Do not introduce framework concepts such as virtual DOM layers, hooks, or
  store abstractions that fight the existing API
- Keep examples and generated code ESM-native and browser-native
- If exact serializer, event, or lifecycle behavior matters, verify it in the
  source instead of guessing
