// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-15

// Module: select/ui/webcomponents
// Web component bridge for UI templates and pure render functions.

import { asText, isObject } from "../utils.js"
import { log } from "./templates.js"

const Disconnect = Symbol.for("Disconnect")
const Adopted = Symbol.for("Adopted")
const BaseHTMLElement = globalThis.HTMLElement || class {}

const toKebabCase = (value) =>
	value
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase()

const toCamelCase = (value) =>
	value
		.toLowerCase()
		.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase())

const parseAttributeValue = (value) => {
	if (value === null) {
		return null
	}
	if (value === "true") {
		return true
	}
	if (value === "false") {
		return false
	}
	if (value !== "" && !Number.isNaN(Number(value))) {
		return Number(value)
	}
	return value
}

const createAttributeBindings = (initial, options) => {
	const bindings = new Map()
	const addBinding = (attribute, key) => {
		if (!attribute || !key) {
			return
		}
		const attr = `${attribute}`.toLowerCase()
		bindings.set(attr, key)
	}

	if (initial && typeof initial === "object") {
		for (const key in initial) {
			addBinding(key, key)
			addBinding(toKebabCase(key), key)
		}
	}

	if (isObject(options?.attributes)) {
		for (const attribute in options.attributes) {
			addBinding(attribute, options.attributes[attribute])
		}
	}

	if (Array.isArray(options?.observedAttributes)) {
		for (const attribute of options.observedAttributes) {
			if (typeof attribute !== "string") {
				continue
			}
			const key = toCamelCase(attribute)
			addBinding(attribute, key)
		}
	}

	return bindings
}

const collectObservedAttributes = (initial, bindings, options) => {
	const attributes = new Set()

	if (initial && typeof initial === "object") {
		for (const key in initial) {
			attributes.add(`${key}`.toLowerCase())
			attributes.add(toKebabCase(key))
		}
	}

	for (const key of bindings.keys()) {
		attributes.add(key)
	}

	if (Array.isArray(options?.observedAttributes)) {
		for (const attribute of options.observedAttributes) {
			if (typeof attribute === "string") {
				attributes.add(attribute.toLowerCase())
			}
		}
	}

	return [...attributes]
}

const asDOMNodes = (value, nodes = []) => {
	if (value === undefined || value === null || value === false) {
		return nodes
	}
	if (value instanceof Node) {
		nodes.push(value)
		return nodes
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
			asDOMNodes(value[i], nodes)
		}
		return nodes
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			asDOMNodes(value[i], nodes)
		}
		return nodes
	}
	nodes.push(document.createTextNode(asText(value)))
	return nodes
}

class UIWebComponent extends BaseHTMLElement {
	constructor(componentFactory, initial = {}, attributeBindings = new Map(), options = {}) {
		super()
		const useShadow = options.shadow !== false
		const shadowMode = options.shadowMode || "open"
		this.root =
			useShadow && typeof this.attachShadow === "function"
				? this.shadowRoot || this.attachShadow({ mode: shadowMode })
				: this
		this.componentFactory = componentFactory
		this.attributeBindings = attributeBindings
		this.options = options
		this.instance = undefined
		this.nodes = []
		this.isInitialized = false
		this.data = {
			...(initial && typeof initial === "object" ? initial : {}),
		}
	}

	readAttributes() {
		const data = {}
		for (const attribute of this.attributes) {
			const name = attribute.name.toLowerCase()
			const key = this.attributeBindings.get(name) || toCamelCase(name)
			data[key] = parseAttributeValue(attribute.value)
		}
		return data
	}

	_clearPureNodes() {
		if (!this.nodes || this.nodes.length === 0) {
			return
		}
		for (let i = 0; i < this.nodes.length; i++) {
			this.nodes[i].parentNode?.removeChild(this.nodes[i])
		}
		this.nodes = []
	}

	_renderUIComponent() {
		if (!this.instance) {
			this.instance = this.componentFactory.new()
			this.instance.set(this.data).mount(this.root)
		} else {
			this.instance.update(this.data)
		}
	}

	_renderPureComponent() {
		if (this.instance) {
			this.instance.unmount()
			this.instance = undefined
		}
		this._clearPureNodes()
		const output = this.componentFactory(this.data, this)
		const nodes = asDOMNodes(output)
		for (let i = 0; i < nodes.length; i++) {
			this.root.appendChild(nodes[i])
		}
		this.nodes = nodes
	}

	render() {
		if (this.componentFactory?.isTemplate && this.componentFactory?.new) {
			this._renderUIComponent()
		} else if (typeof this.componentFactory === "function") {
			this._renderPureComponent()
		} else {
			log.error("UIWebComponent: invalid component factory, details", {
				componentFactory: this.componentFactory,
				host: this,
			})
		}
	}

	applyData(data) {
		if (!data || typeof data !== "object") {
			return
		}
		this.data = Object.assign({}, this.data, data)
		if (this.isInitialized) {
			this.render()
		}
	}

	connectedCallback() {
		if (!this.isInitialized) {
			this.applyData(this.readAttributes())
			this.isInitialized = true
			this.render()
			return
		}
		this.applyData(this.readAttributes())
	}

	disconnectedCallback() {
		this.trigger(Disconnect)
		if (this.instance) {
			this.instance.unmount()
			this.instance = undefined
		}
		this._clearPureNodes()
		this.isInitialized = false
	}

	adoptedCallback() {
		this.trigger(Adopted)
	}

	attributeChangedCallback(name, previous, current) {
		if (previous === current) {
			return
		}
		const normalized = `${name}`.toLowerCase()
		const key = this.attributeBindings.get(normalized) || toCamelCase(normalized)
		this.applyData({ [key]: parseAttributeValue(current) })
		this.trigger(name, previous, current)
	}

	trigger(name, previous, current) {
		if (typeof name === "symbol") {
			return
		}
		this.dispatchEvent(
			new CustomEvent(`wc:${name}`, {
				detail: {
					name,
					previous,
					current,
				},
			}),
		)
	}
}

const webcomponent = (name, componentFactory, initial = undefined, options = undefined) => {
	const registry = globalThis.customElements
	if (!registry) {
		return null
	}
	const existing = registry.get(name)
	if (existing) {
		return existing
	}
	const initialData = initial && typeof initial === "object" ? { ...initial } : {}
	const attributeBindings = createAttributeBindings(initialData, options)
	const observedAttributes = collectObservedAttributes(
		initialData,
		attributeBindings,
		options,
	)
	const WebComponent = class extends UIWebComponent {
		static observedAttributes = observedAttributes
		constructor() {
			super(componentFactory, initialData, attributeBindings, options || {})
		}
	}
	registry.define(name, WebComponent)
	return WebComponent
}

export { Adopted, Disconnect, UIWebComponent, webcomponent }

// EOF
