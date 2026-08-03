# Select Browser

Browser-backed reactive state for URL and `localStorage`.

`browser(options?)` returns:

- `path`: reactive string bound to `location.pathname`
- `query`: reactive record bound to `location.search`
- `hash`: reactive record bound to `location.hash`
- `local(key, dflt, normalizerOrSerializer?, opts?)`: `localStorage`-backed cell
- `internal(name, value)`: in-memory shared cell registry for cross-component state
- `ref(value)`: resolves `@`, `#`, and `?` cell references, including `:` selections
- `val(value)`: parses booleans and hashformat-like text, leaving reference strings unchanged
- `parse(value)`: compatibility parser that dispatches to `ref(value) ?? val(value)`
- `fetch(input, options?)`: fetch helper with typed response parsing
- `fetched(input, options?)`: reactive cell wrapper around `fetch(input, options?)`
- `routes(map)`: bind path/hash route handlers; returns cleanup + helpers
- `pub(eventName, value, queue?)` / `sub(eventName, handler, trigger?)`: in-memory event bus
- `put(channelName, value, ttl?)` / `get(channelName)`: non-blocking channel queue
- `send(channelName, value, timeout?)` / `receive(channelName, timeout?)`: async channel handoff

`@select/state/browser/index.js` also exports `Browser`, the class used by `browser(options?)`.

## Quick Start

```javascript
import browser from "@select/state/browser/index.js"

const state = browser()

state.path.set("/docs")
state.query.set({ page: 2, filter: "active" })
state.hash.set({ section: "api" })

const prefs = state.local("prefs", { theme: "light" })
prefs.select("theme").set("dark")

const modal = state.internal("modal.open", false)
modal.set(true)

const current = state.ref("@modal.open")
const currentName = state.ref("@session.user:profile.name")
const draft = state.val("title=Draft,done=F")
const fallback = state.parse("true")
const result = await state.fetch("POST:/api/items#label=Draft,done=F")
const resultCell = state.fetched("POST:/api/items#label=Draft,done=F")

const stop = state.routes({
	"/": () => console.log("home"),
	"/users/{id:number}": (_path, { id }) => console.log("user", id),
	"#settings": () => console.log("hash settings"),
	"#profile/{tab}": (_path, { tab }) => console.log("profile", tab),
})
// stop() unsubscribes; stop.path / stop.hash / stop.run also available

const off = state.sub("toast", (msg) => console.log(msg), true)
state.pub("toast", "Saved", true)
off()

state.put("jobs", { id: 1 }, 5000)
const job = state.get("jobs")
const done = state.send("jobs", { id: 2 }, 1000)
const next = await state.receive("jobs", 1000)
await done
```

## Serializer Exports

`@select/state/browser/index.js` also exports reusable serializers:

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
- hash parsing treats a bare first value as a `path` key; see [Browser Reference](ref-browser.md#hash) for details

## Error Handling

- invalid values are sanitized before they are written
- unsafe keys such as `__proto__`, `prototype`, and `constructor` are pruned
- control characters are removed from serialized text

## `ref(value)`

- returns `undefined` for non-string or non-reference inputs
- `@name` resolves to `internal("name")`
- `@name.path.to.value` resolves to `internal("name").select(["path", "to", "value"])`
- `@name.with.dots:path.to.value` resolves to `internal("name.with.dots").select(["path", "to", "value"])`
- `#name` resolves to `hash.select(["name"])`
- `#name.path.to.value` resolves to `hash.select(["name", "path", "to", "value"])`
- `#name.with.dots:path.to.value` resolves to `hash.select(["name.with.dots"]).select(["path", "to", "value"])`
- `?name` resolves to `query.select(["name"])`
- `?name.path.to.value` resolves to `query.select(["name", "path", "to", "value"])`
- `?name.with.dots:path.to.value` resolves to `query.select(["name.with.dots"]).select(["path", "to", "value"])`
- when `:` is present, everything before `:` is treated as the full cell name and everything after `:` is the nested selection path
- numeric dotted segments become indexes, so `#users.0.name` resolves to `hash.select(["users", 0, "name"])`
- numeric dotted segments after `:` also become indexes, so `?users:list.0.name` resolves to `query.select(["users"]).select(["list", 0, "name"])

## `val(value)`

- non-string values are returned unchanged
- `"true"` becomes `true`
- `"false"` becomes `false`
- text containing hashformat structure such as `=`, `,`, `(`, `)`, or a leading `#` is parsed with the default hash parser
- reference strings such as `@modal.open` are returned unchanged
- plain text such as `hello` or `42` is returned unchanged

## `parse(value)`

- dispatches to `ref(value)` first
- falls back to `val(value)` when the input is not a browser reference
- preserves the previous mixed behavior for existing callers

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

## `fetched(input, options?)`

Returns a cell that resolves to the same normalized result as `fetch(input, options?)`.

## `routes(map)`

Registers handlers from `select/routing` and wires them to browser location state.

- Keys **without** a leading `#` match `state.path` (`location.pathname`)
- Keys **with** a leading `#` match the hash bare path (`state.hash.value.path`)
- Handlers run once immediately, then on every matching source change
- Handler signature: `(path, captured, ...args) => any`

Returns an idempotent cleanup function with:

- `path` / `hash`: `routed()` dispatchers (or `null` when that side is unused)
- `router`: path router if present, else hash router
- `match(p)` / `run(p, ...args)`: prefer the path router

```javascript
const stop = state.routes({
	"/docs/{page}": (_path, { page }) => showDocs(page),
	"#login/{step}": (_path, { step }) => showLogin(step),
})
stop()
```

## Messaging

In-process event and channel messaging (not cross-tab).

### `pub(eventName, value, queue?)` / `sub(eventName, handler, trigger?)`

- Live subscribers always receive every `pub` immediately: `handler(value, eventName)`
- `queue: true` retains the last event; `queue: N` retains the last N events
- Late `sub(..., trigger=true)` replays only the last retained event (if any)
- Without `queue`, events are fire-and-forget (no replay)
- `sub` returns an idempotent unsubscriber

### `put(channelName, value, ttl?)` / `get(channelName)`

- FIFO queue per channel name
- `ttl` is optional lifetime in milliseconds; expired values are skipped
- `get` is non-blocking and returns `undefined` when empty
- A pending `receive` takes a `put` immediately (no residual queue item)

### `send(channelName, value, timeout?)` / `receive(channelName, timeout?)`

- Same queue as `put`/`get`
- `send` resolves with `value` when a `get` or `receive` consumes it
- `receive` waits until a value is available
- Optional `timeout` (ms) rejects with `Error` (`browser.send: timeout` / `browser.receive: timeout`)

## Non-Browser Environments

When no `window` is available, `browser()` still returns the same interface,
but it behaves as inert in-memory state.
