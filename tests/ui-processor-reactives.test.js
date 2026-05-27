import { afterEach, describe, expect, test } from "bun:test";

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

const registeredFormats = [];

function registerFormat(format, name, value) {
	const previous = format(name);
	registeredFormats.push([format, name, previous]);
	format(name, value);
	return value;
}

afterEach(() => {
	for (let i = registeredFormats.length - 1; i >= 0; i--) {
		const [format, name, previous] = registeredFormats[i];
		format(name, previous);
	}
	registeredFormats.length = 0;
});

describe("ui processor reactive handling", () => {
	test("passes root reactive values through component processors unchanged", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { cell } = await import("../src/js/select/index.js");
		const { ui, format } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="ProcessorRootComponentRepro">
				<div out=".|ProbeComponent"></div>
			</template>
		`;

		const ProbeComponent = ui(`<span out="flag"></span>`).does({
			flag: (_self, data) => (data.state?.isReactive === true ? "reactive" : "plain"),
		});
		registerFormat(format, "ProbeComponent", ProbeComponent);

		const instance = ui("ProcessorRootComponentRepro")
			.new()
			.set({ state: cell("alpha") })
			.mount("#app");

		expect(document.querySelector("#app span")?.textContent).toBe("reactive");

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});

	test("allows explicit unwrap before component processors", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { cell } = await import("../src/js/select/index.js");
		const { ui, format } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="ProcessorRootUnwrapRepro">
				<div out=".|unwrap|ProbeComponent"></div>
			</template>
		`;

		const ProbeComponent = ui(`<span out="flag"></span>`).does({
			flag: (_self, data) => (data.state?.isReactive === true ? "reactive" : "plain"),
		});
		registerFormat(format, "ProbeComponent", ProbeComponent);

		const instance = ui("ProcessorRootUnwrapRepro")
			.new()
			.set({ state: cell("alpha") })
			.mount("#app");

		expect(document.querySelector("#app span")?.textContent).toBe("plain");

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});

	test("expands dotted traversal and final non-component results before rendering", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { cell } = await import("../src/js/select/index.js");
		const { ui, format } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="ProcessorTraversalRepro">
				<span out="a.b.c|toReactive"></span>
			</template>
		`;

		registerFormat(format, "toReactive", (value) => cell(`${value}!`));

		const instance = ui("ProcessorTraversalRepro")
			.new()
			.set({
				a: cell({
					b: cell({
						c: "ok",
					}),
				}),
			})
			.mount("#app");

		expect(document.querySelector("#app span")?.textContent).toBe("ok!");

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});

	test("preserves raw per-item values for starred component processors", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { cell } = await import("../src/js/select/index.js");
		const { ui, format } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="ProcessorEachComponentRepro">
				<ul out="items|*ProbeItem"></ul>
			</template>
		`;

		const ProbeItem = ui(`<li out="flag"></li>`).does({
			flag: (_self, data) => (data.state?.isReactive === true ? "reactive" : "plain"),
		});
		registerFormat(format, "ProbeItem", ProbeItem);

		const instance = ui("ProcessorEachComponentRepro")
			.new()
			.set({
				items: [{ state: cell("alpha") }, { state: "beta" }],
			})
			.mount("#app");

		const items = Array.from(document.querySelectorAll("#app li")).map((_) =>
			(_.textContent || "").trim(),
		);
		expect(items).toEqual(["reactive", "plain"]);

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});
});
