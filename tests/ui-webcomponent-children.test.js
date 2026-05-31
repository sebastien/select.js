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

describe("ui webcomponent projected children", () => {
	test("assigns host children to the native default slot without adopting them", async () => {
		const window = new Window({ url: "http://localhost:8000/webcomponent" });
		setupGlobals(window);
		const { ui, webcomponent } = await import("../src/js/select/ui.js");

		const ProjectChildren = ui(`
			<div class="shell">
				<strong class="count" out="label"></strong>
				<slot class="panels"></slot>
			</div>
		`);

		webcomponent("x-project-children-test", ProjectChildren, {
			label: "Projected",
		});

		const element = document.createElement("x-project-children-test");
		const first = document.createElement("section");
		first.textContent = "A";
		const second = document.createElement("section");
		second.textContent = "B";
		element.append(first, second);
		document.body.appendChild(element);
		await flush();

		const shadow = element.shadowRoot;
		const panels = shadow.querySelector(".panels");
		expect(shadow.querySelector(".count").textContent).toBe("Projected");
		expect(panels.assignedElements()).toEqual([first, second]);
		expect(Array.from(element.children)).toEqual([first, second]);

		const third = document.createElement("section");
		third.textContent = "C";
		element.appendChild(third);
		await flush();

		expect(shadow.querySelector(".count").textContent).toBe("Projected");
		expect(panels.assignedElements()).toEqual([first, second, third]);
		expect(Array.from(element.children)).toEqual([first, second, third]);

		window.close?.();
	});

	test("assigns named host children to native named slots without data.children", async () => {
		const window = new Window({ url: "http://localhost:8000/webcomponent" });
		setupGlobals(window);
		const { ui, webcomponent } = await import("../src/js/select/ui.js");

		const SlotCard = ui(`
			<article class="card">
				<header class="header"><slot name="header"></slot></header>
				<div class="body"><slot></slot></div>
			</article>
		`);

		webcomponent("x-project-slot-test", SlotCard, {});

		const element = document.createElement("x-project-slot-test");
		const title = document.createElement("h1");
		title.setAttribute("slot", "header");
		title.textContent = "Projected Title";
		const body = document.createElement("p");
		body.textContent = "Projected Body";
		element.append(title, body);
		document.body.appendChild(element);
		await flush();

		const shadow = element.shadowRoot;
		expect(shadow.querySelector(".header slot").assignedElements()).toEqual([
			title,
		]);
		expect(shadow.querySelector(".body slot").assignedElements()).toEqual([
			body,
		]);
		expect(Array.from(element.children)).toEqual([title, body]);

		window.close?.();
	});
});
