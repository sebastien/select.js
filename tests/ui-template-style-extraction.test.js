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

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("ui template style extraction", () => {
	test("extracts template styles before compiling bindings and nested templates", async () => {
		const window = new Window({ url: "http://localhost:8000/template-style" });
		setupGlobals(window);
		const uiModule = await import(
			`../src/js/select/ui/index.js?style-extract-main=${Date.now()}`,
		);
		const ui = uiModule.default;

		const Counter = ui(`
			<style>.counter { color: rgb(1, 2, 3); }</style>
			<button class="counter" on:click="inc"><span out="count">0</span></button>
			<template name="Child">
				<style>.child { color: rgb(4, 5, 6); }</style>
				<em class="child" out="label">Child</em>
			</template>
		`).does({
			count: (_self, { count }) => count ?? 0,
			inc: (self, { count }) => ({ count: (count ?? 0) + 1 }),
			label: (_self, { label }) => label ?? "Child",
		});

		expect(document.head.querySelectorAll("style[data-ui-template-style]").length).toBe(
			2,
		);

		const host = document.createElement("div");
		document.body.appendChild(host);
		const instance = Counter.new().set({ count: 1 }).mount(host);
		expect(instance.nodes.some((node) => node.nodeName === "STYLE")).toBe(false);
		expect(host.querySelector("button .counter")).toBe(null);
		expect(host.querySelector("button span").textContent).toBe("1");

		host.querySelector("button").click();
		await flush();
		expect(host.querySelector("button span").textContent).toBe("2");

		const childHost = document.createElement("div");
		document.body.appendChild(childHost);
		const child = Counter.Child.new().set({ label: "Nested" }).mount(childHost);
		expect(child.nodes.some((node) => node.nodeName === "STYLE")).toBe(false);
		expect(childHost.querySelector("em").textContent).toBe("Nested");

		window.close?.();
	});

	test("deduplicates identical extracted template styles", async () => {
		const window = new Window({ url: "http://localhost:8000/template-style-dedup" });
		setupGlobals(window);
		const uiModule = await import(
			`../src/js/select/ui/index.js?style-extract-dedup=${Date.now()}`,
		);
		const ui = uiModule.default;

		const before = document.head.querySelectorAll("style[data-ui-template-style]").length;
		ui(`<style>.shared-token { color: rgb(7, 8, 9); }</style><div class="shared-token"></div>`);
		ui(`<style>.shared-token { color: rgb(7, 8, 9); }</style><span class="shared-token"></span>`);
		const after = document.head.querySelectorAll("style[data-ui-template-style]").length;

		expect(after - before).toBe(1);
		window.close?.();
	});

	test("makes extracted template styles available to shadow-root webcomponents", async () => {
		const window = new Window({ url: "http://localhost:8000/template-style-wc" });
		setupGlobals(window);
		const { default: ui, webcomponent } = await import(
			`../src/js/select/ui/index.js?style-extract-wc=${Date.now()}`,
		);

		const Styled = ui(`
			<style>.token { color: rgb(10, 11, 12); }</style>
			<div class="token">Styled</div>
		`);
		const name = `x-template-style-${Date.now()}`;
		webcomponent(name, Styled, {});

		const element = document.createElement(name);
		document.body.appendChild(element);
		await flush();
		await flush();

		const hasAdoptedRule = (root, text) =>
			Array.from(root.adoptedStyleSheets || []).some((sheet) =>
				Array.from(sheet.cssRules || []).some((rule) => rule.cssText.includes(text)),
			);
		const shadowStyle = Array.from(
			element.shadowRoot.querySelectorAll("style"),
		).find((node) => node.textContent.includes(".token"));

		if (hasAdoptedRule(element.shadowRoot, ".token")) {
			expect(element.shadowRoot.querySelectorAll("style").length).toBe(0);
		} else {
			expect(!!shadowStyle).toBe(true);
		}

		window.close?.();
	});
});
