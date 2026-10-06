// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-10-06

// Module: select/ui/ssr
// Server-side rendering for Select UI templates. Renders a component into a
// detached DOM tree (no mounting) and serializes it to an HTML string.
//
// The runtime renders on cloned, detached nodes, so the only requirement is a
// DOM implementation that supports `querySelectorAll`/`matches` (happy-dom,
// linkedom, jsdom). This module imports the UI runtime only — never the main
// barrel — so browser-oriented modules (icons, interaction) are not pulled in.
//
// Example:
// ```javascript
// import { Window } from "happy-dom"
// import { render } from "select/ui/ssr"
//
// const window = new Window()
// const inst = await render(Component, { items: [...] }, { window })
// inst.html()          // cleaned HTML string
// await inst.update({ items: [...] })  // resolves once settled
// inst.html()
// ```

// ----------------------------------------------------------------------------
//
// DOM BOOTSTRAP
//
// ----------------------------------------------------------------------------

import {
	getPendingAsyncCount,
	scheduleRenderTask,
	setRenderTaskScheduler,
	throwAsyncError,
} from "./components/runtime.js";

// Globals assigned by `install()` so the library can resolve documents and
// node constructors in a DOM-less runtime.
const DOM_GLOBAL_KEYS = [
	"document",
	"HTMLElement",
	"Node",
	"Element",
	"DocumentFragment",
	"Text",
	"Comment",
	"Document",
	"customElements",
	"MutationObserver",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"HTMLInputElement",
	"HTMLSelectElement",
	"HTMLTextAreaElement",
	"HTMLFormElement",
	"Event",
	"CustomEvent",
	"MouseEvent",
	"KeyboardEvent",
	"NodeFilter",
	"SVGElement",
	"DOMParser",
];

let _installed = null;

// Function: installDOM
// Copies DOM constructors and `document` from `options.window` (or
// `options.document`) onto `globalThis`, remembering previous values so
// `uninstall()` can restore them. Returns the installed window.
function installDOM(options) {
	const window =
		options.window ??
		options.document?.defaultView ??
		options.defaultView ??
		options;
	const document = options.document ?? window?.document;
	if (!document?.querySelectorAll || !document.createElement("div").matches) {
		throw new Error(
			"ssr.install: expected a DOM with selector support (e.g. happy-dom or linkedom)",
		);
	}
	if (_installed) {
		if (_installed.document !== document) {
			throw new Error(
				"ssr.install: another DOM is still in use; dispose its instances and uninstall it first",
			);
		}
		return _installed;
	}
	const snapshot = new Map();
	const setGlobal = (key, value) => {
		snapshot.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
		try {
			globalThis[key] = value;
		} catch (_error) {
			Object.defineProperty(globalThis, key, {
				configurable: true,
				writable: true,
				value,
			});
		}
	};
	try {
		setGlobal("window", window);
		setGlobal("document", document);
		for (const key of DOM_GLOBAL_KEYS) {
			if (key !== "document" && key in window) {
				const value = window[key];
				setGlobal(
					key,
					key.endsWith("AnimationFrame") ? value.bind(window) : value,
				);
			}
		}
		if (window.getComputedStyle) {
			setGlobal("getComputedStyle", window.getComputedStyle.bind(window));
		}
	} catch (error) {
		restoreGlobals(snapshot);
		throw error;
	}
	_installed = { window, document, snapshot, refs: 0, manual: false };
	return _installed;
}

function restoreGlobals(snapshot) {
	for (const [key, descriptor] of snapshot) {
		if (descriptor) {
			Object.defineProperty(globalThis, key, descriptor);
		} else {
			delete globalThis[key];
		}
	}
}

// Function: install
// Explicitly installs a DOM until `uninstall` is requested and live instances
// are disposed. Repeated calls for the same DOM return the installed window.
function install(options = {}) {
	const installed = installDOM(options);
	installed.manual = true;
	return installed.window;
}

// Function: uninstall
// Restores installed globals once all live SSR instances have been disposed.
function uninstall() {
	if (!_installed) return;
	_installed.manual = false;
	if (_installed.refs === 0) {
		restoreGlobals(_installed.snapshot);
		_installed = null;
	}
}

function acquireDOM(options) {
	const installed =
		options.window || options.document ? installDOM(options) : _installed;
	if (!globalThis.document) {
		throw new Error(
			"ssr.create: install a DOM or pass options.window/options.document first",
		);
	}
	if (installed) installed.refs += 1;
	return installed;
}

function releaseDOM(installed) {
	if (!installed) return;
	installed.refs -= 1;
	if (!installed.manual && installed.refs === 0) uninstall();
}

// ----------------------------------------------------------------------------
//
// SERIALIZATION
//
// ----------------------------------------------------------------------------

function cleanNode(node) {
	if (
		node.nodeType === 8 &&
		(node.data === "empty" || node.data.startsWith("when:"))
	) {
		node.remove();
		return;
	}
	if (node.nodeType === 1) {
		if (node.getAttribute("ui-parent")?.startsWith("ui-"))
			node.removeAttribute("ui-parent");
		if (node.getAttribute("style") === "") node.removeAttribute("style");
	}
	const children = node.content?.childNodes ?? node.childNodes;
	for (let i = children.length - 1; i >= 0; i--) cleanNode(children[i]);
}

// Function: cleanHtml
// Removes runtime artifacts from an HTML fragment using the installed DOM.
// Preserves text, whitespace, user attributes, and script/style contents.
function cleanHtml(html) {
	const template = globalThis.document.createElement("template");
	template.innerHTML = html;
	return serializeNodes(template.content.childNodes);
}

function escapeText(value) {
	return `${value}`
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

// Function: serializeNodes
// Concatenates `nodes` to HTML. `clean` (default true) removes runtime artifacts
// from clones, leaving the live tree and meaningful whitespace unchanged.
function serializeNodes(nodes, clean = true) {
	let html = "";
	for (let i = 0; i < nodes.length; i++) {
		let node = nodes[i];
		if (!node) {
			continue;
		}
		if (clean) {
			if (
				node.nodeType === 8 &&
				(node.data === "empty" || node.data.startsWith("when:"))
			)
				continue;
			node = node.cloneNode(true);
			cleanNode(node);
		}
		switch (node.nodeType) {
			case 3:
				html += escapeText(node.data);
				break;
			case 8:
				html += `<!--${node.data}-->`;
				break;
			case 11:
				html += serializeNodes(node.childNodes, false);
				break;
			default:
				html += node.outerHTML || "";
		}
	}
	return html;
}

// ----------------------------------------------------------------------------
//
// SETTLE
//
// ----------------------------------------------------------------------------

const MAX_SETTLE_ITERATIONS = 1000;

// Shared queue-backed render-task scheduler. A refcount lets concurrent SSR
// renders share one queue instead of clobbering each other's scheduler.
let _schedulerDepth = 0;
let _schedulerQueue = [];
let _schedulerPrevious = null;

function acquireSchedulerQueue() {
	if (_schedulerDepth === 0) {
		_schedulerQueue = [];
		_schedulerPrevious = setRenderTaskScheduler((task, instance) =>
			_schedulerQueue.push({ task, instance }),
		);
	}
	_schedulerDepth += 1;
}

function releaseSchedulerQueue() {
	_schedulerDepth = Math.max(0, _schedulerDepth - 1);
	if (_schedulerDepth === 0) {
		setRenderTaskScheduler(_schedulerPrevious);
		_schedulerPrevious = null;
		const tasks = _schedulerQueue;
		_schedulerQueue = [];
		for (let i = 0; i < tasks.length; i++) {
			scheduleRenderTask(tasks[i].task, tasks[i].instance);
		}
	}
}

function ownsTask(root, instance) {
	for (; instance; instance = instance.parent) {
		if (instance === root) return true;
	}
	return false;
}

function hasQueuedTasks(instance) {
	return _schedulerQueue.some((entry) => ownsTask(instance, entry.instance));
}

function discardQueuedTasks(instance) {
	_schedulerQueue = _schedulerQueue.filter((entry) => {
		if (!ownsTask(instance, entry.instance)) return true;
		entry.instance._renderQueued = false;
		return false;
	});
}

function drainQueue(instance, deadline) {
	// One finite batch only: newly scheduled tasks belong to the next turn.
	const tasks = _schedulerQueue;
	_schedulerQueue = [];
	let i = 0;
	try {
		for (; i < tasks.length; i++) {
			const entry = tasks[i];
			if (deadline && Date.now() >= deadline) break;
			if (ownsTask(instance, entry.instance)) entry.task();
			else _schedulerQueue.push(entry);
		}
	} catch (error) {
		_schedulerQueue = tasks.slice(i + 1).concat(_schedulerQueue);
		throw error;
	}
	if (i < tasks.length)
		_schedulerQueue = tasks.slice(i).concat(_schedulerQueue);
}

// Function: settle
// Drains scheduled renders and tracked async work. A positive `timeout` bounds
// timer-based work; without one, only a bounded sequence of microtasks is run.
async function settle(instance, timeout = 0) {
	const yieldTurn =
		timeout > 0
			? () => new Promise((resolve) => setTimeout(resolve, 0))
			: () => Promise.resolve();
	const deadline = timeout > 0 ? Date.now() + timeout : 0;
	for (let i = 0; i < MAX_SETTLE_ITERATIONS; i++) {
		throwAsyncError(instance);
		drainQueue(instance, deadline);
		if (!hasQueuedTasks(instance) && getPendingAsyncCount(instance) === 0) {
			// Allow late microtask work to register before concluding.
			await Promise.resolve();
			throwAsyncError(instance);
			drainQueue(instance, deadline);
			if (!hasQueuedTasks(instance) && getPendingAsyncCount(instance) === 0) {
				return;
			}
		}
		if (timeout > 0 && Date.now() >= deadline) {
			break;
		}
		await yieldTurn();
	}
	throwAsyncError(instance);
	if (hasQueuedTasks(instance)) {
		throw new Error(
			"ssr.settle: render queue did not settle within its budget",
		);
	}
}

// ----------------------------------------------------------------------------
//
// SSR INSTANCE
//
// ----------------------------------------------------------------------------

// Class: SSRInstance
// Facade over a detached `UIInstance` whose `set`/`update` resolve once the
// render cycle has settled.
class SSRInstance {
	constructor(instance, options = {}, installed = null) {
		this.instance = instance;
		this._timeout = options.timeout ?? 0;
		this._installed = installed;
	}

	// Returns the serialized HTML for `clean` output.
	html(clean = true) {
		return serializeNodes(this.instance.nodes, clean);
	}

	get nodes() {
		return this.instance.nodes;
	}

	get data() {
		return this.instance.data;
	}

	// Applies `data` and resolves after the render cycle settles. Resolves with
	// this facade so callers can read `.html`.
	set(data) {
		return this._cycle(() => this.instance.set(data));
	}

	// Updates `data` and resolves after the render cycle settles.
	update(data, force = false) {
		return this._cycle(() => this.instance.update(data, force));
	}

	dispose() {
		try {
			this.instance.dispose();
		} finally {
			const installed = this._installed;
			this._installed = null;
			releaseDOM(installed);
		}
	}

	async _cycle(run) {
		acquireSchedulerQueue();
		try {
			run();
			await settle(this.instance, this._timeout);
		} finally {
			discardQueuedTasks(this.instance);
			releaseSchedulerQueue();
		}
		return this;
	}
}

// ----------------------------------------------------------------------------
//
// PUBLIC API
//
// ----------------------------------------------------------------------------

// Function: create
// Creates a detached SSR instance for `component`. Initializers/default data
// run during construction; use `render` to await their scheduled work.
// `component` may be a Select component facade or a `UITemplate`.
function create(component, options = {}) {
	const template = component?.template ?? component;
	if (!template || typeof template.new !== "function") {
		throw new Error(
			"ssr.create: expected a Select component (e.g. ui(...)) or UITemplate",
		);
	}
	const installed = acquireDOM(options);
	try {
		const instance = template.new(undefined, { data: options.data });
		return new SSRInstance(instance, options, installed);
	} catch (error) {
		releaseDOM(installed);
		throw error;
	}
}

// Function: render
// Creates and renders `component` with `data`, resolving with an `SSRInstance`
// once the render cycle has settled.
//
// `options.window`/`options.document` install DOM globals for the duration.
// `options.timeout` bounds awaiting timer-based async behaviors.
async function render(component, data, options = {}) {
	acquireSchedulerQueue();
	let ssr;
	try {
		ssr = create(component, { ...options, data });
		return await ssr._cycle(() => {
			// Initializers/default data may already have rendered during construction.
			if (
				!ssr.instance._hasRendered ||
				(ssr.instance.template.defaultData && data !== undefined)
			) {
				ssr.instance.set(data);
			}
		});
	} catch (error) {
		ssr?.dispose();
		throw error;
	} finally {
		releaseSchedulerQueue();
	}
}

// Function: renderToString
// Renders `component` with `data` and returns the serialized HTML string.
async function renderToString(component, data, options = {}) {
	const ssr = await render(component, data, options);
	try {
		return ssr.html(options.clean ?? true);
	} finally {
		ssr.dispose();
	}
}

const ssr = {
	cleanHtml,
	create,
	install,
	render,
	renderToString,
	serializeNodes,
	SSRInstance,
	uninstall,
};

export {
	cleanHtml,
	create,
	install,
	render,
	renderToString,
	SSRInstance,
	serializeNodes,
	uninstall,
};
export default ssr;

// EOF
