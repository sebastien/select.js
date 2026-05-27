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
- write mode defaults to `replaceState`, with optional `pushState`

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
