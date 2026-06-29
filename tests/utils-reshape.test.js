import { describe, expect, test } from "bun:test"
import reshapeUtils, {
	expandslots,
	imatchslots,
	mapslots,
	reshape,
	reshaper,
	slot,
	slots,
} from "../src/js/select/utils/reshape.js"

describe("utils.reshape", () => {
	test("creates stable slot symbols from string and symbol keys", () => {
		const registry = slots()
		const custom = Symbol("custom")

		expect(registry.alpha).toBe(Symbol.for("alpha"))
		expect(registry.alpha).toBe(registry.alpha)
		expect(registry[custom]).toBe(custom)
	})

	test("matches templates and captures both keys and values", () => {
		const template = {
			[slot.row]: {
				key: slot.row,
				id: slot.id,
			},
		}
		const data = {
			alpha: { key: "alpha", id: 1 },
			beta: { key: "beta", id: 2 },
		}

		const atoms = Array.from(imatchslots(template, data))
		const keyMatches = atoms.filter((atom) => atom.template === slot.row && atom.key !== undefined)
		const valueMatches = atoms.filter((atom) => atom.template === slot.row && atom.key === undefined)
		const idMatches = atoms.filter((atom) => atom.template === slot.id)

		expect(keyMatches.map((atom) => atom.key)).toEqual(["alpha", "beta"])
		expect(valueMatches.map((atom) => atom.value)).toEqual(["alpha", "beta"])
		expect(valueMatches.map((atom) => atom.scope[slot.row])).toEqual(["alpha", "beta"])
		expect(idMatches.map((atom) => atom.value)).toEqual([1, 2])
		expect(idMatches.map((atom) => atom.scope[slot.row])).toEqual(["alpha", "beta"])
		expect(Array.from(imatchslots({ a: 1 }, { a: 2 }))).toEqual([
			{
				type: "mismatch",
				path: ["a"],
				template: 1,
				value: 2,
				scope: {},
			},
		])
	})

	test("maps and expands slot placeholders across nested structures", () => {
		const template = {
			label: slot.label,
			items: [slot.item, { nested: slot.label }],
		}

		expect(mapslots(template).get(slot.label)).toEqual([
			["label"],
			["items", 1, "nested"],
		])
		expect(mapslots(template).get(slot.item)).toEqual([["items", 0]])
		expect(
			expandslots(template, {
				[slot.label]: "Alpha",
				[slot.item]: "First",
			}),
		).toEqual({
			label: "Alpha",
			items: ["First", { nested: "Alpha" }],
		})
	})

	test("reshapes data through reshaper and reshape", () => {
		const input = {
			[slot.row]: {
				key: slot.row,
				id: slot.id,
			},
		}
		const output = {
			row: {
				key: slot.row,
				id: slot.id,
			},
		}
		const data = {
			alpha: { key: "alpha", id: 1 },
		}

		const reshapr = reshaper(input, output)
		expect(reshapr(data)).toBe(output)
		expect(output).toEqual({
			row: {
				key: "alpha",
				id: 1,
			},
		})
		expect(reshape(input, { row: { key: slot.row, id: slot.id } }, data)).toEqual({
			row: {
				key: "alpha",
				id: 1,
			},
		})
	})

	test("default export mirrors the named helpers", () => {
		expect(reshapeUtils.slot).toBe(slot)
		expect(reshapeUtils.match).toBe(imatchslots)
		expect(reshapeUtils.map).toBe(mapslots)
		expect(reshapeUtils.expand).toBe(expandslots)
		expect(reshapeUtils.reshaper).toBe(reshaper)
		expect(reshapeUtils.reshape).toBe(reshape)
	})
})
