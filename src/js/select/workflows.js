// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-07-16
// Updated: 2026-07-16

// Module: select/workflows
// Generator-based workflow runner with named steps, TTL result caching
// (via select/utils/storage), transparent retries, lifecycle logging, and
// duration history. Execution lives on `WorkflowRuntime` so subclasses can
// specialise caching, retries, or yield handling.
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
//
// // Free function uses a lazy default runtime singleton
// const data = await run(LoadPosts(1))
//
// // Or a dedicated runtime
// const runtime = new WorkflowRuntime({ store: "indexeddb", ttl: 60_000 })
// const data2 = await runtime.run(LoadPosts(1))
// ```

import { Backoff, Retry } from "./utils/http.js";
import { logger } from "./utils/logger.js";
import { store } from "./utils/storage.js";
import { isGenerator, jsonkey } from "./utils/values.js";

// ----------------------------------------------------------------------------
//
// SYMBOLS
//
// ----------------------------------------------------------------------------

let StepId = 0;
const Step = Symbol.for(":Step");
const Name = Symbol.for(":Name");
const Input = Symbol.for(":Input");

// ----------------------------------------------------------------------------
//
// HELPERS
//
// ----------------------------------------------------------------------------

function isStepStream(stream) {
	return !!(stream && stream[Step] !== undefined && stream[Step] !== null);
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

// ----------------------------------------------------------------------------
//
// STEP FACTORIES
//
// ----------------------------------------------------------------------------

// Function: step
// Wraps a generator `generator` as a cacheable workflow step with `name` and
// optional `config` (`ttl`, `retries`, `backoff`, `heartbeat`, `accepts`).
//
// Example:
// ```javascript
// const LoadUser = step(function* (id) {
// 	return yield fetch(`/api/users/${id}`).then((r) => r.json())
// }, "LoadUser", { ttl: 60_000 })
// ```
function step(generator, name = undefined, config = undefined) {
	const id = StepId++;
	const stepName = name === undefined || name === null ? generator?.name : name;
	const f = (...args) =>
		Object.assign(generator(...args), {
			[Step]: id,
			[Name]: stepName,
			[Input]: args,
			fn: f,
		});
	return Object.assign(f, { [Step]: id, [Name]: stepName, config });
}

// Function: workflow
// Builds a map of named steps from `steps`, where each value is a generator
// or a `[generator, config]` pair.
//
// Example:
// ```javascript
// const { LoadUser } = workflow({
// 	*LoadUser(id) { return yield api.user(id) },
// 	LoadPosts: [function* (id) { ... }, { ttl: 30_000 }],
// })
// ```
function workflow(steps) {
	const out = {};
	if (!steps || typeof steps !== "object") {
		return out;
	}
	for (const name in steps) {
		if (!Object.hasOwn(steps, name)) {
			continue;
		}
		const value = steps[name];
		out[name] = Array.isArray(value)
			? step(value[0], name, value[1])
			: step(value, name);
	}
	return out;
}

// ----------------------------------------------------------------------------
//
// RUNTIME
//
// ----------------------------------------------------------------------------

// Class: WorkflowRuntime
// Execution context for workflow steps: result cache, retries, logging, and
// duration history. Override `run`, `execute`, `resolve`, `onStep`, or the
// `onStep*` lifecycle handlers to specialise behaviour (including logging).
// - store: "memory"|"indexeddb"|Store - cache backend (see select/utils/storage)
// - db: string - IndexedDB database name when store is `"indexeddb"`
// - storeName: string - IndexedDB object store name
// - ttl: number - default cache TTL in ms (`0` means no expiry)
// - retries: number - default retries after the first failure
// - backoff: object|Backoff - default retry backoff
// - heartbeat: number - ms between automatic heartbeat logs while a step runs
// - logger: object - `{ log, warn, error }` sink
// - accepts: function - optional `(error, attempt, name) => boolean` retry filter
class WorkflowRuntime {
	constructor(options = undefined) {
		this.ttl = Math.max(0, options?.ttl || 0);
		this.retries = Math.max(0, options?.retries || 0);
		this.backoff = options?.backoff || { delay: 250, factor: 2 };
		this.heartbeat = Math.max(0, options?.heartbeat || 0);
		this.accepts =
			typeof options?.accepts === "function" ? options.accepts : undefined;
		this.log = options?.logger || logger("select.workflows");
		this.store = store(options);
		this.configs = new Map();
		this.events = [];
		this.ready =
			typeof this.store.ready?.then === "function"
				? this.store.ready
				: Promise.resolve();
	}

	// Function: Default
	// Returns the shared default runtime, creating it on first use.
	static Default() {
		return (
			WorkflowRuntime.SINGLETON ||
			(WorkflowRuntime.SINGLETON = new WorkflowRuntime())
		);
	}

	// Method: configure
	// Merges per-step `config` overrides for step `name`.
	configure(name, config) {
		const current = this.configs.get(name) || {};
		this.configs.set(name, { ...current, ...config });
		return this;
	}

	// Method: config
	// Returns effective config for `name`, preferring configure() overrides,
	// then step function config, then runtime defaults.
	config(name, stepFn = undefined) {
		const stepConfig = stepFn?.config || {};
		const named = this.configs.get(name) || {};
		const defaults = {
			ttl: this.ttl,
			retries: this.retries,
			backoff: this.backoff,
			heartbeat: this.heartbeat,
			accepts: this.accepts,
		};
		return {
			ttl: getdef("ttl", named, stepConfig, defaults),
			retries: getdef("retries", named, stepConfig, defaults),
			backoff: getdef("backoff", named, stepConfig, defaults),
			heartbeat: getdef("heartbeat", named, stepConfig, defaults),
			accepts: getdef("accepts", named, stepConfig, defaults),
		};
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
		const effectiveTtl = ttl === undefined ? this.ttl : ttl;
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
	// Appends an event to the in-memory history and logs it.
	record(event) {
		const entry = { at: now(), ...event };
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
		// ttl 0 / falsy means do not cache (not "cache forever").
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
	async onStep(stream) {
		const ctx = this.stepContext(stream);

		// Only consult cache when a positive TTL is configured.
		if (ctx.cfg.ttl && (await this.has(ctx.name, ctx.input))) {
			const result = await this.get(ctx.name, ctx.input);
			await this.onStepCache(ctx, result);
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
				return result;
			} catch (caught) {
				const error = caught;
				ctx.duration = now() - ctx.started;
				await this.onStepFail(ctx, error);
				if (!(await retry.continues(error))) {
					throw error;
				}
				await this.onStepRetry(ctx, error);
				await backoff.join();
				ctx.attempt += 1;
				if (typeof current.fn === "function") {
					current = current.fn(...(ctx.input || []));
				} else if (typeof ctx.stepFn === "function") {
					current = ctx.stepFn(...(ctx.input || []));
				} else {
					throw error;
				}
			} finally {
				if (heartbeatTimer) {
					clearInterval(heartbeatTimer);
				}
			}
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
export default Object.assign(workflow, { run, step });

// EOF
