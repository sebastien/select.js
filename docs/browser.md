# Select Browser

Browser-backed reactive state for URL and `localStorage`.

`browser(options?)` returns:

- `path`: reactive string bound to `location.pathname`
- `query`: reactive record bound to `location.search`
- `hash`: reactive record bound to `location.hash`
- `local(key, dflt, normalizerOrSerializer?, opts?)`: `localStorage`-backed cell

## Quick Start

```javascript
import browser from "@./browser.js"

const state = browser()

state.path.set("/docs")
state.query.set({ page: 2, filter: "active" })
state.hash.set({ section: "api" })

const prefs = state.local("prefs", { theme: "light" })
prefs.select("theme").set("dark")
```

## Serializer Exports

`@./browser.js` also exports reusable serializers:

- `record`: `{ parse, format }` sanitizer for plain records
- `query`: `{ parse, format }` serializer for `location.search`
- `hash`: `{ parse, format }` serializer for `location.hash`

These can be passed anywhere the code accepts a serializer object.

## Default Encoding

- `path` uses browser path encoding
- `query` and `hash` use the Select hashformat syntax by default
- `local` defaults to JSON

## Query and Hash Format

By default, `query` and `hash` both use the same hashformat payload syntax:

- lists: `1,2,3`
- objects: `a=1,b=2`
- nested values: `a=(1,2),b=(x=1,y=2)`

Notes:

- query strings may start with `?`
- hash fragments may start with `#`
- query parsing ignores any trailing `#fragment`
- legacy `a=1&b=2` query syntax is not supported by default

## Error Handling

- invalid values are sanitized before they are written
- unsafe keys such as `__proto__`, `prototype`, and `constructor` are pruned
- control characters are removed from serialized text

## Non-Browser Environments

When no `window` is available, `browser()` still returns the same interface,
but it behaves as inert in-memory state.

