# Browser Cells State Interface

We want to create new cells that map to key browser resources, and remove
emove from `select.extra` the `URLHistory` and related serializers that will then
become redundant.

## Proposed API

In `select.cells`:

```js
const { path, query, hash, local } = browser(options)
```

`browser(options)` returns:

- `path`: cell of `string`, mapped to `location.pathname`
- `query`: cell of dictionary, mapped to `location.search`
- `hash`: cell of dictionary, mapped to `location.hash`
- `local(key, dflt, opts?)`: function returning a cell backed by `localStorage`

## Defaults and Types

- `path`
  - Type: `Cell<string>`
  - Canonical value includes leading `/`
  - Uses browser URL encoding/decoding behavior

- `query`
  - Type: `Cell<object>`
  - Default mapping: query-string key/value pairs
  - Empty query string maps to `{}`

- `hash`
  - Type: `Cell<object>`
  - Default mapping: hash fragment interpreted as query-string payload
  - `#` maps to `{}`

- `local(key, dflt, opts?)`
  - Type: `Cell<T>`
  - Default mapping: JSON parse/stringify
  - If no stored value exists, initialize from `dflt`

## Serializer Interface

`browser(options)` accepts optional serializers:

- `query.parse(text) -> value`
- `query.format(value) -> text`
- `hash.parse(text) -> value`
- `hash.format(value) -> text`
- `local.parse(text) -> value`
- `local.format(value) -> text`

Serializers must be deterministic and side-effect free.

## Sync Semantics

- Two-way binding:
  - Browser changes update cells
  - Cell writes update browser state

- URL listeners:
  - `popstate` updates `path` and `query`
  - `hashchange` updates `hash`

- Storage listeners:
  - `storage` updates matching `local(key, ...)` cells (cross-tab)

- Same-tab writes:
  - Writes through cells update state immediately without waiting for events

## History Write Policy

- Default URL write mode: `replaceState`
- Optional mode: `pushState`
- Policy should be configurable globally in `browser(options)` and overridable per write if supported by cell operations.

## Loop Prevention

Implement source-tagging or equality checks so that internal writes do not re-emit identical updates back into the same cell graph.

## Subset/Selection Semantics

- Sub-cells/lenses on `query` and `hash` must support partial key updates.
- Partial updates merge object keys by default.
- Setting a key to `undefined` removes that key from URL/storage representation.

## Error Handling

- Parse failures should not crash reactive updates.
- On parse failure:
  - Keep previous valid cell value
  - Emit warning hook/log (implementation-defined)
  - Optionally fall back to default when no previous value exists

## Environment Behavior

- In non-browser environments, `browser()` returns inert in-memory cells with the same interface.
- No-op listeners when `window`, `history`, or `localStorage` are unavailable.

## Migration Scope

- Remove `URLHistory` and legacy serializers from `select.extra state`.
- Add browser-backed state helpers in `select.cells`.
- Keep serializer behavior customizable to preserve current use cases.

## Implementation Plan (Refined)

1. Define internal adapter contracts for URL and storage serializers.
2. Implement `browser(options)` factory returning `{path, query, hash, local}`.
3. Add URL listener wiring (`popstate`, `hashchange`) with loop prevention.
4. Add `localStorage` adapter and `storage` cross-tab sync.
5. Add subset merge/removal semantics for `query` and `hash`.
6. Add non-browser fallback behavior.
7. Migrate existing `URLHistory` consumers to new API.
8. Remove deprecated state helpers once migration is complete.

## Acceptance Criteria

- Mutating `path`, `query`, `hash` cells updates URL consistently.
- Back/forward navigation updates cells consistently.
- Mutating `local(...)` updates storage and syncs across tabs.
- Serializer overrides work for all supported cells.
- No infinite update loops.
- Existing usage can migrate with equivalent behavior.
