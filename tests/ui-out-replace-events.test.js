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

describe("ui out-replace event binding", () => {
	test("keeps click handlers on static siblings after out-replace", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="OutReplaceEventRepro">
				<ul>
					<li class="button" on:click="onPage" data-page="before">Before</li>
					<li out-replace="pages|*Page"></li>
					<template name="Page">
						<li class="button" out:class="className" on:click="onPage" out::data-page="number">
							<span out="number"></span>
						</li>
					</template>
					<li class="button" on:click="onPage" data-page="after">After</li>
				</ul>
			</template>
		`;

		const clicks = [];
		const Repro = ui("OutReplaceEventRepro").does({
			onPage: (_self, _data, event) => {
				const page =
					event?.currentTarget?.dataset?.page ??
					event?.target?.closest?.("[data-page]")?.dataset?.page;
				clicks.push(page);
			},
		});

		const instance = Repro.new()
			.set({
				pages: [
					{ number: 1, className: "current" },
					{ number: 2, className: "" },
				],
			})
			.mount("#app");

		const buttons = Array.from(document.querySelectorAll("#app li.button"));
		expect(buttons.length).toBe(4);

		buttons[0].click();
		buttons[3].click();

		expect(clicks).toEqual(["before", "after"]);

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});
});
