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

describe("ui when + out attribute regression", () => {
	test("baseline conditional item renders only the checked disc", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenOutAttrBaselineRepro">
				<ul out="items">
					<template name="Item">
						<li>
							<span class="disc on" when="checked">on</span>
							<span class="disc off" when="!checked">off</span>
						</li>
					</template>
				</ul>
			</template>
		`;

		const Repro = ui("WhenOutAttrBaselineRepro").does({
			items: () => [Repro.Item({ checked: true })],
		});

		Repro.new().mount("#app");

		const discs = Array.from(document.querySelectorAll("#app .disc")).map(
			(_) => (_.textContent || "").trim(),
		);
		expect(discs).toEqual(["on"]);

		document.body.innerHTML = "";
		window.close?.();
	});

	test("workaround with out::data-checked keeps the same shape", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenOutAttrPatchedRepro">
				<ul out="items">
					<template name="Item">
						<li>
							<span class="disc on" when="checked" out::data-checked="checked">on</span>
							<span class="disc off" when="!checked">off</span>
						</li>
					</template>
				</ul>
			</template>
		`;

		const Repro = ui("WhenOutAttrPatchedRepro").does({
			items: () => [Repro.Item({ checked: true })],
		});

		Repro.new().mount("#app");

		const discs = Array.from(document.querySelectorAll("#app .disc")).map(
			(_) => (_.textContent || "").trim(),
		);
		expect(discs).toEqual(["on"]);

		document.body.innerHTML = "";
		window.close?.();
	});

	test("bare out attributes infer same-name when keys", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="WhenOutAttrInferenceRepro">
				<div>
					<input class="value" when="?" out:value />
					<div class="class" when="?" out:class></div>
					<div class="data" when="?" out:data-id></div>
				</div>
			</template>
		`;

		const Repro = ui("WhenOutAttrInferenceRepro");
		Repro
			.new()
			.set({ value: "Alpha", class: "ready", "data-id": "card-42" })
			.mount("#app");

		expect(document.querySelector("#app .value")?.value).toBe("Alpha");
		expect(document.querySelector("#app .class")?.className).toContain("ready");
		expect(document.querySelector("#app .data")?.getAttribute("data-id")).toBe(
			"card-42",
		);

		document.body.innerHTML = "";
		window.close?.();
	});
});
