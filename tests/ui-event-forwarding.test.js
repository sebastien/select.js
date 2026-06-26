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
}

describe("ui event forwarding", () => {
	test("keeps the originating DOM event on forwarded synthetic events", async () => {
		const window = new Window({ url: "http://localhost:8000/event-forwarding" });
		setupGlobals(window);
		const { ui } = await import("../src/js/select/ui.js");

		document.body.innerHTML = `
			<div id="app"></div>
			<template id="ForwardedEventRepro">
				<button on:mousedown="!MyEvent">Press</button>
			</template>
		`;

		let seen = null;
		const Component = ui("ForwardedEventRepro").sub({
			MyEvent: (self, data, event) => {
				seen = event;
				expect(data).toBe(self.data);
			},
		});

		const instance = Component.new().set({ value: 3 }).mount("#app");
		const button = document.querySelector("button");
		const domEvent = new MouseEvent("mousedown", { bubbles: true });
		button.dispatchEvent(domEvent);

		expect(seen).not.toBeNull();
		expect(seen.name).toBe("MyEvent");
		expect(seen.current).toBe(instance);
		expect(seen.origin).toBe(instance);
		expect(seen.data).toBe(instance.data);
		expect(seen.event).toBe(domEvent);

		instance.unmount();
		document.body.innerHTML = "";
		window.close?.();
	});
});
