import { $, Selection } from "./select.js";

const Type = {
	Null: 1,
	Atom: 2,
	List: 3,
	Dict: 4,
};

const type = (value) =>
	value === undefined || value === undefined
		? Type.Null
		: value instanceof Array
			? Type.List
			: Object.getPrototypeOf(value) === Object.prototype
				? Type.Dict
				: Type.Atom;

const slots = (name, scope, processor = undefined, initial = {}) =>
	$(`[${name}]`, scope).reduce((r, n) => {
		const k = n.getAttribute(name);
		// n.removeAttribute(name);
		if (r[k] === undefined) {
			const v = new UISelection(n);
			r[k] = processor ? processor(v, n, k) : v;
		} else {
			r[k].push(n);
		}
		return r;
	}, initial);

class AppliedUISelection {
	constructor(selection, data) {
		this.selection = selection;
		this.data = data;
	}
}
class UISelection extends Selection {
	constructor(...args) {
		super(...args);

		this.isUI = true;
		// Slots
		this.on = slots("on", this);
		this.in = slots("in", this);
		this.out = slots("out", this);
		this.when = $("[when]", this).map((node) => {
			const expr = node.getAttribute("when");
			// node.removeAttribute("when");
			return {
				predicate: new Function(`return (()=>(${expr}))`)(),
				placeholder: document.createComment(expr),
				node,
			};
		});

		// Data
		this.data = undefined;
		this.key = undefined;
		this.dataType = Type.Null;
		this.rendered = new Map();
		this.condition = undefined;
		// Interaction/Behavior
		this.behavior = undefined;
		// TODO: Initial state parsing
	}

	clone() {
		const res = super.clone();
		res.behavior = this.behavior; //new Object(res.behavior);
		return res;
	}

	apply(data) {
		return new AppliedUISelection(this, data);
	}

	does(behavior) {
		this.behavior = Object.assign(this.behavior ?? {}, behavior);
		return this;
	}

	// ========================================================================
	// DATA
	// ========================================================================

	set(data, key = this.key) {
		this.key = key;
		this.render(data);
	}

	update(data, key = this.key) {
		this.key = key;
		this.render(data);
	}

	// ========================================================================
	// LIFE CYCLE
	// ========================================================================

	// --
	// Creates, updates or removes a selection based on the argument
	doCreate(data, key = this.key) {
		// Create a new instance of the selection
		const ui = this.clone();
		// We bind the event handlers
		for (const k in this.on) {
			const handlers = this.behavior[k];
			if (handlers) {
				for (const event in handlers) {
					const h = handlers[event];
					ui.on[k].bind(event, (event) => {
						return h.apply(ui.data ?? data, [event, ui, key]);
					});
				}
			}
		}
		ui.attr("data-xxx", "POUET");
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
			const ui = this.out[k];
			if (ui) {
				const v = this.behavior[k];
				if (v instanceof UISelection) {
					// Behaviour is a selection, so we map the
					// current value to it.
					ui.render(data, v);
				} else if (v instanceof Function) {
					// Otherwise it's a function, we either…
					const w = v.apply(data, [data, key, ui]);
					// TODO: We may want to have an applied selection as well
					if (w instanceof UISelection) {
						// … produces a UISelection (dynamic component)
						ui.render(data, w);
					} else if (w instanceof AppliedUISelection) {
						ui.render(w.data, w.selection);
					} else {
						// … or a derived value that we then render
						ui.render(w);
					}
				} else {
					ui.render(v);
				}
			}
		}
		// Taking care of when (showing and hiding)
		for (const { predicate, node, placeholder } of this.when) {
			const v = predicate.apply(data || {}, ui);
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
				case Type.Null:
					this.doClear();
					break;
				case Type.Atom:
					{
						// TODO: We should detect changes
						let r = this.rendered.get(null);
						if (r) {
							r.doUpdate(data);
						} else {
							r = ui.doCreate(data);
							this.append(r);
							this.rendered.set(null, r);
						}
					}
					break;
				case Type.List:
					if (this.dataType === data_type) {
						const n = Math.min(this.data.length, data.length);
						for (let i = 0; i < n; i++) {
							this.rendered.get(i).doUpdate(data[i], i);
						}
						for (let i = n; i < data.length; i++) {
							const r = ui.doCreate(data[i], i);
							this.append(r);
							this.rendered.set(i, r);
						}
						for (let i = n; i < this.data.length; i++) {
							console.log("XXX REMOVE ITEM", i);
							this.rendered.get(i).doRemove();
							this.rendered.delete(i);
						}
					} else {
						this.doClear();
						for (let i = 0; i < data.length; i++) {
							const r = ui.doCreate(data[i], i);
							this.append(r);
							this.rendered.set(i, r);
						}
					}
					break;
				case Type.Dict:
					if (this.dataType === data_type) {
						for (const k in data) {
							if (this.data[k] === undefined) {
								const r = ui.doCreate(data[k], k);
								this.append(r);
								this.rendered.set(k, r);
							} else {
								this.rendered.get(k).update(data[k], k);
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
							const r = ui.doCreate(data[k], k);
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

const ui = (selection) => new UISelection(selection);

export default Object.assign($, { ui });
// EOF
