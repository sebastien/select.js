import { describe, expect, test } from "bun:test";

import { Window } from "happy-dom";

function setupGlobals(window) {
	window.SyntaxError = SyntaxError;
	window.TypeError = TypeError;
	window.Error = Error;
	const g = globalThis;
	g.window = window;
	g.document = window.document;
	g.Node = window.Node;
	g.Element = window.Element;
	g.HTMLElement = window.HTMLElement;
	g.DocumentFragment = window.DocumentFragment;
	g.Text = window.Text;
	g.Comment = window.Comment;
	g.Document = window.Document;
	g.DOMParser = window.DOMParser;
	g.MutationObserver = window.MutationObserver;
	g.CustomEvent = window.CustomEvent;
	g.Event = window.Event;
	g.MouseEvent = window.MouseEvent;
	g.KeyboardEvent = window.KeyboardEvent;
	g.NodeFilter = window.NodeFilter;
	g.SVGElement = window.SVGElement;
	g.customElements = window.customElements;
	g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
	g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
	g.navigator = window.navigator;
	g.getComputedStyle = window.getComputedStyle.bind(window);
	const styleProto = Object.getPrototypeOf(
		window.document.createElement("div").style,
	);
	if (styleProto && !styleProto[Symbol.iterator]) {
		Object.defineProperty(styleProto, Symbol.iterator, {
			configurable: true,
			value: function* iter() {
				for (const key of Object.keys(this)) {
					if (/^[a-zA-Z-]+$/.test(key)) {
						yield key;
					}
				}
			},
		});
	}
}

function commentValues(root) {
	const values = [];
	const walk = (node) => {
		for (const child of node.childNodes) {
			if (child.nodeType === Node.COMMENT_NODE) values.push(child.nodeValue);
			else walk(child);
		}
	};
	walk(root);
	return values;
}

function bodyComments() {
	const values = [];
	for (const child of document.body.childNodes) {
		if (child.nodeType === Node.COMMENT_NODE) values.push(child.nodeValue);
	}
	return values;
}

describe("ui when placeholder ownership", () => {
	test("hide plants the placeholder at the original parent after the node is moved", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui/index.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenMovedNodeRepro">
				<div class="shell">
					<div class="toolbar" when="flag">tools</div>
					<div class="content">body</div>
				</div>
			</template>
		`;

		const instance = ui("WhenMovedNodeRepro").new().mount("#app");
		instance.set({ flag: true });
		const toolbar = document.querySelector("#app .toolbar");
		expect(toolbar).toBeTruthy();
		document.body.appendChild(toolbar);

		instance.set({ flag: false });
		expect(document.querySelector(".toolbar")).toBeNull();
		expect(bodyComments()).not.toContain("flag");
		expect(commentValues(document.querySelector("#app"))).toContain("flag");

		instance.unmount();
		expect(bodyComments()).not.toContain("flag");
		expect(document.querySelector(".toolbar")).toBeNull();

		document.body.innerHTML = "";
		window.close?.();
	});

	test("hide does not plant a placeholder on body if a hidden node is reinserted there", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui/index.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenReinsertedHiddenRepro">
				<div class="shell">
					<div class="toolbar" when="flag">tools</div>
				</div>
			</template>
		`;

		const instance = ui("WhenReinsertedHiddenRepro").new().mount("#app");
		instance.set({ flag: true });
		const toolbar = document.querySelector("#app .toolbar");
		instance.set({ flag: false });
		document.body.appendChild(toolbar);
		instance.set({ flag: false });
		expect(bodyComments()).not.toContain("flag");
		expect(document.body.querySelector(":scope > .toolbar")).toBeNull();
		expect(commentValues(document.querySelector("#app"))).toContain("flag");

		instance.unmount();
		expect(bodyComments()).not.toContain("flag");
		expect(document.querySelector(".toolbar")).toBeNull();

		document.body.innerHTML = "";
		window.close?.();
	});

	test("unmount removes a visible when node that was moved outside the instance", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui/index.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenMovedVisibleRepro">
				<div class="shell">
					<div class="toolbar" when="flag">tools</div>
				</div>
			</template>
		`;

		const instance = ui("WhenMovedVisibleRepro").new().mount("#app");
		instance.set({ flag: true });
		document.body.appendChild(document.querySelector("#app .toolbar"));
		expect(document.body.querySelector(":scope > .toolbar")).toBeTruthy();

		instance.unmount();
		expect(document.body.querySelector(":scope > .toolbar")).toBeNull();
		expect(bodyComments()).not.toContain("flag");

		document.body.innerHTML = "";
		window.close?.();
	});

	test("unmount collects a when placeholder that drifted onto the document body", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui/index.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenDriftedPlaceholderRepro">
				<div class="shell">
					<div class="toolbar" when="flag">tools</div>
				</div>
			</template>
		`;

		const instance = ui("WhenDriftedPlaceholderRepro").new().mount("#app");
		instance.set({ flag: false });
		const placeholder = [
			...document.querySelector("#app").querySelectorAll("*"),
		]
			.flatMap((node) => [...node.childNodes])
			.find(
				(node) =>
					node.nodeType === Node.COMMENT_NODE && node.nodeValue === "flag",
			);
		expect(placeholder).toBeTruthy();
		document.body.appendChild(placeholder);
		expect(bodyComments()).toContain("flag");

		instance.unmount();
		expect(bodyComments()).not.toContain("flag");

		document.body.innerHTML = "";
		window.close?.();
	});
});
