import { describe, expect, test } from "bun:test";

import { Window } from "happy-dom";

// Keyed `Component({ $key })` wrappers are cached per key by `apply()`. A keyed
// row passed down inside another component's props must still show its new data:
// the parent compares those props, so a changed row cannot look like the old one.

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
	g.NodeFilter = window.NodeFilter;
	g.SVGElement = window.SVGElement;
	g.customElements = window.customElements;
	g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
	g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
	g.navigator = window.navigator;
	g.getComputedStyle = window.getComputedStyle.bind(window);
}

function texts(selector) {
	return Array.from(document.querySelectorAll(selector)).map((_) =>
		(_.textContent || "").trim(),
	);
}

async function setup(templates) {
	const window = new Window({ url: "http://localhost:8000/keyed" });
	setupGlobals(window);
	const { ui } = await import("../src/js/select/ui/index.js");
	document.body.innerHTML = `<div id="app"></div>${templates}`;
	return { ui, window };
}

function teardown(instance, window) {
	instance.unmount();
	document.body.innerHTML = "";
	window.close?.();
}

const NESTED = `
	<template id="KeyedOutline">
		<ul out="sections"></ul>
	</template>
	<template id="KeyedSection">
		<li class="section"><b out="title"></b><ul out="rows"></ul></li>
	</template>
	<template id="KeyedRow">
		<li class="row" out="label"></li>
	</template>
`;

function outline(ui, { sectionKey = true } = {}) {
	const Row = ui("KeyedRow");
	const Section = ui("KeyedSection");
	return ui("KeyedOutline").does({
		sections: (_self, { rows }) => [
			Section({
				...(sectionKey ? { $key: "section" } : {}),
				title: "Section",
				rows: (rows || []).map((row) =>
					Row({ $key: row.id, label: row.label }),
				),
			}),
		],
	});
}

describe("ui keyed applied templates", () => {
	test("a keyed row inside a keyed parent's props shows its new data", async () => {
		const { ui, window } = await setup(NESTED);
		const instance = outline(ui)
			.new()
			.set({ rows: [{ id: "a", label: "first" }] })
			.mount("#app");
		expect(texts("#app .row")).toEqual(["first"]);

		instance.update({ rows: [{ id: "a", label: "second" }] });
		expect(texts("#app .row")).toEqual(["second"]);

		teardown(instance, window);
	});

	test("a keyed row inside an unkeyed parent's props shows its new data", async () => {
		const { ui, window } = await setup(NESTED);
		const instance = outline(ui, { sectionKey: false })
			.new()
			.set({ rows: [{ id: "a", label: "first" }] })
			.mount("#app");

		instance.update({ rows: [{ id: "a", label: "second" }] });
		expect(texts("#app .row")).toEqual(["second"]);

		teardown(instance, window);
	});

	test("nested keyed rows keep their nodes when unchanged and update when changed", async () => {
		const { ui, window } = await setup(NESTED);
		const instance = outline(ui)
			.new()
			.set({
				rows: [
					{ id: "a", label: "alpha" },
					{ id: "b", label: "beta" },
				],
			})
			.mount("#app");
		const [alpha, beta] = document.querySelectorAll("#app .row");

		instance.update({
			rows: [
				{ id: "a", label: "alpha" },
				{ id: "b", label: "beta*" },
			],
		});
		const rows = document.querySelectorAll("#app .row");
		expect(texts("#app .row")).toEqual(["alpha", "beta*"]);
		expect(rows[0]).toBe(alpha);
		expect(rows[1]).toBe(beta);

		teardown(instance, window);
	});

	test("nested keyed rows reorder and change together", async () => {
		const { ui, window } = await setup(NESTED);
		const instance = outline(ui)
			.new()
			.set({
				rows: [
					{ id: "a", label: "alpha" },
					{ id: "b", label: "beta" },
				],
			})
			.mount("#app");

		instance.update({
			rows: [
				{ id: "b", label: "beta*" },
				{ id: "a", label: "alpha" },
			],
		});
		expect(texts("#app .row")).toEqual(["beta*", "alpha"]);

		teardown(instance, window);
	});

	test("keyed rows in a direct slot update in place", async () => {
		const { ui, window } = await setup(`
			<template id="KeyedDirect">
				<ul out="rows"></ul>
			</template>
			<template id="KeyedDirectRow">
				<li class="row" out="label"></li>
			</template>
		`);
		const Row = ui("KeyedDirectRow");
		const Direct = ui("KeyedDirect").does({
			rows: (_self, { rows }) =>
				rows.map((row) => Row({ $key: row.id, label: row.label })),
		});
		const instance = Direct.new()
			.set({ rows: [{ id: "a", label: "first" }] })
			.mount("#app");
		const node = document.querySelector("#app .row");

		instance.update({ rows: [{ id: "a", label: "second" }] });
		expect(texts("#app .row")).toEqual(["second"]);
		expect(document.querySelector("#app .row")).toBe(node);

		teardown(instance, window);
	});
});
