// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: select.ui
// A standalone, simple and performant UI rendering library designed for
// quickly creating interactive UIs and visualizations. Templates are defined
// with HTML and bound to reactive data cells.
//
// Templates use special attributes for data binding: `out` for output,
// `in` for input, `inout` for bidirectional, `on:event` for event handlers,
// `ref` for element references, `when` for conditional rendering, and
// `out:attr` for attribute binding.
//
// Example:
// ```javascript
// import { ui, cell } from "./select.ui.js"
//
// const Counter = ui(`
//   <div>
//     <span out:text="count">0</span>
//     <button on:click="increment">+</button>
//   </div>
// `).does({
//   increment: (self, data) => data.count.set(data.count.get() + 1)
// })
//
// const instance = Counter.new().mount(document.body)
// instance.set({ count: cell(0) })
// ```

import { expand } from "./select.cells.js";

// ----------------------------------------------------------------------------
//
// SECTION: Utility Functions
//
// ----------------------------------------------------------------------------

// Function: len
// Returns the "length" of a value. Returns 0 for null/undefined, length for
// arrays/strings, size for Map/Set, key count for plain objects, 1 for others.
//
// Parameters:
// - `v`: any - value to measure
//
// Returns: number

const len = (v) => {
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

const queueMicro =
	typeof globalThis.queueMicrotask === "function"
		? globalThis.queueMicrotask.bind(globalThis)
		: (fn) => Promise.resolve().then(fn);

const scheduleRenderTask = (fn) => {
	const mutate = globalThis.fastdom?.mutate;
	if (typeof mutate === "function") {
		mutate(fn);
	} else {
		queueMicro(fn);
	}
};

const _templateRegistries = new WeakMap();

const templateKey = (value) => {
	if (typeof value !== "string") {
		return null;
	}
	const normalized = value.trim();
	const key = normalized.startsWith("#") ? normalized.slice(1) : normalized;
	return key.length ? key : null;
};

const registerTemplateKey = (registry, key, template, scope) => {
	if (!key) {
		return;
	}
	const existing = registry.get(key);
	if (existing && existing !== template) {
		logSelectUI(
			"warn",
			"ui",
			"duplicate template key, keeping first registration",
			{ key, scope, existing, ignored: template },
		);
		return;
	}
	registry.set(key, template);
};

const registerTemplateNode = (template, registry, scope) => {
	if (!template || template.nodeName !== "TEMPLATE") {
		return;
	}
	registerTemplateKey(registry, template.id, template, scope);
	registerTemplateKey(
		registry,
		template.getAttribute("name"),
		template,
		scope,
	);
	if (!template.content?.querySelectorAll) {
		return;
	}
	for (const nested of template.content.querySelectorAll("template")) {
		registerTemplateNode(nested, registry, scope);
	}
};

const templateRegistryFor = (scope = document) => {
	let registry = _templateRegistries.get(scope);
	if (registry) {
		return registry;
	}
	registry = new Map();
	_templateRegistries.set(scope, registry);
	const isTemplate = scope?.nodeName === "TEMPLATE";
	if (isTemplate) {
		registerTemplateNode(scope, registry, scope);
	} else if (scope?.querySelectorAll) {
		for (const template of scope.querySelectorAll("template")) {
			registerTemplateNode(template, registry, scope);
		}
	}
	return registry;
};

const registerTemplatesInNodes = (nodes, registry, scope) => {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node?.nodeName === "TEMPLATE") {
			registerTemplateNode(node, registry, scope);
		}
		if (node?.querySelectorAll) {
			for (const template of node.querySelectorAll("template")) {
				registerTemplateNode(template, registry, scope);
			}
		}
	}
};

const templateFormatterName = (template) => {
	if (template?.nodeName !== "TEMPLATE") {
		return null;
	}
	const name = template.getAttribute("name");
	if (typeof name === "string") {
		const normalizedName = name.trim();
		if (normalizedName.length) {
			return normalizedName;
		}
	}
	const id = typeof template.id === "string" ? template.id.trim() : "";
	return id.length ? id : null;
};

const createComponent = (tmpl) => {
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
			return tmpl.map(...args);
		},
		apply: (...args) => {
			return tmpl.apply(...args);
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
};

const logSelectUI = (level, scope, message, details = {}) => {
	console[level](`[select.ui] ${scope}: ${message}, details`, details);
};

// TODO: This should be moved closer to where it is defined
const WHEN_MODE_TRUTHY = 1;
const WHEN_MODE_FALSY = 2;
const WHEN_MODE_DEFINED = 3;
const WHEN_MODE_UNDEFINED = 4;

const WHEN_COMPARATORS = [
	"!==",
	"==",
	"!=",
	">=",
	"<=",
	"~?",
	"=",
	">",
	"<",
];

const parsePipedBinding = (expr, validateSource = false) => {
	const source = typeof expr === "string" ? expr.trim() : "";
	if (!source) {
		return null;
	}
	const parts = source.split("|");
	for (let i = 0; i < parts.length; i++) {
		parts[i] = parts[i].trim();
		if (!parts[i]) {
			return null;
		}
	}
	const sourceKey = parts[0];
	if (!sourceKey) {
		return null;
	}
	if (validateSource && !/^[A-Za-z0-9_$-]+$/.test(sourceKey)) {
		return null;
	}
	const processors = parts.length > 1 ? parts.slice(1) : [];
	for (let i = 0; i < processors.length; i++) {
		if (/\s/.test(processors[i])) {
			return null;
		}
	}
	return { sourceKey, processors };
};

const RE_BINDING_PATH = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

const parseBindingPath = (expr, allowDotted = true) => {
	const source = typeof expr === "string" ? expr.trim() : "";
	if (!source) {
		return null;
	}
	const parts = allowDotted ? source.split(".") : [source];
	if (!parts.length) {
		return null;
	}
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i].trim();
		if (!part || !RE_BINDING_PATH.test(part)) {
			return null;
		}
		parts[i] = part;
	}
	return parts;
};

const parseTemplatePath = (expr) => {
	return parseBindingPath(expr, true);
};

const parseTemplatePlaceholder = (expr) => {
	const source = typeof expr === "string" ? expr.trim() : "";
	if (!source) {
		return null;
	}
	const parts = source.split("|");
	for (let i = 0; i < parts.length; i++) {
		parts[i] = parts[i].trim();
		if (!parts[i]) {
			return null;
		}
	}
	const path = parseTemplatePath(parts[0]);
	if (!path) {
		return null;
	}
	const processors = parts.length > 1 ? parts.slice(1) : null;
	if (processors) {
		for (let i = 0; i < processors.length; i++) {
			if (/\s/.test(processors[i])) {
				return null;
			}
		}
	}
	return { path, processors };
};

const parseOutAttributeBinding = (expr) => {
	const source = typeof expr === "string" ? expr : "";
	if (!source) {
		return {
			mode: "binding",
			binding: parsePipedBinding(source),
		};
	}
	const tokens = [];
	let last = 0;
	let hasTemplate = false;
	while (last < source.length) {
		const start = source.indexOf("${", last);
		if (start === -1) {
			if (last < source.length) {
				tokens.push({ type: "text", value: source.slice(last) });
			}
			break;
		}
		hasTemplate = true;
		if (start > last) {
			tokens.push({ type: "text", value: source.slice(last, start) });
		}
		const end = source.indexOf("}", start + 2);
		if (end === -1) {
			tokens.push({ type: "invalid" });
			last = source.length;
			break;
		}
		const placeholder = parseTemplatePlaceholder(source.slice(start + 2, end));
		if (!placeholder) {
			tokens.push({ type: "invalid" });
			last = end + 1;
			continue;
		}
		tokens.push({ type: "expr", value: placeholder });
		last = end + 1;
	}
	if (hasTemplate) {
		return {
			mode: "template",
			template: { tokens },
		};
	}
	return {
		mode: "binding",
		binding: parsePipedBinding(source),
	};
};

const resolveTemplateTokens = (self, tokens, data) => {
	if (!tokens?.length) {
		return "";
	}
	let result = "";
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.type === "text") {
			result += token.value;
			continue;
		}
		if (token.type === "invalid") {
			continue;
		}
		if (token.type === "expr") {
			const path = token.value.path;
			const value = resolveDataPath(data, path);
			if (value === undefined || value === null) {
				continue;
			}
			let resolved = expand(value);
			if (token.value.processors?.length) {
				resolved = applyNamedProcessors(
					self,
					data,
					resolved,
					token.value.processors,
					path.join("."),
				);
			}
			if (resolved !== undefined && resolved !== null) {
				result += String(resolved);
			}
		}
	}
	return result;
};

const resolveDataPath = (data, path) => {
	if (!path?.length) {
		return data;
	}
	let value = data;
	for (let i = 0; i < path.length; i++) {
		value = expand(value);
		if (value === undefined || value === null) {
			return undefined;
		}
		value = value[path[i]];
	}
	return value;
};

const resolveSourceValue = (data, sourceKey) => {
	if (!sourceKey) {
		return undefined;
	}
	if (!sourceKey.includes(".")) {
		return data ? data[sourceKey] : undefined;
	}
	return resolveDataPath(data, sourceKey.split("."));
};

const parseWhenShorthand = (expr) => {
	const source = typeof expr === "string" ? expr.trim() : "";
	const parseWhenLiteral = (raw) => {
		const value = raw.trim();
		if (!value.length) {
			return "";
		}
		if (value === "true") {
			return true;
		}
		if (value === "false") {
			return false;
		}
		if (value === "null") {
			return null;
		}
		if (value === "undefined") {
			return undefined;
		}
		if (/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(value)) {
			const numeric = Number(value);
			if (!Number.isNaN(numeric)) {
				return numeric;
			}
		}
		return value;
	};
	const parseWhenComparison = (text) => {
		for (let i = 0; i < WHEN_COMPARATORS.length; i++) {
			const operator = WHEN_COMPARATORS[i];
			const at = text.indexOf(operator);
			if (at <= 0) {
				continue;
			}
			const left = text.slice(0, at).trim();
			const right = text.slice(at + operator.length).trim();
			if (!left || !right) {
				return null;
			}
			const binding = parsePipedBinding(left, false);
			if (!binding) {
				return null;
			}
			const path = parseBindingPath(binding.sourceKey, true);
			if (!path) {
				return null;
			}
			return {
				key: path.join("."),
				processors: binding.processors,
				mode: WHEN_MODE_TRUTHY,
				operator,
				rawValue: right,
				value: parseWhenLiteral(right),
			};
		}
		return null;
	};
	const comparison = parseWhenComparison(source);
	if (comparison) {
		return comparison;
	}
	let i = 0;
	let negate = false;
	let queryDefined = false;
	if (source[i] === "!") {
		negate = true;
		i++;
	}
	if (source[i] === "?") {
		queryDefined = true;
		i++;
	}
	const bindingExpr = source.slice(i).trim();
	let key;
	let processors = [];
	if (bindingExpr) {
		const binding = parsePipedBinding(bindingExpr, false);
		if (!binding) {
			return null;
		}
		const path = parseBindingPath(binding.sourceKey, true);
		if (!path) {
			return null;
		}
		key = path.join(".");
		processors = binding.processors;
	}
	if (!bindingExpr && source.length > 0 && i === 0) {
		return null;
	}
	const mode = queryDefined
		? negate
			? WHEN_MODE_UNDEFINED
			: WHEN_MODE_DEFINED
		: negate
			? WHEN_MODE_FALSY
			: WHEN_MODE_TRUTHY;
	return { key, processors, mode, operator: null, rawValue: null, value: undefined };
};

const evaluateWhen = (mode, value) => {
	switch (mode) {
		case WHEN_MODE_TRUTHY:
			return !!value;
		case WHEN_MODE_FALSY:
			return !value;
		case WHEN_MODE_DEFINED:
			return value !== undefined;
		case WHEN_MODE_UNDEFINED:
			return value === undefined;
		default:
			return false;
	}
};

const evaluateWhenComparison = (left, operator, right) => {
	switch (operator) {
		case "=":
			// biome-ignore lint/suspicious/noDoubleEquals: `=` keeps loose matching distinct from `==`
			return left == right;
		case "!=":
			// biome-ignore lint/suspicious/noDoubleEquals: `!=` keeps loose matching distinct from `!==`
			return left != right;
		case "==":
			return left === right;
		case "!==":
			return left !== right;
		case "~?": {
			if (left === undefined || left === null) {
				return false;
			}
			if (right === undefined || right === null) {
				return false;
			}
			const l = String(left).toLowerCase();
			const r = String(right).toLowerCase();
			return l.includes(r);
		}
		case ">":
			return left > right;
		case ">=":
			return left >= right;
		case "<":
			return left < right;
		case "<=":
			return left <= right;
		default:
			return false;
	}
};

const resolveWhenValue = (self, data, key) => {
	const behavior = self?.template?.behavior;
	const b = behavior?.[key];
	if (b) {
		return b(self, data, null);
	}
	const value = resolveSourceValue(data, key);
	return value === undefined ? undefined : expand(value);
};

const isPascalCaseName = (name) => /^[A-Z][A-Za-z0-9_]*$/.test(name);

const resolveNamedProcessor = (self, name) => {
	if (!self?.template || !name) {
		return null;
	}
	const template = self.template;
	if (!template._processorCache) {
		template._processorCache = new Map();
	}
	const cached = template._processorCache.get(name);
	if (cached && cached.version === _formatsVersion) {
		return cached.value;
	}
	const registered = ui.formats?.[name];
	if (!registered) {
		template._processorCache.set(name, {
			version: _formatsVersion,
			value: null,
		});
		return null;
	}
	const isPascal = isPascalCaseName(name);
	const isComponent =
		typeof registered === "function" &&
		(registered?.isTemplate || typeof registered?.new === "function");
	if (isPascal && !isComponent) {
		logSelectUI(
			"warn",
			"ui.formats",
			"PascalCase formatter is not a component",
			{
				name,
				formatter: registered,
			},
		);
	}
	if (!isPascal && isComponent) {
		logSelectUI(
			"warn",
			"ui.formats",
			"component formatter should use PascalCase",
			{
				name,
				formatter: registered,
			},
		);
	}
	const resolved = {
		type: isComponent ? "component" : "function",
		value: registered,
	};
	template._processorCache.set(name, {
		version: _formatsVersion,
		value: resolved,
	});
	return resolved;
};

const applyNamedProcessors = (self, data, value, processors, sourceKey) => {
	if (!processors || processors.length === 0) {
		return value;
	}
	let current = value;
	for (let i = 0; i < processors.length; i++) {
		const name = processors[i];
		const processor = resolveNamedProcessor(self, name);
		if (!processor) {
			const availableProcessors = Object.keys(_formatsStore).sort();
			logSelectUI("warn", "UIInstance.render", "processor not found", {
				processor: name,
				sourceKey,
				availableProcessors,
				instance: self,
			});
			continue;
		}
		if (processor.type === "component") {
			const component = processor.value;
			if (current === undefined || current === null) {
				continue;
			}
			if (typeof component?.apply === "function" && component?.isTemplate) {
				current = component(current);
			} else if (typeof component === "function") {
				current = component(current, self, data);
			}
		} else {
			current = processor.value(current, self, data, sourceKey, name);
		}
	}
	return current;
};

const createWhenPredicate =
	(mode, key, processors = undefined, operator = null, comparisonValue = undefined) =>
	(self, data) => {
		const value = resolveWhenValue(self, data, key);
		const resolved = applyNamedProcessors(self, data, value, processors, key);
		if (operator) {
			return evaluateWhenComparison(resolved, operator, comparisonValue);
		}
		return evaluateWhen(mode, resolved);
	};

const SLOT_DEFAULT_KEY = "_";

const isPrunableWhitespaceText = (node) =>
	node &&
	node.nodeType === Node.TEXT_NODE &&
	!/\S/.test(node.data) &&
	/[\n\r\t]/.test(node.data);

const pruneTemplateWhitespace = (node) => {
	if (!node?.childNodes || node.childNodes.length === 0) {
		return;
	}
	for (let i = node.childNodes.length - 1; i >= 0; i--) {
		const child = node.childNodes[i];
		if (isPrunableWhitespaceText(child)) {
			node.removeChild(child);
		} else {
			pruneTemplateWhitespace(child);
		}
	}
};

// ----------------------------------------------------------------------------
//
// SECTION: Type System
//
// ----------------------------------------------------------------------------

// Type: TypeCode
// Numeric type codes for runtime type checking.
// - Null: 1
// - Number: 2
// - Boolean: 3
// - String: 4
// - Object: 5
// - List: 10
// - Dict: 11

// Function: type
// Returns the type code for `value`.
//
// Parameters:
// - `value`: any - value to classify
//
// Returns: TypeCode

const type = Object.assign(
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

// Function: remap
// Maps `f` over all values in `value` (array, Map, Set, or object).
// Returns same container type with transformed values.
//
// Parameters:
// - `value`: any - container to map over
// - `f`: function - transform function(value, key) => newValue
//
// Returns: any - container of same type with mapped values

const remap = (value, f) => {
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
		if (!Object.hasOwn(a, k)) {
			continue;
		}
		count++;
		if (!Object.hasOwn(b, k) || a[k] !== b[k]) {
			return false;
		}
	}
	let countB = 0;
	for (const k in b) {
		if (Object.hasOwn(b, k)) {
			countB++;
		}
	}
	return count === countB;
};

const asText = (value) => {
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

// ----------------------------------------------------------------------------
//
// SECTION: UI Event System
//
// ----------------------------------------------------------------------------

// Class: UIEvent
// Event object passed to UI event handlers. Contains event name, data,
// origin (emitting instance), and current (instance handling event).
//
// Attributes:
// - `name`: string - event type name
// - `data`: any - event payload
// - `origin`: UIInstance - component that emitted the event
// - `current`: UIInstance - component currently handling the event
class UIEvent {
	constructor(name, data, origin) {
		this.name = name;
		this.data = data;
		this.origin = origin;
		this.current = undefined;
	}

	// Stops event propagation when returned from handler.
	stopPropagation() {
		return null;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Template Application
//
// ----------------------------------------------------------------------------

// Class: AppliedUITemplate
// Represents a template bound to specific data. Returned by `UITemplate.apply()`.
//
// Attributes:
// - `template`: UITemplate - the template being applied
// - `data`: any - data to bind to the template
class AppliedUITemplate {
	constructor(template, data) {
		this.template = template;
		this.data = data;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Template Slots
//
// ----------------------------------------------------------------------------

// Class: UITemplateSlot
// Defines a slot in a template - a location where dynamic content will be
// rendered. Found by searching for `[slotname]` attributes in template nodes.
//
// Attributes:
// - `node`: Node - the slot node
// - `parent`: Node - parent container of the slot
// - `path`: Array<number> - path indices from parent to node
// - `rootIndex`: number - index in root nodes array
// - `tailPath`: Array<number>? - child indices beyond root
// - `predicate`: function? - conditional rendering predicate (for `when` slots)
// - `predicatePlaceholder`: Comment? - placeholder when condition false
class UITemplateSlot {
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
				const parsed = parsePipedBinding(k);
				if (!parsed) {
					logSelectUI("warn", "UITemplate", "invalid [out] binding", {
						binding: k,
						node,
						example: 'out="slot|Formatter|Formatter"',
					});
					v.binding = { sourceKey: `${k || ""}`.trim(), processors: [] };
				} else {
					v.binding = parsed;
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
		const add = (node, parent, i) => {
			const expr = node.getAttribute("when") || "";
			const parsed = parseWhenShorthand(expr);
			const slot = new UITemplateSlot(
				node,
				parent,
				UITemplateSlot.Path(node, parent, [i]),
			);

			if (parsed) {
				let whenKey = parsed.key;
				const whenProcessors = parsed.processors || [];
				const whenOperator = parsed.operator || null;
				const whenComparisonValue = parsed.value;
				const whenRawValue = parsed.rawValue || "";
				if (!whenKey) {
					const outKey = node.getAttribute("out")?.trim();
					if (!outKey) {
						logSelectUI(
							"error",
							"UITemplate",
							"unable to infer [when] key from [out]",
							{
								expression: expr,
								node,
								supported: [
									'when out="slot"',
									'when="?" out="slot"',
									'when="!" out="slot"',
									'when="!?" out="slot"',
								],
							},
						);
						return;
					}
					const outBinding = parsePipedBinding(outKey);
					if (!outBinding?.sourceKey) {
						logSelectUI(
							"error",
							"UITemplate",
							"unable to infer [when] key from [out] binding",
							{ expression: expr, out: outKey, node },
						);
						return;
					}
					whenKey = outBinding.sourceKey;
				}

				node.removeAttribute("when");
				slot.predicate = createWhenPredicate(
					parsed.mode,
					whenKey,
					whenProcessors,
					whenOperator,
					whenComparisonValue,
				);
				slot.predicatePlaceholder = document.createComment(expr || "when");
				const groupKey = `${parsed.mode}:${whenKey}:${whenProcessors.join("|")}:${whenOperator || ""}:${whenRawValue}`;
				if (res[groupKey] === undefined) {
					res[groupKey] = [slot];
				} else {
					res[groupKey].push(slot);
				}
				count++;
				return;
			}

			node.removeAttribute("when");
			logSelectUI("error", "UITemplate", "unsafe [when] expression blocked", {
				expression: expr,
				node,
				supported: [
					'when="slot"',
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
						const parsed = parseOutAttributeBinding(slotName);
						const binding = parsed.binding;
						const sourceKey = binding?.sourceKey ?? slotName;
						const processorsKey = binding?.processors?.join("|") || "";
						const bindingKey =
							parsed.mode === "binding"
								? `${sourceKey}|${processorsKey}`
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
						const handlerName = attr.value || eventType;
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
				for (const node of parent.querySelectorAll("*")) processNode(node);
			}
		}
		return count ? res : null;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Attribute Slots
//
// ----------------------------------------------------------------------------

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

// Class: UIAttributeSlot
// Live attribute binding slot in a mounted instance. Handles class/style
// additive behavior (preserves template classes/styles).
//
// Attributes:
// - `node`: Node - target element
// - `template`: UIAttributeTemplateSlot - template definition
// - `parent`: UIInstance - owning component
// - `attrName`: string - attribute being bound
// - `originalClasses`: Set? - original class names from template
// - `originalStyle`: string? - original inline style from template
// - `appliedClasses`: Set - classes added via binding
// - `appliedStyles`: Map - style properties added via binding
class UIAttributeSlot {
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

	// Renders `value` to the bound attribute. Handles class/style specially.
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
// SECTION: Event Slots
//
// ----------------------------------------------------------------------------

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
	constructor(node, parent, path, eventType, handlerName) {
		this.node = node;
		this.parent = parent;
		this.path = path;
		this.rootIndex = path[0];
		this.tailPath = path.length > 1 ? path.slice(1) : null;
		this.eventType = eventType;
		this.handlerName = handlerName;
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

// Class: UIEventSlot
// Live event binding slot in a mounted instance.
//
// Attributes:
// - `node`: Node - target element
// - `template`: UIEventTemplateSlot - template definition
// - `parent`: UIInstance - owning component
// - `eventType`: string - DOM event type
// - `handlerName`: string - behavior method name
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
// SECTION: Template Definition
//
// ----------------------------------------------------------------------------

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
	constructor(nodes, scope = document) {
		this.nodes = nodes;
		this.scope = scope;
		this.on = UITemplateSlot.FindEvent("on:", nodes);
		this.in = UITemplateSlot.Find("in", nodes);
		this.when = UITemplateSlot.FindWhen(nodes);
		this.out = UITemplateSlot.Find("out", nodes);
		this.inout = UITemplateSlot.Find("inout", nodes);
		this.hasBindings = !!(this.on || this.in || this.inout);
		this.ref = UITemplateSlot.Find("ref", nodes);
		this.outAttr = UITemplateSlot.FindAttr("out:", nodes);
		this.slots = this._findSlots(nodes);
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
	// Creates a new UIInstance from this template.
	new(parent) {
		return new UIInstance(this, parent);
	}

	// Returns an AppliedUITemplate with this template and `data`.
	apply(data) {
		return new AppliedUITemplate(this, data);
	}

	// Maps `data` through this template, returning array of AppliedUITemplate.
	map(data) {
		return remap(data, (v) => new AppliedUITemplate(this, v));
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
}

// ----------------------------------------------------------------------------
//
// SECTION: Content Slot
//
// ----------------------------------------------------------------------------

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

	// Mounts `instance` at `nextNode` position within this.node.
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
			const r = existing;
			if (r instanceof UIInstance) {
				if (item instanceof AppliedUITemplate) {
					if (item.template === r.template) {
						r.update(item.data);
					} else {
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
				let previous = this.node.childNodes[0];
				for (const node of this.placeholder) {
					if (!previous?.nextSibling) {
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

// ----------------------------------------------------------------------------
//
// SECTION: Named Content Slots
//
// ----------------------------------------------------------------------------

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

	// Clears current content and fallback.
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
// SECTION: Component Instance
//
// ----------------------------------------------------------------------------

// Class: UIInstance
// A mounted instance of a UITemplate. Manages data binding, event handling,
// lifecycle, and rendering.
//
// Attributes:
// - `template`: UITemplate - the template this instance was created from
// - `nodes`: Array<Node> - cloned DOM nodes
// - `in`: Object? - input slot bindings
// - `out`: Object? - output slot bindings
// - `inout`: Object? - bidirectional slot bindings
// - `ref`: Object? - reference slot bindings (single slots)
// - `on`: Object? - event slot bindings
// - `when`: Object? - conditional slot bindings
// - `outAttr`: Object? - attribute slot bindings
// - `slots`: Array<UIContentSlot>? - named content slots
// - `parent`: UIInstance? - parent component in tree
// - `children`: Set<UIInstance>? - child components
// - `data`: any - current rendered data
// - `key`: any - optional key for list rendering
// - `initial`: Object? - initial state from initializer
// - `_renderer`: function? - cached render function for subscriptions
// - `_context`: Map? - provider context values
// - `_ctxSubs`: Map? - context cell subscriptions
// - `_runtimeSubs`: Map? - runtime event subscriptions
// - `_behaviorDeps`: Map? - behavior dependency tracking
// - `_behaviorValues`: Map? - cached behavior results
class UIInstance {
	// Compiles slot definitions into efficient applier functions.
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
		this.outAttr = compiled.outAttr ? compiled.outAttr(this.nodes, this) : null;
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
						new UIContentSlot(node, slotDef.fallback, this, slotDef.name),
					);
				}
			}
			if (this.slots.length === 0) {
				this.slots = null;
			}
		}
		this.parent = parent;
		this._isDisposed = false;
		this.children = undefined;
		if (parent) {
			if (!parent.children) {
				parent.children = new Set();
			}
			parent.children.add(this);
		}
		if (template.hasBindings) {
			this.bind();
		}
		this._renderer = undefined;
		this._renderQueued = false;
		this._reactiveDataSubs = undefined;
		this._domListeners = undefined;
		if (template.initializer) {
			const state = template.initializer();
			if (state) {
				this.initial = state;
			}
			this.set(state);
		}
	}

	_getRenderer() {
		if (!this._renderer) {
			this._renderer = () => this._scheduleRender();
		}
		return this._renderer;
	}

	_scheduleRender() {
		if (this._renderQueued || this._isDisposed) {
			return;
		}
		this._renderQueued = true;
		scheduleRenderTask(() => {
			this._renderQueued = false;
			if (!this._isDisposed) {
				this.render();
			}
		});
	}

	_collectReactiveDataRefs(data) {
		const refs = new Set();
		if (data && typeof data === "object") {
			for (const k in data) {
				const v = data[k];
				if (v?.isReactive) {
					refs.add(v);
				}
			}
		}
		return refs;
	}

	syncReactiveDataSubs(data) {
		const refs = this._collectReactiveDataRefs(data);
		if (this._reactiveDataSubs === undefined) {
			this._reactiveDataSubs = new Map();
		}
		const renderer = this._getRenderer();
		for (const cell of this._reactiveDataSubs.keys()) {
			if (!refs.has(cell)) {
				cell.unsub(renderer);
				this._reactiveDataSubs.delete(cell);
			}
		}
		for (const cell of refs) {
			if (!this._reactiveDataSubs.has(cell)) {
				cell.sub(renderer);
				this._reactiveDataSubs.set(cell, true);
			}
		}
	}

	_clearReactiveDataSubs() {
		if (!this._reactiveDataSubs || !this._renderer) {
			return;
		}
		for (const cell of this._reactiveDataSubs.keys()) {
			cell.unsub(this._renderer);
		}
		this._reactiveDataSubs.clear();
	}

	// Cleans up subscriptions, recursively disposes children, removes from parent.
	dispose() {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._renderQueued = false;
		if (this._domListeners) {
			for (const listener of this._domListeners) {
				listener.node.removeEventListener(listener.type, listener.handler);
			}
			this._domListeners.length = 0;
			this._domListeners = undefined;
		}
		this._clearReactiveDataSubs();
		if (this._ctxSubs) {
			for (const [cell, handler] of this._ctxSubs) {
				cell.unsub(handler);
			}
			this._ctxSubs = undefined;
		}
		if (this.children) {
			for (const child of this.children) {
				child.dispose();
			}
			this.children.clear();
			this.children = undefined;
		}
		this.parent?.children?.delete(this);
	}

	// ============================================================================
	// SUBSECTION: Context (Provider/Inject)
	// ============================================================================

	// Provides `value` as `key` to child components. Returns this for chaining.
	provide(key, value) {
		if (this._context === undefined) {
			this._context = new Map();
		}
		this._context.set(key, value);
		return this;
	}

	// Injects value for `key` from ancestor providers. Returns `defaultValue`
	// if not found. Auto-subscribes to reactive cells for re-rendering.
	inject(key, defaultValue = undefined) {
		let current = this.parent;
		while (current) {
			if (current._context?.has(key)) {
				const value = current._context.get(key);
				if (value?.isReactive) {
					if (this._ctxSubs === undefined) {
						this._ctxSubs = new Map();
					}
					if (!this._ctxSubs.has(value)) {
						const handler = this._getRenderer();
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

	// ============================================================================
	// SUBSECTION: Event Binding
	// ============================================================================

	// Binds all event handlers for on:, in, and inout slots.
	bind() {
		if (this._domListeners?.length) {
			return;
		}
		if (!this._domListeners) {
			this._domListeners = [];
		}
		for (const k in this.on) {
			for (const slot of this.on[k]) {
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
	}

	// Binds event slot with explicit event type.
	_bindEvent(name, target, handler = this.template.behavior?.[name]) {
		if (handler) {
			const listener = (event) => {
				const result = handler(this, this.data || {}, event);
				if (result && typeof result === "object" && !Array.isArray(result)) {
					for (const key in result) {
						const cell = this.data?.[key];
						if (cell?.isReactive) {
							cell.set(result[key]);
						}
					}
				}
			};
			target.node.addEventListener(target.eventType, listener);
			this._domListeners.push({
				node: target.node,
				type: target.eventType,
				handler: listener,
			});
		}
	}

	// Binds input slot with inferred event type.
	_bindInput(name, target, handler = this.template.behavior?.[name]) {
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
		const listener = (event) => {
			const data = this.data || {};
			const slotValue = data[name];
			if (handler) {
				const result = handler(this, data, event);
				if (result && typeof result === "object" && !Array.isArray(result)) {
					for (const key in result) {
						const cell = data[key];
						if (cell?.isReactive) {
							cell.set(result[key]);
						}
					}
				} else if (result !== undefined && slotValue?.isReactive) {
					slotValue.set(result);
				}
			} else if (slotValue?.isReactive) {
				slotValue.set(event?.target?.value);
			}
		};
		target.node.addEventListener(event, listener);
		this._domListeners.push({
			node: target.node,
			type: event,
			handler: listener,
		});
	}

	// ============================================================================
	// SUBSECTION: Data/State
	// ============================================================================

	// Sets data and renders. Updates key for list rendering.
	set(data, key = this.key) {
		this.key = key;
		this.render(data);
		return this;
	}

	// Updates data with granular change detection. Only re-renders changed fields
	// when possible. Handles reactive cell subscription management.
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
			const merged =
				this.data && typeof this.data === "object"
					? Object.assign({}, this.data, data)
					: data;
			this.render(merged, changedKeys);
		}
		return this;
	}

	// Tests if any of `deps` changed in `changedKeys`.
	_depsChanged(deps, changedKeys) {
		for (const key of deps) {
			if (changedKeys.has(key)) {
				return true;
			}
		}
		return false;
	}

	// ============================================================================
	// SUBSECTION: Pub/Sub Events
	// ============================================================================

	// FIXME: Remove, use pub() instead
	send(event, data) {
		console.warn(
			`[select.ui] Deprecation: send() is deprecated, use pub() instead`,
		);
		return this.pub(event, data);
	}

	// FIXME: Remove, use pub() instead
	emit(event, data) {
		console.warn(
			`[select.ui] Deprecation: emit() is deprecated, use pub() instead`,
		);
		return this.pub(event, data);
	}

	// Publishes event up the component tree. Returns UIEvent.
	pub(event, data) {
		const res = new UIEvent(event, data, this);
		this.parent?.onPub(res);
		return res;
	}

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
	}

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
	}

	// Handles published event. Checks runtime subs, then template subs.
	// Stops propagation if handler returns `false`, stops bubbling on `null`.
	onPub(event) {
		event.current = this;
		let propagate = true;
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
		if (propagate && this.template.subs) {
			const hl = this.template.subs.get(event.name);
			if (hl) {
				for (const h of hl) {
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

	// ============================================================================
	// SUBSECTION: Rendering
	// ============================================================================

	// Mounts this instance into `node` (selector string or Node). Optionally
	// inserts after `previous` node.
	mount(node, previous) {
		if (typeof node === "string") {
			const n = document.querySelector(node);
			if (!n) {
				logSelectUI(
					"error",
					"UIInstance.mount",
					"selector did not match, cannot mount component",
					{ selector: node, component: this.template },
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
				logSelectUI("warn", "UIInstance.mount", "already mounted", {
					nodes: this.nodes,
				});
			}
		} else {
			logSelectUI(
				"warn",
				"UIInstance.mount",
				"unable to mount as node is undefined",
				{ node, self: this },
			);
			for (const node of this.nodes) {
				node.parentNode?.removeChild(node);
			}
		}

		return this;
	}

	// Unmounts from DOM and disposes resources.
	unmount() {
		// TODO: Speedup: if the first node is not mounted, the rest is not.
		// FIXME: Some root slots would have their node replaced by a placeholder
		this.dispose();
		for (const node of this.nodes) {
			node.parentNode?.removeChild(node);
		}
		return this;
	}

	// Renders `data`, optionally limited to `changedKeys` for granular updates.
	// Processes all binding types (out, inout, in, when, outAttr, slots).
	// TODO: Should take a "changes" and know which behaviour should be updated
	render(data = this.data, changedKeys = null) {
		if (!this.template) {
			logSelectUI(
				"error",
				"UIInstance.render",
				"called on instance with undefined template",
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
			let hasElementNode = false;
			for (const node of this.nodes) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					hasElementNode = true;
					break;
				}
			}
			if (!hasElementNode) {
				const text = asText(data);
				for (const node of this.nodes) {
					if (node.nodeType === Node.TEXT_NODE) {
						setNodeText(node, text);
						break;
					}
				}
			}
		} else {
			const behavior = this.template.behavior;
			// TODO: This is where there may be loops and where there's a need
			// for optimisation
			const renderSet = (set, withProcessors = false) => {
				if (!set) {
					return;
				}
				for (const k in set) {
					let v;
					const slots = set[k];
					const binding = withProcessors ? slots?.[0]?.template?.binding : null;
					const sourceKey = binding?.sourceKey || k;
					const processors = binding?.processors || null;
					const hasBehavior = behavior?.[sourceKey];

					if (isGranular && this._behaviorDeps && this._behaviorValues) {
						const deps = this._behaviorDeps.get(k);
						if (deps && !this._depsChanged(deps, changedKeys)) {
							v = this._behaviorValues.get(k);
							for (const slot of slots) {
								slot.render(v);
							}
							continue;
						}
					}

					if (hasBehavior) {
						if (isGranular) {
						const [trackedData, accessed] = createTrackingProxy(data);
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
					} else {
						v = resolveSourceValue(data, sourceKey);
						v = v === undefined ? undefined : expand(v);
					}

					if (withProcessors && processors?.length) {
						v = applyNamedProcessors(this, data, v, processors, sourceKey);
					}

					for (const slot of slots) {
						slot.render(v);
					}
				}
			};

			renderSet(this.out, true);
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
			for (const k in this.outAttr) {
				if (k === "$template") {
					for (const slot of this.outAttr.$template) {
						slot.render(
							resolveTemplateTokens(this, slot.template.template?.tokens, data),
						);
					}
					continue;
				}
				const slots = this.outAttr[k];
				const binding = slots?.[0]?.template.binding;
				const sourceKey =
					binding?.sourceKey || slots?.[0]?.template.slotName || k;
				const processors = binding?.processors;
				const hasBehavior = behavior?.[sourceKey];
				let v;
				if (hasBehavior) {
					for (const slot of slots) {
						const attrValue = slot.node.getAttribute(slot.attrName);
						v = hasBehavior(this, data, attrValue, slot.node);
						if (processors?.length) {
							v = applyNamedProcessors(this, data, v, processors, sourceKey);
						}
						slot.render(v);
					}
					continue;
				}
				v = resolveSourceValue(data, sourceKey);
				if (v !== undefined) {
					v = expand(v);
					if (processors?.length) {
						v = applyNamedProcessors(this, data, v, processors, sourceKey);
					}
				}
				for (const slot of slots) {
					slot.render(v);
				}
			}
			if (this.slots?.length) {
				for (const slot of this.slots) {
					const content = data?.slots?.[slot.name];
					slot.mount(content);
				}
			}
		}
		this.syncReactiveDataSubs(data);
		this.data = data;
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// SECTION: Component Registry
//
// ----------------------------------------------------------------------------

const _registry = new Map();
let _formatsVersion = 0;
const _formatsStore = Object.create(null);
const _formatsProxy = new Proxy(_formatsStore, {
	set(target, property, value) {
		target[property] = value;
		_formatsVersion++;
		return true;
	},
	deleteProperty(target, property) {
		if (property in target) {
			delete target[property];
			_formatsVersion++;
		}
		return true;
	},
});

// Function: Dynamic
// Creates a component by type from the registry.
//
// Parameters:
// - `type`: string|function - registered component name or component function
// - `props`: Object? - properties to pass to component
//
// Returns: UIInstance|null

const Dynamic = (type, props = {}) => {
	const component = typeof type === "string" ? _registry.get(type) : type;
	return component ? component(props) : null;
};

// Function: lazy
// Creates a lazy-loading component wrapper.
//
// Parameters:
// - `loader`: function - async function returning component module
// - `placeholder`: any? - content to show while loading
//
// Returns: function - component factory that loads on first call

const lazy = (loader, placeholder = null) => {
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

// ----------------------------------------------------------------------------
//
// SECTION: Web Components
//
// ----------------------------------------------------------------------------

const Disconnect = Symbol.for("Disconnect");
const Adopted = Symbol.for("Adopted");
const BaseHTMLElement = globalThis.HTMLElement || class {};

const wcToKebabCase = (value) =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase();

const wcToCamelCase = (value) =>
	value
		.toLowerCase()
		.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());

const wcParseAttributeValue = (value) => {
	if (value === null) {
		return null;
	}
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	if (value !== "" && !Number.isNaN(Number(value))) {
		return Number(value);
	}
	return value;
};

const wcCreateAttributeBindings = (initial, options) => {
	const bindings = new Map();
	const addBinding = (attribute, key) => {
		if (!attribute || !key) {
			return;
		}
		const attr = `${attribute}`.toLowerCase();
		bindings.set(attr, key);
	};

	if (initial && typeof initial === "object") {
		for (const key in initial) {
			addBinding(key, key);
			addBinding(wcToKebabCase(key), key);
		}
	}

	if (isPlainObject(options?.attributes)) {
		for (const attribute in options.attributes) {
			addBinding(attribute, options.attributes[attribute]);
		}
	}

	if (Array.isArray(options?.observedAttributes)) {
		for (const attribute of options.observedAttributes) {
			if (typeof attribute !== "string") {
				continue;
			}
			const key = wcToCamelCase(attribute);
			addBinding(attribute, key);
		}
	}

	return bindings;
};

const wcCollectObservedAttributes = (initial, bindings, options) => {
	const attributes = new Set();

	if (initial && typeof initial === "object") {
		for (const key in initial) {
			attributes.add(`${key}`.toLowerCase());
			attributes.add(wcToKebabCase(key));
		}
	}

	for (const key of bindings.keys()) {
		attributes.add(key);
	}

	if (Array.isArray(options?.observedAttributes)) {
		for (const attribute of options.observedAttributes) {
			if (typeof attribute === "string") {
				attributes.add(attribute.toLowerCase());
			}
		}
	}

	return [...attributes];
};

const wcAsNodes = (value, nodes = []) => {
	if (value === undefined || value === null || value === false) {
		return nodes;
	}
	if (value instanceof Node) {
		nodes.push(value);
		return nodes;
	}
	if (
		value instanceof NodeList ||
		value instanceof HTMLCollection ||
		(value &&
			typeof value === "object" &&
			typeof value.length === "number" &&
			value.length >= 0 &&
			value.length % 1 === 0)
	) {
		for (let i = 0; i < value.length; i++) {
			wcAsNodes(value[i], nodes);
		}
		return nodes;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			wcAsNodes(value[i], nodes);
		}
		return nodes;
	}
	nodes.push(document.createTextNode(asText(value)));
	return nodes;
};

class UIWebComponent extends BaseHTMLElement {
	constructor(
		componentFactory,
		initial = {},
		attributeBindings = new Map(),
		options = {},
	) {
		super();
		const useShadow = options.shadow !== false;
		const shadowMode = options.shadowMode || "open";
		this.root =
			useShadow && typeof this.attachShadow === "function"
				? this.shadowRoot || this.attachShadow({ mode: shadowMode })
				: this;
		this.componentFactory = componentFactory;
		this.attributeBindings = attributeBindings;
		this.options = options;
		this.instance = undefined;
		this.nodes = [];
		this.isInitialized = false;
		this.data = {
			...(initial && typeof initial === "object" ? initial : {}),
		};
	}

	readAttributes() {
		const data = {};
		for (const attribute of this.attributes) {
			const name = attribute.name.toLowerCase();
			const key = this.attributeBindings.get(name) || wcToCamelCase(name);
			data[key] = wcParseAttributeValue(attribute.value);
		}
		return data;
	}

	_clearPureNodes() {
		if (!this.nodes || this.nodes.length === 0) {
			return;
		}
		for (let i = 0; i < this.nodes.length; i++) {
			this.nodes[i].parentNode?.removeChild(this.nodes[i]);
		}
		this.nodes = [];
	}

	_renderUIComponent() {
		if (!this.instance) {
			this.instance = this.componentFactory.new();
			this.instance.set(this.data).mount(this.root);
		} else {
			this.instance.update(this.data);
		}
	}

	_renderPureComponent() {
		if (this.instance) {
			this.instance.unmount();
			this.instance = undefined;
		}
		this._clearPureNodes();
		const output = this.componentFactory(this.data, this);
		const nodes = wcAsNodes(output);
		for (let i = 0; i < nodes.length; i++) {
			this.root.appendChild(nodes[i]);
		}
		this.nodes = nodes;
	}

	render() {
		if (this.componentFactory?.isTemplate && this.componentFactory?.new) {
			this._renderUIComponent();
		} else if (typeof this.componentFactory === "function") {
			this._renderPureComponent();
		} else {
			logSelectUI("error", "UIWebComponent", "invalid component factory", {
				componentFactory: this.componentFactory,
				host: this,
			});
		}
	}

	applyData(data) {
		if (!data || typeof data !== "object") {
			return;
		}
		this.data = Object.assign({}, this.data, data);
		if (this.isInitialized) {
			this.render();
		}
	}

	connectedCallback() {
		if (!this.isInitialized) {
			this.applyData(this.readAttributes());
			this.isInitialized = true;
			this.render();
			return;
		}
		this.applyData(this.readAttributes());
	}

	disconnectedCallback() {
		this.trigger(Disconnect);
		if (this.instance) {
			this.instance.unmount();
			this.instance = undefined;
		}
		this._clearPureNodes();
		this.isInitialized = false;
	}

	adoptedCallback() {
		this.trigger(Adopted);
	}

	attributeChangedCallback(name, previous, current) {
		if (previous === current) {
			return;
		}
		const normalized = `${name}`.toLowerCase();
		const key =
			this.attributeBindings.get(normalized) || wcToCamelCase(normalized);
		this.applyData({ [key]: wcParseAttributeValue(current) });
		this.trigger(name, previous, current);
	}

	trigger(name, previous, current) {
		if (typeof name === "symbol") {
			return;
		}
		this.dispatchEvent(
			new CustomEvent(`wc:${name}`, {
				detail: {
					name,
					previous,
					current,
				},
			}),
		);
	}
}

const webcomponent = (
	name,
	componentFactory,
	initial = undefined,
	options = undefined,
) => {
	const registry = globalThis.customElements;
	if (!registry) {
		return null;
	}
	const existing = registry.get(name);
	if (existing) {
		return existing;
	}
	const initialData =
		initial && typeof initial === "object" ? { ...initial } : {};
	const attributeBindings = wcCreateAttributeBindings(initialData, options);
	const observedAttributes = wcCollectObservedAttributes(
		initialData,
		attributeBindings,
		options,
	);
	const WebComponent = class extends UIWebComponent {
		static observedAttributes = observedAttributes;
		constructor() {
			super(componentFactory, initialData, attributeBindings, options || {});
		}
	};
	registry.define(name, WebComponent);
	return WebComponent;
};

// ----------------------------------------------------------------------------
//
// SECTION: Factory Function
//
// ----------------------------------------------------------------------------

// Function: ui
// Factory that creates a component template from HTML or DOM nodes.
// Accepts CSS selectors (queries document), HTML strings (parses), or nodes.
//
// Parameters:
// - `selection`: string|Node|Array<Node> - HTML string, selector, or nodes
// - `scope`: Node? - scope for selector queries (default: document)
//
// Returns: function - component factory function with template methods
//
// Example:
// ```javascript
// const Button = ui("<button out:text='label'></button>")
//   .does({
//     click: (self, data, event) => console.log("Clicked:", data.label)
//   })
//
// const instance = Button({ label: "Click Me" }).mount(document.body)
// ```

const ui = (selection, scope = document) => {
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
		let autoFormatName = null;
		const templateRegistry = templateRegistryFor(scope);
		if (/^\s*</.test(selection)) {
			const doc = parser.parseFromString(selection, "text/html");
			pruneTemplateWhitespace(doc.body);
			nodes = [...doc.body.childNodes];
			if (nodes.length === 1) {
				autoFormatName = templateFormatterName(nodes[0]);
			}
			registerTemplatesInNodes(nodes, templateRegistry, scope);
		} else {
			const template = templateRegistry.get(templateKey(selection));
			if (template) {
				nodes = [...template.content.childNodes];
				autoFormatName = templateFormatterName(template);
			} else {
				let matchedTemplateCount = 0;
				let matchedTemplateName = null;
				const parent = scope?.querySelectorAll ? scope : document;
				for (const node of parent.querySelectorAll(selection)) {
					if (node.nodeName === "TEMPLATE") {
						matchedTemplateCount += 1;
						matchedTemplateName = templateFormatterName(node);
						registerTemplateNode(node, templateRegistry, scope);
						nodes = [...nodes, ...node.content.childNodes];
					} else {
						nodes.push(node);
					}
				}
				if (matchedTemplateCount === 1) {
					autoFormatName = matchedTemplateName;
				}
				registerTemplatesInNodes(nodes, templateRegistry, scope);
			}
		}
		if (nodes.length === 0) {
			logSelectUI("warn", "ui", "selector did not match any elements", {
				selector: selection,
				scope,
			});
		}
		const component = createComponent(new UITemplate(nodes, scope));
		if (autoFormatName) {
			ui.format(autoFormatName, component);
		}
		return component;
	}

	if (selection instanceof Node || Array.isArray(selection)) {
		const nodes = selection instanceof Node ? [selection] : selection;
		let autoFormatName = null;
		if (nodes.length === 1) {
			autoFormatName = templateFormatterName(nodes[0]);
		}
		registerTemplatesInNodes(nodes, templateRegistryFor(scope), scope);
		const component = createComponent(new UITemplate([...nodes], scope));
		if (autoFormatName) {
			ui.format(autoFormatName, component);
		}
		return component;
	}

	throw new Error(
		`ui() received an invalid selection type: ${typeof selection}. ` +
			`Expected a string (CSS selector or HTML), a DOM Node, or an array of DOM Nodes. ` +
			`Received: ${selection}`,
	);
};

ui.formats = _formatsProxy;

ui.format = (name, formatter) => {
	if (typeof name !== "string" || !name.trim()) {
		logSelectUI("error", "ui.formats", "invalid formatter name", {
			name,
			formatter,
		});
		return ui;
	}
	ui.formats[name.trim()] = formatter;
	return ui;
};

ui.unformat = (name) => {
	if (typeof name === "string" && name.trim()) {
		delete ui.formats[name.trim()];
	}
	return ui;
};

ui.resolveFormat = (name) => {
	if (typeof name !== "string") {
		return undefined;
	}
	return ui.formats[name.trim()];
};

// Registers `component` as `name` for Dynamic() resolution.
ui.register = (name, component) => {
	_registry.set(name, component);
	return ui;
};

// Resolves registered component by `name`.
ui.resolve = (name) => _registry.get(name);

// ----------------------------------------------------------------------------
//
// SECTION: Exports
//
// ----------------------------------------------------------------------------

export {
	Adopted,
	AppliedUITemplate,
	Disconnect,
	Dynamic,
	lazy,
	len,
	remap,
	type,
	UIAttributeSlot,
	UIAttributeTemplateSlot,
	UIContentSlot,
	UIEvent,
	UIEventSlot,
	UIEventTemplateSlot,
	UIInstance,
	UISlot,
	UITemplate,
	UITemplateSlot,
	UIWebComponent,
	ui,
	webcomponent,
};
export default ui;

// EOF
