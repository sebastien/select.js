---
name: select-ui
description: Use when building or modifying UI with select/ui.js, including template bindings, component behavior, cells-based reactive state, derived/deferred state, and browser-backed state from select/browser.js.
---

# Select UI

Use this skill when the task touches `select/ui.js`, `select/cells.js`, or
`select/browser.js`.

Prefer working from existing patterns in the repo before introducing new ones.
This library is direct, DOM-oriented, and performance-sensitive.

## When To Use

Use this skill for:

- Creating or editing components built with `ui(...)`
- Wiring templates with `out`, `in`, `inout`, `on:<event>`, `when`, `ref`, or `slot`
- Adding reactive state with `cell(...)`, `derived(...)`, `deferred(...)`, or `effect(...)`
- Connecting UI state to URL or `localStorage` with `browser()`
- Building or updating Select UI web components with `webcomponent(...)`

## Workflow

1. Inspect the existing template and behavior shape first.
2. Keep rendering in `select/ui.js` templates and behavior maps.
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
import ui from "@./ui.js"

const Counter = ui("#Counter")
	.init(() => ({ count: 0 }))
	.does({
		count: (_self, { count }) => count ?? 0,
		inc: (self, { count }) => self.update({ count: (count ?? 0) + 1 }),
	})
```

Use:

- `ui(selection, scope?)` for HTML strings, `<template>` nodes, selectors, or
  loaded external templates
- `ui.component(name)` when behavior and template binding should be separated
- `Component.ChildName` when a parent template defines nested named templates
- `ui.load(url)` before using external template refs like `"./file.html#Card"`

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
import ui from "@./ui.js"
import { cell, derived } from "@./cells.js"

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
import ui from "@./ui.js"
import { browser } from "@./browser.js"

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

```javascript
import ui, { webcomponent } from "@./ui.js"

const Badge = ui(`<span out="label"></span>`).does({
	label: (_self, { label }) => label ?? "Badge",
})

webcomponent("x-badge", Badge, { label: "Ready" })
```

Prefer plain Select UI components unless custom-element interop is required.

## Source Map

Read these files when you need exact behavior or edge cases:

- `docs/ui.md`
- `docs/ref-ui.md`
- `docs/cells.md`
- `docs/ref-cells.md`
- `src/js/select/browser.js`

Read examples when you need repo-native patterns:

- `examples/feature-context.html`
- `examples/feature-events.html`
- `examples/feature-webcomponent.html`
- `examples/app-colorpicker.html`

## Working Rules

- Preserve the existing `ui(...).init(...).does(...)` style unless the local
  code clearly uses another supported pattern
- Prefer explicit `for` loops and direct updates in performance-sensitive code
- Do not introduce framework concepts such as virtual DOM layers, hooks, or
  store abstractions that fight the existing API
- Keep examples and generated code ESM-native and browser-native
- If exact serializer, event, or lifecycle behavior matters, verify it in the
  source instead of guessing
