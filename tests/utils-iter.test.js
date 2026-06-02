import { describe, expect, test } from "bun:test"
import { iquery, ivalues } from "../src/js/select/utils/iter.js"

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

		expect(Array.from(iquery(data, "user.profile.name"))).toEqual(["Ada"])
		expect(Array.from(iquery(data, "user.tags*.label"))).toEqual(["alpha", "beta"])
	})

	test("yields collection values and scalars", () => {
		expect(Array.from(ivalues(new Map([["a", 1], ["b", 2]])))).toEqual([1, 2])
		expect(Array.from(ivalues("text"))).toEqual(["text"])
	})
})
