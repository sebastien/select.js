# Plan 009 — Cells-first UI (store bindings + reconcile)

Status: Phase 0–5 done · Phase 6 optional harden  
Created: 2026-07-22

## Goal

Make **cells the authoritative store**, with UI components as **reactive bindings** on paths. Preserve plain bag-mode `set`/`update` for simple widgets.

## Principles

1. **One state substrate** — `Cell` / `Selected` / `derived` (no parallel Redux store).
2. **Two modes coexist** — bag mode (instance-owned plain data) + store mode (bind to cells/paths).
3. **Reconcile patches live cells** — full JSON clones become path notifications, not full remounts.
4. **Lists bind to store identity** — row instances subscribe to paths/keys, not fresh plain bags every render.
5. **Measure** — inspector bench + verification green; add-remove toward Solid (~150–200ms).

## Modes

| Mode | State lives in | Updates | Typical use |
|------|----------------|---------|-------------|
| **Bag** | `UIInstance.data` plain objects | `set` / `update` | Local widgets, small trees |
| **Store** | Root `cell` / `cells({…})` / `Selected` | `cell.set(v, path)`, `reconcile(next)` | Apps, large trees, bench |

Bag mode remains the default DX. Store mode is opt-in via passing cells into `set`/`init` and mutating the cell graph.

## Ownership

- **Cell graph** owns truth and revisions.
- **UIInstance** owns DOM nodes, slot mappings, and subscriptions (acquire/release).
- **Behaviors** should shrink toward events + light projection; heavy list remap is a list-binder concern (Phase 4).

## List identity

1. **Stable entity key** (`id` / `$key` / key fn) when present — preferred for moves.
2. **Index identity** when no key — append/tail/shift fast paths (already in slots).
3. After `structuredClone`, entity keys in data survive; object identity does not — reconcile + keyed lists matter.

## Lifecycle

- `Selected` views used by UI must `acquire` on bind and `release` on unmount.
- No leaked path subscriptions after `instance.unmount()`.

## Non-goals (v1)

- Mandatory global singleton of all component state
- Removing bag-mode `update(plain)`
- Replacing `pub` tree events with store-only messaging
- CRDT / multi-tab sync beyond existing `browser`

---

## Phases

### Phase 0 — Spec (this document)

Exit: agreed principles and phase split.

### Phase 1 — `reconcile` on cells

**API**

```js
cell.reconcile(nextValue, options?)
selected.reconcile(nextValue, options?)
// options: { key?: string | false | ((item, index) => any) }
// default key: "id" (used only when items are objects with that field)
```

**Semantics**

- Diff `next` vs current value; write through existing `set(value, path)`.
- Wrap walk in `batch()` so subscribers flush once.
- Plain objects: recurse keys; missing keys → `set(undefined, path)`.
- Arrays (same length): recurse by index.
- Arrays (length change) or type change: replace node at that path via `set(next, path)`.
- `Object.is` equal → skip; non-wrappable (primitives, Date, Map, reactives) → replace if not `Object.is`.

**Files:** `src/js/select/cells.js`, `tests/cells-reconcile.test.js`, `docs/ref-cells.md`

### Phase 2 — Inspector store-mode adapter

- Root `cell(initial)`; `update` → `state.reconcile(next)`.
- Prove bench win; verification must stay green.

### Phase 3 — Path-aware UI subscriptions

- Deep/path deps from bindings + behavior tracking.
- Granular `_scheduleRender` from path notifications.
- Sub leak tests on unmount.

### Phase 4 — Store-backed list binder

- Collection bind without per-render full `remap` alloc.
- Reuse Phase list shift opts with `Selected` row payloads.

### Phase 5 — App store sugar + docs

- Thin `store({…})` / provide helper over `cells` + `reconcile`.
- Document bag vs store modes.

### Phase 6 — Harden + bench gate

| Metric | Target |
|--------|--------|
| add-remove (store-mode) | ≤ ~200ms (stretch ≤ 160ms) |
| content | ≤ solid × 1.5 |
| verification | 0 mismatches |
| bag-mode | no regression |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Coarse notifications | Path-accurate `set`; batch |
| N intermediate renders | `batch()` around reconcile |
| Bag mode breakage | Additive APIs only |
| Sub leaks | acquire/release + tests |

---

## Implementation log

- 2026-07-22: Phase 0 written (`plans/009-cells-first-ui.md`).
- 2026-07-22: Phase 1 — `reconcile` on `Cell`/`Selected`, export, tests (`tests/cells-reconcile.test.js`), docs (`docs/ref-cells.md`).
- 2026-07-22: Phase 2 — inspector `selectui.js` uses root `cell` + `reconcile`; behaviors unwrap via `plain()`.
  - Reconcile: object key **delete** (not undefined); array **append** keeps element identity.
  - Bench (verification OK): add-remove ~360ms (was ~686ms correct bag baseline / ~302ms list-opts bag);
    content ~67ms. Solid add-remove ~150ms. Phase 3+ needed for path-granular UI skip.
- 2026-07-22: Phase 3 — path-directed UI updates from cell notifications.
  - `syncReactiveDataSubs` walks mounted `items`/`value` slots along notify path before full render.
  - Tests: `tests/ui-reactive-path.test.js`.
  - Quiet select-only: content ~56ms, type ~192ms, add-remove ~331ms; verification OK.
  - Remaining misses: new array index mount (`logs.N` append) falls back to full list render.
- 2026-07-22: Phase 4 — store-backed collection path updates.
  - `_refreshCollectionSlot(slot, treeAtSlot)` re-runs items behavior with **fresh store value**
    (fixes stale `parent.data`) and relies on list append/shift fast-paths.
  - Missing mapping key/index (append, dict add/remove) → collection refresh.
  - Same-shape array/dict replace at a path → nested items refresh (not type changes).
  - Tests: append without sibling re-render; dict key remove.
  - Verification green vs preact.
- 2026-07-22: Phase 5 — store sugar + docs.
  - `cell.store` / named `cellStore` in `cells.js` (not KV `utils/storage` `store`).
  - Docs: bag vs store in `ref-ui.md`, `ref-cells.md`, `cells.md`.
  - Example: `examples/feature-store.html`.
  - Inspector bench uses `cell.store`.
- 2026-07-22: Root store as `instance.data`.
  - `set(store)` when `store.isReactive` — data is the cell; render unwraps for behaviors.
  - `update(plainTree)` → `data.reconcile(plainTree)`; `update(otherCell)` rebinds.
  - Path-directed subs use `ROOT_STORE_KEY`; inspector `set(state)` + `instance.update(next)`.
  - Tests: `tests/ui-root-store.test.js`.
