// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-15
// Updated: 2026-06-18

// Module: select/ui/webcomponents
// Web component bridge for UI templates and pure render functions.
// Wrapped Select UI custom elements can bind back to a mounted parent
// `UIInstance` through the special `ui-parent` host attribute. When a Select
// template renders a kebab-case custom element, Select injects `ui-parent`
// automatically unless it is already set explicitly.

// ----------------------------------------------------------------------------
//
// WEB COMPONENT BRIDGE
//
// ----------------------------------------------------------------------------

import { toCamelCase, toKebabCase } from "../formats.js";
import { asText, def, isObject, Nothing } from "../utils.js";
import { getUIInstance } from "./components/instance.js";
import { log } from "./templates.js";

// Constant: Disconnect
// Lifecycle sentinel fired when a component disconnects from the DOM.
const Disconnect = Symbol.for("Disconnect");
// Constant: Adopted
// Lifecycle sentinel fired when a component is adopted into a new document.
const Adopted = Symbol.for("Adopted");
const UI_PARENT_ATTRIBUTE = "ui-parent";
const BaseHTMLElement = globalThis.HTMLElement || class {};
const documentStyleSheetCache = new WeakMap();
const documentStyleSubscribers = new WeakMap();
const documentStyleObservers = new WeakMap();
const documentStyleSyncTasks = new WeakMap();
const documentStyleHeadHooks = new WeakMap();
const OPTIONS = {
	shadow: true, // Shadow DOM by default
	mode: "open", // Open Shadow DOM by default
};

function isStyleSheetNode(node) {
	if (!node || node.nodeType !== Node.ELEMENT_NODE) {
		return false;
	}
	const tagName = node.tagName?.toLowerCase();
	return (
		tagName === "style" ||
		(tagName === "link" && node.relList?.contains("stylesheet"))
	);
}

function isStyleSheetMutation(mutation) {
	if (isStyleSheetNode(mutation.target)) {
		return true;
	}
	if (
		mutation.type === "characterData" &&
		isStyleSheetNode(mutation.target?.parentNode)
	) {
		return true;
	}
	for (const node of mutation.addedNodes || []) {
		if (isStyleSheetNode(node)) {
			return true;
		}
	}
	for (const node of mutation.removedNodes || []) {
		if (isStyleSheetNode(node)) {
			return true;
		}
	}
	return false;
}

function hashText(value) {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 31 + value.charCodeAt(i)) | 0;
	}
	return hash;
}

function scheduleDocumentStyleSync(doc) {
	if (!doc || documentStyleSyncTasks.has(doc)) {
		return;
	}
	const task = setTimeout(() => {
		documentStyleSyncTasks.delete(doc);
		documentStyleSheetCache.delete(doc);
		const styles = getDocumentStyles(doc);
		for (const subscriber of documentStyleSubscribers.get(doc) || []) {
			subscriber._syncDocumentStyles?.(styles);
		}
	}, 0);
	documentStyleSyncTasks.set(doc, task);
}

function hookDocumentHead(doc) {
	const head = doc?.head;
	if (!head || documentStyleHeadHooks.has(doc)) {
		return;
	}
	const originalAppendChild = head.appendChild;
	const originalInsertBefore = head.insertBefore;
	const originalReplaceChild = head.replaceChild;
	const originalRemoveChild = head.removeChild;
	const scheduleIfNeeded = (node) => {
		if (isStyleSheetNode(node)) {
			scheduleDocumentStyleSync(doc);
		}
	};
	head.appendChild = function appendChild(node) {
		const result = originalAppendChild.call(this, node);
		scheduleIfNeeded(node);
		return result;
	};
	head.insertBefore = function insertBefore(node, referenceNode) {
		const result = originalInsertBefore.call(this, node, referenceNode);
		scheduleIfNeeded(node);
		return result;
	};
	head.replaceChild = function replaceChild(node, referenceNode) {
		const result = originalReplaceChild.call(this, node, referenceNode);
		scheduleIfNeeded(node);
		scheduleIfNeeded(referenceNode);
		return result;
	};
	head.removeChild = function removeChild(node) {
		const result = originalRemoveChild.call(this, node);
		scheduleIfNeeded(node);
		return result;
	};
	documentStyleHeadHooks.set(doc, {
		head,
		appendChild: originalAppendChild,
		insertBefore: originalInsertBefore,
		replaceChild: originalReplaceChild,
		removeChild: originalRemoveChild,
	});
}

function unhookDocumentHead(doc) {
	const hooks = documentStyleHeadHooks.get(doc);
	if (!hooks) {
		return;
	}
	hooks.head.appendChild = hooks.appendChild;
	hooks.head.insertBefore = hooks.insertBefore;
	hooks.head.replaceChild = hooks.replaceChild;
	hooks.head.removeChild = hooks.removeChild;
	documentStyleHeadHooks.delete(doc);
}

function getDocumentStylesSignature(doc) {
	if (!doc?.head?.querySelectorAll) {
		return "";
	}
	const nodes = doc.head.querySelectorAll("style,link[rel~='stylesheet']");
	const signature = [];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node.tagName?.toLowerCase() === "style") {
			const text = node.textContent || "";
			signature.push(
				`style:${node.id || ""}:${node.media || ""}:${text.length}:${hashText(text)}`,
			);
		} else {
			signature.push(
				`link:${node.getAttribute("href") || ""}:${node.getAttribute("media") || ""}:${node.hasAttribute("disabled")}`,
			);
		}
	}
	return signature.join("|");
}

function watchDocumentStyles(doc, component) {
	if (!doc?.head || typeof MutationObserver !== "function") {
		return;
	}
	hookDocumentHead(doc);
	let subscribers = documentStyleSubscribers.get(doc);
	if (!subscribers) {
		subscribers = new Set();
		documentStyleSubscribers.set(doc, subscribers);
	}
	subscribers.add(component);
	if (documentStyleObservers.has(doc)) {
		return;
	}
	const observer = new MutationObserver((mutations) => {
		if (!mutations.some(isStyleSheetMutation)) {
			return;
		}
		scheduleDocumentStyleSync(doc);
	});
	observer.observe(doc.head, {
		childList: true,
		subtree: true,
		attributes: true,
		characterData: true,
	});
	documentStyleObservers.set(doc, observer);
}

function unwatchDocumentStyles(doc, component) {
	const subscribers = documentStyleSubscribers.get(doc);
	if (!subscribers) {
		return;
	}
	subscribers.delete(component);
	if (subscribers.size > 0) {
		return;
	}
	documentStyleSubscribers.delete(doc);
	const task = documentStyleSyncTasks.get(doc);
	if (task !== undefined) {
		clearTimeout(task);
		documentStyleSyncTasks.delete(doc);
	}
	const observer = documentStyleObservers.get(doc);
	observer?.disconnect();
	documentStyleObservers.delete(doc);
	unhookDocumentHead(doc);
}

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
	attributes.add(UI_PARENT_ATTRIBUTE);

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
	const signature = getDocumentStylesSignature(doc);
	if (cached && cached.signature === signature) {
		return cached;
	}
	const value = {
		...buildDocumentStyleSheets(doc),
		signature,
	};
	documentStyleSheetCache.set(doc, value);
	return value;
}

function cloneDocumentStyles(root, options) {
	if (options?.documentStyles === false) {
		return { sheets: [], fallbackNodes: [], signature: "" };
	}
	if (!root || root === document || !document?.head?.querySelectorAll) {
		return { sheets: [], fallbackNodes: [], signature: "" };
	}
	return getDocumentStyles(document);
}

// Class: UIWebComponent
// Base custom element that binds a component factory to DOM attributes and
// renders its template into `root`. For Select UI-backed custom elements,
// `ui-parent` reconnects `pub()` bubbling to a mounted parent `UIInstance`.
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
		const useShadow = def(options.shadow, OPTIONS.shadow) !== false;
		const shadowMode = def(options.mode, OPTIONS.mode) || "open";
		this.root =
			useShadow && typeof this.attachShadow === "function"
				? this.shadowRoot || this.attachShadow({ mode: shadowMode })
				: this;
		if (this.root !== this) {
			this._documentStyleHeadChildCount = -1;
			this._documentStyleSheets = [];
			this._documentStyleFallbackNodes = [];
			this._syncDocumentStyles();
			watchDocumentStyles(document, this);
		}
		this.componentFactory = componentFactory;
		this.attributeBindings = attributeBindings;
		this.attributeProcessors = attributeProcessors;
		this.options = options;
		this.exposedKeys = new Set([
			...(initial && typeof initial === "object" ? Object.keys(initial) : []),
			...attributeBindings.values(),
		]);
		this.initialData = {
			...(initial && typeof initial === "object" ? initial : {}),
		};
		this.instance = undefined;
		this.nodes = [];
		this.isInitialized = false;
		this.attributeData = {};
		this._ownedAttributeReactiveRefs = new Map();
		this._internalReactiveSubs = new Map();
		this.data = { ...this.initialData };
	}

	_replaceOwnedAttributeReactiveRef(key, value) {
		const previous = this._ownedAttributeReactiveRefs.get(key);
		if (previous?.isReactive && typeof previous.release === "function") {
			previous.release();
		}
		if (value?.isReactive && typeof value.release === "function") {
			this._ownedAttributeReactiveRefs.set(key, value);
		} else {
			this._ownedAttributeReactiveRefs.delete(key);
		}
	}

	_syncOwnedAttributeReactiveRefs(data) {
		for (const key of this._ownedAttributeReactiveRefs.keys()) {
			if (!(key in data)) {
				this._replaceOwnedAttributeReactiveRef(key, undefined);
			}
		}
		for (const key in data) {
			this._replaceOwnedAttributeReactiveRef(key, data[key]);
		}
	}

	_clearOwnedAttributeReactiveRefs() {
		for (const key of this._ownedAttributeReactiveRefs.keys()) {
			this._replaceOwnedAttributeReactiveRef(key, undefined);
		}
	}

	_syncDocumentStyles(styles) {
		const root = this.root;
		styles = styles || cloneDocumentStyles(root, this.options);
		if (
			!styles ||
			this._documentStyleHeadChildCount === styles.signature ||
			root === this
		) {
			return;
		}
		for (const node of this._documentStyleFallbackNodes || []) {
			node.parentNode?.removeChild(node);
		}
		this._documentStyleFallbackNodes = [];
		if ("adoptedStyleSheets" in root) {
			const previous = this._documentStyleSheets || [];
			const existing = root.adoptedStyleSheets || [];
			root.adoptedStyleSheets = [
				...existing.filter((sheet) => !previous.includes(sheet)),
				...styles.sheets,
			];
		}
		if (!("adoptedStyleSheets" in root) || styles.fallbackNodes.length) {
			for (let i = 0; i < styles.fallbackNodes.length; i++) {
				const clone = styles.fallbackNodes[i].cloneNode(true);
				root.appendChild(clone);
				this._documentStyleFallbackNodes.push(clone);
			}
		}
		this._documentStyleSheets = styles.sheets;
		this._documentStyleHeadChildCount = styles.signature;
	}

	_clearInternalReactiveSubs() {
		for (const [cell, handler] of this._internalReactiveSubs.entries()) {
			cell.unsub(handler);
		}
		this._internalReactiveSubs.clear();
	}

	_syncInternalReactiveSubs() {
		this._clearInternalReactiveSubs();
		const data = this.instance?.data;
		if (!data || typeof data !== "object") {
			return;
		}
		for (const key of this.exposedKeys) {
			const value = data[key];
			if (!value?.isReactive || typeof value.sub !== "function") {
				continue;
			}
			let previous = value.get ? value.get() : value.value;
			const handler = (current) => {
				if (previous === current) {
					return;
				}
				const prior = previous;
				previous = current;
				this.trigger(key, prior, current);
			};
			value.sub(handler);
			this._internalReactiveSubs.set(value, handler);
		}
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

	_resolveParentInstance() {
		const parentId = this.getAttribute(UI_PARENT_ATTRIBUTE)?.trim();
		if (!parentId) {
			return undefined;
		}
		const parent = getUIInstance(parentId);
		if (!parent) {
			log.warn(
				"UIWebComponent: ui-parent did not resolve to a mounted instance",
				{
					attribute: UI_PARENT_ATTRIBUTE,
					parentId,
					host: this,
				},
			);
		}
		return parent;
	}

	_rebindParentInstance() {
		if (this.instance?.setParent) {
			this.instance.setParent(this._resolveParentInstance());
		}
	}

	_renderUIComponent() {
		if (!this.instance) {
			this.instance = this.componentFactory.new(this._resolveParentInstance(), {
				nativeSlots: this.root !== this,
			});
			this.instance.set(this.data).mount(this.root);
			this._syncInternalReactiveSubs();
		} else {
			this._rebindParentInstance();
			this.instance.update(this.data);
			this._syncInternalReactiveSubs();
		}
	}

	_renderPureComponent() {
		this._clearInternalReactiveSubs();
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
		watchDocumentStyles(document, this)
		this._syncDocumentStyles();
		if (!this.isInitialized) {
			this.attributeData = this.readAttributes();
			this._syncOwnedAttributeReactiveRefs(this.attributeData);
			this._rebuildData();
			this.isInitialized = true;
			this.render();
			return;
		}
		this.attributeData = this.readAttributes();
		this._syncOwnedAttributeReactiveRefs(this.attributeData);
		this._rebuildData();
		this.render();
	}

	disconnectedCallback() {
		this.trigger(Disconnect);
		this._clearInternalReactiveSubs();
		if (this.instance) {
			this.instance.unmount();
			this.instance = undefined;
		}
		this._clearOwnedAttributeReactiveRefs();
		this._clearPureNodes();
		unwatchDocumentStyles(document, this);
		for (const node of this._documentStyleFallbackNodes || []) {
			node.parentNode?.removeChild(node);
		}
		this._documentStyleFallbackNodes = [];
		this._documentStyleSheets = [];
		this._documentStyleHeadChildCount = -1;
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
		if (normalized === UI_PARENT_ATTRIBUTE) {
			this._rebindParentInstance();
			this.trigger(name, previous, current);
			return;
		}
		const key =
			this.attributeBindings.get(normalized) || toCamelCase(normalized);
		const value = this._readAttributeValue(key, current, normalized);
		if (value !== Nothing) {
			this._replaceOwnedAttributeReactiveRef(key, value);
			this.attributeData = Object.assign({}, this.attributeData, {
				[key]: value,
			});
			this._rebuildData();
			if (this.isInitialized) {
				this.render();
			}
		} else {
			this._replaceOwnedAttributeReactiveRef(key, undefined);
			if (key in this.attributeData) {
				const next = { ...this.attributeData };
				delete next[key];
				this.attributeData = next;
				this._rebuildData();
				if (this.isInitialized) {
					this.render();
				}
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
// attribute processors for the matching attribute names. The special
// `ui-parent` host attribute can be used to rebind a wrapped Select UI custom
// element to a mounted parent `UIInstance` so `pub()` events bubble through the
// Select component tree again.
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
webcomponent.options = OPTIONS;

export { Adopted, Disconnect, UIWebComponent, webcomponent };
export default webcomponent;

// EOF
