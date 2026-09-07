// Project: Select.js
// Author: Sebastien Pierre
// License: BSD
// Created: 2026-09-07

// Run: node --conditions=browser benchmarks/inspector/check-equivalence.mjs [solidjs|selectui]
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import { createPatchPhases, createSnapshot, settle } from "./common.js";
import { createBenchmarkRunner } from "./runner.js";
import { compareSnapshots } from "./verification.js";

const window = new Window();
for (const name of [
	"document",
	"Node",
	"Element",
	"SVGElement",
	"DocumentFragment",
	"Text",
	"Comment",
	"Document",
	"DOMParser",
	"MutationObserver",
	"NodeFilter",
]) {
	globalThis[name] = window[name];
}
globalThis.window = window;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
assert(
	process.execArgv.includes("--conditions=browser"),
	"Solid requires --conditions=browser",
);

const checkpoint = { label: "initial", structure: "tree", text: "text" };
const valid = { snapshots: [checkpoint] };
assert(compareSnapshots(valid, valid).ok);
for (const candidate of [
	{},
	{ snapshots: [] },
	{ snapshots: [checkpoint, checkpoint] },
	{ snapshots: [{ ...checkpoint, text: "wrong" }] },
	{ snapshots: [{ ...checkpoint, label: "wrong" }] },
]) {
	assert.equal(compareSnapshots(valid, candidate).ok, false);
}
assert.equal(compareSnapshots({}, {}).ok, false);

const base = {
	logs: JSON.parse(
		await readFile(new URL("./perf-inspector.json", import.meta.url), "utf8"),
	),
};
const phases = createPatchPhases(base);
const names = process.argv[2]
	? ["preact", process.argv[2]]
	: ["preact", "solidjs", "selectui"];
assert(names.every((name) => ["preact", "solidjs", "selectui"].includes(name)));
let baseline;
try {
	const originalFetch = globalThis.fetch;
	try {
		globalThis.fetch = async () => ({ json: async () => [] });
		const result = await createBenchmarkRunner({
			framework: "stub",
			root: document.createElement("div"),
			createApp: (...args) => {
				assert.equal(
					args.length,
					2,
					"capture options must stay in the harness",
				);
				return { update() {}, dispose() {} };
			},
		}).run({ captureSnapshots: true });
		assert.equal(result.snapshots.length, 1);
		assert.equal(result.snapshots[0].label, "initial");
	} finally {
		globalThis.fetch = originalFetch;
		globalThis._benchmarkApp = null;
	}
	for (const name of names) {
		const { createApp } = await import(`./frameworks/${name}.js`);
		// Exercise both options independently, observing the DOM outside the adapter.
		for (const captureSnapshots of [false, true]) {
			const root = document.createElement("div");
			document.body.append(root);
			let current = structuredClone(base);
			const app = await createApp(root, current, { captureSnapshots });
			await settle();
			const snapshots = [{ label: "initial", ...createSnapshot(root) }];
			try {
				for (const phase of phases) {
					for (const operation of phase.operations) {
						const next = structuredClone(current);
						operation.apply(next);
						app.update(next);
						await settle();
						current = next;
						snapshots.push({
							label: `${phase.name}:${operation.name}`,
							...createSnapshot(root),
						});
					}
				}
				baseline ||= { snapshots };
				const verification = compareSnapshots(baseline, { snapshots });
				console.log(
					JSON.stringify({
						framework: name,
						captureSnapshots,
						checkpoints: snapshots.length,
						...verification,
					}),
				);
				if (!verification.ok) process.exitCode = 1;
			} finally {
				app.dispose();
				root.remove();
			}
		}
		// Store adapters retain dictionary order; verify values and array positions
		// against an explicit expected tree, without weakening the main comparator.
		{
			const root = document.createElement("div");
			const app = await createApp(root, {
				logs: [
					{ a: 1, b: 2 },
					{ b: 3, a: 4 },
				],
			});
			const { createApp: createReference } = await import(
				"./frameworks/preact.js"
			);
			try {
				for (const [next, retainedOrder] of [
					[
						{
							logs: [
								{ b: 2, a: 1 },
								{ a: 4, b: 3 },
							],
						},
						{
							logs: [
								{ a: 1, b: 2 },
								{ b: 3, a: 4 },
							],
						},
					],
					[
						{
							logs: [
								{ b: 3, a: 4 },
								{ a: 1, b: 2 },
							],
						},
						{
							logs: [
								{ a: 4, b: 3 },
								{ b: 2, a: 1 },
							],
						},
					],
				]) {
					app.update(next);
					await settle();
					const reference = document.createElement("div");
					const expected = await createReference(
						reference,
						name === "preact" ? next : retainedOrder,
					);
					try {
						assert.deepEqual(createSnapshot(root), createSnapshot(reference));
					} finally {
						expected.dispose();
					}
				}
			} finally {
				app.dispose();
			}
			console.log(
				`${name}: dictionary-order policy, values, and array positions verified`,
			);
		}
		if (name === "solidjs") {
			assert.equal(
				(await import("./frameworks/solidjs-browser.js")).createApp,
				createApp,
			);
			const root = document.createElement("div");
			const app = await createApp(root, { value: 1, list: [1, 2] });
			const list = root.firstChild;
			const scalar = list.firstChild.lastChild;
			app.update({ value: 2, list: [2, 1, 3] });
			assert.equal(
				root.firstChild,
				list,
				"content updates must not remount the root",
			);
			assert.equal(
				list.firstChild.lastChild,
				scalar,
				"scalar updates must retain their node",
			);
			assert.equal(scalar.textContent, "2");
			for (const value of [null, [], { added: true }, "scalar", [false]]) {
				app.update(value);
				const reference = document.createElement("div");
				const { createApp: createReference } = await import(
					"./frameworks/preact.js"
				);
				const expected = await createReference(reference, value);
				assert.deepEqual(createSnapshot(root), createSnapshot(reference));
				expected.dispose();
			}
			app.dispose();
			assert.equal(root.childNodes.length, 0);
			console.log("Solid identity, root retyping, and disposal checks passed");
		}
	}
} finally {
	await window.happyDOM.close();
}

// EOF
