# Select Workflows Reference

`@select/features/workflows.js` runs named generator steps with nested execution,
retrying, TTL caching, lifecycle history, hooks, and browser-state event
bindings.

## Quick Start

```javascript
import workflow, { WorkflowRuntime } from "@select/features/workflows.js"

const tasks = workflow({
	*LoadUser(id) {
		const response = yield fetch(`/api/users/${id}`)
		return yield response.json()
	},
	*LoadDashboard(id) {
		const user = yield tasks.LoadUser(id)
		return { user, loadedAt: Date.now() }
	},
}, {
	LoadUser: { cache: 60 },
})

const runtime = new WorkflowRuntime()
const dashboard = await runtime.run(tasks.LoadDashboard(42))
```

## API

### `workflow(steps, options?)`

Builds an object of named workflow steps from generator functions in `steps`.
Non-generator entries are preserved unchanged. `options` is keyed by step name.

```javascript
const tasks = workflow({
	*Refresh(id) {
		return yield api.get(`/items/${id}`)
	},
}, {
	Refresh: { cache: 30, retries: 2 },
})
```

### `step(generator, name?, options?)`

Wraps one generator as a named step. Calling the returned function creates a
tagged generator stream; pass that stream to `run` or yield it from another
workflow step.

```javascript
import { run, step } from "@select/features/workflows.js"

const Refresh = step(function* (id) {
	return yield api.get(`/items/${id}`)
}, "Refresh", { cache: 30 })

const item = await run(Refresh(42))
```

### `run(stream, runtime?)`

Runs a step or plain generator. Without `runtime`, it uses the shared lazy
`WorkflowRuntime` instance.

### `workflow.options(stepFn, options)`

Merges `options` into a step's existing options and returns `stepFn`.

```javascript
workflow.options(tasks.Refresh, { cache: 60 })
```

### `new WorkflowRuntime(options?)`

Creates an isolated executor. Important options are:

- `cache`: `false`, `true` (one hour), or a number of seconds
- `store`: `"memory"`, `"indexeddb[:name]"`, `"idb[:name]"`, or a compatible async store
- `db`: IndexedDB database name when using an IndexedDB store
- `retries`: retries after the initial failed attempt
- `backoff`: a `Backoff` instance or its configuration
- `accepts(error, attempt, name)`: retry filter
- `heartbeat`: milliseconds between progress events while a step runs
- `logger`: `{ log, warn, error }` lifecycle logger
- `state`: a `Browser` event state; defaults to the shared `browser()` state

Methods:

- `run(stream)`: runs a step or generator
- `configure(name, options)`: overrides options for a named step in this runtime
- `config(name, stepFn?)`: returns the effective options for a step
- `clear(name?, input?)`: clears cached results
- `history(name?)`, `durations(name?)`, `clearHistory()`: inspect or clear lifecycle history
- `bind(workflow, state?)`: subscribes workflow event handlers and returns an idempotent cleanup function
- `unbind(workflow?)`: removes bindings for one workflow, or all bindings; returns the number removed

Runtime configuration takes precedence over the step's `.options`. Runtime
defaults supply cache, retry, backoff, heartbeat, and retry-filter values when
neither configuration specifies them.

For IndexedDB, put the object-store name in `store`: use
`"indexeddb:workflow-cache"` or the shorter `"idb:workflow-cache"`. Without
the `:name` suffix, the storage layer uses its default object-store name.

## Step Options

### Caching and retries

- `cache`: enables result caching. A numeric value is a TTL in seconds.
- `retries`: number of retries after a failed attempt.
- `backoff`: retry delay configuration.
- `accepts`: optional retry filter receiving `(error, attempt, name)`.
- `heartbeat`: emits progress history while an attempt is running.

Cache keys include the step name and its input array. Successful results are
cached; a cached result skips generator execution but still runs step hooks.

### `pre`, `post`, and `error`

`pre`, `post`, and `error` each accept one function or an array of functions.
Hooks run sequentially and may be async.

- `pre(input, undefined, fromCache)` runs once before a cached result is
  returned or a generator attempt begins.
- `post(input, output, fromCache)` runs once after a successful fresh or cached
  result.
- `error(input, error)` runs once when the step fails after retries are
  exhausted (not on intermediate retry attempts).

`input` is the array of arguments passed to the step. `fromCache` is `true`
only when that invocation used a cached result. Retries do not repeat `pre`,
`post`, or `error`.

```javascript
tasks.LoadUser.options = {
	cache: 60,
	pre: (input, _output, fromCache) => {
		console.log("loading", input[0], { fromCache })
	},
	post: [
		(input, user, fromCache) => audit(input[0], user.id, fromCache),
		(_input, user) => cacheAvatar(user.avatar),
	],
	error: (input, err) => reportFailure(input[0], err),
}
```

## Event-bound Workflows

Use `on` to make a workflow step react to a `Browser#pub(eventName, value)`
event. The option maps event names to one callback or an array of callbacks.

```javascript
import { Browser, browser } from "@select/state/browser/index.js"

const state = browser()
const tasks = workflow({
	*Refresh(id) {
		return yield api.get(`/items/${id}`)
	},
}, {
	Refresh: {
		on: {
			refresh: (id, eventName, runtime) => tasks.Refresh(id),
		},
	},
})

const runtime = new WorkflowRuntime({ state })
const stop = runtime.bind(tasks)

state.pub("refresh", 42)
stop()
```

Callbacks receive `(value, eventName, runtime)`. If a callback returns a
generator stream, usually a step invocation such as `tasks.Refresh(value)`,
the runtime starts it asynchronously. Event publication is not blocked while
that workflow runs. Ordinary callback return values are ignored.

`bind` uses the runtime's `state` by default, or an explicit second argument:

```javascript
const otherState = new Browser()
const stop = runtime.bind(tasks, otherState)
```

Each `bind` call creates independent subscriptions. Its returned cleanup
function is idempotent. Use `runtime.unbind(tasks)` to remove all bindings for
that workflow, or `runtime.unbind()` to remove every binding owned by the
runtime. Callback errors and failed workflows started by callbacks are logged
without stopping other subscribers to the published event.

## Lifecycle History

Every tagged step records lifecycle entries. `history()` returns all entries,
and `history(name)` filters them by step name. `durations(name?)` returns end,
cache, and error entries with timing information.

Entry types include:

- `start`: a step attempt began
- `end`: an attempt completed successfully
- `cache`: a cached result was served
- `error`: an attempt failed
- `retry`: a failed attempt will retry
- `heartbeat` / `progress`: long-running attempt progress

Each entry snapshots the current nested workflow stack, making parent and
child step relationships available for logging and inspection.
