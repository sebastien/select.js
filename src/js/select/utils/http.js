// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-09
// Updated: 2026-06-09

// Module: select/utils/http
// Small HTTP client helpers with throttling, backoff, retries, and in-memory
// caching for fetch-based workflows.

const BASE_PATH = getBasePath();

function getBasePath() {
	if (globalThis?.document?.head) {
		for (const node of globalThis.document.head.getElementsByTagName("base")) {
			const href = node.getAttribute("href");
			if (href) {
				return href;
			}
		}
	}
	if (globalThis?.document?.URL) {
		return `/${globalThis.document.URL.split("/").slice(3).join("/")}`;
	}
	return baseurl(globalThis?.window?.location?.pathname);
}

// ----------------------------------------------------------------------------
//
// URL MANIPULATION
//
// ----------------------------------------------------------------------------

// Function: baseurl
// Strips any filename from `path`.
function baseurl(path) {
	if (!path || path.endsWith("/")) return path;
	const i = path.lastIndexOf("/");
	return i === -1 ? path : path.slice(0, i);
}

// Function: relurl
// Returns `path` prefixed with `base` when `path` is relative.
function relurl(path, base = BASE_PATH) {
	if (base && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)) {
		const i = base.endsWith("/") ? base.length - 1 : base.length;
		const j = path.startsWith("./") ? 2 : path.startsWith("/") ? 1 : 0;
		return `${base.slice(0, i)}/${path.slice(j)}`;
	}
	return path;
}

function absurl(path, base = undefined) {
	const value = base ? relurl(path, base) : path;
	return value.startsWith("/") ? value : `/${value}`;
}

// ----------------------------------------------------------------------------
//
// FLOW CONTROL
//
// ----------------------------------------------------------------------------

// Class: Throttle
// Waits `delay` milliseconds between admitted operations.
// - delay: number - minimum delay in milliseconds between joins
class Throttle {
	constructor(options = undefined) {
		this.delay = Math.max(0, options?.delay || 0);
		this._next = 0;
	}

	async join() {
		const current = Date.now();
		const ready = Math.max(current, this._next);
		this._next = ready + this.delay;
		return ready > current
			? new Promise((resolve) => setTimeout(resolve, ready - current))
			: Promise.resolve();
	}

	reset() {
		this._next = 0;
	}
}

// Class: Backoff
// Computes an increasing delay across retries.
// - delay: number - initial delay in milliseconds
// - factor: number - multiplier applied after each join
// - maxDelay: number - maximum wait in milliseconds
// - jitter: number - random spread ratio between 0 and 1
class Backoff {
	constructor(options = undefined) {
		this.delay = Math.max(0, options?.delay || 250);
		this.factor = options?.factor > 0 ? options.factor : 2;
		this.maxDelay = Math.max(this.delay, options?.maxDelay || this.delay * 16);
		this.jitter = Math.max(0, Math.min(1, options?.jitter || 0));
		this.attempt = 0;
	}

	async join() {
		const base = Math.min(
			this.maxDelay,
			this.delay * this.factor ** Math.max(0, this.attempt),
		);
		const spread = this.jitter ? base * this.jitter * Math.random() : 0;
		this.attempt += 1;
		return new Promise((resolve) => setTimeout(resolve, base + spread));
	}

	reset() {
		this.attempt = 0;
	}
}

// Class: Retry
// Retry policy that tracks how many more attempts may continue.
// - retries: number - maximum number of retries after the initial request
// - accepts: function - optional predicate receiving `error`
class Retry {
	constructor(options = undefined) {
		this.retries = Math.max(0, options?.retries || 0);
		this.accepts =
			typeof options?.accepts === "function" ? options.accepts : undefined;
		this.attempt = 0;
	}

	async continues(error) {
		if (this.attempt >= this.retries) {
			return false;
		}
		if (this.accepts && (await this.accepts(error, this.attempt)) === false) {
			return false;
		}
		this.attempt += 1;
		return true;
	}

	reset() {
		this.attempt = 0;
	}
}

// ----------------------------------------------------------------------------
//
// CACHE
//
// ----------------------------------------------------------------------------

// Class: Cache
// In-memory cache keyed by URL and optional entry key.
// - ttl: number - cache time-to-live in milliseconds, `0` means no expiry
// - accepts: function - optional predicate receiving `url`
class Cache {
	constructor(options = undefined) {
		this.ttl = Math.max(0, options?.ttl || 0);
		this.acceptsURL =
			typeof options?.accepts === "function" ? options.accepts : undefined;
		this.entries = new Map();
	}

	key(url, key = undefined) {
		return key === undefined || key === null ? url : `${url}#${key}`;
	}

	accepts(url) {
		return this.acceptsURL ? this.acceptsURL(url) !== false : true;
	}

	expired(url, key = undefined) {
		if (!this.ttl) {
			return false;
		}
		const entry = this.entries.get(this.key(url, key));
		return !!(entry && entry.expires <= Date.now());
	}

	has(url, key = undefined) {
		if (this.expired(url, key)) {
			this.entries.delete(this.key(url, key));
			return false;
		}
		return this.entries.has(this.key(url, key));
	}

	get(url, key = undefined) {
		if (!this.has(url, key)) {
			return undefined;
		}
		const value = this.entries.get(this.key(url, key)).value;
		return typeof value?.clone === "function" ? value.clone() : value;
	}

	set(url, key = undefined, value = undefined) {
		this.entries.set(this.key(url, key), {
			value,
			expires: this.ttl ? Date.now() + this.ttl : Infinity,
		});
		return value;
	}

	reset() {
		this.entries.clear();
	}
}

// ----------------------------------------------------------------------------
//
// CLIENT
//
// ----------------------------------------------------------------------------

// Class: HTTPClient
// Fetch wrapper with URL resolution, retry policy, throttling, and caching.
// - base: string|URL - optional base URL for relative requests
// - fetch: function - fetch-compatible implementation
// - throttle: Throttle|object - request throttle options or instance
// - backoff: Backoff|object - retry backoff options or instance
// - retry: Retry|object - retry options or instance
// - cache: Cache|object|false - cache options or instance
class HTTPClient {
	constructor(options = undefined) {
		this.base = options?.base;
		this.fetcher = options?.fetch || globalThis.fetch?.bind(globalThis);
		this.throttle =
			options?.throttle instanceof Throttle
				? options.throttle
				: options?.throttle
					? new Throttle(options.throttle)
					: undefined;
		this.backoff =
			options?.backoff instanceof Backoff
				? options.backoff
				: options?.backoff
					? new Backoff(options.backoff)
					: undefined;
		this.retry =
			options?.retry instanceof Retry
				? options.retry
				: options?.retry
					? new Retry(options.retry)
					: undefined;
		this.cache =
			options?.cache instanceof Cache
				? options.cache
				: options?.cache === false
					? undefined
					: new Cache(options?.cache);
		if (!this.fetcher) {
			throw new Error("http(): fetch is not available");
		}
	}

	url(uri) {
		if (uri instanceof URL) {
			return uri.href;
		}
		const value = `${uri || ""}`;
		if (!value || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
			return value;
		}
		if (this.base) {
			return absurl(value, this.base);
		}
		return absurl(value);
	}

	key(_url, options = undefined) {
		return options?.key;
	}

	cacheable(url, options = undefined) {
		const method = `${options?.method || "GET"}`.toUpperCase();
		return !!(
			this.cache &&
			method === "GET" &&
			options?.cache !== false &&
			this.cache.accepts(url)
		);
	}

	type(response) {
		return `${response?.headers?.get("content-type") || ""}`
			.toLowerCase()
			.split(";")[0]
			.trim();
	}

	async error(response) {
		const type = this.type(response);
		if (!type) {
			return undefined;
		}
		try {
			if (type === "application/json" || type.endsWith("+json")) {
				return await response.clone().json();
			}
			if (
				type.startsWith("text/") ||
				type === "application/xml" ||
				type === "application/javascript" ||
				type === "application/xhtml+xml" ||
				type === "image/svg+xml"
			) {
				return await response.clone().text();
			}
		} catch (_error) {
			return undefined;
		}
	}

	async fail(response) {
		throw await this.responseError(response);
	}

	async responseError(response) {
		const error = new Error(
			`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
		);
		error.response = response;
		error.status = response.status;
		error.payload = await this.error(response);
		return error;
	}

	retryable(response) {
		return (
			response.status === 408 ||
			response.status === 425 ||
			response.status === 429 ||
			response.status >= 500
		)
	}

	async fetch(url, options = undefined) {
		const target = this.url(url);
		const key = this.key(target, options);
		const useCache = this.cacheable(target, options);
		if (useCache && this.cache.has(target, key)) {
			return this.cache.get(target, key);
		}
		this.retry?.reset();
		this.backoff?.reset();
		let error;
		for (;;) {
			if (this.throttle) {
				await this.throttle.join();
			}
			try {
				const response = await this.fetcher(target, options);
				if (response.ok && useCache) {
					this.cache.set(target, key, response.clone());
				}
				if (response.ok) {
					return response;
				}
				error = await this.responseError(response);
				if (!this.retryable(response) || !(await this.retry?.continues(error))) {
					return response;
				}
			} catch (caught) {
				error = caught;
				if (!(await this.retry?.continues(error))) {
					throw error;
				}
			}
			if (this.backoff) {
				await this.backoff.join();
			}
		}
	}

	async json(url, options = undefined) {
		const response = await this.fetch(url, options);
		if (!response.ok) {
			await this.fail(response);
		}
		return response.json();
	}

	async blob(url, options = undefined) {
		const response = await this.fetch(url, options);
		if (!response.ok) {
			await this.fail(response);
		}
		return response.blob();
	}

	async text(url, options = undefined) {
		const response = await this.fetch(url, options);
		if (!response.ok) {
			await this.fail(response);
		}
		return response.text();
	}

	async process(response) {
		if (!response.ok) {
			await this.fail(response);
		}
		const type = this.type(response);
		if (type === "application/json" || type.endsWith("+json")) {
			return response.json();
		}
		if (
			type.startsWith("text/") ||
			type === "application/xml" ||
			type === "application/javascript" ||
			type === "application/xhtml+xml" ||
			type === "image/svg+xml"
		) {
			return response.text();
		}
		return response.blob();
	}

	async GET(url, options = undefined) {
		return this.process(await this.fetch(url, { ...options, method: "GET" }));
	}

	async POST(url, options = undefined) {
		return this.process(await this.fetch(url, { ...options, method: "POST" }));
	}

	async PUT(url, options = undefined) {
		return this.process(await this.fetch(url, { ...options, method: "PUT" }));
	}

	async DELETE(url, options = undefined) {
		return this.process(
			await this.fetch(url, { ...options, method: "DELETE" }),
		);
	}

	async UPDATE(url, options = undefined) {
		return this.process(
			await this.fetch(url, { ...options, method: "UPDATE" }),
		);
	}
}

// Function: http
// Returns an `HTTPClient` instance or the shared singleton.
//
// Example:
// ```javascript
// const client = http({ base: "/api", retry: { retries: 2 } })
// const data = await client.json("/users")
// ```
function http(options) {
	if (options) {
		return new HTTPClient(options);
	} else {
		return (http.singleton = http.singleton || new HTTPClient());
	}
}

export { Backoff, Cache, HTTPClient, Retry, Throttle };
export default http;

// EOF
