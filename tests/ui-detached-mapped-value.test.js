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

function listText(selector) {
	return Array.from(document.querySelectorAll(selector)).map((_) =>
		(_.textContent || "").trim(),
	);
}

describe("ui detached mapped values", () => {
	test("remounts scalar content when its mapped node has been detached", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="DetachedScalarRepro">
				<pre out="content"></pre>
			</template>
		`;

		const Repro = ui("DetachedScalarRepro");
		const instance = Repro.new().set({ content: "alpha" }).mount("#app");
		const pre = document.querySelector("#app pre");
		expect(pre?.textContent).toBe("alpha");

		const stale = pre?.firstChild;
		stale?.parentNode?.removeChild(stale);
		expect(pre?.textContent).toBe("");

		const next = document.createElement("span");
		next.textContent = "beta";
		expect(() => instance.update({ content: next })).not.toThrow();
		expect(pre?.textContent).toBe("beta");

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});

	test("replaces detached list items in place instead of appending", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="DetachedListRepro">
				<ul out="items|*Item"></ul>
				<template name="Item">
					<li out="label"></li>
				</template>
			</template>
		`;

		const Repro = ui("DetachedListRepro");
		const items = [{ label: "alpha" }, { label: "beta" }, { label: "gamma" }];
		const nextItems = [
			{ label: "alpha*" },
			{ label: "beta" },
			{ label: "gamma" },
		];
		const instance = Repro.new().set({ items }).mount("#app");
		expect(listText("#app li")).toEqual(["alpha", "beta", "gamma"]);

		const stale = document.querySelectorAll("#app li")[0];
		stale?.parentNode?.removeChild(stale);
		expect(listText("#app li")).toEqual(["beta", "gamma"]);

		expect(() => instance.update({ items: nextItems })).not.toThrow();
		expect(listText("#app li")).toEqual(["alpha*", "beta", "gamma"]);

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});
});
