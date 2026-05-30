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

describe("ui template text root regression", () => {
	test("keeps non-empty root text nodes while trimming prefix/suffix whitespace", async () => {
		const window = new Window({ url: "http://localhost:8000/repro" });
		setupGlobals(window);
		const { stripTemplateNodes } = await import("../src/js/select/ui/factory.js");

		const makeText = (value) => document.createTextNode(value);
		const nodes = [
			makeText("\n\t"),
			makeText("Collection Review"),
			makeText("\n\t"),
			document.createElement("div"),
			makeText("\n\t"),
			makeText("After"),
			makeText("\n\t"),
		];
		nodes[3].textContent = "Wrapped";

		const stripped = stripTemplateNodes(nodes);
		expect(stripped.length).toBe(5);
		expect(stripped[0].nodeType).toBe(Node.TEXT_NODE);
		expect(stripped[0].textContent).toBe("Collection Review");
		expect(stripped[1].nodeType).toBe(Node.TEXT_NODE);
		expect(stripped[1].textContent).toBe("\n\t");
		expect(stripped[2].nodeName).toBe("DIV");
		expect(stripped[3].nodeType).toBe(Node.TEXT_NODE);
		expect(stripped[3].textContent).toBe("\n\t");
		expect(stripped[4].textContent).toBe("After");

		document.body.innerHTML = "";
		window.close?.();
	});
});
