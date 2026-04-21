// ```
//    _____      __          __     __  ______
//   / ___/___  / /__  _____/ /_   / / / /  _/
//   \__ \/ _ \/ / _ \/ ___/ __/  / / / // /
//  ___/ /  __/ /  __/ /__/ /_   / /_/ // /
// /____/\___/_/\___/\___/\__/   \____/___/
// ```
//
// A standalone, simple and performant UI rendering library, design
// for quickly creating interactive UIs and visualisations.

import { expand } from "./select.cells.js";

export const len = (v) => {
	if (v === undefined || v === null) {
		return 0;
	} else if (Array.isArray(v)) {
		return v.length;
	} else if (typeof v === "string") {
		return v.length;
	} else if (v instanceof Map || v instanceof Set) {
		return v.size;
	} else if (Object.getPrototypeOf(v) === Object.prototype) {
		return Object.keys(v).length;
	}
	return 1;
};

const parser = new DOMParser();
const SLOT_DEFAULT_KEY = "_";

const _isPrunableWhitespaceText = (node) =>
	node &&
	node.nodeType === Node.TEXT_NODE &&
	!/\S/.test(node.data) &&
	/[\n\r\t]/.test(node.data);

const _pruneTemplateWhitespace = (node) => {
	if (!node || !node.childNodes || node.childNodes.length === 0) {
		return;
	}
	for (let i = node.childNodes.length - 1; i >= 0; i--) {
		const child = node.childNodes[i];
		if (_isPrunableWhitespaceText(child)) {
			node.removeChild(child);
		} else {
			_pruneTemplateWhitespace(child);
		}
	}
};

export const type = Object.assign(
	(value) =>
		value === undefined || value === null
			? type.Null
			: Array.isArray(value)
				? type.List
				: Object.getPrototypeOf(value) === Object.prototype
					? type.Dict
					: typeof value === "number"
						? type.Number
						: typeof value === "string"
							? type.String
							: typeof value === "boolean"
								? type.Boolean
								: type.Object,
	{
		Null: 1,
		Number: 2,
		Boolean: 3,
		String: 4,
		Object: 5,
		List: 10,
		Dict: 11,
	},
);

export const remap = (value, f) => {
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
	} else {
		const res = {};
		for (const k in value) {
			res[k] = f(value[k], k);
		}
		return res;
	}
};

const isPlainObject = (v) =>
	v !== null &&
	v !== undefined &&
	typeof v === "object" &&
	Object.getPrototypeOf(v) === Object.prototype;

const eq = (a, b) => {
	if (a === b) {
		return true;
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		return shallowEq(a, b);
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
	}
	return false;
};

const shallowEq = (a, b) => {
	if (a === b) {
		return true;
	}
	if (
		a === null ||
		a === undefined ||
		b === null ||
		b === undefined ||
		typeof a !== "object" ||
		typeof b !== "object" ||
		Array.isArray(a) ||
		Array.isArray(b)
	) {
		return false;
	}
	let count = 0;
	for (const k in a) {
		if (!Object.prototype.hasOwnProperty.call(a, k)) {
			continue;
		}
		count++;
		if (!Object.prototype.hasOwnProperty.call(b, k) || a[k] !== b[k]) {
			return false;
		}
	}
	let countB = 0;
	for (const k in b) {
		if (Object.prototype.hasOwnProperty.call(b, k)) {
			countB++;
		}
	}
	return count === countB;
};

const asText = (value) => {
	// Expand reactive values to their underlying value
	value = expand(value);
	return value === null || value === undefined
		? ""
		: typeof value === "number"
			? `${value}`
			: typeof value === "string"
				? value
				: JSON.stringify(value);
};

const isInputNode = (node) => {
	switch (node.nodeName) {
		case "INPUT":
		case "TEXTAREA":
		case "SELECT":
			return true;
		default:
			return false;
	}
};
const setNodeText = (node, text) => {
	switch (node.nodeType) {
		case Node.TEXT_NODE:
			if (node.data !== text) {
				node.data = text;
			}
			break;
		case Node.ELEMENT_NODE:
			if (isInputNode(node)) {
				if (node.value !== text) {
					node.value = text;
				}
			} else {
				if (node.textContent !== text) {
					node.textContent = text;
				}
			}
			break;
	}
	return node;
};

// class TrackingProxy extends Proxy {
// 	constructor(target) {
// 		super(target, {
// 			get: this.trackAccess.bind(this),
// 		});
// 		this.accessedProperties = new Set();
// 	}
//
// 	trackAccess(target, property) {
// 		this.accessedProperties.add(property);
// 		return target[property];
// 	}
// }

const _createTrackingProxy = (data) => {
	const accessed = new Set();
	return [
		new Proxy(data, {
			get(target, property) {
				accessed.add(property);
				return target[property];
			},
		}),
		accessed,
	];
};

class UIEvent {
	constructor(name, data, origin) {
		this.name = name;
		this.data = data;
		this.origin = origin;
		this.current = undefined;
	}

	stopPropagation() {
		return null;
	}
}

class AppliedUITemplate {
	constructor(template, data) {
		this.template = template;
		this.data = data;
	}
}

// ----------------------------------------------------------------------------
//
// UI TEMPLATE SLOT
//
// ----------------------------------------------------------------------------

class UITemplateSlot {
	// --
	// Returns the list of indices to go from `parent` to `node`.
	static Path(node, parent, path) {
		const res = [];
		while (node !== parent) {
			res.splice(
				0,
				0,
				Array.prototype.indexOf.call(node.parentNode.childNodes, node),
			);
			node = node.parentNode;
		}
		return path ? path.concat(res) : res;
	}

	static Find(name, nodes, processor = undefined) {
		const res = {};
		let count = 0;
		const selector = `[${name}]`;
		const add = (node, parent, i) => {
			const k = node.getAttribute(name);
			node.removeAttribute(name);
			let v = new UITemplateSlot(
				node,
				parent,
				UITemplateSlot.Path(node, parent, [i]),
			);
			v = processor ? processor(v, k) : v;
			if (res[k] === undefined) {
				res[k] = [v];
			} else {
				res[k].push(v);
			}
			count++;
			return res;
		};
		for (let i = 0; i < nodes.length; i++) {
			const parent = nodes[i];
			if (parent.matches?.(selector)) {
				add(parent, parent, i);
			}
			if (parent.querySelectorAll) {
				for (const node of parent.querySelectorAll(`[${name}]`)) {
					add(node, parent, i);
				}
			}
		}
		return count ? res : null;
	}

	constructor(node, parent, path) {
		this.node = node;
		this.parent = parent;
		this.path = path;
		this.rootIndex = path[0];
		this.tailPath = path.length > 1 ? path.slice(1) : null;
		this.predicate = undefined;
		this.predicatePlaceholder = undefined;
	}

	_resolve(nodes) {
		let node = nodes[this.rootIndex];
		if (this.tailPath) {
			for (let i = 0; i < this.tailPath.length; i++) {
				node = node ? node.childNodes[this.tailPath[i]] : node;
			}
		}
		return node;
	}

	apply(nodes, parent, raw = false) {
		const node = this._resolve(nodes);
		return node ? (raw ? node : new UISlot(node, this, parent)) : null;
	}

	// --
	// Finds all attributes starting with `prefix` (e.g., "out:") in the given nodes.
	// Returns a map of slotName -> [UIAttributeTemplateSlot, ...]
	static FindAttr(prefix, nodes) {
		const res = {};
		let count = 0;
		for (let i = 0; i < nodes.length; i++) {
			const parent = nodes[i];
			const processNode = (node) => {
				if (!node.attributes) return;
				const toRemove = [];
				for (const attr of node.attributes) {
					if (attr.name.startsWith(prefix)) {
						const attrName = attr.name.slice(prefix.length); // e.g., "style", "class", "disabled"
						const slotName = attr.value || attrName; // Use attr value or default to attrName
						const originalValue = node.getAttribute(attrName); // Preserve original for additive
						toRemove.push(attr.name);

						const slot = new UIAttributeTemplateSlot(
							node,
							parent,
							UITemplateSlot.Path(node, parent, [i]),
							attrName,
							slotName,
							originalValue,
						);

						if (!res[slotName]) res[slotName] = [];
						res[slotName].push(slot);
						count++;
					}
				}
				for (const name of toRemove) node.removeAttribute(name);
			};
			processNode(parent);
			if (parent.querySelectorAll) {
				for (const node of parent.querySelectorAll("*"))
					processNode(node);
			}
		}
		return count ? res : null;
	}

	// --
	// Finds all attributes starting with `prefix` (e.g., "on:") in the given nodes.
	// Returns a map of handlerName -> [UIEventTemplateSlot, ...]
	// For "on:click" the eventType is "click", handlerName defaults to eventType if no value.
	static FindEvent(prefix, nodes) {
		const res = {};
		let count = 0;
		for (let i = 0; i < nodes.length; i++) {
			const parent = nodes[i];
			const processNode = (node) => {
				if (!node.attributes) return;
				const toRemove = [];
				for (const attr of node.attributes) {
					if (attr.name.startsWith(prefix)) {
						const eventType = attr.name.slice(prefix.length); // e.g., "click", "submit"
						const handlerName = attr.value || eventType; // Default to eventType if no value
						toRemove.push(attr.name);

						const slot = new UIEventTemplateSlot(
							node,
							parent,
							UITemplateSlot.Path(node, parent, [i]),
							eventType,
							handlerName,
						);

						if (!res[handlerName]) res[handlerName] = [];
						res[handlerName].push(slot);
						count++;
					}
				}
				for (const name of toRemove) node.removeAttribute(name);
			};
			processNode(parent);
			if (parent.querySelectorAll) {
				for (const node of parent.querySelectorAll("*"))
					processNode(node);
			}
		}
		return count ? res : null;
	}
}

// ----------------------------------------------------------------------------
//
// UI ATTRIBUTE TEMPLATE SLOT
//
// ----------------------------------------------------------------------------

class UIAttributeTemplateSlot {
	constructor(node, parent, path, attrName, slotName, originalValue) {
		this.node = node;
		this.parent = parent;
		this.path = path;
		this.rootIndex = path[0];
		this.tailPath = path.length > 1 ? path.slice(1) : null;
		this.attrName = attrName;
		this.slotName = slotName;
		this.originalValue = originalValue;
	}

	_resolve(nodes) {
		let node = nodes[this.rootIndex];
		if (this.tailPath) {
			for (let i = 0; i < this.tailPath.length; i++) {
				node = node ? node.childNodes[this.tailPath[i]] : node;
			}
		}
		return node;
	}

	apply(nodes, parent) {
		const node = this._resolve(nodes);
		return node ? new UIAttributeSlot(node, this, parent) : null;
	}
}

// ----------------------------------------------------------------------------
//
// UI ATTRIBUTE SLOT
//
// ----------------------------------------------------------------------------

class UIAttributeSlot {
	constructor(node, template, parent) {
		this.node = node;
		this.template = template;
		this.parent = parent;
		this.attrName = template.attrName;
		// Store original classes/styles for additive behavior
		this.originalClasses =
			template.attrName === "class"
				? new Set(
						(template.originalValue || "")
							.split(/\s+/)
							.filter(Boolean),
					)
				: null;
		this.originalStyle =
			template.attrName === "style" ? template.originalValue || "" : null;
		this.appliedClasses = new Set(); // Track what we've added
		this.appliedStyles = new Map(); // Track style properties we've set
	}

	render(value) {
		if (this.attrName === "class") {
			this._renderClass(value);
		} else if (this.attrName === "style") {
			this._renderStyle(value);
		} else {
			this._renderAttr(value);
		}
	}

	_renderClass(...values) {
		// Remove previously applied classes (but keep original template classes)
		for (const cls of this.appliedClasses) {
			if (!this.originalClasses.has(cls)) {
				this.node.classList.remove(cls);
			}
		}
		this.appliedClasses.clear();

		const classes = [];

		const flatten = (value) => {
			if (value == null) return;
			if (typeof value === "boolean") return;
			if (typeof value === "string") {
				const parts = value.trim().split(/\s+/);
				for (const part of parts) {
					if (part) classes.push(part);
				}
				return;
			}
			if (Array.isArray(value)) {
				for (const item of value) {
					flatten(item);
				}
				return;
			}
			if (typeof value === "object") {
				for (const [cls, enabled] of Object.entries(value)) {
					if (enabled && cls && typeof cls === "string") {
						const trimmed = cls.trim();
						if (trimmed) classes.push(trimmed);
					}
				}
			}
		};

		for (const value of values) {
			flatten(value);
		}

		for (const cls of classes) {
			this.node.classList.add(cls);
			this.appliedClasses.add(cls);
		}
	}

	_renderStyle(value) {
		// Remove previously applied styles
		for (const prop of this.appliedStyles.keys()) {
			this.node.style.removeProperty(prop);
		}
		this.appliedStyles.clear();

		// Re-apply original inline styles if they were removed
		if (this.originalStyle) {
			const tempDiv = document.createElement("div");
			tempDiv.style.cssText = this.originalStyle;
			for (const prop of tempDiv.style) {
				if (!this.node.style.getPropertyValue(prop)) {
					this.node.style.setProperty(
						prop,
						tempDiv.style.getPropertyValue(prop),
					);
				}
			}
		}

		if (value == null) return;

		if (typeof value === "object") {
			// Object format: { backgroundColor: 'red', padding: '10px' }
			for (const [prop, val] of Object.entries(value)) {
				if (val != null) {
					// Convert camelCase to kebab-case
					const kebabProp = prop
						.replace(/([A-Z])/g, "-$1")
						.toLowerCase();
					this.node.style.setProperty(kebabProp, val);
					this.appliedStyles.set(kebabProp, val);
				}
			}
		} else {
			// String format: "background-color: red; padding: 10px"
			const tempDiv = document.createElement("div");
			tempDiv.style.cssText = value;
			for (const prop of tempDiv.style) {
				const val = tempDiv.style.getPropertyValue(prop);
				this.node.style.setProperty(prop, val);
				this.appliedStyles.set(prop, val);
			}
		}
	}

	_renderAttr(value) {
		if (value == null || value === false) {
			this.node.removeAttribute(this.attrName);
		} else if (value === true) {
			this.node.setAttribute(this.attrName, "");
		} else {
			this.node.setAttribute(this.attrName, String(value));
		}
	}
}

// ----------------------------------------------------------------------------
//
// UI EVENT TEMPLATE SLOT
//
// ----------------------------------------------------------------------------

class UIEventTemplateSlot {
	constructor(node, parent, path, eventType, handlerName) {
		this.node = node;
		this.parent = parent;
		this.path = path;
		this.rootIndex = path[0];
		this.tailPath = path.length > 1 ? path.slice(1) : null;
		this.eventType = eventType;
		this.handlerName = handlerName;
	}

	_resolve(nodes) {
		let node = nodes[this.rootIndex];
		if (this.tailPath) {
			for (let i = 0; i < this.tailPath.length; i++) {
				node = node ? node.childNodes[this.tailPath[i]] : node;
			}
		}
		return node;
	}

	apply(nodes, parent) {
		const node = this._resolve(nodes);
		return node ? new UIEventSlot(node, this, parent) : null;
	}
}

// ----------------------------------------------------------------------------
//
// UI EVENT SLOT
//
// ----------------------------------------------------------------------------

class UIEventSlot {
	constructor(node, template, parent) {
		this.node = node;
		this.template = template;
		this.parent = parent;
		this.eventType = template.eventType;
		this.handlerName = template.handlerName;
	}
}

// ----------------------------------------------------------------------------
//
// UI TEMPLATE
//
// ----------------------------------------------------------------------------

class UITemplate {
	constructor(nodes) {
		this.nodes = nodes;
		// Slots, will be processed by instance
		this.on = UITemplateSlot.FindEvent("on:", nodes);
		this.in = UITemplateSlot.Find("in", nodes);
		this.out = UITemplateSlot.Find("out", nodes);
		this.inout = UITemplateSlot.Find("inout", nodes);
		this.hasBindings = !!(this.on || this.in || this.inout);
		this.ref = UITemplateSlot.Find("ref", nodes);
		this.when = UITemplateSlot.Find("when", nodes, (slot, expr) => {
			slot.predicate = new Function(
				`return ((self,data,event)=>(${expr}))`,
			)();
			slot.predicatePlaceholder = document.createComment(expr);
			return slot;
		});
		// Attribute slots (out:style, out:class, out:disabled, etc.)
		this.outAttr = UITemplateSlot.FindAttr("out:", nodes);
		// Named content slots (<slot name="x">)
		this.slots = this._findSlots(nodes);
		// Interaction/Behavior (accessed from UIInstance)
		this.initializer = undefined;
		this.behavior = undefined;
		this.subs = undefined;
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
				const placeholder = document.createComment(`slot:${name}`);
				if (slotNode === root) {
					nodes[i] = placeholder;
					slots.push({ name, fallback, rootIndex: i, tailPath: null });
				} else {
					slotNode.parentNode.replaceChild(placeholder, slotNode);
					const path = UITemplateSlot.Path(placeholder, root, [i]);
					slots.push({
						name,
						fallback,
						rootIndex: path[0],
						tailPath: path.length > 1 ? path.slice(1) : null,
					});
				}
			}
		}
		return slots.length ? slots : null;
	}

	// TODO: There's a question whether we should have Instance instead
	// of clone. We could certainly speed up init.
	new(parent) {
		return new UIInstance(this, parent);
	}

	apply(data) {
		return new AppliedUITemplate(this, data);
	}

	map(data) {
		return remap(data, (v) => new AppliedUITemplate(this, v));
	}

	// ========================================================================
	// BEHAVIOUR
	// ========================================================================

	init(init) {
		this.initializer = init;
		return this;
	}

	does(behavior) {
		this.behavior = Object.assign(this.behavior ?? {}, behavior);
		return this;
	}

	// ========================================================================
	// EVENTS
	// ========================================================================

	// FIXME: Should be on
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
}

// ----------------------------------------------------------------------------
//
// UI SLOT
//
// ----------------------------------------------------------------------------

// --
// Manages the content that gets rendered in an output.
class UISlot {
	constructor(node, template, parent) {
		this.parent = parent;
		this.node = node;
		this.isInput = isInputNode(node);
		this.mapping = new Map();
		this.placeholder =
			node.childNodes && node.childNodes.length > 0
				? [...node.childNodes]
				: null;
		this._extractedSlots = undefined;
		this._hasNamedSlotContent = undefined;
		this.predicatePlaceholder =
			template.predicate && template.predicatePlaceholder
				? template.predicatePlaceholder.cloneNode(true)
				: null;
		this.template = template;
	}

	// --
	// Helper to mount a UIInstance at a specific position within this.node,
	// using nextNode as the insertion reference. If nextNode is null or
	// detached, appends to the end.
	_mountInstance(instance, nextNode) {
		const fragment = document.createDocumentFragment();
		for (let i = 0; i < instance.nodes.length; i++) {
			fragment.appendChild(instance.nodes[i]);
		}
		if (nextNode && nextNode.parentNode === this.node) {
			this.node.insertBefore(fragment, nextNode);
		} else {
			this.node.appendChild(fragment);
		}
	}

	// --
	// Scans placeholder children for slot="name" attributes and extracts
	// them into a slots map for passing to child components.
	_extractSlots() {
		if (this._extractedSlots !== undefined) {
			return this._extractedSlots;
		}
		if (!this.placeholder) {
			this._extractedSlots = null;
			return null;
		}
		const slots = {};
		let hasSlots = false;
		const scan = (node) => {
			if (
				node.nodeType === Node.ELEMENT_NODE &&
				node.hasAttribute("slot")
			) {
				const name = node.getAttribute("slot");
				const clone = node.cloneNode(true);
				clone.removeAttribute("slot");
				slots[name] = clone;
				hasSlots = true;
			}
			if (node.querySelectorAll) {
				for (const child of node.querySelectorAll("[slot]")) {
					scan(child);
				}
			}
		};
		for (const node of this.placeholder) {
			scan(node);
		}
		this._extractedSlots = hasSlots ? slots : null;
		return this._extractedSlots;
	}

	// --
	// Merges template-extracted slots with explicitly provided slots.
	_mergeSlots(item) {
		const providedSlots = item.data?.slots;
		if (!providedSlots && !this._hasSlotContent()) {
			return item.data;
		}
		const extracted = this._extractSlots();
		if (providedSlots && extracted) {
			return { ...item.data, slots: { ...extracted, ...providedSlots } };
		} else if (providedSlots) {
			return item.data;
		} else if (!extracted) {
			return item.data;
		}
		return { ...item.data, slots: extracted };
	}

	_hasSlotContent() {
		if (this._hasNamedSlotContent !== undefined) {
			return this._hasNamedSlotContent;
		}
		if (!this.placeholder || this.placeholder.length === 0) {
			this._hasNamedSlotContent = false;
			return false;
		}
		for (let i = 0; i < this.placeholder.length; i++) {
			const node = this.placeholder[i];
			if (node.nodeType !== Node.ELEMENT_NODE) {
				continue;
			}
			if (node.hasAttribute("slot") || node.querySelector("[slot]")) {
				this._hasNamedSlotContent = true;
				return true;
			}
		}
		this._hasNamedSlotContent = false;
		return false;
	}

	_removeMappedValue(v) {
		if (v instanceof UIInstance) {
			v.unmount();
		} else if (v !== this.node) {
			v.parentNode?.removeChild(v);
		}
	}

	_clearMapped() {
		for (const v of this.mapping.values()) {
			this._removeMappedValue(v);
		}
		this.mapping.clear();
		this._listLength = 0;
	}

	_renderMapped(k, item, previous) {
		const existing = this.mapping.get(k);
		if (existing === undefined) {
			// Creation: we don't have mapping for the item
			let r;
			if (item instanceof AppliedUITemplate) {
				const data = this._mergeSlots(item);
				r = item.template.new(this.parent);
				r.set(data, k).mount(this.node, previous);
				previous = r.nodes[r.nodes.length - 1];
			} else if (this.isInput) {
				setNodeText(this.node, asText(item));
				r = this.node;
			} else if (item instanceof Node) {
				// TODO: Insert after previous
				this.node.appendChild(item);
				r = item;
			} else {
				r = document.createTextNode(asText(item));
				// TODO: Use mount and sibling
				this.node.appendChild(r);
				previous = r;
			}
			this.mapping.set(k, r);
		} else {
			// Update: we do have a key like that
			const r = existing;
			if (r instanceof UIInstance) {
				if (item instanceof AppliedUITemplate) {
					if (item.template === r.template) {
						r.update(item.data);
					} else {
						// Different template: unmount old, mount new at same position
						const data = this._mergeSlots(item);
						const lastNode = r.nodes[r.nodes.length - 1];
						const nextNode = lastNode ? lastNode.nextSibling : null;
						r.unmount();
						const newInstance = item.template.new(this.parent);
						newInstance.set(data, k);
						this._mountInstance(newInstance, nextNode);
						this.mapping.set(k, newInstance);
					}
				} else {
					r.update(item);
				}
			} else if (this.isInput) {
				setNodeText(this.node, asText(item));
			} else if (r?.nodeType === Node.ELEMENT_NODE) {
				if (item instanceof AppliedUITemplate) {
					const data = this._mergeSlots(item);
					const nextNode = r.nextSibling;
					r.parentNode.removeChild(r);
					const newInstance = item.template.new(this.parent);
					newInstance.set(data, k);
					this._mountInstance(newInstance, nextNode);
					this.mapping.set(k, newInstance);
				} else if (item instanceof Node) {
					r.parentNode.replaceChild(item, r);
					this.mapping.set(k, item);
				} else {
					const t = document.createTextNode(asText(item));
					r.parentNode.replaceChild(t, r);
					this.mapping.set(k, t);
				}
			} else {
				if (item instanceof AppliedUITemplate) {
					const data = this._mergeSlots(item);
					const nextNode = r.nextSibling;
					r.parentNode.removeChild(r);
					const newInstance = item.template.new(this.parent);
					newInstance.set(data, k);
					this._mountInstance(newInstance, nextNode);
					this.mapping.set(k, newInstance);
				} else if (item instanceof Node) {
					r.parentNode.replaceChild(item, r);
					this.mapping.set(k, item);
				} else {
					setNodeText(r, asText(item));
				}
			}
			// TODO: We may want to ensure the order is as expected
		}
		return previous;
	}


	// --
	// Renders a slot, which is either replacing the content of the node
	// with an HTML/text value from the data, or creating one or more
	// `UIInstance` in case the data returns an applied template or
	// a collection of applied templates.
	render(data) {
		const isList = Array.isArray(data);
		const isDict =
			!isList &&
			data !== null &&
			data !== undefined &&
			Object.getPrototypeOf(data) === Object.prototype;
		let isEmpty = data === null || data === undefined || data === "";
		if (isList) {
			isEmpty = data.length === 0;
		} else if (isDict) {
			isEmpty = true;
			for (const k in data) {
				if (Object.prototype.hasOwnProperty.call(data, k)) {
					isEmpty = false;
					break;
				}
			}
		}

		if (isEmpty) {
			if (this.placeholder && !this.placeholder[0]?.parentNode) {
				let previous = this.node.childNodes[0];
				for (const node of this.placeholder) {
					if (!previous || !previous.nextSibling) {
						this.node.appendChild(node);
					} else {
						this.node.insertBefore(node, previous.nextSibling);
					}
					previous = node;
				}
			}
		} else if (this.placeholder?.[0]?.parentNode) {
			for (const n of this.placeholder) {
				n.parentNode?.removeChild(n);
			}
		}
		const kind = isList ? 1 : isDict ? 2 : 0;
		if (this._kind !== undefined && this._kind !== kind) {
			this._clearMapped();
		}
		this._kind = kind;
		let previous = null;

		if (isList) {
			for (let i = 0; i < data.length; i++) {
				previous = this._renderMapped(i, data[i], previous);
			}
			const previousLength = this._listLength || 0;
			for (let i = data.length; i < previousLength; i++) {
				const v = this.mapping.get(i);
				if (v !== undefined) {
					this._removeMappedValue(v);
					this.mapping.delete(i);
				}
			}
			this._listLength = data.length;
		} else if (isDict) {
			for (const k in data) {
				previous = this._renderMapped(k, data[k], previous);
			}
			for (const [k, v] of this.mapping.entries()) {
				if (data[k] === undefined) {
					this._removeMappedValue(v);
					this.mapping.delete(k);
				}
			}
			this._listLength = 0;
		} else {
			previous = this._renderMapped(SLOT_DEFAULT_KEY, data, previous);
			for (const [k, v] of this.mapping.entries()) {
				if (k !== SLOT_DEFAULT_KEY) {
					this._removeMappedValue(v);
					this.mapping.delete(k);
				}
			}
			this._listLength = 0;
		}
	}

	show() {
		// TODO: Edge case when the slot is a direct node in the instance `.nodes`.
		if (this.predicatePlaceholder?.parentNode) {
			this.predicatePlaceholder.parentNode.replaceChild(
				this.node,
				this.predicatePlaceholder,
			);
		}
		return this;
	}

	hide() {
		// TODO: Edge case when the slot is a direct node in the instance `.nodes`.
		if (this.predicatePlaceholder && this.node.parentNode) {
			this.node.parentNode.replaceChild(
				this.predicatePlaceholder,
				this.node,
			);
		}
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// UI CONTENT SLOT (for <slot name="x">)
//
// ----------------------------------------------------------------------------

class UIContentSlot {
	constructor(placeholder, fallback, parent, name) {
		this.placeholder = placeholder;
		this.fallback = fallback ? fallback.map((n) => n.cloneNode(true)) : [];
		this.parent = parent;
		this.name = name;
		this.content = null;
		this.fallbackActive = false;
		this._lastWasFallback = false;
		this._lastContent = undefined;
		this._lastContentType = 0;
	}

	mount(content) {
		if (!content) {
			if (this.fallback.length) {
				if (!this._lastWasFallback) {
					this._clear();
					this._mountFallback();
				}
				this._lastWasFallback = true;
				this._lastContent = undefined;
				this._lastContentType = 0;
				return;
			}
			if (this._lastWasFallback || this.content) {
				this._clear();
			}
			this._lastWasFallback = false;
			this._lastContent = undefined;
			this._lastContentType = 0;
			return;
		}

		const contentType =
			content instanceof AppliedUITemplate
				? 1
				: content instanceof Node
					? 2
					: 3;

		if (contentType === 1) {
			if (
				this.content instanceof UIInstance &&
				this.content.template === content.template &&
				shallowEq(this._lastContent, content.data)
			) {
				this._lastWasFallback = false;
				this._lastContent = content.data;
				this._lastContentType = contentType;
				return;
			}
		} else if (contentType === 2) {
			if (this.content === content && !this._lastWasFallback) {
				return;
			}
		} else if (
			this._lastContentType === 3 &&
			this._lastContent === content &&
			!this._lastWasFallback
		) {
			return;
		}

		this._clear();
		this._mountContent(content);
		this._lastWasFallback = false;
		this._lastContent = contentType === 1 ? content.data : content;
		this._lastContentType = contentType;
	}

	_mountContent(content) {
		const parent = this.placeholder.parentNode;
		if (!parent) return;
		const ref = this.placeholder.nextSibling;
		if (content instanceof AppliedUITemplate) {
			const instance = content.template.new(this.parent);
			instance.set(content.data);
			for (const n of instance.nodes) {
				parent.insertBefore(n, ref);
			}
			this.content = instance;
		} else if (content instanceof Node) {
			parent.insertBefore(content, ref);
			this.content = content;
		} else {
			const text = document.createTextNode(asText(content));
			parent.insertBefore(text, ref);
			this.content = text;
		}
	}

	_mountFallback() {
		const parent = this.placeholder.parentNode;
		if (!parent) return;
		const ref = this.placeholder.nextSibling;
		for (const n of this.fallback) {
			parent.insertBefore(n, ref);
		}
		this.fallbackActive = true;
	}

	_clear() {
		if (this.content instanceof UIInstance) {
			this.content.unmount();
		} else if (this.content?.parentNode) {
			this.content.parentNode.removeChild(this.content);
		}
		this.content = null;
		if (this.fallbackActive) {
			for (const n of this.fallback) {
				n.parentNode?.removeChild(n);
			}
			this.fallbackActive = false;
		}
		this._lastWasFallback = false;
		this._lastContent = undefined;
		this._lastContentType = 0;
	}
}

// ----------------------------------------------------------------------------
//
// UI INSTANCE
//
// ----------------------------------------------------------------------------

// --
// An instance of a template, manages inputs, outputs, event dispatching
// and state.
class UIInstance {
	static _compileSlotApplier(slots, rawSingle = false) {
		if (!slots) {
			return null;
		}
		const keys = [];
		const groups = [];
		for (const key in slots) {
			keys.push(key);
			groups.push(slots[key]);
		}
		if (keys.length === 0) {
			return null;
		}
		return (nodes, parent) => {
			const res = {};
			for (let i = 0; i < keys.length; i++) {
				const source = groups[i];
				const mapped = new Array(source.length);
				for (let j = 0; j < source.length; j++) {
					mapped[j] = source[j].apply(nodes, parent, rawSingle);
				}
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
			out: UIInstance._compileSlotApplier(template.out),
			inout: UIInstance._compileSlotApplier(template.inout),
			ref: UIInstance._compileSlotApplier(template.ref, true),
			on: UIInstance._compileSlotApplier(template.on),
			when: UIInstance._compileSlotApplier(template.when),
			outAttr: UIInstance._compileSlotApplier(template.outAttr),
		};
		return template._compiledSlotAppliers;
	}

	constructor(template, parent) {
		// Parent
		this.template = template;
		const compiled = UIInstance._ensureCompiled(template);
		// FIXME: This is on the hotpath
		this.nodes = new Array(template.nodes.length);
		for (let i = 0; i < template.nodes.length; i++) {
			this.nodes[i] = template.nodes[i].cloneNode(true);
		}
		this.in = compiled.in ? compiled.in(this.nodes, this) : null;
		this.out = compiled.out ? compiled.out(this.nodes, this) : null;
		this.inout = compiled.inout ? compiled.inout(this.nodes, this) : null;
		this.ref = compiled.ref ? compiled.ref(this.nodes, this) : null;
		this.on = compiled.on ? compiled.on(this.nodes, this) : null;
		this.when = compiled.when ? compiled.when(this.nodes, this) : null;
		// Attribute slots (out:style, out:class, etc.)
		this.outAttr = compiled.outAttr ? compiled.outAttr(this.nodes, this) : null;
		// Content slots (<slot name="x">)
		this.slots = null;
		if (template.slots) {
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
					this.slots.push(
						new UIContentSlot(
							node,
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
		this.parent = parent;
		this.children = undefined;
		if (parent) {
			if (!parent.children) {
				parent.children = new Set();
			}
			parent.children.add(this);
		}
		// Data & State
		if (template.hasBindings) {
			this.bind();
		}
		this._renderer = undefined;
		if (template.initializer) {
			const state = template.initializer();
			if (state) {
				const renderer = this._getRenderer();
				for (const k in state) {
					const v = state[k];
					if (v?.isReactive) {
						// FIXME: This does a FULL render, even on a single
						// cell change.
						v.sub(renderer);
					}
				}
				this.initial = state;
			}
			this.set(state);
		}
	}

	_getRenderer() {
		if (!this._renderer) {
			this._renderer = () => this.render();
		}
		return this._renderer;
	}

	// ========================================================================
	// BEHAVIOR
	// ========================================================================

	dispose() {
		if (this.initial) {
			const renderer = this._renderer;
			for (const k in this.initial) {
				const v = this.initial[k];
				if (v?.isReactive && renderer) {
					// FIXME: This does a FULL render, even on a single
					// cell change.
					v.unsub(renderer);
				}
			}
		}
		// Unsubscribe from context cells
		if (this._ctxSubs) {
			for (const [cell, handler] of this._ctxSubs) {
				cell.unsub(handler);
			}
			this._ctxSubs = undefined;
		}
		// Recursively dispose children
		if (this.children) {
			for (const child of this.children) {
				child.dispose();
			}
			this.children.clear();
			this.children = undefined;
		}
		// Remove from parent's children set
		this.parent?.children?.delete(this);
	}

	// ========================================================================
	// CONTEXT (Provider/Inject)
	// ========================================================================

	provide(key, value) {
		if (this._context === undefined) {
			this._context = new Map();
		}
		this._context.set(key, value);
		return this;
	}

	inject(key, defaultValue = undefined) {
		let current = this.parent;
		while (current) {
			if (current._context?.has(key)) {
				const value = current._context.get(key);
				// Auto-subscribe to reactive cells for re-rendering
				if (value?.isReactive) {
					if (this._ctxSubs === undefined) {
						this._ctxSubs = new Map();
					}
					// Avoid duplicate subscriptions
					if (!this._ctxSubs.has(value)) {
						const handler = () => this.render();
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

	bind() {
		// We bind the event handlers for on: slots (explicit event type)
		for (const k in this.on) {
			for (const slot of this.on[k]) {
				this._bindEvent(k, slot);
			}
		}
		// We bind the event handlers for in/inout slots (inferred event type)
		for (const set of [this.in, this.inout]) {
			for (const k in set) {
				for (const slot of set[k]) {
					this._bindInput(k, slot);
				}
			}
		}
	}

	// Binds an event slot with explicit event type (on:click, on:submit, etc.)
	_bindEvent(name, target, handler = this.template.behavior[name]) {
		if (handler) {
			target.node.addEventListener(target.eventType, (event) => {
				// Arguments are (self,data,event)
				const result = handler(this, this.data || {}, event);
				// If handler returns an object, update reactive cells in data
				if (result && typeof result === "object" && !Array.isArray(result)) {
					for (const key in result) {
						const cell = this.data?.[key];
						if (cell?.isReactive) {
							cell.set(result[key]);
						}
					}
				}
			});
		}
	}

	// Binds an input slot with inferred event type (in, inout)
	_bindInput(name, target, handler = this.template.behavior[name]) {
		if (handler) {
			let event;
			switch (target.node.nodeName) {
				case "INPUT":
				case "TEXTAREA":
				case "SELECT":
					event = "input";
					break;
				case "FORM":
					event = "submit";
					break;
				default:
					event = "click";
			}
			target.node.addEventListener(event, (event) =>
				// Arguments are (self,data,event)
				handler(this, this.data || {}, event),
			);
		}
	}

	// ========================================================================
	// DATA/STATE
	// ========================================================================

	set(data, key = this.key) {
		this.key = key;
		this.render(data);
		return this;
	}

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
					const renderer = this._getRenderer();
					same = false;
					if (!changedKeys) {
						changedKeys = new Set();
					}
					changedKeys.add(k);
					// We sub/unsub if there's a reactive cell in the update
					if (existing?.isReactive) {
						existing.unsub(renderer);
					}
					if (updated?.isReactive) {
						updated.sub(renderer);
					}
				}
			}
		}
		if (!same) {
			const merged = this.data && typeof this.data === "object"
				? Object.assign(this.data, data)
				: data;
			this.render(merged, changedKeys);
		}
		return this;
	}

	_depsChanged(deps, changedKeys) {
		for (const key of deps) {
			if (changedKeys.has(key)) {
				return true;
			}
		}
		return false;
	}

	// ========================================================================
	// PUB/SUB
	// ========================================================================

	send(event, data) {
		return this.pub(event, data);
	}

	emit(event, data) {
		return this.pub(event, data);
	}

	pub(event, data) {
		const res = new UIEvent(event, data, this);
		this.parent?.onPub(res);
		return res;
	}

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

	onPub(event) {
		event.current = this;
		let propagate = true;
		// Check runtime subscriptions first
		if (this._runtimeSubs) {
			const rl = this._runtimeSubs.get(event.name);
			if (rl) {
				for (const h of rl) {
					const c = h(this, this.data, event);
					if (c === false) {
						return event;
					} else if (c === null) {
						propagate = false;
					}
				}
			}
		}
		// Then check template-defined subscriptions
		if (propagate && this.template.subs) {
			const hl = this.template.subs.get(event.name);
			if (hl) {
				for (const h of hl) {
					// We do an early exit when `false` is returned, Or stop propagation on `null`
					const c = h(this, this.data, event);
					if (c === false) {
						return event;
					} else if (c === null) {
						propagate = false;
					}
				}
			}
		}
		propagate && this.parent?.onPub(event);
		return event;
	}

	// ========================================================================
	// RENDERING
	// ========================================================================

	mount(node, previous) {
		if (typeof node === "string") {
			const n = document.querySelector(node);
			if (!n) {
				console.error(
					"Selector is empty, cannot mounted component",
					node,
					{ component: this.template },
				);
				return this;
			} else {
				node = n;
			}
		}
		if (node) {
			if (this.nodes[0].parentNode !== node) {
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
				console.warn("Already mounted", this.nodes);
			}
		} else {
			console.warn("Unable to mount as node is undefined", {
				node,
				self: this,
			});
			for (const node of this.nodes) {
				node.parentNode?.removeChild(node);
			}
		}

		return this;
	}

	unmount() {
		// TODO: Speedup: if the first node is not mounted, the rest is not.
		// FIXME: Some root slots would have their node replaced by a placeholder
		this.dispose();
		for (const node of this.nodes) {
			node.parentNode?.removeChild(node);
		}
		return this;
	}

	// --
	// Renders the given data, using `create`, `update` and `remove`
	// functions
	// TODO: Should take a "changes" and know which behaviour should be updated
	render(data = this.data, changedKeys = null) {
		if (!this.template) {
			console.error(
				"UIInstance.render() called on instance with undefined template",
				{ instance: this },
			);
			return this;
		}

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
			// By default, unless we have output slots, we render the data
			// as text and put it in the first node.
			const text = asText(data);
			for (const node of this.nodes) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					setNodeText(node, text);
					break;
				}
			}
			// TODO: Or text node if not set
		} else {
			// Apply the behavior for the inout/out fields.
			// TODO: This is where there may be loops and where there's a need
			// for optimisation
			const behavior = this.template.behavior;
			const renderSet = (set) => {
				if (!set) {
					return;
				}
				for (const k in set) {
					let v;
					const hasBehavior = behavior?.[k];

					// Granular skip: if no dependency changed, reuse cached value
					if (isGranular && this._behaviorDeps && this._behaviorValues) {
						const deps = this._behaviorDeps.get(k);
						if (deps && !this._depsChanged(deps, changedKeys)) {
							v = this._behaviorValues.get(k);
							for (const slot of set[k]) {
								slot.render(v);
							}
							continue;
						}
					}

					if (hasBehavior) {
						if (isGranular) {
							const [trackedData, accessed] = _createTrackingProxy(data);
							v = hasBehavior(this, trackedData, null);
							if (!this._behaviorDeps) {
								this._behaviorDeps = new Map();
							}
							this._behaviorDeps.set(k, accessed);
							if (!this._behaviorValues) {
								this._behaviorValues = new Map();
							}
							this._behaviorValues.set(k, v);
						} else {
							v = hasBehavior(this, data, null);
						}
					} else if (data && k in data) {
						// Use corresponding property from data if no behavior defined
						v = expand(data[k]);
					} else {
						v = undefined;
					}

					for (const slot of set[k]) {
						slot.render(v);
					}
				}
			};

			renderSet(this.out);
			renderSet(this.inout);
			renderSet(this.in);
			for (const k in this.when) {
				for (const slot of this.when[k]) {
					if (slot.template.predicate(this, data)) {
						slot.show();
					} else {
						slot.hide();
					}
				}
			}
			// Render attribute slots (out:style, out:class, etc.)
			for (const k in this.outAttr) {
				let v;
				const b = behavior?.[k];
				if (b) {
					for (const slot of this.outAttr[k]) {
						const attrValue = slot.node.getAttribute(slot.attrName);
						// Handler signature: (self, data, attrValue, node)
						v = b(this, data, attrValue, slot.node);
						slot.render(v);
					}
					continue; // Already rendered in the loop above
				} else if (data && k in data) {
					// Use corresponding property from data if no behavior defined
					v = expand(data[k]);
				}
				for (const slot of this.outAttr[k]) {
					slot.render(v);
				}
			}
			// Render named content slots (<slot name="x">)
			if (this.slots?.length) {
				for (const slot of this.slots) {
					const content = data?.slots?.[slot.name];
					slot.mount(content);
				}
			}
		}
		this.data = data;
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// API
//
// ----------------------------------------------------------------------------

// --
// Component registry for Dynamic() resolution
const _registry = new Map();

export const Dynamic = (type, props = {}) => {
	const component = typeof type === "string" ? _registry.get(type) : type;
	return component ? component(props) : null;
};

export const lazy = (loader, placeholder = null) => {
	let tmpl = null;
	let loading = false;
	return (data) => {
		if (!tmpl && !loading) {
			loading = true;
			loader().then((m) => {
				tmpl = m.default || m;
			});
		}
		return tmpl ? tmpl(data) : placeholder;
	};
};

export const ui = (selection, scope = document) => {
	if (selection === null || selection === undefined) {
		throw new Error(
			`ui() received ${selection === null ? "null" : "undefined"} as selection. ` +
				`Expected a CSS selector string, an HTML string starting with "<", ` +
				`a DOM Node, or an array of DOM Nodes. ` +
				`Example: ui("#container") or ui("<div>Hello</div>")`,
		);
	}

	if (typeof selection === "string") {
		let nodes = [];
		if (/\s*</.test(selection)) {
			// We support parsing HTML
			const doc = parser.parseFromString(selection, "text/html");
			_pruneTemplateWhitespace(doc.body);
			nodes = [...doc.body.childNodes];
		} else {
			for (const node of document.querySelectorAll(selection)) {
				if (node.nodeName === "TEMPLATE") {
					nodes = [...nodes, ...node.content.childNodes];
				} else {
					nodes.push(node);
				}
			}
		}
		if (nodes.length === 0) {
			console.warn(
				`ui() selector "${selection}" did not match any elements`,
				{ scope },
			);
		}
		// TODO: Should retrieve id and assign a name.
		const tmpl = new UITemplate(nodes);
		const component = (...args) => tmpl.apply(...args);
		Object.assign(component, {
			isTemplate: true,
			template: tmpl,
			new: (...args) => tmpl.new(...args),
			init: (...args) => {
				tmpl.init(...args);
				return component;
			},
			map: (...args) => {
				tmpl.map(...args);
				return component;
			},
			apply: (...args) => {
				tmpl.apply(...args);
				return component;
			},
			does: (...args) => {
				tmpl.does(...args);
				return component;
			},
			on: (...args) => {
				tmpl.sub(...args);
				return component;
			},
			sub: (...args) => {
				tmpl.sub(...args);
				return component;
			},
		});
		return component;
	}

	if (selection instanceof Node || Array.isArray(selection)) {
		const nodes = selection instanceof Node ? [selection] : selection;
		const tmpl = new UITemplate([...nodes]);
		const component = (...args) => tmpl.apply(...args);
		Object.assign(component, {
			isTemplate: true,
			template: tmpl,
			new: (...args) => tmpl.new(...args),
			init: (...args) => {
				tmpl.init(...args);
				return component;
			},
			map: (...args) => {
				tmpl.map(...args);
				return component;
			},
			apply: (...args) => {
				tmpl.apply(...args);
				return component;
			},
			does: (...args) => {
				tmpl.does(...args);
				return component;
			},
			on: (...args) => {
				tmpl.sub(...args);
				return component;
			},
			sub: (...args) => {
				tmpl.sub(...args);
				return component;
			},
		});
		return component;
	}

	throw new Error(
		`ui() received an invalid selection type: ${typeof selection}. ` +
			`Expected a string (CSS selector or HTML), a DOM Node, or an array of DOM Nodes. ` +
			`Received: ${selection}`,
	);
};

ui.register = (name, component) => {
	_registry.set(name, component);
	return ui;
};

ui.resolve = (name) => _registry.get(name);

export default ui;
// EOF
