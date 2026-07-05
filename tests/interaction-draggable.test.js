import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

let activeWindow;

function setup() {
	activeWindow = new Window();
	Object.assign(globalThis, {
		window: activeWindow,
		document: activeWindow.document,
		Node: activeWindow.Node,
		Element: activeWindow.Element,
		HTMLElement: activeWindow.HTMLElement,
		MouseEvent: activeWindow.MouseEvent,
	});
	return activeWindow;
}

function rect(left, top, width, height) {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
	};
}

function dragFrom(window, source, move) {
	let cancel;
	source.addEventListener("mousedown", (event) => {
		cancel = move.start(event);
	});
	source.dispatchEvent(
		new window.MouseEvent("mousedown", {
			bubbles: true,
			button: 0,
			clientX: 5,
			clientY: 5,
		}),
	);
	window.dispatchEvent(
		new window.MouseEvent("mousemove", {
			bubbles: true,
			clientX: move.x,
			clientY: move.y,
		}),
	);
	window.dispatchEvent(
		new window.MouseEvent("mouseup", {
			bubbles: true,
			clientX: move.x,
			clientY: move.y,
		}),
	);
	return cancel;
}

afterEach(() => {
	activeWindow?.close();
	activeWindow = undefined;
});

describe("interaction draggable", () => {
	test("appends a source clone to an accepted target by default", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/interaction/draggable.js"
		);
		const source = window.document.createElement("button");
		source.dataset.draggable = "card";
		source.textContent = "Original";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		drop.dataset.dropAccept = "card";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) => draggable(event),
		});

		expect(source.parentNode).toBe(window.document.body);
		expect(drop.children).toHaveLength(1);
		expect(drop.firstElementChild).not.toBe(source);
		expect(drop.textContent).toBe("Original");
	});

	test("rejects a target through accept and cleans up previews", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;
		let cancelled = 0;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) =>
				draggable(event, {
					accept: () => false,
					onCancel: () => cancelled++,
				}),
		});

		expect(drop.children).toHaveLength(0);
		expect(window.document.querySelector(".draggable-preview")).toBeNull();
		expect(cancelled).toBe(1);
	});

	test("lets a drop callback replace the default clone commit", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;
		let received;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) =>
				draggable(event, {
					drop: (proposal) => {
						received = proposal;
					},
				}),
		});

		expect(received.source.node).toBe(source);
		expect(received.target.node).toBe(drop);
		expect(drop.children).toHaveLength(0);
	});

	test("sort moves the original item to the resolved insertion index", async () => {
		const window = setup();
		const { sort } = await import("../src/js/select/interaction/draggable.js");
		const list = window.document.createElement("div");
		list.dataset.sortableList = "list";
		list.dataset.axis = "y";
		const first = window.document.createElement("div");
		first.dataset.sortableItem = "first";
		first.getBoundingClientRect = () => rect(0, 0, 100, 20);
		const second = window.document.createElement("div");
		second.dataset.sortableItem = "second";
		second.getBoundingClientRect = () => rect(0, 40, 100, 20);
		list.append(first, second);
		window.document.body.appendChild(list);
		window.document.elementFromPoint = () => list;

		dragFrom(window, first, { x: 5, y: 80, start: (event) => sort(event) });

		expect([...list.children]).toEqual([second, first]);
	});
});

// EOF
