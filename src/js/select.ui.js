import { $, Selection } from "./select.js";

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

const eq = (a, b) => a === b;

const slots = (name, parent, processor = undefined, initial = {}) =>
	$(`[${name}]`, parent).reduce((r, n) => {
		const k = n.getAttribute(name);
		// TODO: Clean up attributes
		// n.removeAttribute(name);
		if (r[k] === undefined) {
			const v = new UITemplate(n);
			v.parent = parent;
			r[k] = processor ? processor(v, n, k) : v;
		} else {
			r[k].push(n);
		}
		return r;
	}, initial);

class UIEvent {
	constructor(name, data, origin) {
		this.name = name;
		this.data = data;
		this.origin = origin;
		this.current = undefined;
	}
}

class AppliedUITemplate {
	constructor(selection, data, cardinality = undefined) {
		this.selection = selection;
		this.data = data;
		this.cardinality = cardinality;
	}
}

class UITemplate extends Selection {
	constructor(...args) {
		super(...args);

		this.isUI = true;
		// Slots
		this.on = slots("on", this);
		this.in = slots("in", this);
		this.out = slots("out", this);
		this.inout = slots("inout", this);
		this.when = $("[when]", this).map((node) => {
			const expr = node.getAttribute("when");
			// node.removeAttribute("when");
			return {
				predicate: new Function(`return ((self,data)=>(${expr}))`)(),
				placeholder: document.createComment(expr),
				node,
			};
		});
		// Parent
		this.parent = undefined;
		// Data & State
		this.data = undefined;
		this.key = undefined;
		this.dataType = type.Null;
		this.rendered = new Map();
		this.condition = undefined;
		// Interaction/Behavior (passed in cloned)
		this.behavior = undefined;
		this.subs = undefined;
		// TODO: Initial state parsing
	}

	// TODO: There's a question whether we should have Instance instead
	// of clone. We could certainly speed up init.
	clone(parent) {
		const res = super.clone();
		res.behavior = this.behavior; //new Object(res.behavior);
		res.subs = this.subs;
		res.parent = parent;
		// We bind the event handlers
		for (const k in res.on) {
			res._bindHandlers(k, res.on[k]);
		}
		for (const k in res.in) {
			res._bindHandlers(k, res.in[k]);
		}
		for (const k in res.inout) {
			res._bindHandlers(k, res.inout[k]);
		}
		return res;
	}

	// TODO: Rename
	_bindHandlers(name, target) {
		let handlers = this.behavior[name];
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
				target.bind(event, (event) =>
					// Arguments are (event, self, data, key)
					h(event, this, this.data, this.key)
				);
			}
		}
	}

	apply(data, cardinality) {
		return new AppliedUITemplate(this, data, cardinality);
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

	send(event, data) {
		return this.pub(event, data);
	}

	pub(event, data) {
		const res = new UIEvent(event, data, this);
		this.parent?.onPub(res);
		return res;
	}

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
	// DATA
	// ========================================================================

	set(data, key = this.key) {
		this.key = key;
		this.render(data);
	}

	update(data) {
		let same = true;

		if (!this.data) {
			same = this.data === data;
		} else {
			for (const k of data) {
				if (eq(data[k], this.data[k])) {
					same = false;
					break;
				}
			}
		}
		if (!same) {
			this.render(this.data ? { ...this.data, ...data } : data);
		}
	}

	// ========================================================================
	// LIFE CYCLE
	// ========================================================================

	// --
	// Creates, updates or removes a selection based on the argument
	doCreate(data, key = this.key, parent = undefined) {
		// Create a new instance of the selection
		const ui = this.clone(parent);
		ui.set(data, key);
		return ui;
	}

	doRemove() {
		this.remove();
		this.data = undefined;
		this.key = undefined;
		return this;
	}

	doUpdate(data = this.data, key = this.key) {
		// Update
		// Taking care of behaviour. Note that the behaviour
		// will apply to all the states.
		for (const k in this.behavior) {
			for (const set of [this.out, this.inout]) {
				const ui = set[k];
				if (ui) {
					const v = this.behavior[k];
					if (v instanceof UITemplate) {
						// Behaviour is a selection, so we map the
						// current value to it.
						ui.render(data, v);
					} else if (v instanceof Function) {
						// Otherwise it's a function, we either…
						const w =
							set === this.inout
								? v(null, ui, data, key)
								: v(ui, data, key);
						// TODO: We may want to have an applied selection as well
						if (w instanceof UITemplate) {
							// … produces a UITemplate (dynamic component)
							ui.render(data, w);
						} else if (w instanceof AppliedUITemplate) {
							ui.render(
								w.cardinality ? [w.data] : w.data,
								w.selection
							);
						} else {
							// … or a derived value that we then render
							ui.render(w);
						}
					} else {
						ui.render(v);
					}
				}
			}
		}
		// Taking care of when (showing and hiding)
		for (const { predicate, node, placeholder } of this.when) {
			const v = predicate(ui, data || {});
			if (v) {
				if (!node.parentNode) {
					placeholder.parentNode.replaceChild(node, placeholder);
				}
			} else {
				if (!placeholder.parentNode) {
					node.parentNode.replaceChild(placeholder, node);
				}
			}
		}
		this.data = data;
		this.key = key;
	}

	doClear() {
		for (const v of this.rendered.values()) {
			v.doRemove();
		}
		this.rendered.clear();
	}

	// ========================================================================
	// RENDERING CYCLE
	// ========================================================================

	// --
	// Renders the given data, using `create`, `update` and `remove`
	// functions
	render(data, ui = undefined) {
		const data_type = type(data);
		if (!ui) {
			// TODO: Should detect a change
			if (this.behavior) {
				// If there's a behavior, then it means we need to do a render
				// update of all the slots.
				this.doUpdate(data);
			} else {
				// This is not a mapping, we render a single value
				this.doClear();
				this.text(data);
			}
		} else {
			switch (data_type) {
				case type.Null:
					this.doClear();
					break;
				case type.String:
				case type.Number:
					{
						// TODO: We should detect changes
						let r = this.rendered.get(null);
						if (r) {
							r.doUpdate(data);
						} else {
							r = ui.doCreate(data, null, this);
							this.append(r);
							this.rendered.set(null, r);
						}
					}
					break;
				case type.List:
					if (this.dataType === data_type) {
						const n = Math.min(this.data.length, data.length);
						for (let i = 0; i < n; i++) {
							this.rendered.get(i).doUpdate(data[i], i);
						}
						for (let i = n; i < data.length; i++) {
							const r = ui.doCreate(data[i], i, this);
							this.append(r);
							this.rendered.set(i, r);
						}
						for (let i = n; i < this.data.length; i++) {
							this.rendered.get(i).doRemove();
							this.rendered.delete(i);
						}
					} else {
						this.doClear();
						for (let i = 0; i < data.length; i++) {
							const r = ui.doCreate(data[i], i, this);
							this.append(r);
							this.rendered.set(i, r);
						}
					}
					break;
				case type.Dict:
					if (this.dataType === data_type) {
						for (const k in data) {
							if (this.data[k] === undefined) {
								const r = ui.doCreate(data[k], k, this);
								this.append(r);
								this.rendered.set(k, r);
							} else {
								this.rendered.get(k).update(data[k]);
							}
						}
						for (const k in this.data) {
							if (this.data[k] === undefined) {
								this.rendered.get(k).doRemove();
								this.rendered.delete(k);
							}
						}
					} else {
						this.doClear();
						for (const k in data) {
							const r = ui.doCreate(data[k], k, this);
							this.append(r);
							this.rendered.set(k, r);
						}
					}
					break;
			}
		}
		this.data = data;
		this.dataType = data_type;
		return this;
	}
}

const ui = (selection) => new UITemplate(selection);

export default Object.assign($, { ui });
// EOF
