// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-13

// Module: select/ui/components/slots
// Template slot descriptors and mounted slot renderers.

import { asText, eq } from "../../utils.js";
import { isInputNode, log, TemplateParser } from "../templates.js";

import { AppliedUITemplate } from "./model.js";
import {
	createWhenPredicate,
	SLOT_DEFAULT_KEY,
	setNodeText,
} from "./runtime.js";

let UIInstanceClass = null;

function setUIInstanceClass(value) {
	UIInstanceClass = value;
}

function isUIInstance(value) {
	return UIInstanceClass !== null && value instanceof UIInstanceClass;
}

class UITemplateSlot {
	static MergeMaps(...maps) {
		let count = 0;
		const res = {};
		for (let i = 0; i < maps.length; i++) {
			const map = maps[i];
			if (!map) {
				continue;
			}
			for (const key in map) {
				if (res[key] === undefined) {
					res[key] = map[key].slice();
				} else {
					res[key].push(...map[key]);
				}
				count += map[key].length;
			}
		}
		return count ? res : null;
	}

	static ComparePathDesc(a, b) {
		const ap = a?.path || [];
		const bp = b?.path || [];
		const n = Math.max(ap.length, bp.length);
		for (let i = 0; i < n; i++) {
			const av = ap[i] ?? -1;
			const bv = bp[i] ?? -1;
			if (av !== bv) {
				return bv - av;
			}
		}
		return bp.length - ap.length;
	}

	// Computes path indices from `parent` to `node`.
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

	// Finds all slots with `name` attribute in `nodes`. Returns map of
	// slotName -> [UITemplateSlot, ...]. Optionally transforms slots with
	// `processor(slot, key)`.
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
			if (name === "out") {
				const parsed = TemplateParser.ParseOutAttributeBinding(k);
				if (parsed?.mode === "template") {
					v.template = parsed.template;
				} else {
					const binding = parsed?.binding;
					if (!binding) {
						log.warn("UITemplate: invalid [out] binding, details", {
							binding: k,
							node,
							example: 'out="slot|Formatter|Formatter"',
						});
						v.binding = { sourceKey: `${k || ""}`.trim(), processors: [] };
					} else {
						v.binding = binding;
					}
				}
			}
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

	// Finds and compiles `when` attributes in `nodes`.
	// Supports shorthand predicates and key inference from sibling `out`.
	static FindWhen(nodes) {
		const res = {};
		let count = 0;
		const selector = `[when]`;
		const pathToSourceKey = (path) => {
			if (!path?.length) {
				return null;
			}
			if (path[0] === ".") {
				return path.length > 1 ? `.${path.slice(1).join(".")}` : ".";
			}
			return path.join(".");
		};
		const inferWhenKeyFromOutAttr = (node) => {
			const outKey = node.getAttribute("out")?.trim();
			if (outKey) {
				const parsedOut = TemplateParser.ParseOutAttributeBinding(outKey);
				if (
					(parsedOut.mode === "binding" || parsedOut.mode === "comparison") &&
					parsedOut.binding?.sourceKey &&
					!parsedOut.binding?.sourceMap?.length
				) {
					return parsedOut.binding.sourceKey;
				}
				const tokens = parsedOut.template?.tokens || [];
				const inferred = new Set();
				for (let i = 0; i < tokens.length; i++) {
					const token = tokens[i];
					if (token.type !== "expr") {
						continue;
					}
					const key = pathToSourceKey(token.value?.path);
					if (key) {
						inferred.add(key);
					}
				}
				if (inferred.size === 1) return inferred.values().next().value;
			}
			const inferred = new Set();
			for (const attr of node.attributes || []) {
				const prefix = attr.name.startsWith("out:")
					? "out:"
					: attr.name.startsWith("out-")
						? "out-"
						: null;
				if (!prefix) {
					continue;
				}
				const attrName = attr.name.slice(prefix.length);
				const slotName = attr.value || attrName;
				const parsedOut = TemplateParser.ParseOutAttributeBinding(slotName);
				if (
					parsedOut.mode === "binding" ||
					parsedOut.mode === "comparison"
				) {
					const key = parsedOut.binding?.sourceMap?.length
						? null
						: parsedOut.binding?.sourceKey;
					if (key) {
						inferred.add(key);
					}
					continue;
				}
				const tokens = parsedOut.template?.tokens || [];
				for (let i = 0; i < tokens.length; i++) {
					const token = tokens[i];
					if (token.type !== "expr") {
						continue;
					}
					const key = pathToSourceKey(token.value?.path);
					if (key) {
						inferred.add(key);
					}
				}
			}
			return inferred.size === 1 ? inferred.values().next().value : null;
		};
		const add = (node, parent, i) => {
			const expr = node.getAttribute("when") || "";
			const parsed = TemplateParser.ParseWhenShorthand(expr);
			const slot = new UITemplateSlot(
				node,
				parent,
				UITemplateSlot.Path(node, parent, [i]),
			);

			if (parsed) {
				const clauses = parsed.clauses || [parsed];
				for (let i = 0; i < clauses.length; i++) {
					if (clauses[i].key) {
						continue;
					}
					clauses[i].key = inferWhenKeyFromOutAttr(node);
					if (!clauses[i].key) {
						log.error(
							"UITemplate: unable to infer [when] key from [out], details",
							{
								expression: expr,
								node,
								supported: [
									'when out="slot"',
									'when out:attr="slot"',
									'when out:attr="template-expression"',
									'when="?" out="slot"',
									'when="!" out="slot"',
									'when="!?" out="slot"',
								],
							},
						);
						return;
					}
				}

				node.removeAttribute("when");
				slot.predicate = createWhenPredicate(parsed);
				slot.predicatePlaceholder = document.createComment(expr || "when");
				const groupKey = parsed.clauses?.length
					? `and:${expr}`
					: `${parsed.mode}:${parsed.key}:${TemplateParser.FormatProcessorList(parsed.processors || [])}:${parsed.operator || ""}:${parsed.rawValue || ""}`;
				if (res[groupKey] === undefined) {
					res[groupKey] = [slot];
				} else {
					res[groupKey].push(slot);
				}
				count++;
				return;
			}

			node.removeAttribute("when");
			log.error("UITemplate: unsafe [when] expression blocked, details", {
				expression: expr,
				node,
				supported: [
					'when="slot"',
					'when="slot&other"',
					'when="!focus&history"',
					'when="!slot"',
					'when="?slot"',
					'when="!?slot"',
					'when="slot~?value"',
					'when="slot=value"',
					'when="slot==value"',
					'when="slot!=value"',
					'when="slot!==value"',
					'when="slot>=value"',
					'when="slot<=value"',
					'when="slot>value"',
					'when="slot<value"',
					'when="slot|Formatter|Formatter"',
				],
			});
			slot.predicate = () => false;
			slot.predicatePlaceholder = document.createComment("when:blocked");
			if (res.__blocked__ === undefined) {
				res.__blocked__ = [slot];
			} else {
				res.__blocked__.push(slot);
			}
			count++;
		};

		for (let i = 0; i < nodes.length; i++) {
			const parent = nodes[i];
			if (parent.matches?.(selector)) {
				add(parent, parent, i);
			}
			if (parent.querySelectorAll) {
				for (const node of parent.querySelectorAll(selector)) {
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
		this.binding = undefined;
	}

	// Resolves to actual node in cloned instance `nodes`.
	resolve(nodes) {
		let node = nodes[this.rootIndex];
		if (this.tailPath) {
			for (let i = 0; i < this.tailPath.length; i++) {
				node = node ? node.childNodes[this.tailPath[i]] : node;
			}
		}
		return node;
	}

	// Applies this template slot to `nodes`, returning a UISlot.
	apply(nodes, parent, raw = false) {
		const node = this.resolve(nodes);
		return node ? (raw ? node : new UISlot(node, this, parent)) : null;
	}

	// Finds all attributes starting with `prefix` (e.g., "out:") in `nodes`.
	// Returns map of slotName -> [UIAttributeTemplateSlot, ...].
	static FindAttr(prefix, nodes) {
		const res = {};
		const template = [];
		let count = 0;
		for (let i = 0; i < nodes.length; i++) {
			const parent = nodes[i];
			const processNode = (node) => {
				if (!node.attributes) return;
				const toRemove = [];
				for (const attr of node.attributes) {
					if (attr.name.startsWith(prefix)) {
						const attrName = attr.name.slice(prefix.length);
						const slotName = attr.value || attrName;
						const parsed = TemplateParser.ParseOutAttributeBinding(slotName);
						const binding = parsed.binding;
						const sourceKey = binding?.sourceMap?.length
							? TemplateParser.FormatBindingSourceMap(binding.sourceMap)
							: (binding?.sourceKey ?? slotName);
						const processorsKey =
							TemplateParser.FormatProcessorList(binding?.processors) || "";
						const bindingKey =
							parsed.mode === "binding"
								? `${sourceKey}|${processorsKey}`
								: parsed.mode === "comparison"
									? `${sourceKey}|${processorsKey}|${parsed.operator || ""}|${parsed.rawValue || ""}`
									: slotName;
						const originalValue = node.getAttribute(attrName);
						toRemove.push(attr.name);

						const slot = new UIAttributeTemplateSlot(
							node,
							parent,
							UITemplateSlot.Path(node, parent, [i]),
							attrName,
							slotName,
							originalValue,
							parsed,
						);

						if (parsed.mode === "template") {
							template.push(slot);
						} else {
							if (!res[bindingKey]) res[bindingKey] = [];
							res[bindingKey].push(slot);
						}
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
		if (!count) {
			return null;
		}
		if (template.length) {
			res.$template = template;
		}
		return res;
	}

	// Finds all event attributes starting with `prefix` (e.g., "on:") in `nodes`.
	// Returns map of handlerName -> [UIEventTemplateSlot, ...].
	// For "on:click" the eventType is "click", handlerName defaults to eventType.
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
						const eventType = attr.name.slice(prefix.length);
						const parsed = TemplateParser.ParseEventEffect(
							attr.value,
							eventType,
						);
						if (!parsed) {
							log.warn(
								"UITemplateSlot.FindEvent: invalid event effect, details",
								{
									eventType,
									effect: attr.value,
								},
							);
							toRemove.push(attr.name);
							continue;
						}
						const handlerName =
							parsed.mode === "handler"
								? parsed.handlerName || eventType
								: `!${parsed.publishEvent}:${parsed.binding?.sourceMap?.length ? TemplateParser.FormatBindingSourceMap(parsed.binding.sourceMap) : parsed.binding?.sourceKey || "data"}`;
						toRemove.push(attr.name);

						const slot = new UIEventTemplateSlot(
							node,
							parent,
							UITemplateSlot.Path(node, parent, [i]),
							eventType,
							handlerName,
							parsed.mode,
							parsed.publishEvent,
							parsed.binding,
							parsed.stopPropagation,
							parsed.preventDefault,
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
				for (const node of parent.querySelectorAll("*")) processNode(node);
			}
		}
		return count ? res : null;
	}

	// Finds all inout prefixed attributes (e.g. `inout:value`, `inout:text`) in
	// `nodes`.
	// Returns map of slotName -> [UITemplateSlot, ...].
	static FindInOutAttr(nodes) {
		const res = {};
		let count = 0;
		const createInOutSlot = (node, parent, rootIndex, inputProperty, key) => {
			const path = UITemplateSlot.Path(node, parent, [rootIndex]);
			const slot =
				node.nodeType === Node.ELEMENT_NODE && node.nodeName.includes("-")
					? new UIAttributeTemplateSlot(
							node,
							parent,
							path,
							inputProperty,
							key,
							node.getAttribute(inputProperty),
						)
					: new UITemplateSlot(node, parent, path);
			slot.inputProperty = inputProperty;
			return slot;
		};
		for (let i = 0; i < nodes.length; i++) {
			const parent = nodes[i];
			const processNode = (node) => {
				if (!node.attributes) {
					return;
				}
				const toRemove = [];
				for (const attr of node.attributes) {
					if (!attr.name.startsWith("inout:")) {
						continue;
					}
					const inputProperty = attr.name.slice("inout:".length);
					if (!inputProperty) {
						continue;
					}
					const defaultKey = inputProperty || "value";
					const key = `${attr.value || defaultKey}`.trim() || defaultKey;
					toRemove.push(attr.name);
					const slot = createInOutSlot(node, parent, i, inputProperty, key);
					if (res[key] === undefined) {
						res[key] = [slot];
					} else {
						res[key].push(slot);
					}
					count++;
				}
				for (let j = 0; j < toRemove.length; j++) {
					node.removeAttribute(toRemove[j]);
				}
			};
			processNode(parent);
			if (parent.querySelectorAll) {
				for (const node of parent.querySelectorAll("*")) {
					processNode(node);
				}
			}
		}
		return count ? res : null;
	}
}
// Class: UIAttributeTemplateSlot
// Template slot for attribute binding (e.g., out:style, out:class).
//
// Attributes:
// - `node`: Node - target element
// - `parent`: Node - parent container
// - `path`: Array<number> - path to node
// - `rootIndex`: number - index in root nodes
// - `tailPath`: Array<number>? - child path beyond root
// - `attrName`: string - target attribute name (e.g., "class", "style")
// - `slotName`: string - data key binding name
// - `originalValue`: string? - original attribute value for additive behavior
class UIAttributeTemplateSlot {
	constructor(node, parent, path, attrName, slotName, originalValue, parsed) {
		this.node = node;
		this.parent = parent;
		this.path = path;
		this.rootIndex = path[0];
		this.tailPath = path.length > 1 ? path.slice(1) : null;
		this.attrName = attrName;
		this.slotName = slotName;
		this.originalValue = originalValue;
		this.mode = parsed?.mode || "binding";
		this.binding = parsed?.binding || null;
		this.template = parsed?.template || null;
		this.operator = parsed?.operator || null;
		this.rawValue = parsed?.rawValue || null;
		this.value = parsed?.value;
	}

	resolve(nodes) {
		let node = nodes[this.rootIndex];
		if (this.tailPath) {
			for (let i = 0; i < this.tailPath.length; i++) {
				node = node ? node.childNodes[this.tailPath[i]] : node;
			}
		}
		return node;
	}

	apply(nodes, parent) {
		const node = this.resolve(nodes);
		return node ? new UIAttributeSlot(node, this, parent) : null;
	}
}
class UIAttributeSlot {
	static NamespaceURIs = {
		xlink: "http://www.w3.org/1999/xlink",
		xml: "http://www.w3.org/XML/1998/namespace",
		xmlns: "http://www.w3.org/2000/xmlns/",
	};
	constructor(node, template, parent) {
		this.node = node;
		this.template = template;
		this.parent = parent;
		this.attrName = template.attrName;
		this.originalClasses =
			template.attrName === "class"
				? new Set((template.originalValue || "").split(/\s+/).filter(Boolean))
				: null;
		this.originalStyle =
			template.attrName === "style" ? template.originalValue || "" : null;
		this.appliedClasses = new Set();
		this.appliedStyles = new Map();
	}

	_isCustomElement() {
		return (
			this.node?.nodeType === Node.ELEMENT_NODE &&
			this.node.nodeName.includes("-")
		);
	}

	_shouldUsePropertyValue(value) {
		return (
			this._isCustomElement() &&
			(value?.isReactive === true ||
				(typeof value === "object" && value !== null) ||
				typeof value === "function")
		);
	}

	// Renders `value` to the bound attribute. Handles class/style specially.
	render(value) {
		if (this.attrName === "class") {
			this._renderClass(value);
		} else if (this.attrName === "style") {
			this._renderStyle(value);
		} else if (this.attrName === "value") {
			this._renderValue(value);
		} else if (
			this.attrName === "open" ||
			this.attrName === "checked" ||
			this.attrName === "selected"
		) {
			this._renderBooleanProperty(value);
		} else {
			this._renderAttr(value);
		}
	}

	_renderClass(...values) {
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
		for (const prop of this.appliedStyles.keys()) {
			this.node.style.removeProperty(prop);
		}
		this.appliedStyles.clear();
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
			for (const [prop, val] of Object.entries(value)) {
				if (val != null) {
					const kebabProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
					this.node.style.setProperty(kebabProp, val);
					this.appliedStyles.set(kebabProp, val);
				}
			}
		} else {
			const tempDiv = document.createElement("div");
			tempDiv.style.cssText = value;
			for (const prop of tempDiv.style) {
				const val = tempDiv.style.getPropertyValue(prop);
				this.node.style.setProperty(prop, val);
				this.appliedStyles.set(prop, val);
			}
		}
	}

	_renderValue(value) {
		if (this._shouldUsePropertyValue(value)) {
			if (this.node.value !== value) {
				this.node.value = value;
			}
			if (this.node.nodeType === Node.ELEMENT_NODE) {
				this.node.removeAttribute("value");
			}
			return;
		}
		const next = value == null ? "" : String(value);
		if ("value" in this.node && this.node.value !== next) {
			this.node.value = next;
		}
		if (
			this.node.nodeType === Node.ELEMENT_NODE &&
			this.node.getAttribute("value") !== next
		) {
			this.node.setAttribute("value", next);
		}
	}

	_renderBooleanProperty(value) {
		const next = !!value;
		if (this.attrName in this.node && this.node[this.attrName] !== next) {
			this.node[this.attrName] = next;
		}
		if (next) {
			this.node.setAttribute(this.attrName, "");
		} else {
			this.node.removeAttribute(this.attrName);
		}
	}

	_renderAttr(value) {
		const colon = this.attrName.indexOf(":");
		if (colon > 0) {
			const prefix = this.attrName.slice(0, colon);
			const localName = this.attrName.slice(colon + 1);
			const ns = UIAttributeSlot.NamespaceURIs[prefix];
			if (ns) {
				if (value == null || value === false) {
					this.node.removeAttributeNS(ns, localName);
				} else if (value === true) {
					this.node.setAttributeNS(ns, this.attrName, "");
				} else {
					this.node.setAttributeNS(ns, this.attrName, String(value));
				}
				return;
			}
		}
		if (value == null || value === false) {
			this.node.removeAttribute(this.attrName);
		} else if (value === true) {
			this.node.setAttribute(this.attrName, "");
		} else {
			this.node.setAttribute(this.attrName, String(value));
		}
	}
}
// Class: UIEventTemplateSlot
// Template slot for event binding (e.g., on:click).
//
// Attributes:
// - `node`: Node - target element
// - `parent`: Node - parent container
// - `path`: Array<number> - path to node
// - `rootIndex`: number - index in root nodes
// - `tailPath`: Array<number>? - child path beyond root
// - `eventType`: string - DOM event type (e.g., "click")
// - `handlerName`: string - behavior method name to call
class UIEventTemplateSlot {
	constructor(
		node,
		parent,
		path,
		eventType,
		handlerName,
		mode = "handler",
		publishEvent = null,
		binding = null,
		stopPropagation = false,
		preventDefault = false,
	) {
		this.node = node;
		this.parent = parent;
		this.path = path;
		this.rootIndex = path[0];
		this.tailPath = path.length > 1 ? path.slice(1) : null;
		this.eventType = eventType;
		this.handlerName = handlerName;
		this.mode = mode;
		this.publishEvent = publishEvent;
		this.binding = binding;
		this.stopPropagation = stopPropagation;
		this.preventDefault = preventDefault;
	}

	resolve(nodes) {
		let node = nodes[this.rootIndex];
		if (this.tailPath) {
			for (let i = 0; i < this.tailPath.length; i++) {
				node = node ? node.childNodes[this.tailPath[i]] : node;
			}
		}
		return node;
	}

	apply(nodes, parent) {
		const node = this.resolve(nodes);
		return node ? new UIEventSlot(node, this, parent) : null;
	}
}
class UIEventSlot {
	constructor(node, template, parent) {
		this.node = node;
		this.template = template;
		this.parent = parent;
		this.eventType = template.eventType;
		this.handlerName = template.handlerName;
		this.mode = template.mode;
		this.publishEvent = template.publishEvent;
		this.binding = template.binding;
		this.stopPropagation = template.stopPropagation;
		this.preventDefault = template.preventDefault;
	}
}
// Class: UISlot
// Manages dynamic content rendering in an output slot. Handles lists,
// dictionaries, applied templates, and plain values.
//
// Attributes:
// - `parent`: UIInstance - owning component
// - `node`: Node - the slot container node
// - `isInput`: boolean - true if node is an input element
// - `mapping`: Map - current rendered content by key
// - `placeholder`: Array<Node>? - original child nodes for fallback
// - `_extractedSlots`: Object? - cached named slot content
// - `_hasNamedSlotContent`: boolean? - cache for slot detection
// - `predicatePlaceholder`: Comment? - placeholder for conditional slots
// - `template`: UITemplateSlot - slot definition
class UISlot {
	constructor(node, template, parent) {
		this.parent = parent;
		this.node = node;
		this.replaceNode = template.replaceNode === true;
		this.replaceNodeMerge = null;
		this._replaceRef = null;
		if (this.replaceNode && this.node?.nodeType === Node.ELEMENT_NODE) {
			const attrs = [];
			for (const attr of this.node.attributes) {
				const name = attr.name;
				if (
					name === "out-replace" ||
					name === "out" ||
					name === "in" ||
					name === "inout" ||
					name === "ref" ||
					name === "when" ||
					name.startsWith("out:") ||
					name.startsWith("on:")
				) {
					continue;
				}
				attrs.push([name, attr.value]);
			}
			const classes = [];
			for (const cls of this.node.classList) {
				classes.push(cls);
			}
			const styles = [];
			const style = this.node.style;
			if (style) {
				if (typeof style[Symbol.iterator] === "function") {
					for (const prop of style) {
						styles.push([prop, style.getPropertyValue(prop)]);
					}
				} else {
					for (let i = 0; i < style.length; i++) {
						const prop = style[i];
						styles.push([prop, style.getPropertyValue(prop)]);
					}
				}
			}
			this.replaceNodeMerge = { attrs, classes, styles };
		}
		if (this.replaceNode && this.node.parentNode) {
			// Zero-extra-node replacement: remember the original parent and the
			// nextSibling ref. We insert content before _replaceRef (or append).
			// No persistent marker node is left in the DOM.
			const p = this.node.parentNode;
			this._replaceParent = p;
			this._replaceRef = this.node.nextSibling;
			p.removeChild(this.node);
		}
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

	_mergeReplaceNodeDecorations(node) {
		if (
			!this.replaceNode ||
			!this.replaceNodeMerge ||
			node?.nodeType !== Node.ELEMENT_NODE
		) {
			return;
		}
		const { attrs, classes, styles } = this.replaceNodeMerge;
		for (let i = 0; i < classes.length; i++) {
			node.classList.add(classes[i]);
		}
		for (let i = 0; i < styles.length; i++) {
			const [prop, value] = styles[i];
			if (!node.style.getPropertyValue(prop)) {
				node.style.setProperty(prop, value);
			}
		}
		for (let i = 0; i < attrs.length; i++) {
			const [name, value] = attrs[i];
			if (!node.hasAttribute(name)) {
				node.setAttribute(name, value);
			}
		}
	}

	_mergeReplaceNodeDecorationsInNodes(nodes) {
		if (!this.replaceNode || !this.replaceNodeMerge || !nodes) {
			return;
		}
		for (let i = 0; i < nodes.length; i++) {
			this._mergeReplaceNodeDecorations(nodes[i]);
		}
	}

	// Mounts `instance` at `nextNode` position within this.node.
	_mountInstance(instance, nextNode) {
		this._mergeReplaceNodeDecorationsInNodes(instance.nodes);
		const parentNode = this.replaceNode && this._replaceParent ? this._replaceParent : this.node;
		if (!parentNode) {
			return;
		}
		const ref = this.replaceNode ? this._replaceRef : nextNode;
		if (instance.nodes.length === 1) {
			const node = instance.nodes[0];
			if (ref && ref.parentNode === parentNode) {
				parentNode.insertBefore(node, ref);
			} else {
				parentNode.appendChild(node);
			}
			return;
		}
		const fragment = document.createDocumentFragment();
		for (let i = 0; i < instance.nodes.length; i++) {
			fragment.appendChild(instance.nodes[i]);
		}
		if (ref && ref.parentNode === parentNode) {
			parentNode.insertBefore(fragment, ref);
		} else {
			parentNode.appendChild(fragment);
		}
	}

	// Extracts slot="name" content from placeholder children.
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
			if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute("slot")) {
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

	// Merges provided slots with extracted placeholder slots.
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
		if (isUIInstance(v)) {
			v.unmount();
		} else if (v !== this.node) {
			v.parentNode?.removeChild(v);
		}
	}

	_isMappedValueDetached(v) {
		if (isUIInstance(v)) {
			for (const node of v.nodes) {
				if (node?.parentNode) {
					return false;
				}
			}
			return true;
		}
		return v !== this.node && !v?.parentNode;
	}

	_clearMapped() {
		for (const v of this.mapping.values()) {
			this._removeMappedValue(v);
		}
		this.mapping.clear();
		this._listLength = 0;
		this._listKeys = null;
		this._listItems = null;
	}

	_resolveCollectionItemKey(item, fallbackKey) {
		if (
			item instanceof AppliedUITemplate &&
			item.data &&
			typeof item.data === "object"
		) {
			const keyed = item.data.$key;
			if (keyed !== undefined && keyed !== null) {
				return keyed;
			}
		}
		return fallbackKey;
	}

	_hasExplicitCollectionItemKey(item, _fallbackKey) {
		if (
			item instanceof AppliedUITemplate &&
			item.data &&
			typeof item.data === "object"
		) {
			const keyed = item.data.$key;
			// Any declared $key opts the item into keyed reconciliation.
			// We no longer require it to differ from the positional fallback;
			// presence of $key is the signal for stable identity by key.
			return keyed !== undefined && keyed !== null;
		}
		return false;
	}

	_hasExplicitCollectionKeys(data) {
		for (let i = 0; i < data.length; i++) {
			if (this._hasExplicitCollectionItemKey(data[i], i)) {
				return true;
			}
		}
		return false;
	}

	_isSameCollectionItem(current, previous) {
		if (Object.is(current, previous)) {
			return true;
		}
		if (
			current instanceof AppliedUITemplate &&
			previous instanceof AppliedUITemplate
		) {
			return current.template === previous.template && eq(current.data, previous.data);
		}
		return eq(current, previous);
	}

	_findReusableInstanceFor(item) {
		if (!(item instanceof AppliedUITemplate)) return null;
		for (const v of this.mapping.values()) {
			if (isUIInstance(v) && v.template === item.template && eq(v.data, item.data)) {
				return v;
			}
		}
		return null;
	}

	_firstMappedNode(value) {
		if (isUIInstance(value)) {
			for (let i = 0; i < value.nodes.length; i++) {
				const node = value.nodes[i];
				if (node?.parentNode) {
					return node;
				}
			}
			return null;
		}
		return value?.parentNode ? value : null;
	}

	_lastMappedNode(value) {
		if (isUIInstance(value)) {
			for (let i = value.nodes.length - 1; i >= 0; i--) {
				const node = value.nodes[i];
				if (node?.parentNode) {
					return node;
				}
			}
			return null;
		}
		return value?.parentNode ? value : null;
	}

	_nextMappedNodeAfterKey(key) {
		if (!this._listKeys) {
			return null;
		}
		let found = false;
		for (let i = 0; i < this._listKeys.length; i++) {
			const currentKey = this._listKeys[i];
			if (!found) {
				found = currentKey === key;
				continue;
			}
			const node = this._firstMappedNode(this.mapping.get(currentKey));
			if (node) {
				return node;
			}
		}
		return null;
	}

	_nextMountNode(key, previous) {
		if (previous?.parentNode) {
			return previous.nextSibling;
		}
		// For replace slots, insert before the remembered nextSibling (or append if null)
		return this._nextMappedNodeAfterKey(key) || (this.replaceNode ? this._replaceRef : null);
	}

	_renderMapped(k, item, previous) {
		let existing = this.mapping.get(k);
		if (existing !== undefined && this._isMappedValueDetached(existing)) {
			this.mapping.delete(k);
			existing = undefined;
		}
		// Ultra-fast path for list reuse: if the caller hands us back the *exact
		// same* AppliedUITemplate wrapper we used last time for this key, there
		// is no logical change for this row. Avoid even calling update().
		if (
			item instanceof AppliedUITemplate &&
			existing &&
			item === existing._lastApplied
		) {
			return this._lastMappedNode(existing) || previous;
		}
		if (existing === undefined) {
			let r;
			if (item instanceof AppliedUITemplate) {
				const data = this._mergeSlots(item);
				r = item.template.new(this.parent);
				this._mountInstance(r, this._nextMountNode(k, previous));
				r.set(data, k);
				// Record the wrapper we are rendering so future passes can
				// ultra-fast-path when the exact same wrapper object is provided.
				r._lastApplied = item;
			} else if (this.isInput) {
				setNodeText(this.node, asText(item));
				r = this.node;
			} else if (item instanceof Node) {
				this._mergeReplaceNodeDecorations(item);
				this._mountInstance(
					{ nodes: [item] },
					this._nextMountNode(k, previous),
				);
				r = item;
			} else {
				r = document.createTextNode(asText(item));
				this._mountInstance({ nodes: [r] }, this._nextMountNode(k, previous));
			}
			this.mapping.set(k, r);
		} else {
			const r = existing;
			if (isUIInstance(r)) {
				if (item instanceof AppliedUITemplate) {
					if (item.template === r.template) {
						r.update(item.data);
						r._lastApplied = item;
					} else {
						const data = this._mergeSlots(item);
						const lastNode = r.nodes[r.nodes.length - 1];
						const nextNode = lastNode ? lastNode.nextSibling : null;
						r.unmount();
						const newInstance = item.template.new(this.parent);
						this._mountInstance(newInstance, nextNode);
						newInstance.set(data, k);
						newInstance._lastApplied = item;
						this.mapping.set(k, newInstance);
					}
				} else if (item instanceof Node) {
					const lastNode = r.nodes[r.nodes.length - 1];
					const nextNode = lastNode ? lastNode.nextSibling : null;
					r.unmount();
					this._mergeReplaceNodeDecorations(item);
					this._mountInstance({ nodes: [item] }, nextNode);
					this.mapping.set(k, item);
				} else {
					const lastNode = r.nodes[r.nodes.length - 1];
					const nextNode = lastNode ? lastNode.nextSibling : null;
					r.unmount();
					const textNode = document.createTextNode(asText(item));
					this._mountInstance({ nodes: [textNode] }, nextNode);
					this.mapping.set(k, textNode);
				}
			} else if (this.isInput) {
				setNodeText(this.node, asText(item));
			} else if (r?.nodeType === Node.ELEMENT_NODE) {
				if (item instanceof AppliedUITemplate) {
					const data = this._mergeSlots(item);
					const nextNode = r.nextSibling;
					r.parentNode.removeChild(r);
					const newInstance = item.template.new(this.parent);
					this._mountInstance(newInstance, nextNode);
					newInstance.set(data, k);
					newInstance._lastApplied = item;
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
					this._mountInstance(newInstance, nextNode);
					newInstance.set(data, k);
					newInstance._lastApplied = item;
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
		return this._lastMappedNode(this.mapping.get(k)) || previous;
	}

	// Renders `data` into this slot. Handles lists, dicts, templates, and scalars.
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
				if (Object.hasOwn(data, k)) {
					isEmpty = false;
					break;
				}
			}
		}

		if (isEmpty) {
			if (this.placeholder && !this.placeholder[0]?.parentNode) {
				const parentNode = this.replaceNode && this._replaceParent ? this._replaceParent : this.node;
				const ref = this.replaceNode ? this._replaceRef : (this.node.childNodes[0] || null);
				for (const node of this.placeholder) {
					if (!parentNode) {
						break;
					}
					if (this.replaceNode) {
						parentNode.insertBefore(node, ref);
					} else if (!ref?.parentNode) {
						this.node.appendChild(node);
					} else {
						parentNode.insertBefore(node, ref);
					}
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
			const previousLength = this._listLength || 0;
			const explicitKeys = this._hasExplicitCollectionKeys(data);
			if (this._listKeyMode !== (explicitKeys ? "stable" : "index")) {
				this._clearMapped();
				previous = null;
			}
			this._listKeyMode = explicitKeys ? "stable" : "index";
			if (explicitKeys) {
				const nextKeys = new Array(data.length);
				for (let i = 0; i < data.length; i++) {
					const item = data[i];
					const key = this._resolveCollectionItemKey(item, i);
					nextKeys[i] = key;
					previous = this._renderMapped(key, item, previous);
				}
				const previousKeys = this._listKeys;
				if (previousKeys) {
					const nextKeySet = new Set(nextKeys);
					for (let i = 0; i < previousKeys.length; i++) {
						const key = previousKeys[i];
						if (nextKeySet.has(key)) {
							continue;
						}
						const v = this.mapping.get(key);
						if (v !== undefined) {
							this._removeMappedValue(v);
							this.mapping.delete(key);
						}
					}
				}
				this._listKeys = nextKeys;
			} else {
				if (
					this._listKeyMode === "index" &&
					this._listItems &&
					data.length > previousLength
				) {
					let appendOnly = true;
					for (let i = 0; i < previousLength; i++) {
						if (!this._isSameCollectionItem(data[i], this._listItems[i])) {
							appendOnly = false;
							break;
						}
					}
					if (appendOnly) {
						const nextKeys = this._listKeys || new Array(data.length);
						previous =
							previousLength > 0
								? this._lastMappedNode(this.mapping.get(previousLength - 1))
								: null;
						for (let i = previousLength; i < data.length; i++) {
							nextKeys[i] = i;
							previous = this._renderMapped(i, data[i], previous);
						}
						nextKeys.length = data.length;
						this._listKeys = nextKeys;
						this._listLength = data.length;
						this._listItems = data;
						return;
					}
				}
				const nextKeys = new Array(data.length);
				const commonLength = Math.min(data.length, previousLength);
				for (let i = 0; i < commonLength; i++) {
					nextKeys[i] = i;
					previous = this._renderMapped(i, data[i], previous);
				}
				for (let i = previousLength - 1; i >= data.length; i--) {
					const v = this.mapping.get(i);
					if (v !== undefined) {
						this._removeMappedValue(v);
						this.mapping.delete(i);
					}
				}
				for (let i = previousLength; i < data.length; i++) {
					nextKeys[i] = i;
					previous = this._renderMapped(i, data[i], previous);
				}
				this._listKeys = nextKeys;
			}
			this._listLength = data.length;
			this._listItems = data;
		} else if (isDict) {
			this._listKeys = null;
			this._listKeyMode = undefined;
			this._listItems = null;
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
			this._listKeys = null;
			this._listKeyMode = undefined;
			this._listItems = null;
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

	// Shows the slot (replaces placeholder with actual node).
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

	// Hides the slot (replaces node with placeholder).
	hide() {
		// TODO: Edge case when the slot is a direct node in the instance `.nodes`.
		if (this.predicatePlaceholder && this.node.parentNode) {
			this.node.parentNode.replaceChild(this.predicatePlaceholder, this.node);
		}
		return this;
	}
}
// Class: UIContentSlot
// Manages a named <slot> element's content, handling fallback and provided
// content with efficient diffing.
//
// Attributes:
// - `placeholder`: Comment - comment node marking slot position
// - `fallback`: Array<Node> - fallback content clones
// - `parent`: UIInstance - owning component
// - `name`: string - slot name
// - `content`: any - currently mounted content
// - `fallbackActive`: boolean - true if fallback is showing
// - `_lastWasFallback`: boolean - cache for fallback state
// - `_lastContent`: any - cache for content comparison
// - `_lastContentType`: number - cache for content type (1=template,2=node,3=scalar)
class UIContentSlot {
	constructor(placeholder, fallback, parent, name) {
		this.placeholder = placeholder;
		this.fallback = fallback ? fallback.map((n) => n.cloneNode(true)) : [];
		this.parent = parent;
		this.name = name;
		this.content = null;
		this.contentNodes = null;
		this.fallbackActive = false;
		this._lastWasFallback = false;
		this._lastContent = undefined;
		this._lastContentType = 0;
	}

	// Mounts `content` (AppliedUITemplate, Node, or scalar). Shows fallback
	// if content is null/undefined.
	mount(content) {
		if (content === undefined || content === null) {
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
				isUIInstance(this.content) &&
				this.content.template === content.template &&
				eq(this._lastContent, content.data, 1)
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
			this.contentNodes = null;
		} else if (content instanceof DocumentFragment) {
			const nodes = [...content.childNodes];
			for (const n of nodes) {
				parent.insertBefore(n, ref);
			}
			this.content = content;
			this.contentNodes = nodes;
		} else if (content instanceof Node) {
			parent.insertBefore(content, ref);
			this.content = content;
			this.contentNodes = null;
		} else {
			const text = document.createTextNode(asText(content));
			parent.insertBefore(text, ref);
			this.content = text;
			this.contentNodes = null;
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

	// Clears current content and fallback.
	_clear() {
		if (isUIInstance(this.content)) {
			this.content.unmount();
		} else if (this.contentNodes?.length) {
			for (const node of this.contentNodes) {
				node.parentNode?.removeChild(node);
			}
		} else if (this.content?.parentNode) {
			this.content.parentNode.removeChild(this.content);
		}
		this.content = null;
		this.contentNodes = null;
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

export {
	setUIInstanceClass,
	UIAttributeSlot,
	UIAttributeTemplateSlot,
	UIContentSlot,
	UIEventSlot,
	UIEventTemplateSlot,
	UISlot,
	UITemplateSlot,
};

// EOF
