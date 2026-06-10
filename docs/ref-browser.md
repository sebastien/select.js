# Select Browser Reference

`@./browser.js` provides browser-backed reactive state for URL and
`localStorage`.

## API

### `browser(options?)`

Returns:

- `path`: cell for `location.pathname`
- `query`: cell for `location.search`
- `hash`: cell for `location.hash`
- `local(key, dflt, normalizerOrSerializer?, opts?)`: `localStorage` cell factory
- `internal(name, value)`: in-memory shared cell factory
- `ref(value)`: internal-reference and `:` selection resolver
- `val(value)`: plain value parser for booleans and hashformat-like text
- `parse(value)`: compatibility parser that resolves references before value coercion
- `fetch(input, options?)`: fetch helper with content-type-aware decoding
- `fetched(input, options?)`: reactive cell wrapper around `fetch(input, options?)`

### `Browser`

`Browser` is the class instantiated by `browser(options?)`. It exposes the same
instance API as the factory return value.

### Exported serializers

`@./browser.js` exports these reusable serializer objects:

- `record`
- `query`
- `hash`

Each export has the shape `{ parse, format }`.

## Serializer Behavior

### `record`

`record` is a sanitizer for plain records, not a text encoder.

- `record.parse(value)`:
  - returns a sanitized plain object
  - removes unsupported containers and values
  - prunes unsafe keys: `__proto__`, `prototype`, `constructor`
  - strips control characters from string values
- `record.format(value)`:
  - returns the same sanitized plain object
  - is useful when another API expects a serializer-like `{ parse, format }`
    object but operates on structured data instead of text
  - does not produce a string encoding

Examples:

```javascript
record.parse({
	label: "ok",
	"__proto__": "ignored",
	items: [1, "x", null],
})
// => { label: "ok", items: [1, "x", null] }

record.format({
	title: "Hello",
	meta: { published: true },
})
// => { title: "Hello", meta: { published: true } }

record.format({
	count: Number.POSITIVE_INFINITY,
	unsafe: undefined,
	label: "ok",
})
// => { label: "ok" }
```

### `hash`

`hash` parses and formats the Select hashformat syntax for URL fragments.

Parsing rules:

- leading `#` is ignored
- `null` is encoded as `_`
- `undefined` is encoded as `undefined`
- `true` is encoded as `T`
- `false` is encoded as `F`
- finite numbers are written as decimal text
- numeric strings may include `_` separators
- arrays are comma-separated: `1,2,3`
- objects are `key=value` pairs: `a=1,b=2`
- nested arrays/objects are wrapped in parentheses: `a=(1,2)`
- strings containing special characters are quoted
- special characters that force quoting include `&`, `,`, `(`, `)`, `=`, and `"`
- any keyed entry inside `(...)` switches that group into object mode
- bare items inside an object-mode group become boolean flags like `checked=T`

Formatting rules:

- values are emitted as a deterministic hashformat string
- object keys are sorted before formatting
- unsafe keys and unsupported values are pruned before output
- array-like plain objects with numeric keys `0..n-1` are normalized to arrays

Examples:

```javascript
hash.parse("#a=1,b=(2,3)")
// => { a: 1, b: [2, 3] }

hash.parse("#text=\"hello, world\",flag=T")
// => { text: "hello, world", flag: true }

hash.parse("(label=A,checked)")
// => { label: "A", checked: true }

hash.format({ z: 2, a: [1, 3], text: "hello, world" })
// => "a=(1,3),text=\"hello, world\",z=2"

hash.format({ 0: "alpha", 1: "beta" })
// => "alpha,beta"
```

### `query`

`query` uses the same hashformat syntax as `hash`, but is tailored for
`location.search`.

Parsing rules:

- leading `?` is ignored
- leading `#` is also ignored if present in the input
- any trailing `#fragment` is removed before parsing
- all other value rules match `hash`
- any keyed entry inside `(...)` switches that group into object mode
- bare items inside an object-mode group become boolean flags like `checked=T`

Formatting rules:

- output is the hashformat payload without a leading `?`
- output does not include a trailing fragment
- array-like plain objects with numeric keys `0..n-1` are normalized to arrays

Examples:

```javascript
query.parse("?page=2,filter=active#ignored")
// => { page: 2, filter: "active" }

query.parse("?tags=(red,green,blue)")
// => { tags: ["red", "green", "blue"] }

query.parse("?meta=(label=A,checked)")
// => { meta: { label: "A", checked: true } }

query.format({ page: 2, filter: "active" })
// => "filter=active,page=2"

query.format({ 0: "alpha", 1: "beta" })
// => "alpha,beta"
```

## Browser State Semantics

- `path` is normalized to start with `/`
- `query` and `hash` support partial object updates through cell selection
- `local()` defaults to JSON parse/stringify unless a custom serializer is provided
- `internal()` creates per-browser shared cells that are not persisted
- `ref()` resolves `@name.path`, `#name.path`, and `?name.path` references
- `ref()` also resolves `@name.with.dots:path.to.value`, `#name.with.dots:path.to.value`, and `?name.with.dots:path.to.value`
- `val()` parses booleans and hashformat-like payloads without consuming browser reference strings
- `parse()` dispatches to `ref()` before falling back to `val()`
- when `:` is present, the left side is the full cell name and the right side is the nested selection path
- `fetch()` parses `METHOD:PATH?QUERY#DATA` and decodes responses by content type
- write mode defaults to `replaceState`, with optional `pushState`

## Additional Methods

### `ref(value)`

- non-string and non-reference inputs return `undefined`
- `@name` returns `internal("name")`
- `@name.path.to.value` returns `internal("name").select(["path", "to", "value"])`
- `@name.with.dots:path.to.value` returns `internal("name.with.dots").select(["path", "to", "value"])`
- `#name` returns `hash.select(["name"])`
- `#name.path.to.value` returns `hash.select(["name", "path", "to", "value"])`
- `#name.with.dots:path.to.value` returns `hash.select(["name.with.dots"]).select(["path", "to", "value"])`
- `?name` returns `query.select(["name"])`
- `?name.path.to.value` returns `query.select(["name", "path", "to", "value"])`
- `?name.with.dots:path.to.value` returns `query.select(["name.with.dots"]).select(["path", "to", "value"])`
- when `:` is present, everything before `:` is treated as the full cell name
- numeric dotted segments are coerced to indexes, so `#users.0.name` selects `["users", 0, "name"]`
- numeric dotted segments after `:` are also coerced to indexes, so `?users:list.0.name` selects `["list", 0, "name"]` inside `query.select(["users"])

### `val(value)`

- non-string values are returned unchanged
- `"true"` returns `true`
- `"false"` returns `false`
- strings that look like hashformat are parsed with `hash.parse(...)`
- reference strings such as `@modal` are returned unchanged
- plain strings with no hashformat structure are returned unchanged

### `parse(value)`

- dispatches to `ref(value)` first
- falls back to `val(value)` when `ref(value)` returns `undefined`

Examples:

```javascript
state.ref("@modal")
// => same cell as state.internal("modal")

state.ref("@form.user.name")
// => same cell as state.internal("form").select(["user", "name"])

state.ref("@form.user:name.first")
// => same cell as state.internal("form.user").select(["name", "first"])

state.ref("#user.name")
// => same cell as state.hash.select(["user", "name"])

state.ref("#user.settings:theme.current")
// => same cell as state.hash.select(["user.settings"]).select(["theme", "current"])

state.ref("?users.0.name")
// => same cell as state.query.select(["users", 0, "name"])

state.ref("?users:list.0.name")
// => same cell as state.query.select(["users"]).select(["list", 0, "name"])

state.val("@modal")
// => "@modal"

state.parse("a=1,b=(2,3)")
// => { a: 1, b: [2, 3] }

state.parse("hello")
// => "hello"
```

### `fetch(input, options?)`

- if `input` does not match `METHOD:PATH?QUERY#DATA`, it falls back to native
  `fetch(input, options)` and still normalizes the response body
- if `input` matches that form:
  - `METHOD` becomes `init.method`
  - `PATH?QUERY` becomes the request URL
  - `DATA` is parsed with `hash.parse(...)`
  - parsed data is JSON-stringified into `init.body`
- response decoding:
  - JSON content types return `response.json()`
  - text-like content types return `response.text()`
  - all other content types return `response.blob()`

### `fetched(input, options?)`

Returns a cell that resolves to the same normalized value as `fetch(input, options?)`.

## Example

```javascript
import browser, { query, hash, record } from "@./browser.js"

const state = browser({
	query,
	hash,
})

const parsed = query.parse("?a=1,b=(2,3)#ignored")
const formatted = hash.format({ a: 1, b: [2, 3] })
const safe = record.parse({ "__proto__": "x", label: "ok" })
```
