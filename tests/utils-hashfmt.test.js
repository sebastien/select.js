// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-15

import { describe, expect, test } from "bun:test"
import {
	parseHashValue,
	parseHash,
	parseHashText,
	formatHashValue,
	formatHash,
	nextSeparator,
	parseAtom,
	formatAtom,
	decodeComponent,
	normalizeHashValue,
	isArrayLikeRecord,
	looksLikeHashText,
	parseQuery,
	formatQuery,
} from "../src/js/select/utils/hashfmt.js"

describe("decodeComponent", () => {
	test("passes through clean strings", () => {
		expect(decodeComponent("hello")).toBe("hello")
	})

	test("decodes URI components", () => {
		expect(decodeComponent("%20")).toBe(" ")
	})

	test("handles nullish", () => {
		expect(decodeComponent(undefined)).toBe(undefined)
		expect(decodeComponent(null)).toBe(null)
	})
})

describe("formatAtom", () => {
	test("formats scalars", () => {
		expect(formatAtom(undefined)).toBe("undefined")
		expect(formatAtom(null)).toBe("_")
		expect(formatAtom(true)).toBe("T")
		expect(formatAtom(false)).toBe("F")
		expect(formatAtom(42)).toBe("42")
		expect(formatAtom(-3.14)).toBe("-3.14")
		expect(formatAtom(Number.NaN)).toBe("")
	})

	test("quotes strings with special chars", () => {
		expect(formatAtom("hello")).toBe("hello")
		expect(formatAtom("a=b")).toBe('"a=b"')
		expect(formatAtom("a,b")).toBe('"a,b"')
		expect(formatAtom("a(b)")).toBe('"a(b)"')
		expect(formatAtom("a&b")).toBe('"a&b"')
	})

	test("escapes double quotes in strings", () => {
		expect(formatAtom('say "hi"')).toBe('"say \\"hi\\""')
	})
})

describe("parseAtom", () => {
	test("parses null sentinels", () => {
		expect(parseAtom("_")).toBe(null)
		expect(parseAtom("null")).toBe(null)
	})

	test("parses undefined", () => {
		expect(parseAtom("undefined")).toBe(undefined)
	})

	test("parses booleans", () => {
		expect(parseAtom("T")).toBe(true)
		expect(parseAtom("true")).toBe(true)
		expect(parseAtom("F")).toBe(false)
		expect(parseAtom("false")).toBe(false)
	})

	test("parses numbers", () => {
		expect(parseAtom("42")).toBe(42)
		expect(parseAtom("-3")).toBe(-3)
		expect(parseAtom("3.14")).toBe(3.14)
		expect(parseAtom("1_000")).toBe(1000)
	})

	test("passes through strings", () => {
		expect(parseAtom("hello")).toBe("hello")
		expect(parseAtom("")).toBe("")
	})

	test("decodes URI components", () => {
		expect(parseAtom("%20")).toBe(" ")
	})
})

describe("nextSeparator", () => {
	test("finds double-quote separator", () => {
		expect(nextSeparator('key="val"', 4)).toEqual([4, '"'])
	})

	test("finds single-quote separator", () => {
		expect(nextSeparator("key='val'", 4)).toEqual([4, "'"])
	})

	test("finds comma", () => {
		expect(nextSeparator("a,b", 0)).toEqual([1, ","])
	})

	test("finds equals", () => {
		expect(nextSeparator("a=b", 0)).toEqual([1, "="])
	})

	test("returns null for no separator", () => {
		expect(nextSeparator("hello", 0)).toEqual([null, null])
	})
})

describe("parseHashValue — default value entry point", () => {
	test("parses scalar number", () => {
		expect(parseHashValue("0")).toBe(0)
		expect(parseHashValue("42")).toBe(42)
		expect(parseHashValue("-1")).toBe(-1)
	})

	test("parses scalar string from double quotes", () => {
		expect(parseHashValue('"hello"')).toBe("hello")
		expect(parseHashValue('"Sebastien"')).toBe("Sebastien")
	})

	test("parses scalar string from single quotes", () => {
		expect(parseHashValue("'hello'")).toBe("hello")
		expect(parseHashValue("'Sebastien'")).toBe("Sebastien")
	})

	test("parses empty array", () => {
		expect(parseHashValue("()")).toEqual([])
	})

	test("parses array with values", () => {
		expect(parseHashValue("1,2,3")).toEqual([1, 2, 3])
		expect(parseHashValue("a,b,c")).toEqual(["a", "b", "c"])
	})

	test("parses object key=value", () => {
		expect(parseHashValue("debug=T")).toEqual({ debug: true })
		expect(parseHashValue("debug=T,verbose=F")).toEqual({ debug: true, verbose: false })
		expect(parseHashValue("name=hello")).toEqual({ name: "hello" })
	})

	test("parses boolean sentinels", () => {
		expect(parseHashValue("T")).toBe(true)
		expect(parseHashValue("F")).toBe(false)
	})

	test("parses null sentinel", () => {
		expect(parseHashValue("_")).toBe(null)
	})

	test("handles empty string as empty array", () => {
		expect(parseHashValue("")).toEqual([])
	})

	test("single quote inside double quote is literal", () => {
		expect(parseHashValue(`"it's"`)).toBe("it's")
	})

	test("double quote inside single quote is literal", () => {
		expect(parseHashValue(`'"'`)).toBe('"')
	})

	test("parses nested parenthesized object", () => {
		expect(parseHashValue("admin=(role=T,perms=(read,write))")).toEqual({
			admin: { role: true, perms: ["read", "write"] },
		})
	})
})

describe("parseHashText — raw parser", () => {
	test("parses simple scalar via {0: value} wrapping", () => {
		expect(parseHashText("hello")).toEqual({ 0: "hello" })
		expect(parseHashText("42")).toEqual({ 0: 42 })
	})

	test("parses key=value", () => {
		expect(parseHashText("a=1")).toEqual({ a: 1 })
		expect(parseHashText("a=1,b=2")).toEqual({ a: 1, b: 2 })
	})

	test("parses array from commas", () => {
		expect(parseHashText("1,2,3")).toEqual([1, 2, 3])
	})

	test("parses quoted string as single-element {0: value}", () => {
		expect(parseHashText('"hello"')).toEqual({ 0: "hello" })
		expect(parseHashText("'world'")).toEqual({ 0: "world" })
	})
})

describe("parseHash — full hash entry point", () => {
	test("strips leading #", () => {
		expect(parseHash("#a=1")).toEqual({ a: 1 })
	})

	test("path detection for bare token", () => {
		expect(parseHash("new")).toEqual({ path: "new", new: true })
	})

	test("path detection skips for key=value", () => {
		expect(parseHash("#new=10")).toEqual({ new: 10 })
	})

	test("parenthesized input becomes array/object", () => {
		expect(parseHash("#(a,b)")).toEqual(["a", "b"])
		expect(parseHash("#(x=1,y=2)")).toEqual({ x: 1, y: 2 })
	})
})

describe("parseQuery", () => {
	test("strips leading ?", () => {
		expect(parseQuery("?a=1")).toEqual({ a: 1 })
	})

	test("strips leading #", () => {
		expect(parseQuery("#a=1")).toEqual({ a: 1 })
	})

	test("strips hash fragment", () => {
		expect(parseQuery("?a=1#b=2")).toEqual({ a: 1 })
	})
})

describe("formatHashValue", () => {
	test("formats simple values", () => {
		expect(formatHashValue(0)).toBe("0")
		expect(formatHashValue("hello")).toBe("hello")
	})

	test("formats array", () => {
		expect(formatHashValue([1, 2, 3])).toBe("1,2,3")
	})

	test("formats object", () => {
		expect(formatHashValue({ a: 1, b: 2 })).toBe("a=1,b=2")
	})

	test("quotes strings with special chars", () => {
		expect(formatHashValue({ eq: "a=b" })).toBe('eq="a=b"')
	})
})

describe("formatHash", () => {
	test("normalizes array-like records", () => {
		expect(formatHash({ 0: "a", 1: "b" })).toBe("a,b")
	})
})

describe("formatQuery", () => {
	test("formats with normalization", () => {
		expect(formatQuery({ a: 1 })).toBe("a=1")
	})
})

describe("normalizeHashValue", () => {
	test("converts array-like records to arrays", () => {
		expect(normalizeHashValue({ 0: "a", 1: "b" })).toEqual(["a", "b"])
	})

	test("leaves regular objects alone", () => {
		expect(normalizeHashValue({ a: 1 })).toEqual({ a: 1 })
	})

	test("recurses into nested structures", () => {
		const input = { data: { 0: "x", 1: "y" } }
		expect(normalizeHashValue(input)).toEqual({ data: ["x", "y"] })
	})
})

describe("isArrayLikeRecord", () => {
	test("detects sequential integer keys", () => {
		expect(isArrayLikeRecord({ 0: "a", 1: "b" })).toBe(true)
		expect(isArrayLikeRecord({ 0: "a" })).toBe(true)
	})

	test("rejects non-sequential or string keys", () => {
		expect(isArrayLikeRecord({ a: 1 })).toBe(false)
		expect(isArrayLikeRecord({ 0: "a", 2: "b" })).toBe(false)
		expect(isArrayLikeRecord([])).toBe(false)
		expect(isArrayLikeRecord({})).toBe(false)
	})
})

describe("looksLikeHashText", () => {
	test("detects parenthesized expressions", () => {
		expect(looksLikeHashText("(a,b)")).toBe(true)
		expect(looksLikeHashText("hello")).toBe(false)
		expect(looksLikeHashText("(a")).toBe(false)
	})
})

// EOF
