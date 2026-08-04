# Select Search Reference

The search helpers provide recursive value matching, predicate composition, and
small text-query parsing. They live in `select/utils/search.js` and are also
available as the `search` export from `@select/utils`.

## Importing

Import the named helpers directly from the search module:

```javascript
import { match, predicate, textfilter } from "@select/utils/search.js"
```

Or use the default search bundle:

```javascript
import { search } from "@select/utils"

const matches = search.match(value, criteria)
const filter = search.text("alpha OR beta")
```

The bundle contains `search.text` (an alias for `textfilter`), `and`, `or`,
`not`, `match`, and `predicate`.

## `match(value, criteria)`

Returns `true` when `value` satisfies `criteria`.

Falsy criteria match every value:

```javascript
match("anything", null) // true
match(42, undefined)     // true
```

Criteria are interpreted as follows:

- A regular expression tests the string form of the value.
- An array of criteria requires every criterion to match the value.
- A plain object is a shape: every listed property must match recursively.
- A function is called with the value and must return a truthy or falsy result.
- Other criteria use strict identity (`===`).

Arrays and plain objects used as values are searched recursively. A candidate
array matches when any item matches; a candidate object matches when any
property value matches. This makes a text regular expression useful for
searching all fields of a record:

```javascript
const item = {
	title: "Release notes",
	tags: ["documentation", "v2"],
}

match(item, /release/i)       // true
match(item, /documentation/i) // true
match(item, /missing/i)       // false
```

Shape matching can be used to find a nested object with the required fields:

```javascript
match(
	{ user: { name: "Ada" }, active: true },
	{ name: "Ada" },
) // true

match(
	{ user: { name: "Ada", role: "admin" } },
	{ name: "Ada", role: "admin" },
) // true
```

For an array of criteria, all criteria must pass:

```javascript
match("Ada Lovelace", [/Ada/, /Lovelace/]) // true
match("Ada", [/Ada/, /Lovelace/])          // false
```

## `textfilter(text)`

Builds a case-insensitive `RegExp` from a compact search string. It returns
`null` for a non-string query and a falsy value for an empty query.

```javascript
const filter = textfilter("alpha OR \"beta gamma\"")

filter.test("Alpha release") // true
filter.test("beta gamma")    // true
filter.test("delta")         // false
```

### Query syntax

`OR` is case-insensitive and separates alternatives:

```javascript
const filter = textfilter("draft OR archived")

filter.test("draft document")   // true
filter.test("archived document") // true
filter.test("published document") // false
```

Double-quoted terms are treated as phrases and wrapped in word boundaries:

```javascript
textfilter('"beta gamma"').test("beta gamma notes") // true
textfilter('"beta gamma"').test("betagamma")        // false
```

`?` represents an optional whitespace-delimited word. It is useful at the end
of a query when a qualifier may be present:

```javascript
const filter = textfilter("release?")

filter.test("release")       // true
filter.test("release notes") // true
```

Other regular-expression characters are escaped, so the query is treated as
plain search text rather than as an arbitrary regular expression. Matching is
case-insensitive.

## Predicate Composition

### `predicate(...criteria)`

Converts criteria into a reusable predicate function. With no criteria it
returns `null`. With one criterion it calls `match(value, criterion)`. With
multiple criteria all criteria must match.

```javascript
const visible = predicate((value) => value.hidden === false)
const results = records.filter(visible)

const searchable = predicate(textfilter("alpha OR beta"))
const matches = records.filter(searchable)
```

Because `match` searches object values recursively, the second example tests
the text query against all values in each record.

### `search.and(...criteria)`

Returns a predicate that requires every criterion to match:

```javascript
const ready = search.and(
	(value) => value.active === true,
	(value) => value.score >= 80,
)

records.filter(ready)
```

### `search.or(...criteria)`

Returns a predicate that succeeds when at least one criterion matches:

```javascript
const interesting = search.or(
	textfilter("priority"),
	{ featured: true },
)
```

### `search.not(criteria)`

Returns a predicate that negates one criterion:

```javascript
const notArchived = search.not((value) => value.status === "archived")
const active = records.filter(notArchived)
```

## Combining Search with Application State

The helpers are ordinary functions, so a query can be compiled when an input
changes and then used to filter a collection:

```javascript
function filterItems(items, query) {
	const criteria = textfilter(query)
	const predicate = criteria ? search.predicate(criteria) : null
	if (!predicate) return items

	return items.filter(predicate)
}

filterItems([
	{ title: "Alpha", status: "ready" },
	{ title: "Beta", status: "draft" },
	{ title: "Gamma", status: "ready" },
], "alpha OR gamma")
// => [{ title: "Alpha", ... }, { title: "Gamma", ... }]
```
