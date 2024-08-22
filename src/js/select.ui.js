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
		this.dataType = Type.Null;
		this.rendered = new Map();
		this.effector = this.renderer.bind(this);
		this.condition = undefined;
		// Interaction/Behavior
		this.behavior = {};
		// TODO: Initial state parsing
	}

	clone() {
		const res = super.clone();
		res.behavior = this.behavior; //new Object(res.behavior);
		return res;
	}

	apply(data) {
		return AppliedUISelection(this, data);
	}

	does(behavior) {
		Object.assign(this.behavior, behavior);
		return this;
	}

	// ========================================================================
	// DATA
	// ========================================================================

	set(data) {
		this.render(data);
	}

	update(data) {
		this.render(data);
	}

	// ========================================================================
	// LIFE CYCLE
	// ========================================================================

	// --
	// Creates, updates or removes a selection based on the arguments.
	renderer(current, key, state = undefined, previous = undefined) {
		if (state === undefined) {
			// Create a new instance of the selection
			const ui = this.clone();
			// We bind the event handlers
			for (const k in this.on) {
				const handlers = this.behavior[k];
				if (handlers) {
					for (const event in handlers) {
						const h = handlers[event];
						ui.on[k].bind(event, (event) => {
							return h.apply(ui.data ?? current, [
								event,
								ui,
								key,
							]);
						});
					}
				}
			}
			// We update it
			console.log("CREATE", current, this.behavior);
			ui.renderer(current, key, ui);
			return ui;
		} else if (current === undefined) {
			// Remove
			console.log("REMOVE", key, previous);
			return this.remove();
		} else {
			// Update
			console.log(
				"UPDATE",
				this,
				":",
				[previous, current],
				key,
				this.out,
			);
			// Taking care of behaviour. Note that the behaviour
			// will apply to all the states.
			console.log("UPDATE", current, this.behavior);
			for (const k in this.behavior) {
				const ui = this.out[k];
				if (ui) {
					const v = this.behavior[k];
					console.log("BEHAVIOR", k, "=", v);
					if (v instanceof UISelection) {
						// Behaviour is a selection, so we map the
						// current value to it.
						ui.render(current, v);
					} else if (v instanceof Function) {
						// Otherwise it's a function, we either…
						const w = v.apply(current, [key, ui]);
						// TODO: We may want to have an applied selection as well
						if (w instanceof UISelection) {
							// … produces a UISelection (dynamic component)
							ui.render(current, w);
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
				const v = predicate.apply(current || {}, ui);
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
		}
	}

	// ========================================================================
	// RENDERING CYCLE
	// ========================================================================

	// --
	// Renders the given data, using `create`, `update` and `remove`
	// functions
	render(data, renderer = undefined) {
		const create =
			renderer instanceof UISelection ? renderer.effector : renderer;
		const update = create;
		const remove = update;
		const data_type = type(data);
		if (!renderer) {
			// This is not a mapping, we render a single value
			// TODO: Should detect a change
			this.unrender();
			this.text(data);
		} else {
			switch (data_type) {
				case Type.Null:
					this.unrender();
					break;
				case Type.Atom:
					{
						// TODO: We should detect changes
						const r = this.rendered.get(null);
						this.unrender();
						const _ = create(data, null, r, this.data);
						this.rendered.set(null, (this.append(_), _));
					}
					break;
				case Type.List:
					if (this.dataType === data_type) {
						const n = Math.min(this.data.length, data.length);
						for (let i = 0; i < n; i++) {
							update(
								data[i],
								i,
								this.rendered.get(i),
								this.data[i],
							);
						}
						for (let i = n; i < data.length; i++) {
							const _ = create(data[i], i);
							this.rendered.set(null, (this.append(_), _));
						}
						for (let i = n; i < this.data.length; i++) {
							remove(
								undefined,
								i,
								this.rendered.get(i),
								this.data[i],
							);
						}
					} else {
						this.unrender();
						for (let i = 0; i < data.length; i++) {
							const _ = create(data[i], i);
							this.rendered.set(i, (this.append(_), _));
						}
					}
					break;
				case Type.Dict:
					if (this.dataType === data_type) {
						for (const k in data) {
							if (this.data[i] === undefined) {
								const _ = create(data[k], k);
								this.rendered.set(k, (this.append(_), _));
							} else {
								update(
									data[k],
									k,
									this.rendered.get(k),
									this.data[k],
								);
							}
						}
						for (const k in this.data) {
							if (this.data[i] === undefined) {
								remove(
									undefined,
									k,
									this.rendered.get(k),
									this.data[k],
								);
							}
						}
					} else {
						this.unrender();
						for (let i = n; i < data.length; i++) {
							create(data[i], i);
						}
					}
					break;
			}
		}
		this.data = data;
		this.dataType = data_type;
	}
	unrender() {
		for (const v of this.rendered.values()) {
			v.remove();
		}
		this.rendered.clear();
	}
}

const ui = (selection) => new UISelection(selection);

export default Object.assign($, { ui });
// EOF
