// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-15
// Updated: 2026-06-10

// Module: select/ui/factory
// UI component factory and template/component construction.

// ----------------------------------------------------------------------------
//
// COMPONENT FACTORY
//
// ----------------------------------------------------------------------------

import {
	HTML,
	log,
	pruneTemplateWhitespace,
	TemplateRegistry,
} from "./templates.js";
import { FORMATS, format } from "../formats.js";
import {
	COMPONENTS,
	component as componentRegistry,
	options,
	UITemplate,
} from "./components.js";

const TEMPLATE_RESOURCES = new Map();
const TEMPLATE_RESOURCE_LOADS = new Map();
const TEMPLATE_NAME_STACKS = new Map();
const STYLE_RESOURCES = new Map();

function cloneSubs(subs) {
	if (!subs) {
		return undefined;
	}
	const res = new Map();
	for (const [event, handlers] of subs.entries()) {
		res.set(event, handlers.slice());
	}
	return res;
}

function createDefinitionState(name = null) {
	return {
		componentName: name,
		initializer: undefined,
		behavior: undefined,
		subs: undefined,
		doCleanup: undefined,
	};
}

function cloneDefinitionState(definition) {
	const source = definition ?? createDefinitionState();
	return {
		componentName: source.componentName ?? null,
		initializer: source.initializer,
		behavior: source.behavior ? { ...source.behavior } : undefined,
		subs: cloneSubs(source.subs),
		doCleanup: source.doCleanup,
	};
}

function mergeDefinitionBehavior(definition, behavior) {
	definition.behavior = Object.assign(definition.behavior ?? {}, behavior);
}

function mergeDefinitionSub(definition, event, handler = undefined) {
	if (typeof event === "string") {
		if (!handler) {
			return definition;
		}
		if (!definition.subs) {
			definition.subs = new Map();
		}
		if (definition.subs.has(event)) {
			definition.subs.get(event).push(handler);
		} else {
			definition.subs.set(event, [handler]);
		}
		return definition;
	}
	for (const key in event) {
		mergeDefinitionSub(definition, key, event[key]);
	}
	return definition;
}

function applyDefinitionToTemplate(tmpl, definition) {
	if (!definition) {
		return tmpl;
	}
	if (definition.initializer !== undefined) {
		tmpl.init(definition.initializer);
	}
	if (definition.behavior) {
		tmpl.does({ ...definition.behavior });
	}
	if (definition.subs) {
		for (const [event, handlers] of definition.subs.entries()) {
			for (let i = 0; i < handlers.length; i++) {
				tmpl.sub(event, handlers[i]);
			}
		}
	}
	if (definition.doCleanup !== undefined) {
		tmpl.cleanup(definition.doCleanup);
	}
	return tmpl;
}

function createDefinitionComponent(name = null, scope = document) {
	const definition = createDefinitionState(name);
	const component = (..._args) => {
		throw new Error(
			`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before rendering`,
		);
	};
	Object.assign(component, {
		isTemplate: false,
		isComponentDefinition: true,
		template: null,
		definition,
		singleton: null,
		new: (..._args) => {
			throw new Error(
				`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before .new(...)`,
			);
		},
		apply: (..._args) => {
			throw new Error(
				`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before .apply(...)`,
			);
		},
		map: (..._args) => {
			throw new Error(
				`ui.component(${JSON.stringify(name)}): definition is not bound to a template; call .using(...) before .map(...)`,
			);
		},
		using: (selection, boundScope = scope) =>
			createTemplateComponent(selection, boundScope, definition),
		init: (init) => {
			definition.initializer = init;
			return component;
		},
		does: (behavior) => {
			mergeDefinitionBehavior(definition, behavior);
			return component;
		},
		on: (...args) => {
			mergeDefinitionSub(definition, ...args);
			return component;
		},
		sub: (...args) => {
			mergeDefinitionSub(definition, ...args);
			return component;
		},
		cleanup: (handler) => {
			definition.doCleanup = handler;
			return component;
		},
	});
	return component;
}

function normalizeResourceURL(url, scope = document) {
	const baseURL =
		scope?.baseURI || document.baseURI || globalThis.location?.href;
	return new URL(url, baseURL).href;
}

function parseResourceReference(value, scope = document) {
	if (typeof value !== "string") {
		return null;
	}
	const source = value.trim();
	if (!source || /^\s*</.test(source)) {
		return null;
	}
	const hashIndex = source.indexOf("#");
	const rawURL = hashIndex === -1 ? source : source.slice(0, hashIndex);
	if (!rawURL) {
		return null;
	}
	if (
		!/^(?:\.{0,2}\/|\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(rawURL) &&
		!/\.(?:html?|xhtml)(?:\?|$)/i.test(rawURL)
	) {
		return null;
	}
	let url;
	try {
		url = normalizeResourceURL(rawURL, scope);
	} catch (_error) {
		return null;
	}
	const rawKey = hashIndex === -1 ? null : source.slice(hashIndex + 1);
	const key = TemplateRegistry.Key(rawKey);
	return {
		url,
		key,
		canonical: key ? `${url}#${key}` : url,
	};
}

function cloneTemplateSourceNodes(templateNode) {
	return [...templateNode.content.childNodes].map((node) =>
		node.cloneNode(true),
	);
}

function appendTemplateNameStack(name, url, templateNode) {
	if (!name || !url || !templateNode) {
		return;
	}
	let stack = TEMPLATE_NAME_STACKS.get(name);
	if (!stack) {
		stack = [];
		TEMPLATE_NAME_STACKS.set(name, stack);
	}
	for (let i = stack.length - 1; i >= 0; i--) {
		const existing = stack[i];
		if (existing.url === url && existing.templateNode === templateNode) {
			return;
		}
	}
	stack.push({ url, templateNode });
}

function resolveRecentLoadedTemplate(name) {
	if (!name) {
		return null;
	}
	const stack = TEMPLATE_NAME_STACKS.get(name);
	if (!stack || stack.length === 0) {
		return null;
	}
	return stack[stack.length - 1];
}

function getTemplateResource(ref, scope = document) {
	const parsed =
		typeof ref === "string" ? parseResourceReference(ref, scope) : ref;
	if (!parsed) {
		return null;
	}
	const resource = TEMPLATE_RESOURCES.get(parsed.url);
	if (!resource) {
		throw new Error(
			`ui(): template resource not loaded: ${parsed.url}; call ui.load(${JSON.stringify(parsed.url)}) first`,
		);
	}
	if (!parsed.key) {
		return { parsed, resource, templateNode: null };
	}
	const templateNode = resource.templates.get(parsed.key);
	if (!templateNode) {
		throw new Error(
			`ui(): template ${JSON.stringify(parsed.key)} not found in ${parsed.url}`,
		);
	}
	return { parsed, resource, templateNode };
}

async function load(url, scope = document) {
	const parsed = parseResourceReference(url, scope);
	const resourceURL = parsed?.url ?? normalizeResourceURL(url, scope);
	if (STYLE_RESOURCES.has(resourceURL)) {
		return STYLE_RESOURCES.get(resourceURL);
	}
	if (TEMPLATE_RESOURCES.has(resourceURL)) {
		return TEMPLATE_RESOURCES.get(resourceURL);
	}
	if (TEMPLATE_RESOURCE_LOADS.has(resourceURL)) {
		return TEMPLATE_RESOURCE_LOADS.get(resourceURL);
	}
	const promise = (async () => {
		const response = await fetch(resourceURL);
		if (!response.ok) {
			throw new Error(
				`ui.load(): unable to load ${resourceURL} (${response.status} ${response.statusText})`,
			);
		}
		const source = await response.text();
		if (/\.css(?:\?|$)/i.test(resourceURL)) {
			const style = document.createElement("style");
			style.setAttribute("data-ui-load", resourceURL);
			style.textContent = source;
			const target =
				scope?.head ||
				document.head ||
				document.documentElement ||
				document.body;
			target.appendChild(style);
			const resource = { url: resourceURL, type: "css", node: style };
			STYLE_RESOURCES.set(resourceURL, resource);
			return resource;
		}
		const doc = HTML.parseFromString(source, "text/html");
		pruneTemplateWhitespace(doc.body);
		const nodes = [...doc.body.childNodes];
		const registry = TemplateRegistry.For(doc);
		TemplateRegistry.RegisterNodes(nodes, registry, doc);
		const templates = new Map();
		for (const [key, templateNode] of registry.entries()) {
			if (templateNode?.nodeName === "TEMPLATE") {
				templates.set(key, templateNode);
				const name = TemplateRegistry.FormatterName(templateNode);
				if (name) {
					appendTemplateNameStack(name, resourceURL, templateNode);
				}
			}
		}
		const resource = { url: resourceURL, doc, templates };
		TEMPLATE_RESOURCES.set(resourceURL, resource);
		return resource;
	})();
	TEMPLATE_RESOURCE_LOADS.set(resourceURL, promise);
	try {
		return await promise;
	} finally {
		TEMPLATE_RESOURCE_LOADS.delete(resourceURL);
	}
}

function createTemplateComponent(
	selection,
	scope = document,
	definition = null,
) {
	const appliedDefinition = definition
		? cloneDefinitionState(definition)
		: null;
	if (typeof selection === "string") {
		let nodes = [];
		let defaultData = null;
		let sourceMode = "default";
		let sourceHosts = null;
		let autoFormatName = null;
		const resourceRef = parseResourceReference(selection, scope);
		if (resourceRef) {
			const resolved = getTemplateResource(resourceRef, scope);
			if (!resolved?.templateNode) {
				throw new Error(
					`ui(): external template reference requires a #Template name: ${selection}`,
				);
			}
			nodes = cloneTemplateSourceNodes(resolved.templateNode);
			autoFormatName = TemplateRegistry.FormatterName(resolved.templateNode);
		} else {
			const templateRegistry = TemplateRegistry.For(scope);
			if (/^\s*</.test(selection)) {
				const doc = HTML.parseFromString(selection, "text/html");
				pruneTemplateWhitespace(doc.body);
				nodes = [...doc.body.childNodes];
				if (nodes.length === 1) {
					autoFormatName = TemplateRegistry.FormatterName(nodes[0]);
				}
				TemplateRegistry.RegisterNodes(nodes, templateRegistry, scope);
			} else {
				const templateKey = TemplateRegistry.Key(selection);
				const template = templateRegistry.get(templateKey);
				if (template) {
					nodes = [...template.content.childNodes];
					autoFormatName = TemplateRegistry.FormatterName(template);
				} else if (templateKey) {
					const recent = resolveRecentLoadedTemplate(templateKey);
					if (recent?.templateNode) {
						nodes = cloneTemplateSourceNodes(recent.templateNode);
						autoFormatName = TemplateRegistry.FormatterName(
							recent.templateNode,
						);
					}
				}
				if (nodes.length === 0) {
					let matchedTemplateCount = 0;
					let matchedTemplateName = null;
					const matchedNodes = [];
					const parent = scope?.querySelectorAll ? scope : document;
					let query = selection;
					let queried = [];
					try {
						queried = [...parent.querySelectorAll(query)];
					} catch (_error) {
						queried = [];
					}
					if (
						queried.length === 0 &&
						!selection.includes("#") &&
						!selection.includes(".") &&
						!selection.includes("[") &&
						!selection.includes(":") &&
						!/\s/.test(selection)
					) {
						query = `#${selection}`;
						try {
							queried = [...parent.querySelectorAll(query)];
						} catch (_error) {
							queried = [];
						}
					}
					for (const node of queried) {
						if (node.nodeName === "TEMPLATE") {
							matchedTemplateCount += 1;
							matchedTemplateName = TemplateRegistry.FormatterName(node);
							TemplateRegistry.RegisterNode(node, templateRegistry, scope);
							nodes = [...nodes, ...node.content.childNodes];
						} else {
							matchedNodes.push(node);
						}
					}
					if (matchedTemplateCount === 0 && matchedNodes.length > 0) {
						sourceMode = "fallback-node-template";
						sourceHosts = matchedNodes;
						let hasDefaultData = false;
						defaultData = {};
						for (const node of matchedNodes) {
							nodes.push(node.cloneNode(true));
							const payload = node.getAttribute?.("data");
							if (payload !== null && payload !== undefined && payload !== "") {
								let parsedPayload;
								try {
									parsedPayload = JSON.parse(payload);
								} catch (_error) {
									throw new Error(
										`ui(): invalid JSON in [data] attribute for selector ${JSON.stringify(selection)}`,
									);
								}
								if (
									parsedPayload === null ||
									typeof parsedPayload !== "object" ||
									Array.isArray(parsedPayload)
								) {
									throw new Error(
										`ui(): [data] attribute JSON for selector ${JSON.stringify(selection)} must be an object`,
									);
								}
								Object.assign(defaultData, parsedPayload);
								hasDefaultData = true;
							}
						}
						if (!hasDefaultData) {
							defaultData = null;
						}
					}
					if (matchedTemplateCount === 1) {
						autoFormatName = matchedTemplateName;
					}
				}
				if (nodes.length > 0) {
					TemplateRegistry.RegisterNodes(nodes, templateRegistry, scope);
				}
			}
		}
		if (nodes.length === 0) {
			const looksLikeTemplateName =
				!resourceRef &&
				!/^[\s<]/.test(selection) &&
				!selection.includes("#") &&
				!selection.includes(".") &&
				!selection.includes("[") &&
				!selection.includes(":") &&
				!/\s/.test(selection);
			if (looksLikeTemplateName) {
				throw new Error(
					`ui(): cannot create component: template ${JSON.stringify(selection)} was not found`,
				);
			}
			log.warn("ui: selector did not match any elements, details", {
				selector: selection,
				scope,
			});
		}
		const template = applyDefinitionToTemplate(
			new UITemplate(stripTemplateNodes(nodes), scope, autoFormatName),
			appliedDefinition,
		);
		if (sourceMode === "fallback-node-template") {
			template.sourceMode = sourceMode;
			template.sourceSelector = selection;
			template.sourceHosts = sourceHosts;
			template.defaultData = defaultData;
		}
		const component = createComponent(template, nodes, appliedDefinition);
		if (autoFormatName) {
			format(autoFormatName, component);
		}
		return component;
	}

	if (selection instanceof Node || Array.isArray(selection)) {
		const nodes = selection instanceof Node ? [selection] : selection;
		let autoFormatName = null;
		if (nodes.length === 1) {
			autoFormatName = TemplateRegistry.FormatterName(nodes[0]);
		}
		TemplateRegistry.RegisterNodes(nodes, TemplateRegistry.For(scope), scope);
		const template = applyDefinitionToTemplate(
			new UITemplate(stripTemplateNodes(nodes), scope, autoFormatName),
			appliedDefinition,
		);
		const component = createComponent(template, nodes, appliedDefinition);
		if (autoFormatName) {
			format(autoFormatName, component);
		}
		return component;
	}

	throw new Error(
		`ui() received an invalid selection type: ${typeof selection}. ` +
			`Expected a string (CSS selector or HTML), a DOM Node, or an array of DOM Nodes. ` +
			`Received: ${selection}`,
	);
}

function stripTemplateNodes(nodes) {
	const candidates = [];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (!node || node.nodeName === "TEMPLATE") {
			continue;
		}
		const clone = node.cloneNode(true);
		if (clone.querySelectorAll) {
			for (const nested of clone.querySelectorAll("template")) {
				nested.remove();
			}
		}
		candidates.push(clone);
	}
	let start = 0;
	let end = candidates.length - 1;
	while (
		start <= end &&
		candidates[start]?.nodeType === Node.TEXT_NODE &&
		!/\S/.test(candidates[start].data || "")
	) {
		start += 1;
	}
	while (
		end >= start &&
		candidates[end]?.nodeType === Node.TEXT_NODE &&
		!/\S/.test(candidates[end].data || "")
	) {
		end -= 1;
	}
	const res = [];
	for (let i = start; i <= end; i++) {
		res.push(candidates[i]);
	}
	return res;
}

function qualifyNestedTemplateName(parentName, childName) {
	return parentName && childName ? `${parentName}${childName}` : childName;
}

function createLexicalTemplateScope(parentScope = undefined) {
	return Object.create(parentScope ?? null);
}

function registerComponentFormat(name, component) {
	if (!name) {
		return;
	}
	const existing = FORMATS[name];
	if (existing && existing !== component) {
		log.warn(
			"ui.formats: duplicate component key, keeping first registration, details",
			{
				key: name,
				existing,
				ignored: component,
			},
		);
		return;
	}
	format(name, component);
}

function visitImmediateNestedTemplates(node, visitor) {
	if (!node?.childNodes) {
		return;
	}
	for (const child of node.childNodes) {
		if (child?.nodeName === "TEMPLATE") {
			visitor(child);
			continue;
		}
		visitImmediateNestedTemplates(child, visitor);
	}
}

// Function: createComponent
// Wraps a `UITemplate` into a callable component facade and attaches helper
// methods (`new`, `map`, `on`, `sub`, `cleanup`) used by the UI runtime.
function createComponent(
	tmpl,
	localTemplateNodes = tmpl.nodes,
	definition = null,
) {
	const component = (...args) => tmpl.apply(...args);
	const localDefinition = cloneDefinitionState(
		definition ?? {
			componentName: tmpl.componentName ?? null,
			initializer: tmpl.initializer,
			behavior: tmpl.behavior,
			subs: tmpl.subs,
			doCleanup: tmpl.doCleanup,
		},
	);
	const lexicalTemplates =
		tmpl.lexicalTemplates ?? createLexicalTemplateScope();
	tmpl.lexicalTemplates = lexicalTemplates;
	tmpl.component = component;
	Object.assign(component, {
		isTemplate: true,
		template: tmpl,
		definition: localDefinition,
		singleton: null,
		new: (...args) => tmpl.new(...args),
		using: (selection, scope = tmpl.scope) =>
			createTemplateComponent(selection, scope, localDefinition),
		init: (...args) => {
			localDefinition.initializer = args[0];
			tmpl.init(...args);
			return component;
		},
		map: (...args) => tmpl.map(...args),
		apply: (...args) => tmpl.apply(...args),
		does: (...args) => {
			mergeDefinitionBehavior(localDefinition, args[0]);
			tmpl.does(...args);
			return component;
		},
		on: (...args) => {
			mergeDefinitionSub(localDefinition, ...args);
			tmpl.sub(...args);
			return component;
		},
		sub: (...args) => {
			mergeDefinitionSub(localDefinition, ...args);
			tmpl.sub(...args);
			return component;
		},
		cleanup: (...args) => {
			localDefinition.doCleanup = args[0];
			tmpl.cleanup(...args);
			return component;
		},
	});
	const localTemplates = new Map();
	const registerLocalTemplate = (
		templateNode,
		qname = tmpl.componentName ?? null,
	) => {
		if (templateNode?.nodeName !== "TEMPLATE") {
			return;
		}
		const name = TemplateRegistry.FormatterName(templateNode);
		const childQName = qualifyNestedTemplateName(qname, name);
		if (name && !localTemplates.has(name)) {
			const childNodes = [...templateNode.content.childNodes];
			const childTemplate = new UITemplate(
				stripTemplateNodes(childNodes),
				tmpl.scope,
				childQName,
			);
			childTemplate.lexicalTemplates =
				createLexicalTemplateScope(lexicalTemplates);
			const childComponent = createComponent(childTemplate, childNodes);
			component[name] = childComponent;
			localTemplates.set(name, childComponent);
			lexicalTemplates[name] = childComponent;
			registerComponentFormat(childQName, childComponent);
		}
		if (!templateNode.content) {
			return;
		}
		visitImmediateNestedTemplates(templateNode.content, (nested) =>
			registerLocalTemplate(nested, childQName),
		);
	};
	for (let i = 0; i < localTemplateNodes.length; i++) {
		const node = localTemplateNodes[i];
		if (node?.nodeName === "TEMPLATE") {
			registerLocalTemplate(node);
		}
		visitImmediateNestedTemplates(node, (nested) =>
			registerLocalTemplate(nested),
		);
	}
	if (localTemplates.size) {
		tmpl.localTemplates = localTemplates;
	}
	return component;
}

// Function: ui
// Resolves `selection` against `scope` and returns a component factory.
// `selection` can be HTML, a CSS selector, a DOM node, or an array of nodes.
function ui(selection, scope = document) {
	if (selection === null || selection === undefined) {
		throw new Error(
			`ui() received ${selection === null ? "null" : "undefined"} as selection. ` +
				`Expected a CSS selector string, an HTML string starting with "<", ` +
				`a DOM Node, or an array of DOM Nodes. ` +
				`Example: ui("#container") or ui("<div>Hello</div>")`,
		);
	}

	return createTemplateComponent(selection, scope);
}

// Function: register
// Registers `value` as `name` for Dynamic() resolution.
function register(name, value) {
	componentRegistry(name, value);
	return ui;
}

// Function: resolve
// Resolves a registered component by `name`.
function resolve(name) {
	return componentRegistry(name);
}

function defineComponent(name, ...value) {
	if (name && typeof name === "object" && !Array.isArray(name)) {
		return componentRegistry(name, ...value);
	}
	if (value.length > 0) {
		return componentRegistry(name, ...value);
	}
	const existing = componentRegistry(name);
	if (existing !== undefined) {
		return existing;
	}
	const definition = createDefinitionComponent(name);
	if (typeof name === "string" && name.trim()) {
		componentRegistry(name, definition);
	}
	return definition;
}

Object.assign(ui, {
	formats: FORMATS,
	components: COMPONENTS,
	options,
	format,
	component: defineComponent,
	register,
	resolve,
	load,
});

export { createComponent, stripTemplateNodes, ui };
export default ui;

// EOF
