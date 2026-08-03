// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-15
// Updated: 2026-08-03

// Module: select/ui/webcomponents
// Web component bridge for UI templates and pure render functions.
// Wrapped Select UI custom elements can bind back to a mounted parent
// `UIInstance` through the special `ui-parent` host attribute. When a Select
// template renders a kebab-case custom element, Select injects `ui-parent`
// automatically unless it is already set explicitly.
// Document head → shadow style mirroring lives in `./styles.js`.

// ----------------------------------------------------------------------------
//
// WEB COMPONENT BRIDGE
//
// ----------------------------------------------------------------------------

import { toCamelCase, toKebabCase } from "../features/formats.js";
import { asText, def, eq, isObject, Nothing } from "../utils/index.js";
import { getUIInstance } from "./components/instance.js";
import { UI_PARENT_ATTRIBUTE } from "./components/runtime.js";
import { log } from "./templates.js";
import {
	clearDocumentStyles,
	initDocumentStyleState,
	syncDocumentStyles,
	unwatchDocumentStyles,
	watchDocumentStyles,
} from "./styles.js";

// Constant: Disconnect
// Lifecycle sentinel passed to `trigger()` on disconnect. Symbols do not
// dispatch DOM events (see `trigger`); use for identity checks only.
const Disconnect = Symbol.for("Disconnect");
// Constant: Adopted
// Lifecycle sentinel passed to `trigger()` on adopt. Same as Disconnect:
// no `wc:…` CustomEvent is fired for symbol names.
const Adopted = Symbol.for("Adopted");
const BaseHTMLElement = globalThis.HTMLElement || class {};
const OPTIONS = Object.assign(
	{
		shadow: true,
		mode: "open",
	},
	globalThis?.UI_WEBCOMPONENT_OPTIONS || {},
);

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
		bindings.set(`${attribute}`.toLowerCase(), key);
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
			addBinding(attribute, toCamelCase(attribute));
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

function defineExposedPropertyAccessors(WebComponent, exposedKeys) {
	if (!Array.isArray(exposedKeys) || exposedKeys.length === 0) {
		return;
	}
	for (const key of exposedKeys) {
		if (
			typeof key !== "string" ||
			!key.length ||
			key in WebComponent.prototype
		) {
			continue;
		}
		Object.defineProperty(WebComponent.prototype, key, {
			configurable: true,
			enumerable: true,
			get() {
				return this.getExposedPropertyValue?.(key);
			},
			set(value) {
				this.setExposedPropertyValue?.(key, value);
			},
		});
	}
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
			initDocumentStyleState(this);
			this._documentStyleDocument = null;
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
		this.propertyData = {};
		this._ownedAttributeReactiveRefs = new Map();
		this._ownedPropertyReactiveRefs = new Map();
		this._internalReactiveSubs = new Map();
		this.data = { ...this.initialData };
	}

	// Releases previous owned cell at `key` in `store`; tracks `value` if reactive.
	_replaceOwnedReactiveRef(store, key, value) {
		const previous = store.get(key);
		if (previous?.isReactive && typeof previous.release === "function") {
			previous.release();
		}
		if (value?.isReactive && typeof value.release === "function") {
			store.set(key, value);
		} else {
			store.delete(key);
		}
	}

	// Syncs owned reactive refs in `store` to keys present in `data`.
	_syncOwnedReactiveRefs(store, data) {
		for (const key of store.keys()) {
			if (!(key in data)) {
				this._replaceOwnedReactiveRef(store, key, undefined);
			}
		}
		for (const key in data) {
			this._replaceOwnedReactiveRef(store, key, data[key]);
		}
	}

	_clearOwnedReactiveRefs(store) {
		for (const key of store.keys()) {
			this._replaceOwnedReactiveRef(store, key, undefined);
		}
	}

	_syncDocumentStyles(styles) {
		syncDocumentStyles(this, styles);
	}

	// Ensures document style watch + apply for shadow hosts (connect-time only).
	_ensureDocumentStyles() {
		if (this.root === this || this.options?.documentStyles === false) {
			return;
		}
		const doc = this.ownerDocument || globalThis.document;
		if (this._documentStyleDocument !== doc) {
			if (this._documentStyleDocument) {
				unwatchDocumentStyles(this._documentStyleDocument, this);
			}
			this._documentStyleDocument = doc;
		}
		watchDocumentStyles(doc, this);
		this._syncDocumentStyles();
	}

	_clearInternalReactiveSubs() {
		// Map key → { cell, handler }
		for (const meta of this._internalReactiveSubs.values()) {
			meta.cell.unsub(meta.handler);
		}
		this._internalReactiveSubs.clear();
	}

	// Incremental: keep handlers for exposed keys whose cell identity is unchanged.
	_syncInternalReactiveSubs() {
		const data = this.instance?.data;
		const next = new Map();
		if (data && typeof data === "object") {
			for (const key of this.exposedKeys) {
				const value = data[key];
				if (!value?.isReactive || typeof value.sub !== "function") {
					continue;
				}
				const existing = this._internalReactiveSubs.get(key);
				if (existing?.cell === value) {
					next.set(key, existing);
					continue;
				}
				if (existing) {
					existing.cell.unsub(existing.handler);
				}
				let previous = value.get ? value.get() : value.value;
				const handler = (current) => {
					if (eq(previous, current)) {
						return;
					}
					const prior = previous;
					previous = current;
					this.trigger(key, prior, current);
				};
				value.sub(handler);
				next.set(key, { cell: value, handler });
			}
		}
		for (const [key, meta] of this._internalReactiveSubs.entries()) {
			if (!next.has(key)) {
				meta.cell.unsub(meta.handler);
			}
		}
		this._internalReactiveSubs = next;
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
		this.data = Object.assign(
			{},
			this.initialData,
			this.attributeData,
			this.propertyData,
		);
	}

	getExposedPropertyValue(key) {
		if (key in this.propertyData) {
			return this.propertyData[key];
		}
		const value = this.instance?.data?.[key];
		return value !== undefined ? value : this.data?.[key];
	}

	setExposedPropertyValue(key, value) {
		const hasProperty = key in this.propertyData;
		const previous = hasProperty ? this.propertyData[key] : undefined;
		if (hasProperty && eq(previous, value)) {
			return;
		}
		if (value === undefined) {
			if (!hasProperty) {
				return;
			}
			this._replaceOwnedReactiveRef(
				this._ownedPropertyReactiveRefs,
				key,
				undefined,
			);
			const next = { ...this.propertyData };
			delete next[key];
			this.propertyData = next;
		} else {
			this._replaceOwnedReactiveRef(
				this._ownedPropertyReactiveRefs,
				key,
				value,
			);
			this.propertyData = Object.assign({}, this.propertyData, {
				[key]: value,
			});
		}
		this._rebuildData();
		if (this.isInitialized) {
			this.render();
		}
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
				data: this.data,
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
		this._ensureDocumentStyles();
		this.attributeData = this.readAttributes();
		this._syncOwnedReactiveRefs(
			this._ownedAttributeReactiveRefs,
			this.attributeData,
		);
		this._rebuildData();
		this.isInitialized = true;
		this.render();
	}

	disconnectedCallback() {
		this.trigger(Disconnect);
		this._clearInternalReactiveSubs();
		if (this.instance) {
			this.instance.unmount();
			this.instance = undefined;
		}
		this._clearOwnedReactiveRefs(this._ownedAttributeReactiveRefs);
		this._clearOwnedReactiveRefs(this._ownedPropertyReactiveRefs);
		this._clearPureNodes();
		unwatchDocumentStyles(this._documentStyleDocument, this);
		this._documentStyleDocument = null;
		clearDocumentStyles(this);
		this.isInitialized = false;
	}

	adoptedCallback() {
		if (this.isConnected) {
			this._ensureDocumentStyles();
		}
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
			this._replaceOwnedReactiveRef(
				this._ownedAttributeReactiveRefs,
				key,
				value,
			);
			this.attributeData = Object.assign({}, this.attributeData, {
				[key]: value,
			});
			this._rebuildData();
			if (this.isInitialized) {
				this.render();
			}
		} else {
			this._replaceOwnedReactiveRef(
				this._ownedAttributeReactiveRefs,
				key,
				undefined,
			);
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

	// Dispatches `wc:${name}` with detail `{ name, previous, current }`.
	// Symbol names (Disconnect / Adopted) are no-ops — no DOM event is fired.
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
	const exposedKeys = [
		...new Set([...Object.keys(initialData), ...attributeBindings.values()]),
	];
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
	defineExposedPropertyAccessors(WebComponent, exposedKeys);
	registry.define(name, WebComponent);
	return WebComponent;
}
webcomponent.options = OPTIONS;

export { Adopted, Disconnect, UIWebComponent, webcomponent };
export default webcomponent;

// EOF
