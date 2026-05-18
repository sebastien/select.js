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

describe("ui out-replace DOM shape", () => {
	test("adjacent out-replace siblings preserve the expected direct child shape", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="AdjacentOutReplaceRepro">
				<div class="horizontal">
					<div out-replace=".|One"></div>
					<div out-replace=".|Two"></div>
					<div out-replace=".|Three"></div>
				</div>
			</template>
			<template name="One"><div class="one">One</div></template>
			<template name="Two"><div class="two">Two</div></template>
			<template name="Three"><div class="three">Three</div></template>
		`;

		const Repro = ui("AdjacentOutReplaceRepro");
		ui("One");
		ui("Two");
		ui("Three");

		const instance = Repro.new().mount("#app");
		const horizontal = document.querySelector("#app .horizontal");
		const classes = Array.from(horizontal.children).map((_) => _.className);

		expect(horizontal.children.length).toBe(3);
		expect(classes).toEqual(["One one", "Two two", "Three three"]);

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});

	test("wrapped out siblings preserve the expected direct child shape", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WrappedOutRepro">
				<div class="horizontal">
					<div class="slot" out=".|One"></div>
					<div class="slot" out=".|Two"></div>
					<div class="slot" out=".|Three"></div>
				</div>
			</template>
			<template name="One"><div class="one">One</div></template>
			<template name="Two"><div class="two">Two</div></template>
			<template name="Three"><div class="three">Three</div></template>
		`;

		const Repro = ui("WrappedOutRepro");
		ui("One");
		ui("Two");
		ui("Three");

		const instance = Repro.new().mount("#app");
		const horizontal = document.querySelector("#app .horizontal");
		const classes = Array.from(horizontal.children).map((_) => _.className);
		const nested = Array.from(horizontal.children).map(
			(_) => _.firstElementChild?.className ?? null,
		);

		expect(horizontal.children.length).toBe(3);
		expect(classes).toEqual(["slot", "slot", "slot"]);
		expect(nested).toEqual(["One one", "Two two", "Three three"]);

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});
});
