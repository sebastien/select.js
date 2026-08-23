// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-18

// Module: select/ui/components/runtime
// Shared rendering helpers for component templates and instances.

// ----------------------------------------------------------------------------
//
// RUNTIME CORE
//
// ----------------------------------------------------------------------------

import { microtask } from "../../utils/index.js";

const SLOT_DEFAULT_KEY = "_";
const SKIP_INPUT_UPDATE = Symbol("skip-input-update");
// Host attribute linking a custom element back to a mounted UIInstance parent.
const UI_PARENT_ATTRIBUTE = "ui-parent";

// Active UIInstance while behaviors run (used by lazy() to schedule re-render).
let _currentUIInstance = null;

// Function: getCurrentUIInstance
// Returns the UIInstance currently executing a behavior, if any.
function getCurrentUIInstance() {
	return _currentUIInstance;
}

// Function: runWithUIInstance
// Runs `fn` with `instance` as the current UIInstance context.
function runWithUIInstance(instance, fn) {
	const previous = _currentUIInstance;
	_currentUIInstance = instance;
	try {
		return fn();
	} finally {
		_currentUIInstance = previous;
	}
}

// Walks `nodes[rootIndex]` along `tailPath` child indices.
function resolveTemplatePath(nodes, rootIndex, tailPath) {
	let node = nodes[rootIndex];
	if (tailPath) {
		for (let i = 0; i < tailPath.length; i++) {
			node = node ? node.childNodes[tailPath[i]] : node;
		}
	}
	return node;
}

function getInputBindingProperty(node, preferred = undefined) {
	return preferred
		? preferred
		: node?.nodeName === "DETAILS"
			? "open"
			: "value";
}
function getInputEventValue(node, event, property = "value") {
	const target = event?.target;
	if (!target) return undefined;
	if (property === "open") return !!target.open;
	if (property !== "value") return target[property];
	if (node?.nodeName === "INPUT") {
		const type = `${node.type || ""}`.toLowerCase();
		if (type === "checkbox") return !!target.checked;
		if (type === "radio")
			return target.checked ? target.value : SKIP_INPUT_UPDATE;
		if (type === "number" || type === "range") {
			const value = `${target.value || ""}`.trim();
			if (!value.length) return null;
			const numeric = Number(value);
			return Number.isNaN(numeric) ? null : numeric;
		}
	}
	return target.value;
}

function scheduleRenderTask(fn) {
	const mutate = globalThis.fastdom?.mutate;
	if (typeof mutate === "function") {
		mutate(fn);
	} else {
		microtask(fn);
	}
}

function createTrackingProxy(data) {
	const accessed = new Set();
	return [
		new Proxy(data, {
			get(target, property) {
				accessed.add(property);
				return target[property];
			},
		}),
		accessed,
	];
}

function snapshotReactiveDependencyRevisions(data, deps) {
	if (!data || !deps || deps.size === 0) {
		return null;
	}
	const revisions = new Map();
	for (const dep of deps) {
		const value = data[dep];
		if (value?.isReactive === true && Number.isFinite(value.revision)) {
			revisions.set(dep, value.revision);
		}
	}
	return revisions.size > 0 ? revisions : null;
}

function hasTrackedNonReactiveObjectDeps(data, deps) {
	if (!data || !deps || deps.size === 0) {
		return false;
	}
	for (const dep of deps) {
		const value = data[dep];
		if (
			value &&
			value.isReactive !== true &&
			typeof value === "object" &&
			(value.constructor === Object || Array.isArray(value))
		) {
			return true;
		}
	}
	return false;
}

export {
	createTrackingProxy,
	getCurrentUIInstance,
	getInputBindingProperty,
	getInputEventValue,
	hasTrackedNonReactiveObjectDeps,
	resolveTemplatePath,
	runWithUIInstance,
	SKIP_INPUT_UPDATE,
	SLOT_DEFAULT_KEY,
	scheduleRenderTask,
	snapshotReactiveDependencyRevisions,
	UI_PARENT_ATTRIBUTE,
};

// EOF
