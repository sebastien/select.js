// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-18

// Module: select/ui/components/instance
// Mounted UI template instances, lifecycle, events, and rendering.

import { asText, eq } from "../../utils.js";
import { log } from "../templates.js";

import { UIEvent } from "./model.js";
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
	scheduleRenderTask,
	setNodeText,
	snapshotReactiveDependencyRevisions,
} from "./runtime.js";
import { setUIInstanceClass, UIContentSlot, UITemplateSlot } from "./slots.js";

const UI_INSTANCES = new Map();
const UI_PARENT_ATTRIBUTE = "ui-parent";
let uiInstanceId = 0;

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
	// Later plain values write through them, while later reactive values are
	// fused to them until the incoming reactive reference changes.
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
				self?._clearReactiveTopLevelFusion(key);
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
		const explicitId =
			typeof this.options.id === "string" ? this.options.id.trim() : "";
		this.id = explicitId || createUIInstanceId();
		registerUIInstance(this);
		const compiled = UIInstance._ensureCompiled(template);
		// FIXME: This is on the hotpath
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
			const state = template.initializer(this);
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

	_scheduleRender() {
		if (this._renderQueued || this._isDisposed) {
			return;
		}
		this._renderQueued = true;
		scheduleRenderTask(() => {
			this._renderQueued = false;
			if (!this._isDisposed) {
				this.render();
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
		let refs = null;
		if (data && typeof data === "object") {
			for (const k in data) {
				const v = data[k];
				if (v?.isReactive) {
					refs = refs ?? new Set();
					refs.add(v);
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
		for (const cell of refs) {
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
		const renderer = this._getRenderer();
		for (const cell of this._reactiveDataSubs.keys()) {
			if (!refs?.has(cell)) {
				cell.unsub(renderer);
				this._releaseReactiveRef(cell);
				this._reactiveDataSubs.delete(cell);
			}
		}
		if (!refs) {
			return;
		}
		for (const cell of refs) {
			if (!this._reactiveDataSubs.has(cell)) {
				cell.sub(renderer);
				this._acquireReactiveRef(cell);
				this._reactiveDataSubs.set(cell, true);
			}
		}
	}

	_clearReactiveDataSubs() {
		if (!this._reactiveDataSubs || !this._renderer) {
			return;
		}
		for (const cell of this._reactiveDataSubs.keys()) {
			cell.unsub(this._renderer);
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
					payload = resolveBindingValue(data, target.binding, false);
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
				this.pub(target.publishEvent, payload);
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
			if (result && typeof result === "object" && !Array.isArray(result)) {
				targetInstance.update(result);
			}
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
				if (result && typeof result === "object" && !Array.isArray(result)) {
					this.update(result);
				} else if (result !== undefined && slotValue?.isReactive) {
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
	set(data, key = this.key) {
		this.key = key;
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
	update(data, force = false) {
		if (data === undefined || data === null) {
			if (force || this.data !== data) {
				this.render(data);
			}
			return this;
		}
		if (typeof data !== "object") {
			if (force || !eq(this.data, data)) {
				this.render(data);
			}
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

	// FIXME: Remove, use pub() instead
	send(event, data) {
		log.warn("UIInstance: send() is deprecated, use pub() instead");
		return this.pub(event, data);
	}

	// FIXME: Remove, use pub() instead
	emit(event, data) {
		log.warn("UIInstance: emit() is deprecated, use pub() instead");
		return this.pub(event, data);
	}

	// Publishes event up the component tree. Returns UIEvent.
	pub(event, data, self = true) {
		const res = new UIEvent(event, data, this);
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
					if (c && typeof c === "object" && !Array.isArray(c)) {
						this.update(c);
					}
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
					if (c && typeof c === "object" && !Array.isArray(c)) {
						this.update(c);
					}
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
		const renderData = data ?? {};

		data = this._runEagerBehaviors(data);
		const isGranular = changedKeys !== null && changedKeys.size > 0;
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
				const text = asText(data);
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
								slot.render(v);
							}
							continue;
						}
					}

					// TODO: What does it mean has behavior, and what do we
					// do with the tracking proxy
					if (hasBehavior) {
						if (isGranular) {
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
								)
							: processors?.length
								? resolveSourceValue(renderData, sourceKey)
								: resolveExpandedSourceValue(renderData, sourceKey);
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
					const sourceKey =
						formatBindingSource(binding) || slots?.[0]?.template.slotName || k;
					const processors = binding?.processors;
					const hasBehavior = behavior?.[sourceKey];
					let v;
					if (hasBehavior) {
						for (const slot of slots) {
							const attrValue = slot.node.getAttribute(slot.attrName);
							v = hasBehavior(this, renderData, attrValue, slot.node);
							if (v === undefined && binding?.defaultValue !== undefined)
								v = binding.defaultValue;
							if (
								this._trackAsyncBehaviorValue(
									`${k}:${slot.attrName}`,
									v,
									(resolved) => {
										let next = resolved;
										if (
											next === undefined &&
											binding?.defaultValue !== undefined
										)
											next = binding.defaultValue;
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
										} else {
											next = resolveRenderableValue(next);
										}
										slot.render(next);
									},
								)
							) {
								continue;
							}
							if (processors?.length) {
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
							} else {
								v = resolveRenderableValue(v);
							}
							slot.render(v);
						}
						continue;
					}
					v = binding
						? resolveBindingValue(renderData, binding, false)
						: resolveSourceValue(renderData, sourceKey);
					if (v === undefined && binding?.defaultValue !== undefined)
						v = binding.defaultValue;
					if (v !== undefined && processors?.length) {
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
					} else if (v !== undefined) {
						v = resolveRenderableValue(v);
					}
					for (const slot of slots) {
						slot.render(v);
					}
				}
			}
			if (this.slots?.length) {
				for (const slot of this.slots) {
					const content = data?.slots?.[slot.name];
					slot.mount(content);
				}
			}
		}
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
		this.syncReactiveDataSubs(data);
		this.data = data;
		this._hasRendered = true;
		return this;
	}
}

setUIInstanceClass(UIInstance);

export { getUIInstance, UIInstance };

// EOF
