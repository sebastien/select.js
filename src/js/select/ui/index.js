// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: select/ui
// Re-export surface for the UI runtime.

// ----------------------------------------------------------------------------
//
// PUBLIC HELPERS
//
// ----------------------------------------------------------------------------

import { len, type } from "../utils.js"

import {
	AppliedUITemplate,
	COMPONENTS,
	component,
	Dynamic,
	lazy,
	UIEvent,
	UIAttributeSlot,
	UIAttributeTemplateSlot,
	UIContentSlot,
	UIEventSlot,
	UIEventTemplateSlot,
	UIInstance,
	UISlot,
	UITemplate,
	UITemplateSlot,
} from "./components.js"

import { Adopted, Disconnect, UIWebComponent, webcomponent } from "./webcomponents.js"
import { ui } from "./factory.js"
import { FORMATS, format } from "../formats.js"

// Function: remap
// Maps `f` over collection entries while preserving the input container shape.
function remap(value, f) {
	if (
		value === null ||
		value === undefined ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return value
	} else if (Array.isArray(value)) {
		const n = value.length
		const res = new Array(n)
		for (let i = 0; i < n; i++) {
			res[i] = f(value[i], i)
		}
		return res
	} else if (value instanceof Map) {
		const res = new Map()
		for (const [k, v] of value.entries()) {
			res.set(k, f(v, k))
		}
		return res
	} else if (value instanceof Set) {
		const res = new Set()
		for (const v of value) {
			res.add(f(v, undefined))
		}
		return res
	}
	const res = {}
	for (const k in value) {
		res[k] = f(value[k], k)
	}
	return res
}

export {
	Adopted,
	AppliedUITemplate,
	Disconnect,
	COMPONENTS,
	component,
	Dynamic,
	FORMATS,
	format,
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
}

export default ui

// EOF
