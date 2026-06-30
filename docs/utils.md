# Select Utils

## Compatibility barrel for split helpers

`select/utils.js` re-exports the helper modules under `select/utils/*.js` and
exposes the `sel` bundle for selection helpers. Search helpers live in the
separate `select/utils/search.js` module.

### Re-exported groups

- `select/utils/selection.js`: `itemkey`, `items`, `index`, `find`, `has`, `add`, `remove`, `toggle`, `next`, `wrapindex`, `sel`
- `select/utils/html.js`: `asText`, `clsx`, `iclsx`, `hi`, `microtask`
- `select/utils/compare.js`: `cmp`, `eq`
- `select/utils/func.js`: `asTrue`, `def`, `idem`, `extractor`, `predicate`, `memo`, `pipe`, `swallow`
- `select/utils/iter.js`: `ikeys`, `iitems`, `iremap`, `iwalk`, `ileaves`
- `select/utils/logger.js`: `logger`
- `select/utils/math.js`: math helpers used by the library internals
- `select/utils/sanitize.js`: `Sanitizer`, `sanitize`, `sanitizer`
- `select/utils/text.js`: text helpers such as `shortdict`, `shortword`, `unshortword`, `words`, `re`, `rescape`, `sprintf`, `uid`
- `select/utils/transform.js`, `traverse.js`, `update.js`, `values.js`: the remaining utility helpers re-exported by the barrel, including `assign(scope, path, value, merge?, offset?)` for nested writes with `undefined` path segments mapped to the next free numeric slot and missing `undefined` containers materialized as arrays, and `items(value)` which converts the `iitems` iterator to a plain array.

### Selection helpers

- `itemkey(item)`: Returns `item.id ?? item.key ?? item.name ?? item`.
- `items(values)`: Normalizes non-object entries into `{ label, value }` objects.
- `index(items, item, key?)`: Finds the matching index, or `-1`.
- `find(items, item, key?)`: Alias for `index`.
- `has(items, item, key?)`: True when `item` exists in `items`.
- `add(items, item, key?)`: Returns an array with `item` appended when absent.
- `remove(items, item, key?)`: Returns an array with `item` removed when present.
- `toggle(items, item, key?)`: Adds when absent, removes when present.
- `next(itemsOrLength, index, delta?)`: Returns the wrapped index for cyclic navigation.
- `wrapindex(itemsOrLength, index, delta?)`: Low-level wrapped index helper.
- `sel`: Frozen-style selection helper bundle mirroring the selection exports.

### HTML helpers

- `clsx(...values)`: Joins class fragments into one class string.
- `iclsx(...values)`: Generator form of `clsx`.
- `asText(value)`: Converts values to displayable text.
- `hi(text, query, creator?)`: Returns highlighted text nodes/fragments.

### Search helpers

- `select/utils/search.js` exports `match(value, criteria)`, `predicate(...criteria)`, and `textfilter(text)`.
- Import it directly when you need those helpers.

### Text compression helpers

- `shortdict(text)`: Builds a frequency-sorted dictionary mapped to short base-26 tokens.
- `shortword(text, dict?)`: Replaces dictionary words with short tokens.
- `unshortword(text, dict?)`: Restores text compressed with `shortword`.

### Using

```javascript
import { add, clsx, eq, next, shortword, toggle } from "@./utils.js"

const buttonClass = clsx("btn", { active: true })
let items = [{ id: 1 }, { id: 2 }]
items = toggle(items, { id: 2 })
items = add(items, { id: 3 })

console.log(items[next(items, 0, -1)])
console.log(eq(shortword("hello hello world"), shortword("hello hello world")))
```
