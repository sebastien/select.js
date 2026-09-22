// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-23

// Module: select/ui/links
// Default SPA click interceptor for `ui.options.link` and a document-level
// capture helper. Uses `browser().go` so a configured `base` is respected.

import { browser } from "../state/browser.js";

// Function: interceptLink
// Prevents same-origin left-clicks on in-page anchors and navigates with
// `browser().go`. Modifier clicks, `_blank`, `download`, hash, and mailto
// links are left to the browser. Accepts either `(self, data, event)` from
// `ui.options.link` or a raw click `event`.
function interceptLink(_self, _data, event) {
	const click =
		event ??
		(_self && typeof _self.preventDefault === "function" ? _self : undefined);
	if (
		!click ||
		click.defaultPrevented ||
		click.button ||
		click.metaKey ||
		click.ctrlKey ||
		click.shiftKey ||
		click.altKey
	) {
		return;
	}
	const target =
		click.target?.nodeType === 1 ? click.target : click.target?.parentElement;
	const anchor =
		click.currentTarget?.closest?.("a[href]") ?? target?.closest?.("a[href]");
	if (
		!anchor ||
		(anchor.target && anchor.target !== "_self") ||
		anchor.hasAttribute("download")
	) {
		return;
	}
	const href = anchor.getAttribute("href");
	if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
	const doc = anchor.ownerDocument ?? globalThis.document;
	const base = doc?.baseURI ?? globalThis.location?.href;
	if (!base) return;
	let url;
	let origin;
	try {
		origin = new URL(base).origin;
		url = new URL(href, base);
	} catch {
		return;
	}
	if (
		(url.protocol !== "http:" && url.protocol !== "https:") ||
		url.origin !== origin
	)
		return;
	click.preventDefault();
	const state = browser({ window: doc?.defaultView });
	const path = state.location?.pathFormat
		? state.location.pathFormat.parse(url.pathname)
		: url.pathname;
	state.go(path);
	if (state.location?.queryFormat) {
		state.query.set(state.location.queryFormat.parse(url.search));
	}
	if (state.location?.hashFormat) {
		state.hash.set(state.location.hashFormat.parse(url.hash));
	}
}

// Function: captureLinks
// Listens for clicks on `root` (default `document`) and forwards them to
// `interceptLink`. Returns an unsubscribe function.
function captureLinks(root = globalThis.document) {
	if (!root || typeof root.addEventListener !== "function") {
		return () => {};
	}
	const handler = (event) => {
		const target =
			event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
		const anchor = target?.closest?.("a[href]");
		if (anchor?.hasAttribute("on:click") || anchor?.hasAttribute("on-click")) {
			return;
		}
		interceptLink(undefined, undefined, event);
	};
	root.addEventListener("click", handler, true);
	return () => root.removeEventListener("click", handler, true);
}

export { captureLinks, interceptLink };

// EOF
