import { describe, expect, test } from "bun:test"
import { iflatmap, iquery, ivalues } from "../src/js/select/utils/iter.js"

function queried(value, path, scope = new Map()) {
	return Array.from(iquery(value, path, 0, ".", scope)).map(({ value, path, scope }) => ({
		value,
		path,
		scope: Array.from(scope.entries()),
	}))
}

describe("utils.iter", () => {
	test("resolves direct and wildcard query paths", () => {
		const data = {
			user: {
				profile: {
					name: "Ada",
				},
				tags: [
					{ label: "alpha" },
					{ label: "beta" },
				],
			},
		}

		expect(queried(data, "user.profile.name")).toEqual([
			{ value: "Ada", path: ["user", "profile", "name"], scope: [] },
		])
		expect(queried(data, "user.tags*.label")).toEqual([
			{ value: "alpha", path: ["user", "tags", 0, "label"], scope: [] },
			{ value: "beta", path: ["user", "tags", 1, "label"], scope: [] },
		])
	})

	test("binds symbol wildcard segments to matched keys in scope", () => {
		const Type = Symbol.for("Type")
		const data = {
			identified: {
				Person: { label: "Ada" },
				Company: { label: "ACME" },
			},
		}

		expect(queried(data, ["identified", Type, "label"])).toEqual([
			{ value: "Ada", path: ["identified", "Person", "label"], scope: [[Type, "Person"]] },
			{ value: "ACME", path: ["identified", "Company", "label"], scope: [[Type, "Company"]] },
		])
	})

	test("preserves caller scope entries while binding symbol wildcard segments", () => {
		const Type = Symbol.for("Type")
		const scope = new Map([["seed", 1]])
		const data = {
			identified: {
				Person: true,
			},
		}

		expect(queried(data, ["identified", Type], scope)).toEqual([
			{ value: true, path: ["identified", "Person"], scope: [["seed", 1], [Type, "Person"]] },
		])
		expect(Array.from(scope.entries())).toEqual([["seed", 1]])
	})

	test("yields collection values and scalars", () => {
		expect(Array.from(ivalues(new Map([["a", 1], ["b", 2]])))).toEqual([1, 2])
		expect(Array.from(ivalues("text"))).toEqual(["text"])
	})

	test("flatmaps values one level while preserving iterator key semantics", () => {
		expect(Array.from(iflatmap([1, 2], (v, k) => [k, v * 10]))).toEqual([0, 10, 1, 20])
		expect(Array.from(iflatmap(new Map([["a", 1], ["b", 2]]), (v, k) => ({ [k]: v })))).toEqual([1, 2])
		expect(Array.from(iflatmap("text", (v, k) => [k, v]))).toEqual([0, "text"])
	})
})
