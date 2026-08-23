import { describe, expect, test } from "bun:test";
import { TemplateParser } from "../src/js/select/ui/bindings.js";
import {
	evaluateWhen,
	evaluateWhenComparison,
} from "../src/js/select/ui/eval.js";

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
