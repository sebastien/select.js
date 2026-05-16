// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-15

// Module: select/ui/templates
// HTML template parsing, data path parsing, and DOM binding helpers.

// ----------------------------------------------------------------------------
//
// TEMPLATE REGISTRY AND PARSER
//
// ----------------------------------------------------------------------------

import { logger, type } from "../utils.js"

const HTML = new DOMParser()

class TemplateRegistry {
	static _Registries = new WeakMap()

	static Key(value) {
		if (typeof value !== "string") {
			return null
		}
		const normalized = value.trim()
		const key = normalized.startsWith("#") ? normalized.slice(1) : normalized
		return key.length ? key : null
	}

	static _RegisterKey(registry, key, template, scope) {
		if (!key) {
			return
		}
		const existing = registry.get(key)
		if (existing && existing !== template) {
			log.warn("ui: duplicate template key, keeping first registration, details", {
				key,
				scope,
				existing,
				ignored: template,
			})
			return
		}
		registry.set(key, template)
	}

	static RegisterNode(template, registry, scope) {
		if (!template || template.nodeName !== "TEMPLATE") {
			return
		}
		TemplateRegistry._RegisterKey(registry, template.id, template, scope)
		TemplateRegistry._RegisterKey(registry, template.getAttribute("name"), template, scope)
		if (!template.content?.querySelectorAll) {
			return
		}
		for (const nested of template.content.querySelectorAll("template")) {
			TemplateRegistry.RegisterNode(nested, registry, scope)
		}
	}

	static For(scope = document) {
		let registry = TemplateRegistry._Registries.get(scope)
		if (registry) {
			return registry
		}
		registry = new Map()
		TemplateRegistry._Registries.set(scope, registry)
		const isTemplate = scope?.nodeName === "TEMPLATE"
		if (isTemplate) {
			TemplateRegistry.RegisterNode(scope, registry, scope)
		} else if (scope?.querySelectorAll) {
			for (const template of scope.querySelectorAll("template")) {
				TemplateRegistry.RegisterNode(template, registry, scope)
			}
		}
		return registry
	}

	static RegisterNodes(nodes, registry, scope) {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i]
			if (node?.nodeName === "TEMPLATE") {
				TemplateRegistry.RegisterNode(node, registry, scope)
			}
			if (node?.querySelectorAll) {
				for (const template of node.querySelectorAll("template")) {
					TemplateRegistry.RegisterNode(template, registry, scope)
				}
			}
		}
	}

	static FormatterName(template) {
		if (template?.nodeName !== "TEMPLATE") {
			return null
		}
		const name = template.getAttribute("name")
		if (typeof name === "string") {
			const normalizedName = name.trim()
			if (normalizedName.length) {
				return normalizedName
			}
		}
		const id = typeof template.id === "string" ? template.id.trim() : ""
		return id.length ? id : null
	}
}

const log = logger("select.ui")

class TemplateParser {
	static TRUTHY = 1
	static FALSY = 2
	static DEFINED = 3
	static UNDEFINED = 4

	static _WhenComparators = ["!==", "==", "!=", ">=", "<=", "~?", "=", ">", "<"]
	static _ReBindingPath = /^[A-Za-z_$][A-Za-z0-9_$-]*$/

	static ParsePipedBinding(expr, validateSource = false) {
		const source = typeof expr === "string" ? expr.trim() : ""
		if (!source) return null
		const parts = source.split("|")
		for (let i = 0; i < parts.length; i++) {
			parts[i] = parts[i].trim()
			if (!parts[i]) return null
		}
		const sourceKey = parts[0]
		if (!sourceKey) return null
		if (validateSource && !/^[A-Za-z0-9_$-]+$/.test(sourceKey)) return null
		const processors = parts.length > 1 ? parts.slice(1) : []
		for (let i = 0; i < processors.length; i++) {
			if (/\s/.test(processors[i])) return null
		}
		return { sourceKey, processors }
	}

	static ParseBindingPath(expr, allowDotted = true) {
		const source = typeof expr === "string" ? expr.trim() : ""
		if (!source) return null
		if (allowDotted && source === ".") return ["."]
		if (allowDotted && source.startsWith(".")) {
			const tail = source.slice(1)
			if (!tail) return ["."]
			const parts = tail.split(".")
			if (!parts.length) return null
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i].trim()
				if (!part || !TemplateParser._ReBindingPath.test(part)) return null
				parts[i] = part
			}
			return [".", ...parts]
		}
		const parts = allowDotted ? source.split(".") : [source]
		if (!parts.length) return null
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i].trim()
			if (!part || !TemplateParser._ReBindingPath.test(part)) return null
			parts[i] = part
		}
		return parts
	}

	static ParseTemplatePath(expr) {
		return TemplateParser.ParseBindingPath(expr, true)
	}

	static ParseTemplatePlaceholder(expr) {
		const source = typeof expr === "string" ? expr.trim() : ""
		if (!source) return null
		const parts = source.split("|")
		for (let i = 0; i < parts.length; i++) {
			parts[i] = parts[i].trim()
			if (!parts[i]) return null
		}
		const path = TemplateParser.ParseTemplatePath(parts[0])
		if (!path) return null
		const processors = parts.length > 1 ? parts.slice(1) : null
		if (processors) {
			for (let i = 0; i < processors.length; i++) {
				if (/\s/.test(processors[i])) return null
			}
		}
		return { path, processors }
	}

	static ParseEventEffect(expr, eventType = "") {
		const source = typeof expr === "string" ? expr.trim() : ""
		if (!source) return { mode: "handler", handlerName: eventType, stopPropagation: false, preventDefault: false }
		const separator = source.lastIndexOf("!")
		if (separator === -1) return { mode: "handler", handlerName: source, stopPropagation: false, preventDefault: false }
		let publishEvent = source.slice(separator + 1).trim()
		let stopPropagation = false
		let preventDefault = false
		if (publishEvent.endsWith(".-") || publishEvent.endsWith("-.")) {
			publishEvent = publishEvent.slice(0, -2).trim()
			stopPropagation = true
			preventDefault = true
		} else if (publishEvent.endsWith(".")) {
			publishEvent = publishEvent.slice(0, -1).trim()
			stopPropagation = true
		} else if (publishEvent.endsWith("-")) {
			publishEvent = publishEvent.slice(0, -1).trim()
			preventDefault = true
		}
		if (!publishEvent || /\s/.test(publishEvent)) return null
		const payloadExpr = source.slice(0, separator).trim()
		if (!payloadExpr) return { mode: "publish", publishEvent, binding: null, stopPropagation, preventDefault }
		const parts = payloadExpr.split("|")
		for (let i = 0; i < parts.length; i++) {
			parts[i] = parts[i].trim()
			if (!parts[i]) return null
		}
		const path = TemplateParser.ParseTemplatePath(parts[0])
		if (!path) return null
		const processors = parts.length > 1 ? parts.slice(1) : []
		for (let i = 0; i < processors.length; i++) if (/\s/.test(processors[i])) return null
		const sourceKey = path[0] === "." ? (path.length === 1 ? "." : `.${path.slice(1).join(".")}`) : path.join(".")
		return { mode: "publish", publishEvent, binding: { sourceKey, processors }, stopPropagation, preventDefault }
	}

	static ParseOutAttributeBinding(expr) {
		const source = typeof expr === "string" ? expr : ""
		if (!source) return { mode: "binding", binding: TemplateParser.ParsePipedBinding(source) }
		const tokens = []
		let last = 0
		let hasTemplate = false
		while (last < source.length) {
			const start = source.indexOf("${", last)
			if (start === -1) {
				if (last < source.length) tokens.push({ type: "text", value: source.slice(last) })
				break
			}
			hasTemplate = true
			if (start > last) tokens.push({ type: "text", value: source.slice(last, start) })
			const end = source.indexOf("}", start + 2)
			if (end === -1) {
				tokens.push({ type: "invalid" })
				last = source.length
				break
			}
			const placeholder = TemplateParser.ParseTemplatePlaceholder(source.slice(start + 2, end))
			if (!placeholder) {
				tokens.push({ type: "invalid" })
				last = end + 1
				continue
			}
			tokens.push({ type: "expr", value: placeholder })
			last = end + 1
		}
		if (hasTemplate) return { mode: "template", template: { tokens } }
		return { mode: "binding", binding: TemplateParser.ParsePipedBinding(source) }
	}

	static ParseWhenShorthand(expr) {
		const source = typeof expr === "string" ? expr.trim() : ""
		const parseWhenLiteral = (raw) => {
			const value = raw.trim()
			if (!value.length) return ""
			if (value === "true") return true
			if (value === "false") return false
			if (value === "null") return null
			if (value === "undefined") return undefined
			if (/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(value)) {
				const numeric = Number(value)
				if (!Number.isNaN(numeric)) return numeric
			}
			return value
		}
		const parseWhenComparison = (text) => {
			for (let i = 0; i < TemplateParser._WhenComparators.length; i++) {
				const operator = TemplateParser._WhenComparators[i]
				const at = text.indexOf(operator)
				if (at <= 0) continue
				const left = text.slice(0, at).trim()
				const right = text.slice(at + operator.length).trim()
				if (!left || !right) return null
				const binding = TemplateParser.ParsePipedBinding(left, false)
				if (!binding) return null
				const path = TemplateParser.ParseBindingPath(binding.sourceKey, true)
				if (!path) return null
				return { key: path.join("."), processors: binding.processors, mode: TemplateParser.TRUTHY, operator, rawValue: right, value: parseWhenLiteral(right) }
			}
			return null
		}
		const comparison = parseWhenComparison(source)
		if (comparison) return comparison
		let i = 0
		let negate = false
		let queryDefined = false
		if (source[i] === "!") {
			negate = true
			i++
		}
		if (source[i] === "?") {
			queryDefined = true
			i++
		}
		const bindingExpr = source.slice(i).trim()
		let key
		let processors = []
		if (bindingExpr) {
			const binding = TemplateParser.ParsePipedBinding(bindingExpr, false)
			if (!binding) return null
			const path = TemplateParser.ParseBindingPath(binding.sourceKey, true)
			if (!path) return null
			key = path.join(".")
			processors = binding.processors
		}
		if (!bindingExpr && source.length > 0 && i === 0) return null
		const mode = queryDefined ? (negate ? TemplateParser.UNDEFINED : TemplateParser.DEFINED) : (negate ? TemplateParser.FALSY : TemplateParser.TRUTHY)
		return { key, processors, mode, operator: null, rawValue: null, value: undefined }
	}

	static EvaluateWhen(mode, value) {
		switch (mode) {
			case TemplateParser.TRUTHY:
				return !!value
			case TemplateParser.FALSY:
				return !value
			case TemplateParser.DEFINED:
				return value !== undefined
			case TemplateParser.UNDEFINED:
				return value === undefined
			default:
				return false
		}
	}

	static EvaluateWhenComparison(left, operator, right) {
		switch (operator) {
			case "=":
				// biome-ignore lint/suspicious/noDoubleEquals: `=` keeps loose matching distinct from `==`
				return left == right
			case "!=":
				// biome-ignore lint/suspicious/noDoubleEquals: `!=` keeps loose matching distinct from `!==`
				return left != right
			case "==":
				return left === right
			case "!==":
				return left !== right
			case "~?": {
				if (left === undefined || left === null) return false
				if (right === undefined || right === null) return false
				const l = String(left).toLowerCase()
				const r = String(right).toLowerCase()
				return l.includes(r)
			}
			case ">":
				return left > right
			case ">=":
				return left >= right
			case "<":
				return left < right
			case "<=":
				return left <= right
			default:
				return false
		}
	}
}

// ----------------------------------------------------------------------------
//
// DOM HELPERS
//
// ----------------------------------------------------------------------------

function isPrunableWhitespaceText(node) {
	return node && node.nodeType === Node.TEXT_NODE && !/\S/.test(node.data) && /[\n\r\t]/.test(node.data)
}
function pruneTemplateWhitespace(node) {
	if (!node?.childNodes || node.childNodes.length === 0) return
	for (let i = node.childNodes.length - 1; i >= 0; i--) {
		const child = node.childNodes[i]
		if (isPrunableWhitespaceText(child)) {
			node.removeChild(child)
		} else {
			pruneTemplateWhitespace(child)
		}
	}
}

function isInputNode(node) {
	switch (node.nodeName) {
		case "INPUT":
		case "TEXTAREA":
		case "SELECT":
		case "DETAILS":
			return true
		default:
			return false
	}
}

// Function: setNodeText
// Applies `text` to a text node or form-like element value in place.
function setNodeText(node, text) {
	switch (node.nodeType) {
		case Node.TEXT_NODE:
			if (node.data !== text) node.data = text
			break
		case Node.ELEMENT_NODE:
			if (isInputNode(node)) {
				if (node.nodeName === "DETAILS") {
					const next = !!text
					if (node.open !== next) node.open = next
				} else if (node.value !== text) {
					node.value = text
				}
			} else if (node.textContent !== text) {
				node.textContent = text
			}
			break
	}
	return node
}

export {
	HTML,
	TemplateParser,
	TemplateRegistry,
	isInputNode,
	isPrunableWhitespaceText,
	log,
	pruneTemplateWhitespace,
	setNodeText,
	type,
}

// EOF
