// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-06-02

// Module: select/ui/components/template
// Reusable UI template class and template mapping helpers.

import { AppliedUITemplate } from "./model.js";
import { UIInstance } from "./instance.js";
import { TemplateParser } from "../templates.js";
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
// - `initializer`: function? - state factory function
// - `behavior`: Object? - behavior methods map
// - `subs`: Map? - event subscriptions map
class UITemplate {
	constructor(nodes, scope = document, componentName = null) {
		this.nodes = nodes;
		this.scope = scope;
		this.componentName = componentName;
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
		this.outAttr = UITemplateSlot.FindAttr("out:", nodes);
		this.slots = this._findSlots(nodes);
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
					slotNode === root
						? [i]
						: UITemplateSlot.Path(slotNode, root, [i]);
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

	// TODO: There's a question whether we should have Instance instead
	// of clone. We could certainly speed up init.
	// Creates a new UIInstance from this template.
	new(parent, options = undefined) {
		return new UIInstance(this, parent, options);
	}

	// Returns an AppliedUITemplate with this template and `data`.
	apply(data) {
		return new AppliedUITemplate(this, data);
	}

	// Maps `data` through this template, returning array of AppliedUITemplate.
	map(data) {
		return remapCollection(data, (v) => new AppliedUITemplate(this, v));
	}

	// Sets the state initializer function. Called as `init()` returning state.
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
