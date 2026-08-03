// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-03

// Module: select/ui/styles
// Document head style mirroring into shadow roots for Select UI web components.

import { hashText, log } from "./templates.js"

const documentStyleSheetCache = new WeakMap()
const documentStyleSubscribers = new WeakMap()
const documentStyleObservers = new WeakMap()
const documentStyleSyncTasks = new WeakMap()
const documentStyleHeadHooks = new WeakMap()

function isStyleSheetNode(node) {
	if (node?.nodeType !== 1) {
		return false
	}
	const tagName = node.tagName?.toLowerCase()
	return (
		tagName === "style" ||
		(tagName === "link" && node.relList?.contains("stylesheet"))
	)
}

function isStyleSheetMutation(mutation) {
	if (isStyleSheetNode(mutation.target)) {
		return true
	}
	if (
		mutation.type === "characterData" &&
		isStyleSheetNode(mutation.target?.parentNode)
	) {
		return true
	}
	for (const node of mutation.addedNodes || []) {
		if (isStyleSheetNode(node)) {
			return true
		}
	}
	for (const node of mutation.removedNodes || []) {
		if (isStyleSheetNode(node)) {
			return true
		}
	}
	return false
}

function scheduleDocumentStyleSync(doc) {
	if (!doc || documentStyleSyncTasks.has(doc)) {
		return
	}
	const task = setTimeout(() => {
		documentStyleSyncTasks.delete(doc)
		// getDocumentStyles short-circuits on signature; hosts no-op when unchanged.
		const styles = getDocumentStyles(doc)
		for (const subscriber of documentStyleSubscribers.get(doc) || []) {
			subscriber._syncDocumentStyles?.(styles)
		}
	}, 0)
	documentStyleSyncTasks.set(doc, task)
}

// Head method hooks catch style inserts that some environments (e.g. happy-dom)
// do not always surface via MutationObserver alone.
function hookDocumentHead(doc) {
	const head = doc?.head
	if (!head || documentStyleHeadHooks.has(doc)) {
		return
	}
	const originalAppendChild = head.appendChild
	const originalInsertBefore = head.insertBefore
	const originalReplaceChild = head.replaceChild
	const originalRemoveChild = head.removeChild
	const scheduleIfNeeded = (node) => {
		if (isStyleSheetNode(node)) {
			scheduleDocumentStyleSync(doc)
		}
	}
	head.appendChild = function appendChild(node) {
		const result = originalAppendChild.call(this, node)
		scheduleIfNeeded(node)
		return result
	}
	head.insertBefore = function insertBefore(node, referenceNode) {
		const result = originalInsertBefore.call(this, node, referenceNode)
		scheduleIfNeeded(node)
		return result
	}
	head.replaceChild = function replaceChild(node, referenceNode) {
		const result = originalReplaceChild.call(this, node, referenceNode)
		scheduleIfNeeded(node)
		scheduleIfNeeded(referenceNode)
		return result
	}
	head.removeChild = function removeChild(node) {
		const result = originalRemoveChild.call(this, node)
		scheduleIfNeeded(node)
		return result
	}
	documentStyleHeadHooks.set(doc, {
		head,
		appendChild: originalAppendChild,
		insertBefore: originalInsertBefore,
		replaceChild: originalReplaceChild,
		removeChild: originalRemoveChild,
	})
}

function unhookDocumentHead(doc) {
	const hooks = documentStyleHeadHooks.get(doc)
	if (!hooks) {
		return
	}
	hooks.head.appendChild = hooks.appendChild
	hooks.head.insertBefore = hooks.insertBefore
	hooks.head.replaceChild = hooks.replaceChild
	hooks.head.removeChild = hooks.removeChild
	documentStyleHeadHooks.delete(doc)
}

// Function: getDocumentStylesSignature
// Compact signature of document head stylesheets for cache invalidation.
function getDocumentStylesSignature(doc) {
	if (!doc?.head?.querySelectorAll) {
		return ""
	}
	const nodes = doc.head.querySelectorAll("style,link[rel~='stylesheet']")
	const signature = []
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]
		if (node.tagName?.toLowerCase() === "style") {
			const text = node.textContent || ""
			signature.push(
				`style:${node.id || ""}:${node.getAttribute("type") || ""}:${node.media || ""}:${text.length}:${hashText(text)}`,
			)
		} else {
			signature.push(
				`link:${node.getAttribute("href") || ""}:${node.getAttribute("rel") || ""}:${node.getAttribute("media") || ""}:${node.hasAttribute("disabled")}`,
			)
		}
	}
	return signature.join("|")
}

// Function: watchDocumentStyles
// Subscribes `component` to document head style changes (idempotent).
// Uses MutationObserver plus head method hooks for environments that miss MO.
function watchDocumentStyles(doc, component) {
	const MutationObserverType =
		doc?.defaultView?.MutationObserver || globalThis.MutationObserver
	if (!doc?.head || typeof MutationObserverType !== "function") {
		return
	}
	hookDocumentHead(doc)
	let subscribers = documentStyleSubscribers.get(doc)
	if (!subscribers) {
		subscribers = new Set()
		documentStyleSubscribers.set(doc, subscribers)
	}
	subscribers.add(component)
	if (documentStyleObservers.has(doc)) {
		return
	}
	const observer = new MutationObserverType((mutations) => {
		if (!mutations.some(isStyleSheetMutation)) {
			return
		}
		scheduleDocumentStyleSync(doc)
	})
	observer.observe(doc.head, {
		childList: true,
		subtree: true,
		attributes: true,
		// Limit attribute noise to stylesheet-relevant link/style attrs.
		attributeFilter: ["href", "media", "disabled", "rel", "type", "id"],
		characterData: true,
	})
	documentStyleObservers.set(doc, observer)
}

// Function: unwatchDocumentStyles
// Unsubscribes `component`; tears down observer/hooks when last subscriber leaves.
function unwatchDocumentStyles(doc, component) {
	const subscribers = documentStyleSubscribers.get(doc)
	if (!subscribers) {
		return
	}
	subscribers.delete(component)
	if (subscribers.size > 0) {
		return
	}
	documentStyleSubscribers.delete(doc)
	const task = documentStyleSyncTasks.get(doc)
	if (task !== undefined) {
		clearTimeout(task)
		documentStyleSyncTasks.delete(doc)
	}
	const observer = documentStyleObservers.get(doc)
	observer?.disconnect()
	documentStyleObservers.delete(doc)
	unhookDocumentHead(doc)
}

function buildDocumentStyleSheets(doc) {
	if (!doc?.head?.querySelectorAll) {
		return { sheets: [], fallbackNodes: [] }
	}
	const nodes = doc.head.querySelectorAll("style,link[rel~='stylesheet']")
	const sheets = []
	const fallbackNodes = []
	const HTMLStyleElementType =
		doc.defaultView?.HTMLStyleElement || globalThis.HTMLStyleElement
	const CSSStyleSheetType =
		doc.defaultView?.CSSStyleSheet || globalThis.CSSStyleSheet
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]
		if (
			HTMLStyleElementType &&
			node instanceof HTMLStyleElementType &&
			typeof CSSStyleSheetType === "function"
		) {
			try {
				const sheet = new CSSStyleSheetType()
				sheet.replaceSync(node.textContent || "")
				sheets.push(sheet)
				continue
			} catch (error) {
				log.warn("UIWebComponent: could not adopt document style, details", {
					node,
					error,
				})
			}
		}
		fallbackNodes.push(node)
	}
	return { sheets, fallbackNodes }
}

function getDocumentStyles(doc) {
	const cached = documentStyleSheetCache.get(doc)
	const signature = getDocumentStylesSignature(doc)
	if (cached && cached.signature === signature) {
		return cached
	}
	const value = {
		...buildDocumentStyleSheets(doc),
		signature,
	}
	documentStyleSheetCache.set(doc, value)
	return value
}

// Function: getDocumentStylesForRoot
// Returns adopt-ready document styles for `root`, or empty when disabled.
function getDocumentStylesForRoot(root, options, doc) {
	if (options?.documentStyles === false) {
		return { sheets: [], fallbackNodes: [], signature: "" }
	}
	if (!root || root === doc || !doc?.head?.querySelectorAll) {
		return { sheets: [], fallbackNodes: [], signature: "" }
	}
	return getDocumentStyles(doc)
}

// Function: syncDocumentStyles
// Applies document styles into a host's shadow root. Host fields:
// `_documentStylesSignature`, `_documentStyleSheets`, `_documentStyleFallbackNodes`.
function syncDocumentStyles(host, styles) {
	const root = host.root
	styles =
		styles ||
		getDocumentStylesForRoot(root, host.options, host.ownerDocument)
	if (
		!styles ||
		host._documentStylesSignature === styles.signature ||
		root === host
	) {
		return
	}
	for (const node of host._documentStyleFallbackNodes || []) {
		node.parentNode?.removeChild(node)
	}
	host._documentStyleFallbackNodes = []
	if ("adoptedStyleSheets" in root) {
		const previous = host._documentStyleSheets || []
		const existing = root.adoptedStyleSheets || []
		root.adoptedStyleSheets = [
			...existing.filter((sheet) => !previous.includes(sheet)),
			...styles.sheets,
		]
	}
	if (!("adoptedStyleSheets" in root) || styles.fallbackNodes.length) {
		for (let i = 0; i < styles.fallbackNodes.length; i++) {
			const clone = styles.fallbackNodes[i].cloneNode(true)
			root.appendChild(clone)
			host._documentStyleFallbackNodes.push(clone)
		}
	}
	host._documentStyleSheets = styles.sheets
	host._documentStylesSignature = styles.signature
}

// Function: clearDocumentStyles
// Removes adopted/fallback document styles from `host` and resets signature.
function clearDocumentStyles(host) {
	for (const node of host._documentStyleFallbackNodes || []) {
		node.parentNode?.removeChild(node)
	}
	if (host.root && "adoptedStyleSheets" in host.root) {
		const previous = host._documentStyleSheets || []
		host.root.adoptedStyleSheets = (host.root.adoptedStyleSheets || []).filter(
			(sheet) => !previous.includes(sheet),
		)
	}
	host._documentStyleFallbackNodes = []
	host._documentStyleSheets = []
	host._documentStylesSignature = null
}

// Function: initDocumentStyleState
// Initializes per-host style bookkeeping fields (no watch yet).
function initDocumentStyleState(host) {
	host._documentStylesSignature = null
	host._documentStyleSheets = []
	host._documentStyleFallbackNodes = []
}

export {
	clearDocumentStyles,
	getDocumentStylesSignature,
	initDocumentStyleState,
	syncDocumentStyles,
	unwatchDocumentStyles,
	watchDocumentStyles,
}

// EOF
