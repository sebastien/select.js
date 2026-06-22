// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-13

// Module: select/ui/components/template
// Reusable UI template class and template mapping helpers.

import { TemplateParser } from "../templates.js";
import { UIInstance } from "./instance.js";
import { AppliedUITemplate } from "./model.js";
import { UITemplateSlot } from "./slots.js";

function remapCollection(value, f) {
	if (
		value === null ||
		value === undefined ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return value;
	} else if (Array.isArray(value)) {
		const n = value.length;
		const res = new Array(n);
		for (let i = 0; i < n; i++) {
			res[i] = f(value[i], i);
		}
		return res;
	} else if (value instanceof Map) {
		const res = new Map();
		for (const [k, v] of value.entries()) {
			res.set(k, f(v, k));
		}
		return res;
	} else if (value instanceof Set) {
		const res = new Set();
		for (const v of value) {
			res.add(f(v, undefined));
		}
		return res;
	}
	const res = {};
	for (const k in value) {
		res[k] = f(value[k], k);
	}
	return res;
}
// Class: UITemplate
// Defines a reusable UI template parsed from HTML. Discovers slots, bindings,
// and content slots. Provides factory methods for creating instances.
//
// Attributes:
// - `nodes`: Array<Node> - cloned template nodes
// - `on`: Object? - event slots map (handlerName -> [UIEventTemplateSlot])
// - `in`: Object? - input slots map
// - `out`: Object? - output slots map
// - `inout`: Object? - bidirectional slots map
// - `hasBindings`: boolean - true if any binding slots exist
// - `ref`: Object? - reference slots map (single slots, not arrays)
// - `when`: Object? - conditional slots map with predicates
// - `outAttr`: Object? - attribute binding slots map
// - `slots`: Array? - named content slots (<slot name="x">)
// - `webcomponents`: Array? - compiled kebab-case custom element host paths
// - `initializer`: function? - state factory function
// - `behavior`: Object? - behavior methods map
// - `subs`: Map? - event subscriptions map
class UITemplate {
	constructor(nodes, scope = document, componentName = null) {
		this.nodes = nodes;
		this.scope = scope;
		this.componentName = componentName;
		this.lexicalTemplates = undefined;
		this.on = UITemplateSlot.FindEvent("on:", nodes);
		this.in = UITemplateSlot.Find("in", nodes);
		this.when = UITemplateSlot.FindWhen(nodes);
		this.out = UITemplateSlot.MergeMaps(
			UITemplateSlot.Find("out", nodes),
			UITemplateSlot.Find("out-replace", nodes, (slot, key) => {
				const parsed = TemplateParser.ParsePipedBinding(key);
				slot.binding = parsed || {
					sourceKey: `${key || ""}`.trim(),
					processors: [],
				};
				slot.replaceNode = true;
				return slot;
			}),
		);
		this.inout = UITemplateSlot.MergeMaps(
			UITemplateSlot.Find("inout", nodes),
			UITemplateSlot.FindInOutAttr(nodes),
		);
		this.hasBindings = !!(this.on || this.in || this.inout);
		this.ref = UITemplateSlot.Find("ref", nodes);
		this.outAttr = UITemplateSlot.MergeMaps(
			UITemplateSlot.FindAttr("out:", nodes),
			UITemplateSlot.FindAttr("out-", nodes),
		);
		this.slots = this._findSlots(nodes);
		this.webcomponents = this._findWebComponents(nodes);
		this.initializer = undefined;
		this.behavior = undefined;
		this.subs = undefined;
		this.doCleanup = undefined;
	}

	_findSlots(nodes) {
		const slots = [];
		for (let i = 0; i < nodes.length; i++) {
			const root = nodes[i];
			const candidates = [];
			if (root.nodeName === "SLOT") {
				candidates.push(root);
			}
			if (root.querySelectorAll) {
				for (const n of root.querySelectorAll("slot")) {
					candidates.push(n);
				}
			}
			for (const slotNode of candidates) {
				const name = slotNode.getAttribute("name") || "default";
				const fallback = slotNode.childNodes ? [...slotNode.childNodes] : [];
				const path =
					slotNode === root ? [i] : UITemplateSlot.Path(slotNode, root, [i]);
				slots.push({
					name,
					fallback,
					rootIndex: path[0],
					tailPath: path.length > 1 ? path.slice(1) : null,
				});
			}
		}
		return slots.length ? slots : null;
	}

	_findWebComponents(nodes) {
		const webcomponents = [];
		for (let i = 0; i < nodes.length; i++) {
			const root = nodes[i];
			if (!root || root.nodeType !== Node.ELEMENT_NODE) {
				continue;
			}
			const candidates = [];
			if (root.nodeName.includes("-")) {
				candidates.push(root);
			}
			if (root.querySelectorAll) {
				for (const node of root.querySelectorAll("*")) {
					if (node.nodeName.includes("-")) {
						candidates.push(node);
					}
				}
			}
			for (const node of candidates) {
				const path = node === root ? [i] : UITemplateSlot.Path(node, root, [i]);
				webcomponents.push({
					path,
					rootIndex: path[0],
					tailPath: path.length > 1 ? path.slice(1) : null,
					tagName: node.nodeName.toLowerCase(),
				});
			}
		}
		return webcomponents.length ? webcomponents : null;
	}

	// TODO: There's a question whether we should have Instance instead
	// of clone. We could certainly speed up init.
	// Creates a new UIInstance from this template.
	new(parent, options = undefined) {
		return new UIInstance(this, parent, options);
	}

	// Returns an AppliedUITemplate with this template and `data`.
	// If `data` contains a `$key`, this template will attempt to return the
	// same wrapper object for that key on subsequent calls (stable identity),
	// updating the wrapper's data bag. This enables cheap list reuse even when
	// using plain `remap` + `Component({... $key })` in behaviors.
	apply(data) {
		const k = data && typeof data === "object" ? data.$key : undefined;
		if (k != null) {
			const cache = this._applyCache || (this._applyCache = new Map());
			if (cache.has(k)) {
				const at = cache.get(k);
				const prev = at.data;
				if (prev && typeof prev === "object" && !Array.isArray(prev)) {
					for (const kk in prev) if (!(kk in data)) delete prev[kk];
					Object.assign(prev, data);
					prev.$key = k;
					at.data = prev;
				} else {
					at.data = data;
				}
				return at;
			}
			const at = new AppliedUITemplate(this, data);
			cache.set(k, at);
			return at;
		}
		return new AppliedUITemplate(this, data);
	}

	// Maps `data` through this template, returning array (or shaped container) of
	// AppliedUITemplate. Supports optional `processor` to transform each item and
	// optional `key` (string path or function) to compute a stable collection key
	// stored as `$key` in the produced data for efficient list reconciliation.
	//
	// Component.map(data, processor?, key?)
	// - processor: (value, indexOrKey) => dataForItem
	// - key: string (e.g. "id" or ".id") or (value, indexOrKey) => keyValue
	//
	// When neither processor nor key is provided, preserves the classic behavior
	// of wrapping raw items (backward compatible).
	//
	// For list performance, map will return the same wrapper object for a
	// previously seen key (stable identity), updating its data. Use stable keys
	// (not array indices) to keep logical items stable across splices/removes.
	//
	// If the value returned by the processor (or the raw item when no processor)
	// contains a `$key` property, that value is used as the stable collection key
	// for reuse even if no explicit `key` selector is passed.
	map(data, processor, key) {
		if (processor == null && key == null) {
			return remapCollection(data, (v) => new AppliedUITemplate(this, v));
		}
		const keyFn = key == null ? null : (typeof key === "function" ? key : (v) => {
			if (v == null) return undefined;
			const p = String(key).replace(/^\./, "").split(".");
			let c = v;
			for (const seg of p) {
				if (c == null) return undefined;
				c = c[seg];
			}
			return c;
		});
		const cache = this._mapCache || (this._mapCache = new Map());
		return remapCollection(data, (v, i) => {
			let d = processor ? processor(v, i) : v;
			// Determine stable key: explicit key selector wins, else $key in data, else index.
			let k = i;
			if (keyFn) {
				const kk = keyFn(v, i);
				if (kk != null) k = kk;
			} else if (d && typeof d === "object" && d.$key != null) {
				k = d.$key;
			}
			if (d && typeof d === "object") {
				if (d.$key !== k) {
					if (Array.isArray(d)) {
						d = { $value: d, $key: k };
					} else {
						d = { ...d, $key: k };
					}
				}
			} else {
				d = { $: d, $key: k };
			}
			if (k != null && cache.has(k)) {
				const at = cache.get(k);
				const prev = at.data;
				if (prev && typeof prev === "object" && !Array.isArray(prev)) {
					for (const kk in prev) {
						if (!(kk in d)) delete prev[kk];
					}
					Object.assign(prev, d);
					prev.$key = k;
					at.data = prev;
				} else {
					at.data = d;
				}
				return at;
			}
			const at = new AppliedUITemplate(this, d);
			if (k != null) cache.set(k, at);
			return at;
		});
	}

	// Sets the state initializer function. Called as `init()` returning state.
	// Top-level reactives returned from the initializer stay stable by identity
	// for the lifetime of each instance. Plain incoming values write through
	// them, while incoming reactives are fused to them until the incoming
	// reactive reference changes.
	init(init) {
		this.initializer = init;
		return this;
	}

	// Adds behavior methods. Merges with existing behavior.
	does(behavior) {
		this.behavior = Object.assign(this.behavior ?? {}, behavior);
		return this;
	}

	// FIXME: Should be on
	// Subscribes to events. `event` can be string name or object mapping.
	// Handler receives (instance, data, event).
	sub(event, handler = undefined) {
		if (typeof event === "string") {
			if (!handler) {
				return this;
			}
			if (this.subs === undefined) {
				this.subs = new Map();
			}
			if (this.subs.has(event)) {
				this.subs.get(event).push(handler);
			} else {
				this.subs.set(event, [handler]);
			}
		} else {
			for (const k in event) {
				this.sub(k, event[k]);
			}
		}
		return this;
	}

	// Sets the cleanup handler called when an instance is disposed. Passed `(self, data)`.
	cleanup(handler) {
		this.doCleanup = handler;
		return this;
	}
}

export { UITemplate };

// EOF
