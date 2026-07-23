import { describe, expect, test } from "bun:test";
import shapeUtils, {
	expandslots,
	imatchslots,
	ivalidate,
	mapslots,
	reshape,
	reshaper,
	slot,
	slots,
	validate,
} from "../src/js/select/utils/shape.js";

describe("utils.shape", () => {
	test("creates stable slot symbols from string and symbol keys", () => {
		const registry = slots();
		const custom = Symbol("custom");

		expect(registry.alpha).toBe(Symbol.for("alpha"));
		expect(registry.alpha).toBe(registry.alpha);
		expect(registry[custom]).toBe(custom);
	});

	test("matches templates and captures both keys and values", () => {
		const template = {
			[slot.row]: {
				key: slot.row,
				id: slot.id,
			},
		};
		const data = {
			alpha: { key: "alpha", id: 1 },
			beta: { key: "beta", id: 2 },
		};

		const atoms = Array.from(imatchslots(template, data));
		const keyMatches = atoms.filter(
			(atom) => atom.template === slot.row && atom.key !== undefined,
		);
		const valueMatches = atoms.filter(
			(atom) => atom.template === slot.row && atom.key === undefined,
		);
		const idMatches = atoms.filter((atom) => atom.template === slot.id);

		expect(keyMatches.map((atom) => atom.key)).toEqual(["alpha", "beta"]);
		expect(valueMatches.map((atom) => atom.value)).toEqual(["alpha", "beta"]);
		expect(valueMatches.map((atom) => atom.scope[slot.row])).toEqual([
			"alpha",
			"beta",
		]);
		expect(idMatches.map((atom) => atom.value)).toEqual([1, 2]);
		expect(idMatches.map((atom) => atom.scope[slot.row])).toEqual([
			"alpha",
			"beta",
		]);
		expect(Array.from(imatchslots({ a: 1 }, { a: 2 }))).toEqual([
			{
				type: "mismatch",
				path: ["a"],
				template: 1,
				value: 2,
				scope: {},
			},
		]);
	});

	test("maps and expands slot placeholders across nested structures", () => {
		const template = {
			label: slot.label,
			items: [slot.item, { nested: slot.label }],
		};

		expect(mapslots(template).get(slot.label)).toEqual([
			["label"],
			["items", 1, "nested"],
		]);
		expect(mapslots(template).get(slot.item)).toEqual([["items", 0]]);
		expect(
			expandslots(template, {
				[slot.label]: "Alpha",
				[slot.item]: "First",
			}),
		).toEqual({
			label: "Alpha",
			items: ["First", { nested: "Alpha" }],
		});
	});

	test("reshapes data through reshaper and reshape", () => {
		const input = {
			[slot.row]: {
				key: slot.row,
				id: slot.id,
			},
		};
		const output = {
			row: {
				key: slot.row,
				id: slot.id,
			},
		};
		const data = {
			alpha: { key: "alpha", id: 1 },
		};

		const reshapr = reshaper(input, output);
		expect(reshapr(data)).toBe(output);
		expect(output).toEqual({
			row: {
				key: "alpha",
				id: 1,
			},
		});
		expect(
			reshape(input, { row: { key: slot.row, id: slot.id } }, data),
		).toEqual({
			row: {
				key: "alpha",
				id: 1,
			},
		});
	});

	test("validates types, literals, unions, optionals, and arrays", () => {
		const MessageShape = {
			origin: new Set(["user", "system", "assistant"]),
			created: Date,
			content: String,
			"meta?": Object,
		};

		expect(
			validate(
				{
					origin: "user",
					created: new Date("2026-01-01"),
					content: "hello",
				},
				MessageShape,
			),
		).toBe(true);
		expect(
			validate(
				{
					origin: "user",
					created: new Date("2026-01-01"),
					content: "hello",
					meta: { ok: true },
				},
				MessageShape,
			),
		).toBe(true);
		expect(
			validate(
				{
					origin: "other",
					created: new Date("2026-01-01"),
					content: "hello",
				},
				MessageShape,
			),
		).toBe(false);
		expect(
			validate(
				{
					origin: "user",
					created: "2026-01-01",
					content: "hello",
				},
				MessageShape,
			),
		).toBe(false);
		expect(validate(undefined, undefined)).toBe(true);
		expect(validate("x", slot.any)).toBe(true);
		expect(validate(["a", "b"], [String])).toBe(true);
		expect(validate(["a", 1], [String])).toBe(false);
		expect(validate(["a", 1], [String, Number])).toBe(true);
		expect(validate(["a"], [String, Number])).toBe(false);
		expect(validate([], [])).toBe(true);
		expect(validate([1], [])).toBe(false);
		expect(validate({ a: 1 }, { a: Number, "b?": String })).toBe(true);
		expect(validate({ a: 1, b: 2 }, { a: Number, "b?": String })).toBe(false);
		expect(validate(new Set([1, 2]), Set)).toBe(true);
	});

	test("strict mode rejects unexpected object keys", () => {
		const shape = { name: String, "age?": Number };
		expect(validate({ name: "Ada", extra: true }, shape)).toBe(true);
		expect(validate({ name: "Ada", extra: true }, shape, true)).toBe(false);
		expect(validate({ name: "Ada", age: 36 }, shape, true)).toBe(true);

		const errors = Array.from(
			ivalidate({ name: "Ada", extra: true }, shape, true),
		);
		expect(errors).toEqual([
			{
				error: "unexpected",
				path: ["extra"],
				expected: undefined,
				value: true,
			},
		]);
	});

	test("ivalidate yields missing and mismatch atoms", () => {
		expect(Array.from(ivalidate({ a: 1 }, { a: String, b: Number }))).toEqual([
			{
				error: "mismatch",
				path: ["a"],
				expected: String,
				value: 1,
			},
			{
				error: "missing",
				path: ["b"],
				expected: Number,
				value: undefined,
			},
		]);
		expect(validate({ a: "ok", b: 2 }, { a: String, b: Number })).toBe(true);
	});

	test("default export mirrors the named helpers", () => {
		expect(shapeUtils.slot).toBe(slot);
		expect(shapeUtils.match).toBe(imatchslots);
		expect(shapeUtils.map).toBe(mapslots);
		expect(shapeUtils.expand).toBe(expandslots);
		expect(shapeUtils.reshaper).toBe(reshaper);
		expect(shapeUtils.reshape).toBe(reshape);
		expect(shapeUtils.validate).toBe(validate);
		expect(shapeUtils.ivalidate).toBe(ivalidate);
	});
});
