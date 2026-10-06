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

// Optional render-task scheduler. Server-side rendering installs one that
// queues callbacks so the runner can drain them deterministically instead of
// waiting on animation frames.
let _renderTaskScheduler = null;

// Pending work belongs to an instance, not to every render in the runtime.
const _pendingAsync = new WeakMap();
const _asyncErrors = new WeakMap();

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

function scheduleRenderTask(fn, instance = null) {
	if (_renderTaskScheduler) {
		_renderTaskScheduler(fn, instance);
		return;
	}
	const mutate = globalThis.fastdom?.mutate;
	if (typeof mutate === "function") {
		mutate(fn);
	} else {
		microtask(fn);
	}
}

// Function: setRenderTaskScheduler
// Overrides how scheduled render tasks run (returns the previous scheduler).
// Passing `null` restores the default fastdom/microtask behavior.
function setRenderTaskScheduler(scheduler) {
	const previous = _renderTaskScheduler;
	_renderTaskScheduler = typeof scheduler === "function" ? scheduler : null;
	return previous;
}

// Function: trackAsync
// Registers a thenable as pending async UI work. Returns it so callers can
// chain. Used by SSR to know when a render has settled.
function trackAsync(promise, instance = getCurrentUIInstance()) {
	if (
		!instance ||
		instance._isDisposed ||
		!promise ||
		typeof promise.then !== "function"
	) {
		return promise;
	}
	let pending = _pendingAsync.get(instance);
	if (!pending) {
		pending = new Set();
		_pendingAsync.set(instance, pending);
	}
	if (!pending.has(promise)) {
		pending.add(promise);
		const settled = () => pending.delete(promise);
		promise.then(settled, (error) => {
			settled();
			if (!instance._isDisposed && !_asyncErrors.has(instance)) {
				_asyncErrors.set(instance, error);
			}
		});
	}
	return promise;
}

// Function: getPendingAsyncCount
// Number of outstanding operations in the live instance subtree.
function getPendingAsyncCount(instance) {
	if (!instance || instance._isDisposed) return 0;
	let count = _pendingAsync.get(instance)?.size ?? 0;
	if (instance.children) {
		for (const child of instance.children) count += getPendingAsyncCount(child);
	}
	return count;
}

// Function: throwAsyncError
// Consumes a failed async render in this live subtree, if any.
function throwAsyncError(instance) {
	const errors = [];
	function collect(current) {
		if (!current || current._isDisposed) return;
		if (_asyncErrors.has(current)) {
			errors.push(_asyncErrors.get(current));
			_asyncErrors.delete(current);
		}
		if (current.children) {
			for (const child of current.children) collect(child);
		}
	}
	collect(instance);
	if (errors.length) throw errors[0];
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
	getPendingAsyncCount,
	hasTrackedNonReactiveObjectDeps,
	resolveTemplatePath,
	runWithUIInstance,
	SKIP_INPUT_UPDATE,
	SLOT_DEFAULT_KEY,
	scheduleRenderTask,
	setRenderTaskScheduler,
	snapshotReactiveDependencyRevisions,
	throwAsyncError,
	trackAsync,
	UI_PARENT_ATTRIBUTE,
};

// EOF
