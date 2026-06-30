// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-18

// Module: select/ui/components/runtime
// Shared rendering helpers for component templates and instances.

// ----------------------------------------------------------------------------
//
// RUNTIME CORE
//
// ----------------------------------------------------------------------------

import { unwrap } from "../../cells.js";
import { FORMATS } from "../../formats.js";
import { expand, isPascalCase, microtask } from "../../utils.js";

import { isInputNode, log, TemplateParser } from "../templates.js";

const SLOT_DEFAULT_KEY = "_";
const SKIP_INPUT_UPDATE = Symbol("skip-input-update");
function getInputBindingProperty(node, preferred = undefined) {
	return preferred
		? preferred
		: node?.nodeName === "DETAILS"
			? "open"
			: "value";
}
function getInputEventValue(node, event, property = "value") {
	const target = event?.target;
	if (!target) return undefined;
	if (property === "open") return !!target.open;
	if (property !== "value") return target[property];
	if (node?.nodeName === "INPUT") {
		const type = `${node.type || ""}`.toLowerCase();
		if (type === "checkbox") return !!target.checked;
		if (type === "radio")
			return target.checked ? target.value : SKIP_INPUT_UPDATE;
		if (type === "number" || type === "range") {
			const value = `${target.value || ""}`.trim();
			if (!value.length) return null;
			const numeric = Number(value);
			return Number.isNaN(numeric) ? null : numeric;
		}
	}
	return target.value;
}
function setNodeText(node, text) {
	switch (node.nodeType) {
		case Node.TEXT_NODE:
			if (node.data !== text) node.data = text;
			break;
		case Node.ELEMENT_NODE:
			if (isInputNode(node)) {
				if (node.nodeName === "DETAILS") {
					const next = !!text;
					if (node.open !== next) node.open = next;
				} else if (node.value !== text) {
					node.value = text;
				}
			} else if (node.textContent !== text) {
				node.textContent = text;
			}
			break;
	}
	return node;
}
function normalizeSourceKey(sourceKey) {
	if (sourceKey === "data" || sourceKey === ".") return "";
	if (sourceKey.startsWith("data.")) return sourceKey.slice(5);
	if (sourceKey.startsWith(".")) return sourceKey.slice(1);
	return sourceKey;
}

function resolveCurrentKey(self, data, itemKey = undefined) {
	return itemKey !== undefined ? itemKey : self?.key ?? data?.$key;
}

function resolveSourceValue(data, sourceKey, self = undefined, itemKey = undefined) {
	if (!sourceKey) return undefined;
	if (sourceKey === "#") return resolveCurrentKey(self, data, itemKey);
	const normalizedKey = normalizeSourceKey(sourceKey);
	if (!normalizedKey) return data;
	if (!normalizedKey.includes("."))
		return data ? data[normalizedKey] : undefined;
	return resolveDataPath(data, normalizedKey.split("."), self, itemKey);
}

function formatBindingSource(binding) {
	if (!binding) return "";
	if (binding.sourceMap?.length) {
		return TemplateParser.FormatBindingSourceMap(binding.sourceMap);
	}
	return binding.sourceKey || "";
}

function resolveRenderableValue(value) {
	return unwrap(expand(value));
}

function resolveTraversalValue(value) {
	return value?.isReactive === true ? unwrap(value) : value;
}

function resolveExpandedSourceValue(data, sourceKey, self = undefined, itemKey = undefined) {
	const value = resolveSourceValue(data, sourceKey, self, itemKey);
	return value === undefined ? undefined : resolveRenderableValue(value);
}

function resolveDataPathRawLeaf(
	data,
	path,
	self = undefined,
	itemKey = undefined,
) {
	if (!path?.length) return data;
	let value = path[0] === "#" ? resolveCurrentKey(self, data, itemKey) : data;
	let i = path[0] === "." || path[0] === "#" ? 1 : 0;
	for (; i < path.length - 1; i++) {
		value = resolveTraversalValue(value);
		if (value === undefined || value === null) return undefined;
		value = value[path[i]];
	}
	if (i >= path.length) return value;
	value = resolveTraversalValue(value);
	if (value === undefined || value === null) return undefined;
	return value[path[i]];
}

function resolveMappedSourceValue(
	data,
	sourceMap,
	expandValues = false,
	self = undefined,
	itemKey = undefined,
) {
	if (!sourceMap?.length) return undefined;
	const result = {};
	for (let i = 0; i < sourceMap.length; i++) {
		const entry = sourceMap[i];
		const value = expandValues
			? resolveDataPath(data, entry.path, self, itemKey)
			: resolveDataPathRawLeaf(data, entry.path, self, itemKey);
		result[entry.key] =
			expandValues && value !== undefined
				? resolveRenderableValue(value)
				: value;
	}
	return result;
}

function resolveBindingValue(
	data,
	binding,
	expandValues = false,
	self = undefined,
	itemKey = undefined,
) {
	if (!binding) return undefined;
	if (binding.sourceMap?.length) {
		return resolveMappedSourceValue(
			data,
			binding.sourceMap,
			expandValues,
			self,
			itemKey,
		);
	}
	return expandValues
		? resolveExpandedSourceValue(data, binding.sourceKey, self, itemKey)
		: resolveSourceValue(data, binding.sourceKey, self, itemKey);
}

function scheduleRenderTask(fn) {
	const mutate = globalThis.fastdom?.mutate;
	if (typeof mutate === "function") {
		mutate(fn);
	} else {
		microtask(fn);
	}
}
function resolveWhenValue(self, data, key) {
	const behavior = self?.template?.behavior;
	const b = behavior?.[key];
	if (b) return b(self, data, null);
	return resolveExpandedSourceValue(data, key, self);
}


function resolveDataPath(data, path, self = undefined, itemKey = undefined) {
	if (!path?.length) return data;
	let value = path[0] === "#" ? resolveCurrentKey(self, data, itemKey) : data;
	let i = path[0] === "." || path[0] === "#" ? 1 : 0;
	for (; i < path.length; i++) {
		value = resolveRenderableValue(value);
		if (value === undefined || value === null) return undefined;
		value = value[path[i]];
	}
	return resolveRenderableValue(value);
}

function mapProcessorCollection(value, f) {
	if (
		value === null ||
		value === undefined ||
		typeof value === "number" ||
		typeof value === "string"
	)
		return value;
	if (Array.isArray(value)) {
		const n = value.length;
		const res = new Array(n);
		for (let i = 0; i < n; i++) res[i] = f(value[i], i);
		return res;
	}
	if (value instanceof Map) {
		const res = new Map();
		for (const [k, v] of value.entries()) res.set(k, f(v, k));
		return res;
	}
	if (value instanceof Set) {
		const res = new Set();
		for (const v of value) res.add(f(v, undefined));
		return res;
	}
	if (typeof value === "object") {
		const res = {};
		for (const k in value) res[k] = f(value[k], k);
		return res;
	}
	return value;
}

function resolveNamedProcessor(self, name) {
	if (!self?.template || !name) return null;
	const lexicalTemplate = self.template.lexicalTemplates?.[name];
	if (lexicalTemplate) {
		return { type: "component", value: lexicalTemplate };
	}
	let current = self;
	while (current) {
		const template = current.template;
		const localTemplate = template?.localTemplates?.get(name);
		if (localTemplate) return { type: "component", value: localTemplate };
		current = current.parent;
	}
	const registered = FORMATS[name];
	if (!registered) {
		return null;
	}
	const isPascal = isPascalCase(name);
	const isComponent =
		typeof registered === "function" &&
		(registered?.isTemplate || typeof registered?.new === "function");
	if (isPascal && !isComponent)
		log.warn("ui.formats: PascalCase formatter is not a component, details", {
			name,
			formatter: registered,
		});
	if (!isPascal && isComponent)
		log.warn("ui.formats: component formatter should use PascalCase, details", {
			name,
			formatter: registered,
		});
	return { type: isComponent ? "component" : "function", value: registered };
}

function normalizeProcessorDescriptor(processor) {
	if (!processor) return null;
	if (typeof processor === "string") {
		return TemplateParser.ParseProcessorToken(processor);
	}
	if (typeof processor.name !== "string" || !processor.name.length) {
		return null;
	}
	return {
		raw: processor.raw || TemplateParser.FormatProcessorToken(processor),
		each: processor.each === true,
		name: processor.name,
		args: Array.isArray(processor.args) ? processor.args : [],
	};
}

function resolveProcessorArgs(data, args, self = undefined, itemKey = undefined) {
	if (!args?.length) return null;
	const resolved = new Array(args.length);
	for (let i = 0; i < args.length; i++) {
		resolved[i] = resolveDataPath(data, args[i], self, itemKey);
	}
	return resolved;
}

function applyNamedProcessor(
	processor,
	current,
	self,
	data,
	sourceKey,
	descriptor,
	{ expandFunctions = true, args = null, itemKey = undefined } = {},
) {
	if (processor.type === "component") {
		const component = processor.value;
		const value = current?.isReactive === true ? unwrap(current) : current;
		if (value === undefined || value === null) return value;
		if (
			component?.isTemplate &&
			typeof component?.apply === "function" &&
			typeof component !== "function"
		) {
			return component.apply(value, self, data, sourceKey, descriptor.name);
		}
		if (typeof component?.apply === "function" && component?.isTemplate)
			return component(value);
		if (typeof component === "function") return component(value, self, data);
		return value;
	}
	const value = expandFunctions ? resolveRenderableValue(current) : current;
	const argValues = args || [];
	if (descriptor.each && itemKey !== undefined) {
		return argValues.length
			? processor.value(value, itemKey, ...argValues)
			: processor.value(value, itemKey);
	}
	return argValues.length ? processor.value(value, ...argValues) : processor.value(value);
}

function resolveNamedProcessorChainType(self, processors, _sourceKey) {
	let lastProcessorType = null;
	if (!processors || processors.length === 0) return lastProcessorType;
	for (let i = 0; i < processors.length; i++) {
		const descriptor = normalizeProcessorDescriptor(processors[i]);
		if (!descriptor) continue;
		const processor = resolveNamedProcessor(self, descriptor.name);
		if (processor) lastProcessorType = processor.type;
	}
	return lastProcessorType;
}

function applyNamedProcessors(
	self,
	data,
	value,
	processors,
	sourceKey,
	options = undefined,
) {
	const withMeta = options?.withMeta === true;
	if (!processors || processors.length === 0)
		return withMeta ? { value, lastProcessorType: null } : value;
	let current = value;
	let lastProcessorType = null;
	for (let i = 0; i < processors.length; i++) {
		const descriptor = normalizeProcessorDescriptor(processors[i]);
		if (!descriptor) {
			continue;
		}
		const processor = resolveNamedProcessor(self, descriptor.name);
		if (!processor) {
			const availableProcessors = Object.keys(FORMATS).sort();
			log.warn(
				`UIInstance.render: processor not found: ${descriptor.name}, details`,
				{
					processor: descriptor.name,
					sourceKey,
					availableProcessors,
					instance: self,
				},
			);
			continue;
		}
		lastProcessorType = processor.type;
		const args = resolveProcessorArgs(data, descriptor.args, self, options?.itemKey);
		if (descriptor.each) {
			// NOTE: Starred processors act on the expanded collection shape, not on
			// the reactive wrapper that may hold it.
			current =
				processor.type === "component"
					? unwrap(current)
					: resolveRenderableValue(current);
			current = mapProcessorCollection(current, (item, itemKey) =>
				applyNamedProcessor(
					processor,
					item,
					self,
					data,
					sourceKey,
					descriptor,
					{ ...options, itemKey, args },
				),
			);
			const tail = processors.slice(i + 1);
			if (tail.length === 0) {
				return withMeta
					? { value: current, lastProcessorType: processor.type }
					: current;
			}
			current = mapProcessorCollection(current, (item, itemKey) =>
				applyNamedProcessors(self, data, item, tail, sourceKey, {
					...options,
					withMeta: false,
					itemKey,
				}),
			);
			return withMeta
				? {
						value: current,
						lastProcessorType: resolveNamedProcessorChainType(
							self,
							tail,
							sourceKey,
						),
					}
				: current;
		}
		current = applyNamedProcessor(
			processor,
			current,
			self,
			data,
			sourceKey,
			descriptor,
			{ ...options, args },
		);
	}
	return withMeta
		? {
				value: current,
				lastProcessorType:
					lastProcessorType ??
					resolveNamedProcessorChainType(self, processors, sourceKey),
			}
		: current;
}

function finalizeRenderProcessorValue(value, lastProcessorType = null) {
	return lastProcessorType === "component"
		? value
		: resolveRenderableValue(value);
}

function resolveTemplateTokens(self, tokens, data) {
	if (!tokens?.length) return "";
	const behavior = self?.template?.behavior;
	let result = "";
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.type === "text") {
			result += token.value;
			continue;
		}
		if (token.type === "invalid") continue;
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
						: resolveDataPath(data, path, self);
			} else {
				value = resolveDataPath(data, path, self);
			}
			if (value === undefined || value === null) continue;
			let resolved = expand(value);
			if (token.value.processors?.length) {
				const processed = applyNamedProcessors(
					self,
					data,
					resolved,
					token.value.processors,
					path.join("."),
					{ withMeta: true },
				);
				resolved = finalizeRenderProcessorValue(
					processed.value,
					processed.lastProcessorType,
				);
			}
			if (resolved !== undefined && resolved !== null)
				result += String(resolved);
		}
	}
	return result;
}

function createSingleWhenPredicate(
	mode,
	key,
	processors = undefined,
	operator = null,
	comparisonValue = undefined,
) {
	return (self, data) => {
		const value = resolveWhenValue(self, data, key);
		const resolved = applyNamedProcessors(self, data, value, processors, key);
		if (operator)
			return TemplateParser.EvaluateWhenComparison(
				resolved,
				operator,
				comparisonValue,
			);
		return TemplateParser.EvaluateWhen(mode, resolved);
	};
}

function createWhenPredicate(parsed) {
	if (parsed?.clauses?.length) {
		const predicates = new Array(parsed.clauses.length);
		for (let i = 0; i < parsed.clauses.length; i++) {
			const clause = parsed.clauses[i];
			predicates[i] = createSingleWhenPredicate(
				clause.mode,
				clause.key,
				clause.processors,
				clause.operator,
				clause.value,
			);
		}
		return (self, data) => {
			for (let i = 0; i < predicates.length; i++) {
				if (!predicates[i](self, data)) return false;
			}
			return true;
		};
	}
	return createSingleWhenPredicate(
		parsed?.mode,
		parsed?.key,
		parsed?.processors,
		parsed?.operator,
		parsed?.value,
	);
}

function createTrackingProxy(data) {
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
}

function snapshotReactiveDependencyRevisions(data, deps) {
	if (!data || !deps || deps.size === 0) {
		return null;
	}
	const revisions = new Map();
	for (const dep of deps) {
		const value = data[dep];
		if (value?.isReactive === true && Number.isFinite(value.revision)) {
			revisions.set(dep, value.revision);
		}
	}
	return revisions.size > 0 ? revisions : null;
}

function hasTrackedNonReactiveObjectDeps(data, deps) {
	if (!data || !deps || deps.size === 0) {
		return false;
	}
	for (const dep of deps) {
		const value = data[dep];
		if (
			value &&
			value.isReactive !== true &&
			typeof value === "object" &&
			(value.constructor === Object || Array.isArray(value))
		) {
			return true;
		}
	}
	return false;
}

function isThenable(value) {
	return (
		value !== null &&
		value !== undefined &&
		(typeof value === "object" || typeof value === "function") &&
		typeof value.then === "function"
	);
}

export {
	applyNamedProcessors,
	createTrackingProxy,
	createWhenPredicate,
	finalizeRenderProcessorValue,
	formatBindingSource,
	getInputBindingProperty,
	getInputEventValue,
	hasTrackedNonReactiveObjectDeps,
	isThenable,
	resolveBindingValue,
	resolveDataPath,
	resolveExpandedSourceValue,
	resolveMappedSourceValue,
	resolveRenderableValue,
	resolveSourceValue,
	resolveTemplateTokens,
	SKIP_INPUT_UPDATE,
	SLOT_DEFAULT_KEY,
	scheduleRenderTask,
	setNodeText,
	snapshotReactiveDependencyRevisions,
};

// EOF
