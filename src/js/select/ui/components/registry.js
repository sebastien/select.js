// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-08-03

// Module: select/ui/components/registry
// Component registry, module-level options, and dynamic component helpers.

// ----------------------------------------------------------------------------
//
// COMPONENT REGISTRY
//
// ----------------------------------------------------------------------------

import { FORMATS, format } from "../../formats.js"
import { log } from "../templates.js"
import { getCurrentUIInstance } from "./runtime.js"

const COMPONENTS = Object.create(null)

// True when `value` is a Select UI component (callable template facade).
function isComponentValue(value) {
	return (
		typeof value === "function" &&
		(value?.isTemplate === true || typeof value?.new === "function")
	)
}

// Mirrors a component into FORMATS so `|Name` processors resolve it.
function mirrorComponentToFormats(key, value, replace = false) {
	if (!key || !isComponentValue(value)) {
		return
	}
	const existing = FORMATS[key]
	if (!replace && existing && existing !== value) {
		if (isComponentValue(existing)) {
			return
		}
	}
	if (existing === value) {
		return
	}
	format(key, value)
}

// Mirrors a FORMATS component into COMPONENTS for Dynamic() resolution.
function mirrorFormatToComponents(key, value) {
	if (!key || !isComponentValue(value)) {
		return
	}
	const existing = COMPONENTS[key]
	if (existing && existing !== value) {
		return
	}
	COMPONENTS[key] = value
}

// Function: component
// Gets or sets a named component in the Dynamic registry. When setting a
// component value, also registers it in FORMATS so template processors can
// resolve `|Name`. Explicit registration replaces an earlier component with
// the same name in both registries.
function component(name, ...value) {
	if (name && typeof name === "object" && !Array.isArray(name)) {
		for (const key in name) {
			COMPONENTS[key] = name[key]
			mirrorComponentToFormats(key, name[key], true)
		}
		return COMPONENTS
	}
	if (typeof name !== "string") {
		return undefined
	}
	const key = name.trim()
	if (!key) {
		return undefined
	}
	if (value.length) {
		COMPONENTS[key] = value[0]
		mirrorComponentToFormats(key, value[0], true)
		return value[0]
	}
	return COMPONENTS[key]
}

// Function: registerComponent
// Used by the factory when auto-registering nested/named templates into
// FORMATS; keeps COMPONENTS in sync for Dynamic().
function registerComponent(name, value) {
	if (!name) {
		return value
	}
	const key = `${name}`.trim()
	if (!key) {
		return value
	}
	const existingFormat = FORMATS[key]
	if (existingFormat && existingFormat !== value) {
		log.warn(
			"ui.formats: duplicate component key, keeping first registration, details",
			{
				key,
				existing: existingFormat,
				ignored: value,
			},
		)
		// Still expose the kept registration via COMPONENTS when it is a component.
		mirrorFormatToComponents(key, existingFormat)
		return existingFormat
	}
	format(key, value)
	mirrorFormatToComponents(key, value)
	return value
}

// Module-level options used by UIInstance
const options = {
	componentRootClass: true,
}

// Function: Dynamic
// Resolves `type` from the component registry (then FORMATS components) when
// needed and invokes it with `props`. Returns `null` when no component matches.
function Dynamic(type, props = {}) {
	if (typeof type !== "string") {
		return type ? type(props) : null
	}
	const resolved =
		COMPONENTS[type] ??
		(isComponentValue(FORMATS[type]) ? FORMATS[type] : undefined)
	return resolved ? resolved(props) : null
}

// Function: lazy
// Wraps async `loader` and returns a component function that renders
// `placeholder` until the loaded template is available. When the loader
// resolves, any UIInstance that rendered the placeholder is scheduled to
// re-render (no parent polling required).
function lazy(loader, placeholder = null) {
	let tmpl = null
	let loading = false
	const pending = new Set()

	function track(instance) {
		if (
			instance &&
			!instance._isDisposed &&
			typeof instance._scheduleRender === "function"
		) {
			pending.add(instance)
		}
	}

	function flush() {
		for (const instance of pending) {
			if (!instance._isDisposed) {
				instance._scheduleRender(null)
			}
		}
		pending.clear()
	}

	function resolvePlaceholder(data) {
		if (typeof placeholder === "function") {
			return placeholder(data)
		}
		return placeholder
	}

	return (data) => {
		if (!tmpl && !loading) {
			loading = true
			Promise.resolve()
				.then(() => loader())
				.then(
					(m) => {
						tmpl = m?.default ?? m
						loading = false
						flush()
					},
					(error) => {
						loading = false
						log.error("ui.lazy: loader rejected, details", { error })
						flush()
					},
				)
		}
		if (!tmpl) {
			track(getCurrentUIInstance())
			return resolvePlaceholder(data)
		}
		return tmpl(data)
	}
}

export {
	COMPONENTS,
	component,
	Dynamic,
	isComponentValue,
	lazy,
	options,
	registerComponent,
}

// EOF
