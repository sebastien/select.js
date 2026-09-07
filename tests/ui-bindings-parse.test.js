import { describe, expect, test } from "bun:test";
import { cell } from "../src/js/select/state/cells.js";
import { TemplateParser } from "../src/js/select/ui/bindings.js";
import {
	evaluateWhen,
	evaluateWhenComparison,
	resolveDataPath,
} from "../src/js/select/ui/eval.js";

test("binding paths expand only the selected leaf", () => {
	let unrelatedReads = 0;
	const unrelated = {
		get value() {
			unrelatedReads++;
			return "unused";
		},
	};
	const leaf = { label: cell("ready"), list: [cell(1)] };
	const data = {
		unrelated,
		form: cell({ unrelated, result: cell(leaf) }),
	};
	expect(resolveDataPath(data, ["form", "result"])).toEqual({
		label: "ready",
		list: [1],
	});
	expect(resolveDataPath(cell(data), [".", "form", "result", "label"])).toBe(
		"ready",
	);
	expect(resolveDataPath(data, ["form", "missing", "label"])).toBeUndefined();
	expect(resolveDataPath({ form: null }, ["form", "label"])).toBeUndefined();
	const pending = Promise.resolve(leaf);
	pending.label = "not resolved";
	expect(resolveDataPath({ form: pending }, ["form", "label"])).toBeUndefined();
	expect(resolveDataPath(data, ["#"], { key: "row" })).toBe("row");
	expect(resolveDataPath(data, ["#"], { key: "row" }, 0)).toBe(0);
	expect(resolveDataPath(data, [])).toBe(data);
	expect(leaf.label.isReactive).toBe(true);
	expect(unrelatedReads).toBe(0);
});

describe("TemplateParser", () => {
	test("ParsePipedBinding", () => {
		const plain = TemplateParser.ParsePipedBinding("count");
		expect(plain.sourceKey).toBe("count");
		expect(plain.processors).toEqual([]);
		const piped = TemplateParser.ParsePipedBinding("count|upper|trim");
		expect(piped.sourceKey).toBe("count");
		expect(piped.processors.map((p) => p.name)).toEqual(["upper", "trim"]);
		const mapped = TemplateParser.ParsePipedBinding("a:b,c:d|Proc");
		expect(mapped.sourceMap).toEqual([
			{ key: "a", path: ["b"] },
			{ key: "c", path: ["d"] },
		]);
	});

	test("ParseEventEffect", () => {
		expect(TemplateParser.ParseEventEffect("", "click")).toMatchObject({
			mode: "handler",
			handlerName: "click",
		});
		expect(TemplateParser.ParseEventEffect("save")).toMatchObject({
			mode: "handler",
			handlerName: "save",
		});
		expect(TemplateParser.ParseEventEffect("@username")).toMatchObject({
			mode: "assign",
			targetPath: ["username"],
		});
		expect(TemplateParser.ParseEventEffect("!Clicked")).toMatchObject({
			mode: "publish",
			publishEvent: "Clicked",
			binding: null,
		});
		expect(TemplateParser.ParseEventEffect("item.id!Selected")).toMatchObject({
			mode: "publish",
			publishEvent: "Selected",
		});
		expect(TemplateParser.ParseEventEffect("!Selected.-")).toMatchObject({
			stopPropagation: true,
			preventDefault: true,
		});
	});

	test("ParseOutAttributeBinding", () => {
		expect(TemplateParser.ParseOutAttributeBinding("label").mode).toBe(
			"binding",
		);
		const tmpl = TemplateParser.ParseOutAttributeBinding("hi-${name}");
		expect(tmpl.mode).toBe("template");
		expect(tmpl.template.tokens[0]).toEqual({ type: "text", value: "hi-" });
		const cmp = TemplateParser.ParseOutAttributeBinding("status==ready");
		expect(cmp.mode).toBe("comparison");
		expect(cmp.operator).toBe("==");
		expect(cmp.value).toBe("ready");
	});

	test("ParseWhenShorthand", () => {
		expect(TemplateParser.ParseWhenShorthand("slot")).toMatchObject({
			key: "slot",
			mode: TemplateParser.TRUTHY,
		});
		expect(TemplateParser.ParseWhenShorthand("!slot")).toMatchObject({
			key: "slot",
			mode: TemplateParser.FALSY,
		});
		expect(TemplateParser.ParseWhenShorthand("?slot")).toMatchObject({
			key: "slot",
			mode: TemplateParser.DEFINED,
		});
		expect(TemplateParser.ParseWhenShorthand("!?slot")).toMatchObject({
			key: "slot",
			mode: TemplateParser.UNDEFINED,
		});
		const and = TemplateParser.ParseWhenShorthand("!focus&history");
		expect(and.clauses.length).toBe(2);
		const or = TemplateParser.ParseWhenShorthand("a||b");
		expect(or.logical).toBe("or");
		expect(TemplateParser.ParseWhenShorthand("n>=3").operator).toBe(">=");
		expect(evaluateWhen(TemplateParser.FALSY, 0)).toBe(true);
		expect(evaluateWhenComparison("Ab", "~?", "a")).toBe(true);
	});
});
