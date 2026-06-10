import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";

let dom;
let ui;
let cell;
let format;

function installDomEnvironment() {
	dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "http://localhost/",
	});
	const { window } = dom;
	globalThis.window = window;
	globalThis.document = window.document;
	globalThis.Node = window.Node;
	globalThis.Element = window.Element;
	globalThis.HTMLElement = window.HTMLElement;
	globalThis.NodeList = window.NodeList;
	globalThis.DOMParser = window.DOMParser;
	globalThis.DocumentFragment = window.DocumentFragment;
	globalThis.CustomEvent = window.CustomEvent;
	globalThis.Event = window.Event;
	globalThis.MouseEvent = window.MouseEvent;
}

beforeEach(async () => {
	installDomEnvironment();
	if (!ui || !cell || !format) {
		({ ui } = await import("../src/js/select/ui/index.js"));
		({ cell } = await import("../src/js/select/cells.js"));
		({ format } = await import("../src/js/select/formats.js"));
	}
});

afterEach(() => {
	dom?.window.close();
	document.body.innerHTML = "";
});

describe("select ui reactive bindings", () => {
	it("passes reactive values through component processors", () => {
		const Parent = ui(`
			<div out="payload|Child"></div>
			<template id="Child"><div out="capture"></div></template>
		`);
		let seen = null;

		Parent.Child.does({
			capture: (_self, data) => {
				seen = data;
				return "";
			},
		});

		const reactive = cell([{ id: "name" }]);

		Parent.new().set({ payload: reactive }).mount(document.body);

		expect(seen).toBe(reactive);
	});

	it("keeps expanding non-component processors during render", () => {
		const formatterName = "captureReactiveValue";
		let seen = null;

		format(formatterName, (value) => {
			seen = value;
			return `${Array.isArray(value) ? value.length : -1}`;
		});

		const Component = ui(`<div out="payload|${formatterName}"></div>`);
		const reactive = cell([{ id: "name" }, { id: "age" }]);

		Component.new().set({ payload: reactive }).mount(document.body);

		expect(seen).toEqual([{ id: "name" }, { id: "age" }]);
		expect(document.body.textContent?.trim()).toBe("2");
	});

	it("fully unwraps nested reactive values before rendering value bindings", () => {
		const formatterName = "captureNestedReactiveValue";
		let seen = null;

		format(formatterName, (value) => {
			seen = value;
			return value;
		});

		const Plain = ui(`<input out:value="payload" />`);
		const WithFormatter = ui(`<input out:value="payload|${formatterName}" />`);
		const payload = cell(cell("Active Clients"));

		Plain.new().set({ payload }).mount(document.body);
		expect(document.querySelector("input")?.value).toBe("Active Clients");

		document.body.innerHTML = "";

		WithFormatter.new().set({ payload }).mount(document.body);
		expect(seen).toBe("Active Clients");
		expect(document.querySelector("input")?.value).toBe("Active Clients");
	});

	it("treats bare out attributes as same-name bindings", () => {
		const ValueBinding = ui(`<input out:value />`);
		const ClassBinding = ui(`<div out:class></div>`);
		const DataBinding = ui(`<div out:data-id></div>`);
		const dataId = "card-42";

		ValueBinding.new().set({ value: "Active Clients" }).mount(document.body);
		expect(document.querySelector("input")?.value).toBe("Active Clients");

		document.body.innerHTML = "";

		ClassBinding.new().set({ class: "selected" }).mount(document.body);
		expect(document.querySelector("div")?.className).toBe("selected");

		document.body.innerHTML = "";

		DataBinding.new().set({ "data-id": dataId }).mount(document.body);
		expect(document.querySelector("div")?.getAttribute("data-id")).toBe(dataId);
	});

	it("publishes reactive payloads without expanding them", () => {
		let seen = null;
		const Component = ui(`<button on:click="payload!Ping">Ping</button>`).sub({
			Ping: (_self, _data, event) => {
				seen = event.data;
			},
		});
		const reactive = cell({ width: 120 });
		const instance = Component.new().set({ payload: reactive }).mount(document.body);

		document.querySelector("button").dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(seen).toBe(reactive);
		instance.unmount();
	});
});
