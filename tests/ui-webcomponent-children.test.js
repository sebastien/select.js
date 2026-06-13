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

	test("rebinds wrapped component pub events through ui-parent", async () => {
		const window = new Window({ url: "http://localhost:8000/webcomponent" });
		setupGlobals(window);
		const { ui, webcomponent } = await import("../src/js/select/ui.js");

		const Parent = ui(`
			<section>
				<output class="value" out="value"></output>
			</section>
		`).sub({
			Increment: (self, { value }, event) => ({ value: value + event.data }),
		});

		const Child = ui(`
			<button on:click="click" out="count"></button>
		`).does({
			count: (_self, { count }) => count,
			click: (self, { count }) => self.pub("Increment", count),
		});

		const name = `x-pub-child-${Date.now()}`;
		webcomponent(name, Child, { count: 0 });

		const parent = Parent.new().set({ value: 1 }).mount(document.body);
		const element = document.createElement(name);
		element.setAttribute("count", "2");
		element.setAttribute("ui-parent", parent.id);
		document.body.appendChild(element);
		await flush();

		expect(element.instance.parent).toBe(parent);
		element.shadowRoot
			.querySelector("button")
			.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await flush();

		expect(parent.nodes[0].querySelector(".value").textContent).toBe("3");

		window.close?.();
	});

	test("implicitly binds kebab-case custom elements to their parent instance", async () => {
		const window = new Window({ url: "http://localhost:8000/webcomponent" });
		setupGlobals(window);
		const { ui, webcomponent } = await import("../src/js/select/ui.js");

		const Child = ui(`
			<button on:click="click" out="count"></button>
		`).does({
			count: (_self, { count }) => count,
			click: (self, { count }) => self.pub("Increment", count),
		});

		const name = `x-implicit-parent-${Date.now()}`;
		webcomponent(name, Child, { count: 0 });

		const Parent = ui(`
			<section>
				<output class="value" out="value"></output>
				<${name} count="2"></${name}>
			</section>
		`).sub({
			Increment: (_self, { value }, event) => ({ value: value + event.data }),
		});

		const parent = Parent.new().set({ value: 1 }).mount(document.body);
		await flush();

		const element = parent.nodes[0].querySelector(name);
		expect(element.getAttribute("ui-parent")).toBe(parent.id);
		expect(element.instance.parent).toBe(parent);

		element.shadowRoot
			.querySelector("button")
			.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		await flush();

		expect(parent.nodes[0].querySelector(".value").textContent).toBe("3");

		window.close?.();
	});

	test("syncs exposed reactive keys through wc:* events for inout bindings", async () => {
		const window = new Window({ url: "http://localhost:8000/webcomponent" });
		setupGlobals(window);
		const { cell } = await import("../src/js/select/cells.js");
		const { ui, webcomponent } = await import("../src/js/select/ui.js");

		const Child = ui(`<input inout:value="text" />`).init(() => ({
			text: cell("Initial"),
		}));

		const name = `x-inout-text-${Date.now()}`;
		webcomponent(name, Child, { text: String });

		const Parent = ui(`
			<section>
				<${name} inout:text="value"></${name}>
				<output class="value" out="value"></output>
			</section>
		`);

		Parent.new().set({ value: "Initial" }).mount(document.body);
		await flush();

		const element = document.querySelector(name);
		expect(element.getAttribute("text")).toBe("Initial");
		const emitted = [];
		element.addEventListener("wc:text", (event) => {
			emitted.push(event.detail);
		});

		const input = element.shadowRoot.querySelector("input");
		expect(input.value).toBe("Initial");
		input.value = "Updated";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await flush();

		expect(document.querySelector(".value").textContent).toBe("Updated");
		expect(emitted.at(-1)).toEqual({
			name: "text",
			previous: "Initial",
			current: "Updated",
		});

		window.close?.();
	});

	test("syncs document styles added after connect into shadow roots", async () => {
		const window = new Window({ url: "http://localhost:8000/webcomponent" });
		setupGlobals(window);
		const { ui, webcomponent } = await import("../src/js/select/ui.js");

		const Styled = ui(`<div class="token">Styled</div>`);
		const name = `x-style-sync-${Date.now()}`;
		webcomponent(name, Styled, {});

		const element = document.createElement(name);
		document.body.appendChild(element);
		await flush();

		const style = document.createElement("style");
		style.textContent = ".token { color: rgb(1, 2, 3); }";
		document.head.appendChild(style);
		element._syncDocumentStyles();
		await flush();
		await flush();

		const adoptedSheets = element.shadowRoot.adoptedStyleSheets || [];
		if (
			"adoptedStyleSheets" in element.shadowRoot &&
			typeof window.CSSStyleSheet?.prototype?.replaceSync === "function"
		) {
			expect(adoptedSheets.length).toBeGreaterThan(0);
			expect(element.shadowRoot.querySelectorAll("style").length).toBe(0);
		} else {
			const shadowStyle = Array.from(
				element.shadowRoot.querySelectorAll("style"),
			).find((node) => node.textContent.includes(".token"));
			expect(!!shadowStyle).toBe(true);
		}

		style.textContent = ".token { fill:  rgb(1, 2, 3); }";
		element._syncDocumentStyles();
		await flush();
		await flush();
		if (
			"adoptedStyleSheets" in element.shadowRoot &&
			typeof window.CSSStyleSheet?.prototype?.replaceSync === "function"
		) {
			expect(element.shadowRoot.adoptedStyleSheets.length).toBeGreaterThan(0);
			expect(element.shadowRoot.querySelectorAll("style").length).toBe(0);
			expect(
				Array.from(element.shadowRoot.adoptedStyleSheets).some((sheet) =>
					Array.from(sheet.cssRules || []).some((rule) =>
						rule.cssText.includes("fill"),
					),
				),
			).toBe(true);
		} else {
			const shadowStyle = Array.from(
				element.shadowRoot.querySelectorAll("style"),
			).find((node) => node.textContent.includes("fill"));
			expect(!!shadowStyle).toBe(true);
		}

		window.close?.();
	});
});
