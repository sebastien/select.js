// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-03

// Module: select/ui/components/events
// DOM event binding and runtime pub/sub for UIInstance.

import { isThenable } from "../../utils/values.js"
import { log } from "../templates.js"
import { UIEvent } from "./model.js"
import {
	applyNamedProcessors,
	formatBindingSource,
	getInputBindingProperty,
	getInputEventValue,
	resolveBindingValue,
	SKIP_INPUT_UPDATE,
} from "./runtime.js"

// Event handlers may return a plain data bag to patch instance state. Other
// objects, including UIEvent and UIInstance values, are control-flow results.
function isEventStatePatch(value) {
	return (
		value !== null &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	)
}

function applyEventResult(instance, result) {
	if (isThenable(result)) {
		result.then(
			(value) => {
				if (!instance._isDisposed && isEventStatePatch(value)) {
					instance.update(value)
				}
			},
			() => undefined,
		)
	} else if (isEventStatePatch(result)) {
		instance.update(result)
	}
}

// Function: attachEvents
// Installs event-binding and pub/sub methods on `UIInstance`.
function attachEvents(UIInstance) {
	Object.assign(UIInstance.prototype, {
		bind() {
			if (this._domListeners?.length) {
				return;
			}
			if (!this._domListeners) {
				this._domListeners = [];
			}
			for (const k in this._on) {
				for (const slot of this._on[k]) {
					this._bindEvent(k, slot);
				}
			}
			for (const set of [this.in, this.inout]) {
				for (const k in set) {
					for (const slot of set[k]) {
						this._bindInput(k, slot);
					}
				}
			}
		},

		
		// Binds event slot with explicit event type.
		_resolveEventBehaviorTarget(name) {
			let current = this;
			while (current) {
				const handler = current.template?.behavior?.[name];
				if (typeof handler === "function") {
					return current;
				}
				current = current.parent;
			}
			return null;
		},

		
		_applyEventGuards(target, event) {
			if (target.stopPropagation) {
				event.stopPropagation();
			}
			if (target.preventDefault) {
				event.preventDefault();
			}
		},

		
		_addDomListener(node, type, handler) {
			node.addEventListener(type, handler);
			this._domListeners.push({ node, type, handler });
		},

		
		_bindEvent(name, target) {
			let listener;
			if (target.mode === "assign" && target.targetPath?.length) {
				listener = (event) => {
					this._applyEventGuards(target, event);
					const inputProperty = getInputBindingProperty(target.node);
					const inputValue = target.node.nodeName.includes("-")
						? event?.detail?.current
						: getInputEventValue(target.node, event, inputProperty);
					if (inputValue === SKIP_INPUT_UPDATE || inputValue === undefined) {
						return;
					}
					UIInstance._writeDataPath(this, target.targetPath, inputValue);
				};
			} else if (target.mode === "publish" && target.publishEvent) {
				listener = (event) => {
					this._applyEventGuards(target, event);
					const data = this.data || {};
					let payload = data;
					const bindingSource = formatBindingSource(target.binding);
					if (bindingSource) {
						payload = resolveBindingValue(data, target.binding, false, this);
						if (target.binding.processors?.length) {
							payload = applyNamedProcessors(
								this,
								data,
								payload,
								target.binding.processors,
								bindingSource,
								{ expandFunctions: false },
							);
						}
					}
					this.pub(target.publishEvent, payload, true, event);
				};
			} else {
				listener = (event) => {
					this._applyEventGuards(target, event);
					const targetInstance = this._resolveEventBehaviorTarget(name);
					if (!targetInstance) {
						return;
					}
					event.origin = this;
					event.originData = this.data || {};
					const handler = targetInstance.template.behavior?.[name];
					const result = handler(targetInstance, targetInstance.data || {}, event);
					applyEventResult(targetInstance, result);
				};
			}
			this._addDomListener(target.node, target.eventType, listener);
		},

		
		// Binds input slot with inferred event type.
		_bindInput(name, target, handler = this.template.behavior?.[name]) {
			let event;
			const inputProperty = getInputBindingProperty(
				target.node,
				target.template?.inputProperty,
			);
			const nodeName = `${target.node.nodeName || ""}`;
			const isCustomElement = nodeName.includes("-");
			if (isCustomElement) {
				event = `wc:${inputProperty}`;
			} else
				switch (nodeName) {
					case "INPUT":
					case "TEXTAREA":
					case "SELECT":
						event = "input";
						break;
					case "DETAILS":
						event = "toggle";
						break;
					case "FORM":
						event = "submit";
						break;
					default:
						event = "click";
				}
			const listener = (event) => {
				const data = this.data || {};
				const slotValue = data[name];
				const inputValue = isCustomElement
					? event?.detail?.current
					: getInputEventValue(target.node, event, inputProperty);
				if (inputValue === SKIP_INPUT_UPDATE) {
					return;
				}
				if (handler) {
					const result = handler(this, data, event);
					if (isThenable(result) || isEventStatePatch(result)) {
						applyEventResult(this, result);
					} else if (
						result !== undefined &&
						(result === null || typeof result !== "object") &&
						slotValue?.isReactive
					) {
						UIInstance._setReactiveValue(slotValue, result);
					}
				} else if (slotValue?.isReactive) {
					UIInstance._setReactiveValue(slotValue, inputValue);
				} else {
					this.update({ [name]: inputValue });
				}
			};
			this._addDomListener(target.node, event, listener);
		},

		
		// ============================================================================
		pub(event, data, self = true, domEvent = undefined) {
			const res = new UIEvent(event, data, this, domEvent);
			this.onPub(res, self);
			return res;
		},

		
		// Subscribes runtime handler to event.
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
		},

		
		// Unsubscribes runtime handler from event.
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
		},

		
		// Handles published event. Checks runtime subs, then template subs.
		// Stops propagation if handler returns `false`, stops bubbling on `null`.
		onPub(event, self = true) {
			event.current = this;
			if (this.data === undefined || this.data === null) {
				this.data = {};
			}
			const data = this.data;
			let propagate = true;
			if (self && this._runtimeSubs) {
				const rl = this._runtimeSubs.get(event.name);
				if (rl) {
				for (const h of rl) {
					const c = h(this, data, event);
					applyEventResult(this, c);
						if (c === false) {
							return event;
						} else if (c === null) {
							propagate = false;
						}
					}
				}
			}
			if (self && propagate && this.template.subs) {
				const hl = this.template.subs.get(event.name);
				if (hl) {
				for (const h of hl) {
					const c = h(this, data, event);
					applyEventResult(this, c);
						if (c === false) {
							return event;
						} else if (c === null) {
							propagate = false;
						}
					}
				}
			}
			if (propagate && this.parent) {
				if (typeof this.parent.onPub === "function") {
					this.parent.onPub(event, true);
				} else {
					log.warn(
						"UIInstance.onPub: parent is not a UIInstance-like event target, details",
						{ parent: this.parent, event, self },
					);
				}
			}
			return event;
		},
	})
}

export { applyEventResult, attachEvents, isEventStatePatch }

// EOF
