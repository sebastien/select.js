// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02

// Module: select/ui/components/registry
// Component registry, module-level options, and dynamic component helpers.

// ----------------------------------------------------------------------------
//
// COMPONENT REGISTRY
//
// ----------------------------------------------------------------------------

const COMPONENTS = Object.create(null);
function component(name, ...value) {
	if (name && typeof name === "object" && !Array.isArray(name)) {
		for (const key in name) {
			COMPONENTS[key] = name[key];
		}
		return COMPONENTS;
	}
	if (typeof name !== "string") {
		return undefined;
	}
	const key = name.trim();
	if (!key) {
		return undefined;
	}
	if (value.length) {
		COMPONENTS[key] = value[0];
		return value[0];
	}
	return COMPONENTS[key];
}

// Module-level options used by UIInstance
const options = {
	componentRootClass: true,
};
// Function: Dynamic
// Resolves `type` from the component registry when needed and invokes it with
// `props`. Returns `null` when no component matches.
function Dynamic(type, props = {}) {
	const resolved = typeof type === "string" ? COMPONENTS[type] : type;
	return resolved ? resolved(props) : null;
}
// Function: lazy
// Wraps async `loader` and returns a component function that renders
// `placeholder` until the loaded template is available.
function lazy(loader, placeholder = null) {
	let tmpl = null;
	let loading = false;
	return (data) => {
		if (!tmpl && !loading) {
			loading = true;
			loader().then((m) => {
				tmpl = m.default || m;
			});
		}
		return tmpl ? tmpl(data) : placeholder;
	};
}
export { COMPONENTS, component, Dynamic, lazy, options };

// EOF
