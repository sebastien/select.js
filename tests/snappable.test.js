import { describe, expect, test } from "bun:test";

import { Snappable } from "../src/js/select/features/interaction/snappable.js";

describe("snappable", () => {
	test("constrains an attached component within bounds", () => {
		const space = new Snappable();
		space.add("one", { x: 100, y: 20, width: 80, height: 60 }, { sticky: { right: "pair" } });
		space.add("two", { x: 180, y: 20, width: 80, height: 60 }, { sticky: { left: "pair" } });
		space.attach("two", "left", "one");

		expect(space.constrain("one", { x: 0, y: 0, width: 200, height: 100 })).toEqual([
			expect.objectContaining({ id: "one", x: 40, y: 20 }),
			expect.objectContaining({ id: "two", x: 120, y: 20 }),
		]);
	});

	test("snaps matching opposite sticky borders and commits their adhesion", () => {
		const space = new Snappable({ tolerance: 8, minOverlap: 20 });
		space.add(
			"inspector",
			{ x: 0, y: 0, width: 100, height: 120 },
			{ sticky: { right: "palette" } },
		);
		space.add(
			"layers",
			{ x: 200, y: 0, width: 80, height: 120 },
			{ sticky: { left: "palette" } },
		);

		const drag = space.begin("inspector");
		const proposal = drag.move(95, 0);

		expect(proposal.boxes[0]).toMatchObject({ id: "inspector", x: 100, y: 0 });
		expect(proposal.guides).toContainEqual(
			expect.objectContaining({
				axis: "x",
				coordinate: 200,
				kind: "adhesion",
				source: { id: "inspector", side: "right" },
				target: { id: "layers", side: "left" },
			}),
		);
		drag.end();

		expect(space.component("inspector").sort()).toEqual([
			"inspector",
			"layers",
		]);
	});

	test("does not adhere sticky borders with different tags", () => {
		const space = new Snappable({ tolerance: 8 });
		space.add(
			"one",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { right: "palette" } },
		);
		space.add(
			"two",
			{ x: 200, y: 0, width: 100, height: 100 },
			{ sticky: { left: "toolbar" } },
		);

		const proposal = space.begin("one").move(95, 0);

		expect(proposal.adhesion).toEqual([]);
		expect(proposal.guides.some((_) => _.kind === "adhesion")).toBe(false);
	});

	test("moves an owner's attached descendants together", () => {
		const space = new Snappable();
		space.add(
			"one",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { right: "palette" } },
		);
		space.add(
			"two",
			{ x: 100, y: 0, width: 100, height: 100 },
			{ sticky: { left: "palette" } },
		);
		space.attach("two", "left", "one");

		const drag = space.begin("one");
		const proposal = drag.move(30, 12);
		drag.end();

		expect(proposal.boxes).toEqual([
			expect.objectContaining({ id: "one", x: 30, y: 12 }),
			expect.objectContaining({ id: "two", x: 130, y: 12 }),
		]);
		expect(space.get("one")).toMatchObject({ x: 30, y: 12 });
		expect(space.get("two")).toMatchObject({ x: 130, y: 12 });
	});

	test("moves every child attached to the same parent side", () => {
		const space = new Snappable();
		space.add(
			"parent",
			{ x: 100, y: 0, width: 100, height: 100 },
			{ sticky: { left: "panel" } },
		);
		space.add(
			"first",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { right: "panel" } },
		);
		space.add(
			"second",
			{ x: 0, y: 120, width: 100, height: 100 },
			{ sticky: { right: "panel" } },
		);
		space.attach("first", "right", "parent");
		space.attach("first", "right", "parent");
		space.attach("second", "right", "parent");

		const drag = space.begin("parent");
		expect(drag.move(20, 10).boxes).toEqual([
			expect.objectContaining({ id: "parent", x: 120, y: 10 }),
			expect.objectContaining({ id: "first", x: 20, y: 10 }),
			expect.objectContaining({ id: "second", x: 20, y: 130 }),
		]);
		drag.end();
	});

	test("keeps attachment ownership transitive", () => {
		const space = new Snappable();
		space.add(
			"a",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { right: "panel" } },
		);
		space.add(
			"b",
			{ x: 100, y: 0, width: 100, height: 100 },
			{ sticky: { left: "panel", right: "panel" } },
		);
		space.add(
			"c",
			{ x: 200, y: 0, width: 100, height: 100 },
			{ sticky: { left: "panel" } },
		);
		space.attach("a", "right", "b");
		space.attach("b", "right", "c");
		expect(space.attachments()).toEqual([
			{ id: "a", side: "right", targetId: "b", targetSide: "left" },
			{ id: "b", side: "right", targetId: "c", targetSide: "left" },
		]);
		const restored = new Snappable();
		restored.add(
			"a",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { right: "panel" } },
		);
		restored.add(
			"b",
			{ x: 100, y: 0, width: 100, height: 100 },
			{ sticky: { left: "panel", right: "panel" } },
		);
		restored.add(
			"c",
			{ x: 200, y: 0, width: 100, height: 100 },
			{ sticky: { left: "panel" } },
		);
		for (const attachment of space.attachments()) {
			restored.attach(
				attachment.id,
				attachment.side,
				attachment.targetId,
				attachment.targetSide,
			);
		}
		expect(restored.begin("c").move(30, 12).boxes).toHaveLength(3);

		const group = space.begin("c");
		expect(group.move(30, 12).boxes).toEqual([
			expect.objectContaining({ id: "c", x: 230, y: 12 }),
			expect.objectContaining({ id: "b", x: 130, y: 12 }),
			expect.objectContaining({ id: "a", x: 30, y: 12 }),
		]);
		group.end();

		const pull = space.begin("b");
		expect(pull.move(20, 0).boxes).toEqual([
			expect.objectContaining({ id: "b", x: 150 }),
			expect.objectContaining({ id: "a", x: 50 }),
		]);
		pull.end();
		expect(space.component("c")).toEqual(["c"]);
		expect(space.component("b").sort()).toEqual(["a", "b"]);
	});

	test("replaces a stale held snap with a closer target", () => {
		const space = new Snappable({ tolerance: 8, hysteresis: 4 });
		space.add(
			"source",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { right: "panel" } },
		);
		space.add(
			"near",
			{ x: 100, y: 0, width: 100, height: 100 },
			{ sticky: { left: "panel" } },
		);
		space.add(
			"closer",
			{ x: 110, y: 0, width: 100, height: 100 },
			{ sticky: { left: "panel" } },
		);

		const drag = space.begin("source");
		expect(drag.move(0, 0).boxes[0]).toMatchObject({ x: 0 });
		expect(drag.move(11, 0).boxes[0]).toMatchObject({ x: 10 });
		drag.cancel();
	});

	test("removing a rectangle clears links on its former neighbours", () => {
		const space = new Snappable();
		space.add(
			"one",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { right: "palette" } },
		);
		space.add(
			"two",
			{ x: 100, y: 0, width: 100, height: 100 },
			{ sticky: { left: "palette" } },
		);
		space.attach("one", "right", "two");

		expect(space.remove("two")).toBe(true);
		expect(space.component("one")).toEqual(["one"]);
		expect(space.get("two")).toBeUndefined();
	});

	test("pull detaches a selected sticky border after its detach tolerance", () => {
		const space = new Snappable({ tolerance: 8, detachTolerance: 14 });
		space.add(
			"one",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { right: "palette" } },
		);
		space.add(
			"two",
			{ x: 100, y: 0, width: 100, height: 100 },
			{ sticky: { left: "palette" } },
		);
		space.attach("one", "right", "two");

		const drag = space.pull("one", "right");
		expect(drag.move(-10, 0).boxes[0]).toMatchObject({ x: 0, y: 0 });
		expect(drag.move(-20, 0).boxes[0]).toMatchObject({ x: -20, y: 0 });
		drag.end();

		expect(space.component("one")).toEqual(["one"]);
		expect(space.component("two")).toEqual(["two"]);
	});

	test("moves an owned subtree and detaches it from its parent", () => {
		const space = new Snappable({ tolerance: 8, detachTolerance: 14 });
		space.add(
			"leader",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { bottom: "palette" } },
		);
		space.add(
			"middle",
			{ x: 0, y: 100, width: 100, height: 100 },
			{ sticky: { top: "palette", bottom: "palette" } },
		);
		space.add(
			"child",
			{ x: 0, y: 200, width: 100, height: 100 },
			{ sticky: { top: "palette" } },
		);
		space.attach("middle", "top", "leader");
		space.attach("child", "top", "middle");

		const group = space.begin("leader");
		expect(group.move(20, 0).boxes).toHaveLength(3);
		group.cancel();

		const pull = space.begin("middle");
		expect(pull.move(10, 0).boxes).toEqual([
			expect.objectContaining({ id: "middle", x: 10 }),
			expect.objectContaining({ id: "child", x: 10 }),
		]);
		expect(pull.move(20, 0).boxes).toEqual([
			expect.objectContaining({ id: "middle", x: 20 }),
			expect.objectContaining({ id: "child", x: 20 }),
		]);
		pull.end();

		expect(space.component("leader")).toEqual(["leader"]);
		expect(space.component("middle").sort()).toEqual(["child", "middle"]);
	});

	test("uses an explicit leader ahead of geometric order", () => {
		const space = new Snappable();
		space.add(
			"top",
			{ x: 0, y: 0, width: 100, height: 100 },
			{ sticky: { bottom: "palette" } },
		);
		space.add(
			"selected",
			{ x: 0, y: 100, width: 100, height: 100 },
			{ sticky: { top: "palette" }, leader: true },
		);
		space.attach("selected", "top", "top");

		const drag = space.begin("selected");
		expect(drag.move(20, 0).boxes).toHaveLength(2);
		drag.cancel();
	});
});

// EOF
