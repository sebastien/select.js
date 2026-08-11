# Select.JS UI Rules

A component file is one default export: `ui(...).init().does().on()`, with
a supporting `.html` file using SelectJS's attribute templates. A component's
state is largely defined by cells, which can be bound to parent-fed input cells
and passed down to children.

## Principles

**Locality.** A cell lives in the smallest component that both reads and writes it.
If only one subtree needs it, it is not ancestor state.

**Thin environment.** A parent's `init()` is the child's namespace. Only return
what children actually share — route, session, collections — never dialog flags,
form drafts, or list projections that belong to one screen.

**One owner.** A cell has one writer. Do not fuse a child's `open` with a parent
`fooOpen` unless the parent truly coordinates that dialog.

**Facts go up.** Children `pub` what happened. Ancestors navigate, refresh, or
compose. They do not own the form that produced the fact.

**Reuse test.** If you dropped this component into another shell, the cells you
would take with you belong here. The rest is environment (`path`, user, shared
collections).

## DO

- Define all instance state in `ui(...).init(setup)` and return cells from it
- Use `cell()` for inputs, props, and local UI; `cell.derived(inputs, output)` for anything computed
- Keep a cell in the smallest component that both reads and writes it
- Use `const state = browser()` for shared or persistent cells: `path`, `query`, `hash`, `local`, `internal`
- Put dialog `open`, form drafts, `*Valid`, and list projections on the widget or page that renders them
- Inline behaviours in `ui(...).does(behaviours)`
- Communicate across components with `self.pub(...)` and `ui(...).on(subs)` — publish facts, not requests to mutate ancestor cells
- Derive route or selection from `state.path` (or `routes`); resolve entities locally from `id + query`
- Leverage the Select API (`clsx`, utils, interaction, `format`, …) instead of hand-rolling
- Give a web component a short, explicit prop list; it is a closed API

## DO NOT

- Lift state to a parent because the parent template happens to bind it — move the template, not the cell
- Put `*Open`, drafts, or view-models on a shell or orchestrator
- Share one draft or `open` cell across two unrelated UIs
- Give one cell two meanings
- Litter the module with top-level functions — shared helpers live in a util module or `format()`
- Export more than the default component
- Hand-synchronize values that should be `cell.derived`
- Use `browser().internal` for widget chrome (modals, hover, local query)
- Dump a parent’s cell bag into a web component as many attributes
- Leave a route target as `ui("Name")` with no `.init` if that screen has state

## Shape

```javascript
const Thing = ui("Thing")
	.init(() => {
		const value = cell("")
		const valid = cell.derived([value], ([v]) => Boolean(v.trim()))
		return { value, valid }
	})
	.does({
		submit(self, data) {
			if (!unwrap(data.valid)) return
			self.pub("Submitted", { value: unwrap(data.value) })
		},
	})
	.on({
		ChildPicked(_self, _data, event) { /* … */ },
	})

export default Thing
```
