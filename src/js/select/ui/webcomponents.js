// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-15
// Updated: 2026-06-02

// Module: select/ui/webcomponents
// Web component bridge for UI templates and pure render functions.

// ----------------------------------------------------------------------------
//
// WEB COMPONENT BRIDGE
//
// ----------------------------------------------------------------------------

import { toCamelCase, toKebabCase } from "../formats.js";
import { asText, isObject, Nothing } from "../utils.js";
import { log } from "./templates.js";

// Constant: Disconnect
// Lifecycle sentinel fired when a component disconnects from the DOM.
const Disconnect = Symbol.for("Disconnect");
// Constant: Adopted
// Lifecycle sentinel fired when a component is adopted into a new document.
const Adopted = Symbol.for("Adopted");
const BaseHTMLElement = globalThis.HTMLElement || class {};
const documentStyleSheetCache = new WeakMap();

function parseAttributeValue(value) {
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
}

function splitAttributeInitial(initial) {
	const defaults = {};
	const processors = new Map();

	if (initial && typeof initial === "object") {
		for (const key in initial) {
			const value = initial[key];
			if (typeof value === "function") {
				processors.set(key, value);
			} else {
				defaults[key] = value;
			}
		}
	}

	return { defaults, processors };
}

function createAttributeBindings(initial, options) {
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
			addBinding(toKebabCase(key), key);
		}
	}

	if (isObject(options?.attributes)) {
		for (const attribute in options.attributes) {
			addBinding(attribute, options.attributes[attribute]);
		}
	}

	if (Array.isArray(options?.observedAttributes)) {
		for (const attribute of options.observedAttributes) {
			if (typeof attribute !== "string") {
				continue;
			}
			const key = toCamelCase(attribute);
			addBinding(attribute, key);
		}
	}

	return bindings;
}

function collectObservedAttributes(initial, bindings, options) {
	const attributes = new Set();

	if (initial && typeof initial === "object") {
		for (const key in initial) {
			attributes.add(`${key}`.toLowerCase());
			attributes.add(toKebabCase(key));
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
}

function asDOMNodes(value, nodes = []) {
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
			asDOMNodes(value[i], nodes);
		}
		return nodes;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			asDOMNodes(value[i], nodes);
		}
		return nodes;
	}
	nodes.push(document.createTextNode(asText(value)));
	return nodes;
}

function buildDocumentStyleSheets(doc) {
	if (!doc?.head?.querySelectorAll) {
		return { sheets: [], fallbackNodes: [] };
	}
	const nodes = doc.head.querySelectorAll("style,link[rel~='stylesheet']");
	const sheets = [];
	const fallbackNodes = [];
	const HTMLStyleElementType =
		globalThis.HTMLStyleElement || doc.defaultView?.HTMLStyleElement;
	const CSSStyleSheetType =
		globalThis.CSSStyleSheet || doc.defaultView?.CSSStyleSheet;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (
			HTMLStyleElementType &&
			node instanceof HTMLStyleElementType &&
			typeof CSSStyleSheetType === "function"
		) {
			try {
				const sheet = new CSSStyleSheetType();
				sheet.replaceSync(node.textContent || "");
				sheets.push(sheet);
				continue;
			} catch (error) {
				log.warn("UIWebComponent: could not adopt document style, details", {
					node,
					error,
				});
			}
		}
		fallbackNodes.push(node);
	}
	return { sheets, fallbackNodes };
}

function getDocumentStyles(doc) {
	const cached = documentStyleSheetCache.get(doc);
	const headChildCount = doc?.head?.children?.length ?? 0;
	if (cached && cached.headChildCount === headChildCount) {
		return cached;
	}
	const value = {
		...buildDocumentStyleSheets(doc),
		headChildCount,
	};
	documentStyleSheetCache.set(doc, value);
	return value;
}

function cloneDocumentStyles(root, options) {
	if (options?.documentStyles === false) {
		return;
	}
	if (!root || root === document || !document?.head?.querySelectorAll) {
		return;
	}
	const { sheets, fallbackNodes } = getDocumentStyles(document);
	if (sheets.length && "adoptedStyleSheets" in root) {
		root.adoptedStyleSheets = [...(root.adoptedStyleSheets || []), ...sheets];
	}
	if (!("adoptedStyleSheets" in root) || fallbackNodes.length) {
		for (let i = 0; i < fallbackNodes.length; i++) {
			root.appendChild(fallbackNodes[i].cloneNode(true));
		}
	}
}

// Class: UIWebComponent
// Base custom element that binds a component factory to DOM attributes and
// renders its template into `root`.
//
// Attributes:
// - `root`: ShadowRoot|HTMLElement - render target for the component
// - `componentFactory`: function - component factory used to produce content
// - `attributeBindings`: Map - attribute-to-data key mapping
// - `attributeProcessors`: Map - attribute value processors
// - `options`: Object - runtime options
// - `initialData`: Object - initial attribute-derived data
// - `instance`: UIInstance? - current mounted UI instance
// - `nodes`: Array<Node> - rendered DOM nodes
// - `isInitialized`: boolean - true after the initial render
// - `attributeData`: Object - last parsed attribute snapshot
// - `data`: Object - current render data
class UIWebComponent extends BaseHTMLElement {
	constructor(
		componentFactory,
		initial = {},
		attributeBindings = new Map(),
		attributeProcessors = new Map(),
		options = {},
	) {
		super();
		const useShadow = options.shadow !== false;
		const shadowMode = options.shadowMode || "open";
		this.root =
			useShadow && typeof this.attachShadow === "function"
				? this.shadowRoot || this.attachShadow({ mode: shadowMode })
				: this;
		if (this.root !== this) {
			cloneDocumentStyles(this.root, options);
		}
		this.componentFactory = componentFactory;
		this.attributeBindings = attributeBindings;
		this.attributeProcessors = attributeProcessors;
		this.options = options;
		this.initialData = {
			...(initial && typeof initial === "object" ? initial : {}),
		};
		this.instance = undefined;
		this.nodes = [];
		this.isInitialized = false;
		this.attributeData = {};
		this.data = { ...this.initialData };
	}

	readAttributes() {
		const data = {};
		for (const attribute of this.attributes) {
			const name = attribute.name.toLowerCase();
			const key = this.attributeBindings.get(name) || toCamelCase(name);
			const value = this._readAttributeValue(key, attribute.value, name);
			if (value !== Nothing) {
				data[key] = value;
			}
		}
		return data;
	}

	_readAttributeValue(key, value, name = "") {
		if (value === null) {
			return null;
		}
		const processor =
			this.attributeProcessors.get(key) || this.attributeProcessors.get(name);
		if (typeof processor === "function") {
			try {
				return processor(value, name, this);
			} catch (error) {
				log.error("UIWebComponent: attribute processor failed, details", {
					component: this,
					attribute: name,
					key,
					value,
					error,
				});
				return Nothing;
			}
		}
		return parseAttributeValue(value);
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

	_rebuildData() {
		this.data = Object.assign({}, this.initialData, this.attributeData);
	}

	_renderUIComponent() {
		if (!this.instance) {
			this.instance = this.componentFactory.new(undefined, {
				nativeSlots: this.root !== this,
			});
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
		const nodes = asDOMNodes(output);
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
			log.error("UIWebComponent: invalid component factory, details", {
				componentFactory: this.componentFactory,
				host: this,
			});
		}
	}

	applyData(data) {
		if (!data || typeof data !== "object") {
			return;
		}
		this.attributeData = Object.assign({}, this.attributeData, data);
		this._rebuildData();
		if (this.isInitialized) {
			this.render();
		}
	}

	connectedCallback() {
		if (!this.isInitialized) {
			this.attributeData = this.readAttributes();
			this._rebuildData();
			this.isInitialized = true;
			this.render();
			return;
		}
		this.attributeData = this.readAttributes();
		this._rebuildData();
		this.render();
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
			this.attributeBindings.get(normalized) || toCamelCase(normalized);
		const value = this._readAttributeValue(key, current, normalized);
		if (value !== Nothing) {
			this.attributeData = Object.assign({}, this.attributeData, {
				[key]: value,
			});
			this._rebuildData();
			if (this.isInitialized) {
				this.render();
			}
		}
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

// Function: webcomponent
// Defines and returns a custom element class bound to `componentFactory`.
// Initializes attributes from `initial` and optional mapping in `options`.
// Plain values in `initial` become default data, while function values act as
// attribute processors for the matching attribute names.
function webcomponent(
	name,
	componentFactory,
	initial = undefined,
	options = undefined,
) {
	const registry = globalThis.customElements;
	if (!registry) {
		return null;
	}
	const existing = registry.get(name);
	if (existing) {
		return existing;
	}
	const initialConfig =
		initial && typeof initial === "object" ? { ...initial } : {};
	const { defaults: initialData, processors: attributeProcessors } =
		splitAttributeInitial(initialConfig);
	const attributeBindings = createAttributeBindings(initialConfig, options);
	const observedAttributes = collectObservedAttributes(
		initialConfig,
		attributeBindings,
		options,
	);
	const WebComponent = class extends UIWebComponent {
		static observedAttributes = observedAttributes;
		constructor() {
			super(
				componentFactory,
				initialData,
				attributeBindings,
				attributeProcessors,
				options || {},
			);
		}
	};
	registry.define(name, WebComponent);
	return WebComponent;
}

export { Adopted, Disconnect, UIWebComponent, webcomponent };

// EOF
