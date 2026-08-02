// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-03

// Module: select/ui/components/reactive
// Reactive data subscriptions, path updates, and init fusion for UIInstance.

import { AppliedUITemplate } from "./model.js"
import {
	runWithUIInstance,
	SLOT_DEFAULT_KEY,
	snapshotReactiveDependencyRevisions,
} from "./runtime.js"

// Sentinel data-key meaning `this.data` itself is the reactive store (not a bag).
const ROOT_STORE_KEY = "$"

// Optional list-path counters for measured collapse work (P4).
// Enable with `globalThis.SELECT_UI_LIST_STATS = true` then read
// `globalThis.SELECT_UI_LIST_STATS_COUNTS`.
const LIST_STAT_KEYS = [
	"pathHit",
	"pathMiss",
	"refresh",
	"appendLocal",
	"removeLocal",
	"trustedAppend",
	"trustedRemove",
	"fullSlotRender",
]

function listStatsEnabled() {
	return globalThis.SELECT_UI_LIST_STATS === true
}

function listStat(key) {
	if (!listStatsEnabled()) {
		return
	}
	let counts = globalThis.SELECT_UI_LIST_STATS_COUNTS
	if (!counts) {
		counts = Object.create(null)
		for (let i = 0; i < LIST_STAT_KEYS.length; i++) {
			counts[LIST_STAT_KEYS[i]] = 0
		}
		globalThis.SELECT_UI_LIST_STATS_COUNTS = counts
	}
	counts[key] = (counts[key] || 0) + 1
}

// Parses a collection index from a path segment (number or numeric string).
function pathIndex(segment) {
	if (typeof segment === "number" && Number.isInteger(segment)) {
		return segment
	}
	if (typeof segment === "string") {
		const n = Number(segment)
		if (Number.isInteger(n) && String(n) === segment) {
			return n
		}
	}
	return NaN
}

// Leaf value for a path key: prefer `treeValue[key]` when treeValue is the
// parent object still carrying that field.
function pathLeafValue(treeValue, key) {
	if (
		treeValue !== null &&
		treeValue !== undefined &&
		typeof treeValue === "object" &&
		!Array.isArray(treeValue) &&
		Object.hasOwn(treeValue, key)
	) {
		return treeValue[key]
	}
	return treeValue
}

// Patches a plain instance data bag without dropping meta keys.
function patchInstanceData(instance, key, leaf) {
	const prev = instance.data
	if (prev && typeof prev === "object" && !Array.isArray(prev)) {
		instance.update({ ...prev, [key]: leaf })
	} else {
		instance.update({ [key]: leaf })
	}
}

function isReactiveData(value) {
	return value?.isReactive === true
}

// View model passed to behaviors/bindings: unwrap root store cells to plain tree.
function renderViewData(data) {
	if (isReactiveData(data)) {
		const value = data.value
		return value === undefined || value === null ? {} : value
	}
	return data ?? {}
}

function normalizeCellNotifyPath(path) {
	if (path === undefined || path === null) {
		return null
	}
	// Cells use an object sentinel for a root write; it is not a path segment.
	if (!Array.isArray(path) && typeof path === "object") {
		return null
	}
	const segments = Array.isArray(path) ? path : [path]
	if (!segments.length) {
		return null
	}
	// pathify("a.b") yields ["a.b"]; split dotted segments for walkers.
	if (segments.length === 1 && typeof segments[0] === "string") {
		const raw = segments[0]
		if (raw.includes(".")) {
			return raw.split(".").map((part) => {
				if (part === "") {
					return part
				}
				const n = Number(part)
				return Number.isInteger(n) && String(n) === part ? n : part
			})
		}
	}
	return segments
}

function firstMappedUIInstance(slot, UIInstance) {
	if (!slot?.mapping) {
		return null
	}
	const direct = slot.mapping.get(SLOT_DEFAULT_KEY)
	if (direct instanceof UIInstance) {
		return direct
	}
	for (const value of slot.mapping.values()) {
		if (value instanceof UIInstance) {
			return value
		}
	}
	return null
}

function cloneNestedWrite(current, path, value) {
	if (!path?.length) {
		return value
	}
	const key = path[0]
	const nextCurrent = current?.[key]
	const nextValue = cloneNestedWrite(nextCurrent, path.slice(1), value)
	const base = Array.isArray(current)
		? current.slice()
		: current && typeof current === "object"
			? { ...current }
			: typeof key === "number"
				? []
				: {}
	base[key] = nextValue
	return base
}

// Function: attachReactive
// Installs reactive static and prototype methods on `UIInstance`.
function attachReactive(UIInstance) {
	Object.assign(UIInstance, {
		_setReactiveValue(target, value, path) {
			if (UIInstance._isReadOnlyDerivation(target)) {
				return;
			}
			if (Array.isArray(path)) {
				target.set(value, path);
			} else {
				target.set(value);
			}
		},

		
		_isReadOnlyDerivation(value) {
			return (
				value?.isDerivation === true && typeof value._updater !== "function"
			);
		},

		
		_writeDataPath(self, targetPath, value) {
			if (!targetPath?.length || targetPath[0] === "#") {
				return;
			}
			const rootOffset = targetPath[0] === "." ? 1 : 0;
			if (rootOffset >= targetPath.length) {
				return;
			}
			const rootKey = targetPath[rootOffset];
			const tailPath =
				rootOffset + 1 < targetPath.length
					? targetPath.slice(rootOffset + 1)
					: null;
			const data = self.data || {};
			const target = data[rootKey];
			if (target?.isReactive) {
				UIInstance._setReactiveValue(target, value, tailPath);
				return;
			}
			if (!tailPath?.length) {
				self.update({ [rootKey]: value });
				return;
			}
			self.update({ [rootKey]: cloneNestedWrite(target, tailPath, value) });
		},

		
		_releaseReactiveRef(cell) {
			if (cell?.isReactive && typeof cell.release === "function") {
				cell.release();
			}
		},

		
		_acquireReactiveRef(cell) {
			if (cell?.isReactive && typeof cell.acquire === "function") {
				cell.acquire();
			}
		},

		// NOTE: Top-level reactives created in `init()` remain the mounted state.
		// Later plain values write through them without detaching an existing fusion,
		// while later reactive values are fused to them until the incoming reactive
		// reference changes.
		_mergeReactiveTopLevel(self, base, incoming) {
			if (!incoming || typeof incoming !== "object") {
				return incoming;
			}
			const merged =
				base && typeof base === "object" ? Object.assign({}, base) : {};
			for (const key in incoming) {
				const next = incoming[key];
				const current = merged[key];
				// Derived init state is an output, not a writable input slot. Keeping it
				// authoritative prevents an incoming prop from writing into it.
				if (UIInstance._isReadOnlyDerivation(current)) {
					self?._clearReactiveTopLevelFusion(key);
					merged[key] = current;
					continue;
				}
				if (current?.isReactive && next?.isReactive) {
					self?._fuseReactiveTopLevel(key, current, next);
					merged[key] = current;
				} else if (current?.isReactive && !next?.isReactive) {
					// Plain updates target the stable internal cell. If that cell is
					// currently fused to an upstream reactive, the write propagates
					// through the fusion instead of breaking it.
					current.set(next);
					merged[key] = current;
				} else {
					self?._clearReactiveTopLevelFusion(key);
					merged[key] = next;
				}
			}
			return merged;
		},

		// Entry ref currently shown at list index `i`. Prefers the live mapped
		// instance data over `_listItems` wrappers, which can go stale after a
		// path-directed leaf update that never rewrote the AppliedUITemplate bag.
		_listEntryValueAt(slot, index) {
			const key = slot._listKeys?.[index] ?? index;
			let mapped = slot.mapping?.get(key);
			if (mapped === undefined && typeof key === "number") {
				mapped = slot.mapping?.get(String(key));
			} else if (mapped === undefined && typeof key === "string") {
				const asNum = Number(key);
				if (Number.isInteger(asNum) && String(asNum) === key) {
					mapped = slot.mapping?.get(asNum);
				}
			}
			const live = mapped?.data;
			if (live && typeof live === "object" && "value" in live) {
				return live.value;
			}
			const item = slot._listItems?.[index];
			if (
				item &&
				typeof item === "object" &&
				item.data &&
				typeof item.data === "object" &&
				"value" in item.data
			) {
				return item.data.value;
			}
			return item;
		},

		// Derive a trusted list mutation hint from slot tracking + new array refs.
		// Only returns a hint when Object.is proves identity-preserving append/remove
		// (e.g. after surgical cell shrink). Otherwise undefined → full eq detect.
		_listMutationHint(slot, nextArray) {
			if (!slot || !Array.isArray(nextArray)) {
				return undefined;
			}
			const prevLen = slot._listLength || 0;
			const nextLen = nextArray.length;
			if (!slot._listItems || prevLen === 0) {
				return undefined;
			}
			if (nextLen === prevLen + 1) {
				for (let i = 0; i < prevLen; i++) {
					if (!Object.is(nextArray[i], UIInstance._listEntryValueAt(slot, i))) {
						return undefined;
					}
				}
				return { op: "append" };
			}
			if (nextLen === prevLen - 1) {
				let removeAt = nextLen;
				for (let i = 0; i < nextLen; i++) {
					if (!Object.is(nextArray[i], UIInstance._listEntryValueAt(slot, i))) {
						removeAt = i;
						break;
					}
				}
				for (let i = removeAt; i < nextLen; i++) {
					if (
						!Object.is(
							nextArray[i],
							UIInstance._listEntryValueAt(slot, i + 1),
						)
					) {
						return undefined;
					}
				}
				return { op: "remove", at: removeAt };
			}
			return undefined;
		}
	})

	Object.assign(UIInstance.prototype, {
		_collectReactiveDataRefs(data) {
			if (isReactiveData(data)) {
				const refs = new Map();
				refs.set(data, new Set([ROOT_STORE_KEY]));
				return refs;
			}
			let refs = null;
			if (data && typeof data === "object") {
				for (const k in data) {
					const v = data[k];
					if (v?.isReactive) {
						refs = refs ?? new Map();
						if (refs.has(v)) {
							refs.get(v).add(k);
						} else {
							refs.set(v, new Set([k]));
						}
					}
				}
			}
			return refs;
		},

		
		_acquireReactiveRef(cell) {
			if (!cell?.isReactive || typeof cell.acquire !== "function") {
				return;
			}
			this._reactiveDataRefs = this._reactiveDataRefs ?? new Set();
			if (!this._reactiveDataRefs.has(cell)) {
				cell.acquire();
				this._reactiveDataRefs.add(cell);
			}
		},

		
		_releaseReactiveRef(cell) {
			if (!cell?.isReactive || typeof cell.release !== "function") {
				return;
			}
			if (this._reactiveDataRefs?.has(cell)) {
				cell.release();
				this._reactiveDataRefs.delete(cell);
			}
		},

		
		_syncOwnedReactiveRefs(data) {
			const refs = this._collectReactiveDataRefs(data);
			if (!refs) {
				return;
			}
			if (this._ownedReactiveRefs === undefined) {
				this._ownedReactiveRefs = new Set();
			}
			for (const cell of refs.keys()) {
				this._ownedReactiveRefs.add(cell);
			}
		},

		
		_releaseOwnedReactiveRefs() {
			if (!this._ownedReactiveRefs) {
				return;
			}
			for (const cell of this._ownedReactiveRefs) {
				if (cell?.isReactive && typeof cell.release === "function") {
					cell.release();
				}
			}
			this._ownedReactiveRefs.clear();
			this._ownedReactiveRefs = undefined;
		},

		syncReactiveDataSubs(data) {
			const refs = this._collectReactiveDataRefs(data);
			if (!refs && !this._reactiveDataSubs) {
				return;
			}
			if (this._reactiveDataSubs === undefined) {
				this._reactiveDataSubs = new Map();
			}
			for (const [cell, meta] of this._reactiveDataSubs.entries()) {
				if (!refs?.has(cell)) {
					cell.unsub(meta.handler);
					this._releaseReactiveRef(cell);
					this._reactiveDataSubs.delete(cell);
				}
			}
			if (!refs) {
				return;
			}
			for (const [cell, keys] of refs.entries()) {
				const existing = this._reactiveDataSubs.get(cell);
				if (existing) {
					existing.keys = keys;
				} else {
					const meta = { keys, handler: null };
					// Path-aware: nested cell writes try a directed slot walk before
					// scheduling a full granular render of the hosting data keys.
					const handler = (_value, path) => {
						const normalized = normalizeCellNotifyPath(path);
						if (normalized && normalized.length === 1) {
							const k = normalized[0];
							if (this._tryDirectOutUpdate(k, _value)) {
								return;
							}
						}
						if (
							normalized &&
							this._tryApplyReactivePath(cell, normalized, meta.keys)
						) {
							return;
						}
					// Path miss: prefer a granular re-render when we know which
					// top-level tree key changed. Root store replaces (no path) and
					// index-only paths still need a full render.
					if (!normalized) {
						this._scheduleRender(null);
					} else if (meta.keys?.has(ROOT_STORE_KEY)) {
						if (typeof normalized[0] === "string") {
							this._scheduleRender(new Set([normalized[0]]));
						} else {
							this._scheduleRender(null);
						}
					} else {
						this._scheduleRender(meta.keys);
					}
					};
					meta.handler = handler;
					cell.sub(handler);
					this._acquireReactiveRef(cell);
					this._reactiveDataSubs.set(cell, meta);
				}
			}
		},

		
		// Walks mounted list/dict slots along `path` (relative to `cell.value`) and
		// updates only the affected child instance. Returns false to fall back to
		// a normal scheduled render.
		_tryApplyReactivePath(cell, path, dataKeys) {
			if (this._isDisposed || !path?.length || !dataKeys?.size) {
				return false;
			}
			const tree = cell?.value;
			if (tree === undefined || tree === null) {
				return false;
			}
			const slotKeys = this._slotKeysForDataKeys(dataKeys);
			if (!slotKeys.length) {
				return false;
			}
			for (let i = 0; i < slotKeys.length; i++) {
				const slots = this.out?.[slotKeys[i]];
				if (!slots) {
					continue;
				}
				for (let s = 0; s < slots.length; s++) {
					if (this._applyReactivePathToSlot(slots[s], path, tree)) {
						listStat("pathHit");
						return true;
					}
				}
			}
			listStat("pathMiss");
			return false;
		},

		
		_slotKeysForDataKeys(dataKeys) {
			const slotKeys = [];
			const seen = new Set();
			const add = (key) => {
				if (!key || seen.has(key) || !this.out?.[key]) {
					return;
				}
				seen.add(key);
				slotKeys.push(key);
			};
			// Root store host: any out slot may project the tree (typically `items`).
			if (dataKeys.has(ROOT_STORE_KEY)) {
				if (this.out) {
					for (const key in this.out) {
						add(key);
					}
				}
				return slotKeys;
			}
			if (this._behaviorDeps) {
				for (const [slotKey, deps] of this._behaviorDeps.entries()) {
					if (!deps) {
						continue;
					}
					for (const dataKey of dataKeys) {
						if (deps.has(dataKey)) {
							add(slotKey);
							break;
						}
					}
				}
			}
			for (const dataKey of dataKeys) {
				add(dataKey);
			}
			// Collection projected under a different out name than the data host key
			// (e.g. bag field `value` → behavior/out `items`).
			if (!seen.has("items") && this.out?.items) {
				for (const dataKey of dataKeys) {
					if (
						dataKey === "value" ||
						dataKey === "items" ||
						dataKey === "data" ||
						this._behaviorDeps?.get("items")?.has(dataKey)
					) {
						add("items");
						break;
					}
				}
			}
			return slotKeys;
		},

		
		_findOutSlotKey(instance, slot) {
			if (!instance?.out) {
				return null;
			}
			for (const key in instance.out) {
				const group = instance.out[key];
				if (!group) {
					continue;
				}
				for (let i = 0; i < group.length; i++) {
					if (group[i] === slot) {
						return key;
					}
				}
			}
			return null;
		},

		
		// Re-runs the collection behavior and renders into `slot` so list fast-paths
		// can append/remove without a full ancestor render. Used when a path segment
		// is missing from the mapping (new index/key) or a key was deleted.
		// `treeAtSlot` is the current collection value from the store (parent.data may
		// still hold a stale plain snapshot until a full render runs).
		// `hint` may be `{ op: "append" }` or `{ op: "remove", at }` when the path
		// notify already proved the structural mutation (skip full-list eq scans).
		_refreshCollectionSlot(slot, treeAtSlot = undefined, hint = undefined) {
			const parent = slot?.parent;
			if (!(parent instanceof UIInstance) || parent._isDisposed) {
				return false;
			}
			const slotKey = this._findOutSlotKey(parent, slot);
			if (!slotKey) {
				return false;
			}
			const behavior = parent.template?.behavior?.[slotKey];
			if (typeof behavior !== "function") {
				return false;
			}
			listStat("refresh");
			let behaviorData = parent.data;
			// Root store: data is the cell; value is already current after reconcile.
			// Bag host: inject treeAtSlot into the collection host field for a fresh view.
			if (
				!isReactiveData(behaviorData) &&
				treeAtSlot !== undefined &&
				behaviorData &&
				typeof behaviorData === "object" &&
				!Array.isArray(behaviorData)
			) {
				const hostKey = this._collectionHostKey(behaviorData, slotKey);
				if (hostKey) {
					behaviorData = { ...behaviorData, [hostKey]: treeAtSlot };
					parent.data = behaviorData;
				}
			} else if (!behaviorData) {
				behaviorData = {};
			}
			const removeAt =
				hint?.op === "remove"
					? typeof hint.at === "number"
						? hint.at
						: (slot._listLength || 1) - 1
					: undefined;
			// Path-proven structural mutations: reuse row wrappers without remap.
			if (
				hint?.op === "append" &&
				Array.isArray(treeAtSlot) &&
				typeof slot._renderTrustedAppend === "function"
			) {
				if (this._renderCollectionAppendLocal(slot, treeAtSlot)) {
					listStat("appendLocal");
					return true;
				}
			} else if (
				hint?.op === "remove" &&
				Array.isArray(treeAtSlot) &&
				typeof slot._renderTrustedRemoveAt === "function"
			) {
				if (this._renderCollectionRemoveLocal(slot, treeAtSlot, removeAt)) {
					listStat("removeLocal");
					return true;
				}
			}
			// Behaviors receive the same view shape as render() (unwrap root store).
			const viewData = renderViewData(behaviorData);
			const rendered = runWithUIInstance(parent, () =>
				behavior(parent, viewData, null),
			);
			if (parent._behaviorValues) {
				parent._behaviorValues.set(slotKey, rendered);
			}
			// Keep dep revisions in sync so later granular skips stay valid.
			if (parent._behaviorDeps?.has(slotKey) && parent._behaviorDepRevisions) {
				parent._behaviorDepRevisions.set(
					slotKey,
					snapshotReactiveDependencyRevisions(
						viewData,
						parent._behaviorDeps.get(slotKey),
					),
				);
			}
			// Path-proven structural mutations: skip full-list deep-eq detection.
			if (
				hint?.op === "append" &&
				typeof slot._renderTrustedAppend === "function" &&
				slot._renderTrustedAppend(rendered)
			) {
				listStat("trustedAppend");
				return true;
			}
			if (
				hint?.op === "remove" &&
				typeof slot._renderTrustedRemoveAt === "function" &&
				slot._renderTrustedRemoveAt(rendered, removeAt)
			) {
				listStat("trustedRemove");
				return true;
			}
			listStat("fullSlotRender");
			slot.render(rendered);
			return true;
		},

		// Host field on a plain data bag that holds the collection for `slotKey`.
		_collectionHostKey(data, slotKey) {
			if (!data || typeof data !== "object") {
				return null;
			}
			if (slotKey && Object.hasOwn(data, slotKey)) {
				return slotKey;
			}
			if (Object.hasOwn(data, "value")) {
				return "value";
			}
			if (Object.hasOwn(data, "items")) {
				return "items";
			}
			if (Object.hasOwn(data, "data")) {
				return "data";
			}
			return null;
		},

		
		// True when row bags hold the raw collection element in `.value` (inspector
		// pattern). False when a processor reshapes entries (e.g. `{ id, value }`).
		// Uses live mapped instance data when available (wrappers can be stale).
		_collectionRowUsesRawEntry(slot, treeAtSlot) {
			const sample = slot._listItems?.[0];
			if (!(sample instanceof AppliedUITemplate)) {
				return false;
			}
			const data = sample.data;
			if (!data || typeof data !== "object" || !("value" in data)) {
				return false;
			}
			// Match any current element by identity against live or wrapper entry refs.
			const n = Math.min(slot._listLength || 0, treeAtSlot.length);
			for (let i = 0; i < n; i++) {
				const entry = UIInstance._listEntryValueAt(slot, i);
				for (let j = 0; j < treeAtSlot.length; j++) {
					if (Object.is(entry, treeAtSlot[j])) {
						return true;
					}
				}
			}
			// Fallback: wrapper sample only (first paint / no mapping yet).
			for (let i = 0; i < treeAtSlot.length; i++) {
				if (Object.is(data.value, treeAtSlot[i])) {
					return true;
				}
			}
			return false;
		},

		
		// Append one row without re-running the collection behavior over all items.
		// Only for raw-entry row shapes; reshaping processors fall back to behavior.
		_renderCollectionAppendLocal(slot, treeAtSlot) {
			const prevLen = slot._listLength || 0;
			if (
				!Array.isArray(treeAtSlot) ||
				treeAtSlot.length !== prevLen + 1 ||
				!slot._listItems?.length ||
				!this._collectionRowUsesRawEntry(slot, treeAtSlot)
			) {
				return false;
			}
			const sample = slot._listItems[0];
			const entry = treeAtSlot[prevLen];
			// Prefer live instance bag so presentation fields stay current.
			const key0 = slot._listKeys?.[0] ?? 0;
			const live0 = slot.mapping?.get(key0);
			const sampleData =
				live0?.data && typeof live0.data === "object"
					? live0.data
					: sample.data;
			const rowData = {
				...sampleData,
				key: `#${prevLen}`,
				value: entry,
			};
			if ("$key" in sampleData) {
				rowData.$key = prevLen;
			}
			const row = sample.template.apply(rowData);
			const next = new Array(prevLen + 1);
			for (let i = 0; i < prevLen; i++) {
				const item = slot._listItems[i];
				// Refresh wrapper value from live instance so trusted sync sees
				// store-stable refs after prior path leaf updates.
				if (item instanceof AppliedUITemplate && item.data) {
					const liveVal = UIInstance._listEntryValueAt(slot, i);
					if (
						item.data &&
						typeof item.data === "object" &&
						"value" in item.data &&
						!Object.is(item.data.value, liveVal)
					) {
						item.data = { ...item.data, value: liveVal };
					}
				}
				next[i] = item;
			}
			next[prevLen] = row;
			return slot._renderTrustedAppend(next);
		},

		
		// Remove one row without re-running the collection behavior over all items.
		// Safe when wrappers already hold the kept element refs (identity shrink).
		_renderCollectionRemoveLocal(slot, treeAtSlot, removeAt) {
			const prevLen = slot._listLength || 0;
			const prevItems = slot._listItems;
			if (
				!Array.isArray(treeAtSlot) ||
				!prevItems ||
				treeAtSlot.length !== prevLen - 1 ||
				removeAt < 0 ||
				removeAt > treeAtSlot.length ||
				!this._collectionRowUsesRawEntry(slot, treeAtSlot)
			) {
				return false;
			}
			const next = new Array(treeAtSlot.length);
			for (let i = 0, j = 0; i < prevLen; i++) {
				if (i === removeAt) {
					continue;
				}
				const item = prevItems[i];
				const liveVal = UIInstance._listEntryValueAt(slot, i);
				// Kept row must still point at the element now at index j.
				if (!Object.is(liveVal, treeAtSlot[j])) {
					return false;
				}
				if (item instanceof AppliedUITemplate && item.data && typeof item.data === "object") {
					const data = item.data;
					const shifted = { ...data, value: liveVal };
					if ("key" in data || "$key" in data) {
						shifted.key = `#${j}`;
						if ("$key" in data) {
							shifted.$key = j;
						}
					}
					item.data = shifted;
				}
				next[j] = item;
				j++;
			}
			return slot._renderTrustedRemoveAt(next, removeAt);
		},

		_mappingGet(slot, key) {
			let child = slot.mapping.get(key);
			if (child === undefined && typeof key === "string") {
				const asNum = Number(key);
				if (Number.isInteger(asNum) && String(asNum) === key) {
					child = slot.mapping.get(asNum);
				}
			} else if (child === undefined && typeof key === "number") {
				child = slot.mapping.get(String(key));
			}
			return child;
		},

		_applyReactivePathToSlot(slot, path, treeAtSlot) {
			if (!slot?.mapping || !path?.length) {
				return false;
			}
			const head = path[0];
			const child = this._mappingGet(slot, head);
			// Missing entry: append index, new dict key, or deleted key — refresh
			// this collection via its behavior (list fast-paths handle DOM).
			if (!(child instanceof UIInstance)) {
				if (path.length === 1) {
					let hint;
					if (Array.isArray(treeAtSlot)) {
						const prevLen = slot._listLength || 0;
						const headIndex = pathIndex(head);
						if (
							Number.isInteger(headIndex) &&
							headIndex === prevLen &&
							treeAtSlot.length === prevLen + 1
						) {
							hint = { op: "append" };
						}
					}
					return this._refreshCollectionSlot(slot, treeAtSlot, hint);
				}
				return false;
			}
			const entryValue = Array.isArray(treeAtSlot)
				? treeAtSlot[head]
				: treeAtSlot != null
					? treeAtSlot[head]
					: undefined;
			const rest = path.slice(1);
			// Keep row bag `.value` aligned with the store entry. Nested leaf path
			// updates may replace the entry object without rewriting the parent
			// AppliedUITemplate/instance bag; stale refs break append/remove identity.
			if (
				rest.length > 0 &&
				child.data &&
				typeof child.data === "object" &&
				!Array.isArray(child.data) &&
				Object.hasOwn(child.data, "value") &&
				!Object.is(child.data.value, entryValue)
			) {
				child.data = { ...child.data, value: entryValue };
				const idx = pathIndex(head);
				const wrap = Number.isInteger(idx)
					? slot._listItems?.[idx]
					: undefined;
				if (
					wrap instanceof AppliedUITemplate &&
					wrap.data &&
					typeof wrap.data === "object" &&
					Object.hasOwn(wrap.data, "value")
				) {
					wrap.data = { ...wrap.data, value: entryValue };
				}
			}
			// Entry removed from collection while mapping still has the child.
			if (
				rest.length === 0 &&
				entryValue === undefined &&
				!(
					treeAtSlot &&
					typeof treeAtSlot === "object" &&
					Object.hasOwn(treeAtSlot, head)
				)
			) {
				let hint;
				if (Array.isArray(treeAtSlot)) {
					const prevLen = slot._listLength || 0;
					const headIndex = pathIndex(head);
					if (
						Number.isInteger(headIndex) &&
						treeAtSlot.length === prevLen - 1 &&
						headIndex >= 0 &&
						headIndex <= treeAtSlot.length
					) {
						hint = { op: "remove", at: headIndex };
					}
				}
				return this._refreshCollectionSlot(slot, treeAtSlot, hint);
			}
			const valueSlots = child.out?.value;
			if (valueSlots?.length) {
				// Same-shape collection replace (array→array / dict→dict): refresh the
				// nested items slot so list fast-paths run. Type changes fall through
				// to child.update so the nested inspector template can switch.
				if (rest.length === 0) {
					const entryIsArray = Array.isArray(entryValue);
					const entryIsDict =
						!entryIsArray &&
						entryValue !== null &&
						typeof entryValue === "object" &&
						Object.getPrototypeOf(entryValue) === Object.prototype;
					if (entryIsArray || entryIsDict) {
						for (let i = 0; i < valueSlots.length; i++) {
							const nested = firstMappedUIInstance(valueSlots[i], UIInstance);
							if (!nested?.out?.items?.length) {
								continue;
							}
							const prevNested = nested.data?.value;
							const sameShape =
								(entryIsArray && Array.isArray(prevNested)) ||
								(entryIsDict &&
									prevNested !== null &&
									typeof prevNested === "object" &&
									!Array.isArray(prevNested) &&
									Object.getPrototypeOf(prevNested) === Object.prototype);
							if (!sameShape) {
								continue;
							}
							const prev = child.data;
							if (prev && typeof prev === "object" && !Array.isArray(prev)) {
								child.data = { ...prev, value: entryValue };
							}
							if (nested.data && typeof nested.data === "object") {
								nested.data = { ...nested.data, value: entryValue };
							}
							for (let j = 0; j < nested.out.items.length; j++) {
								const itemsSlot = nested.out.items[j];
								const hint = entryIsArray
									? UIInstance._listMutationHint(itemsSlot, entryValue)
									: undefined;
								if (this._refreshCollectionSlot(itemsSlot, entryValue, hint)) {
									return true;
								}
							}
						}
					}
					// Type change or non-collection value replace at this entry.
					const prev = child.data;
					if (prev && typeof prev === "object" && !Array.isArray(prev)) {
						child.update({ ...prev, value: entryValue });
					} else {
						child.update({ value: entryValue });
					}
					return true;
				}
				for (let i = 0; i < valueSlots.length; i++) {
					const nested = firstMappedUIInstance(valueSlots[i], UIInstance);
					if (
						nested &&
						this._applyReactivePathToInstance(nested, rest, entryValue)
					) {
						return true;
					}
				}
				// Nested inspector missing/replaced (e.g. type change): refresh value.
				const prev = child.data;
				if (prev && typeof prev === "object" && !Array.isArray(prev)) {
					child.update({ ...prev, value: entryValue });
				} else {
					child.update({ value: entryValue });
				}
				return true;
			}
			return this._applyReactivePathToInstance(child, rest, entryValue);
		},

		
		_applyReactivePathToInstance(instance, path, treeValue) {
			if (!(instance instanceof UIInstance) || instance._isDisposed) {
				return false;
			}
			if (!path?.length) {
				const prev = instance.data;
				if (prev && typeof prev === "object" && !Array.isArray(prev)) {
					// Prefer a single content field; fall back to full replace.
					const keys = [];
					for (const k in prev) {
						if (k === "$key" || k === "key") {
							continue;
						}
						keys.push(k);
					}
					if (keys.length === 1) {
						instance.update({ ...prev, [keys[0]]: treeValue });
					} else if ("value" in prev) {
						instance.update({ ...prev, value: treeValue });
					} else if (keys.length > 0 && typeof treeValue === "object" && treeValue) {
						instance.update({ ...prev, ...treeValue });
					} else {
						instance.update(treeValue);
					}
				} else {
					instance.update(treeValue);
				}
				return true;
			}
			const head = path[0];
			const prev = instance.data;
			// Direct field on the row bag (e.g. path ["value"] with { id, value, $key }).
			if (
				path.length === 1 &&
				prev &&
				typeof prev === "object" &&
				!Array.isArray(prev) &&
				Object.hasOwn(prev, head) &&
				head !== "$key" &&
				head !== "key"
			) {
				patchInstanceData(instance, head, pathLeafValue(treeValue, head));
				return true;
			}
			// Store entry mirrored under `.value` (remap/inspector row shape).
			if (
				path.length === 1 &&
				prev &&
				typeof prev === "object" &&
				!Array.isArray(prev) &&
				Object.hasOwn(prev, "value") &&
				prev.value &&
				typeof prev.value === "object" &&
				!Array.isArray(prev.value) &&
				Object.hasOwn(prev.value, head)
			) {
				const leaf = pathLeafValue(treeValue, head);
				instance.update({
					...prev,
					value: { ...prev.value, [head]: leaf },
				});
				return true;
			}
			// Path head names an out slot or behavior on this instance.
			if (
				path.length === 1 &&
				(instance.out?.[head] || instance.template?.behavior?.[head])
			) {
				patchInstanceData(instance, head, pathLeafValue(treeValue, head));
				return true;
			}
			const itemsSlots = instance.out?.items;
			if (itemsSlots?.length) {
				for (let i = 0; i < itemsSlots.length; i++) {
					if (this._applyReactivePathToSlot(itemsSlots[i], path, treeValue)) {
						return true;
					}
				}
			}
			// Nested component out slots (skip plain scalar presentation slots).
			if (instance.out) {
				for (const slotKey in instance.out) {
					if (slotKey === "items") {
						continue;
					}
					const slots = instance.out[slotKey];
					for (let i = 0; i < slots.length; i++) {
						const nested = firstMappedUIInstance(slots[i], UIInstance);
						if (
							nested &&
							this._applyReactivePathToInstance(nested, path, treeValue)
						) {
							return true;
						}
					}
				}
			}
			return false;
		},

		
		_clearReactiveDataSubs() {
			if (!this._reactiveDataSubs) {
				return;
			}
			for (const [cell, meta] of this._reactiveDataSubs.entries()) {
				cell.unsub(meta.handler);
				this._releaseReactiveRef(cell);
			}
			this._reactiveDataSubs.clear();
			if (this._reactiveDataRefs) {
				this._reactiveDataRefs.clear();
			}
		},

		
		_getReactiveTopLevelFusion(key) {
			return this._reactiveTopLevelFusions?.get(key);
		},

		
		_clearReactiveTopLevelFusion(key) {
			if (!this._reactiveTopLevelFusions?.has(key)) {
				return;
			}
			const fusion = this._reactiveTopLevelFusions.get(key);
			fusion.active = false;
			fusion.internal.unsub(fusion.internalHandler);
			fusion.upstream.unsub(fusion.upstreamHandler);
			UIInstance._releaseReactiveRef(fusion.upstream);
			this._reactiveTopLevelFusions.delete(key);
			if (this._reactiveTopLevelFusions.size === 0) {
				this._reactiveTopLevelFusions = undefined;
			}
		},

		
		_clearReactiveTopLevelFusions() {
			if (!this._reactiveTopLevelFusions) {
				return;
			}
			for (const key of this._reactiveTopLevelFusions.keys()) {
				this._clearReactiveTopLevelFusion(key);
			}
		},

		
		_fuseReactiveTopLevel(key, internal, upstream) {
			if (!internal?.isReactive || !upstream?.isReactive) {
				return internal;
			}
			if (internal === upstream) {
				this._clearReactiveTopLevelFusion(key);
				return internal;
			}
			const existing = this._getReactiveTopLevelFusion(key);
			if (existing?.internal === internal && existing.upstream === upstream) {
				return internal;
			}
			this._clearReactiveTopLevelFusion(key);
			UIInstance._setReactiveValue(internal, upstream.value);
			UIInstance._acquireReactiveRef(upstream);
			const fusion = {
				active: true,
				internal,
				upstream,
				internalDepth: 0,
				upstreamDepth: 0,
				internalHandler: undefined,
				upstreamHandler: undefined,
			};
			fusion.internalHandler = (value, path) => {
				if (!fusion.active || fusion.upstreamDepth > 0) {
					return;
				}
				// Internal writes stay authoritative for instance state and forward to
				// the current upstream reactive while this fusion remains active.
				fusion.internalDepth += 1;
				try {
					UIInstance._setReactiveValue(upstream, value, path);
				} finally {
					fusion.internalDepth -= 1;
				}
			};
			fusion.upstreamHandler = (value, path) => {
				if (!fusion.active || fusion.internalDepth > 0) {
					return;
				}
				// Upstream writes continue to refresh the stable internal cell until a
				// different upstream reactive replaces this fusion.
				fusion.upstreamDepth += 1;
				try {
					UIInstance._setReactiveValue(internal, value, path);
				} finally {
					fusion.upstreamDepth -= 1;
				}
			};
			internal.sub(fusion.internalHandler);
			upstream.sub(fusion.upstreamHandler);
			this._reactiveTopLevelFusions = this._reactiveTopLevelFusions ?? new Map();
			this._reactiveTopLevelFusions.set(key, fusion);
			return internal;
		}
	})
}

export {
	attachReactive,
	cloneNestedWrite,
	isReactiveData,
	normalizeCellNotifyPath,
	renderViewData,
	ROOT_STORE_KEY,
}

// EOF
