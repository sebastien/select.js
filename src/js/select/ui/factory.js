// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-15

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
} from "./templates.js"
import { FORMATS, format } from "../formats.js"
import { COMPONENTS, component, uiOptions, UITemplate } from "./components.js"

function stripTemplateNodes(nodes) {
	const res = []
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]
		if (!node || node.nodeName === "TEMPLATE") {
			continue
		}
		const clone = node.cloneNode(true)
		if (clone.querySelectorAll) {
			for (const nested of clone.querySelectorAll("template")) {
				nested.remove()
			}
		}
		res.push(clone)
	}
	return res
}

// Function: createComponent
// Wraps a `UITemplate` into a callable component facade and attaches helper
// methods (`new`, `map`, `on`, `sub`, `cleanup`) used by the UI runtime.
function createComponent(tmpl, localTemplateNodes = tmpl.nodes) {
	const component = (...args) => tmpl.apply(...args)
	tmpl.component = component
	Object.assign(component, {
		isTemplate: true,
		template: tmpl,
		singleton: null,
		new: (...args) => tmpl.new(...args),
		init: (...args) => {
			tmpl.init(...args)
			return component
		},
		map: (...args) => tmpl.map(...args),
		apply: (...args) => tmpl.apply(...args),
		does: (...args) => {
			tmpl.does(...args)
			return component
		},
		on: (...args) => {
			tmpl.sub(...args)
			return component
		},
		sub: (...args) => {
			tmpl.sub(...args)
			return component
		},
		cleanup: (...args) => {
			tmpl.cleanup(...args)
			return component
		},
	})
	const localTemplates = new Map()
	const registerLocalTemplate = (templateNode) => {
		if (!templateNode || templateNode.nodeName !== "TEMPLATE") {
			return
		}
		const name = TemplateRegistry.FormatterName(templateNode)
		if (name && !localTemplates.has(name)) {
			const childNodes = [...templateNode.content.childNodes]
			const childTemplate = new UITemplate(stripTemplateNodes(childNodes), tmpl.scope, name)
			const childComponent = createComponent(childTemplate, childNodes)
			component[name] = childComponent
			localTemplates.set(name, childComponent)
		}
		if (!templateNode.content?.querySelectorAll) {
			return
		}
		for (const nested of templateNode.content.querySelectorAll("template")) {
			registerLocalTemplate(nested)
		}
	}
	for (let i = 0; i < localTemplateNodes.length; i++) {
		const node = localTemplateNodes[i]
		if (node?.nodeName === "TEMPLATE") {
			registerLocalTemplate(node)
		}
		if (node?.querySelectorAll) {
			for (const nested of node.querySelectorAll("template")) {
				registerLocalTemplate(nested)
			}
		}
	}
	if (localTemplates.size) {
		tmpl.localTemplates = localTemplates
	}
	return component
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
		)
	}

	if (typeof selection === "string") {
		let nodes = []
		let defaultData = null
		let sourceMode = "default"
		let sourceHosts = null
		let autoFormatName = null
		const templateRegistry = TemplateRegistry.For(scope)
		if (/^\s*</.test(selection)) {
			const doc = HTML.parseFromString(selection, "text/html")
			pruneTemplateWhitespace(doc.body)
			nodes = [...doc.body.childNodes]
			if (nodes.length === 1) {
				autoFormatName = TemplateRegistry.FormatterName(nodes[0])
			}
			TemplateRegistry.RegisterNodes(nodes, templateRegistry, scope)
		} else {
			const template = templateRegistry.get(TemplateRegistry.Key(selection))
			if (template) {
				nodes = [...template.content.childNodes]
				autoFormatName = TemplateRegistry.FormatterName(template)
			} else {
				let matchedTemplateCount = 0
				let matchedTemplateName = null
				const matchedNodes = []
				const parent = scope?.querySelectorAll ? scope : document
				let query = selection
				let queried = []
				try {
					queried = [...parent.querySelectorAll(query)]
				} catch (_error) {
					queried = []
				}
				if (
					queried.length === 0 &&
					!selection.includes("#") &&
					!selection.includes(".") &&
					!selection.includes("[") &&
					!selection.includes(":") &&
					!/\s/.test(selection)
				) {
					query = `#${selection}`
					try {
						queried = [...parent.querySelectorAll(query)]
					} catch (_error) {
						queried = []
					}
				}
				for (const node of queried) {
					if (node.nodeName === "TEMPLATE") {
						matchedTemplateCount += 1
						matchedTemplateName = TemplateRegistry.FormatterName(node)
						TemplateRegistry.RegisterNode(node, templateRegistry, scope)
						nodes = [...nodes, ...node.content.childNodes]
					} else {
						matchedNodes.push(node)
					}
				}
				if (matchedTemplateCount === 0 && matchedNodes.length > 0) {
					sourceMode = "fallback-node-template"
					sourceHosts = matchedNodes
					let hasDefaultData = false
					defaultData = {}
					for (const node of matchedNodes) {
						nodes.push(node.cloneNode(true))
						const payload = node.getAttribute?.("data")
						if (payload !== null && payload !== undefined && payload !== "") {
							let parsed
							try {
								parsed = JSON.parse(payload)
							} catch (_error) {
								throw new Error(`ui(): invalid JSON in [data] attribute for selector "${selection}"`)
							}
							if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
								throw new Error(`ui(): [data] attribute JSON for selector "${selection}" must be an object`)
							}
							Object.assign(defaultData, parsed)
							hasDefaultData = true
						}
					}
					if (!hasDefaultData) {
						defaultData = null
					}
				}
				if (matchedTemplateCount === 1) {
					autoFormatName = matchedTemplateName
				}
				TemplateRegistry.RegisterNodes(nodes, templateRegistry, scope)
			}
		}
		if (nodes.length === 0) {
			log.warn("ui: selector did not match any elements, details", { selector: selection, scope })
		}
		const templateNodes = stripTemplateNodes(nodes)
		const template = new UITemplate(templateNodes, scope, autoFormatName)
		if (sourceMode === "fallback-node-template") {
			template.sourceMode = sourceMode
			template.sourceSelector = selection
			template.sourceHosts = sourceHosts
			template.defaultData = defaultData
		}
		const component = createComponent(template, nodes)
		if (autoFormatName) {
			format(autoFormatName, component)
		}
		return component
	}

	if (selection instanceof Node || Array.isArray(selection)) {
		const nodes = selection instanceof Node ? [selection] : selection
		let autoFormatName = null
		if (nodes.length === 1) {
			autoFormatName = TemplateRegistry.FormatterName(nodes[0])
		}
		TemplateRegistry.RegisterNodes(nodes, TemplateRegistry.For(scope), scope)
		const component = createComponent(new UITemplate(stripTemplateNodes(nodes), scope, autoFormatName), nodes)
		if (autoFormatName) {
			format(autoFormatName, component)
		}
		return component
	}

	throw new Error(
		`ui() received an invalid selection type: ${typeof selection}. ` +
			`Expected a string (CSS selector or HTML), a DOM Node, or an array of DOM Nodes. ` +
			`Received: ${selection}`,
	)
}

// Function: register
// Registers `value` as `name` for Dynamic() resolution.
function register(name, value) {
	component(name, value)
	return ui
}

// Function: resolve
// Resolves a registered component by `name`.
function resolve(name) {
	return component(name)
}

Object.assign(ui, {
	formats: FORMATS,
	components: COMPONENTS,
	options: uiOptions,
	format,
	component,
	register,
	resolve,
})

export { createComponent, stripTemplateNodes, ui }
export default ui

// EOF
