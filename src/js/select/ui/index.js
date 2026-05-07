// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: select/ui
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

import { len } from "../utils.js";

import {
	FORMATS_PROXY,
	HTML,
	logSelectUI,
	pruneTemplateWhitespace,
	TemplateRegistry,
	type,
	UIEvent,
	AppliedUITemplate,
} from "./html.js";

import {
	Adopted,
	COMPONENT_REGISTRY,
	Disconnect,
	Dynamic,
	lazy,
	UIAttributeSlot,
	UIAttributeTemplateSlot,
	UIContentSlot,
	UIEventSlot,
	UIEventTemplateSlot,
	UIInstance,
	UISlot,
	UITemplate,
	UITemplateSlot,
	UIWebComponent,
	webcomponent,
	uiOptions,
} from "./components.js";

// ----------------------------------------------------------------------------
//
// COMPONENT FACTORY
//
// ----------------------------------------------------------------------------

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
		cleanup: (...args) => {
			tmpl.cleanup(...args);
			return component;
		},
	});
	return component;
};

// ----------------------------------------------------------------------------
//
// UI FACTORY
//
// ----------------------------------------------------------------------------

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
		const templateRegistry = TemplateRegistry.for(scope);
		if (/^\s*</.test(selection)) {
			const doc = HTML.parseFromString(selection, "text/html");
			pruneTemplateWhitespace(doc.body);
			nodes = [...doc.body.childNodes];
			if (nodes.length === 1) {
				autoFormatName = TemplateRegistry.formatterName(nodes[0]);
			}
			TemplateRegistry.registerNodes(nodes, templateRegistry, scope);
		} else {
			const template = templateRegistry.get(TemplateRegistry.key(selection));
			if (template) {
				nodes = [...template.content.childNodes];
				autoFormatName = TemplateRegistry.formatterName(template);
			} else {
				let matchedTemplateCount = 0;
				let matchedTemplateName = null;
				const parent = scope?.querySelectorAll ? scope : document;
				for (const node of parent.querySelectorAll(selection)) {
					if (node.nodeName === "TEMPLATE") {
						matchedTemplateCount += 1;
						matchedTemplateName = TemplateRegistry.formatterName(node);
						TemplateRegistry.registerNode(node, templateRegistry, scope);
						nodes = [...nodes, ...node.content.childNodes];
					} else {
						nodes.push(node);
					}
				}
				if (matchedTemplateCount === 1) {
					autoFormatName = matchedTemplateName;
				}
				TemplateRegistry.registerNodes(nodes, templateRegistry, scope);
			}
		}
		if (nodes.length === 0) {
			logSelectUI("warn", "ui", "selector did not match any elements", {
				selector: selection,
				scope,
			});
		}
		const component = createComponent(
			new UITemplate(nodes, scope, autoFormatName),
		);
		if (autoFormatName) {
			ui.format(autoFormatName, component);
		}
		return component;
	}

	if (selection instanceof Node || Array.isArray(selection)) {
		const nodes = selection instanceof Node ? [selection] : selection;
		let autoFormatName = null;
		if (nodes.length === 1) {
			autoFormatName = TemplateRegistry.formatterName(nodes[0]);
		}
		TemplateRegistry.registerNodes(nodes, TemplateRegistry.for(scope), scope);
		const component = createComponent(
			new UITemplate([...nodes], scope, autoFormatName),
		);
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

// ----------------------------------------------------------------------------
//
// FORMATS & REGISTRY API
//
// ----------------------------------------------------------------------------

const formats = FORMATS_PROXY;
const options = uiOptions;

// Maps `f` over collection entries while preserving the original container.
function remap(value, f) {
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
	}
	const res = {};
	for (const k in value) {
		res[k] = f(value[k], k);
	}
	return res;
}

function format(name, formatter) {
	if (typeof name !== "string" || !name.trim()) {
		logSelectUI("error", "ui.formats", "invalid formatter name", {
			name,
			formatter,
		});
		return ui;
	}
	ui.formats[name.trim()] = formatter;
	return ui;
}

function unformat(name) {
	if (typeof name === "string" && name.trim()) {
		delete ui.formats[name.trim()];
	}
	return ui;
}

function formatter(name) {
	if (typeof name !== "string") {
		return undefined;
	}
	return ui.formats[name.trim()];
};

function resolveFormat(name) {
	return formatter(name);
}

// Registers `component` as `name` for Dynamic() resolution.
function register (name, component) {
	COMPONENT_REGISTRY.set(name, component);
	return ui;
};

// Resolves registered component by `name`.
function resolve (name){return COMPONENT_REGISTRY.get(name)};

Object.assign(ui, {
	formats,
	options,
	format,
	unformat,
	formatter,
	resolveFormat,
	register,
	resolve,
});

// ----------------------------------------------------------------------------
//
// EXPORTS
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
