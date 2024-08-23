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
			res.add(k, f(v, undefined));
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

const setNodeText = (node, text) => {
	if (node.nodeType === Node.ELEMENT_NODE) {
		switch (node.nodeName) {
			case "INPUT":
			case "TEXTAREA":
			case "SELECT":
				if (node.value !== text) {
					node.value = text;
				}
				break;
			default:
				node.textContent = text;
		}
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

	apply(parent) {
		let node = parent;
		for (const i of this.path) {
			if (node instanceof Array) {
				node = node[i];
			} else {
				node = node ? node.childNodes[i] : node;
			}
		}
		return node ? new UISlot(node, this) : null;
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
		// Slots
		this.on = UITemplateSlot.Find("on", nodes);
		this.in = UITemplateSlot.Find("in", nodes);
		this.out = UITemplateSlot.Find("out", nodes);
		this.inout = UITemplateSlot.Find("inout", nodes);
		this.when = UITemplateSlot.Find("when", nodes, (slot, expr) => {
			slot.predicate = new Function(`return ((data, self)=>(${expr}))`)();
			slot.predicatePlaceholder = document.createComment(expr);
			return slot;
		});
		// Interaction/Behavior (passed in cloned)
		this.behavior = undefined;
		this.subs = undefined;
	}

	// TODO: There's a question whether we should have Instance instead
	// of clone. We could certainly speed up init.
	make(parent) {
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
	constructor(node, template) {
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
		if (data === null) {
			// TODO: Introduce placeholder
		} else if (this.placeholder && this.placeholder[0]?.parentNode) {
			for (const n of this.placeholder) {
				n.parentNode.removeChild(n);
			}
		}
		const t = type(data);
		// We normalize the value... it's always going to be a list/map,
		// the default item is `_`
		const items = t === type.List || t === type.Dict ? data : { _: data };
		let previous = null;
		for (const k in items) {
			const item = items[k];
			if (!this.mapping.has(k)) {
				let r = undefined;
				if (item instanceof AppliedUITemplate) {
					r = item.template.make();
					previous = r.set(item.data).mount(this.node, previous);
				} else {
					r = document.createTextNode(asText(item));
					// TODO: Use mount and sibling
					this.node.appendChild(r);
					this.node.appendChild(document.createComment("asdsada"));
					this.node.setAttribute("title", "pouet");
					previous = r;
				}
				this.mapping.set(k, r);
			} else {
				const r = this.mapping.get(k);
				if (r instanceof UIInstance) {
					if (item instanceof AppliedUITemplate) {
						if (item.template === r.template) {
							r.set(item.data);
						} else {
							console.error("Not implemented: change in element");
						}
					} else {
						r.set(item);
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
			if (items[k] === undefined)
				if (v instanceof UIInstance) {
					v.unmount();
				} else {
					v.parentNode?.removeChild(v);
				}
			to_clear.push(k);
		}
		for (const k in to_clear) {
			this.mapping.delete(k);
		}
	}

	show() {
		if (this.predicatePlaceholder && this.predicatePlaceholder.parentNode) {
			this.predicatePlaceholder.parentNode.replaceChild(
				this.node,
				this.predicatePlaceholder
			);
		}
		return this;
	}

	hide() {
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
		this.nodes = template.nodes.map((_) => _.cloneNode(true));
		this.in = remap(template.in, (_) =>
			remap(_, (_) => _.apply(this.nodes))
		);
		this.out = remap(template.out, (_) =>
			remap(_, (_) => _.apply(this.nodes))
		);
		this.inout = remap(template.inout, (_) =>
			remap(_, (_) => _.apply(this.nodes))
		);
		this.on = remap(template.on, (_) =>
			remap(_, (_) => _.apply(this.nodes))
		);
		this.when = remap(template.when, (_) =>
			remap(_, (_) => _.apply(this.nodes))
		);
		// TODO: Clone slots
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
					switch (target[0]?.nodeName) {
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
					// Arguments are (event, self, data, key)
					h(event, this.data || {}, this, this.key)
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
			this.render(this.data ? { ...this.data, ...data } : data);
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
		if (this.subs) {
			const hl = this.subs.get(event.name);
			if (hl) {
				for (const h of hl) {
					// We do an early exit when `false` is returned, Or stop propagation on `null`
					const c = h(event, this, this.data, this.key);
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
				console.log("Already mounted", this.nodes);
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
		if (!(this.template.out || this.template.inout)) {
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
			for (const set of [this.out, this.inout]) {
				if (set) {
					for (const k in set) {
						let v = data;
						if (this.template.behavior[k]) {
							if (behavior.has(k)) {
								v = behavior.get(k);
							} else {
								const b = this.template.behavior[k];
								v = b(data, this);
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
					if (slot.template.predicate(data, self)) {
						slot.show();
					} else {
						slot.hide();
					}
				}
			}

			// // TODO: Should detect a change
			// if (this.behavior) {
			// 	// If there's a behavior, then it means we need to do a render
			// 	// update of all the slots.
			// 	this.doUpdate(data);
			// } else {
			// 	// This is not a mapping, we render a single value
			// 	this.doClear();
			// 	this.text(data);
			// }
			// FIXME:
			// const ui = this;
			// switch (data_type) {
			// 	case type.Null:
			// 		this.doClear();
			// 		break;
			// 	case type.String:
			// 	case type.Number:
			// 		{
			// 			// TODO: We should detect changes
			// 			let r = this.rendered.get(null);
			// 			if (r) {
			// 				r.doUpdate(data);
			// 			} else {
			// 				r = ui.doCreate(data, null, this);
			// 				this.append(r);
			// 				this.rendered.set(null, r);
			// 			}
			// 		}
			// 		break;
			// 	case type.List:
			// 		if (this.dataType === data_type) {
			// 			const n = Math.min(this.data.length, data.length);
			// 			for (let i = 0; i < n; i++) {
			// 				this.rendered.get(i).doUpdate(data[i], i);
			// 			}
			// 			for (let i = n; i < data.length; i++) {
			// 				const r = ui.doCreate(data[i], i, this);
			// 				this.append(r);
			// 				this.rendered.set(i, r);
			// 			}
			// 			for (let i = n; i < this.data.length; i++) {
			// 				this.rendered.get(i).doRemove();
			// 				this.rendered.delete(i);
			// 			}
			// 		} else {
			// 			this.doClear();
			// 			for (let i = 0; i < data.length; i++) {
			// 				const r = ui.doCreate(data[i], i, this);
			// 				this.append(r);
			// 				this.rendered.set(i, r);
			// 			}
			// 		}
			// 		break;
			// 	case type.Dict:
			// 		if (this.dataType === data_type) {
			// 			for (const k in data) {
			// 				if (this.data[k] === undefined) {
			// 					const r = ui.doCreate(data[k], k, this);
			// 					this.append(r);
			// 					this.rendered.set(k, r);
			// 				} else {
			// 					this.rendered.get(k).update(data[k]);
			// 				}
			// 			}
			// 			for (const k in this.data) {
			// 				if (this.data[k] === undefined) {
			// 					this.rendered.get(k).doRemove();
			// 					this.rendered.delete(k);
			// 				}
			// 			}
			// 		} else {
			// 			this.doClear();
			// 			for (const k in data) {
			// 				const r = ui.doCreate(data[k], k, this);
			// 				this.append(r);
			// 				this.rendered.set(k, r);
			// 			}
			// 		}
			// 		break;
			// }
		}
		this.data = data;
		this.dataType = data_type;
		return this;
	}

	// ========================================================================
	// LIFE CYCLE
	// ========================================================================

	// doUpdate(data = this.data, key = this.key) {
	// 	// Update
	// 	// Taking care of behaviour. Note that the behaviour
	// 	// will apply to all the states.
	// 	for (const k in this.behavior) {
	// 		for (const set of [this.out, this.inout]) {
	// 			const ui = set[k];
	// 			if (ui) {
	// 				const v = this.behavior[k];
	// 				if (v instanceof UITemplate) {
	// 					// Behaviour is a selection, so we map the
	// 					// current value to it.
	// 					ui.render(data, v);
	// 				} else if (v instanceof Function) {
	// 					// Otherwise it's a function, we either…
	// 					const w =
	// 						set === this.inout
	// 							? v(null, ui, data, key)
	// 							: v(ui, data, key);
	// 					// TODO: We may want to have an applied selection as well
	// 					if (w instanceof UITemplate) {
	// 						// … produces a UITemplate (dynamic component)
	// 						ui.render(data, w);
	// 					} else if (w instanceof AppliedUITemplate) {
	// 						ui.render(
	// 							w.cardinality ? [w.data] : w.data,
	// 							w.selection
	// 						);
	// 					} else {
	// 						// … or a derived value that we then render
	// 						ui.render(w);
	// 					}
	// 				} else {
	// 					ui.render(v);
	// 				}
	// 			}
	// 		}
	// 	}
	// 	console.log("UPDATE", this.when);
	// 	//
	// 	// // Taking care of when (showing and hiding)
	// 	// for (const { predicate, node, placeholder } of this.when) {
	// 	// 	const v = predicate(ui, data || {});
	// 	// 	if (v) {
	// 	// 		if (!node.parentNode) {
	// 	// 			placeholder.parentNode.replaceChild(node, placeholder);
	// 	// 		}
	// 	// 	} else {
	// 	// 		if (!placeholder.parentNode) {
	// 	// 			node.parentNode.replaceChild(placeholder, node);
	// 	// 		}
	// 	// 	}
	// 	// }
	// 	this.data = data;
	// 	this.key = key;
	// }

	// // FIXME: Do we need that
	// doRemove() {
	// 	this.remove();
	// 	this.data = undefined;
	// 	this.key = undefined;
	// 	return this;
	// }

	// doClear() {
	// 	for (const v of this.rendered.values()) {
	// 		v.doRemove();
	// 	}
	// 	this.rendered.clear();
	// }
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
			make: (...args) => tmpl.make(...args),
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
