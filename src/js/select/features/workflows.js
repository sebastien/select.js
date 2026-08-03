// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-07-16
// Updated: 2026-07-16

// Module: select/features/workflows
// Generator-based workflow runner with named steps, TTL result caching
// (via select/utils/storage), transparent retries, lifecycle logging, and
// duration history. The runtime keeps a live call stack of nested step
// invocations; every recorded event snapshots that stack so you can see
// where it sits in the workflow tree. Execution lives on `WorkflowRuntime`
// so subclasses can specialise caching, retries, or yield handling.
// Concurrent top-level `run`s on the same runtime interleave the stack —
// use separate runtimes for parallel roots.
//
// Example:
// ```javascript
// const { LoadUser, LoadPosts } = workflow({
// 	*LoadUser(id) {
// 		const res = yield fetch(`/api/users/${id}`)
// 		return yield res.json()
// 	},
// 	*LoadPosts(id) {
// 		const user = yield LoadUser(id)
// 		const res = yield fetch(`/api/users/${id}/posts`)
// 		return { user, posts: yield res.json() }
// 	},
// })
// LoadPosts.options = { cache: 30 }
// // or: workflow.options(LoadPosts, { cache: 30 })
//
// // Free function uses a lazy default runtime singleton
// const data = await run(LoadPosts(1))
//
// // Or a dedicated runtime
// const runtime = new WorkflowRuntime({ store: "indexeddb:workflows", cache: 60 })
// const data2 = await runtime.run(LoadPosts(1))
// ```

import { browser } from "../state/browser.js";
import { Backoff, Retry } from "../utils/http.js";
import { logger } from "../utils/logger.js";
import { store } from "../utils/storage.js";
import { isGenerator, jsonkey } from "../utils/values.js";

// ----------------------------------------------------------------------------
//
// SYMBOLS
//
// ----------------------------------------------------------------------------

let StepId = 0;
const Step = Symbol.for(":Step");
const Name = Symbol.for(":Name");
const Input = Symbol.for(":Input");
const GeneratorFunctionTag = "[object GeneratorFunction]";
const AsyncGeneratorFunctionTag = "[object AsyncGeneratorFunction]";

// ----------------------------------------------------------------------------
//
// HELPERS
//
// ----------------------------------------------------------------------------

function isStepStream(stream) {
	return !!(stream && stream[Step] !== undefined && stream[Step] !== null);
}

function isGeneratorFunction(value) {
	if (typeof value !== "function") {
		return false;
	}
	const tag = Object.prototype.toString.call(value);
	return tag === GeneratorFunctionTag || tag === AsyncGeneratorFunctionTag;
}

function now() {
	return Date.now();
}

// First defined `key` across plain objects (configure / step / runtime defaults).
function getdef(key, ...containers) {
	for (let i = 0; i < containers.length; i++) {
		const container = containers[i];
		if (container && container[key] !== undefined) {
			return container[key];
		}
	}
	return undefined;
}

function _calcTtl(cache) {
	if (cache === false) return 0;
	if (cache === true) return 3600000;
	if (typeof cache === "number") return Math.max(0, cache) * 1000;
	return 0;
}

function workflowStore(options = undefined) {
	const storeSpec = options?.store;
	if (typeof storeSpec !== "string") {
		return options;
	}
	const separator = storeSpec.indexOf(":");
	const kind = separator >= 0 ? storeSpec.slice(0, separator) : storeSpec;
	if (kind !== "indexeddb" && kind !== "idb") {
		return options;
	}
	const name = separator >= 0 ? storeSpec.slice(separator + 1) : undefined;
	const { storeName: _storeName, ...config } = options;
	return {
		...config,
		store: "indexeddb",
		...(name ? { storeName: name } : {}),
	};
}

async function runHooks(hooks, input, output = undefined, fromCache = false) {
	if (typeof hooks === "function") {
		await hooks(input, output, fromCache);
		return;
	}
	if (!Array.isArray(hooks)) {
		return;
	}
	for (let i = 0; i < hooks.length; i++) {
		const hook = hooks[i];
		if (typeof hook === "function") {
			await hook(input, output, fromCache);
		}
	}
}

// ----------------------------------------------------------------------------
//
// STEP FACTORIES
//
// ----------------------------------------------------------------------------

// Function: step
// Wraps a generator `generator` as a cacheable workflow step with `name` and
// optional `options` (`cache`, `retries`, `backoff`, `heartbeat`, `accepts`,
// `pre`, `post`, `error`, `recover`, `on`). `pre`, `post`, and `error` may each be a
// function or array of functions. They receive `(input, undefined, fromCache)`,
// `(input, output, fromCache)`, and `(input, error)` respectively. `pre`/`post`
// run for cached results too; `error` runs once when the step fails after
// retries are exhausted. `recover(error)` may return a fallback result or throw.
// `on` maps state event names to callbacks (or callback
// arrays), invoked as `(value, eventName, runtime)` by `runtime.bind()`.
//
// Example:
// ```javascript
// const LoadUser = step(function* (id) {
// 	return yield fetch(`/api/users/${id}`).then((r) => r.json())
// }, "LoadUser", { cache: 60 })
// // or: LoadUser.options = { cache: 60 }
// ```
function step(generator, name = undefined, options = undefined) {
	const id = StepId++;
	const stepName = name === undefined || name === null ? generator?.name : name;
	const f = (...args) =>
		Object.assign(generator(...args), {
			[Step]: id,
			[Name]: stepName,
			[Input]: args,
			fn: f,
		});
	return Object.assign(f, { [Step]: id, [Name]: stepName, options });
}

// Function: workflow
// Builds a map of named steps from `steps` (generators). Attach per-step
// options with `step.options = {…}` or `workflow.options(step, {…})`.
//
// Example:
// ```javascript
// const { LoadUser, LoadPosts } = workflow({
// 	*LoadUser(id) { return yield api.user(id) },
// 	*LoadPosts(id) { return yield api.posts(id) },
// })
// LoadPosts.options = { cache: 30 }
// ```
function workflow(steps, options = undefined) {
	const out = {};
	if (!steps || typeof steps !== "object") {
		return out;
	}
	for (const name in steps) {
		if (!Object.hasOwn(steps, name)) {
			continue;
		}
		const v = steps[name];
		// We preserve non-function values, only processing functions.
		out[name] = isGeneratorFunction(v) ? step(v, name, options?.[name]) : v;
	}
	return out;
}

// Function: workflow.options
// Merges `options` onto `stepFn.options` and returns `stepFn`.
workflow.options = (stepFn, options = undefined) => {
	stepFn.options = { ...stepFn.options, ...options };
	return stepFn;
};

// ----------------------------------------------------------------------------
//
// RUNTIME
//
// ----------------------------------------------------------------------------

// Class: WorkflowRuntime
// Execution context for workflow steps: result cache, retries, logging, and
// duration history. Nested tagged steps push/pop `stack` frames
// (`{ name, id, input, attempt }`); events snapshot that stack. Override
// `run`, `execute`, `resolve`, `onStep`, or the `onStep*` lifecycle handlers
// to specialise behaviour (including logging).
// - store: "memory"|"indexeddb[:name]"|"idb[:name]"|Store - cache backend
//   (see select/utils/storage); the optional suffix selects the IndexedDB store
// - db: string - IndexedDB database name when store is `"indexeddb"`
// - cache: false|true|number - enable caching (false=no, true=1h, number=seconds)
// - retries: number - default retries after the first failure
// - backoff: object|Backoff - default retry backoff
// - heartbeat: number - ms between automatic heartbeat logs while a step runs
// - logger: object - `{ log, warn, error }` sink
// - accepts: function - optional `(error, attempt, name) => boolean` retry filter
// - state: Browser - event state for `bind`, defaults to `browser()`
class WorkflowRuntime {
	constructor(options = undefined) {
		this.cache = options?.cache ?? false;
		this.retries = Math.max(0, options?.retries || 0);
		this.backoff = options?.backoff || { delay: 250, factor: 2 };
		this.heartbeat = Math.max(0, options?.heartbeat || 0);
		this.accepts =
			typeof options?.accepts === "function" ? options.accepts : undefined;
		this.log = options?.logger || logger("select.workflows");
		this.store = store(workflowStore(options));
		this.state = options?.state || browser();
		this.configs = new Map();
		this.events = [];
		this.bindings = [];
		// Live nested step frames for the current execution path.
		this.stack = [];
		this.ready =
			typeof this.store.ready?.then === "function"
				? this.store.ready
				: Promise.resolve();
	}

	// Property: current
	// Top stack frame, or `undefined` when idle.
	get current() {
		return this.stack.length ? this.stack[this.stack.length - 1] : undefined;
	}

	// Method: push
	// Pushes an invocation `frame` onto the live stack and returns it.
	push(frame) {
		this.stack.push(frame);
		return frame;
	}

	// Method: pop
	// Removes and returns the top stack frame.
	pop() {
		return this.stack.pop();
	}

	// Method: path
	// Returns step names along the current stack (outermost first).
	path() {
		const out = [];
		for (let i = 0; i < this.stack.length; i++) {
			out.push(this.stack[i].name);
		}
		return out;
	}

	// Function: Default
	// Returns the shared default runtime, creating it on first use.
	static Default() {
		if (!WorkflowRuntime.SINGLETON) WorkflowRuntime.SINGLETON = new WorkflowRuntime();
		return WorkflowRuntime.SINGLETON;
	}

	// Method: configure
	// Merges per-step option overrides for step `name` (runtime-level).
	configure(name, options) {
		const current = this.configs.get(name) || {};
		this.configs.set(name, { ...current, ...options });
		return this;
	}

	// Method: config
	// Returns effective options for `name`, preferring configure() overrides,
	// then step function `.options`, then runtime defaults.
	config(name, stepFn = undefined) {
		const stepOptions = stepFn?.options || {};
		const named = this.configs.get(name) || {};
		const defaults = {
			cache: this.cache,
			retries: this.retries,
			backoff: this.backoff,
			heartbeat: this.heartbeat,
			accepts: this.accepts,
		};
		return {
			ttl: _calcTtl(getdef("cache", named, stepOptions, defaults)),
			retries: getdef("retries", named, stepOptions, defaults),
			backoff: getdef("backoff", named, stepOptions, defaults),
			heartbeat: getdef("heartbeat", named, stepOptions, defaults),
			accepts: getdef("accepts", named, stepOptions, defaults),
			pre: getdef("pre", named, stepOptions),
			post: getdef("post", named, stepOptions),
			error: getdef("error", named, stepOptions),
			recover: getdef("recover", named, stepOptions),
			on: getdef("on", named, stepOptions),
		};
	}

	// Method: onEventError
	// Reports a failed event callback or returned workflow without interrupting
	// other subscribers to the same published event.
	onEventError(name, eventName, error) {
		if (typeof this.log?.error === "function") {
			this.log.error("event", name, { eventName, error });
		}
	}

	// Method: onEvent
	// Invokes `handlers` for a published state event. Returned generator streams
	// run through this runtime without blocking event delivery.
	onEvent(handlers, value, eventName, name) {
		const n = Array.isArray(handlers) ? handlers.length : 1;
		for (let i = 0; i < n; i++) {
			const handler = Array.isArray(handlers) ? handlers[i] : handlers;
			if (typeof handler !== "function") {
				continue;
			}
			try {
				const stream = handler(value, eventName, this);
				if (isGenerator(stream)) {
					this.run(stream).catch((error) =>
						this.onEventError(name, eventName, error),
					);
				} else if (typeof stream?.then === "function") {
					stream.catch((error) => this.onEventError(name, eventName, error));
				}
			} catch (error) {
				this.onEventError(name, eventName, error);
			}
		}
	}

	// Method: bind
	// Subscribes workflow step `on` options to `state` events. Each call creates
	// independent subscriptions and returns an idempotent unsubscriber.
	bind(wrkf, state = this.state) {
		const offs = [];
		if (!wrkf || typeof wrkf !== "object" || typeof state?.sub !== "function") {
			return () => false;
		}
		for (const name in wrkf) {
			if (!Object.hasOwn(wrkf, name)) {
				continue;
			}
			const stepFn = wrkf[name];
			if (typeof stepFn !== "function" || stepFn[Step] === undefined) {
				continue;
			}
			const events = this.config(name, stepFn).on;
			if (!events || typeof events !== "object") {
				continue;
			}
			for (const eventName in events) {
				if (!Object.hasOwn(events, eventName)) {
					continue;
				}
				const handlers = events[eventName];
				offs.push(
					state.sub(eventName, (value, publishedEventName) =>
						this.onEvent(handlers, value, publishedEventName, name),
					),
				);
			}
		}
		if (offs.length === 0) {
			return () => false;
		}
		let active = true;
		const binding = { wrkf, off: undefined };
		const off = () => {
			if (!active) {
				return false;
			}
			active = false;
			for (let i = 0; i < offs.length; i++) {
				offs[i]();
			}
			const i = this.bindings.indexOf(binding);
			if (i >= 0) {
				this.bindings.splice(i, 1);
			}
			return true;
		};
		binding.off = off;
		this.bindings.push(binding);
		return off;
	}

	// Method: unbind
	// Removes subscriptions created by `bind` for `wrkf`, or all bindings when
	// `wrkf` is omitted. Returns the number of bindings removed.
	unbind(wrkf = undefined) {
		let count = 0;
		for (let i = this.bindings.length - 1; i >= 0; i--) {
			const binding = this.bindings[i];
			if (wrkf === undefined || binding.wrkf === wrkf) {
				if (binding.off()) {
					count += 1;
				}
			}
		}
		return count;
	}

	async has(name, input) {
		await this.ready;
		return this.store.has(jsonkey(input, name));
	}

	async get(name, input) {
		await this.ready;
		const entry = await this.store.get(jsonkey(input, name));
		return entry?.value;
	}

	async set(name, input, result, duration, ttl = undefined) {
		await this.ready;
		const at = now();
		const effectiveTtl = ttl === undefined ? _calcTtl(this.cache) : ttl;
		const key = jsonkey(input, name);
		await this.store.set(key, {
			value: result,
			duration,
			expires: effectiveTtl ? at + effectiveTtl : Infinity,
			at,
			name,
			inputKey: key,
		});
		return result;
	}

	// Method: clear
	// Clears all cache entries, all for `name`, or one `name`+`input` entry.
	async clear(name = undefined, input = undefined) {
		await this.ready;
		if (name === undefined) {
			await this.store.clear();
			return;
		}
		if (input !== undefined) {
			await this.store.delete(jsonkey(input, name));
			return;
		}
		const prefix = `${name}\0`;
		const keys = await this.store.keys();
		for (let i = 0; i < keys.length; i++) {
			if (`${keys[i]}`.startsWith(prefix)) {
				await this.store.delete(keys[i]);
			}
		}
	}

	// Method: record
	// Appends an event to the in-memory history (with a `stack` snapshot of
	// current invocations) and logs it.
	record(event) {
		const stack = [];
		for (let i = 0; i < this.stack.length; i++) {
			const frame = this.stack[i];
			stack.push({
				name: frame.name,
				id: frame.id,
				input: frame.input,
				attempt: frame.attempt,
			});
		}
		const entry = { at: now(), ...event, stack };
		this.events.push(entry);
		const method =
			entry.type === "error"
				? "error"
				: entry.type === "retry"
					? "warn"
					: "log";
		if (typeof this.log?.[method] === "function") {
			this.log[method](entry.type, entry.name, entry);
		}
		return entry;
	}

	// Method: history
	// Returns recorded events, optionally filtered by step `name`.
	history(name = undefined) {
		if (name === undefined) {
			return this.events.slice();
		}
		const out = [];
		for (let i = 0; i < this.events.length; i++) {
			if (this.events[i].name === name) {
				out.push(this.events[i]);
			}
		}
		return out;
	}

	// Method: durations
	// Returns end/cache events that carry a duration, optionally by `name`.
	durations(name = undefined) {
		const out = [];
		for (let i = 0; i < this.events.length; i++) {
			const event = this.events[i];
			if (
				event.duration !== undefined &&
				(event.type === "end" ||
					event.type === "cache" ||
					event.type === "error") &&
				(name === undefined || event.name === name)
			) {
				out.push(event);
			}
		}
		return out;
	}

	// Method: clearHistory
	// Clears the in-memory event log.
	clearHistory() {
		this.events.length = 0;
	}

	// Method: resolve
	// Turns a yielded value into the next generator input (nested run or await).
	async resolve(yielded) {
		return isGenerator(yielded) ? this.run(yielded) : yielded;
	}

	// Method: execute
	// Pumps generator `stream`, resolving each yield via `resolve`.
	async execute(stream) {
		let value;
		while (true) {
			const next = await stream.next(value);
			if (next.done) {
				return next.value;
			}
			value = await this.resolve(next.value);
		}
	}

	// Method: stepContext
	// Builds the mutable lifecycle context for a tagged step `stream`.
	stepContext(stream, attempt = 0) {
		const name = stream[Name];
		const stepFn = stream.fn;
		return {
			stream,
			stepFn,
			name,
			id: stream[Step],
			input: stream[Input],
			attempt,
			started: 0,
			duration: 0,
			cfg: this.config(name, stepFn),
		};
	}

	// Method: onStepStart
	// Called when a step attempt begins.
	onStepStart(ctx) {
		this.record({
			type: "start",
			name: ctx.name,
			id: ctx.id,
			input: ctx.input,
			attempt: ctx.attempt,
		});
	}

	// Method: onStepSucceed
	// Called when a step attempt completes successfully; caches `result`.
	async onStepSucceed(ctx, result) {
		// `cache: false` → ttl 0 → no caching.
		if (ctx.cfg.ttl) {
			await this.set(ctx.name, ctx.input, result, ctx.duration, ctx.cfg.ttl);
		}
		this.record({
			type: "end",
			name: ctx.name,
			id: ctx.id,
			input: ctx.input,
			attempt: ctx.attempt,
			duration: ctx.duration,
			status: "ok",
		});
	}

	// Method: onStepFail
	// Called when a step attempt throws `error`.
	onStepFail(ctx, error) {
		this.record({
			type: "error",
			name: ctx.name,
			id: ctx.id,
			input: ctx.input,
			attempt: ctx.attempt,
			duration: ctx.duration,
			status: "error",
			error,
		});
	}

	// Method: onStepRetry
	// Called when a failed step will be retried after `error`.
	onStepRetry(ctx, error) {
		this.record({
			type: "retry",
			name: ctx.name,
			id: ctx.id,
			input: ctx.input,
			attempt: ctx.attempt,
			error,
		});
	}

	// Method: onStepCache
	// Called when a step result is served from cache.
	onStepCache(ctx, result) {
		this.record({
			type: "cache",
			name: ctx.name,
			id: ctx.id,
			input: ctx.input,
			duration: 0,
			status: "cache",
			result,
		});
	}

	// Method: onStepProgress
	// Called for long-running step progress (default: heartbeat ticks).
	onStepProgress(ctx, info = undefined) {
		this.record({
			type: info?.type || "progress",
			name: ctx.name,
			id: ctx.id,
			input: ctx.input,
			attempt: ctx.attempt,
			duration: info?.duration ?? now() - ctx.started,
			...info,
		});
	}

	// Method: onStep
	// Runs a tagged step stream with cache lookup, retries, and lifecycle hooks.
	// Pushes an invocation frame for the duration of the call so nested yields
	// and recorded events see the full workflow path.
	async onStep(stream) {
		const ctx = this.stepContext(stream);
		const frame = {
			name: ctx.name,
			id: ctx.id,
			input: ctx.input,
			attempt: ctx.attempt,
		};
		this.push(frame);
		try {
			// Only consult cache when caching is enabled (ttl > 0).
			const fromCache = !!(
				ctx.cfg.ttl && (await this.has(ctx.name, ctx.input))
			);
			await runHooks(ctx.cfg.pre, ctx.input, undefined, fromCache);
			if (fromCache) {
				const result = await this.get(ctx.name, ctx.input);
				await this.onStepCache(ctx, result);
				await runHooks(ctx.cfg.post, ctx.input, result, true);
				return result;
			}

			const retry = new Retry({
				retries: ctx.cfg.retries,
				accepts: ctx.cfg.accepts
					? (error, attempt) => ctx.cfg.accepts(error, attempt, ctx.name)
					: undefined,
			});
			const backoff =
				ctx.cfg.backoff instanceof Backoff
					? ctx.cfg.backoff
					: new Backoff(ctx.cfg.backoff);
			let current = stream;

			for (;;) {
				let heartbeatTimer;
				ctx.started = now();
				ctx.duration = 0;
				frame.attempt = ctx.attempt;
				await this.onStepStart(ctx);
				if (ctx.cfg.heartbeat > 0) {
					heartbeatTimer = setInterval(() => {
						this.onStepProgress(ctx, {
							type: "heartbeat",
							duration: now() - ctx.started,
						});
					}, ctx.cfg.heartbeat);
				}
				try {
					const result = await this.execute(current);
					ctx.duration = now() - ctx.started;
					await this.onStepSucceed(ctx, result);
					await runHooks(ctx.cfg.post, ctx.input, result);
					return result;
				} catch (caught) {
					const error = caught;
					ctx.duration = now() - ctx.started;
					await this.onStepFail(ctx, error);
					if (!(await retry.continues(error))) {
						await runHooks(ctx.cfg.error, ctx.input, error);
						if (typeof ctx.cfg.recover === "function") {
							const result = await ctx.cfg.recover(error);
							await runHooks(ctx.cfg.post, ctx.input, result);
							return result;
						}
						throw error;
					}
					await this.onStepRetry(ctx, error);
					await backoff.join();
					ctx.attempt += 1;
					frame.attempt = ctx.attempt;
					if (typeof current.fn === "function") {
						current = current.fn(...(ctx.input || []));
					} else if (typeof ctx.stepFn === "function") {
						current = ctx.stepFn(...(ctx.input || []));
					} else {
						await runHooks(ctx.cfg.error, ctx.input, error);
						throw error;
					}
				} finally {
					if (heartbeatTimer) {
						clearInterval(heartbeatTimer);
					}
				}
			}
		} finally {
			this.pop();
		}
	}

	// Method: run
	// Executes generator `stream` (step or plain) with this runtime.
	async run(stream) {
		await this.ready;
		return isStepStream(stream) ? this.onStep(stream) : this.execute(stream);
	}
}

// ----------------------------------------------------------------------------
//
// RUNNER
//
// ----------------------------------------------------------------------------

// Function: run
// Executes generator `stream` with `runtime`, or the lazy default singleton
// when `runtime` is omitted.
async function run(stream, runtime = undefined) {
	return (runtime || WorkflowRuntime.Default()).run(stream);
}

export { Input, Name, run, Step, step, WorkflowRuntime, workflow };
export default Object.assign(workflow, {
	run,
	step,
	options: workflow.options,
});

// EOF
