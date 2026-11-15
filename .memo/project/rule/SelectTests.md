---
identity: 3d36697f-1a5c-496e-91d5-2ed30e5f929e
created: 2026-11-15T04:27:24.626125+00:00
updated: 2026-11-15T04:27:51.255380+00:00
status: active
---

# select.js test guidance

- Reset process-wide module caches in `afterAll` when a test mocks `fetch`
  against a module singleton. `icons-load` clears the `icons.js` `Cache` and
  `IconContainer`, keeping `app-icons` order-independent in the full bun suite.
- When a test must match browser `classList` whitespace rejection, patch the
  happy-dom `DOMTokenList` (shared across `Window` instances) and restore it in
  `afterEach`. Call the handler outside the listener because `dispatchEvent`
  swallows throws.
- `tests/icons-load.test.js` "loads Grommet icons" can fail on a clean tree
  because of a cached symbol from another test; verify against a clean checkout
  before blaming local changes.
