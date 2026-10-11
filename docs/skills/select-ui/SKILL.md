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

Rendering a list of items means declaring a nested template and writing a
behaviour for it. Never build DOM inside a behaviour map.

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
ItemList.Item.does({
  label: (_self, { label }) => label,
})
ItemList.does({
  items: (_self, { items }) => items,
})
```

Prefer `out="items|*Item"` (a `*` per item, without `*` the processor receives
the whole collection) or, when a behaviour must shape the rows,
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

// Right
status: (_self, { count }) => `${count} items`,
```

Route DOM node access through `ref` when a node is genuinely needed, and keep
imperative code inside `effect(...)`/`cleanup(...)`, registered on the instance
that owns the node.

## Workflow

1. Inspect the existing template and behavior shape first.
2. Keep rendering in `select/ui` templates and behavior maps.
3. Keep mutable state in `cell(...)` when the UI must react to it.
4. Use `derived(...)` for computed state instead of hand-synchronizing values.
5. Use `browser()` only for browser resources: `path`, `query`, `hash`, and
   `local(...)`.
6. Prefer extending existing components and examples over inventing new
   abstractions.

## Core Patterns

### Components

Prefer this shape:

```javascript
import ui from "@select/ui"

const Counter = ui("#Counter")
	.init(() => ({ count: 0 }))
	.does({
		count: (_self, { count }) => count ?? 0,
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

Keep handlers small and deterministic. Return derived values from handlers
instead of mutating DOM manually when a binding can express the same thing.

### Cells

Use cells for reactive state inside `.init(...)` or shared module state.

```javascript
import ui from "@select/ui"
import { cell, derived } from "@select/state/cells.js"

const Counter = ui("#Counter").init(() => {
	const count = cell(0)
	const label = derived([count], (n) => `Count: ${n}`)
	return { count, label }
}).does({
	count: (_self, { label }) => label.value,
	inc: (_self, { count }) => count.set(count.value + 1),
})
```

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

```javascript
import ui from "@select/ui"
import { browser } from "@select/state/browser.js"

const state = browser()
const App = ui("#App").does({
	sidebar: (_self) => state.query.select("sidebar").value ?? "closed",
	openSidebar: () => state.query.select("sidebar").set("open"),
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

```javascript
import ui, { webcomponent } from "@select/ui"

const Badge = ui(`<span out="label"></span>`).does({
	label: (_self, { label }) => label ?? "Badge",
})

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
- Prefer explicit `for` loops and direct updates in performance-sensitive code
- Do not introduce framework concepts such as virtual DOM layers, hooks, or
  store abstractions that fight the existing API
- Keep examples and generated code ESM-native and browser-native
- If exact serializer, event, or lifecycle behavior matters, verify it in the
  source instead of guessing
