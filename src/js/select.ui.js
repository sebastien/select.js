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

export const len = (v) => {
	if (v === undefined || v === null) {
		return 0;
	} else if (v instanceof Array) {
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
export const type = Object.assign(
	(value) =>
		value === undefined || value === null
			? type.Null
			: value instanceof Array
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
	} else if (value instanceof Array) {
		return value.map(f);
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

const eq = (a, b) => a === b;

const asText = (value) =>
	value === null || value === undefined
		? ""
		: typeof value === "number"
			? `${value}`
			: typeof value === "string"
				? value
				: JSON.stringify(value);

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
			node.data = text;
			break;
		case Node.ELEMENT_NODE:
			if (isInputNode(node)) {
				if (node.value !== text) {
					node.value = text;
				}
			} else {
				node.textContent = text;
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

const createTrackingProxy = (data) => {
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
			if (parent.matches && parent.matches(selector)) {
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
		this.predicate = undefined;
		this.predicatePlaceholder = undefined;
	}

	apply(nodes, parent, raw = false) {
		let node = nodes;
		for (const i of this.path) {
			if (node instanceof Array) {
				node = node[i];
			} else {
				node = node ? node.childNodes[i] : node;
			}
		}
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
				for (const node of parent.querySelectorAll("*")) processNode(node);
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
		this.attrName = attrName;
		this.slotName = slotName;
		this.originalValue = originalValue;
	}

	apply(nodes, parent) {
		let node = nodes;
		for (const i of this.path) {
			if (node instanceof Array) {
				node = node[i];
			} else {
				node = node ? node.childNodes[i] : node;
			}
		}
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
						(template.originalValue || "").split(/\s+/).filter(Boolean),
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

	_renderClass(value) {
		// Remove previously applied classes (but keep original template classes)
		for (const cls of this.appliedClasses) {
			if (!this.originalClasses.has(cls)) {
				this.node.classList.remove(cls);
			}
		}
		this.appliedClasses.clear();

		if (value == null) return;

		if (typeof value === "object" && !Array.isArray(value)) {
			// Object format: { active: true, disabled: false }
			for (const [cls, enabled] of Object.entries(value)) {
				if (enabled && cls && cls.trim()) {
					this.node.classList.add(cls.trim());
					this.appliedClasses.add(cls.trim());
				}
			}
		} else {
			// String or Array format - filter out falsy values like clsx
			const classes = Array.isArray(value)
				? value
				: String(value).split(/\s+/);
			for (const cls of classes) {
				if (cls && typeof cls === "string" && cls.trim()) {
					this.node.classList.add(cls.trim());
					this.appliedClasses.add(cls.trim());
				}
			}
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
					const kebabProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
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
// UI TEMPLATE
//
// ----------------------------------------------------------------------------

class UITemplate {
	constructor(nodes) {
		this.nodes = nodes;
		// Slots, will be processed by instance
		this.on = UITemplateSlot.Find("on", nodes);
		this.in = UITemplateSlot.Find("in", nodes);
		this.out = UITemplateSlot.Find("out", nodes);
		this.inout = UITemplateSlot.Find("inout", nodes);
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
		// Interaction/Behavior (accessed from UIInstance)
		this.initializer = undefined;
		this.behavior = undefined;
		this.subs = undefined;
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
		return remap(data, (_) => new AppliedUITemplate(this, data));
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
		this.mapping = new Map();
		this.placeholder = node.childNodes ? [...node.childNodes] : null;
		this.predicatePlaceholder =
			template.predicate && template.predicatePlaceholder
				? template.predicatePlaceholder.cloneNode(true)
				: null;
		this.template = template;
	}

	// --
	// Renders a slot, which is either replacing the content of the node
	// with an HTML/text value from the data, or creating one or more
	// `UIInstance` in case the data returns an applied template or
	// a collection of applied templates.
	render(data) {
		const t = type(data);
		if (len(data) === 0) {
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
		} else if (this.placeholder && this.placeholder[0]?.parentNode) {
			for (const n of this.placeholder) {
				n.parentNode?.removeChild(n);
			}
		}
		// We normalize the value... it's always going to be a list/map,
		// the default item is `_`
		const items = t === type.List || t === type.Dict ? data : { _: data };
		let previous = null;
		// NOTE: Mapping values can be:
		// - A `UIInstance` (it's an applied slot, ie. it has a UITemplate)
		// - A node when no UITemplate, but the given items is a node
		// - A text node (no UITemplate)
		// Items can be:
		// - An AppliedUITemplate, in which case we create a new instance
		// - A DOM node, in which case we add the DOM node as is
		// - Anything else, which is then converted to text.
		for (const k in items) {
			const item = items[k];
			if (!this.mapping.has(k)) {
				// Creation: we don't have mapping for the item
				let r = undefined;
				if (item instanceof AppliedUITemplate) {
					r = item.template.new(this.parent);
					r.set(item.data, k).mount(this.node, previous);
					previous = r.nodes.at(-1);
				} else if (isInputNode(this.node)) {
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
				const r = this.mapping.get(k);
				if (r instanceof UIInstance) {
					if (item instanceof AppliedUITemplate) {
						if (item.template === r.template) {
							r.set(item.data, k);
						} else {
							// It's a different template. We need to unmount the
							// current instance and replace it with the new one.
							console.error("Not implemented: change in element");
						}
					} else {
						r.set(item, k);
					}
				} else if (isInputNode(this.node)) {
					setNodeText(this.node, asText(item));
				} else if (r?.nodeType === Node.ELEMENT_NODE) {
					if (item instanceof AppliedUITemplate) {
						console.error(
							"Not implemented: change from non UIInstance to UIInstance",
						);
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
						console.error(
							"Not implemented: change from non UIInstance to UIInstance",
						);
					} else if (item instanceof Node) {
						r.parentNode.replaceChild(item, r);
						this.mapping.set(k, item);
					} else {
						setNodeText(r, asText(item));
					}
				}
				// TODO: We may want to ensure the order is as expected
			}
		}
		// We clear the extra
		const to_clear = [];
		for (const [k, v] of this.mapping.entries()) {
			if (items[k] === undefined) {
				if (v instanceof UIInstance) {
					v.unmount();
				} else if (v !== this.node) {
					v.parentNode?.removeChild(v);
				}
				to_clear.push(k);
			}
		}
		for (const k of to_clear) {
			this.mapping.delete(k);
		}
	}

	show() {
		// TODO: Edge case when the slot is a direct node in the instance `.nodes`.
		if (this.predicatePlaceholder && this.predicatePlaceholder.parentNode) {
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

class BehaviorState {
	constructor() {
		this.value = undefined;
		this.dependencies = new Set();
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
	constructor(template, parent) {
		// Parent
		this.template = template;
		// FIXME: This is on the hotpath
		this.nodes = template.nodes.map((_) => _.cloneNode(true));
		this.in = remap(template.in, (_) =>
			remap(_, (_) => _.apply(this.nodes, this)),
		);
		this.out = remap(template.out, (_) =>
			remap(_, (_) => _.apply(this.nodes, this)),
		);
		this.inout = remap(template.inout, (_) =>
			remap(_, (_) => _.apply(this.nodes, this)),
		);
		this.ref = remap(template.ref, (_) => {
			const r = remap(_, (_) => _.apply(this.nodes, this, true));
			return r.length === 1 ? r[0] : r;
		});
		this.on = remap(template.on, (_) =>
			remap(_, (_) => _.apply(this.nodes, this)),
		);
		this.when = remap(template.when, (_) =>
			remap(_, (_) => _.apply(this.nodes, this)),
		);
		// Attribute slots (out:style, out:class, etc.)
		this.outAttr = remap(template.outAttr, (_) =>
			remap(_, (_) => _.apply(this.nodes, this)),
		);
		this.parent = parent;
		// Data & State
		this.data = undefined;
		this.key = undefined;
		this.dataType = type.Null;
		this.rendered = new Map();
		this.behavior = new Map();
		this.predicate = undefined;
		this.bind();
		this.initial = undefined;
		this._renderer = () => this.render();
		if (template.initializer) {
			const state = template.initializer();
			if (state) {
				for (const k in state) {
					const v = state[k];
					if (v && v?.isReactive) {
						// FIXME: This does a FULL render, even on a single
						// cell change.
						v.sub(this._renderer);
					}
				}
				this.initial = state;
			}
			this.set(state);
		}
	}

	// ========================================================================
	// BEHAVIOR
	// ========================================================================

	dispose() {
		if (this.initial) {
			for (const k in this.initial) {
				const v = this.initial[k];
				if (v && v?.isReactive) {
					// FIXME: This does a FULL render, even on a single
					// cell change.
					v.unsub(this._renderer);
				}
			}
		}
	}

	bind() {
		// We bind the event handlers
		for (const set of [this.on, this.in, this.inout]) {
			for (const k in set) {
				for (const _ of set[k]) {
					this._bind(k, _);
				}
			}
		}
	}

	// TODO: Rename
	_bind(name, target, handlers = this.template.behavior[name]) {
		if (handlers instanceof Function) {
			// TODO: Select the best type of event for the target
			handlers = { _: handlers };
		}
		if (handlers) {
			for (let event in handlers) {
				const h = handlers[event];
				if (event === "_") {
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
				}
				target.node.addEventListener(event, (event) =>
					// Arguments are (self,data,event)
					h(this, this.data || {}, event),
				);
			}
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
		let same = force ? false : true;
		if (!this.data) {
			same = false;
		} else if (same) {
			for (const k in data) {
				const existing = this.data[k];
				const updated = data[k];
				if (!eq(existing, updated)) {
					same = false;
					// We sub/unsub if there's a reactive cell in the update
					if (existing?.isReactive) {
						existing.unsub(this._renderer);
					}
					if (updated?.isReactive) {
						updated.sub(this._renderer);
					}
				}
			}
		}
		if (!same) {
			this.render(this.data ? Object.assign(this.data, data) : data);
		}
		return this;
	}

	// ========================================================================
	// PUB/SUB
	// ========================================================================

	send(event, data) {
		return this.pub(event, data);
	}

	pub(event, data) {
		const res = new UIEvent(event, data, this);
		this.parent?.onPub(res);
		return res;
	}

	onPub(event) {
		event.current = this;
		let propagate = true;
		if (this.template.subs) {
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
		for (const node of this.nodes) {
			node.parentNode?.removeChild(node);
		}
		return this;
	}

	// --
	// Renders the given data, using `create`, `update` and `remove`
	// functions
	// TODO: Should take a "changes" and know which behaviour should be updated
	render(data = this.data) {
		if (!this.template) {
			console.error(
				"UIInstance.render() called on instance with undefined template",
				{ instance: this },
			);
			return this;
		}

		const data_type = type(data);
		// FIXME: I'm not sure this condition is good.
		if (
			!(this.template.out || this.template.inout || this.template.in || this.template.outAttr)
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
			for (const set of [this.out, this.inout, this.in]) {
				if (set) {
					for (const k in set) {
						let v = data;
						if (this.template.behavior[k]) {
							if (this.behavior.has(k)) {
								v = this.behavior.get(k);
							} else {
								const b = this.template.behavior[k];
								// const [tracked_data, accessed] =
								// 	createTrackingProxy(data);
								// v = b(this, tracked_data, null);
								// console.log("TRACKED_DATA", accessed);
								v = b(this, data, null);
								this.behavior.set(k, v);
							}
						}
						for (const slot of set[k]) {
							slot.render(v);
						}
					}
				}
			}
			this.behavior.clear();
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
				let v = data;
				if (this.template.behavior?.[k]) {
					if (this.behavior.has(k)) {
						v = this.behavior.get(k);
					} else {
						const b = this.template.behavior[k];
						for (const slot of this.outAttr[k]) {
							const attrValue = slot.node.getAttribute(slot.attrName);
							// Handler signature: (self, data, attrValue, node)
							v = b(this, data, attrValue, slot.node);
							slot.render(v);
						}
						this.behavior.set(k, v);
						continue; // Already rendered in the loop above
					}
				}
				for (const slot of this.outAttr[k]) {
					slot.render(v);
				}
			}
		}
		this.data = data;
		this.dataType = data_type;
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// API
//
// ----------------------------------------------------------------------------

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
			init: (...args) => tmpl.init(...args),
			map: (...args) => tmpl.map(...args),
			apply: (...args) => tmpl.apply(...args),
			does: (...args) => (tmpl.does(...args), component),
			on: (...args) => (tmpl.sub(...args), component),
			sub: (...args) => (tmpl.sub(...args), component),
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
			init: (...args) => tmpl.init(...args),
			map: (...args) => tmpl.map(...args),
			apply: (...args) => tmpl.apply(...args),
			does: (...args) => (tmpl.does(...args), component),
			on: (...args) => (tmpl.sub(...args), component),
			sub: (...args) => (tmpl.sub(...args), component),
		});
		return component;
	}

	throw new Error(
		`ui() received an invalid selection type: ${typeof selection}. ` +
		`Expected a string (CSS selector or HTML), a DOM Node, or an array of DOM Nodes. ` +
		`Received: ${selection}`,
	);
};

export default ui;
// EOF
