// ```
//    _____      __          __     __  ______
//   / ___/___  / /__  _____/ /_   / / / /  _/
//   \__ \/ _ \/ / _ \/ ___/ __/  / / / // /
//  ___/ /  __/ /  __/ /__/ /_   / /_/ // /
// /____/\___/_/\___/\___/\__/   \____/___/
// ```
//
// A standalone, simple UI rendering library.

export const len = (v) => {
	const t = typeof v;
	if (v === undefined || v === null) {
		return 0;
	} else if (v instanceof Array || t === "string") {
		return v.length;
	} else if (v instanceof Map || v instanceof Set) {
		return v.size;
	} else if (Object.getPrototypeOf(v) === Object.prototype) {
		return Object.keys(t).length;
	}
	return 1;
};

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
			: type.Object,
	{
		Null: 1,
		Number: 2,
		String: 3,
		Object: 4,
		List: 10,
		Dict: 11,
	}
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
				Array.prototype.indexOf.call(node.parentNode.childNodes, node)
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
				UITemplateSlot.Path(node, parent, [i])
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

	apply(nodes, parent) {
		let node = nodes;
		for (const i of this.path) {
			if (node instanceof Array) {
				node = node[i];
			} else {
				node = node ? node.childNodes[i] : node;
			}
		}
		return node ? new UISlot(node, this, parent) : null;
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
		this.when = UITemplateSlot.Find("when", nodes, (slot, expr) => {
			slot.predicate = new Function(
				`return ((self,data,event)=>(${expr}))`
			)();
			slot.predicatePlaceholder = document.createComment(expr);
			return slot;
		});
		// Interaction/Behavior (accessed from UIInstance)
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

	does(behavior) {
		this.behavior = Object.assign(this.behavior ?? {}, behavior);
		return this;
	}

	// ========================================================================
	// EVENTS
	// ========================================================================

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
		this.predicatePlaceholder = template.predicatePlaceholder
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
				n.parentNode.removeChild(n);
			}
		}
		// We normalize the value... it's always going to be a list/map,
		// the default item is `_`
		const items = t === type.List || t === type.Dict ? data : { _: data };
		let previous = null;
		for (const k in items) {
			const item = items[k];
			if (!this.mapping.has(k)) {
				let r = undefined;
				if (item instanceof AppliedUITemplate) {
					r = item.template.new(this.parent);
					previous = r.set(item.data, k).mount(this.node, previous);
				} else if (isInputNode(this.node)) {
					setNodeText(this.node, asText(item));
					r = this.node;
				} else {
					r = document.createTextNode(asText(item));
					// TODO: Use mount and sibling
					this.node.appendChild(r);
					previous = r;
				}
				this.mapping.set(k, r);
			} else {
				const r = this.mapping.get(k);
				if (r instanceof UIInstance) {
					if (item instanceof AppliedUITemplate) {
						if (item.template === r.template) {
							r.set(item.data, k);
						} else {
							console.error("Not implemented: change in element");
						}
					} else {
						r.set(item, k);
					}
				} else {
					if (item instanceof AppliedUITemplate) {
						console.error(
							"Not implemented: change from non UIInstance to UIInstance"
						);
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
				this.predicatePlaceholder
			);
		}
		return this;
	}

	hide() {
		// TODO: Edge case when the slot is a direct node in the instance `.nodes`.
		if (this.predicatePlaceholder && this.node.parentNode) {
			this.node.parentNode.replaceChild(
				this.predicatePlaceholder,
				this.node
			);
		}
		return this;
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
			remap(_, (_) => _.apply(this.nodes, this))
		);
		this.out = remap(template.out, (_) =>
			remap(_, (_) => _.apply(this.nodes, this))
		);
		this.inout = remap(template.inout, (_) =>
			remap(_, (_) => _.apply(this.nodes, this))
		);
		this.on = remap(template.on, (_) =>
			remap(_, (_) => _.apply(this.nodes, this))
		);
		this.when = remap(template.when, (_) =>
			remap(_, (_) => _.apply(this.nodes, this))
		);
		this.parent = parent;
		// Data & State
		this.data = undefined;
		this.key = undefined;
		this.dataType = type.Null;
		this.rendered = new Map();
		this.predicate = undefined;
		this.bind();
	}

	// ========================================================================
	// BEHAVIOR
	// ========================================================================

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
					h(this, this.data || {}, event)
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

	update(data) {
		let same = true;
		if (!this.data) {
			same = false;
		} else {
			for (const k in data) {
				if (!eq(data[k], this.data[k])) {
					same = false;
					break;
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
				console.error("Selector is empty", node);
			} else {
				node = n;
			}
		}
		if (node) {
			// TODO: Should follow previous
			if (this.nodes[0].parentNode !== node) {
				for (const n of this.nodes) {
					node.appendChild(n);
				}
			} else {
				console.warn("Already mounted", this.nodes);
			}
		} else {
			console.warn("Unable to mount as node is empty");
			for (const node of this.nodes) {
				node.parentNode?.removeChild(node);
			}
		}

		return this.nodes[this.nodes.length - 1];
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
	render(data) {
		const data_type = type(data);
		// FIXME: I'm not sure this condition is good.
		if (
			!(this.template.out || this.template.inout || this.templates.inout)
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
			const behavior = new Map();
			// Apply the behavior for the inout/out fields.
			// TODO: This is where there may be loops and where there's a need
			// for optimisation
			for (const set of [this.out, this.inout, this.in]) {
				if (set) {
					for (const k in set) {
						let v = data;
						if (this.template.behavior[k]) {
							if (behavior.has(k)) {
								v = behavior.get(k);
							} else {
								const b = this.template.behavior[k];
								v = b(this, data, null);
								behavior.set(k, v);
							}
						}
						for (const slot of set[k]) {
							slot.render(v);
						}
					}
				}
			}
			for (const k in this.when) {
				for (const slot of this.when[k]) {
					if (slot.template.predicate(self, data)) {
						slot.show();
					} else {
						slot.hide();
					}
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
	if (typeof selection === "string") {
		let nodes = [];
		for (const node of document.querySelectorAll(selection)) {
			if (node.nodeName === "TEMPLATE") {
				nodes = [...nodes, ...node.content.childNodes];
			} else {
				nodes.push(node);
			}
		}
		const tmpl = new UITemplate(nodes);
		const component = (...args) => tmpl.apply(...args);
		Object.assign(component, {
			isTemplate: true,
			template: tmpl,
			new: (...args) => tmpl.new(...args),
			map: (...args) => tmpl.map(...args),
			apply: (...args) => tmpl.apply(...args),
			does: (...args) => (tmpl.does(...args), component),
			sub: (...args) => (tmpl.sub(...args), component),
		});
		return component;
	}
};

export default ui;
// EOF
