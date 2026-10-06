// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-15
// Updated: 2026-06-18

// Module: select/ui/templates
// HTML template registry and DOM binding helpers.

// ----------------------------------------------------------------------------
//
// TEMPLATE REGISTRY
//
// ----------------------------------------------------------------------------

import { isInputNode } from "../utils/dom.js";
import { logger, type } from "../utils/index.js";

// Lazy HTML parser: resolved per call so this module can be imported before a
// DOM (and DOMParser) is installed, which server-side rendering relies on.
const HTML = {
	parseFromString(source, type) {
		return new globalThis.DOMParser().parseFromString(source, type);
	},
};

class TemplateRegistry {
	static _Registries = new WeakMap();

	static Key(value) {
		if (typeof value !== "string") {
			return null;
		}
		const normalized = value.trim();
		const key = normalized.startsWith("#") ? normalized.slice(1) : normalized;
		return key.length ? key : null;
	}

	static _RegisterKey(registry, key, template, scope) {
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

	static RegisterNode(template, registry, scope) {
		if (template?.nodeName !== "TEMPLATE") {
			return;
		}
		TemplateRegistry._RegisterKey(registry, template.id, template, scope);
		TemplateRegistry._RegisterKey(
			registry,
			template.getAttribute("name"),
			template,
			scope,
		);
		if (!template.content?.querySelectorAll) {
			return;
		}
		for (const nested of template.content.querySelectorAll("template")) {
			TemplateRegistry.RegisterNode(nested, registry, scope);
		}
	}

	static For(scope = document) {
		let registry = TemplateRegistry._Registries.get(scope);
		if (registry) {
			return registry;
		}
		registry = new Map();
		TemplateRegistry._Registries.set(scope, registry);
		const isTemplate = scope?.nodeName === "TEMPLATE";
		if (isTemplate) {
			TemplateRegistry.RegisterNode(scope, registry, scope);
		} else if (scope?.querySelectorAll) {
			for (const template of scope.querySelectorAll("template")) {
				TemplateRegistry.RegisterNode(template, registry, scope);
			}
		}
		return registry;
	}

	static RegisterNodes(nodes, registry, scope) {
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node?.nodeName === "TEMPLATE") {
				TemplateRegistry.RegisterNode(node, registry, scope);
			}
			if (node?.querySelectorAll) {
				for (const template of node.querySelectorAll("template")) {
					TemplateRegistry.RegisterNode(template, registry, scope);
				}
			}
		}
	}

	static FormatterName(template) {
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

// ----------------------------------------------------------------------------
//
// DOM HELPERS
//
// ----------------------------------------------------------------------------

function isPrunableWhitespaceText(node) {
	return (
		node &&
		node.nodeType === Node.TEXT_NODE &&
		!/\S/.test(node.data) &&
		/[\n\r\t]/.test(node.data)
	);
}
function pruneTemplateWhitespace(node) {
	if (!node?.childNodes || node.childNodes.length === 0) return;
	for (let i = node.childNodes.length - 1; i >= 0; i--) {
		const child = node.childNodes[i];
		if (isPrunableWhitespaceText(child)) {
			node.removeChild(child);
		} else {
			pruneTemplateWhitespace(child);
		}
	}
}

function hashText(value) {
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 31 + value.charCodeAt(i)) | 0;
	}
	return hash;
}

// Function: setNodeText
// Applies `text` to a text node or form-like element value in place.
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

export {
	HTML,
	hashText,
	isInputNode,
	isPrunableWhitespaceText,
	log,
	pruneTemplateWhitespace,
	setNodeText,
	TemplateRegistry,
	type,
};

// EOF
