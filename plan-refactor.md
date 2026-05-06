# Refactor Plan: Hard Cutover to `src/js/select/*`

## Goals

- Move from flat `src/js/select.*.js` modules to decomposed `src/js/select/*.js` modules.
- Keep strict module boundaries and independent loading.
- Replace legacy aggregate `select.all` with `select/index.js`.
- Perform hard cutover (no compatibility shims).
- Remove repository reliance on checked-in `dist/` artifacts and document jsDelivr usage.

## Target Layout

```text
src/js/select/
  index.js
  query.js
  cells.js
  ui.js
  fastdom.js
  icons.js
  routing.js
  browser.js
  utils.js
```

## Current Source Files

- `src/js/select.js`
- `src/js/select.cells.js`
- `src/js/select.ui.js`
- `src/js/select.extra.js`
- `src/js/select.fastdom.js`
- `src/js/select.icons.js`
- `src/js/select.all.js`

## Current Public Symbols

### `src/js/select.js`

- Named exports: `$`, `filter`, `match`, `query`, `S`, `Selection`, `select`
- Default export: `select`

### `src/js/select.cells.js`

- Named exports: `access`, `assign`, `browser`, `Cell`, `cell`, `selected`, `Deferred`, `Derivation`, `deferred`, `derived`, `expand`, `Reactive`, `Selected`, `walk`
- Default export: `Object.assign(cell, { browser, deferred, derived, selected, walk, expand })`

### `src/js/select.ui.js`

- Named exports: `Adopted`, `AppliedUITemplate`, `Disconnect`, `Dynamic`, `lazy`, `len`, `remap`, `type`, `UIAttributeSlot`, `UIAttributeTemplateSlot`, `UIContentSlot`, `UIEvent`, `UIEventSlot`, `UIEventTemplateSlot`, `UIInstance`, `UISlot`, `UITemplate`, `UITemplateSlot`, `UIWebComponent`, `ui`, `webcomponent`
- Default export: `ui`

### `src/js/select.extra.js`

- Named exports: `Keyboard`, `Router`, `add`, `autoresize`, `bind`, `bool`, `clsx`, `cmp`, `drag`, `dragtarget`, `extractor`, `filter`, `find`, `has`, `iclsx`, `itemkey`, `iwalk`, `list`, `next`, `predicate`, `remove`, `route`, `routed`, `router`, `shortdict`, `shortword`, `sorted`, `target`, `toggle`, `unbind`, `unique`, `unshortword`
- Default export: frozen `extra` object

### `src/js/select.fastdom.js`

- Named exports: `FastDOM`, `fastdom`, `raf`
- Default export: `fastdom`

### `src/js/select.icons.js`

- Named exports: `icon`, `install`, `load`, `Cache`, `IconContainer`, `IconSources`
- Default export: `Object.assign(icon, ...)`

### `src/js/select.all.js`

- Re-exports all major modules
- Named aggregate exports: `{ select, cells, extra, fastdom, icons, ui }`

## Decomposition Boundaries

### `select/query.js`

- Owns DOM query and selection API.
- Symbols: `$`, `S`, `Selection`, `select`, `query`, `match`, `filter`.

### `select/cells.js`

- Owns core reactive primitives.
- Symbols: `Cell`, `cell`, `Derivation`, `derived`, `Deferred`, `deferred`, `Selected`, `selected`, `Reactive`, `walk`, `expand`, state write/read helpers as needed.
- Browser-specific logic moved out to `select/browser.js`.

### `select/routing.js`

- Owns route tokenization and handler dispatch.
- Symbols: `RoutePattern`, `RoutePatternSlot`, `RouteHandler`, `Router`, `splitPath`, `route`, `router`, `routed`.

### `select/browser.js`

- Owns browser-backed state and URL/hash/query/path/local-storage serialization.
- Symbols: `browser`, hash formatter/parser helpers, path/query/hash sanitizers, URL formatter.

### `select/utils.js`

- Owns shared non-DOM utilities reused by multiple modules.

Planned shared utilities:

- `isObject(value)`
- `access(context, path, offset = 0)`
- `path(path, nothing = undefined)`
- `eq(a, b, limit = undefined)` (with `limit=1` for shallow equality)
- `list(value)`
- `index(items, item, keyFn = undefined)`
- `has(items, item, keyFn = undefined)`
- `add(items, item, keyFn = undefined)`
- `remove(items, item, keyFn = undefined)`
- `toggle(items, item, keyFn = undefined)`
- `wrapindex(itemsOrLength, index, delta = 1)`
- `rescape(value)`

Utilities explicitly not moved to `utils.js`:

- DOM query/match behavior
- routing-specific parsing and classes
- browser hash/query/path serializers and sanitizers
- UI template syntax parsers

### `select/ui.js`, `select/fastdom.js`, `select/icons.js`

- Keep module ownership clear and standalone.
- Import from `select/utils.js` only when generic helpers are truly shared.

### `select/index.js`

- Replaces `select.all.js` as aggregate entry.
- Re-exports all module public APIs while preserving independent direct imports.

## Old -> New Entry Mapping

- `src/js/select.js` -> `src/js/select/query.js`
- `src/js/select.cells.js` -> `src/js/select/cells.js`
- `src/js/select.ui.js` -> `src/js/select/ui.js`
- `src/js/select.fastdom.js` -> `src/js/select/fastdom.js`
- `src/js/select.icons.js` -> `src/js/select/icons.js`
- `src/js/select.extra.js` -> split across `src/js/select/routing.js` + `src/js/select/utils.js` + retained extra helpers in appropriate modules
- `src/js/select.all.js` -> `src/js/select/index.js`

## Hard Cutover Removal List

Remove after migration:

- `src/js/select.js`
- `src/js/select.cells.js`
- `src/js/select.ui.js`
- `src/js/select.extra.js`
- `src/js/select.fastdom.js`
- `src/js/select.icons.js`
- `src/js/select.all.js`

## Investigation Notes

- object and equality helpers are currently duplicated between cells/ui.
- list/collection helpers are concentrated in `select.extra.js` and are good `utils.js` candidates.
- `select.extra.js` currently uses `get(v, pathOrFunc)` in `extractor(...)` but no local `get` symbol is defined; refactor should replace this with `access(...)` from `utils.js`.
- hash format/parse functions are currently in `select.cells.js` and should move to `select/browser.js`.

## Dist/CDN Plan

- Stop treating checked-in `dist/` as part of repository source surface.
- Update build/CI rules that currently enforce dist idempotence.
- Update docs/examples to include jsDelivr GitHub-backed URLs for release consumption.
- Keep local development examples using local source import maps where useful.

## Docs and Examples Migration

Update references in:

- `README.md`
- `docs/*.md`
- `examples/*.html`

Path updates include:

- `@./select.js` -> `@./select/query.js`
- `@./select.all.js` -> `@./select/index.js`
- routing imports from `select.extra.js` -> `select/routing.js`
- browser imports from `select.cells.js` -> `select/browser.js` (or re-export policy if retained)

## Execution Phases

1. Create `src/js/select/*.js` files and wire imports/exports.
2. Move query core from `select.js` to `select/query.js`.
3. Split browser logic from cells into `select/browser.js`.
4. Split routing logic from extra into `select/routing.js`.
5. Introduce `select/utils.js` and migrate shared helpers.
6. Rebuild `select/cells.js` and `select/ui.js` against new boundaries.
7. Create `select/index.js` aggregate entry.
8. Remove old flat entry files (hard cutover).
9. Update docs/examples and build config for new layout and CDN guidance.
10. Run checks and benchmark verification.

## Validation Checklist

- `make fmt`
- `make check`
- `make dist` (if retained for packaging workflow)
- `bun run bench:inspector`
- Manual browser smoke tests for examples

## Risks and Mitigations

- Import breakage from hard cutover -> perform path rewrite and import audit.
- Utility semantic drift (`eq` limit semantics) -> keep one `eq(a,b,limit)` contract and migrate callsites carefully.
- Boundary leakage between cells/browser -> keep browser ownership in `select/browser.js`.
- Docs drift -> update snippets in same change-set as code moves.
