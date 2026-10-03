import { expect, test } from "bun:test";
import { batch, cell, derived } from "../src/js/select/state/cells.js";

test("settles diamonds before publishing, both directly and in batches", () => {
	const a = cell(1);
	const b = derived(a, (v) => v * 2);
	const c = derived(a, (v) => v * 3);
	const total = derived([b, c], ([x, y]) => x + y);
	const seen = [];
	total.sub((v) => seen.push(v));
	a.set(2);
	batch(() => { a.set(3); a.set(4); });
	expect(seen).toEqual([10, 20]);
});

test("source effects see settled consumers regardless of subscription order", () => {
	const a = cell(1);
	const seen = [];
	let total;
	a.sub(() => seen.push(total.value));
	total = derived(a, (v) => v * 2);
	a.set(2);
	expect(seen).toEqual([4]);
});

test("derived selections update and unchanged scalar outputs stay quiet", () => {
	const a = cell(1);
	const vector = derived(a, (v) => [v, 10]);
	const first = vector.select(0);
	const second = vector.select(1);
	const seen = [];
	first.sub((v) => seen.push(v));
	second.sub(() => { throw new Error("Unchanged period published"); });
	a.set(2);
	expect(first.value).toBe(2);
	expect(seen).toEqual([2]);
	const constant = derived(a, () => 10);
	constant.sub(() => { throw new Error("Unchanged computation published"); });
	a.set(3);
	first.release(); second.release();
});

test("settles consumers of both a source and a selected derived output", () => {
	const a = cell(1);
	const vector = derived(a, (v) => [v * 2]);
	const selected = vector.select(0);
	const total = derived([a, selected], ([x, y]) => x + y);
	const seen = [];
	total.sub((v) => seen.push(v));
	a.set(2);
	expect(seen).toEqual([6]);
	total.dispose(); selected.release();
});

test("subscriber writes drain a new wave and disposed computations stop", () => {
	const a = cell(1);
	const b = derived(a, (v) => v * 2);
	const seen = [];
	b.sub((v) => { seen.push(v); if (v === 4) a.set(3); });
	a.set(2);
	expect(seen).toEqual([4, 6]);
	batch(() => { a.set(4); b.dispose(); });
	expect(b.value).toBe(6);
});
