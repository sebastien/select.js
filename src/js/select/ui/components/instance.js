// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-18

// Module: select/ui/components/instance
// Mounted UI template instances, lifecycle, events, and rendering.

import { asText, eq } from "../../utils.js";
import { log, TemplateParser } from "../templates.js";

import { AppliedUITemplate, UIEvent } from "./model.js";
import { options } from "./registry.js";
import {
	applyNamedProcessors,
	createTrackingProxy,
	finalizeRenderProcessorValue,
	formatBindingSource,
	getInputBindingProperty,
	getInputEventValue,
	hasTrackedNonReactiveObjectDeps,
	isThenable,
	resolveBindingValue,
	resolveExpandedSourceValue,
	resolveRenderableValue,
	resolveSourceValue,
	resolveTemplateTokens,
	SKIP_INPUT_UPDATE,
	SLOT_DEFAULT_KEY,
	scheduleRenderTask,
	setNodeText,
	snapshotReactiveDependencyRevisions,
} from "./runtime.js";
import { setUIInstanceClass, UIContentSlot, UITemplateSlot } from "./slots.js";

function normalizeCellNotifyPath(path) {
	if (path === undefined || path === null) {
		return null;
	}
	// Cells use an object sentinel for a root write; it is not a path segment.
	if (!Array.isArray(path) && typeof path === "object") {
		return null;
	}
	const segments = Array.isArray(path) ? path : [path];
	if (!segments.length) {
		return null;
	}
	// pathify("a.b") yields ["a.b"]; split dotted segments for walkers.
	if (segments.length === 1 && typeof segments[0] === "string") {
		const raw = segments[0];
		if (raw.includes(".")) {
			return raw.split(".").map((part) => {
				if (part === "") {
					return part;
				}
				const n = Number(part);
				return Number.isInteger(n) && String(n) === part ? n : part;
			});
		}
	}
	return segments;
}

function firstMappedUIInstance(slot) {
	if (!slot?.mapping) {
		return null;
	}
	const direct = slot.mapping.get(SLOT_DEFAULT_KEY);
	if (direct instanceof UIInstance) {
		return direct;
	}
	for (const value of slot.mapping.values()) {
		if (value instanceof UIInstance) {
			return value;
		}
	}
	return null;
}

const UI_INSTANCES = new Map();
const UI_PARENT_ATTRIBUTE = "ui-parent";
// Sentinel data-key meaning `this.data` itself is the reactive store (not a bag).
const ROOT_STORE_KEY = "$";
let uiInstanceId = 0;

function isReactiveData(value) {
	return value?.isReactive === true;
}

// Event handlers may return a plain data bag to patch instance state. Other
// objects, including UIEvent and UIInstance values, are control-flow results.
function isEventStatePatch(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function applyEventResult(instance, result) {
	if (isThenable(result)) {
		result.then(
			(value) => {
				if (!instance._isDisposed && isEventStatePatch(value)) {
					instance.update(value);
				}
			},
			() => undefined,
		);
	} else if (isEventStatePatch(result)) {
		instance.update(result);
	}
}

// View model passed to behaviors/bindings: unwrap root store cells to plain tree.
function renderViewData(data) {
	if (isReactiveData(data)) {
		const value = data.value;
		return value === undefined || value === null ? {} : value;
	}
	return data ?? {};
}

function createUIInstanceId() {
	uiInstanceId += 1;
	return `ui-${uiInstanceId}`;
}

function getUIInstance(id) {
	if (typeof id !== "string") {
		return undefined;
	}
	const key = id.trim();
	return key ? UI_INSTANCES.get(key) : undefined;
}

function registerUIInstance(instance) {
	if (!instance?.id) {
		return instance;
	}
	const current = UI_INSTANCES.get(instance.id);
	if (current && current !== instance) {
		log.warn("UIInstance: duplicate instance id, overriding registry entry", {
			id: instance.id,
			current,
			incoming: instance,
		});
	}
	UI_INSTANCES.set(instance.id, instance);
	return instance;
}

function unregisterUIInstance(instance) {
	if (!instance?.id) {
		return instance;
	}
	if (UI_INSTANCES.get(instance.id) === instance) {
		UI_INSTANCES.delete(instance.id);
	}
	return instance;
}

function cloneNestedWrite(current, path, value) {
	if (!path?.length) {
		return value;
	}
	const key = path[0];
	const nextCurrent = current?.[key];
	const nextValue = cloneNestedWrite(nextCurrent, path.slice(1), value);
	const base = Array.isArray(current)
		? current.slice()
		: current && typeof current === "object"
			? { ...current }
			: typeof key === "number"
				? []
				: {};
	base[key] = nextValue;
	return base;
}

// Class: UIInstance
// A mounted instance of a UITemplate. Manages data binding, event handling,
// lifecycle, and rendering.
//
// Attributes:
// - `template`: UITemplate - the template this instance was created from
// - `nodes`: Array<Node> - cloned DOM nodes
// - `in`: Object? - input slot bindings
// - `out`: Object? - output slot bindings
// - `inout`: Object? - bidirectional slot bindings
// - `ref`: Object? - reference slot bindings (single slots)
// - `_on`: Object? - event slot bindings
// - `when`: Object? - conditional slot bindings
// - `outAttr`: Object? - attribute slot bindings
// - `slots`: Array<UIContentSlot>? - named content slots
// - `parent`: UIInstance? - parent component in tree
// - `children`: Set<UIInstance>? - child components
// - `data`: any - current rendered data
// - `key`: any - optional key for list rendering
// - `initial`: Object? - initial state from initializer. Top-level reactives
//   returned here stay stable by identity for the lifetime of the instance.
//   Plain incoming values write through them, while incoming reactives are
//   fused to them until the incoming reactive reference changes.
// - `_renderer`: function? - cached render function for subscriptions
// - `_context`: Map? - provider context values
// - `_ctxSubs`: Map? - context cell subscriptions
// - `_runtimeSubs`: Map? - runtime event subscriptions
// - `_behaviorDeps`: Map? - behavior dependency tracking
// - `_behaviorValues`: Map? - cached behavior results
class UIInstance {
	static _resolvePathNode(nodes, rootIndex, tailPath) {
		let node = nodes[rootIndex];
		if (tailPath) {
			for (let i = 0; i < tailPath.length; i++) {
				node = node ? node.childNodes[tailPath[i]] : node;
			}
		}
		return node;
	}

	static _upgradeWebComponentHost(node, tagName) {
		if (
			!node ||
			node.nodeType !== Node.ELEMENT_NODE ||
			typeof tagName !== "string"
		) {
			return node;
		}
		const ctor = globalThis.customElements?.get(tagName);
		if (!ctor || node instanceof ctor) {
			return node;
		}
		const upgraded = document.createElement(tagName);
		for (const attribute of node.attributes || []) {
			upgraded.setAttribute(attribute.name, attribute.value);
		}
		while (node.firstChild) {
			upgraded.appendChild(node.firstChild);
		}
		node.parentNode?.replaceChild(upgraded, node);
		return upgraded;
	}

	static _applyTemplateWebComponents(nodes, template, parentId) {
		const webcomponents = template?.webcomponents;
		if (
			!parentId ||
			!Array.isArray(webcomponents) ||
			webcomponents.length === 0
		) {
			return;
		}
		for (let i = 0; i < webcomponents.length; i++) {
			const host = webcomponents[i];
			let node = UIInstance._resolvePathNode(
				nodes,
				host.rootIndex,
				host.tailPath,
			);
			node = UIInstance._upgradeWebComponentHost(node, host.tagName);
			if (!node || node.nodeType !== Node.ELEMENT_NODE) {
				continue;
			}
			if (!host.tailPath) {
				nodes[host.rootIndex] = node;
			}
			if (!node.hasAttribute(UI_PARENT_ATTRIBUTE)) {
				node.setAttribute(UI_PARENT_ATTRIBUTE, parentId);
			}
		}
	}

	static _applyComponentRootClass(nodes, template) {
		if (!options.componentRootClass) {
			return;
		}
		const componentName =
			typeof template?.componentName === "string"
				? template.componentName.trim()
				: "";
		if (!componentName) {
			return;
		}
		if (/\s/.test(componentName)) {
			log.warn(
				"UIInstance: component root class skipped because name contains whitespace, details",
				{ componentName, template },
			);
			return;
		}
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node?.nodeType === Node.ELEMENT_NODE) {
				const existingClass = node.getAttribute("class") || "";
				if (!existingClass) {
					node.setAttribute("class", componentName);
					continue;
				}
				const tokens = existingClass.split(/\s+/).filter(Boolean);
				const reordered = [componentName];
				for (let j = 0; j < tokens.length; j++) {
					if (tokens[j] !== componentName) {
						reordered.push(tokens[j]);
					}
				}
				node.setAttribute("class", reordered.join(" "));
			}
		}
	}

	static _setReactiveValue(target, value, path) {
		if (Array.isArray(path)) {
			target.set(value, path);
		} else {
			target.set(value);
		}
	}

	static _writeDataPath(self, targetPath, value) {
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
	}

	static _releaseReactiveRef(cell) {
		if (cell?.isReactive && typeof cell.release === "function") {
			cell.release();
		}
	}

	static _acquireReactiveRef(cell) {
		if (cell?.isReactive && typeof cell.acquire === "function") {
			cell.acquire();
		}
	}

	// NOTE: Top-level reactives created in `init()` remain the mounted state.
	// Later plain values write through them without detaching an existing fusion,
	// while later reactive values are fused to them until the incoming reactive
	// reference changes.
	static _mergeReactiveTopLevel(self, base, incoming) {
		if (!incoming || typeof incoming !== "object") {
			return incoming;
		}
		const merged =
			base && typeof base === "object" ? Object.assign({}, base) : {};
		for (const key in incoming) {
			const next = incoming[key];
			const current = merged[key];
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
	}

	// Compiles slot definitions into efficient applier functions.
	static _compileSlotApplier(slots, rawSingle = false, stableDomOrder = false) {
		if (!slots) {
			return null;
		}
		const keys = [];
		const groups = [];
		const plan = [];
		for (const key in slots) {
			keys.push(key);
			const group = slots[key];
			groups.push(group);
			for (let j = 0; j < group.length; j++) {
				plan.push({
					key,
					keyIndex: keys.length - 1,
					itemIndex: j,
					slot: group[j],
				});
			}
		}
		if (keys.length === 0) {
			return null;
		}
		if (stableDomOrder) {
			plan.sort((a, b) => UITemplateSlot.ComparePathDesc(a.slot, b.slot));
		}
		return (nodes, parent) => {
			const res = {};
			const mappedGroups = new Array(keys.length);
			for (let i = 0; i < keys.length; i++) {
				mappedGroups[i] = new Array(groups[i].length);
			}
			if (stableDomOrder) {
				for (let i = 0; i < plan.length; i++) {
					const { keyIndex, itemIndex, slot } = plan[i];
					mappedGroups[keyIndex][itemIndex] = slot.apply(
						nodes,
						parent,
						rawSingle,
					);
				}
			} else {
				for (let i = 0; i < keys.length; i++) {
					const source = groups[i];
					for (let j = 0; j < source.length; j++) {
						mappedGroups[i][j] = source[j].apply(nodes, parent, rawSingle);
					}
				}
			}
			for (let i = 0; i < keys.length; i++) {
				const mapped = mappedGroups[i];
				res[keys[i]] = rawSingle && mapped.length === 1 ? mapped[0] : mapped;
			}
			return res;
		};
	}

	static _ensureCompiled(template) {
		if (template._compiledSlotAppliers) {
			return template._compiledSlotAppliers;
		}
		template._compiledSlotAppliers = {
			in: UIInstance._compileSlotApplier(template.in),
			out: UIInstance._compileSlotApplier(template.out, false, true),
			inout: UIInstance._compileSlotApplier(template.inout),
			ref: UIInstance._compileSlotApplier(template.ref, true),
			on: UIInstance._compileSlotApplier(template.on),
			when: UIInstance._compileSlotApplier(template.when),
			outAttr: UIInstance._compileSlotApplier(template.outAttr),
		};
		return template._compiledSlotAppliers;
	}

	constructor(template, parent, options = undefined) {
		this.template = template;
		this.options = options || {};
		this.data = this.options.data;
		const explicitId =
			typeof this.options.id === "string" ? this.options.id.trim() : "";
		this.id = explicitId || createUIInstanceId();
		registerUIInstance(this);
		const compiled = UIInstance._ensureCompiled(template);
		this.nodes = new Array(template.nodes.length);
		for (let i = 0; i < template.nodes.length; i++) {
			this.nodes[i] = template.nodes[i].cloneNode(true);
		}
		UIInstance._applyTemplateWebComponents(this.nodes, template, this.id);
		UIInstance._applyComponentRootClass(this.nodes, template);
		this.in = compiled.in ? compiled.in(this.nodes, this) : null;
		// NOTE: Keep non-mutating slot resolution before `out` slots.
		// `out-replace` (compiled as part of `out`) mutates DOM shape by replacing
		// anchor nodes with comment boundaries. If `on` slots are resolved after
		// that mutation, index-based node paths can drift for later siblings and
		// event handlers may bind to wrong/missing nodes.
		this._on = compiled.on ? compiled.on(this.nodes, this) : null;
		this.when = compiled.when ? compiled.when(this.nodes, this) : null;
		this.outAttr = compiled.outAttr ? compiled.outAttr(this.nodes, this) : null;
		this.inout = compiled.inout ? compiled.inout(this.nodes, this) : null;
		this.ref = compiled.ref ? compiled.ref(this.nodes, this) : null;
		this.out = compiled.out ? compiled.out(this.nodes, this) : null;
		if (this.when && this.out) {
			for (const k in this.when) {
				for (const predicateSlot of this.when[k]) {
					for (const outKey in this.out) {
						for (const outSlot of this.out[outKey]) {
							if (predicateSlot.node.contains(outSlot.node))
								outSlot.predicateSlot = predicateSlot;
						}
					}
				}
			}
		}
		this.slots = null;
		if (template.slots && this.options.nativeSlots !== true) {
			this.slots = [];
			for (const slotDef of template.slots) {
				let node = this.nodes[slotDef.rootIndex];
				const tailPath = slotDef.tailPath;
				if (tailPath) {
					for (let i = 0; i < tailPath.length; i++) {
						node = node ? node.childNodes[tailPath[i]] : node;
					}
				}
				if (node) {
					const placeholder = document.createComment(`slot:${slotDef.name}`);
					if (tailPath) {
						node.parentNode?.replaceChild(placeholder, node);
					} else {
						this.nodes[slotDef.rootIndex] = placeholder;
					}
					this.slots.push(
						new UIContentSlot(
							placeholder,
							slotDef.fallback,
							this,
							slotDef.name,
						),
					);
				}
			}
			if (this.slots.length === 0) {
				this.slots = null;
			}
		}
		this._isDisposed = false;
		this.children = undefined;
		this.parent = undefined;
		this.setParent(parent);
		if (template.hasBindings) {
			this.bind();
		}
		this._renderer = undefined;
		this._renderQueued = false;
		this._reactiveDataSubs = undefined;
		this._reactiveDataRefs = undefined;
		this._domListeners = undefined;
		this._effectTeardowns = undefined;
		this._asyncBehaviorTokens = undefined;
		this._behaviorDeps = undefined;
		this._behaviorValues = undefined;
		this._behaviorDepRevisions = undefined;
		this._ownedReactiveRefs = undefined;
		this._reactiveTopLevelFusions = undefined;
		this._hasRendered = false;
		if (template.initializer) {
			const state = template.initializer(this, this.data);
			if (state) {
				this.initial = state;
				this._syncOwnedReactiveRefs(state);
			}
			this.set(state);
		}
		if (template.defaultData) {
			this.set(template.defaultData);
		}
	}

	setParent(parent) {
		if (this.parent === parent) {
			return this;
		}
		this.parent?.children?.delete(this);
		this.parent = parent;
		if (parent) {
			if (!parent.children) {
				parent.children = new Set();
			}
			parent.children.add(this);
		}
		return this;
	}

	_getRenderer() {
		if (!this._renderer) {
			this._renderer = () => this._scheduleRender();
		}
		return this._renderer;
	}

	_scheduleRender(changedKeys = null) {
		if (this._renderQueued || this._isDisposed) {
			if (changedKeys?.size) {
				if (!this._pendingChangedKeys) this._pendingChangedKeys = new Set();
				for (const key of changedKeys) {
					this._pendingChangedKeys.add(key);
				}
			}
			return;
		}
		if (changedKeys?.size) {
			this._pendingChangedKeys = new Set(changedKeys);
		}
		this._renderQueued = true;
		scheduleRenderTask(() => {
			const pendingChangedKeys = this._pendingChangedKeys;
			this._pendingChangedKeys = undefined;
			this._renderQueued = false;
			if (!this._isDisposed) {
				this.render(this.data, pendingChangedKeys ?? null);
			}
		});
	}

	// Runs `setup(this)` and tracks returned teardown for disposal.
	effect(setup) {
		if (this._isDisposed || typeof setup !== "function") {
			return this;
		}
		const teardown = setup(this);
		if (typeof teardown === "function") {
			this._effectTeardowns = this._effectTeardowns ?? [];
			this._effectTeardowns.push(teardown);
		}
		return this;
	}

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
	}

	_acquireReactiveRef(cell) {
		if (!cell?.isReactive || typeof cell.acquire !== "function") {
			return;
		}
		this._reactiveDataRefs = this._reactiveDataRefs ?? new Set();
		if (!this._reactiveDataRefs.has(cell)) {
			cell.acquire();
			this._reactiveDataRefs.add(cell);
		}
	}

	_releaseReactiveRef(cell) {
		if (!cell?.isReactive || typeof cell.release !== "function") {
			return;
		}
		if (this._reactiveDataRefs?.has(cell)) {
			cell.release();
			this._reactiveDataRefs.delete(cell);
		}
	}

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
	}

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
	}

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
					// A root reactive can drive multiple behaviors. Re-render them all:
					// granular cache reuse is only safe for a directed nested path.
					if (!normalized || meta.keys?.has(ROOT_STORE_KEY)) {
						this._scheduleRender(null);
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
	}

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
					return true;
				}
			}
		}
		return false;
	}

	_slotKeysForDataKeys(dataKeys) {
		const slotKeys = [];
		const seen = new Set();
		// Root store host: any out slot may project the tree (typically `items`).
		if (dataKeys.has(ROOT_STORE_KEY)) {
			if (this.out) {
				for (const key in this.out) {
					if (!seen.has(key)) {
						seen.add(key);
						slotKeys.push(key);
					}
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
						if (!seen.has(slotKey)) {
							seen.add(slotKey);
							slotKeys.push(slotKey);
						}
						break;
					}
				}
			}
		}
		for (const dataKey of dataKeys) {
			if (this.out?.[dataKey] && !seen.has(dataKey)) {
				seen.add(dataKey);
				slotKeys.push(dataKey);
			}
		}
		// Common collection slot name when behavior is `items` but data key is `value`.
		if (this.out?.items && !seen.has("items")) {
			for (const dataKey of dataKeys) {
				if (dataKey === "value" || dataKey === "items" || dataKey === "data") {
					slotKeys.push("items");
					break;
				}
			}
		}
		return slotKeys;
	}

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
	}

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
		let behaviorData = parent.data;
		// Root store: data is the cell; value is already current after reconcile.
		// Bag host: inject treeAtSlot into value/items/data for a fresh collection view.
		if (
			!isReactiveData(behaviorData) &&
			treeAtSlot !== undefined &&
			behaviorData &&
			typeof behaviorData === "object" &&
			!Array.isArray(behaviorData) &&
			("value" in behaviorData ||
				"items" in behaviorData ||
				"data" in behaviorData)
		) {
			const hostKey =
				"value" in behaviorData
					? "value"
					: "items" in behaviorData
						? "items"
						: "data";
			behaviorData = { ...behaviorData, [hostKey]: treeAtSlot };
			parent.data = behaviorData;
		} else if (!behaviorData) {
			behaviorData = {};
		}
		// Path-proven structural mutations: avoid full collection remap when the
		// slot already has row wrappers we can reuse (append one / remove one).
		if (
			hint?.op === "append" &&
			Array.isArray(treeAtSlot) &&
			typeof slot._renderTrustedAppend === "function"
		) {
			const local = this._renderCollectionAppendLocal(slot, treeAtSlot);
			if (local) {
				return true;
			}
		} else if (
			hint?.op === "remove" &&
			Array.isArray(treeAtSlot) &&
			typeof slot._renderTrustedRemoveAt === "function"
		) {
			const at =
				typeof hint.at === "number" ? hint.at : (slot._listLength || 1) - 1;
			const local = this._renderCollectionRemoveLocal(slot, treeAtSlot, at);
			if (local) {
				return true;
			}
		}
		// Behaviors receive the same view shape as render() (unwrap root store).
		const viewData = renderViewData(behaviorData);
		const rendered = behavior(parent, viewData, null);
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
		if (hint?.op === "append" && typeof slot._renderTrustedAppend === "function") {
			if (slot._renderTrustedAppend(rendered)) {
				return true;
			}
		} else if (
			hint?.op === "remove" &&
			typeof slot._renderTrustedRemoveAt === "function"
		) {
			const at =
				typeof hint.at === "number" ? hint.at : (slot._listLength || 1) - 1;
			if (slot._renderTrustedRemoveAt(rendered, at)) {
				return true;
			}
		}
		slot.render(rendered);
		return true;
	}

	// True when row bags hold the raw collection element in `.value` (inspector
	// pattern). False when a processor reshapes entries (e.g. `{ id, value }`).
	_collectionRowUsesRawEntry(slot, treeAtSlot) {
		const sample = slot._listItems?.[0];
		if (!(sample instanceof AppliedUITemplate)) {
			return false;
		}
		const data = sample.data;
		if (!data || typeof data !== "object" || !("value" in data)) {
			return false;
		}
		// Match sample against any current element by identity (store-stable refs).
		for (let i = 0; i < treeAtSlot.length; i++) {
			if (Object.is(data.value, treeAtSlot[i])) {
				return true;
			}
		}
		return false;
	}

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
		const sampleData = sample.data;
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
			next[i] = slot._listItems[i];
		}
		next[prevLen] = row;
		return slot._renderTrustedAppend(next);
	}

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
			// Kept row must still point at the element now at index j.
			if (
				item instanceof AppliedUITemplate &&
				item.data &&
				typeof item.data === "object" &&
				"value" in item.data &&
				!Object.is(item.data.value, treeAtSlot[j])
			) {
				return false;
			}
			if (item instanceof AppliedUITemplate && item.data && typeof item.data === "object") {
				const data = item.data;
				if ("key" in data || "$key" in data) {
					const shifted = { ...data, key: `#${j}` };
					if ("$key" in data) {
						shifted.$key = j;
					}
					item.data = shifted;
				}
			}
			next[j] = item;
			j++;
		}
		return slot._renderTrustedRemoveAt(next, removeAt);
	}

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
	}

	// Derive a trusted list mutation hint from slot tracking + new array refs.
	// Only returns a hint when Object.is proves identity-preserving append/remove
	// (e.g. after surgical cell shrink). Otherwise undefined → full eq detect.
	static _listMutationHint(slot, nextArray) {
		if (!slot || !Array.isArray(nextArray)) {
			return undefined;
		}
		const prevLen = slot._listLength || 0;
		const nextLen = nextArray.length;
		const prevItems = slot._listItems;
		if (!prevItems || prevLen === 0) {
			return undefined;
		}
		const prevValue = (item) => {
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
		};
		if (nextLen === prevLen + 1) {
			for (let i = 0; i < prevLen; i++) {
				if (!Object.is(nextArray[i], prevValue(prevItems[i]))) {
					return undefined;
				}
			}
			return { op: "append" };
		}
		if (nextLen === prevLen - 1) {
			let removeAt = nextLen;
			for (let i = 0; i < nextLen; i++) {
				if (!Object.is(nextArray[i], prevValue(prevItems[i]))) {
					removeAt = i;
					break;
				}
			}
			for (let i = removeAt; i < nextLen; i++) {
				if (!Object.is(nextArray[i], prevValue(prevItems[i + 1]))) {
					return undefined;
				}
			}
			return { op: "remove", at: removeAt };
		}
		return undefined;
	}

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
					const headIndex =
						typeof head === "number"
							? head
							: Number.isInteger(Number(head)) && String(Number(head)) === String(head)
								? Number(head)
								: NaN;
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
				const headIndex =
					typeof head === "number"
						? head
						: Number.isInteger(Number(head)) && String(Number(head)) === String(head)
							? Number(head)
							: NaN;
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
						const nested = firstMappedUIInstance(valueSlots[i]);
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
				const nested = firstMappedUIInstance(valueSlots[i]);
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
	}

	_applyReactivePathToInstance(instance, path, treeValue) {
		if (!(instance instanceof UIInstance) || instance._isDisposed) {
			return false;
		}
		if (!path?.length) {
			const prev = instance.data;
			if (prev && typeof prev === "object" && !Array.isArray(prev)) {
				if ("value" in prev) {
					instance.update({ ...prev, value: treeValue });
				} else if ("label" in prev) {
					instance.update({ ...prev, label: treeValue });
				} else if ("text" in prev) {
					instance.update({ ...prev, text: treeValue });
				} else {
					const keys = [];
					for (const k in prev) {
						if (k === "$key" || k === "key") {
							continue;
						}
						keys.push(k);
					}
					if (keys.length === 1) {
						instance.update({ ...prev, [keys[0]]: treeValue });
					} else {
						instance.update(treeValue);
					}
				}
			} else {
				instance.update(treeValue);
			}
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
		// Single-value out slots (e.g. out-replace without items collection).
		if (instance.out) {
			for (const slotKey in instance.out) {
				if (slotKey === "items" || slotKey === "label" || slotKey === "text") {
					continue;
				}
				const slots = instance.out[slotKey];
				for (let i = 0; i < slots.length; i++) {
					const nested = firstMappedUIInstance(slots[i]);
					if (
						nested &&
						this._applyReactivePathToInstance(nested, path, treeValue)
					) {
						return true;
					}
					// Scalar / text slot at leaf: path exhausted after entry select.
					if (!nested && path.length === 0) {
						slots[i].render(treeValue);
						return true;
					}
				}
			}
		}
		return false;
	}

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
	}

	_getReactiveTopLevelFusion(key) {
		return this._reactiveTopLevelFusions?.get(key);
	}

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
	}

	_clearReactiveTopLevelFusions() {
		if (!this._reactiveTopLevelFusions) {
			return;
		}
		for (const key of this._reactiveTopLevelFusions.keys()) {
			this._clearReactiveTopLevelFusion(key);
		}
	}

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

	// Cleans up subscriptions, recursively disposes children, removes from parent.
	dispose() {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._renderQueued = false;
		if (this.template.doCleanup) {
			try {
				this.template.doCleanup(this, this.data || {});
			} catch (err) {
				log.error("UIInstance.dispose: cleanup threw, details", {
					error: err,
					instance: this,
				});
			}
		}
		if (this._effectTeardowns) {
			for (const teardown of this._effectTeardowns) {
				try {
					teardown();
				} catch (err) {
					log.error("UIInstance.dispose: effect teardown threw, details", {
						error: err,
						instance: this,
					});
				}
			}
			this._effectTeardowns.length = 0;
			this._effectTeardowns = undefined;
		}
		this._clearReactiveTopLevelFusions();
		if (this._domListeners) {
			for (const listener of this._domListeners) {
				listener.node.removeEventListener(listener.type, listener.handler);
			}
			this._domListeners.length = 0;
			this._domListeners = undefined;
		}
		this._clearReactiveDataSubs();
		this._releaseOwnedReactiveRefs();
		if (this._ctxSubs) {
			for (const [cell, handler] of this._ctxSubs) {
				cell.unsub(handler);
			}
			this._ctxSubs = undefined;
		}
		if (this.children) {
			for (const child of this.children) {
				child.dispose();
			}
			this.children.clear();
			this.children = undefined;
		}
		this.setParent(undefined);
		unregisterUIInstance(this);
		this._behaviorDeps = undefined;
		this._behaviorValues = undefined;
		this._behaviorDepRevisions = undefined;
	}

	// ============================================================================
	// SUBContext (Provider/Inject)
	// ============================================================================

	// Provides `value` as `key` to child components. Returns this for chaining.
	provide(key, value) {
		if (this._context === undefined) {
			this._context = new Map();
		}
		this._context.set(key, value);
		return this;
	}

	// Injects value for `key` from ancestor providers. Returns `defaultValue`
	// if not found. Auto-subscribes to reactive cells for re-rendering.
	inject(key, defaultValue = undefined) {
		let current = this.parent;
		while (current) {
			if (current._context?.has(key)) {
				const value = current._context.get(key);
				if (value?.isReactive) {
					if (this._ctxSubs === undefined) {
						this._ctxSubs = new Map();
					}
					if (!this._ctxSubs.has(value)) {
						const handler = this._getRenderer();
						value.sub(handler);
						this._ctxSubs.set(value, handler);
					}
				}
				return value;
			}
			current = current.parent;
		}
		return defaultValue;
	}

	// ============================================================================
	// SUBEvent Binding
	// ============================================================================

	// Binds all event handlers for on:, in, and inout slots.
	bind() {
		if (this._domListeners?.length) {
			return;
		}
		if (!this._domListeners) {
			this._domListeners = [];
		}
		for (const k in this._on) {
			for (const slot of this._on[k]) {
				this._bindEvent(k, slot);
			}
		}
		for (const set of [this.in, this.inout]) {
			for (const k in set) {
				for (const slot of set[k]) {
					this._bindInput(k, slot);
				}
			}
		}
	}

	// Binds event slot with explicit event type.
	_resolveEventBehaviorTarget(name) {
		let current = this;
		while (current) {
			const handler = current.template?.behavior?.[name];
			if (typeof handler === "function") {
				return current;
			}
			current = current.parent;
		}
		return null;
	}

	_bindEvent(name, target) {
		if (target.mode === "assign" && target.targetPath?.length) {
			const listener = (event) => {
				if (target.stopPropagation) {
					event.stopPropagation();
				}
				if (target.preventDefault) {
					event.preventDefault();
				}
				const inputProperty = getInputBindingProperty(target.node);
				const inputValue = target.node.nodeName.includes("-")
					? event?.detail?.current
					: getInputEventValue(target.node, event, inputProperty);
				if (inputValue === SKIP_INPUT_UPDATE || inputValue === undefined) {
					return;
				}
				UIInstance._writeDataPath(this, target.targetPath, inputValue);
			};
			target.node.addEventListener(target.eventType, listener);
			this._domListeners.push({
				node: target.node,
				type: target.eventType,
				handler: listener,
			});
			return;
		}
		if (target.mode === "publish" && target.publishEvent) {
			const listener = (event) => {
				if (target.stopPropagation) {
					event.stopPropagation();
				}
				if (target.preventDefault) {
					event.preventDefault();
				}
				const data = this.data || {};
				let payload = data;
				const bindingSource = formatBindingSource(target.binding);
				if (bindingSource) {
					payload = resolveBindingValue(data, target.binding, false, this);
					if (target.binding.processors?.length) {
						payload = applyNamedProcessors(
							this,
							data,
							payload,
							target.binding.processors,
							bindingSource,
							{ expandFunctions: false },
						);
					}
				}
				this.pub(target.publishEvent, payload, true, event);
			};
			target.node.addEventListener(target.eventType, listener);
			this._domListeners.push({
				node: target.node,
				type: target.eventType,
				handler: listener,
			});
			return;
		}
		const listener = (event) => {
			if (target.stopPropagation) {
				event.stopPropagation();
			}
			if (target.preventDefault) {
				event.preventDefault();
			}
			const targetInstance = this._resolveEventBehaviorTarget(name);
			if (!targetInstance) {
				return;
			}
			event.origin = this;
			event.originData = this.data || {};
			const handler = targetInstance.template.behavior?.[name];
			const result = handler(targetInstance, targetInstance.data || {}, event);
			applyEventResult(targetInstance, result);
		};
		target.node.addEventListener(target.eventType, listener);
		this._domListeners.push({
			node: target.node,
			type: target.eventType,
			handler: listener,
		});
	}

	// Binds input slot with inferred event type.
	_bindInput(name, target, handler = this.template.behavior?.[name]) {
		let event;
		const inputProperty = getInputBindingProperty(
			target.node,
			target.template?.inputProperty,
		);
		const nodeName = `${target.node.nodeName || ""}`;
		const isCustomElement = nodeName.includes("-");
		if (isCustomElement) {
			event = `wc:${inputProperty}`;
		} else
			switch (nodeName) {
				case "INPUT":
				case "TEXTAREA":
				case "SELECT":
					event = "input";
					break;
				case "DETAILS":
					event = "toggle";
					break;
				case "FORM":
					event = "submit";
					break;
				default:
					event = "click";
			}
		const listener = (event) => {
			const data = this.data || {};
			const slotValue = data[name];
			const inputValue = isCustomElement
				? event?.detail?.current
				: getInputEventValue(target.node, event, inputProperty);
			if (inputValue === SKIP_INPUT_UPDATE) {
				return;
			}
			if (handler) {
				const result = handler(this, data, event);
				if (isThenable(result) || isEventStatePatch(result)) {
					applyEventResult(this, result);
				} else if (
					result !== undefined &&
					(result === null || typeof result !== "object") &&
					slotValue?.isReactive
				) {
					slotValue.set(result);
				}
			} else if (slotValue?.isReactive) {
				slotValue.set(inputValue);
			} else {
				this.update({ [name]: inputValue });
			}
		};
		target.node.addEventListener(event, listener);
		this._domListeners.push({
			node: target.node,
			type: event,
			handler: listener,
		});
	}

	// ============================================================================
	// SUBData/State
	// ============================================================================

	// Sets data and renders. Updates key for list rendering.
	// When `data` is a reactive cell/store, it becomes `this.data` directly
	// (store mode). Prefer later `store.reconcile(next)` or `update(nextTree)`.
	set(data, key = this.key) {
		this.key = key;
		if (isReactiveData(data)) {
			this.render(data);
			return this;
		}
		if (
			this.initial &&
			data !== null &&
			data !== undefined &&
			typeof data === "object" &&
			Object.getPrototypeOf(data) === Object.prototype
		) {
			this.render(UIInstance._mergeReactiveTopLevel(this, this.initial, data));
		} else {
			this.render(data);
		}
		return this;
	}

	// Updates data with granular change detection. Only re-renders changed fields
	// when possible. Handles reactive cell subscription management.
	//
	// Store mode (`this.data` is a cell): plain `data` is reconciled into the
	// store (`reconcile` when available, else `set`). UI updates via cell subs.
	// Passing another cell rebinds the instance to that store.
	update(data, force = false) {
		if (isReactiveData(this.data)) {
			if (isReactiveData(data)) {
				if (force || data !== this.data) {
					this.render(data);
				}
				return this;
			}
			if (typeof this.data.reconcile === "function") {
				this.data.reconcile(data);
			} else if (typeof this.data.set === "function") {
				this.data.set(data);
			}
			if (force) {
				this.render(this.data);
			}
			return this;
		}
		if (data === undefined || data === null) {
			if (force || this.data !== data) {
				this.render(data);
			}
			return this;
		}
		if (isReactiveData(data)) {
			this.render(data);
			return this;
		}
		if (typeof data !== "object") {
			if (force || !eq(this.data, data)) {
				this.render(data);
			}
			return this;
		}
		// Fast-path: if the entire subtree data is deeply equal to what we
		// already rendered, skip render and changed-key computation. This
		// dramatically reduces work for sibling list items when only one
		// entry mutates (common in the inspector benchmark content phase).
		//
		// Note: we intentionally do *not* have a `data === this.data` bail here.
		// List reuse via Component.map with stable keys keeps the same data bag
		// object for a row while mutating fields inside (e.g. .value). The eq
		// scan below will cheaply detect "no change" for stable rows, and will
		// detect the changed field for the touched row so its behaviors re-run.
		if (!force && this.data && eq(this.data, data)) {
			return this;
		}
		let same = !force;
		let changedKeys = null;
		if (!this.data) {
			same = false;
		} else if (same) {
			for (const k in data) {
				const existing = this.data[k];
				const updated = data[k];
				if (Object.is(existing, updated)) {
					continue;
				}
				// Type/shape change (scalar↔object↔array): skip deep eq.
				const exArr = Array.isArray(existing);
				const upArr = Array.isArray(updated);
				if (
					exArr !== upArr ||
					(existing === null) !== (updated === null) ||
					typeof existing !== typeof updated
				) {
					same = false;
					if (!changedKeys) {
						changedKeys = new Set();
					}
					changedKeys.add(k);
					continue;
				}
				if (!eq(existing, updated)) {
					same = false;
					if (!changedKeys) {
						changedKeys = new Set();
					}
					changedKeys.add(k);
				}
			}
		}
		if (!same) {
			const merged =
				this.data && typeof this.data === "object"
					? UIInstance._mergeReactiveTopLevel(this, this.data, data)
					: data;
			this.render(merged, changedKeys);
		}
		return this;
	}

	// Tests if any of `deps` changed in `changedKeys`.
	_depsChanged(deps, changedKeys) {
		for (const key of deps) {
			if (changedKeys.has(key)) {
				return true;
			}
		}
		return false;
	}

	// Direct update for simple out= bindings on scalar path notify (skips full render + schedule).
	// Only for keys without behavior (behaviors may have logic/side effects).
	_tryDirectOutUpdate(key, val) {
		if (this._isDisposed || key == null) return false;
		const hasBehavior = this.template?.behavior?.[key];
		if (hasBehavior) return false;
		const slots = this.out?.[key];
		if (!slots?.length) return false;
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			if (slot.predicateSlot?.node.parentNode === null) continue;
			slot.render(val);
		}
		return true;
	}

	_reactiveDepsChanged(depRevisions, data) {
		if (!depRevisions || depRevisions.size === 0 || !data) {
			return false;
		}
		for (const [key, revision] of depRevisions.entries()) {
			const value = data[key];
			// If the dependency stopped being reactive (or has no revision),
			// invalidate so we don't reuse behavior values computed from an
			// incompatible dependency shape.
			if (value?.isReactive !== true || !Number.isFinite(value.revision)) {
				return true;
			}
			// Guard against stale behavior cache when nested reactive updates
			// occur without changing parent plain-object keys.
			if (value.revision !== revision) {
				return true;
			}
		}
		return false;
	}

	_trackAsyncBehaviorValue(key, value, onResolved) {
		if (!isThenable(value)) {
			return false;
		}
		this._asyncBehaviorTokens = this._asyncBehaviorTokens ?? new Map();
		const token = (this._asyncBehaviorTokens.get(key) || 0) + 1;
		this._asyncBehaviorTokens.set(key, token);
		value.then(
			(resolved) => {
				if (this._isDisposed || this._asyncBehaviorTokens.get(key) !== token) {
					return;
				}
				onResolved(resolved);
			},
			() => undefined,
		);
		return true;
	}

	_applyEagerBehaviorResult(entryKey, result, data) {
		if (result === undefined) {
			return data;
		}
		const stateKey = entryKey.endsWith("!") ? entryKey.slice(0, -1) : entryKey;
		if (!stateKey) {
			return data;
		}
		const target = data?.[stateKey];
		if (target?.isReactive) {
			target.set(result);
			return data;
		}
		if (!data || typeof data !== "object") {
			return data;
		}
		// Avoid mutating caller-owned plain object payloads in place.
		return { ...data, [stateKey]: result };
	}

	_runEagerBehaviors(data) {
		const behavior = this.template.behavior;
		if (!behavior) {
			return data;
		}
		let nextData = data;
		for (const key in behavior) {
			if (!key.endsWith("!")) {
				continue;
			}
			const result = behavior[key](this, nextData, null);
			nextData = this._applyEagerBehaviorResult(key, result, nextData);
		}
		return nextData;
	}

	// ============================================================================
	// SUBPub/Sub Events
	// ============================================================================

	// Publishes event up the component tree. Returns UIEvent.
	pub(event, data, self = true, domEvent = undefined) {
		const res = new UIEvent(event, data, this, domEvent);
		this.onPub(res, self);
		return res;
	}

	// Subscribes runtime handler to event.
	on(event, handler) {
		if (this._runtimeSubs === undefined) {
			this._runtimeSubs = new Map();
		}
		if (this._runtimeSubs.has(event)) {
			this._runtimeSubs.get(event).push(handler);
		} else {
			this._runtimeSubs.set(event, [handler]);
		}
		return this;
	}

	// Unsubscribes runtime handler from event.
	off(event, handler) {
		if (!this._runtimeSubs) return this;
		const handlers = this._runtimeSubs.get(event);
		if (handlers) {
			const i = handlers.indexOf(handler);
			if (i >= 0) {
				handlers.splice(i, 1);
			}
			if (handlers.length === 0) {
				this._runtimeSubs.delete(event);
			}
		}
		return this;
	}

	// Handles published event. Checks runtime subs, then template subs.
	// Stops propagation if handler returns `false`, stops bubbling on `null`.
	onPub(event, self = true) {
		event.current = this;
		if (this.data === undefined || this.data === null) {
			this.data = {};
		}
		const data = this.data;
		let propagate = true;
		if (self && this._runtimeSubs) {
			const rl = this._runtimeSubs.get(event.name);
			if (rl) {
			for (const h of rl) {
				const c = h(this, data, event);
				applyEventResult(this, c);
					if (c === false) {
						return event;
					} else if (c === null) {
						propagate = false;
					}
				}
			}
		}
		if (self && propagate && this.template.subs) {
			const hl = this.template.subs.get(event.name);
			if (hl) {
			for (const h of hl) {
				const c = h(this, data, event);
				applyEventResult(this, c);
					if (c === false) {
						return event;
					} else if (c === null) {
						propagate = false;
					}
				}
			}
		}
		if (propagate && this.parent) {
			if (typeof this.parent.onPub === "function") {
				this.parent.onPub(event, true);
			} else {
				log.warn(
					"UIInstance.onPub: parent is not a UIInstance-like event target, details",
					{ parent: this.parent, event, self },
				);
			}
		}
		return event;
	}

	// ============================================================================
	// SUBRendering
	// ============================================================================

	// Mounts this instance into `node` (selector string or Node). Optionally
	// inserts after `previous` node.
	mount(node, previous) {
		if (
			node === undefined &&
			previous === undefined &&
			this.template?.sourceMode === "fallback-node-template"
		) {
			const hosts = this.template.sourceHosts;
			const count = Array.isArray(hosts) ? hosts.length : 0;
			if (count !== 1) {
				throw new Error(
					`UIInstance.mount: fallback template "${this.template?.sourceSelector ?? ""}" matched ${count} host nodes. Use .mount(selector, true) explicitly.`,
				);
			}
			node = hosts[0];
			previous = true;
		}
		const replaceHost = previous === true;
		if (typeof node === "string") {
			const n = document.querySelector(node);
			if (!n) {
				log.error(
					"UIInstance.mount: selector did not match, cannot mount component, details",
					{ selector: node, component: this.template },
				);
				return this;
			} else {
				node = n;
			}
		}
		if (node) {
			if (replaceHost) {
				const parent = node.parentNode;
				if (!parent) {
					log.warn(
						"UIInstance.mount: replace-host target has no parent, details",
						{
							node,
							self: this,
						},
					);
				} else {
					let previousSibling = node;
					for (const n of this.nodes) {
						parent.insertBefore(n, previousSibling.nextSibling);
						previousSibling = n;
					}
					parent.removeChild(node);
				}
			} else if (this.nodes[0].parentNode !== node) {
				if (previous && previous.parentNode === node) {
					for (const n of this.nodes) {
						node.insertBefore(n, previous.nextSibling);
						previous = n;
					}
				} else {
					for (const n of this.nodes) {
						node.appendChild(n);
					}
				}
			} else {
				log.warn("UIInstance.mount: already mounted, details", {
					nodes: this.nodes,
				});
			}
		} else {
			log.warn(
				"UIInstance.mount: unable to mount as node is undefined, details",
				{
					node,
					self: this,
				},
			);
			for (const node of this.nodes) {
				node.parentNode?.removeChild(node);
			}
		}
		if (node && !this._hasRendered) {
			this.render();
		}

		return this;
	}

	// Unmounts from DOM and disposes resources.
	unmount() {
		// TODO: Speedup: if the first node is not mounted, the rest is not.
		// FIXME: Some root slots would have their node replaced by a placeholder
		this.dispose();
		for (const node of this.nodes) {
			node.parentNode?.removeChild(node);
		}
		return this;
	}

	// Renders `data`, optionally limited to `changedKeys` for granular updates.
	// Processes all binding types (out, inout, in, when, outAttr, slots).
	// TODO: Should take a "changes" and know which behaviour should be updated
	render(data = this.data, changedKeys = null) {
		if (!this.template) {
			log.error(
				"UIInstance.render: called on instance with undefined template, details",
				{ instance: this },
			);
			return this;
		}
		// Keep store cell identity on `this.data`; behaviors see unwrapped view.
		const storeData = data;
		// Rebinding to a different root store: drop mounted collections so
		// stable $key wrappers from the previous store cannot pin stale rows.
		if (
			isReactiveData(storeData) &&
			isReactiveData(this.data) &&
			storeData !== this.data &&
			this.out
		) {
			for (const slotKey in this.out) {
				const group = this.out[slotKey];
				for (let i = 0; i < group.length; i++) {
					group[i]._clearMapped?.();
				}
			}
		}
		data = this._runEagerBehaviors(data);
		const renderData = renderViewData(data);
		const isGranular =
			!isReactiveData(storeData) &&
			changedKeys !== null &&
			changedKeys.size > 0;
		if (this.when) {
			for (const k in this.when) {
				for (const slot of this.when[k]) {
					if (slot.template.predicate(this, renderData)) {
						slot.show();
					} else {
						slot.hide();
					}
				}
			}
		}
		// FIXME: I'm not sure this condition is good.
		if (
			!(
				this.template.out ||
				this.template.inout ||
				this.template.in ||
				this.template.outAttr
			)
		) {
			let hasElementNode = false;
			for (const node of this.nodes) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					hasElementNode = true;
					break;
				}
			}
			if (!hasElementNode) {
				const text = asText(renderData);
				for (const node of this.nodes) {
					if (node.nodeType === Node.TEXT_NODE) {
						setNodeText(node, text);
						break;
					}
				}
			}
		} else {
			const behavior = this.template.behavior;
			// TODO: This is where there may be loops and where there's a need
			// for optimisation
			const renderSet = (set, withProcessors = false) => {
				if (!set) {
					return;
				}
				for (const k in set) {
					let v;
					const slots = set[k];
					const templateTokens = withProcessors
						? slots?.[0]?.template?.template?.tokens
						: null;
					if (templateTokens) {
						const resolvedTemplate = resolveTemplateTokens(
							this,
							templateTokens,
							renderData,
						);
						for (const slot of slots) {
							slot.render(resolvedTemplate);
						}
						continue;
					}
					const binding = withProcessors ? slots?.[0]?.template?.binding : null;
					const sourceKey = formatBindingSource(binding) || k;
					const processors = binding?.processors || null;
					const hasBehavior = behavior?.[sourceKey];

					if (isGranular && this._behaviorDeps && this._behaviorValues) {
						const deps = this._behaviorDeps.get(k);
						const depRevisions = this._behaviorDepRevisions?.get(k);
						if (
							deps &&
							!this._depsChanged(deps, changedKeys) &&
							!this._reactiveDepsChanged(depRevisions, data) &&
							!hasTrackedNonReactiveObjectDeps(data, deps)
						) {
							v = this._behaviorValues.get(k);
							if (v === undefined && binding?.defaultValue !== undefined)
								v = binding.defaultValue;
							if (withProcessors && processors?.length) {
								const processed = applyNamedProcessors(
									this,
									renderData,
									v,
									processors,
									sourceKey,
									{ withMeta: true },
								);
								v = finalizeRenderProcessorValue(
									processed.value,
									processed.lastProcessorType,
								);
							}
							for (const slot of slots) {
								if (slot.predicateSlot?.node.parentNode === null) continue;
								slot.render(v);
							}
							continue;
						}
					}

					// TODO: What does it mean has behavior, and what do we
					// do with the tracking proxy
					if (hasBehavior) {
						// Track deps whenever data is a plain object so later granular
						// updates can skip behaviors whose inputs did not change
						// (including after the initial set()).
						const canTrack =
							renderData !== null &&
							typeof renderData === "object" &&
							Object.getPrototypeOf(renderData) === Object.prototype;
						const haveDeps = this._behaviorDeps?.has(k);
						if (canTrack && !haveDeps) {
							const [trackedData, accessed] = createTrackingProxy(renderData);
							v = hasBehavior(this, trackedData, null);
							if (!this._behaviorDeps) {
								this._behaviorDeps = new Map();
							}
							this._behaviorDeps.set(k, accessed);
							if (!this._behaviorValues) {
								this._behaviorValues = new Map();
							}
							this._behaviorValues.set(k, v);
							if (!this._behaviorDepRevisions) {
								this._behaviorDepRevisions = new Map();
							}
							this._behaviorDepRevisions.set(
								k,
								snapshotReactiveDependencyRevisions(renderData, accessed),
							);
						} else {
							v = hasBehavior(this, renderData, null);
						}
					} else {
						v = binding
							? resolveBindingValue(
									renderData,
									binding,
									!processors?.length,
									this,
								)
							: processors?.length
								? resolveSourceValue(renderData, sourceKey, this)
								: resolveExpandedSourceValue(renderData, sourceKey, this);
					}
					if (v === undefined && binding?.defaultValue !== undefined)
						v = binding.defaultValue;

					if (
						hasBehavior &&
						this._trackAsyncBehaviorValue(k, v, (resolved) => {
							let next = resolved;
							if (withProcessors && processors?.length) {
								const processed = applyNamedProcessors(
									this,
									renderData,
									next,
									processors,
									sourceKey,
									{ withMeta: true },
								);
								next = finalizeRenderProcessorValue(
									processed.value,
									processed.lastProcessorType,
								);
							}
							for (const slot of slots) {
								if (slot.predicateSlot?.node.parentNode === null) continue;
								slot.render(next);
							}
						})
					) {
						continue;
					}
					if (withProcessors && processors?.length) {
						const processed = applyNamedProcessors(
							this,
							renderData,
							v,
							processors,
							sourceKey,
							{ withMeta: true },
						);
						v = finalizeRenderProcessorValue(
							processed.value,
							processed.lastProcessorType,
						);
					}
					for (const slot of slots) {
						if (slot.predicateSlot?.node.parentNode === null) continue;
						slot.render(v);
					}
				}
			};

			renderSet(this.out, true);
			renderSet(this.inout);
			renderSet(this.in);
			if (this.outAttr) {
				for (const k in this.outAttr) {
					if (k === "$template") {
						for (const slot of this.outAttr.$template) {
							slot.render(
								resolveTemplateTokens(
									this,
									slot.template.template?.tokens,
									renderData,
								),
							);
						}
						continue;
					}
					const slots = this.outAttr[k];
					const binding = slots?.[0]?.template.binding;
					const mode = slots?.[0]?.template.mode;
					const operator = slots?.[0]?.template.operator;
					const comparisonValue = slots?.[0]?.template.value;
					const sourceKey =
						formatBindingSource(binding) || slots?.[0]?.template.slotName || k;
					const processors = binding?.processors;
					const hasBehavior = behavior?.[sourceKey];
					const finalizeOutAttrValue = (value) => {
						let next = value;
						if (next === undefined && binding?.defaultValue !== undefined) {
							next = binding.defaultValue;
						}
						if (processors?.length) {
							const processed = applyNamedProcessors(
								this,
								renderData,
								next,
								processors,
								sourceKey,
								{ withMeta: true },
							);
							next = finalizeRenderProcessorValue(
								processed.value,
								processed.lastProcessorType,
							);
						} else if (next !== undefined) {
							next = resolveRenderableValue(next);
						}
						return mode === "comparison"
							? TemplateParser.EvaluateWhenComparison(
									next,
									operator,
									comparisonValue,
								)
							: next;
					};
					let v;
					if (hasBehavior) {
						for (const slot of slots) {
							const attrValue = slot.node.getAttribute(slot.attrName);
							v = hasBehavior(this, renderData, attrValue, slot.node);
							if (
								this._trackAsyncBehaviorValue(
									`${k}:${slot.attrName}`,
									v,
									(resolved) => {
										slot.render(finalizeOutAttrValue(resolved));
									},
								)
							) {
								continue;
							}
							slot.render(finalizeOutAttrValue(v));
						}
						continue;
					}
					v = binding
						? resolveBindingValue(renderData, binding, false, this)
						: resolveSourceValue(renderData, sourceKey, this);
					v = finalizeOutAttrValue(v);
					for (const slot of slots) {
						slot.render(v);
					}
				}
			}
			if (this.slots?.length) {
				const view = renderViewData(data);
				for (const slot of this.slots) {
					const content = view?.slots?.[slot.name];
					slot.mount(content);
				}
			}
		}
		this.syncReactiveDataSubs(data);
		this.data = data;
		this._hasRendered = true;
		return this;
	}
}

setUIInstanceClass(UIInstance);

export { getUIInstance, UIInstance };

// EOF
