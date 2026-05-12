// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: select/ui/html
// HTML template parsing, data resolution, and DOM utilities for the UI
// library. Provides template discovery, expression parsing, and shared
// helpers used by the component engine.

import { expand, isPascalCaseName, logger, microtask } from "../utils.js";

// ----------------------------------------------------------------------------
//
// UTILITIES
//
// ----------------------------------------------------------------------------

const HTML = new DOMParser();

const scheduleRenderTask = (fn) => {
	const mutate = globalThis.fastdom?.mutate;
	if (typeof mutate === "function") {
		mutate(fn);
	} else {
		microtask(fn);
	}
};

// Class: TemplateRegistry
// Manages template discovery and registration across document scopes.
class TemplateRegistry {
	static #registries = new WeakMap();

	static key(value) {
		if (typeof value !== "string") {
			return null;
		}
		const normalized = value.trim();
		const key = normalized.startsWith("#") ? normalized.slice(1) : normalized;
		return key.length ? key : null;
	}

	static #registerKey(registry, key, template, scope) {
		if (!key) {
			return;
		}
		const existing = registry.get(key);
		if (existing && existing !== template) {
			log.warn(
				"ui: duplicate template key, keeping first registration, details",
				{
					key,
					scope,
					existing,
					ignored: template,
				},
			);
			return;
		}
		registry.set(key, template);
	}

	static registerNode(template, registry, scope) {
		if (!template || template.nodeName !== "TEMPLATE") {
			return;
		}
		TemplateRegistry.#registerKey(registry, template.id, template, scope);
		TemplateRegistry.#registerKey(
			registry,
			template.getAttribute("name"),
			template,
			scope,
		);
		if (!template.content?.querySelectorAll) {
			return;
		}
		for (const nested of template.content.querySelectorAll("template")) {
			TemplateRegistry.registerNode(nested, registry, scope);
		}
	}

	static for(scope = document) {
		let registry = TemplateRegistry.#registries.get(scope);
		if (registry) {
			return registry;
		}
		registry = new Map();
		TemplateRegistry.#registries.set(scope, registry);
		const isTemplate = scope?.nodeName === "TEMPLATE";
		if (isTemplate) {
			TemplateRegistry.registerNode(scope, registry, scope);
		} else if (scope?.querySelectorAll) {
			for (const template of scope.querySelectorAll("template")) {
				TemplateRegistry.registerNode(template, registry, scope);
			}
		}
		return registry;
	}

	static registerNodes(nodes, registry, scope) {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node?.nodeName === "TEMPLATE") {
				TemplateRegistry.registerNode(node, registry, scope);
			}
			if (node?.querySelectorAll) {
				for (const template of node.querySelectorAll("template")) {
					TemplateRegistry.registerNode(template, registry, scope);
				}
			}
		}
	}

	static formatterName(template) {
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
	}
}

const log = logger("select.ui");

// TODO: This should be moved closer to where it is defined
// Class: TemplateParser
// Parses template expressions and evaluates conditional logic for UI bindings.
class TemplateParser {
	static TRUTHY = 1;
	static FALSY = 2;
	static DEFINED = 3;
	static UNDEFINED = 4;

	static #WHEN_COMPARATORS = [
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

	static #RE_BINDING_PATH = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

	static parsePipedBinding(expr, validateSource = false) {
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
	}

	static parseBindingPath(expr, allowDotted = true) {
		const source = typeof expr === "string" ? expr.trim() : "";
		if (!source) {
			return null;
		}
		if (allowDotted && source === ".") {
			return ["."];
		}
		if (allowDotted && source.startsWith(".")) {
			const tail = source.slice(1);
			if (!tail) {
				return ["."];
			}
			const parts = tail.split(".");
			if (!parts.length) {
				return null;
			}
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i].trim();
				if (!part || !TemplateParser.#RE_BINDING_PATH.test(part)) {
					return null;
				}
				parts[i] = part;
			}
			return [".", ...parts];
		}
		const parts = allowDotted ? source.split(".") : [source];
		if (!parts.length) {
			return null;
		}
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i].trim();
			if (!part || !TemplateParser.#RE_BINDING_PATH.test(part)) {
				return null;
			}
			parts[i] = part;
		}
		return parts;
	}

	static parseTemplatePath(expr) {
		return TemplateParser.parseBindingPath(expr, true);
	}

	static parseTemplatePlaceholder(expr) {
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
		const path = TemplateParser.parseTemplatePath(parts[0]);
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
	}

	static parseOutAttributeBinding(expr) {
		const source = typeof expr === "string" ? expr : "";
		if (!source) {
			return {
				mode: "binding",
				binding: TemplateParser.parsePipedBinding(source),
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
			const placeholder = TemplateParser.parseTemplatePlaceholder(
				source.slice(start + 2, end),
			);
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
			binding: TemplateParser.parsePipedBinding(source),
		};
	}

	static parseWhenShorthand(expr) {
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
			for (let i = 0; i < TemplateParser.#WHEN_COMPARATORS.length; i++) {
				const operator = TemplateParser.#WHEN_COMPARATORS[i];
				const at = text.indexOf(operator);
				if (at <= 0) {
					continue;
				}
				const left = text.slice(0, at).trim();
				const right = text.slice(at + operator.length).trim();
				if (!left || !right) {
					return null;
				}
				const binding = TemplateParser.parsePipedBinding(left, false);
				if (!binding) {
					return null;
				}
				const path = TemplateParser.parseBindingPath(binding.sourceKey, true);
				if (!path) {
					return null;
				}
				return {
					key: path.join("."),
					processors: binding.processors,
					mode: TemplateParser.TRUTHY,
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
			const binding = TemplateParser.parsePipedBinding(bindingExpr, false);
			if (!binding) {
				return null;
			}
			const path = TemplateParser.parseBindingPath(binding.sourceKey, true);
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
				? TemplateParser.UNDEFINED
				: TemplateParser.DEFINED
			: negate
				? TemplateParser.FALSY
				: TemplateParser.TRUTHY;
		return {
			key,
			processors,
			mode,
			operator: null,
			rawValue: null,
			value: undefined,
		};
	}

	static evaluateWhen(mode, value) {
		switch (mode) {
			case TemplateParser.TRUTHY:
				return !!value;
			case TemplateParser.FALSY:
				return !value;
			case TemplateParser.DEFINED:
				return value !== undefined;
			case TemplateParser.UNDEFINED:
				return value === undefined;
			default:
				return false;
		}
	}

	static evaluateWhenComparison(left, operator, right) {
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
	}
}

// ----------------------------------------------------------------------------
//
// FORMAT REGISTRY
//
// ----------------------------------------------------------------------------

// FIXME: This looks overly complicated
let FORMATS_STORE_VERSION = 0;
const FORMATS_STORE = Object.create(null);
FORMATS_STORE.key = (value) => {
	if (value === undefined || value === null) {
		return "";
	}
	const text = typeof value === "string" ? value : String(value);
	if (!text) {
		return "";
	}
	return text
		.trim()
		.replace(/[^A-Za-z0-9_]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");
};
const FORMATS_PROXY = new Proxy(FORMATS_STORE, {
	set(target, property, value) {
		target[property] = value;
		FORMATS_STORE_VERSION++;
		return true;
	},
	deleteProperty(target, property) {
		if (property in target) {
			delete target[property];
			FORMATS_STORE_VERSION++;
		}
		return true;
	},
});

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

const normalizeSourceKey = (sourceKey) => {
	if (sourceKey === "data" || sourceKey === ".") {
		return "";
	}
	if (sourceKey.startsWith("data.")) {
		return sourceKey.slice(5);
	}
	if (sourceKey.startsWith(".")) {
		return sourceKey.slice(1);
	}
	return sourceKey;
};

const resolveSourceValue = (data, sourceKey) => {
	if (!sourceKey) {
		return undefined;
	}
	const normalizedKey = normalizeSourceKey(sourceKey);
	if (!normalizedKey) {
		return data;
	}
	if (!normalizedKey.includes(".")) {
		return data ? data[normalizedKey] : undefined;
	}
	return resolveDataPath(data, normalizedKey.split("."));
};

const resolveTemplateTokens = (self, tokens, data) => {
	if (!tokens?.length) {
		return "";
	}
	const behavior = self?.template?.behavior;
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
			const rawPath = token.value.path;
			const path =
				rawPath?.[0] === "."
					? rawPath.length > 1
						? rawPath.slice(1)
						: []
					: rawPath;
			let value;
			if (path?.length === 1) {
				const key = path[0];
				const slotBehavior = behavior?.[key];
				value =
					typeof slotBehavior === "function"
						? slotBehavior(self, data, null)
						: resolveDataPath(data, path);
			} else {
				value = resolveDataPath(data, path);
			}
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

const resolveWhenValue = (self, data, key) => {
	const behavior = self?.template?.behavior;
	const b = behavior?.[key];
	if (b) {
		return b(self, data, null);
	}
	const value = resolveSourceValue(data, key);
	return value === undefined ? undefined : expand(value);
};

const resolveNamedProcessor = (self, name) => {
	if (!self?.template || !name) {
		return null;
	}
	const template = self.template;
	const localTemplate = template.localTemplates?.get(name);
	if (localTemplate) {
		return {
			type: "component",
			value: localTemplate,
		};
	}
	if (!template._processorCache) {
		template._processorCache = new Map();
	}
	const cached = template._processorCache.get(name);
	if (cached && cached.version === FORMATS_STORE_VERSION) {
		return cached.value;
	}
	const registered = FORMATS_STORE[name];
	if (!registered) {
		template._processorCache.set(name, {
			version: FORMATS_STORE_VERSION,
			value: null,
		});
		return null;
	}
	const isPascal = isPascalCaseName(name);
	const isComponent =
		typeof registered === "function" &&
		(registered?.isTemplate || typeof registered?.new === "function");
	if (isPascal && !isComponent) {
		log.warn("ui.formats: PascalCase formatter is not a component, details", {
			name,
			formatter: registered,
		});
	}
	if (!isPascal && isComponent) {
		log.warn("ui.formats: component formatter should use PascalCase, details", {
			name,
			formatter: registered,
		});
	}
	const resolved = {
		type: isComponent ? "component" : "function",
		value: registered,
	};
	template._processorCache.set(name, {
		version: FORMATS_STORE_VERSION,
		value: resolved,
	});
	return resolved;
};

const mapProcessorCollection = (value, f) => {
	if (
		value === null ||
		value === undefined ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return value;
	}
	if (Array.isArray(value)) {
		const n = value.length;
		const res = new Array(n);
		for (let i = 0; i < n; i++) {
			res[i] = f(value[i], i);
		}
		return res;
	}
	if (value instanceof Map) {
		const res = new Map();
		for (const [k, v] of value.entries()) {
			res.set(k, f(v, k));
		}
		return res;
	}
	if (value instanceof Set) {
		const res = new Set();
		for (const v of value) {
			res.add(f(v, undefined));
		}
		return res;
	}
	if (typeof value === "object") {
		const res = {};
		for (const k in value) {
			res[k] = f(value[k], k);
		}
		return res;
	}
	return value;
};

const applyNamedProcessor = (processor, current, self, data, sourceKey, name) => {
	if (processor.type === "component") {
		const component = processor.value;
		if (current === undefined || current === null) {
			return current;
		}
		if (
			component?.isTemplate &&
			typeof component?.apply === "function" &&
			typeof component !== "function"
		) {
			return component.apply(current, self, data, sourceKey, name);
		}
		if (typeof component?.apply === "function" && component?.isTemplate) {
			return component(current);
		}
		if (typeof component === "function") {
			return component(current, self, data);
		}
		return current;
	}
	return processor.value(current, self, data, sourceKey, name);
};

const applyNamedProcessors = (self, data, value, processors, sourceKey) => {
	if (!processors || processors.length === 0) {
		return value;
	}
	let current = value;
	for (let i = 0; i < processors.length; i++) {
		const name = processors[i];
		const each = name.startsWith("*");
		const processorName = each ? name.slice(1) : name;
		const processor = resolveNamedProcessor(self, processorName);
		if (!processor) {
			const availableProcessors = Object.keys(FORMATS_STORE).sort();
			log.warn("UIInstance.render: processor not found, details", {
				processor: processorName,
				sourceKey,
				availableProcessors,
				instance: self,
			});
			continue;
		}
		if (each) {
			current = mapProcessorCollection(current, (item) =>
				applyNamedProcessor(processor, item, self, data, sourceKey, processorName),
			);
			continue;
		}
		current = applyNamedProcessor(
			processor,
			current,
			self,
			data,
			sourceKey,
			processorName,
		);
	}
	return current;
};

const createWhenPredicate =
	(
		mode,
		key,
		processors = undefined,
		operator = null,
		comparisonValue = undefined,
	) =>
	(self, data) => {
		const value = resolveWhenValue(self, data, key);
		const resolved = applyNamedProcessors(self, data, value, processors, key);
		if (operator) {
			return TemplateParser.evaluateWhenComparison(
				resolved,
				operator,
				comparisonValue,
			);
		}
		return TemplateParser.evaluateWhen(mode, resolved);
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
// Type System
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

const isInputNode = (node) => {
	switch (node.nodeName) {
		case "INPUT":
		case "TEXTAREA":
		case "SELECT":
		case "DETAILS":
			return true;
		default:
			return false;
	}
};

const SKIP_INPUT_UPDATE = Symbol("skip-input-update");

const getInputBindingProperty = (node, preferred = undefined) => {
	if (preferred) {
		return preferred;
	}
	if (node?.nodeName === "DETAILS") {
		return "open";
	}
	return "value";
};

const getInputEventValue = (node, event, property = "value") => {
	const target = event?.target;
	if (!target) {
		return undefined;
	}
	if (property === "open") {
		return !!target.open;
	}
	if (property !== "value") {
		return target[property];
	}
	if (node?.nodeName === "INPUT") {
		const type = `${node.type || ""}`.toLowerCase();
		if (type === "checkbox") {
			return !!target.checked;
		}
		if (type === "radio") {
			return target.checked ? target.value : SKIP_INPUT_UPDATE;
		}
	}
	return target.value;
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
				if (node.nodeName === "DETAILS") {
					const next = !!text;
					if (node.open !== next) {
						node.open = next;
					}
				} else if (node.value !== text) {
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
class AppliedUITemplate {
	constructor(template, data) {
		this.template = template;
		this.data = data;
	}
}

export {
	FORMATS_PROXY,
	AppliedUITemplate,
	HTML,
	log,
	pruneTemplateWhitespace,
	resolveNamedProcessor,
	resolveSourceValue,
	resolveTemplateTokens,
	resolveWhenValue,
	scheduleRenderTask,
	setNodeText,
	SKIP_INPUT_UPDATE,
	SLOT_DEFAULT_KEY,
	TemplateParser,
	TemplateRegistry,
	UIEvent,
	applyNamedProcessors,
	createWhenPredicate,
	getInputBindingProperty,
	getInputEventValue,
	isInputNode,
	isPrunableWhitespaceText,
	type,
};

// EOF
