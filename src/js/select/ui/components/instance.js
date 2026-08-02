// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-08-03

// Module: select/ui/components/instance
// Mounted UI template instances, lifecycle, and public API. Reactive path,
// render pipeline, and event binding live in sibling modules.

import { log } from "../templates.js"

import { attachEvents } from "./events.js"
import { attachReactive } from "./reactive.js"
import { attachRender } from "./render.js"
import { options } from "./registry.js"
import {
	resolveTemplatePath,
	UI_PARENT_ATTRIBUTE,
} from "./runtime.js"
import { setUIInstanceClass, UIContentSlot, UITemplateSlot } from "./slots.js"

const UI_INSTANCES = new Map()
let uiInstanceId = 0

function createUIInstanceId() {
	uiInstanceId += 1
	return `ui-${uiInstanceId}`
}

function getUIInstance(id) {
	if (typeof id !== "string") {
		return undefined
	}
	const key = id.trim()
	return key ? UI_INSTANCES.get(key) : undefined
}

function registerUIInstance(instance) {
	if (!instance?.id) {
		return instance
	}
	const current = UI_INSTANCES.get(instance.id)
	if (current && current !== instance) {
		log.warn("UIInstance: duplicate instance id, overriding registry entry", {
			id: instance.id,
			current,
			incoming: instance,
		})
	}
	UI_INSTANCES.set(instance.id, instance)
	return instance
}

function unregisterUIInstance(instance) {
	if (!instance?.id) {
		return instance
	}
	if (UI_INSTANCES.get(instance.id) === instance) {
		UI_INSTANCES.delete(instance.id)
	}
	return instance
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
		return resolveTemplatePath(nodes, rootIndex, tailPath);
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
				const node = resolveTemplatePath(
					this.nodes,
					slotDef.rootIndex,
					slotDef.tailPath,
				);
				const tailPath = slotDef.tailPath;
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

	// Unmounts from DOM and disposes resources. Nodes already detached
	// (e.g. `when` placeholders swapped roots) are skipped via parentNode?.
	unmount() {
		this.dispose();
		for (const node of this.nodes) {
			node.parentNode?.removeChild(node);
		}
		return this;
	}

}

attachReactive(UIInstance)
attachRender(UIInstance)
attachEvents(UIInstance)

setUIInstanceClass(UIInstance)

export { getUIInstance, UIInstance }

// EOF
