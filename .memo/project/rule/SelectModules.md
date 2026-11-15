---
identity: 1e23ec60-ff5d-4444-a1eb-e0fc6caabd09
created: 2026-11-15T04:27:24.020549+00:00
updated: 2026-11-15T04:27:47.830165+00:00
status: active
---

# select.js modules, icons, and SSR guidance

- The `select.js` aggregate and `features` barrels are DOM-free by contract.
  Icons are a separate DOM-requiring feature reachable only through
  `select/features/icons.js` (plus `icons.catalog.js`). Keep barrel additions
  headless, and route icon specifiers to leaf artifacts in dist tests.
- Keep `icons.js` import-safe headlessly: define its `HTMLElement` subclass when
  a DOM becomes available, and define container getters on the exported object
  directly because `Object.assign` evaluates source getters eagerly. Preserve
  eager browser behaviour when a DOM is present.
- Keep SSR at `select/ui/ssr` as a UI leaf, with matching named and default
  exports and `nodes`/`html()` APIs. Keep imports DOM-lazy, require
  selector-capable DOMs, and settle by draining scheduled renders plus tracked
  async work.
- SSR instances share DOM installation leases: retain globals until the last
  instance disposes, reject switching an installed DOM, and release leases on
  construction, render, and serialization failures. Manual uninstall waits for
  live instances.
- SSR settling must drain finite batches and await only live instance-subtree
  work. Route queued and async application errors to their owner, and discard
  budget-exhausted tasks rather than forwarding unbounded loops to the browser
  scheduler.
