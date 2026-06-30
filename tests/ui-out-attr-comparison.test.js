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

describe("ui out attribute comparisons", () => {
	test("supports radio checked equality bindings", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="RadioCheckedComparisonTest">
				<input class="radio" type="radio" value="3" out:checked="panel==3" />
			</template>
		`;

		const Component = ui("RadioCheckedComparisonTest");
		Component.new().set({ panel: 3 }).mount("#app");
		expect(document.querySelector("#app .radio")?.checked).toBe(true);

		document.body.innerHTML = "";
		document.body.innerHTML = `
			<div id="app"></div>
			<template id="RadioCheckedComparisonTest">
				<input class="radio" type="radio" value="3" out:checked="panel==3" />
			</template>
		`;

		ui("RadioCheckedComparisonTest").new().set({ panel: 2 }).mount("#app");
		expect(document.querySelector("#app .radio")?.checked).toBe(false);

		document.body.innerHTML = "";
		window.close?.();
	});

	test("supports processors on comparison left-hand values", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui, format } = await import("../src/js/select/ui/index.js");

		format("toNumber", (value) => Number(value));

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="RadioCheckedProcessorComparisonTest">
				<input class="radio" type="radio" value="3" out:checked="panel|toNumber==3" />
			</template>
		`;

		ui("RadioCheckedProcessorComparisonTest")
			.new()
			.set({ panel: "3" })
			.mount("#app");

		expect(document.querySelector("#app .radio")?.checked).toBe(true);

		document.body.innerHTML = "";
		window.close?.();
	});

	test("supports non-equality operators in out attributes", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="DisabledComparisonTest">
				<button class="button" out:disabled="index>=2">Ready</button>
			</template>
		`;

		const Component = ui("DisabledComparisonTest");
		Component.new().set({ index: 2 }).mount("#app");
		expect(document.querySelector("#app .button")?.disabled).toBe(true);

		document.body.innerHTML = "";
		document.body.innerHTML = `
			<div id="app"></div>
			<template id="DisabledComparisonTest">
				<button class="button" out:disabled="index>=2">Ready</button>
			</template>
		`;

		ui("DisabledComparisonTest").new().set({ index: 1 }).mount("#app");
		expect(document.querySelector("#app .button")?.disabled).toBe(false);

		document.body.innerHTML = "";
		window.close?.();
	});
});
