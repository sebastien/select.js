// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-07-16
// Updated: 2026-07-16

// Module: select/utils/storage
// Async key-value stores with optional TTL: in-memory and IndexedDB
// (write-through memory L1).
//
// Example:
// ```javascript
// const mem = store("memory")
// await mem.set("user:1", { value: { id: 1 }, expires: Date.now() + 60_000 })
//
// const idb = store({ store: "indexeddb", db: "select.app" })
// await idb.ready
// await idb.set("cache:posts", { value: posts })
// ```

import { logger } from "./logger.js";

const DEFAULT_DB = "select.storage";
const DEFAULT_STORE = "kv";
const log = logger("select.storage");

function now() {
	return Date.now();
}

function isExpired(entry) {
	return !!(entry && entry.expires !== undefined && entry.expires <= now());
}

// ----------------------------------------------------------------------------
//
// MEMORY STORE
//
// ----------------------------------------------------------------------------

// Class: MemoryStore
// In-memory key-value store. Entries may carry `expires` (ms epoch); expired
// entries are dropped on read.
class MemoryStore {
	constructor() {
		this.entries = new Map();
		this.ready = Promise.resolve();
	}

	async has(key) {
		const entry = this.entries.get(key);
		if (!entry) {
			return false;
		}
		if (isExpired(entry)) {
			this.entries.delete(key);
			return false;
		}
		return true;
	}

	async get(key) {
		if (!(await this.has(key))) {
			return undefined;
		}
		return this.entries.get(key);
	}

	async set(key, entry) {
		this.entries.set(key, entry);
		return entry;
	}

	async keys() {
		const out = [];
		for (const key of this.entries.keys()) {
			if (await this.has(key)) {
				out.push(key);
			}
		}
		return out;
	}

	async delete(key = undefined) {
		if (key === undefined || key === null) {
			this.entries.clear();
			return;
		}
		this.entries.delete(key);
	}

	async clear() {
		this.entries.clear();
	}
}

// ----------------------------------------------------------------------------
//
// INDEXEDDB STORE
//
// ----------------------------------------------------------------------------

// Class: IndexedDBStore
// Persistent key-value store with an in-memory write-through layer.
// - db: string - IndexedDB database name
// - storeName: string - object store name
class IndexedDBStore {
	constructor(options = undefined) {
		this.dbName = options?.db || DEFAULT_DB;
		this.storeName = options?.storeName || DEFAULT_STORE;
		this.memory = new MemoryStore();
		this._db = undefined;
		this.ready = this._open();
	}

	_open(version = undefined) {
		const idb = globalThis.indexedDB;
		if (!idb) {
			return Promise.resolve(undefined);
		}
		return new Promise((resolve, reject) => {
			const request = version === undefined ? idb.open(this.dbName) : idb.open(this.dbName, version);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName, { keyPath: "key" });
				}
			};
			request.onsuccess = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.close();
					this._open(db.version + 1).then(resolve, reject);
					return;
				}
				db.onversionchange = () => db.close();
				this._db = db;
				resolve(db);
			};
			request.onerror = () => reject(request.error);
		}).catch(() => {
			this._db = undefined;
			return undefined;
		});
	}

	_tx(mode) {
		if (!this._db) {
			return undefined;
		}
		return this._db
			.transaction(this.storeName, mode)
			.objectStore(this.storeName);
	}

	_request(request) {
		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async has(key) {
		if (await this.memory.has(key)) {
			return true;
		}
		return !!(await this._read(key));
	}

	async get(key) {
		const cached = await this.memory.get(key);
		if (cached) {
			return cached;
		}
		return this._read(key);
	}

	async _read(key) {
		await this.ready;
		const objectStore = this._tx("readonly");
		if (!objectStore) {
			return undefined;
		}
		const record = await this._request(objectStore.get(key));
		if (!record) {
			return undefined;
		}
		if (isExpired(record)) {
			await this.delete(key);
			return undefined;
		}
		const entry = { ...record };
		delete entry.key;
		await this.memory.set(key, entry);
		return entry;
	}

	async set(key, entry) {
		await this.memory.set(key, entry);
		await this.ready;
		const objectStore = this._tx("readwrite");
		if (!objectStore) {
			return entry;
		}
		try {
			await this._request(objectStore.put({ key, ...entry }));
		} catch (_error) {
			// Non-cloneable values stay in memory only.
		}
		return entry;
	}

	async keys() {
		await this.ready;
		const seen = new Set(await this.memory.keys());
		const objectStore = this._tx("readonly");
		if (objectStore) {
			const idbKeys = await this._request(objectStore.getAllKeys());
			for (let i = 0; i < idbKeys.length; i++) {
				seen.add(idbKeys[i]);
			}
		}
		const out = [];
		for (const key of seen) {
			if (await this.has(key)) {
				out.push(key);
			}
		}
		return out;
	}

	async delete(key = undefined) {
		await this.memory.delete(key);
		await this.ready;
		const objectStore = this._tx("readwrite");
		if (!objectStore) {
			return;
		}
		if (key === undefined || key === null) {
			await this._request(objectStore.clear());
			return;
		}
		await this._request(objectStore.delete(key));
	}

	async clear() {
		await this.delete();
	}
}

// ----------------------------------------------------------------------------
//
// FACTORY
//
// ----------------------------------------------------------------------------

// Function: store
// Returns a store from `options`: `"memory"`, `"indexeddb"`, a config object
// with `store` field, or an existing store instance.
//
// Example:
// ```javascript
// store("memory")
// store("indexeddb")
// store({ store: "indexeddb", db: "my-app", storeName: "cache" })
// store(existingStore)
// ```
function store(options = undefined) {
	if (
		options &&
		typeof options === "object" &&
		typeof options.get === "function"
	) {
		return options;
	}
	const kind =
		typeof options === "string" ? options : options?.store || "memory";
	if (kind === "indexeddb") {
		if (!globalThis.indexedDB) {
			log.warn("indexedDB unavailable; using memory store");
			return new MemoryStore();
		}
		const config = typeof options === "string" ? undefined : options;
		return new IndexedDBStore(config);
	}
	return new MemoryStore();
}

export { IndexedDBStore, MemoryStore, store };

// EOF
