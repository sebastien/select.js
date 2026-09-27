import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

let activeWindow;
let restoreClassTokenList;

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

// happy-dom accepts whitespace in classList.add; browsers throw.
// The DOMTokenList prototype is shared across Window instances, so the
// patch is lifted in afterEach.
function rejectWhitespaceClassTokens(window) {
	const tokenList = Object.getPrototypeOf(
		window.document.createElement("div").classList,
	);
	const native = { add: tokenList.add, remove: tokenList.remove };
	for (const method of ["add", "remove"]) {
		const apply = native[method];
		tokenList[method] = function (...tokens) {
			for (const token of tokens) {
				if (/[\t\n\f\r ]/.test(token)) {
					throw new window.DOMException(
						"The token can not contain whitespace.",
						"InvalidCharacterError",
					);
				}
			}
			return apply.apply(this, tokens);
		};
	}
	restoreClassTokenList = () => {
		tokenList.add = native.add;
		tokenList.remove = native.remove;
	};
}

function sortablePair(window) {
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
	return { list, first, second };
}

function press(window, node) {
	let start;
	node.addEventListener("mousedown", (event) => {
		start = event;
	});
	node.dispatchEvent(
		new window.MouseEvent("mousedown", {
			bubbles: true,
			button: 0,
			clientX: 5,
			clientY: 5,
		}),
	);
	return start;
}

// dispatchEvent swallows listener throws, so call the drag handler directly.
function captureMove(window, startSort) {
	let move;
	const listen = window.addEventListener.bind(window);
	window.addEventListener = (type, handler, options) => {
		if (type === "mousemove") move = handler;
		return listen(type, handler, options);
	};
	startSort();
	return (y) =>
		move(
			new window.MouseEvent("mousemove", {
				bubbles: true,
				clientX: 5,
				clientY: y,
			}),
		);
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
	restoreClassTokenList?.();
	restoreClassTokenList = undefined;
	activeWindow?.close();
	activeWindow = undefined;
});

describe("interaction draggable", () => {
	test("resolves named targets through nested elements", async () => {
		const window = setup();
		const { dragtarget } = await import(
			"../src/js/select/features/interaction/drag.js"
		);
		const { draggabletarget, droptarget, sorttarget } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const dragNode = window.document.createElement("div");
		dragNode.dataset.drag = "drag";
		const draggableNode = window.document.createElement("div");
		draggableNode.dataset.draggable = "source";
		const dropNode = window.document.createElement("div");
		dropNode.dataset.dropTarget = "target";
		const sortNode = window.document.createElement("div");
		sortNode.dataset.sortableItem = "item";
		const child = window.document.createElement("span");
		sortNode.append(child);
		dropNode.append(sortNode);
		draggableNode.append(dropNode);
		dragNode.append(draggableNode);

		expect(dragtarget(child, "drag")).toBe(dragNode);
		expect(draggabletarget(child, "source")).toBe(draggableNode);
		expect(droptarget(child, "target")).toBe(dropNode);
		expect(sorttarget(child, "item")).toBe(sortNode);
		expect(droptarget(child, "missing")).toBeUndefined();
	});

	test("appends a source clone to an accepted target by default", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
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
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.textContent = "Original";
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
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.textContent = "Original";
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

	test("replaces the drop target with a committed target preview", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.textContent = "Original";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) => draggable(event, { target: { action: "replace" } }),
		});

		expect(source.parentNode).toBe(window.document.body);
		expect(drop.parentNode).toBeNull();
		expect(window.document.body.lastElementChild).not.toBe(source);
		expect(window.document.body.lastElementChild.textContent).toBe("Original");
	});

	test("copies the target slot when replacing it", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.textContent = "Original";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		drop.setAttribute("slot", "content");
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) => draggable(event, { target: { action: "replace" } }),
		});

		expect(source.getAttribute("slot")).toBeNull();
		expect(window.document.body.lastElementChild.getAttribute("slot")).toBe(
			"content",
		);
	});

	test("replaces a stable custom drop preview", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.textContent = "Original";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) =>
				draggable(event, {
					target: {
						action: "replace",
						preview: () => {
							const node = window.document.createElement("div");
							node.textContent = "Preview";
							return node;
						},
					},
				}),
		});

		expect(window.document.body.textContent).toBe("OriginalPreview");
		expect(drop.parentNode).toBeNull();
		expect(source.parentNode).toBe(window.document.body);
	});

	test("toggles hover and drop classes on the target", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;
		let hovered = false;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) =>
				draggable(event, {
					onMove: () => {
						hovered = drop.classList.contains("is-drag-hover");
					},
				}),
		});

		expect(hovered).toBe(true);
		expect(drop.classList.contains("is-drag-hover")).toBe(false);
		expect(drop.classList.contains("is-drag-drop")).toBe(true);
	});

	test("splits whitespace-separated class options into tokens", async () => {
		const window = setup();
		rejectWhitespaceClassTokens(window);
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;
		let effect;
		let preview;
		let dragging = false;
		let start;
		source.addEventListener("mousedown", (event) => {
			start = event;
		});
		source.dispatchEvent(
			new window.MouseEvent("mousedown", {
				bubbles: true,
				button: 0,
				clientX: 5,
				clientY: 5,
			}),
		);
		draggable(start, {
			sourceClass: "dim dragging",
			previewClass: "z-9 floating",
			effectPreviewClass: "noev z-3 ol ol-dashed oli-2",
			hoverClass: "is-over hot",
			dropClass: "dropped done",
			onMove: (state) => {
				effect = state.effectPreview;
				preview = state.preview;
				dragging =
					source.classList.contains("dim") &&
					source.classList.contains("dragging") &&
					drop.classList.contains("is-over") &&
					drop.classList.contains("hot");
			},
		});
		window.dispatchEvent(
			new window.MouseEvent("mousemove", {
				bubbles: true,
				clientX: 20,
				clientY: 20,
			}),
		);
		window.dispatchEvent(
			new window.MouseEvent("mouseup", {
				bubbles: true,
				clientX: 20,
				clientY: 20,
			}),
		);

		expect(dragging).toBe(true);
		expect(preview.classList.contains("z-9")).toBe(true);
		expect(preview.classList.contains("floating")).toBe(true);
		expect(source.classList.contains("dim")).toBe(false);
		expect(source.classList.contains("dragging")).toBe(false);
		expect(drop.classList.contains("is-over")).toBe(false);
		expect(drop.classList.contains("hot")).toBe(false);
		expect(drop.classList.contains("dropped")).toBe(true);
		expect(drop.classList.contains("done")).toBe(true);
		expect(effect.classList.contains("noev")).toBe(true);
		expect(effect.classList.contains("z-3")).toBe(true);
		expect(effect.classList.contains("ol")).toBe(true);
		expect(effect.classList.contains("ol-dashed")).toBe(true);
		expect(effect.classList.contains("oli-2")).toBe(true);
	});

	test("supports source actions and restores remove-drag on cancellation", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => undefined;
		let previewed = 0;
		let unpreviewed = 0;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) =>
				draggable(event, {
					source: {
						action: "remove-drag",
						preview: () => {
							previewed += 1;
							return window.document.createElement("div");
						},
						unpreview: () => {
							unpreviewed += 1;
						},
					},
				}),
		});

		expect(previewed).toBe(1);
		expect(unpreviewed).toBe(1);
		expect(source.parentNode).toBe(window.document.body);
		expect(source.nextSibling).toBe(drop);

		window.document.elementFromPoint = () => drop;
		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) => draggable(event, { source: { action: "remove-drop" } }),
		});
		expect(source.parentNode).toBeNull();
	});

	test("supports move as an alias for remove-drag and rejects unknown actions", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) => draggable(event, { source: { action: "move" } }),
		});

		expect(source.parentNode).toBeNull();
		expect(drop.children).toHaveLength(1);
		expect(() => draggable.options({ source: { action: "archive" } })).toThrow(
			/Available actions: copy, move, remove-drag, remove-drop/,
		);
		expect(() => draggable.options({ target: { action: "insert" } })).toThrow(
			/Available actions: append, prepend, replace/,
		);
	});

	test("matches sources and targets from selector arrays", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.className = "stash";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.className = "placeholder";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) =>
				draggable(event, {
					source: { match: [".placeholder", ".stash"] },
					target: { match: [".stash", ".placeholder"] },
				}),
		});

		expect(drop.children).toHaveLength(1);
	});

	test("replaces target content and restores it when cancelled", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.textContent = "Original";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		drop.textContent = "Existing content";
		window.document.body.append(source, drop);
		const hit = drop;
		window.document.elementFromPoint = () => hit;
		let cancel;
		source.addEventListener("mousedown", (event) => {
			cancel = draggable(event, { target: { action: "content" } });
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
				clientX: 20,
				clientY: 20,
			}),
		);
		expect(drop.textContent).toBe("Original");
		window.document.elementFromPoint = () => undefined;
		window.dispatchEvent(
			new window.MouseEvent("mousemove", {
				bubbles: true,
				clientX: 40,
				clientY: 40,
			}),
		);
		window.dispatchEvent(
			new window.MouseEvent("mouseup", {
				bubbles: true,
				clientX: 40,
				clientY: 40,
			}),
		);
		expect(drop.textContent).toBe("Existing content");
		cancel?.();
	});

	test("accepts an explicit source node without a draggable attribute", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;

		dragFrom(window, window.document.body, {
			x: 20,
			y: 20,
			start: (event) =>
				draggable(event, {
					source: { node: source, action: "move" },
				}),
		});

		expect(source.parentNode).toBeNull();
		expect(drop.children).toHaveLength(1);
	});

	test("passes and retains the current source and target preview nodes", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		window.document.elementFromPoint = () => drop;
		const sourcePreview = window.document.createElement("i");
		const targetPreview = window.document.createElement("b");
		let sourceNode;
		let targetNode;
		let movedState;

		dragFrom(window, source, {
			x: 20,
			y: 20,
			start: (event) =>
				draggable(event, {
					source: {
						preview: (currentEvent, state, node) => {
							sourceNode = node;
							return sourcePreview;
						},
					},
					target: {
						preview: (currentEvent, state, node) => {
							targetNode = node;
							return targetPreview;
						},
					},
					onMove: (state) => {
						movedState = state;
					},
				}),
		});

		expect(sourceNode).toBeUndefined();
		expect(targetNode).toBeUndefined();
		expect(movedState.preview).toBe(sourcePreview);
		expect(movedState.targetPreview).toBe(targetPreview);
		expect(sourcePreview.parentNode).toBeNull();
		expect(targetPreview.parentNode).toBe(drop);
	});

	test("keeps the target stable when the pointer moves over its preview", async () => {
		const window = setup();
		const { draggable } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const source = window.document.createElement("div");
		source.dataset.draggable = "card";
		source.getBoundingClientRect = () => rect(0, 0, 80, 30);
		const drop = window.document.createElement("div");
		drop.dataset.dropTarget = "cards";
		window.document.body.append(source, drop);
		let hit = drop;
		window.document.elementFromPoint = () => hit;
		let previews = 0;
		let unpreviews = 0;
		let cancel;
		source.addEventListener("mousedown", (event) => {
			cancel = draggable(event, {
				target: {
					preview: () => {
						previews += 1;
						return window.document.createElement("i");
					},
					unpreview: () => {
						unpreviews += 1;
					},
				},
			});
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
				clientX: 20,
				clientY: 20,
			}),
		);
		const preview = drop.firstElementChild;
		hit = preview;
		window.dispatchEvent(
			new window.MouseEvent("mousemove", {
				bubbles: true,
				clientX: 21,
				clientY: 21,
			}),
		);
		window.dispatchEvent(
			new window.MouseEvent("mouseup", {
				bubbles: true,
				clientX: 21,
				clientY: 21,
			}),
		);

		expect(previews).toBe(1);
		expect(unpreviews).toBe(0);
		expect(preview.parentNode).toBe(drop);
		cancel?.();
	});

	test("sort moves the original item to the resolved insertion index", async () => {
		const window = setup();
		const { sort } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
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

	test("sort splits a whitespace-separated placeholderClass", async () => {
		const window = setup();
		rejectWhitespaceClassTokens(window);
		const { sort } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const { list, first } = sortablePair(window);
		const move = captureMove(window, () =>
			sort(press(window, first), {
				placeholderClass: "dim ol ol-dashed oli-2 sh-0",
			}),
		);

		move(40);
		const placeholder = [...list.children].find(
			(node) => !node.hasAttribute("data-sortable-item"),
		);
		for (const token of ["dim", "ol", "ol-dashed", "oli-2", "sh-0"]) {
			expect(placeholder.classList.contains(token)).toBe(true);
		}
		expect(() => move(80)).not.toThrow();
	});

	// A throw during setup must leave the gesture usable: the next move
	// retries setup instead of calling measure with a half-built session.
	test("sort recovers when placeholder setup throws", async () => {
		const window = setup();
		const { sort } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const { list, first } = sortablePair(window);
		const proto = window.HTMLElement.prototype;
		const nativeClone = proto.cloneNode;
		let failed = false;
		proto.cloneNode = function (...args) {
			if (!failed) {
				failed = true;
				throw new window.DOMException("clone failed", "InvalidStateError");
			}
			return nativeClone.apply(this, args);
		};
		try {
			const move = captureMove(window, () => sort(press(window, first)));
			try {
				move(40);
			} catch {
				// setup may throw; the gesture must still recover
			}
			expect(() => move(80)).not.toThrow();
			expect(
				[...list.children].some(
					(node) => !node.hasAttribute("data-sortable-item"),
				),
			).toBe(true);
		} finally {
			proto.cloneNode = nativeClone;
		}
	});

	// A failed setup must not leave the source marked when the user cancels
	// instead of moving again.
	test("sort clears source state when setup fails and the gesture is cancelled", async () => {
		const window = setup();
		const { sort } = await import(
			"../src/js/select/features/interaction/draggable.js"
		);
		const { list, first } = sortablePair(window);
		const proto = window.HTMLElement.prototype;
		const nativeClone = proto.cloneNode;
		proto.cloneNode = () => {
			throw new window.DOMException("clone failed", "InvalidStateError");
		};
		try {
			const move = captureMove(window, () => sort(press(window, first)));
			try {
				move(40);
			} catch {
				// setup throws; cleanup must still run
			}
			window.dispatchEvent(
				new window.MouseEvent("mouseup", {
					bubbles: true,
					clientX: 40,
					clientY: 40,
				}),
			);

			expect(first.classList.contains("is-dragging-source")).toBe(false);
			expect(first.classList.contains("is-dragging-source-hidden")).toBe(false);
			expect(
				[...list.children].some(
					(node) => !node.hasAttribute("data-sortable-item"),
				),
			).toBe(false);
		} finally {
			proto.cloneNode = nativeClone;
		}
	});

	test("measure tolerates a missing placeholder", async () => {
		const window = setup();
		const { sortable } = await import(
			"../src/js/select/features/interaction/sortable.js"
		);
		const list = window.document.createElement("div");
		const source = window.document.createElement("div");
		source.dataset.sortableItem = "source";
		source.getBoundingClientRect = () => rect(0, 0, 100, 20);
		const other = window.document.createElement("div");
		other.dataset.sortableItem = "other";
		other.getBoundingClientRect = () => rect(0, 30, 100, 20);
		list.append(source, other);

		const measured = sortable.measure(list, {
			sourceNode: source,
			options: { item: "[data-sortable-item]" },
		});

		expect(measured.map((item) => item.node)).toEqual([other]);
	});
});

// EOF
