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

describe("ui out- prefix attribute bindings", () => {
	test("out-xlink:href binds attribute with colon in name", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="XLinkTest">
				<div out-xlink:href="iconRef"></div>
			</template>
		`;

		const Component = ui("XLinkTest");
		Component.new().set({ iconRef: "#my-icon" }).mount("#app");

		expect(document.querySelector("#app div")?.getAttribute("xlink:href")).toBe("#my-icon");

		document.body.innerHTML = "";
		window.close?.();
	});

	test("bare out- attributes bind as same-name keys", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="BareTest">
				<div out-data-colon></div>
			</template>
		`;

		const Component = ui("BareTest");
		Component.new().set({ "data-colon": "bar" }).mount("#app");

		expect(document.querySelector("#app div")?.getAttribute("data-colon")).toBe("bar");

		document.body.innerHTML = "";
		window.close?.();
	});

	test("out- prefixed attributes support processors", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui, format } = await import("../src/js/select/ui/index.js");

		format("Uppercase", (v) => `${v}`.toUpperCase());

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="ProcessorTest">
				<div out-xlink:href="iconRef|Uppercase"></div>
			</template>
		`;

		const Component = ui("ProcessorTest");
		Component.new().set({ iconRef: "#my-icon" }).mount("#app");

		expect(document.querySelector("#app div")?.getAttribute("xlink:href")).toBe("#MY-ICON");

		document.body.innerHTML = "";
		window.close?.();
	});

	test("out- prefix does not interfere with out: prefix", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="BothTest">
				<div out:class="cls" out-data-colon></div>
			</template>
		`;

		const Component = ui("BothTest");
		Component.new().set({ cls: "hello", "data-colon": "world" }).mount("#app");

		const el = document.querySelector("#app div");
		expect(el?.className).toContain("hello");
		expect(el?.getAttribute("data-colon")).toBe("world");

		document.body.innerHTML = "";
		window.close?.();
	});
});
