# Select Browser

Browser-backed reactive state for URL and `localStorage`.

`browser(options?)` returns:

- `path`: reactive string bound to `location.pathname`
- `query`: reactive record bound to `location.search`
- `hash`: reactive record bound to `location.hash`
- `local(key, dflt, normalizerOrSerializer?, opts?)`: `localStorage`-backed cell
- `internal(name, value)`: in-memory shared cell registry for cross-component state
- `parse(value)`: resolves `@internal.path` references or hashformat text
- `fetch(input, options?)`: fetch helper with typed response parsing

`@./browser.js` also exports `Browser`, the class used by `browser(options?)`.

## Quick Start

```javascript
import browser from "@./browser.js"

const state = browser()

state.path.set("/docs")
state.query.set({ page: 2, filter: "active" })
state.hash.set({ section: "api" })

const prefs = state.local("prefs", { theme: "light" })
prefs.select("theme").set("dark")

const modal = state.internal("modal.open", false)
modal.set(true)

const current = state.parse("@modal.open")
const result = await state.fetch("POST:/api/items#label=Draft,done=F")
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

## `parse(value)`

- `@name` resolves to `internal("name")`
- `@name.path.to.value` resolves to `internal("name").select("path.to.value")`
- text containing hashformat structure such as `=`, `,`, `(`, `)`, or a leading `#`
  is parsed with the default hash parser
- plain text such as `hello` or `42` is returned unchanged

## `fetch(input, options?)`

When `input` matches `METHOD:PATH?QUERY#DATA`:

- `METHOD` becomes the fetch method
- `PATH?QUERY` becomes the request URL
- `DATA` is parsed as hashformat and JSON-encoded into the request body
- `content-type: application/json` is added when a body is generated and no
  content type is already set

Responses are normalized by content type:

- JSON content types return parsed JSON
- text-like content types return `text()`
- everything else returns a `Blob`

## Non-Browser Environments

When no `window` is available, `browser()` still returns the same interface,
but it behaves as inert in-memory state.
